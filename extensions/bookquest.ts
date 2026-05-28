/**
 * BookQuest Enforcer Extension
 *
 * Enforces the hard structural rules of BookQuest programmatically so
 * the LLM can't drift from them. Works alongside the BookQuest skill
 * (skills/bookquest/SKILL.md) which handles the behavioral/teaching side.
 *
 * What this extension enforces:
 *   ✅ Auto-save progress after every turn
 *   ✅ Validate level calculations via level-calc.js
 *   ✅ Inject current skill tree into system prompt every turn
 *   ✅ Block content summarization in independent-reading mode
 *   ✅ Track activation state across the session
 *   ✅ Remind the LLM of hard rules every turn to prevent drift
 *   ✅ render_diagram — custom tool for perfectly-aligned Unicode diagrams
 *   ✅ Visual-first teaching rule injected into system prompt
 *   ✅ Book diagram references (prefer book figures over generated diagrams)
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

function getActiveBooks(): { slug: string; title: string; source: string }[] {
  const progressDir = getProgressDir();
  const regPath = progressDir === PROGRESS_DIR_DEFAULT
    ? REGISTRY_PATH
    : join(progressDir, "registry.json");

  if (!existsSync(regPath)) return [];
  try {
    const reg = JSON.parse(readFileSync(regPath, "utf-8"));
    return (reg.books || []).filter((b: any) => b.slug);
  } catch {
    return [];
  }
}

function getProgressDirForBook(slug: string): string {
  if (!isValidSlug(slug)) return PROGRESS_DIR_DEFAULT;
  // Check if book is in project or global dir
  const projectDir = join(process.cwd(), ".bookquest", `${slug}.json`);
  if (existsSync(projectDir)) return join(process.cwd(), ".bookquest");
  return PROGRESS_DIR_DEFAULT;
}

function loadProgress(slug: string): any | null {
  if (!isValidSlug(slug)) return null;
  const baseDir = getProgressDirForBook(slug);
  const path = join(baseDir, `${slug}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function saveProgress(slug: string, data: any): void {
  if (!isValidSlug(slug)) return;
  const baseDir = getProgressDirForBook(slug);
  if (!existsSync(baseDir)) {
    // Try creating the default dir
    const defaultDir = PROGRESS_DIR_DEFAULT;
    mkdirSync(defaultDir, { recursive: true });
    writeFileSync(join(defaultDir, `${slug}.json`), JSON.stringify(data, null, 2));
    return;
  }
  writeFileSync(join(baseDir, `${slug}.json`), JSON.stringify(data, null, 2));
}

async function computeLevel(pi: ExtensionAPI, xp: number): Promise<{ level: number; title: string; xp: number }> {
  try {
    const { stdout } = await pi.exec("node", [LEVEL_CALC_SCRIPT, String(xp)]);
    return JSON.parse(stdout.trim());
  } catch {
    // Fallback: manual calculation
    const LEVELS = [
      { level: 1, xp: 0, title: "📖 Page Turner" },
      { level: 2, xp: 100, title: "📚 Chapter Runner" },
      { level: 3, xp: 300, title: "🧠 Concept Cracker" },
      { level: 4, xp: 600, title: "🔗 Connection Master" },
      { level: 5, xp: 1000, title: "⚔️ Boss Slayer" },
      { level: 6, xp: 1500, title: "🏆 Knowledge Knight" },
      { level: 7, xp: 2200, title: "🧙 Tech Sage" },
      { level: 8, xp: 3000, title: "👑 Grandmaster Reader" },
    ];
    let current = LEVELS[0];
    for (const l of LEVELS) {
      if (xp >= l.xp) current = l;
      else break;
    }
    return { xp, level: current.level, title: current.title };
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

function getBookSourceForPath(path: string): string | null {
  const books = getActiveBooks();
  for (const book of books) {
    if (book.source && path.startsWith(book.source)) return book.slug;
  }
  return null;
}

// ── State ──
interface BookQuestState {
  active: boolean;
  currentBookSlug: string | null;
  currentBookTitle: string | null;
  currentChapterMode: "independent" | "tutor" | null;
}

// ── Diagram renderer ──

function renderDiagram(params: any): { content: { type: string; text: string }[] } {
  if (!params || typeof params !== "object") {
    return { content: [{ type: "text", text: "[diagram error: invalid parameters]" }] };
  }
  // Unicode box-drawing chars
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

  // Max diagram width for terminal responsiveness
  const MAX_WIDTH = 78;

  function pad(s: string, w: number): string {
    const str = String(s ?? "");
    return str.length > w ? str.slice(0, w - 1) + "\u2026" : str + " ".repeat(Math.max(0, w - str.length));
  }

  /** Cap column widths proportionally so total doesn't exceed maxAvailable */
  function capWidths(widths: number[], maxAvailable: number): number[] {
    const total = widths.reduce((a, b) => a + b, 0);
    if (total <= maxAvailable) return widths;
    const ratio = maxAvailable / total;
    return widths.map((w) => Math.max(3, Math.floor(w * ratio)));
  }

  function boxRow(cells: string[], widths: number[]): string {
    return V + " " + cells.map((c, i) => pad(c, widths[i])).join(" " + V + " ") + " " + V;
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

    // Calculate column widths, capped to fit terminal
    let aspectW = Math.max(
      "Aspect".length,
      ...rows.map((r) => r.aspect.length),
      title.length > 40 ? 40 : title.length
    );
    let leftW = Math.max(leftLabel.length, ...rows.map((r) => r.left.length));
    let rightW = Math.max(rightLabel.length, ...rows.map((r) => r.right.length));
    // Cap total width so table fits in MAX_WIDTH (border/padding overhead = 10)
    const capped = capWidths([aspectW, leftW, rightW], MAX_WIDTH - 10);
    aspectW = capped[0]; leftW = capped[1]; rightW = capped[2];
    const lines: string[] = [];
    // Title bar
    const titleBarWidth = aspectW + leftW + rightW + 8;
    lines.push(TL + H.repeat(titleBarWidth) + TR);
    lines.push(V + " " + pad(title, titleBarWidth - 2) + " " + V);
    if (subtitle) {
      lines.push(V + " " + pad("(" + subtitle + ")", titleBarWidth - 2) + " " + V);
    }
    // Header separator
    lines.push(LM + H.repeat(aspectW + 2) + TM + H.repeat(leftW + 2) + TM + H.repeat(rightW + 2) + RM);
    // Header row
    const hdrW = [aspectW, leftW, rightW];
    lines.push(boxRow(["Aspect", leftLabel, rightLabel], hdrW));
    // Separator
    lines.push(LM + H.repeat(aspectW + 2) + CROSS + H.repeat(leftW + 2) + CROSS + H.repeat(rightW + 2) + RM);
    // Data rows
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      lines.push(boxRow([r.aspect, r.left, r.right], hdrW));
      if (i < rows.length - 1) {
        lines.push(LM + H.repeat(aspectW + 2) + CROSS + H.repeat(leftW + 2) + CROSS + H.repeat(rightW + 2) + RM);
      }
    }
    // Bottom
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
    // For flow: total width = steps * (boxW + 2) + (steps-1) * arrowLen
    // Cap boxW so total fits in MAX_WIDTH
    const arrowLen = ARROW_R.length;
    const maxBoxW = Math.floor((MAX_WIDTH - (steps.length - 1) * arrowLen) / steps.length) - 2;
    // Absolute minimum readable boxW is 4 (label max = 2 chars). If maxBoxW < 4, cap steps.
    const MIN_BOXW = 4;
    const maxStepsFit = maxBoxW < MIN_BOXW
      ? Math.max(2, Math.floor((MAX_WIDTH - arrowLen) / (MIN_BOXW + 2 + arrowLen)))
      : steps.length;
    const cappedSteps = steps.slice(0, maxStepsFit);
    const boxW = Math.max(MIN_BOXW, Math.min(idealBoxW, maxBoxW >= MIN_BOXW ? maxBoxW : Math.floor((MAX_WIDTH - (cappedSteps.length - 1) * arrowLen) / cappedSteps.length) - 2));
    const arrowStr = ARROW_R;

    const lines: string[] = [];
    lines.push(title);
    if (subtitle) lines.push("(" + subtitle + ")");
    lines.push("");

    // Top borders
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

    // Description rows if present
    if (renderSteps.some((s: any) => s.description)) {
      let descRow = "";
      let descBotRow = "";
      for (let i = 0; i < renderSteps.length; i++) {
        const s = renderSteps[i];
        const desc = s.description || "";
        descRow += V + " " + pad(desc, boxW - 2) + " " + V;
        descBotRow += BL + H.repeat(boxW) + BR;
        if (i < renderSteps.length - 1) {
          descRow += " " + pad("", arrowStr.length - 2) + " ";
          descBotRow += arrowStr;
        }
      }
      lines.push(descRow);
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

    // Root node
    const rootW = Math.max(root.length + 2, 6);
    lines.push("            " + TL + H.repeat(rootW) + TR);
    lines.push("            " + V + " " + pad(root, rootW - 2) + " " + V);

    if (children.length > 0) {
      const indent = Math.max(2, Math.floor(rootW / 2));
      lines.push(" ".repeat(indent) + BL + H.repeat(rootW) + BR);
      lines.push("");

      // Root connector
      lines.push(" ".repeat(indent + Math.floor(rootW / 2) - 1) + V);

      // Children row
      for (const child of children) {
        const cW = Math.max(child.label.length + 2, (child.sub_items ? Math.max(...child.sub_items.map(s => s.length)) + 2 : 4));
        const bar = TL + H.repeat(cW) + TR;
        const mid = V + " " + pad(child.label, cW - 2) + " " + V;
        const bot = BL + H.repeat(cW) + BR;
        lines.push(" ".repeat(indent) + bar);
        lines.push(" ".repeat(indent) + mid);
        lines.push(" ".repeat(indent) + bot);

        // Sub-items
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

  // ═══════════════════════════════════════════
  //  1. /bookquest COMMAND — Activation/Deactivation
  // ═══════════════════════════════════════════

  pi.registerCommand("bookquest", {
    description: "Toggle BookQuest mode or manage books",
    usage: "[/bookquest | /bookquest add | /bookquest switch <book>]",
    handler: async (args, ctx) => {
      const trimmed = (args || "").trim().toLowerCase();

      // Subcommands
      if (trimmed === "add") {
        state.active = true;
        if (ctx.hasUI) {
          ctx.ui.notify("📚 BookQuest — Let's add a new book!", "info");
        }
        // Let the skill handle the reconnaissance flow
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
        if (ctx.hasUI) {
          ctx.ui.notify(`📚 Switched to: ${found.title}`, "info");
        }
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

      // Toggle
      if (state.active) {
        // Deactivate
        state.active = false;
        state.currentBookSlug = null;
        state.currentBookTitle = null;
        state.currentChapterMode = null;

        // Trigger deactivation summary
        await pi.sendUserMessage(
          "/bookquest deactivated — Show session summary, save all progress, update registry."
        );
      } else {
        // Activate — show dashboard
        state.active = true;
        const books = getActiveBooks();

        if (books.length === 0) {
          // No books yet — start reconnaissance
          if (ctx.hasUI) ctx.ui.notify("📚 BookQuest activated! Let's start a new book.", "info");
          await pi.sendUserMessage(
            "/bookquest activated — No books found. Run Phase 1 Reconnaissance: ask for book source."
          );
        } else if (books.length === 1) {
          const book = books[0];
          state.currentBookSlug = book.slug;
          state.currentBookTitle = book.title;
          if (ctx.hasUI) ctx.ui.notify(`📚 BookQuest activated! Continuing: ${book.title}`, "info");
          await pi.sendUserMessage(
            `/bookquest activated — Continuing "${book.title}" (${book.slug}). Show dashboard, load progress.`
          );
        } else {
          // Multiple books — show dashboard, let user pick
          const summary = books
            .map((b, i) => {
              const p = loadProgress(b.slug);
              const ch = p?.progress?.currentChapter || 1;
              const total = p?.book?.totalChapters || "?";
              const xp = p?.gamification?.xp || 0;
              return `${i + 1}. ${b.title} — Ch.${ch}/${total} | ${xp} XP`;
            })
            .join("\n");

          if (ctx.hasUI) {
            ctx.ui.notify(`📚 BookQuest Dashboard\n${summary}`, "info");
          }
          await pi.sendUserMessage(
            `/bookquest activated with ${books.length} books. Show dashboard and let user pick which book to continue.`
          );
        }
      }
    },
  });

  // ═══════════════════════════════════════════
  //  2. INJECT SKILL TREE + RULES REMINDER every turn
  // ═══════════════════════════════════════════

  pi.on("before_agent_start", async (event, ctx) => {
    if (!state.active) return;

    let updated = event.systemPrompt;

    // Inject hard rules reminder into system prompt
    updated += `\n\n## BookQuest Enforcement (auto-injected)\n${HARD_RULES_REMINDER}\n`;

    // Inject skill tree
    if (state.currentBookSlug) {
      const progress = loadProgress(state.currentBookSlug);
      if (progress?.progress?.skillTree) {
        const tree = renderSkillTree(progress.progress.skillTree);
        updated += `\n\n## Current Skill Tree: ${state.currentBookTitle}\n${tree}\n`;
      }

      // Show current chapter mode
      const currCh = progress?.progress?.currentChapter || 1;
      const chapterEntry = progress?.progress?.completedChapters?.find(
        (c: any) => c.chapter === currCh
      );
      const mode = chapterEntry?.mode || progress?.book?.defaultMode || "independent";
      state.currentChapterMode = mode;
      updated += `\nCurrent chapter: ${currCh} (${mode} mode)\n`;

      // Inject tutor-mode specific reinforcement
      if (mode === "tutor") {
        updated += `\n⚠️ TUTOR MODE — CRITICAL RULES:\n` +
          `• Teach ONE concept chunk at a time — never two in sequence without a checkpoint between them\n` +
          `• NEVER present a concept roadmap/outline of what you're about to teach\n` +
          `• After reading the book, DO NOT say "this chapter covers X, Y, and Z" — start teaching the first chunk directly\n` +
          `• The user discovers each concept one at a time — don't preview them all upfront\n` +
          `• Each chunk = teach (2-3 sentences for familiar concepts, 4-5 for analogy-first) + check (specific question)\n` +
          `• If the user says "just summarize it", respond: "Let me teach it to you instead."\n` +
          `• If the user answers correctly, DO NOT add extra explanation — award XP and move to the next chunk\n` +
          `• ALWAYS connect new content to at least one concept from a prior chapter\n` +
          `\n📊 VISUAL-FIRST RULE (user learns faster with visuals):\n` +
          `• For EVERY concept chunk, include a diagram — either from the book or generated via render_diagram\n` +
          `• FIRST check if the book source has a relevant figure/diagram — reference it by page or figure number\n` +
          `• If no book diagram, use the render_diagram tool\n` +
          `• PREFER flow diagrams over comparison tables — simpler, fit the screen better, work inline with teaching\n` +
          `• Use comparison tables ONLY when showing trade-offs between 2 specific approaches (B-Tree vs LSM-Tree)\n` +
          `• The diagram should be the FIRST thing the user sees for that chunk — before the verbal explanation\n` +
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
  //  3. AUTO-SAVE progress after every turn
  // ═══════════════════════════════════════════

  pi.on("agent_end", async (_event, ctx) => {
    if (!state.active || !state.currentBookSlug) return;

    // Re-read the progress file to see if the LLM updated it
    const progress = loadProgress(state.currentBookSlug);
    if (!progress) return;

    // Validate level against XP
    const computed = await computeLevel(pi, progress.gamification?.xp || 0);
    const currentLevel = progress.gamification?.level || 1;

    if (currentLevel !== computed.level) {
      // Auto-correct: the LLM miscalculated
      progress.gamification.level = computed.level;
      progress.gamification.title = computed.title;

      // Save corrected version
      saveProgress(state.currentBookSlug, progress);
    } else {
      // Ensure it's saved (LLM might have forgotten)
      saveProgress(state.currentBookSlug, progress);
    }
  });

  // ═══════════════════════════════════════════
  //  4. BLOCK content summarization roadmap patterns in tutor mode
  // ═══════════════════════════════════════════

  pi.on("tool_call", async (event, ctx) => {
    if (!state.active) return;
    if (event.toolName !== "read" && event.toolName !== "bash") return;

    const books = getActiveBooks();

    // Track book source reads — flag if LLM reads book source in independent mode
    if (event.toolName === "read") {
      const path = String(event.input.path || "");
      const bookSlug = getBookSourceForPath(path);
      if (bookSlug) {
        if (state.currentChapterMode === "independent") {
          // In independent mode, the user reads — not the LLM
          return { block: false }; // Let through with reminder
        }
        if (state.currentChapterMode === "tutor") {
          // In tutor mode, the LLM needs to read — but inject a reminder
          // that it must NOT present a concept roadmap after reading
          // This is handled via before_agent_start injecting the rule
          return { block: false };
        }
      }
    }

    // Check for bash commands that read book files
    if (event.toolName === "bash") {
      const cmd = String(event.input.command || "");
      for (const book of books) {
        if (book.source && cmd.includes(book.source)) {
          if (state.currentChapterMode === "independent") {
            if (ctx.hasUI) {
              const allow = await ctx.ui.confirm(
                "📚 BookQuest Guard",
                `The assistant is trying to read the book source in independent-reading mode.\n\n` +
                  `This is likely an attempt to summarize content. Allow anyway?`,
              );
              if (!allow) {
                return {
                  block: true,
                  reason:
                    "BookQuest: Reading book source in independent mode may lead to summarization, which is not allowed.",
                };
              }
            }
          }
          // In tutor mode, allow the read — rules are injected via system prompt
          return { block: false };
        }
      }
    }
  });

  // ═══════════════════════════════════════════
  //  5. RECOVER state on session resume + STARTUP NOTIFICATION
  // ═══════════════════════════════════════════

  pi.on("session_start", async (event, ctx) => {
    // ── State recovery ──
    const entries = ctx.sessionManager.getBranch();
    for (const entry of entries) {
      if (entry.type === "custom" && entry.customType === "bookquest-state") {
        const saved = entry.data as Partial<BookQuestState>;
        if (saved.active) {
          state.active = true;
          state.currentBookSlug = saved.currentBookSlug || null;
          state.currentBookTitle = saved.currentBookTitle || null;
        }
        break;
      }
    }

    // ── Startup notification ──
    if (!ctx.hasUI) return;
    const books = getActiveBooks().length;
    ctx.ui.notify(
      `📚 BookQuest extension loaded (${books} book${books !== 1 ? "s" : ""} tracked).\n` +
        `   Type /bookquest to start a reading session.`,
      "info"
    );
  });

  // ═══════════════════════════════════════════
  //  6. PERSIST state to session entries
  // ═══════════════════════════════════════════

  // Save state periodically so it survives reload/resume
  let stateSaveCounter = 0;

  pi.on("turn_end", async (_event, ctx) => {
    if (!state.active) return;
    stateSaveCounter++;

    // Save every 3 turns to avoid flooding session entries
    if (stateSaveCounter % 3 === 0) {
      pi.appendEntry("bookquest-state", {
        active: state.active,
        currentBookSlug: state.currentBookSlug,
        currentBookTitle: state.currentBookTitle,
      });
    }
  });

  // ═══════════════════════════════════════════
  //  8. render_diagram — Custom tool for properly-aligned Unicode diagrams
  // ═══════════════════════════════════════════

  pi.registerTool({
    name: "render_diagram",
    label: "Render Diagram",
    description: `Generate a properly-aligned Unicode box-drawing diagram for a concept. ` +
      `Use instead of hand-crafting ASCII diagrams in your response — this tool ` +
      `computes exact column widths, border positions, and arrow alignment so the ` +
      `diagram is perfectly shaped. Prefer flow (simpler, fits screen). Use comparison sparingly for trade-offs.`,
    promptSnippet: "render_diagram(type=\"flow\") — simple inline flow diagram (or \"comparison\" for trade-offs, \"hierarchy\" for trees)",
    parameters: Type.Object({
      type: Type.Union([
        Type.Literal("flow"),
        Type.Literal("comparison"),
        Type.Literal("hierarchy"),
      ], { description: "Diagram type: flow (PREFERRED — horizontal steps), comparison (side-by-side table, use sparingly), hierarchy (tree)" }),
      title: Type.String({ description: "Diagram title — use the ANALOGY name (e.g., 'The Organized Pantry'). Technical term goes in subtitle or inside the diagram" }),
      subtitle: Type.Optional(Type.String({ description: "Optional one-line subtitle, e.g., the analogy name" })),
      // flow-specific (PREFERRED — simpler, fits screen)
      steps: Type.Optional(Type.Array(Type.Object({
        label: Type.String({ description: "Step name, e.g., 'Leader Election'" }),
        description: Type.Optional(Type.String({ description: "One-line description, optional" })),
      }), { description: "(flow only) Steps in the flow, 2-4 steps (keeps diagrams compact)" })),
      // comparison-specific (use sparingly — only for trade-offs)
      left_label: Type.Optional(Type.String({ description: "(comparison only) Left column heading" })),
      right_label: Type.Optional(Type.String({ description: "(comparison only) Right column heading" })),
      rows: Type.Optional(Type.Array(Type.Object({
        aspect: Type.String({ description: "Row label, e.g., 'Read speed', 'Best for'" }),
        left: Type.String({ description: "Left cell content" }),
        right: Type.String({ description: "Right cell content" }),
      }), { description: "(comparison only) Rows of the comparison table, max 5 rows" })),
      // hierarchy-specific
      root: Type.Optional(Type.String({ description: "(hierarchy only) Root node label" })),
      children: Type.Optional(Type.Array(Type.Object({
        label: Type.String({ description: "Child node label" }),
        sub_items: Type.Optional(Type.Array(Type.String(), { description: "Sub-items under this child" })),
      }), { description: "(hierarchy only) Child nodes under the root" })),
    }),
    execute: async (toolCallId, params) => {
      return renderDiagram(params);
    },
  });

  // ═══════════════════════════════════════════
  //  9. INTERCEPT roadmap patterns in tutor mode
  // ═══════════════════════════════════════════

  /** Patterns that indicate a concept roadmap / chapter preview.
   *  Matches the full line so we don't leave dangling fragments.
   *  Uses 'g' flag to catch multiple roadmap announcements in one message.
   */
  const ROADMAP_PATTERNS = [
    /^\s*Next up\s*[—–-]\s*page(?:s)?\s+\d+(?:[-–]\d+)?[^\n]*:?\s*/gim,
    /^\s*Next\s*[—–-]\s*page(?:s)?\s+\d+(?:[-–]\d+)?[^\n]*:?\s*/gim,
    /^\s*(?:Let's move on to|Moving on to|Now let's (?:look at|cover|discuss|dive into)|Let me (?:cover|explain|walk through)|I'll now (?:cover|explain|teach|walk through))\b[^\n]*page(?:s)?\s+\d+(?:[-–]\d+)?[^\n]*:?\s*/gim,
    /^\s*(?:Let me log (?:the concepts|this|that).*|Time to move on.*|Moving right along.*)\s*/gim,
  ];

  pi.on("message_end", async (event, ctx) => {
    if (!state.active || state.currentChapterMode !== "tutor") return;
    if (event.message.role !== "assistant") return;

    const content = event.message.content;
    if (typeof content !== "string") return;

    // Strip all roadmap announcements
    let cleaned = content;
    let matched = false;
    for (const pattern of ROADMAP_PATTERNS) {
      const before = cleaned;
      cleaned = cleaned.replace(pattern, "");
      if (cleaned !== before) matched = true;
    }

    // Also strip leading blank lines left after removal
    cleaned = cleaned.replace(/^\n+/, "");

    if (matched && cleaned !== content) {
      // Queue a corrective message for the NEXT turn
      pi.sendUserMessage(
        "[BookQuest correction] You presented a concept roadmap or multi-chunk preview. " +
        "In tutor mode, teach ONE concept chunk at a time. " +
        "Do not announce pages or preview what's coming next. " +
        "Start teaching the next chunk directly with a check after it."
      );

      return { message: { ...event.message, content: cleaned } };
    }
  });
}
