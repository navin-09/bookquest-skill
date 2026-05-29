/**
 * BookQuest Data Access Module
 *
 * Provides a seam (BookDataAccess interface) for all persistence operations.
 * Currently backed by the filesystem (FileDataAccess); an InMemoryDataAccess
 * can be swapped in for tests without touching filesystem code.
 *
 * This module owns:
 *   - Filesystem path resolution (global vs project dir)
 *   - JSON read/write with parse-error recovery
 *   - Slug validation
 *   - Date formatting
 *   - Seeded random (for deterministic daily challenges)
 *   - Daily challenge picker (uses data-access internally)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";

// ── Paths ──
export const PROGRESS_DIR_DEFAULT = join(homedir(), ".pi", "book-progress");
export const REGISTRY_PATH = join(PROGRESS_DIR_DEFAULT, "registry.json");

// ── Types ──
export interface BookMeta {
  slug: string;
  title: string;
  source: string;
  global?: boolean;
  lastActiveAt?: string;
}

export interface DailyChallenge {
  type: string;
  prompt: string;
  bonusXp: number;
}

/** Shape of the global registry.json file. */
export interface RegistryData {
  books?: BookMeta[];
  globalStats?: {
    streak?: { current: number; lastSessionDate?: string };
    streakShields?: number;
    dailyChallenge?: { date: string; completed: boolean };
    prestigeLevel?: number;
  };
}

/** Shape of a single book's progress file. */
export interface BookProgress {
  book?: {
    slug: string;
    title: string;
    totalChapters: number;
    defaultMode?: "independent" | "tutor";
  };
  progress?: {
    currentChapter?: number;
    completedChapters?: { chapter: number; mode?: string; score?: number }[];
    skillTree?: any[];
  };
  gamification?: {
    xp: number;
    level: number;
    title: string;
    mastery: number;
  };
  knowledgeGraph?: { concept: string; confidence?: number }[];
  startedAt?: string;
  completedAt?: string;
}

export interface BookDataAccess {
  /** Load the global/active registry. Returns null if not found or corrupt. */
  loadRegistry(): RegistryData | null;

  /** Save the registry to disk. Creates intermediate dirs if needed. */
  saveRegistry(registry: RegistryData): void;

  /** List all active books from the registry. */
  getActiveBooks(): BookMeta[];

  /** Load progress for a single book slug. Returns null if missing or corrupt slug. */
  loadBookProgress(slug: string): BookProgress | null;

  /** Save progress for a single book slug. Creates dirs if needed. */
  saveBookProgress(slug: string, data: BookProgress): void;

  /** Today's date string in YYYY-MM-DD format. */
  todayStr(): string;

  /** Pick a daily challenge from the pool, seeded deterministically by date. */
  pickDailyChallenge(registry: RegistryData): DailyChallenge | null;
}

// ── Helpers shared by all adapters ──

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(slug);
}

export function seededRandom(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const chr = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return (Math.abs(hash) % 1000) / 1000;
}

// ── Shared pickDailyChallenge logic (single source of truth) ──

