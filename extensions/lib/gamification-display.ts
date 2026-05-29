/**
 * BookQuest Gamification Display Module
 *
 * Pure formatting functions that build strings for system prompt injection.
 * Receives data from callers (event handlers in bookquest.ts) rather than
 * fetching it directly — keeps this module testable and separates display
 * logic from data-access concerns.
 */

// ── Combo display ──

export function buildComboVisual(
  comboCount: number,
  comboLabel: string,
  multiplier: number
): string {
  if (comboCount < 3) return `${comboLabel} multiplier`;
  const flames =
    comboCount >= 10 ? "🔥🔥🔥" :
    comboCount >= 5  ? "🔥🔥" :
    "🔥";
  return `${comboLabel} · ${multiplier}x · ${flames}`;
}

// ── Types ──

export interface GameState {
  comboCount: number;
  lastComboLabel: string;
  lastComboMultiplier: number;
  pendingCritLabel: string | null;
  pendingCritMultiplier: number;
  pendingMysteryBox: boolean;
  pendingMysteryBoxReward: number;
  hasNewLevelUp: boolean;
  newLevel: number;
  newLevelTitle: string;
  newMastery: number;
  /** XP bonus awarded when returning after a missed day */
  comebackBonusXp: number;
}

/** Chapter and concept progress for the endowed progress display. */
export interface ProgressState {
  currentChapter: number;
  totalChapters: number;
  conceptsLearned: number;
  totalConcepts: number;
}

export interface DailyChallenge {
  prompt: string;
  bonusXp: number;
}

// ── Gamification state block ──

export function buildGamificationBlock(
  game: GameState,
  registry: any | null,
  challenge: DailyChallenge | null,
  todayStr?: string,
): string {
  const comboVisual = buildComboVisual(game.comboCount, game.lastComboLabel, game.lastComboMultiplier);

  let block = `\n## Active Bonuses\n`;
  block += `• Streak: ${game.comboCount} → ${comboVisual}\n`;

  if (game.comebackBonusXp > 0) {
    block += `• 🔄 Comeback: +${game.comebackBonusXp} XP on next correct answer!\n`;
  }

  if (game.pendingCritLabel) {
    block += `• 💥 ${game.pendingCritLabel}: ${game.pendingCritMultiplier}x next!\n`;
  }
  if (game.pendingMysteryBox) {
    block += `• 🎁 Mystery Box: +${game.pendingMysteryBoxReward} XP next!\n`;
  }

  if (registry?.globalStats?.streakShields > 0) {
    block += `• 🛡️ Shields: ${registry.globalStats.streakShields} (protects streak)\n`;
  }

  if (registry?.globalStats?.streak?.current > 0) {
    block += `• 🔥 Streak: ${registry.globalStats.streak.current}d\n`;
  }

  if (registry) {
    const today = todayStr ?? new Date().toISOString().split("T")[0];
    const dc = registry.globalStats?.dailyChallenge || {};
    if (dc.date !== today || !dc.completed) {
      if (challenge) {
        block += `\n🌅 Daily: ${challenge.prompt} (+${challenge.bonusXp} XP this session)\n`;
      }
    } else {
      block += `\n🌅 Daily: ✅ Done today\n`;
    }
  }

  if (game.hasNewLevelUp) {
    const t = game.newMastery > 0
      ? `${game.newLevelTitle} · Mastery ${game.newMastery}`
      : `${game.newLevelTitle}`;
    block += `\n${renderLevelUpSplash(game.newLevel, t, game.newMastery)}\n`;
  }

  return block;
}

// ── Endowed progress display (#2) ──

export function buildEndowedProgress(progress: ProgressState): string {
  const pct = Math.round((progress.currentChapter / progress.totalChapters) * 100);
  const bar = "█".repeat(Math.round(pct / 5)) + "░".repeat(20 - Math.round(pct / 5));
  let out = `\n📊 ${progress.currentChapter}/${progress.totalChapters} (${pct}%) ${bar}`;
  if (progress.totalConcepts > 0) {
    const c = Math.round((progress.conceptsLearned / progress.totalConcepts) * 100);
    out += ` · ${c}% concepts`;
  }
  return out + `\n`;
}

// ── Boss pre-ritual display (#5) ──

export interface BossPreRitualState {
  chapterNumber: number;
  chapterTitle: string;
  comboCount: number;
  streakShields: number;
  conceptsInChapter: number;
}

export function buildBossPreRitual(boss: BossPreRitualState): string {
  const line = "─".repeat(40);
  return [
    "",
    `⚔️ BOSS FIGHT APPROACHING — Chapter ${boss.chapterNumber}`,
    `┌${line}┐`,
    `│  ${boss.chapterTitle}`,
    `│`,
    `│  Review: ${boss.conceptsInChapter} concepts from this chapter`,
    `│  🛡️ Streak Shields: ${boss.streakShields}`,
    `│  ⚡ Combo streak: ${boss.comboCount}`,
    `│`,
    `│  Pass reward: +100 XP + 1 Streak Shield 🛡️`,
    `└${line}┘`,
    "",
  ].join("\n");
}

// ── Level-up splash ──

export function renderLevelUpSplash(level: number, title: string, mastery: number): string {
  const maxW = Math.max(level.toString().length + title.length + 3, 20);
  const top = "╔" + "═".repeat(maxW + 2) + "╗";
  const mid1 = "║" + " ".repeat(Math.floor((maxW - 9) / 2)) + "🎉 LEVEL UP!" + " ".repeat(Math.ceil((maxW - 9) / 2)) + "║";
  const mid2 = "║" + " ".repeat(Math.floor((maxW - title.length - 2) / 2)) + `Lv.${level} ${title}` + " ".repeat(Math.ceil((maxW - title.length - 2) / 2)) + "║";
  const bot = "╚" + "═".repeat(maxW + 2) + "╝";
  return `${top}\n${mid1}\n${mid2}\n${bot}`;
}
