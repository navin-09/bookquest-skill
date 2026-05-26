# 📚 BookQuest Skill

**Turn any tech book into a video game.** XP, levels, streaks, skill trees, boss fights, and Socratic teaching — so you actually finish what you start.

## Why BookQuest?

Tech books are hard to finish. Novels keep you hooked with cliffhangers. Tech books? Chapter 7 feels like a wall. BookQuest fixes that:

- 🎮 **Gamification** — XP, levels, achievements, streaks. Your reading has a score.
- 🧠 **Socratic Teaching** — The skill never just summarizes. It asks, challenges, and guides.
- 🔗 **Inter-Chapter Connections** — Every chapter links to prior ones. Knowledge sticks like a novel's plot.
- ⚔️ **Boss Fights** — End-of-section mastery challenges. Prove you know it.
- 📊 **Progress Tracking** — Agent-agnostic JSON progress file. Switch agents, keep your progress.
- 🚫 **No Summaries** — The skill never dumps summaries. In independent mode, you read and the agent quizzes. In Tutor Mode, the agent teaches you interactively. Either way, no passive text dumps.

## Quick Start

### Install

```bash
npx skills add <your-username>/bookquest-skill
```

Or clone manually:

```bash
git clone https://github.com/<your-username>/bookquest-skill.git
cp -r bookquest-skill ~/.pi/agent/skills/bookquest
```

### Use

```
/bookquest
```

Then provide your book (file path or URL) and start reading. Or say *"teach me Chapter 3"* to switch to **Tutor Mode** — the agent reads the book and teaches you interactively. Type `/bookquest` again to end the session.

## How It Works

```
/bookquest ──────────────────────────────────────────────────────►
  │
  ├─ Phase 1: Reconnaissance (first time)
  │    Skill scans your book, builds a skill tree, sets up tracking.
  │
  ├─ You choose a mode:
  │    ├─ Independent-Reading: You read, the agent quizzes you.
  │    └─ Tutor Mode: The agent reads the book and teaches you.
  │
  ├─ Phase 2: Reading Loop (every session)
  │    ├─ Choose mode per chapter:
  │    │    ├─ 📖 Independent: You read, agent quizzes (steps 2-10 below)
  │    │    └─ 🎓 Tutor: Agent teaches via Guided Tour (replaces steps 6-9)
  │    │
  │    ├─ Steps 2-5 (both modes): Show dashboard, load progress + registry, connection recap
  │    │
  │    ├─ Independent path (steps 6-9):
  │    │    ├─ 6: Reading mission — agent sets questions, you read
  │    │    ├─ 7: You read the chapter
  │    │    ├─ 8: Core Loop:
  │    │    │    ├─ A: Socratic Interrogation
  │    │    │    ├─ B: Checkpoint Quiz
  │    │    │    ├─ C: Interactive Challenge
  │    │    │    └─ D: Knowledge Graph Update
  │    │    └─ 9: Award XP, save progress
  │    │
  │    ├─ Tutor path (replaces steps 6-9):
  │    │    ├─ Guided Tour: agent reads → teaches each concept →
  │    │    │  checks understanding → adapts to your pace
  │    │    ├─ Then: Checkpoint Quiz + Interactive Challenge + Knowledge Graph
  │    │    └─ Award XP (micro-XP + completion)
  │    │
  │    └─ 10 (both): Offer next step
  │
  ├─ Phase 3: Boss Fights (end of sections)
  │    Comprehensive quiz + teach-back + real-world scenario.
  │    Must pass to unlock the next branch.
  │
  └─ /bookquest (exit)
       Save progress + show session summary.
```

## Gamification

### XP & Levels

| Level | XP Required | Title |
|-------|-------------|-------|
| 1 | 0 | 📖 Page Turner |
| 2 | 100 | 📚 Chapter Runner |
| 3 | 300 | 🧠 Concept Cracker |
| 4 | 600 | 🔗 Connection Master |
| 5 | 1000 | ⚔️ Boss Slayer |
| 6 | 1500 | 🏆 Knowledge Knight |
| 7 | 2200 | 🧙 Tech Sage |
| 8 | 3000 | 👑 Grandmaster Reader |

### Achievements

- 🔥 **On Fire** — 7-day streak
- 💎 **Diamond Mind** — 30-day streak
- ⚔️ **Boss Slayer** — First boss fight passed
- 🧠 **Deep Thinker** — 50 Socratic questions answered correctly
- 📚 **Bookworm** — Complete an entire book
- 🎯 **Perfectionist** — Score 100% on a checkpoint quiz
- ...and more

## Scripts

- `scripts/init-progress.js` — Creates progress file + updates `registry.json`
- `scripts/level-calc.js` — Computes level from XP (the agent MUST use this)

## Progress File

Progress is stored as **agent-agnostic JSON**:

- Global: `~/.pi/book-progress/<book-slug>.json`
- Per-project: `.bookquest/<book-slug>.json`

The file tracks: chapters completed, XP, level, achievements, skill tree state, and a knowledge graph of concepts + connections. Any agent that supports BookQuest can read/write it.

## Multi-Book Support

Read as many books as you want simultaneously. Each gets its own progress file, skill tree, and knowledge graph.

```
📚 BookQuest Dashboard

Active Quests:
1. 🔄 DDIA — Ch.4/12 | XP: 290 | 🔥 5-day streak
2. 🔄 Clean Code — Ch.7/17 | XP: 410 | 🔥 5-day streak
3. 🔒 The Rust Book — Ch.1/20 | XP: 0 | Not started

Global XP: 700 | Level: 3 (🧠 Concept Cracker)
```

- `/bookquest` — show dashboard and pick a book
- `/bookquest add` — add a new book
- `/bookquest switch <book>` — jump to another book
- Streaks are **global** — any book keeps the streak alive
- Cross-book concept links appear naturally (e.g., "DDIA's B-Trees connect to Clean Code's data structure chapter")

## Works With

Any agent that supports the agent skills standard:

- ✅ **pi** (`@earendil-works/pi-coding-agent`)
- ✅ **Claude Code**
- ✅ **OpenClaw**
- ✅ **Hermes**
- ✅ Any agent supporting the [open skills standard](https://skills.sh)

## Skill Structure

```
bookquest-skill/
├── SKILL.md              # Main skill instructions
├── TEACHING.md           # Socratic method guide
├── CHALLENGES.md         # Challenge types and examples
├── PROGRESS-SCHEMA.md    # Progress file schema + registry schema
├── scripts/
│   ├── init-progress.js  # Progress file + registry initializer
│   └── level-calc.js    # XP → level calculator
├── package.json
├── README.md
└── LICENSE
```

## Philosophy

**Reading is not passive.** BookQuest is built on three principles:

1. **You do the reading.** The skill never summarizes. Summaries create the illusion of learning.
2. **Knowledge connects.** Every chapter links to prior ones — like plot threads in a novel.
3. **Games motivate.** XP, streaks, achievements, and boss fights tap into the same dopamine loops that make video games addictive.

## License

MIT