export function pickDailyChallengeFromPool(
  todayStr: string,
  registryBooks: { slug: string }[] | undefined,
  loadProgress: (slug: string) => any | null
): DailyChallenge | null {
  if (!registryBooks || registryBooks.length === 0) return null;
  const seed = `bookquest-daily-${todayStr}`;
  const idx = Math.floor(seededRandom(seed) * DAILY_CHALLENGE_POOL.length);
  const template = DAILY_CHALLENGE_POOL[idx];

  const allConcepts: string[] = [];
  for (const book of registryBooks) {
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

const DAILY_CHALLENGE_POOL = [
  { type: "explain-persona", promptTemplate: "Explain {concept} to a 10-year-old. No jargon.", bonusXp: 15 },
  { type: "concept-connection", promptTemplate: "Connect {concept} to something you learned in a previous chapter.", bonusXp: 15 },
  { type: "real-world", promptTemplate: "Find a real-world system that uses {concept}.", bonusXp: 15 },
  { type: "analogy-invent", promptTemplate: "Invent a NEW analogy for {concept} from everyday life.", bonusXp: 20 },
  { type: "teach-back-mini", promptTemplate: "Teach {concept} to a non-tech friend in 2 sentences.", bonusXp: 15 },
];

// ── Default File-based Adapter ──

export function createFileDataAccess(): BookDataAccess {
  function getDataDir(): string {
    const cwd = process.cwd();
    const projectDir = join(cwd, ".bookquest");
    if (existsSync(projectDir)) return projectDir;
    return PROGRESS_DIR_DEFAULT;
  }

  return {
    loadRegistry(): RegistryData | null {
      const dataDir = getDataDir();
      const regPath = dataDir === PROGRESS_DIR_DEFAULT
        ? REGISTRY_PATH
        : join(dataDir, "registry.json");
      if (!existsSync(regPath)) return null;
      try { return JSON.parse(readFileSync(regPath, "utf-8")); }
      catch { return null; }
    },

    saveRegistry(registry: RegistryData): void {
      const dataDir = getDataDir();
      const regPath = dataDir === PROGRESS_DIR_DEFAULT
        ? REGISTRY_PATH
        : join(dataDir, "registry.json");
      const dir = dirname(regPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(regPath, JSON.stringify(registry, null, 2));
    },

    getActiveBooks(): BookMeta[] {
      const reg = this.loadRegistry();
      if (!reg) return [];
      return (reg.books || []).filter((b: any) => b.slug);
    },

    loadBookProgress(slug: string): BookProgress | null {
      if (!isValidSlug(slug)) return null;
      const dataDir = getDataDir();
      const path = join(dataDir, `${slug}.json`);
      if (!existsSync(path)) return null;
      try { return JSON.parse(readFileSync(path, "utf-8")); }
      catch { return null; }
    },

    saveBookProgress(slug: string, data: BookProgress): void {
      if (!isValidSlug(slug)) return;
      const dataDir = getDataDir();
      if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true });
      }
      writeFileSync(join(dataDir, `${slug}.json`), JSON.stringify(data, null, 2));
    },

    todayStr(): string {
      return new Date().toISOString().split("T")[0];
    },

    pickDailyChallenge(registry: RegistryData): DailyChallenge | null {
      return pickDailyChallengeFromPool(this.todayStr(), registry?.books, (slug) => this.loadBookProgress(slug));
    },
  };
}

// ── In-Memory Adapter (for testing) ──

export function createInMemoryDataAccess(
  initialRegistry?: any,
  initialProgress?: Record<string, any>
): BookDataAccess {
  let registry: any = initialRegistry ?? null;
  const progressStore: Record<string, any> = { ...(initialProgress || {}) };

  return {
    loadRegistry(): any | null {
      return registry ? JSON.parse(JSON.stringify(registry)) : null;
    },

    saveRegistry(reg: any): void {
      registry = JSON.parse(JSON.stringify(reg));
    },

    getActiveBooks(): BookMeta[] {
      if (!registry) return [];
      return (registry.books || []).filter((b: any) => b.slug);
    },

    loadBookProgress(slug: string): any | null {
      if (!isValidSlug(slug)) return null;
      const data = progressStore[slug];
      return data ? JSON.parse(JSON.stringify(data)) : null;
    },

    saveBookProgress(slug: string, data: any): void {
      if (!isValidSlug(slug)) return;
      progressStore[slug] = JSON.parse(JSON.stringify(data));
    },

    todayStr(): string {
      return new Date().toISOString().split("T")[0];
    },

    pickDailyChallenge(registry: any): DailyChallenge | null {
      return pickDailyChallengeFromPool(this.todayStr(), registry?.books, (slug) => this.loadBookProgress(slug));
    },
  };
}
