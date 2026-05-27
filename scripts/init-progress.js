#!/usr/bin/env node

/**
 * BookQuest Progress Initializer
 *
 * Usage: node init-progress.js <book-source> [--project]
 *
 * Creates the initial progress JSON file for a new book AND updates
 * the multi-book registry (registry.json) in the progress directory.
 *
 * --project        stores in .bookquest/ instead of ~/.pi/book-progress/
 * --skip-registry  skips registry.json creation/update
 * --noninteractive skips prompts, derives title from source filename
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { getLevelInfo } = require('./level-calc.js');

const source = process.argv[2];
const isProject  = process.argv.includes('--project');
const skipReg    = process.argv.includes('--skip-registry');
const noninteractive = process.argv.includes('--noninteractive');

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`Usage: node init-progress.js <book-source> [--project] [--skip-registry] [--noninteractive]

Creates a BookQuest progress file and updates the multi-book registry.

Arguments:
  book-source              File path or URL to the book
  --project                Store in .bookquest/ (default: ~/.pi/book-progress/)
  --skip-registry          Skip registry.json creation/update
  --noninteractive         Skip prompts (use --title=, --author=, --chapters=, --defaultMode=)

Examples:
  node init-progress.js ~/books/ddia.pdf --noninteractive --title="DDIA" --chapters=12 --defaultMode=tutor
  node init-progress.js https://example.com/book.pdf --project --noninteractive
`);
  process.exit(0);
}

if (!source) {
  console.error('Usage: node init-progress.js <book-source> [--project] [--skip-registry] [--noninteractive]');
  process.exit(1);
}

// --- Helpers ---

function generateSlug(str) {
  let base;
  if (/^https?:\/\//i.test(str)) {
    try {
      const url = new URL(str);
      const segments = url.pathname.split('/').filter(Boolean);
      base = segments.pop() || url.hostname;
    } catch {
      base = path.basename(str);
    }
  } else {
    base = path.basename(str);
  }
  let slug = base
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (!slug) slug = 'untitled-book';
  return slug;
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// --- Paths ---

const slug = generateSlug(source);
const progressDir = isProject
  ? path.join(process.cwd(), '.bookquest')
  : path.join(process.env.HOME, '.pi', 'book-progress');
const progressFile = path.join(progressDir, `${slug}.json`);
const registryFile = path.join(progressDir, 'registry.json');

// --- 1. Check existing ---

if (fs.existsSync(progressFile)) {
  console.log(`Progress file already exists (${path.basename(progressFile)})`);
  console.log('Use the existing file or delete it to reinitialize.');
  process.exit(0);
}

fs.mkdirSync(progressDir, { recursive: true });

// --- 2. Gather inputs ---

(async () => {
  console.log('\n📚 BookQuest — Book Setup\n');

  let title, author, totalChapters, defaultMode;

  if (noninteractive || !process.stdin.isTTY) {
    // Non-interactive or piped: derive from source
    const titleArg = process.argv.find(a => a.startsWith('--title='));
    title = titleArg ? titleArg.slice(titleArg.indexOf('=') + 1) : undefined;
    if (!title) title = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const authorArg = process.argv.find(a => a.startsWith('--author='));
    author = authorArg ? authorArg.slice(authorArg.indexOf('=') + 1) : '';
    const chaptersArg = process.argv.find(a => a.startsWith('--chapters='));
    totalChapters = parseInt(chaptersArg ? chaptersArg.slice(chaptersArg.indexOf('=') + 1) : '', 10) || 0;
    const modeArg = process.argv.find(a => a.startsWith('--defaultMode='));
    defaultMode = modeArg ? modeArg.slice(modeArg.indexOf('=') + 1) : 'independent';
  } else {
    // Interactive
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q) => new Promise(resolve => rl.question(q, resolve));
    title = await ask(`Book title (or Enter → "${slug}"): `) || slug;
    author = await ask('Author (optional): ') || '';
    totalChapters = parseInt(await ask('Total chapters (estimate): '), 10) || 0;
    const modeAnswer = (await ask('Default mode (independent/tutor, Enter → independent): ')).toLowerCase();
    defaultMode = (modeAnswer === 'tutor') ? 'tutor' : 'independent';
    rl.close();
  }

  // Build default flat skill tree (one node per chapter)
  const skillTree = [];
  for (let i = 1; i <= Math.min(totalChapters, 50); i++) {
    skillTree.push({
      id: `ch-${i}`,
      name: `Chapter ${i}`,
      chapters: [i],
      status: i === 1 ? 'unlocked' : 'locked',
      isBossFight: false,
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
      dateStarted: todayStr(),
      defaultMode,
    },
    progress: {
      currentChapter: 1,
      completedChapters: [],
      skillTree,
    },
    gamification: {
      xp: 0,
      level: 1,
      achievements: [],
      sessions: [],
    },
    knowledgeGraph: [],
  };

  fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
  console.log(`✅ Progress file created (${path.basename(progressFile)})`);
  console.log(`   Book: ${title} (slug: ${slug})`);

  // --- 3. Registry ---

  if (!skipReg) {
    let registry = {
      books: [],
      globalStats: { totalXp: 0, level: 1, streak: { current: 0, longest: 0, lastSessionDate: null } },
    };
    if (fs.existsSync(registryFile)) {
      try {
        registry = JSON.parse(fs.readFileSync(registryFile, 'utf-8'));
      } catch (e) {
        console.log(`   ⚠  Corrupt registry file, recreating.`);
      }
    }

    const existingIndex = registry.books.findIndex(b => b.slug === slug);
    const entry = {
      slug, title, source,
      global: !isProject,
      addedAt: now,
      lastActiveAt: now,
    };
    if (existingIndex >= 0) {
      registry.books[existingIndex] = { ...registry.books[existingIndex], ...entry, addedAt: registry.books[existingIndex].addedAt };
    } else {
      registry.books.push(entry);
    }

    // Recompute global XP from all per-book files
    let totalXp = 0;
    for (const book of registry.books) {
      const pf = path.join(progressDir, `${book.slug}.json`);
      if (fs.existsSync(pf)) {
        try {
          totalXp += JSON.parse(fs.readFileSync(pf, 'utf-8')).gamification?.xp ?? 0;
        } catch (e) {
          console.error(`   ⚠  Warning: skipping corrupted file: ${e.message}`);
        }
      }
    }

    const levelInfo = getLevelInfo(totalXp);
    registry.globalStats.totalXp = totalXp;
    registry.globalStats.level = levelInfo.level;

    // Reset streak if 2+ days gap
    if (registry.globalStats.streak.lastSessionDate) {
      const last = new Date(registry.globalStats.streak.lastSessionDate);
      const today = new Date(todayStr());
      const gap = Math.floor((today - last) / (1000 * 60 * 60 * 24));
      if (gap >= 2) registry.globalStats.streak.current = 0;
    }

    fs.writeFileSync(registryFile, JSON.stringify(registry, null, 2));
    console.log(`   Registry updated (${path.basename(registryFile)})`);
    console.log(`   Books tracked: ${registry.books.length}`);
  }

  console.log(`   Chapters: ${totalChapters}`);
  console.log(`   Location: ${isProject ? 'project (.bookquest/)' : 'global (~/.pi/book-progress/)'}`);
  console.log(`\n💡 Tip: Edit the skill tree in the JSON to add boss fights and branch groupings.\n`);
})().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
