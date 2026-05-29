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
 *   ✅ Visual-first teaching rule injected into system prompt
 *   ✅ Book diagram references (prefer book figures over generated diagrams)
 *   ✅ Gamification state injected every turn
 *
 * Install via pi package:
 *   pi install git:github.com/navin-09/bookquest-skill
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { createFileDataAccess } from "./lib/data-access.js";
import type { BookDataAccess } from "./lib/data-access.js";
import { renderDiagram } from "./lib/diagram-renderer.js";
import { buildGamificationBlock, buildEndowedProgress, buildBossPreRitual } from "./lib/gamification-display.js";
import type { GameState, ProgressState, BossPreRitualState } from "./lib/gamification-display.js";

// ── Helpers for path resolution ──
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = join(__dirname, "..");

// ── Paths ──
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

// ── Hard rules reminder injected every turn ──
const HARD_RULES_REMINDER = `
[BOOKQUEST HARD RULES — enforced by extension]
• Save progress every turn — extension auto-saves on agent_end
• Validate levels via \`scripts/level-calc.js <xp>\` — extension checks
• NEVER summarize — reading missions (independent) or teach chunk-by-chunk (tutor)
• Run end-of-chapter quiz + challenge before unlocking next chapter
• Skill tree shown at session start
`.trim();

// ── Compute level (calls external script, falls back) ──

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

    const getMasteryThreshold = (n: number): number => {
      return Math.round(BASE * Math.pow(1.4, n - 8) / 50) * 50;
    };

    if (xp < BASE) {
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

function renderSkillTree(tree: any[], bookTitle: string): string {
  if (!tree || !tree.length) return "  (no skill tree available)";

  const statusIcon = (node: any): string => {
    if (node.isBossFight) return "⚔️";
    switch (node.status) {
      case "complete": return "✅";
      case "in_progress": return "🔄";
      case "unlocked": return "🔓";
      default: return "🔒";
    }
  };

  const children = tree.map((node: any) => ({
    label: `${statusIcon(node)} ${node.name}`,
    sub_items: node.chapters?.map((ch: number) => `Ch.${ch}`) || undefined,
  }));

  const result = renderDiagram({
    type: "hierarchy",
    title: bookTitle,
    root: "📚 Skill Tree",
    children,
  });

  return result.content[0]?.text || "  (render error)";
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
  comebackBonusXp: number;          // XP bonus for returning after a missed day
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
    comebackBonusXp: 0,
  };
}

// ── Extension ──

