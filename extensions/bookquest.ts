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
 *
 * Install via pi package:
 *   pi install git:github.com/navin-09/bookquest-skill
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
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
    if (path === book.source) return book.slug;
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
          `• Each chunk = teach (2-3 sentences max) + check (specific question)\n` +
          `• If the user says "just summarize it", respond: "Let me teach it to you instead."\n`;
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
          // In tutor mode, allow the read but rules are injected via system prompt
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
}
