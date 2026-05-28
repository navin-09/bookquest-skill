# 📚 BookQuest

**Turn any tech book into a video game.** XP, levels, streaks, skill trees, boss fights, and Socratic teaching — so you actually finish what you start.

## What's New in v2.1 — Habit-Forming Gamification Engine

BookQuest v2.1 adds a **behavioral gamification engine** that turns reading into a genuinely addictive loop:

- 🔥 **Answer Streak Combos** — Chain correct answers for 1.5x, 2x, even 3x XP multipliers. Momentum builds with every correct answer.
- 💥 **Variable Rewards** — Random critical hits (20% chance), rare insights (5%), and legendary finds (1%) keep each answer exciting.
- 🎁 **Mystery Boxes** — 15% chance per correct answer to unlock a flat XP bonus (5-25 XP).
- 🛡️ **Streak Shields** — Earn shields from boss fights. They auto-consume to protect your daily streak if you miss a day.
- 🌅 **Daily Challenges** — One bonus challenge per day with a rotating prompt. Miss it = gone forever.
- 👑 **Infinite Prestige** — Beyond Level 8, infinite Mastery levels with scaling XP requirements. There's always another level.
- 🎉 **Level-Up Splashes** — ASCII art celebration on every level-up.

## What's New in v2

BookQuest v2 uses a **hybrid architecture**:

- **Extension** (`extensions/bookquest.ts`) — enforces hard rules programmatically. The LLM **cannot** drift from these rules because they're enforced by code, not instructions.
- **Skill** (`skills/bookquest/SKILL.md`) — handles the conversational teaching, Socratic questioning, quiz generation, and tutoring flow.

This means:
- ✅ Progress is **always** saved (auto-save on every turn)
- ✅ Level calculations are **always** validated (extension runs `level-calc.js` and corrects errors)
- ✅ Skill tree is **always** displayed (injected into system prompt every turn)
- ✅ Summarization attempts are blocked in independent-reading mode
- ✅ State persists across session reloads and resumes

## Why BookQuest?

Tech books are hard to finish. Novels keep you hooked with cliffhangers. Tech books? Chapter 7 feels like a wall. BookQuest fixes that:

- 🎮 **Gamification** — XP, levels, achievements, streaks. Your reading has a score.
- 🧠 **Socratic Teaching** — The skill never just summarizes. It asks, challenges, and guides.
- 🔗 **Inter-Chapter Connections** — Every chapter links to prior ones. Knowledge sticks like a novel's plot.
- ⚔️ **Boss Fights** — End-of-section mastery challenges. Prove you know it.
- 📊 **Progress Tracking** — Agent-agnostic JSON progress file. Switch agents, keep your progress.
- 🚫 **No Summaries** — The skill never dumps summaries. In independent mode, you read and the agent quizzes. In Tutor Mode, the agent teaches you interactively. Either way, no passive text dumps.

## Quick Start (pi)

### Install as a pi package (recommended)

```bash
pi install git:github.com/navin-09/bookquest-skill
pi config   # Opens TUI — enable "bookquest" extension + "bookquest" skill
```

Then start a session:

```
pi
/bookquest
```

### Manual install

```bash
git clone https://github.com/navin-09/bookquest-skill.git ~/.pi/agent/bookquest-skill

# Symlink the extension
mkdir -p ~/.pi/agent/extensions
ln -s ~/.pi/agent/bookquest-skill/extensions/bookquest.ts ~/.pi/agent/extensions/bookquest.ts

# Symlink the skill
mkdir -p ~/.pi/agent/skills
ln -s ~/.pi/agent/bookquest-skill/skills/bookquest ~/.pi/agent/skills/bookquest
```

### For other agents (Claude Code, OpenClaw, Hermes)

