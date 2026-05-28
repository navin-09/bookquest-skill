/**
 * BookQuest Enforcer Extension
 *
 * Enforces the hard structural rules of BookQuest programmatically so
 * the LLM can't drift from them. Works alongside the BookQuest skill
 * (skills/bookquest/SKILL.md) which handles the behavioral/teaching side.
 *
 * v2 — Added Gamification Engine:
 *   ✅ Answer Streak Combos (1.5x / 2x / 3x multipliers)
 *   ✅ Variable Rewards (Critical Hits, Mystery Boxes)
 *   ✅ Streak Shields (loss aversion)
 *   ✅ Level-Up Splash notifications
 *   ✅ Daily Challenges (FOMO)
 *   ✅ Infinite Prestige Levels (no ceiling)
 *
 * What this extension enforces:
 *   ✅ Auto-save progress after every turn
 *   ✅ Validate level calculations via level-calc.js
 *   ✅ Inject current skill tree into system prompt every turn
 *   ✅ Track activation state across the session
 *   ✅ Remind the LLM of hard rules every turn to prevent drift
 *   ✅ render_diagram — custom tool for perfectly-aligned Unicode diagrams
 *   ✅ Visual-first teaching rule injected into system prompt
 *   ✅ Book diagram references (prefer book figures over generated diagrams)
 *   ✅ Gamification state injected every turn
 *
 * Install via pi package:
 *   pi install git:github.com/navin-09/bookquest-skill
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ── Helpers for path resolution ──
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = join(__dirname, "..");

// ── Paths ──
const PROGRESS_DIR_DEFAULT = join(homedir(), ".pi", "book-progress");
const REGISTRY_PATH = join(PROGRESS_DIR_DEFAULT, "registry.json");
const LEVEL_CALC_SCRIPT = join(PACKAGE_ROOT, "scripts", "level-calc.js");

// ── Gamification Constants ──

const COMBO_THRESHOLDS = [
  { count: 0, label: "1x", multiplier: 1 },
  { count: 3, label: "1.5x", multiplier: 1.5 },
  { count: 5, label: "2x", multiplier: 2 },
  { count: 10, label: "3x", multiplier: 3 },
];

// WARNING: These must maintain LEGENDARY_CHANCE < RARE_CHANCE < CRIT_CHANCE
// The cumulative threshold cascade in agent_end depends on this ordering.
const CRIT_CHANCE = 0.20;        // 20% — "💥 Critical Hit"
const RARE_CHANCE = 0.05;        // 5%  — "🌟 Rare Insight"
const LEGENDARY_CHANCE = 0.01;   // 1%  — "🎆 Legendary Insight"

const MYSTERY_BOX_CHANCE = 0.15; // 15%
const MYSTERY_BOX_MIN_XP = 5;
const MYSTERY_BOX_MAX_XP = 25;

const DAILY_CHALLENGE_POOL = [
  { type: "explain-persona", promptTemplate: "Explain {concept} to a 10-year-old. No jargon.", bonusXp: 15 },
  { type: "concept-connection", promptTemplate: "Connect {concept} to something you learned in a previous chapter.", bonusXp: 15 },
  { type: "real-world", promptTemplate: "Find a real-world system that uses {concept}.", bonusXp: 15 },
  { type: "analogy-invent", promptTemplate: "Invent a NEW analogy for {concept} from everyday life.", bonusXp: 20 },
  { type: "teach-back-mini", promptTemplate: "Teach {concept} to a non-tech friend in 2 sentences.", bonusXp: 15 },
];

// ── Hard rules reminder injected every turn ──
const HARD_RULES_REMINDER = `
[BOOKQUEST HARD RULES — enforced by extension]
• Save progress after EVERY interaction — extension auto-saves on agent_end
• Level calculations MUST use \`node scripts/level-calc.js <xp>\` — extension validates
• NEVER summarize content — not in independent mode, not in tutor mode
• In independent mode: give reading missions (page range + questions), NOT summaries
• In tutor mode: teach ONE chunk at a time with a check between each — NEVER present a concept roadmap/outline
• ALWAYS run end-of-chapter quiz + challenge before unlocking next chapter
• ALWAYS present the skill tree at session start
`.trim();

// ── Helpers ──

function getProgressDir(): string {
  // First check per-project
  const cwd = process.cwd();
  const projectDir = join(cwd, ".bookquest");
  if (existsSync(projectDir)) return projectDir;
  return PROGRESS_DIR_DEFAULT;
}

function getRegistry(): any {
  const progressDir = getProgressDir();
  const regPath = progressDir === PROGRESS_DIR_DEFAULT
    ? REGISTRY_PATH
    : join(progressDir, "registry.json");
  if (!existsSync(regPath)) return null;
  try { return JSON.parse(readFileSync(regPath, "utf-8")); }
  catch { return null; }
}

function saveRegistry(registry: any): void {
  const progressDir = getProgressDir();
  const regPath = progressDir === PROGRESS_DIR_DEFAULT
    ? REGISTRY_PATH
    : join(progressDir, "registry.json");
  const dir = dirname(regPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(regPath, JSON.stringify(registry, null, 2));
}

function getActiveBooks(): { slug: string; title: string; source: string }[] {
  const reg = getRegistry();
  if (!reg) return [];
  return (reg.books || []).filter((b: any) => b.slug);
}

function getProgressDirForBook(slug: string): string {
  if (!isValidSlug(slug)) return PROGRESS_DIR_DEFAULT;
  const projectDir = join(process.cwd(), ".bookquest", `${slug}.json`);
  if (existsSync(projectDir)) return join(process.cwd(), ".bookquest");
  return PROGRESS_DIR_DEFAULT;
}

function loadProgress(slug: string): any | null {
  if (!isValidSlug(slug)) return null;
  const baseDir = getProgressDirForBook(slug);
  const path = join(baseDir, `${slug}.json`);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf-8")); }
  catch { return null; }
}

function saveProgress(slug: string, data: any): void {
  if (!isValidSlug(slug)) return;
  const baseDir = getProgressDirForBook(slug);
  if (!existsSync(baseDir)) {
    mkdirSync(baseDir, { recursive: true });
  }
  writeFileSync(join(baseDir, `${slug}.json`), JSON.stringify(data, null, 2));
}

async function computeLevel(pi: ExtensionAPI, xp: number): Promise<any> {
  try {
    const { stdout } = await pi.exec("node", [LEVEL_CALC_SCRIPT, String(xp)]);
    return JSON.parse(stdout.trim());
  } catch {
    // Fallback: manual calculation (including infinite mastery for XP >= 3000)
    const FALLBACK_LEVELS = [
      { level: 1, xp: 0, title: "📖 Page Turner" },
      { level: 2, xp: 100, title: "📚 Chapter Runner" },
      { level: 3, xp: 300, title: "🧠 Concept Cracker" },
      { level: 4, xp: 600, title: "🔗 Connection Master" },
      { level: 5, xp: 1000, title: "⚔️ Boss Slayer" },
      { level: 6, xp: 1500, title: "🏆 Knowledge Knight" },
      { level: 7, xp: 2200, title: "🧙 Tech Sage" },
      { level: 8, xp: 3000, title: "👑 Grandmaster Reader" },
    ];
    const BASE = 3000;

    // Compute mastery XP threshold for a given level n (n >= 9)
    const getMasteryThreshold = (n: number): number => {
      return Math.round(BASE * Math.pow(1.4, n - 8) / 50) * 50;
    };

    if (xp < BASE) {
      // Level 1-8: use static table
      let current = FALLBACK_LEVELS[0];
      for (const l of FALLBACK_LEVELS) {
        if (xp >= l.xp) current = l;
        else break;
      }
      return {
        xp,
        level: current.level,
        title: current.title,
        mastery: 0,
        xpIntoLevel: xp - current.xp,
        xpForNextLevel: (FALLBACK_LEVELS.find(l => l.level === current.level + 1)?.xp || 0) - xp,
        isMaxed: false,
      };
    }

    // Mastery levels (Level 9+)
    let level = 8;
    let threshold = BASE;
    while (xp >= threshold) {
      level++;
      threshold = getMasteryThreshold(level + 1);
    }
    const mastery = level - 8;
    const prevThreshold = getMasteryThreshold(level);
    const nextThreshold = getMasteryThreshold(level + 1);
    return {
      xp,
      level,
      title: "👑 Grandmaster Reader",
      mastery,
      xpIntoLevel: xp - prevThreshold,
      xpForNextLevel: nextThreshold - xp,
      isMaxed: false,
    };
  }
}

function renderSkillTree(tree: any[]): string {
  if (!tree || !tree.length) return "  (no skill tree available)";
  return tree
    .map((node: any) => {
      const icon =
        node.isBossFight
          ? "⚔️"
          : node.status === "complete"
          ? "✅"
          : node.status === "in_progress"
          ? "🔄"
          : node.status === "unlocked"
          ? "🔓"
          : "🔒";
      return `  ${icon} ${node.name}`;
    })
    .join("\n");
}

function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(slug);
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function seededRandom(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const chr = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return (Math.abs(hash) % 1000) / 1000;
}

// ── Combo Logic ──

function getComboMultiplier(count: number): { label: string; multiplier: number } {
  let result = COMBO_THRESHOLDS[0];
  for (const t of COMBO_THRESHOLDS) {
    if (count >= t.count) result = t;
    else break;
  }
  return { label: result.label, multiplier: result.multiplier };
}

// ── Daily Challenge ──

function pickDailyChallenge(registry: any): { type: string; prompt: string; bonusXp: number } | null {
  if (!registry || !registry.books || registry.books.length === 0) return null;
  const today = todayStr();
  const seed = `bookquest-daily-${today}`;
  const idx = Math.floor(seededRandom(seed) * DAILY_CHALLENGE_POOL.length);
  const template = DAILY_CHALLENGE_POOL[idx];

  // Pick a random concept from any book's knowledge graph
  const allConcepts: string[] = [];
  for (const book of registry.books) {
    const progress = loadProgress(book.slug);
    if (progress?.knowledgeGraph) {
      for (const entry of progress.knowledgeGraph) {
        allConcepts.push(entry.concept);
      }
    }
  }
  const concept = allConcepts.length > 0
    ? allConcepts[Math.floor(seededRandom(seed + "-concept") * allConcepts.length)]
    : "the chapter concept";

  return {
    type: template.type,
    prompt: template.promptTemplate.replace("{concept}", concept),
    bonusXp: template.bonusXp,
  };
}

// ── Generate level-up splash ──

function renderLevelUpSplash(level: number, title: string, mastery: number): string {
  const maxW = Math.max(level.toString().length + title.length + 3, 20);
  const top = "╔" + "═".repeat(maxW + 2) + "╗";
  const mid1 = "║" + " ".repeat(Math.floor((maxW - 9) / 2)) + "🎉 LEVEL UP!" + " ".repeat(Math.ceil((maxW - 9) / 2)) + "║";
  const mid2 = "║" + " ".repeat(Math.floor((maxW - title.length - 2) / 2)) + `Lv.${level} ${title}` + " ".repeat(Math.ceil((maxW - title.length - 2) / 2)) + "║";
  const bot = "╚" + "═".repeat(maxW + 2) + "╝";
  return `${top}\n${mid1}\n${mid2}\n${bot}`;
}

// ── State ──
interface BookQuestState {
  active: boolean;
  currentBookSlug: string | null;
  currentBookTitle: string | null;
  currentChapterMode: "independent" | "tutor" | null;
}

// ── Gamification Engine (per-session state) ──

interface GamificationEngine {
  comboCount: number;               // consecutive correct answers
  lastComboLabel: string;           // current combo label for display
  lastComboMultiplier: number;      // current multiplier (1, 1.5, 2, 3)
  pendingCritLabel: string | null;  // null | "💥 Critical Hit" | "🌟 Rare Insight" | "🎆 Legendary Insight"
  pendingCritMultiplier: number;    // 1, 2, 3, 5
  pendingMysteryBox: boolean;
  pendingMysteryBoxReward: number;
  lastLevel: number;                // previous level (to detect level-up)
  lastMastery: number;              // previous mastery count
  hasNewLevelUp: boolean;
  newLevel: number;
  newLevelTitle: string;
  newMastery: number;
  lastXp: number;                   // XP baseline captured before LLM turn (for delta detection)
}

function freshGamificationEngine(): GamificationEngine {
  return {
    comboCount: 0,
    lastComboLabel: "1x",
    lastComboMultiplier: 1,
    pendingCritLabel: null,
    pendingCritMultiplier: 1,
    pendingMysteryBox: false,
    pendingMysteryBoxReward: 0,
    lastLevel: 1,
    lastMastery: 0,
    hasNewLevelUp: false,
    newLevel: 1,
    newLevelTitle: "📖 Page Turner",
    newMastery: 0,
    lastXp: 0,
  };
}

// ── Diagram renderer ──

function renderDiagram(params: any): { content: { type: string; text: string }[] } {
  if (!params || typeof params !== "object") {
    return { content: [{ type: "text", text: "[diagram error: invalid parameters]" }] };
  }
  const H = "─";
  const V = "│";
  const TL = "┌";
  const TR = "┐";
  const BL = "└";
  const BR = "┘";
  const TM = "┬";
  const BM = "┴";
  const LM = "├";
  const RM = "┤";
  const CROSS = "┼";
  const ARROW_R = " ──► ";

  const MAX_WIDTH = (process.stdout.columns || 80) - 2;

  function pad(s: string, w: number): string {
    const str = String(s ?? "");
    if (str.length <= w) return str + " ".repeat(Math.max(0, w - str.length));
    return str;
  }

  function capWidths(widths: number[], maxAvailable: number): number[] {
    const total = widths.reduce((a, b) => a + b, 0);
    if (total <= maxAvailable) return widths;
    const ratio = maxAvailable / total;
    return widths.map((w) => Math.max(10, Math.floor(w * ratio)));
  }

  function boxRow(cells: string[], widths: number[]): string {
    return V + " " + cells.map((c, i) => pad(c, widths[i])).join(" " + V + " ") + " " + V;
  }

  function wrapText(text: string, maxWidth: number): string[] {
    if (text.length <= maxWidth) return [text];
    const words = text.split(" ");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      if ((current + " " + word).trim().length <= maxWidth) {
        current = (current + " " + word).trim();
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines.length > 0 ? lines : [text];
  }

  function boxRowMulti(cells: string[], widths: number[]): string[] {
    const wrapped = cells.map((c, i) => wrapText(c, widths[i]));
    const maxLines = Math.max(...wrapped.map((w) => w.length));
    const lines: string[] = [];
    for (let line = 0; line < maxLines; line++) {
      const rowCells = wrapped.map((w) => (line < w.length ? w[line] : ""));
      lines.push(boxRow(rowCells, widths));
    }
    return lines;
  }

  const type = params.type;
  const title = params.title || "";
  const subtitle = params.subtitle;

  if (type === "comparison") {
    const rows: { aspect: string; left: string; right: string }[] = params.rows || [];
    const leftLabel = params.left_label || "";
    const rightLabel = params.right_label || "";
    if (rows.length === 0) {
      return { content: [{ type: "text", text: `[comparison: ${title} — no rows]` }] };
    }

    let aspectW = Math.max(
      "Aspect".length,
      ...rows.map((r) => r.aspect.length),
      title.length > 40 ? 40 : title.length
    );
    let leftW = Math.max(leftLabel.length, ...rows.map((r) => r.left.length));
    let rightW = Math.max(rightLabel.length, ...rows.map((r) => r.right.length));
    const capped = capWidths([aspectW, leftW, rightW], MAX_WIDTH - 10);
    aspectW = capped[0]; leftW = capped[1]; rightW = capped[2];
    const lines: string[] = [];
    const titleBarWidth = aspectW + leftW + rightW + 8;
    lines.push(TL + H.repeat(titleBarWidth) + TR);
    lines.push(V + " " + pad(title, titleBarWidth - 2) + " " + V);
    if (subtitle) {
      lines.push(V + " " + pad("(" + subtitle + ")", titleBarWidth - 2) + " " + V);
    }
    lines.push(LM + H.repeat(aspectW + 2) + TM + H.repeat(leftW + 2) + TM + H.repeat(rightW + 2) + RM);
    const hdrW = [aspectW, leftW, rightW];
    lines.push(boxRow(["Aspect", leftLabel, rightLabel], hdrW));
    lines.push(LM + H.repeat(aspectW + 2) + CROSS + H.repeat(leftW + 2) + CROSS + H.repeat(rightW + 2) + RM);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const multiLines = boxRowMulti([r.aspect, r.left, r.right], hdrW);
      for (const ml of multiLines) {
        lines.push(ml);
      }
      if (i < rows.length - 1) {
        lines.push(LM + H.repeat(aspectW + 2) + CROSS + H.repeat(leftW + 2) + CROSS + H.repeat(rightW + 2) + RM);
      }
    }
    lines.push(BL + H.repeat(aspectW + 2) + BM + H.repeat(leftW + 2) + BM + H.repeat(rightW + 2) + BR);
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }

  if (type === "flow") {
    const steps: { label: string; description?: string }[] = params.steps || [];
    if (steps.length < 2) {
      return { content: [{ type: "text", text: `[flow: ${title} — need at least 2 steps]` }] };
    }

    const maxLabel = Math.max(...steps.map((s) => s.label.length));
    const maxDesc = Math.max(...steps.map((s) => (s.description || "").length));
    const idealBoxW = Math.max(maxLabel, maxDesc) + 2;
    const arrowLen = ARROW_R.length;
    const maxBoxW = Math.floor((MAX_WIDTH - (steps.length - 1) * arrowLen) / steps.length) - 2;
    const MIN_BOXW = 12;
    const maxStepsFit = (idealBoxW > maxBoxW || maxBoxW < MIN_BOXW)
      ? Math.min(steps.length, Math.max(2, Math.floor((MAX_WIDTH - arrowLen) / (MIN_BOXW + 2 + arrowLen))))
      : steps.length;
    const cappedSteps = steps.slice(0, maxStepsFit);
    const boxW = Math.max(MIN_BOXW, Math.min(idealBoxW, maxBoxW >= MIN_BOXW ? maxBoxW : Math.floor((MAX_WIDTH - (cappedSteps.length - 1) * arrowLen) / cappedSteps.length) - 2));
    const arrowStr = ARROW_R;

    const lines: string[] = [];
    lines.push(title);
    if (subtitle) lines.push("(" + subtitle + ")");
    lines.push("");

    const renderSteps = cappedSteps || steps;
    let topRow = "";
    let midRow = "";
    let botRow = "";
    for (let i = 0; i < renderSteps.length; i++) {
      const s = renderSteps[i];
      topRow += TL + H.repeat(boxW) + TR;
      midRow += V + " " + pad(s.label, boxW - 2) + " " + V;
      botRow += BL + H.repeat(boxW) + BR;
      if (i < renderSteps.length - 1) {
        topRow += arrowStr;
        midRow += " " + "─".repeat(arrowStr.length - 3) + "► ";
        botRow += arrowStr;
      }
    }
    lines.push(topRow);
    lines.push(midRow);

    if (renderSteps.some((s: any) => s.description)) {
      const descLines = renderSteps.map((s: any) => wrapText(s.description || "", boxW - 2));
      const maxDescLines = Math.max(...descLines.map((dl: string[]) => dl.length));
      for (let line = 0; line < maxDescLines; line++) {
        let descRow = "";
        for (let i = 0; i < renderSteps.length; i++) {
          const text = line < descLines[i].length ? descLines[i][line] : "";
          descRow += V + " " + pad(text, boxW - 2) + " " + V;
          if (i < renderSteps.length - 1) {
            descRow += " " + pad("", arrowStr.length - 2) + " ";
          }
        }
        lines.push(descRow);
      }
      let descBotRow = "";
      for (let i = 0; i < renderSteps.length; i++) {
        descBotRow += BL + H.repeat(boxW) + BR;
        if (i < renderSteps.length - 1) {
          descBotRow += arrowStr;
        }
      }
      lines.push(descBotRow);
    } else {
      lines.push(botRow);
    }
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }

  if (type === "hierarchy") {
    const root = params.root || "";
    const children: { label: string; sub_items?: string[] }[] = params.children || [];

    const lines: string[] = [];
    lines.push(title);
    if (subtitle) lines.push("(" + subtitle + ")");
    lines.push("");

    const rootW = Math.max(root.length + 2, 6);
    lines.push("            " + TL + H.repeat(rootW) + TR);
    lines.push("            " + V + " " + pad(root, rootW - 2) + " " + V);

    if (children.length > 0) {
      const indent = Math.max(2, Math.floor(rootW / 2));
      lines.push(" ".repeat(indent) + BL + H.repeat(rootW) + BR);
      lines.push("");
      lines.push(" ".repeat(indent + Math.floor(rootW / 2) - 1) + V);

      for (const child of children) {
        const cW = Math.max(child.label.length + 2, (child.sub_items ? Math.max(...child.sub_items.map(s => s.length)) + 2 : 4));
        const bar = TL + H.repeat(cW) + TR;
        const mid = V + " " + pad(child.label, cW - 2) + " " + V;
        const bot = BL + H.repeat(cW) + BR;
        lines.push(" ".repeat(indent) + bar);
        lines.push(" ".repeat(indent) + mid);
        lines.push(" ".repeat(indent) + bot);

        if (child.sub_items && child.sub_items.length > 0) {
          const siW = Math.max(...child.sub_items.map(s => s.length)) + 2;
          for (const si of child.sub_items) {
            lines.push("    " + LM + H.repeat(siW) + RM);
            lines.push("    " + V + " " + pad(si, siW - 2) + " " + V);
            lines.push("    " + BL + H.repeat(siW) + BR);
          }
          lines.push("");
        }
      }
    }
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }

  return { content: [{ type: "text", text: `[unknown diagram type: ${type}]` }] };
}

// ── Extension ──

export default function (pi: ExtensionAPI) {
  const state: BookQuestState = {
    active: false,
    currentBookSlug: null,
    currentBookTitle: null,
    currentChapterMode: null,
  };

  const game: GamificationEngine = freshGamificationEngine();

  // ═══════════════════════════════════════════
  //  1. /bookquest COMMAND — Activation/Deactivation
  // ═══════════════════════════════════════════

  pi.registerCommand("bookquest", {
    description: "Toggle BookQuest mode or manage books",
    usage: "[/bookquest | /bookquest add | /bookquest switch <book>]",
    handler: async (args, ctx) => {
      const trimmed = (args || "").trim().toLowerCase();

      if (trimmed === "add") {
        state.active = true;
        if (ctx.hasUI) ctx.ui.notify("📚 BookQuest — Let's add a new book!", "info");
        await pi.sendUserMessage(
          "/bookquest add — User wants to add a new book. Run Phase 1 Reconnaissance."
        );
        return;
      }

      if (trimmed.startsWith("switch ")) {
        const target = trimmed.slice(7).trim();
        const books = getActiveBooks();
        const found = books.find(
          (b) => b.slug === target || b.title.toLowerCase().includes(target.toLowerCase())
        );
        if (!found) {
          if (ctx.hasUI) {
            ctx.ui.notify(
              `📚 Book not found. Active books: ${books.map((b) => b.title).join(", ")}`,
              "error"
            );
          }
          return;
        }
        state.active = true;
        state.currentBookSlug = found.slug;
        state.currentBookTitle = found.title;
        // Reset gamification for fresh session
        Object.assign(game, freshGamificationEngine());
        stateSaveCounter = 0;
        if (ctx.hasUI) ctx.ui.notify(`📚 Switched to: ${found.title}`, "info");
        await pi.sendUserMessage(
          `/bookquest switched to "${found.title}" (${found.slug}). Load progress and continue.`
        );
        return;
      }

      if (trimmed === "books") {
        const books = getActiveBooks();
        if (books.length === 0) {
          if (ctx.hasUI) ctx.ui.notify("📚 No books tracked yet. Use /bookquest add to start.", "info");
          return;
        }
        const lines = books.map((b) => {
          const progress = loadProgress(b.slug);
          const ch = progress?.progress?.currentChapter || "?";
          const total = progress?.book?.totalChapters || "?";
          const xp = progress?.gamification?.xp || 0;
          return `  ${b.title} — Ch.${ch}/${total} | ${xp} XP`;
        });
        if (ctx.hasUI) ctx.ui.notify(`📚 Active Books:\n${lines.join("\n")}`, "info");
        return;
      }

      if (state.active) {
        state.active = false;
        state.currentBookSlug = null;
        state.currentBookTitle = null;
        state.currentChapterMode = null;
        await pi.sendUserMessage(
          "/bookquest deactivated — Show session summary, save all progress, update registry."
        );
      } else {
        state.active = true;
        Object.assign(game, freshGamificationEngine());
        stateSaveCounter = 0;
        const books = getActiveBooks();

        if (books.length === 0) {
          if (ctx.hasUI) ctx.ui.notify("📚 BookQuest activated! Let's start a new book.", "info");
          await pi.sendUserMessage(
            "/bookquest activated — No books found. Run Phase 1 Reconnaissance: ask for book source."
          );
        } else if (books.length === 1) {
          const book = books[0];
          state.currentBookSlug = book.slug;
          state.currentBookTitle = book.title;
          // Load current level into game engine
          const progress = loadProgress(book.slug);
          game.lastLevel = progress?.gamification?.level || 1;
          if (ctx.hasUI) ctx.ui.notify(`📚 BookQuest activated! Continuing: ${book.title}`, "info");
          await pi.sendUserMessage(
            `/bookquest activated — Continuing "${book.title}" (${book.slug}). Show dashboard, load progress.`
          );
        } else {
          const summary = books
            .map((b, i) => {
              const p = loadProgress(b.slug);
              const ch = p?.progress?.currentChapter || 1;
              const total = p?.book?.totalChapters || "?";
              const xp = p?.gamification?.xp || 0;
              return `${i + 1}. ${b.title} — Ch.${ch}/${total} | ${xp} XP`;
            })
            .join("\n");

          if (ctx.hasUI) ctx.ui.notify(`📚 BookQuest Dashboard\n${summary}`, "info");
          await pi.sendUserMessage(
            `/bookquest activated with ${books.length} books. Show dashboard and let user pick which book to continue.`
          );
        }
      }
    },
  });

  // ════════════════════════════════════════════════════════════
  //  2. INJECT SKILL TREE + RULES REMINDER + GAMIFICATION STATE
  // ════════════════════════════════════════════════════════════

  pi.on("before_agent_start", async (event, ctx) => {
    if (!state.active) return;

    let updated = event.systemPrompt;

    // Hard rules
    updated += `\n\n## BookQuest Enforcement (auto-injected)\n${HARD_RULES_REMINDER}\n`;

    if (state.currentBookSlug) {
      const progress = loadProgress(state.currentBookSlug);
      // Capture baseline XP for delta detection in agent_end
      game.lastXp = progress?.gamification?.xp || 0;
      if (progress?.progress?.skillTree) {
        const tree = renderSkillTree(progress.progress.skillTree);
        updated += `\n\n## Current Skill Tree: ${state.currentBookTitle}\n${tree}\n`;
      }

      const currCh = progress?.progress?.currentChapter || 1;
      const chapterEntry = progress?.progress?.completedChapters?.find(
        (c: any) => c.chapter === currCh
      );
      const mode = chapterEntry?.mode || progress?.book?.defaultMode || "independent";
      state.currentChapterMode = mode;
      updated += `\nCurrent chapter: ${currCh} (${mode} mode)\n`;

      // ════════════════════════════════════════════════
      //  GAMIFICATION STATE INJECTION
      // ════════════════════════════════════════════════

      const combo = getComboMultiplier(game.comboCount);

      // Build combo visual
      let comboVisual = `${combo.label} multiplier`;
      if (game.comboCount >= 3) {
        const flames = game.comboCount >= 10 ? "🔥🔥🔥" : game.comboCount >= 5 ? "🔥🔥" : "🔥";
        comboVisual = `${combo.label} · ${combo.multiplier}x · ${flames}`;
      }

      let gamificationBlock = `\n## Active Gamification Bonuses (extension-managed)\n`;
      gamificationBlock += `• Answer Streak: ${game.comboCount} correct → ${comboVisual}\n`;

      if (game.pendingCritLabel) {
        gamificationBlock += `• 💥 ${game.pendingCritLabel} loaded — next correct answer gets ${game.pendingCritMultiplier}x XP on top of combo!\n`;
      }
      if (game.pendingMysteryBox) {
        gamificationBlock += `• 🎁 Mystery Box available — next correct answer unlocks bonus +${game.pendingMysteryBoxReward} XP!\n`;
      }

      // Streak shields (from registry)
      const registry = getRegistry();
      if (registry?.globalStats?.streakShields > 0) {
        const shields = registry.globalStats.streakShields;
        const shieldIcons = "🛡️".repeat(Math.min(shields, 5)) + (shields > 5 ? ` +${shields - 5}` : "");
        gamificationBlock += `• Streak Shields: ${shieldIcons} (${shields} available — protects your streak if you miss a day)\n`;
      }

      if (registry?.globalStats?.streak?.current > 0) {
        const streakDays = registry.globalStats.streak.current;
        gamificationBlock += `• 🔥 Daily Streak: ${streakDays} day${streakDays > 1 ? "s" : ""}\n`;
      }

      // Daily challenge
      if (registry) {
        const today = todayStr();
        const dc = registry.globalStats?.dailyChallenge || {};
        if (dc.date !== today || !dc.completed) {
          const challenge = pickDailyChallenge(registry);
          if (challenge) {
            gamificationBlock += `\n🌅 Daily Challenge (unlocked):\n`;
            gamificationBlock += `   ${challenge.prompt}\n`;
            gamificationBlock += `   Bonus: +${challenge.bonusXp} XP if completed this session!\n`;
          }
        } else {
          gamificationBlock += `\n🌅 Daily Challenge: ✅ Completed today! Come back tomorrow for a new one.\n`;
        }
      }

      // Level-up splash (recent)
      if (game.hasNewLevelUp) {
        const displayTitle = game.newMastery > 0
          ? `${game.newLevelTitle} · Mastery ${game.newMastery}`
          : `${game.newLevelTitle}`;
        gamificationBlock += `\n${renderLevelUpSplash(game.newLevel, displayTitle, game.newMastery)}\n`;
        game.hasNewLevelUp = false; // consume after one display
      }

      updated += gamificationBlock;

      // Tutor mode rules
      if (mode === "tutor") {
        updated += `\n⚠️ TUTOR MODE — CRITICAL RULES:\n` +
          `• Teach ONE concept chunk at a time — never two in sequence without a checkpoint between them\n` +
          `• NEVER present a concept roadmap/outline of what you're about to teach\n` +
          `• After reading the book, DO NOT say "this chapter covers X, Y, and Z" — start teaching the first chunk directly\n` +
          `• The user discovers each concept one at a time — don't preview them all upfront\n` +
          `• Each chunk = teach (2-3 sentences for familiar concepts, 4-5 for analogy-first) + check (specific question)\n` +
          `• If the user says "just summarize it", respond: "Let me teach it to you instead."\n` +
          `• When the user answers correctly, call the award_xp tool with the base XP amount, then move to the next chunk\n` +
          `• ALWAYS connect new content to at least one concept from a prior chapter\n` +
          `\n📊 VISUAL-FIRST RULE (user learns faster with visuals):\n` +
          `• For EVERY concept chunk, include a diagram — either from the book or generated via render_diagram\n` +
          `• FIRST check if the book source has a relevant figure/diagram — reference it by page or figure number\n` +
          `• If no book diagram, use the render_diagram tool\n` +
          `• ALWAYS use flow diagrams by default. Comparison tables only for explicit trade-off comparisons.\n` +
          `• Flow: simple inline boxes with arrows showing how something works step by step.\n` +
          `• Comparison: ONLY when comparing 2 specific approaches side-by-side (e.g., B-Tree vs LSM-Tree).\n` +
          `• The diagram should be the FIRST thing the user sees for that chunk — before the verbal explanation\n` +
          `• Keep diagram labels SHORT (3-5 words max) — details go in your verbal explanation, not the diagram\n` +
          `• Keep diagrams focused — one concept per diagram, max 5 rows or 4 steps\n` +
          `• Title the diagram with the ANALOGY name (e.g., \'The Organized Pantry\'). Technical term goes inside the diagram as a label\n`;
      } else {
        updated += `\n⚠️ INDEPENDENT MODE — CRITICAL RULES:\n` +
          `• NEVER read the book content to the user — give a reading mission (page range + questions) and wait\n` +
          `• NEVER summarize what pages cover — just point to the range and set questions\n` +
          `• If the user says "just summarize it", respond: "Summaries create the illusion of learning."\n`;
      }
    }

    return { systemPrompt: updated };
  });

  // ═══════════════════════════════════════════
  //  3. AUTO-SAVE + GAMIFICATION ENGINE UPDATE
  // ═══════════════════════════════════════════

  pi.on("agent_end", async (_event, ctx) => {
    if (!state.active || !state.currentBookSlug) return;

    // Reload progress from disk (LLM may have persisted XP via award_xp tool)
    const progress = loadProgress(state.currentBookSlug);
    if (!progress) return;

    // Validate level against XP
    const computed = await computeLevel(pi, progress.gamification?.xp || 0);
    const currentLevel = progress.gamification?.level || 1;

    if (currentLevel !== computed.level && progress.gamification) {
      progress.gamification.level = computed.level;
      progress.gamification.title = computed.title;
    }

    // ── Detect XP change → user answered a question ──
    // Compare current XP (from disk, possibly updated via award_xp tool) against
    // the pre-turn baseline captured in before_agent_start
    const currentXp = progress.gamification?.xp || 0;
    const xpDelta = currentXp - game.lastXp;

    if (xpDelta > 0) {
      // User got something correct — increment combo
      game.comboCount++;
      const combo = getComboMultiplier(game.comboCount);
      game.lastComboLabel = combo.label;
      game.lastComboMultiplier = combo.multiplier;

      // Roll for next critical hit (if none pending)
      if (!game.pendingCritLabel) {
        const roll = Math.random();
        // Cumulative thresholds preserve intended probabilities:
        // Legendary 1%, Rare 5%, Critical 20%
        const legendThreshold = LEGENDARY_CHANCE;
        const rareThreshold = LEGENDARY_CHANCE + RARE_CHANCE;
        const critThreshold = LEGENDARY_CHANCE + RARE_CHANCE + CRIT_CHANCE;
        if (roll < legendThreshold) {
          game.pendingCritLabel = "🎆 Legendary Insight";
          game.pendingCritMultiplier = 5;
        } else if (roll < rareThreshold) {
          game.pendingCritLabel = "🌟 Rare Insight";
          game.pendingCritMultiplier = 3;
        } else if (roll < critThreshold) {
          game.pendingCritLabel = "💥 Critical Hit";
          game.pendingCritMultiplier = 2;
        }
      }

      // Roll for mystery box (if none pending)
      if (!game.pendingMysteryBox && Math.random() < MYSTERY_BOX_CHANCE) {
        game.pendingMysteryBox = true;
        game.pendingMysteryBoxReward = MYSTERY_BOX_MIN_XP +
          Math.floor(Math.random() * (MYSTERY_BOX_MAX_XP - MYSTERY_BOX_MIN_XP + 1));
      }
    } else if (xpDelta === 0) {
      // No XP change — likely a wrong answer or non-answer turn
      // We don't auto-reset combo here because the LLM might award XP
      // on the next turn. The combo resets only when the LLM explicitly
      // signals a wrong answer (handled below via skill behavior).
    }

    // ── Detect level-up ──
    if (computed.level > game.lastLevel) {
      game.hasNewLevelUp = true;
      game.newLevel = computed.level;
      game.newLevelTitle = computed.title;
      game.newMastery = computed.mastery || 0;
    }
    game.lastLevel = computed.level;
    game.lastMastery = computed.mastery || 0;

    saveProgress(state.currentBookSlug, progress);
  });

  // ═══════════════════════════════════════════
  //  4. HANDLE WRONG ANSWER SIGNAL
  //     (LLM signals via sending a specific user message)
  // ═══════════════════════════════════════════

  pi.on("message_end", async (event, ctx) => {
    if (!state.active) return;
    if (event.message.role !== "assistant") return;

    const content = event.message.content;
    if (typeof content !== "string") return;

    // ── Wrong answer signal — LLM appends [BOOKQUEST ANSWER: wrong] ──
    const WRONG_ANSWER_MARKER = "[BOOKQUEST ANSWER: wrong]";
    if (content.includes(WRONG_ANSWER_MARKER)) {
      // Reset combo
      game.comboCount = 0;
      const combo = getComboMultiplier(0);
      game.lastComboLabel = combo.label;
      game.lastComboMultiplier = combo.multiplier;
      // Strip the marker from the content (don't show it to user)
      const cleaned = content.replace(WRONG_ANSWER_MARKER, "").replace(/\n{2,}/g, "\n").trim();
      return { message: { ...event.message, content: cleaned } };
    }

    // ── Daily challenge completion signal ──
    const DC_COMPLETE_MARKER = "[DAILY_CHALLENGE: done]";
    if (content.includes(DC_COMPLETE_MARKER)) {
      const registry = getRegistry();
      if (registry?.globalStats?.dailyChallenge) {
        registry.globalStats.dailyChallenge.date = todayStr();
        registry.globalStats.dailyChallenge.completed = true;
        saveRegistry(registry);
      }
      const cleaned = content.replace(DC_COMPLETE_MARKER, "").replace(/\n{2,}/g, "\n").trim();
      return { message: { ...event.message, content: cleaned } };
    }

    // ── Handle roadmap patterns in tutor mode ──
    if (state.currentChapterMode === "tutor") {
        const ROADMAP_PATTERNS = [
          /^\s*Next up\s*[—–-]\s*page(?:s)?\s+\d+(?:[-–]\d+)?[^\n]*:?\s*/gim,
          /^\s*Next\s*[—–-]\s*page(?:s)?\s+\d+(?:[-–]\d+)?[^\n]*:?\s*/gim,
          /^\s*(?:Let's move on to|Moving on to|Now let's (?:look at|cover|discuss|dive into)|Let me (?:cover|explain|walk through)|I'll now (?:cover|explain|teach|walk through))\b[^\n]*page(?:s)?\s+\d+(?:[-–]\d+)?[^\n]*:?\s*/gim,
          /^\s*(?:Let me log (?:the concepts|this|that).*|Time to move on.*|Moving right along.*)\s*/gim,
        ];

        let cleaned = content;
        let matched = false;
        for (const pattern of ROADMAP_PATTERNS) {
          const before = cleaned;
          cleaned = cleaned.replace(pattern, "");
          if (cleaned !== before) matched = true;
        }
        cleaned = cleaned.replace(/^\n+/, "");

        if (matched && cleaned !== content) {
          pi.sendUserMessage(
            "[BookQuest correction] You presented a concept roadmap or multi-chunk preview. " +
            "In tutor mode, teach ONE concept chunk at a time. " +
            "Do not announce pages or preview what's coming next. " +
            "Start teaching the next chunk directly with a check after it."
          );
          return { message: { ...event.message, content: cleaned } };
        }
      }
  });

  // ═══════════════════════════════════════════
  //  5. RECOVER state on session resume + STARTUP
  // ═══════════════════════════════════════════

  pi.on("session_start", async (event, ctx) => {
    const entries = ctx.sessionManager.getBranch();
    for (const entry of entries) {
      if (entry.type === "custom" && entry.customType === "bookquest-state") {
        const saved = entry.data as Partial<BookQuestState>;
        if (saved.active) {
          state.active = true;
          state.currentBookSlug = saved.currentBookSlug || null;
          state.currentBookTitle = saved.currentBookTitle || null;
          // Initialize lastLevel from saved progress to prevent false level-up splash
          if (saved.currentBookSlug) {
            const savedProgress = loadProgress(saved.currentBookSlug);
            if (savedProgress?.gamification?.level) {
              game.lastLevel = savedProgress.gamification.level;
              game.lastMastery = savedProgress.gamification.mastery || 0;
            }
          }
        }
        break;
      }
    }

    if (!ctx.hasUI) return;
    const books = getActiveBooks().length;
    ctx.ui.notify(
      `📚 BookQuest extension loaded (${books} book${books !== 1 ? "s" : ""} tracked).\n` +
        `   Type /bookquest to start a reading session.`,
      "info"
    );
  });

  // ═══════════════════════════════════════════
  //  6. PERSIST state + STREAK SHIELD CONSUMPTION
  // ═══════════════════════════════════════════

  let stateSaveCounter = 0;

  pi.on("turn_end", async (_event, ctx) => {
    if (!state.active) return;
    stateSaveCounter++;

    // ── Streak shield consumption ──
    // Check if streak is about to break (2+ days gap)
    const registry = getRegistry();
    if (registry?.globalStats?.streak) {
      const streak = registry.globalStats.streak;
      if (streak.lastSessionDate && streak.current > 0) {
        const last = new Date(streak.lastSessionDate);
        const today = new Date(todayStr());
        const gap = Math.floor((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
        if (gap >= 2 && (registry.globalStats.streakShields || 0) > 0) {
          // Consume a shield to protect the streak
          registry.globalStats.streakShields--;
          // Pretend last session was yesterday to preserve the streak
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          streak.lastSessionDate = yesterday.toISOString().split("T")[0];
          // Don't increment — just preserve
          saveRegistry(registry);
          ctx.ui?.notify?.(
            "🛡️ Streak Shield consumed! Your streak was protected while you were away.",
            "info"
          );
        }
      }
    }

    // ── Persist gamification + state ──
    if (stateSaveCounter % 3 === 0) {
      pi.appendEntry("bookquest-state", {
        active: state.active,
        currentBookSlug: state.currentBookSlug,
        currentBookTitle: state.currentBookTitle,
      });
    }
  });

  // ═══════════════════════════════════════════
  //  7. render_diagram — Custom tool
  // ═══════════════════════════════════════════

  pi.registerTool({
    name: "render_diagram",
    label: "Render Diagram",
    description: `Draw a SIMPLE inline diagram for a concept. Keep ALL labels SHORT (3-5 words). ` +
      `The diagram is a visual skeleton — explain details verbally. ` +
      `Use flow for processes/steps, comparison for side-by-side trade-offs, hierarchy for trees.`,
    promptSnippet: "render_diagram(type=\"flow\"|\"comparison\"|\"hierarchy\") — SIMPLE inline diagram. Keep labels 3-5 words max",
    parameters: Type.Object({
      type: Type.Union([
        Type.Literal("flow"),
        Type.Literal("comparison"),
        Type.Literal("hierarchy"),
      ], { description: "Diagram type: flow (DEFAULT — horizontal steps, use this 90% of the time), comparison (side-by-side table, only for explicit trade-offs), hierarchy (tree)" }),
      title: Type.String({ description: "Diagram title — use the ANALOGY name (e.g., 'The Organized Pantry'). Technical term goes in subtitle or inside the diagram" }),
      subtitle: Type.Optional(Type.String({ description: "Optional one-line subtitle, e.g., the analogy name" })),
      steps: Type.Optional(Type.Array(Type.Object({
        label: Type.String({ description: "Step name, 3-5 words max. Example: 'Leader Election'. NOT: 'The system elects a leader through voting'" }),
        description: Type.Optional(Type.String({ description: "Optional one-liner, 5-8 words max. Again, details go in the verbal explanation, not the diagram." })),
      }), { description: "(flow only) Flow steps. Keep labels SHORT (3-5 words). The verbal explanation provides all details." })),
      left_label: Type.Optional(Type.String({ description: "(comparison only) Left column heading, SHORT (3-5 words)" })),
      right_label: Type.Optional(Type.String({ description: "(comparison only) Right column heading, SHORT (3-5 words)" })),
      rows: Type.Optional(Type.Array(Type.Object({
        aspect: Type.String({ description: "Row label, SHORT — 3-5 words, e.g., 'Read speed' not 'How fast data can be retrieved'" }),
        left: Type.String({ description: "Cell content, 3-5 words max. Details go in verbal explanation." }),
        right: Type.String({ description: "Cell content, 3-5 words max. Details go in verbal explanation." }),
      }), { description: "(comparison only) Rows. Keep aspect/labels SHORT — details go in verbal explanation. Max 5 rows." })),
      root: Type.Optional(Type.String({ description: "(hierarchy only) Root node label, SHORT (3-5 words)" })),
      children: Type.Optional(Type.Array(Type.Object({
        label: Type.String({ description: "Child node label, SHORT (3-5 words)" }),
        sub_items: Type.Optional(Type.Array(Type.String(), { description: "Sub-items under this child, SHORT (3-5 words each)" })),
      }), { description: "(hierarchy only) Child nodes under the root, max 6 children" })),
    }),
    execute: async (toolCallId, params) => {
      return renderDiagram(params);
    },
  });

  // ═══════════════════════════════════════════
  //  8. award_xp — Tool for LLM to persist XP
  // ═══════════════════════════════════════════

  pi.registerTool({
    name: "award_xp",
    label: "Award XP",
    description: `Award XP to the user for a correct answer or completed task. ` +
      `The extension tracks the combo streak and rolls for critical hits / mystery boxes. ` +
      `Always include a reason. Example: award_xp(amount=10, reason="correct quiz answer first try")`,
    promptSnippet: "award_xp(amount=..., reason=\"...\")",
    parameters: Type.Object({
      amount: Type.Integer({ minimum: 1, description: "XP amount to award (positive integer)" }),
      reason: Type.String({ description: "Short reason for the XP award, shown to the user" }),
    }),
    execute: async (toolCallId, params) => {
      if (!state.active || !state.currentBookSlug) {
        return `{"error": "No active book session"}`;
      }
      const progress = loadProgress(state.currentBookSlug);
      if (!progress) {
        return `{"error": "No progress file found"}`;
      }
      if (!progress.gamification) {
        progress.gamification = { xp: 0, level: 1, title: "📖 Page Turner", mastery: 0 };
      }
      const amount = Math.max(1, Math.floor(params.amount));
      progress.gamification.xp = (progress.gamification.xp || 0) + amount;
      saveProgress(state.currentBookSlug, progress);
      const total = progress.gamification.xp;
      return JSON.stringify({ awarded: amount, reason: params.reason, totalXp: total });
    },
  });
}
