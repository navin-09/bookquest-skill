#!/usr/bin/env node

/**
 * BookQuest Level Calculator
 *
 * Usage:
 *   node level-calc.js <xp>           — compute level info from XP
 *   node level-calc.js --for-level N  — show XP required for level N
 *
 * The agent MUST use this script after any XP change instead of
 * calculating levels manually.
 *
 * Also exports getLevelInfo and getXpForLevel for programmatic use.
 */

const LEVELS = [
  { level: 1, xp: 0,    title: '📖 Page Turner' },
  { level: 2, xp: 100,  title: '📚 Chapter Runner' },
  { level: 3, xp: 300,  title: '🧠 Concept Cracker' },
  { level: 4, xp: 600,  title: '🔗 Connection Master' },
  { level: 5, xp: 1000, title: '⚔️ Boss Slayer' },
  { level: 6, xp: 1500, title: '🏆 Knowledge Knight' },
  { level: 7, xp: 2200, title: '🧙 Tech Sage' },
  { level: 8, xp: 3000, title: '👑 Grandmaster Reader' },
];

/**
 * Generate XP threshold for a mastery level beyond Level 8.
 * Formula: 3000 * 1.4^(n - 8) rounded to nearest 50.
 */
function getMasteryXp(level) {
  if (level <= 8) return null;
  return Math.round(3000 * Math.pow(1.4, level - 8) / 50) * 50;
}

/** Mastery number (how many times past Level 8) */
function getMasteryNumber(level) {
  return level > 8 ? level - 8 : 0;
}

function getLevelInfo(xp) {
  let current = LEVELS[0];
  // Check base levels
  for (const l of LEVELS) {
    if (xp >= l.xp) current = l;
    else break;
  }
  // Check mastery levels (infinite scaling past Level 8)
  if (xp >= LEVELS[LEVELS.length - 1].xp) {
    let level = LEVELS[LEVELS.length - 1].level;
    while (true) {
      const nextXp = getMasteryXp(level + 1);
      if (nextXp === null || xp < nextXp) break;
      level++;
    }
    current = { level, xp: getMasteryXp(level) ?? LEVELS[LEVELS.length - 1].xp, title: '👑 Grandmaster Reader' };
  }

  const nextLevel = getXpForLevel(current.level + 1);
  // Build title with mastery suffix
  const mastery = getMasteryNumber(current.level);
  const displayTitle = mastery > 0
    ? `${current.title} · Mastery ${mastery}`
    : current.title;
  return {
    xp,
    level: current.level,
    title: displayTitle,
    mastery,
    xpIntoLevel: xp - current.xp,
    xpForNextLevel: nextLevel !== null ? nextLevel - xp : 0,
    isMaxed: nextLevel === null,
  };
}

function getXpForLevel(n) {
  if (n <= 8) {
    const found = LEVELS.find(l => l.level === n);
    return found ? found.xp : null;
  }
  return getMasteryXp(n);
}

module.exports = { getLevelInfo, getXpForLevel, LEVELS };

// --- CLI ---
if (require.main === module) {
  const arg1 = process.argv[2];
  const arg2 = process.argv[3];

  if (!arg1 || arg1 === '--help') {
    console.log('Usage: node level-calc.js <xp>');
    console.log('       node level-calc.js --for-level N');
    console.log('');
    console.log('Levels:');
    for (const l of LEVELS) {
      console.log(`  Level ${l.level}: ${l.title} (>= ${l.xp} XP)`);
    }
    process.exit(0);
  }

  if (arg1 === '--for-level') {
    const n = parseInt(arg2, 10);
    const xp = getXpForLevel(n);
    if (xp === null) {
      console.error(`Unknown level: ${n} (max: ${LEVELS[LEVELS.length - 1].level})`);
      process.exit(1);
    }
    console.log(JSON.stringify({ level: n, xpRequired: xp, unbounded: n >= LEVELS[LEVELS.length - 1].level }));
  } else {
    const xp = parseInt(arg1, 10);
    if (isNaN(xp) || xp < 0) {
      console.error(`Invalid XP value: ${arg1}`);
      process.exit(1);
    }
    console.log(JSON.stringify(getLevelInfo(xp)));
  }
}
