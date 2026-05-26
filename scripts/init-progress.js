#!/usr/bin/env node

/**
 * BookQuest Progress Initializer
 *
 * Usage: node init-progress.js <book-source> [--project]
 *
 * Creates the initial progress JSON file for a new book.
 * --project flag stores in .bookquest/ instead of ~/.pi/book-progress/
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const source = process.argv[2];
const isProject = process.argv.includes('--project');

if (!source) {
  console.error('Usage: node init-progress.js <book-source> [--project]');
  process.exit(1);
}

// Generate slug from source
const slug = path.basename(source)
  .replace(/\.[^.]+$/, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const progressDir = isProject
  ? path.join(process.cwd(), '.bookquest')
  : path.join(process.env.HOME, '.pi', 'book-progress');

const progressFile = path.join(progressDir, `${slug}.json`);

// Check if already exists
if (fs.existsSync(progressFile)) {
  console.log(`Progress file already exists: ${progressFile}`);
  console.log('Use the existing file or delete it to reinitialize.');
  process.exit(0);
}

// Ensure directory exists
fs.mkdirSync(progressDir, { recursive: true });

// Interactive setup
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

(async () => {
  console.log('\n📚 BookQuest — Book Setup\n');

  const title = await ask(`Book title (or press Enter to use "${slug}"): `) || slug;
  const author = await ask('Author (optional): ') || '';
  const totalChapters = parseInt(await ask('Total chapters (estimate): '), 10) || 0;

  // Build default skill tree (one branch per chapter, no boss fights by default)
  const skillTree = [];
  for (let i = 1; i <= Math.min(totalChapters, 50); i++) {
    skillTree.push({
      id: `ch-${i}`,
      name: `Chapter ${i}`,
      chapters: [i],
      status: i === 1 ? 'unlocked' : 'locked',
      isBossFight: false,
      bossFightPassed: false,
    });
  }

  const now = new Date().toISOString();
  const progress = {
    book: {
      title,
      source,
      slug,
      author,
      totalChapters,
      dateStarted: now.split('T')[0],
    },
    progress: {
      currentChapter: 1,
      completedChapters: [],
      skillTree,
    },
    gamification: {
      xp: 0,
      level: 1,
      streak: { current: 0, longest: 0, lastSessionDate: null },
      achievements: [],
      sessions: [],
    },
    knowledgeGraph: [],
  };

  fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
  rl.close();

  console.log(`\n✅ Progress file created: ${progressFile}`);
  console.log(`   Book: ${title}`);
  console.log(`   Chapters: ${totalChapters}`);
  console.log(`   Location: ${isProject ? 'project (.bookquest/)' : 'global (~/.pi/book-progress/)'}`);
  console.log(`\n💡 Tip: Edit the skill tree in the JSON to add boss fights and branch groupings.\n`);
})();
