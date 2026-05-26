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

function getLevelInfo(xp) {
  let current = LEVELS[0];
  for (const l of LEVELS) {
    if (xp >= l.xp) current = l;
    else break;
  }
  const nextLevel = LEVELS.find(l => l.level === current.level + 1);
  return {
    xp,
    level: current.level,
    title: current.title,
    xpIntoLevel: xp - current.xp,
    xpForNextLevel: nextLevel ? nextLevel.xp - xp : 0,
    isMaxed: !nextLevel,
  };
}

function getXpForLevel(n) {
  const found = LEVELS.find(l => l.level === n);
  return found ? found.xp : null;
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