export default function (pi: ExtensionAPI) {
  const data: BookDataAccess = createFileDataAccess();

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
        const books = data.getActiveBooks();
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
        Object.assign(game, freshGamificationEngine());
        stateSaveCounter = 0;
        if (ctx.hasUI) ctx.ui.notify(`📚 Switched to: ${found.title}`, "info");
        await pi.sendUserMessage(
          `/bookquest switched to "${found.title}" (${found.slug}). Load progress and continue.`
        );
        return;
      }

      if (trimmed === "books") {
        const books = data.getActiveBooks();
        if (books.length === 0) {
          if (ctx.hasUI) ctx.ui.notify("📚 No books tracked yet. Use /bookquest add to start.", "info");
          return;
        }
        const lines = books.map((b) => {
          const progress = data.loadBookProgress(b.slug);
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
        const books = data.getActiveBooks();

        if (books.length === 0) {
          if (ctx.hasUI) ctx.ui.notify("📚 BookQuest activated! Let's start a new book.", "info");
          await pi.sendUserMessage(
            "/bookquest activated — No books found. Run Phase 1 Reconnaissance: ask for book source."
          );
        } else if (books.length === 1) {
          const book = books[0];
          state.currentBookSlug = book.slug;
          state.currentBookTitle = book.title;
          const progress = data.loadBookProgress(book.slug);
          game.lastLevel = progress?.gamification?.level || 1;
          if (ctx.hasUI) ctx.ui.notify(`📚 BookQuest activated! Continuing: ${book.title}`, "info");
          await pi.sendUserMessage(
            `/bookquest activated — Continuing "${book.title}" (${book.slug}). Show dashboard, load progress.`
          );
        } else {
          const summary = books
            .map((b, i) => {
              const p = data.loadBookProgress(b.slug);
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
      const progress = data.loadBookProgress(state.currentBookSlug);
      // Capture baseline XP for delta detection in agent_end
      game.lastXp = progress?.gamification?.xp || 0;
      if (progress?.progress?.skillTree) {
        const tree = renderSkillTree(progress.progress.skillTree, state.currentBookTitle || "");
        updated += `\n\n## Current Skill Tree\n${tree}\n`;
      }

      const currCh = progress?.progress?.currentChapter || 1;
      const totalCh = progress?.book?.totalChapters || currCh;
      const chapterEntry = progress?.progress?.completedChapters?.find(
        (c: any) => c.chapter === currCh
      );
      const mode = chapterEntry?.mode || progress?.book?.defaultMode || "independent";
      state.currentChapterMode = mode;
      updated += `\nCurrent chapter: ${currCh} (${mode} mode)\n`;

      // ════════════════════════════════════════════════
      //  ENDOWED PROGRESS (#2)
      // ════════════════════════════════════════════════

      const conceptsInChapter = progress?.knowledgeGraph?.filter(
        (k: any) => k.chapter === currCh
      ).length || 0;
      const totalChapterConcepts = progress?.knowledgeGraph?.length || 0;
      updated += buildEndowedProgress({
        currentChapter: currCh,
        totalChapters: totalCh,
        conceptsLearned: conceptsInChapter,
        totalConcepts: totalChapterConcepts,
      });

      // ════════════════════════════════════════════════
      //  BOSS PRE-RITUAL (#5) — detect end of chapter
      // ════════════════════════════════════════════════
      // If the chapter's skill-tree branch has isBossFight=true for the next
      // node, the user is approaching the boss fight. Check if all regular
      // nodes up to the boss are complete or in_progress.
      const treeNodes = progress?.progress?.skillTree || [];
      const chapterBranches = treeNodes.filter((n: any) =>
        !n.isBossFight && n.chapters?.includes(currCh)
      );
      const bossNode = treeNodes.find((n: any) =>
        n.isBossFight && n.chapters?.includes(currCh)
      );
      const allChapterNodesDone = chapterBranches.every(
        (n: any) => n.status === "complete"
      );
      if (bossNode && allChapterNodesDone && chapterBranches.length > 0) {
        const registry = data.loadRegistry();
        const shields = registry?.globalStats?.streakShields || 0;
        updated += buildBossPreRitual({
          chapterNumber: currCh,
          chapterTitle: bossNode.name || `Chapter ${currCh}`,
          comboCount: game.comboCount,
          streakShields: shields,
          conceptsInChapter: conceptsInChapter,
        });
      }

      // ════════════════════════════════════════════════
      //  GAMIFICATION STATE INJECTION
      // ════════════════════════════════════════════════

      const registry = data.loadRegistry();
      const challenge = registry ? data.pickDailyChallenge(registry) : null;

      const gamificationBlock = buildGamificationBlock(game as GameState, registry, challenge);
      game.hasNewLevelUp = false; // consume splash after one display
      updated += gamificationBlock;

      // Tutor mode rules
      if (mode === "tutor") {
        updated += `\n⚠️ TUTOR MODE RULES:\n` +
          `• One chunk at a time: teach (2-3 sentences) → check → next. Never two in sequence.\n` +
          `• Never present a roadmap/outline (e.g., "this chapter covers X, Y, Z"). Start teaching the first chunk directly.\n` +
          `• If the user says "just summarize", respond: "Let me teach it to you instead."\n` +
          `• Correct answer → call award_xp with base amount, then move to next chunk. No extra explanation.\n` +
          `• Connect new content to at least one prior chapter concept.\n` +
          `\n📊 VISUAL-FIRST:\n` +
          `• Every chunk needs a diagram. Prefer book figures; otherwise draw one with Unicode box-drawing characters.\n` +
          `• Default to flow diagram. Comparison only for side-by-side trade-offs.\n` +
          `• Diagram comes first — before verbal explanation.\n` +
          `• Labels SHORT (3-5 words). Title with analogy name, put technical term inside.\n`;
      } else {
        updated += `\n⚠️ INDEPENDENT MODE RULES:\n` +
          `• Give a reading mission (page range + questions). Never read content to the user.\n` +
          `• Never summarize what pages cover — just point to the range and set questions.\n` +
          `• If the user says "just summarize it": "Summaries create the illusion of learning."\n`;
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
    const progress = data.loadBookProgress(state.currentBookSlug);
    if (!progress) return;

    // Validate level against XP
    const computed = await computeLevel(pi, progress.gamification?.xp || 0);
    const currentLevel = progress.gamification?.level || 1;

    if (currentLevel !== computed.level && progress.gamification) {
      progress.gamification.level = computed.level;
      progress.gamification.title = computed.title;
    }

    // ── Detect XP change → user answered a question ──
    const currentXp = progress.gamification?.xp || 0;
    const xpDelta = currentXp - game.lastXp;

    if (xpDelta > 0) {
      // User got something correct — consume comeback bonus if active
      if (game.comebackBonusXp > 0) {
        if (!progress.gamification) {
          progress.gamification = { xp: 0, level: 1, title: "📖 Page Turner", mastery: 0 };
        }
        progress.gamification.xp = (progress.gamification.xp || 0) + game.comebackBonusXp;
        game.comebackBonusXp = 0;
      }

      // Increment combo
      game.comboCount++;
      const combo = getComboMultiplier(game.comboCount);
      game.lastComboLabel = combo.label;
      game.lastComboMultiplier = combo.multiplier;

      // Roll for next critical hit (if none pending)
      if (!game.pendingCritLabel) {
        const roll = Math.random();
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

    data.saveBookProgress(state.currentBookSlug, progress);
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
      game.comboCount = 0;
      const combo = getComboMultiplier(0);
      game.lastComboLabel = combo.label;
      game.lastComboMultiplier = combo.multiplier;
      const cleaned = content.replace(WRONG_ANSWER_MARKER, "").replace(/\n{2,}/g, "\n").trim();
      return { message: { ...event.message, content: cleaned } };
    }

    // ── Daily challenge completion signal ──
    const DC_COMPLETE_MARKER = "[DAILY_CHALLENGE: done]";
    if (content.includes(DC_COMPLETE_MARKER)) {
      const registry = data.loadRegistry();
      if (registry?.globalStats?.dailyChallenge) {
        registry.globalStats.dailyChallenge.date = data.todayStr();
        registry.globalStats.dailyChallenge.completed = true;
        data.saveRegistry(registry);
      }
      const cleaned = content.replace(DC_COMPLETE_MARKER, "").replace(/\n{2,}/g, "\n").trim();
      return { message: { ...event.message, content: cleaned } };
    }

    // ── Handle roadmap patterns in tutor mode ──
    if (state.currentChapterMode === "tutor") {
        // ── Shared helper: apply regex patterns and check for matches ──
        function applyPatternReplacements(
          text: string,
          patterns: RegExp[],
          replacement: string
        ): { cleaned: string; matched: boolean } {
          let cleaned = text;
          let matched = false;
          for (const pattern of patterns) {
            const before = cleaned;
            cleaned = cleaned.replace(pattern, replacement);
            if (cleaned !== before) matched = true;
          }
          return { cleaned, matched };
        }

        const ROADMAP_PATTERNS = [
          /^\s*Next up\s*[—–-]\s*page(?:s)?\s+\d+(?:[-–]\d+)?[^\n]*:?\s*/gim,
          /^\s*Next\s*[—–-]\s*page(?:s)?\s+\d+(?:[-–]\d+)?[^\n]*:?\s*/gim,
          /^\s*(?:Let's move on to|Moving on to|Now let's (?:look at|cover|discuss|dive into)|Let me (?:cover|explain|walk through)|I'll now (?:cover|explain|teach|walk through))\b[^\n]*page(?:s)?\s+\d+(?:[-–]\d+)?[^\n]*:?\s*/gim,
          /^\s*(?:Let me log (?:the concepts|this|that).*|Time to move on.*|Moving right along.*)\s*/gim,
        ];

        const { cleaned: cleanedRoadmap, matched: roadmapMatch } = applyPatternReplacements(content, ROADMAP_PATTERNS, "");
        const cleaned = cleanedRoadmap.replace(/^\n+/, "");

        if (roadmapMatch && cleaned !== content) {
          await pi.sendUserMessage(
            "[BookQuest correction] You presented a concept roadmap or multi-chunk preview. " +
            "In tutor mode, teach ONE concept chunk at a time. " +
            "Do not announce pages or preview what's coming next. " +
            "Start teaching the next chunk directly with a check after it."
          );
          return { message: { ...event.message, content: cleaned } };
        }

        // ── Post-answer summarization detection ──
        // Catches summary framing the LLM adds AFTER answering a checkpoint
        // (e.g., "The mental model is...", "In other words...", "Essentially...")
        // that does the thinking for the user instead of letting them sit with it.
        //
        // Each pattern matches a sentence that frames/wraps up a teaching point.
        // Convention: start-of-line (^\s*), matching phrase, then colon (:) followed
        // by any content. To add a new pattern, add a regex following this form.
        const SUMMARY_FRAMING_PATTERNS = [
          /^\s*The mental model[^\n]*:.*/gm,
          /^\s*The key insight[^\n]*:.*/gm,
          /^\s*In other words[^\n]*:.*/gm,
          /^\s*To summarize[^\n]*:.*/gm,
          /^\s*(?:Essentially|Basically|Put simply|Simplified)[^\n]*:.*/gm,
          /^\s*The (?:real |fundamental |core )?difference[^\n]*:.*/gm,
          /^\s*The takeaway[^\n]*:.*/gm,
          /^\s*What this means[^\n]*:.*/gm,
          // Case-insensitive so "The idea is" and "the idea is" both match
          /^\s*(?:So |Thus )?(?:the idea is|the concept is|what we've learned is|what matters is)[^\n]*:.*/gim,
        ];

        const { cleaned: cleanedSummary, matched: summaryMatch } = applyPatternReplacements(cleaned, SUMMARY_FRAMING_PATTERNS, "");

        if (summaryMatch) {
          await pi.sendUserMessage(
            "[BookQuest correction] You added a summary after the teaching/checkpoint. " +
            "Summaries do the thinking for the user. " +
            "After teaching a concept and checking understanding, either ask a follow-up " +
            "or move to the next chunk. Never wrap up with framing like 'the mental model is...' " +
            "or 'in other words...'. Let the user's own understanding be the summary."
          );
          if (cleanedSummary !== content) {
            return { message: { ...event.message, content: cleanedSummary } };
          }
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
          if (saved.currentBookSlug) {
            const savedProgress = data.loadBookProgress(saved.currentBookSlug);
            if (savedProgress?.gamification?.level) {
              game.lastLevel = savedProgress.gamification.level;
              game.lastMastery = savedProgress.gamification.mastery || 0;
            }
          }
        }
        break;
      }
    }

    // ── Detect gap → set comeback bonus (#3) ──
    const registry = data.loadRegistry();
    if (registry?.globalStats?.streak?.lastSessionDate) {
      const last = new Date(registry.globalStats.streak.lastSessionDate);
      const today = new Date(data.todayStr());
      const gap = Math.floor((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
      if (gap >= 2) {
        game.comebackBonusXp = 10;
      }
    }

    if (!ctx.hasUI) return;
    const books = data.getActiveBooks().length;
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
    const registry = data.loadRegistry();
    if (registry?.globalStats?.streak) {
      const streak = registry.globalStats.streak;
      if (streak.lastSessionDate && streak.current > 0) {
        const last = new Date(streak.lastSessionDate);
        const today = new Date(data.todayStr());
        const gap = Math.floor((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
        if (gap >= 2 && (registry.globalStats.streakShields || 0) > 0) {
          registry.globalStats.streakShields--;
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          streak.lastSessionDate = yesterday.toISOString().split("T")[0];
          data.saveRegistry(registry);
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
      const progress = data.loadBookProgress(state.currentBookSlug);
      if (!progress) {
        return `{"error": "No progress file found"}`;
      }
      if (!progress.gamification) {
        progress.gamification = { xp: 0, level: 1, title: "📖 Page Turner", mastery: 0 };
      }
      const amount = Math.max(1, Math.floor(params.amount));
      progress.gamification.xp = (progress.gamification.xp || 0) + amount;
      data.saveBookProgress(state.currentBookSlug, progress);
      const total = progress.gamification.xp;
      return JSON.stringify({ awarded: amount, reason: params.reason, totalXp: total });
    },
  });
}
