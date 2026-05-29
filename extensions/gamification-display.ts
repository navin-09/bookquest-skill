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

// ── Gamification state block ──

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
}

export interface DailyChallenge {
  prompt: string;
  bonusXp: number;
}

export function buildGamificationBlock(
  game: GameState,
  registry: any | null,
  challenge: DailyChallenge | null,
): string {
  const comboVisual = buildComboVisual(game.comboCount, game.lastComboLabel, game.lastComboMultiplier);

  let block = `\n## Active Gamification Bonuses (extension-managed)\n`;
  block += `• Answer Streak: ${game.comboCount} correct → ${comboVisual}\n`;

  if (game.pendingCritLabel) {
    block += `• 💥 ${game.pendingCritLabel} loaded — next correct answer gets ${game.pendingCritMultiplier}x XP on top of combo!\n`;
  }
  if (game.pendingMysteryBox) {
    block += `• 🎁 Mystery Box available — next correct answer unlocks bonus +${game.pendingMysteryBoxReward} XP!\n`;
  }

  // Streak shields
  if (registry?.globalStats?.streakShields > 0) {
    const shields = registry.globalStats.streakShields;
    const shieldIcons = "🛡️".repeat(Math.min(shields, 5)) + (shields > 5 ? ` +${shields - 5}` : "");
    block += `• Streak Shields: ${shieldIcons} (${shields} available — protects your streak if you miss a day)\n`;
  }

  // Daily streak
  if (registry?.globalStats?.streak?.current > 0) {
    const streakDays = registry.globalStats.streak.current;
    block += `• 🔥 Daily Streak: ${streakDays} day${streakDays > 1 ? "s" : ""}\n`;
  }

  // Daily challenge
  if (registry) {
    const today = new Date().toISOString().split("T")[0];
    const dc = registry.globalStats?.dailyChallenge || {};
    if (dc.date !== today || !dc.completed) {
      if (challenge) {
        block += `\n🌅 Daily Challenge (unlocked):\n`;
        block += `   ${challenge.prompt}\n`;
        block += `   Bonus: +${challenge.bonusXp} XP if completed this session!\n`;
      }
    } else {
      block += `\n🌅 Daily Challenge: ✅ Completed today! Come back tomorrow for a new one.\n`;
    }
  }

  // Level-up splash
  if (game.hasNewLevelUp) {
    const displayTitle = game.newMastery > 0
      ? `${game.newLevelTitle} · Mastery ${game.newMastery}`
      : `${game.newLevelTitle}`;
    block += `\n${renderLevelUpSplash(game.newLevel, displayTitle, game.newMastery)}\n`;
  }

  return block;
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