If your agent supports the [agent skills standard](https://agentskills.io):

```bash
# Clone and symlink just the skill
git clone https://github.com/navin-09/bookquest-skill.git
cp -r bookquest-skill/skills/bookquest ~/.agents/skills/bookquest
```

> **Note:** Only pi supports the extension (hard rule enforcement). Other agents get the skill without the enforcement layer.

## How It Works

```
/bookquest ──────────────────────────────────────────────────────►
  │
  ├─ Phase 1: Reconnaissance (first time)
  │    Skill scans your book, builds a skill tree, sets up tracking.
  │    Extension registers the book + validates progress files.
  │
  ├─ You choose a mode:
  │    ├─ Independent-Reading: You read, the agent quizzes you.
  │    └─ Tutor Mode: The agent reads the book and teaches you.
  │
  ├─ Phase 2: Reading Loop (every session)
  │    ├─ Extension injects skill tree + rules reminder
  │    ├─ Skill handles: Socratic, quiz, challenge, tutoring
  │    └─ Extension auto-saves progress on every turn
  │
  ├─ Phase 3: Boss Fights (end of sections)
  │    Comprehensive quiz + teach-back + real-world scenario.
  │    Extension validates level after XP award.
  │
  └─ /bookquest (exit)
       Extension triggers deactivation summary.
```

## Architecture

```
bookquest-skill/
├── extensions/
│   └── bookquest.ts          # 🆕 Enforcer extension (code, can't be ignored)
├── skills/
│   └── bookquest/
│       ├── SKILL.md           # Trimmed — teaching & behavioral guidance
│       ├── TEACHING.md        # Socratic method guide
│       ├── CHALLENGES.md      # Challenge types and examples
│       └── PROGRESS-SCHEMA.md # Progress file schema + registry schema
├── scripts/
│   ├── init-progress.js       # Progress file + registry initializer
│   └── level-calc.js          # XP → level calculator
├── package.json               # pi package manifest
├── README.md
└── LICENSE
```

## What the Extension Enforces

| Rule | How |
|------|-----|
| Auto-save after every turn | `agent_end` handler — writes progress file |
| Validate level calculations | Intercepts writes, runs `level-calc.js`, corrects errors |
| Inject skill tree every turn | `before_agent_start` handler — appends tree to system prompt |
| Inject gamification state every turn | Injects combo, crits, mystery boxes, streak shields, daily challenges |
| State persistence across sessions | Saves state to session entries periodically |
| `/bookquest` command | Registered command — toggle, add, switch, list books |
| Answer Streak Combo tracking | Rolls combo count + multiplier on correct answers, resets on wrong |
| Variable Rewards (crits, boxes) | Pre-rolls 20%/5%/1% crit chances + 15% mystery box chance |
| Streak Shield consumption | Auto-consumes shields when 2+ day gap detected |
| Level-Up Splash | Generates ASCII art celebration on level change |

## What the Skill Handles

- Socratic questioning methodology
- Quiz generation and challenge design
- Tutor Mode guided tour teaching flow
- Boss fight mechanics and scoring
- Cross-book connections and knowledge graph
- XP awarding rules (when to award what)

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
| 9+ | Scaling (3000 × 1.4^(n-8)) | 👑 Grandmaster Reader · Mastery N |

> **Infinite progression:** After Level 8, Mastery levels scale indefinitely. There's always another level.

### XP Multipliers
| Mechanic | Effect |
|----------|--------|
| 3+ correct streak | 1.5x on all XP |
| 5+ correct streak | 2x on all XP |
| 10+ correct streak | 3x on all XP |
| 💥 Critical Hit (20%) | 2x (stacks with combo) |
| 🌟 Rare Insight (5%) | 3x (stacks with combo) |
| 🎆 Legendary Insight (1%) | 5x (stacks with combo) |
| 🎁 Mystery Box (15%) | Flat +5-25 bonus XP |

### Daily Challenge
One challenge per day with rotating types (explain-to-persona, concept-connection, real-world mapping, analogy-invent). Awards +15-20 bonus XP. Missed challenges are gone forever.

### Streak Shields
Earn 1 shield per boss fight pass. Shields auto-consume to protect your streak if you miss a day.

### Achievements

- 🔥 **On Fire** — 7-day streak
- 💎 **Diamond Mind** — 30-day streak
- ⚔️ **Boss Slayer** — First boss fight passed
- 🧠 **Deep Thinker** — 50 Socratic questions answered correctly
- 📚 **Bookworm** — Complete an entire book
- 🎯 **Perfectionist** — Score 100% on a checkpoint quiz
- 🔥🔥 **Combo King** — Reach a 10x answer streak
- 💥 **Lucky Strike** — Trigger a Critical Hit
- 🌟 **Rare Find** — Trigger a Rare Insight
- 🎆 **Legendary** — Trigger a Legendary Insight (1% chance!)
- 🎁 **Jackpot** — Open 5 Mystery Boxes
- 🛡️ **Unbreakable** — Save your streak with a Streak Shield
- 🌅 **Daily Grinder** — Complete 7 Daily Challenges
- 👑 **Prestige** — Reach Mastery Level 5
- 🚀 **Speed Reader** — Complete 3 chapters in one session
- 🔗 **Connector** — 20 inter-chapter connections made
- 🔗 **Bridge Builder** — Successfully re-explain 10 concepts to a different persona
- 🐣 **Rubber Duck** — Explain a single concept to 3 different personas back-to-back

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
- Cross-book concept links appear naturally

## Works With

| Agent | Extension (hard rules) | Skill (teaching) |
|-------|----------------------|-------------------|
| ✅ **pi** (`@earendil-works/pi-coding-agent`) | ✅ Full enforcement | ✅ Full guidance |
| ✅ **Claude Code** | ❌ Not supported | ✅ Skill works |
| ✅ **OpenClaw** | ❌ Not supported | ✅ Skill works |
| ✅ **Hermes** | ❌ Not supported | ✅ Skill works |

## Progress File

Progress is stored as **agent-agnostic JSON**:

- Global: `~/.pi/book-progress/<book-slug>.json`
- Per-project: `.bookquest/<book-slug>.json`

The file tracks: chapters completed, XP, level, achievements, skill tree state, and a knowledge graph of concepts + connections. Any agent that supports BookQuest can read/write it.

## Publish to npm

To share on npm:

```bash
# Set up your npm account
npm login

# Publish
npm publish
```

Users can then install with:

```bash
pi install npm:bookquest-skill
```

Or from GitHub:

```bash
pi install git:github.com/navin-09/bookquest-skill
```

## License

MIT
