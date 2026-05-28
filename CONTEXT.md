# BookQuest — Domain Glossary

A gamified interactive reading companion. The book is the curriculum; the agent teaches through dialogue.

## Language

**BookQuest**:
A gamified interactive reading companion. Turns any tech book into a video-game-like quest with XP, levels, streaks, skill trees, boss fights, and Socratic teaching.
_Avoid_: Book summary tool, reading assistant

**Tutor Mode**:
A mode of BookQuest where the agent teaches chapter content interactively — explains concepts, asks questions, and checks understanding as they go — instead of requiring the user to read independently. The agent reads the book source and guides the user through the material.
_Avoid_: Summary mode, lecture mode

**Guided Tour**:
The teaching strategy within Tutor Mode. The agent reads a subsection of the book, then explains/teaches it in small chunks with embedded checkpoints. The user can say "move faster" or "explain that more" to control pacing. The agent never dumps a block of text.
_Avoid_: Firehose teaching, TL;DR

**Teaching Chunk**:
A single concept or idea from the book that the agent teaches in one exchange. The agent reads the source, explains the concept briefly (2-3 sentences max), then immediately checks understanding — either with a question or by inviting the user to respond. Chunk size is dynamic: the agent reads ahead, identifies natural concept boundaries as private preparation, and teaches one concept at a time.
_Avoid_: Multi-paragraph explanations, dumping a whole section

**Concept Roadmap**:
A prohibited pattern in Tutor Mode where the agent lists or previews all concept chunks of a chapter before teaching any of them. This is a form of summarization: it tells the user what they're about to learn instead of letting them discover each concept through the Guided Tour. The agent's concept-boundary map is private preparation only.
_Avoid_: Chapter outline, concept preview, table of contents for the chapter

**Private Preparation**:
Work the agent does during the Guided Tour Setup that is never shown to the user: reading the chapter, identifying concept boundaries, mapping page ranges. The user should never see this work — they interact with one concept at a time as the agent teaches.

**Book Source**:
A file path or URL to a technical book. Serves as the curriculum. The agent's teaching is constrained to this content to prevent hallucination. Primary format is PDF; the agent should extract text from relevant pages during the teaching session.
_Avoid_: Just the topic name, free-form knowledge

**Reading Mission**:
A focused task given to the user before reading — specific questions to answer while reading. Used only in the independent-reading flow (not Tutor Mode). Replaced by guided teaching in Tutor Mode.

**Engagement Bridge**:
The system of techniques for keeping the user hooked when encountering unfamiliar cognitive concepts. Core principle: analogy-first, always. Every unfamiliar concept starts with a fun, relatable analogy before any technical explanation.
_Avoid_: Jargon-first teaching, assuming the user will just "push through"

**Analogy-First Teaching**:
The mandatory starting point for any unfamiliar concept. The agent leads with an everyday analogy (Layer 1 of the Layered Understanding Model), bridges to the technical term (Layer 3), then proceeds to Socratic questioning. The analogy is the hook; the technical term is the payout.
_Avoid_: Explaining the technical term first, skipping the analogy

**Layered Understanding Model**:
A 4-layer teaching progression for unfamiliar concepts: Layer 1 (pure analogy, like for a 10-year-old) → Layer 2 (real-world grounding) → Layer 3 (technical term introduction) → Layer 4 (deep technical details). The agent always starts at Layer 1, always includes Layer 3, and lets the user's response determine if Layers 2 or 4 are needed.

**Evolving Analogy**:
A single base analogy extended across multiple sub-chunks of a compound concept (e.g., Raft consensus). The base analogy is taught in chunk 1, then referred back to and extended in subsequent chunks — like scenes in a single story rather than separate movies. Contrast with Fun Examples Registry entries, which are single-concept analogies.
_Avoid_: Using evolving analogies for simple concepts (B-Trees don't need one); switching to a completely different analogy mid-compound-concept

**Fun Examples Registry**:
A curated set of go-to analogies for 15+ concept families (databases, networking, caching, distributed systems, concurrency, etc.). Each analogy maps a universal everyday experience (kitchen, postal service, bathroom, rumor in a friend group) to a technical concept. The registry is the first place the agent looks when introducing an unfamiliar concept.
_Avoid_: Inventing weak analogies on the spot; using the same analogy for multiple concepts

**Explain-to-Persona Checkpoint**:
A checkpoint that asks the user to re-explain the concept to a specific persona (10-year-old, grandma, product manager, junior dev). **Mandatory for unfamiliar concepts**, optional for familiar ones. Tests whether understanding is deep enough to adapt to different audiences. Awards +10 XP (double a normal checkpoint). The agent always teaches with universal analogies first; persona-specific re-explanation is the validation step, not the teaching step.
_Avoid_: Only using "does that make sense?" as a check; crafting persona-specific analogies during teaching (keep teaching universal, validate with persona)

**Engagement Signals**:
Behavioral indicators that the user is losing interest or skimming: short answers ("yeah", "ok"), vague summaries ("something about databases"), fast-track requests ("just tell me"), long silences. When detected, the agent must stop, switch to analogy-first, and re-teach from Layer 1.

**Note:** "Faster" / "Speed up" is a user control command, not an engagement signal. It is context-aware: for familiar concepts it skips the detailed check; for unfamiliar concepts it simplifies the persona check to the minimum (kid persona, 10 seconds, no follow-ups, no XP).
_Avoid_: Pushing forward despite skimming signals; treating "Faster" the same as "just tell me"

**I'm Lost Protocol**:
A 5-step recovery procedure when the user gets stuck: (1) PAUSE the flow, (2) REWIND to the last anchor of understanding, (3) REBUILD with a fresh analogy, (4) CHECK step by step, (5) RESET knowledge graph confidence. Applies to both tutor and independent modes.

**Teach-Back (Enhanced)**:
In Boss Fights, the user must explain the same topic to multiple personas (kid, PM, junior dev). Succeeding at 2 out of 3 persona versions earns +30 XP bonus. This is the ultimate test of whether the user can teach anyone.

**Familiarity State**:
A per-concept tag in the knowledge graph that tracks how well the user knows a concept. Three states: `unknown` (cold start, default — analogy mandatory), `familiar` (user said skip + aced quiz — skip analogy next time), `overconfident` (user said skip but failed quiz — drop related concepts to unknown). Determines whether the agent uses analogy-first or skips to recap.
_Avoid_: Asking the user to fill out a "what do you know" form; treating all concepts as equally unknown

**Cold Start Default**:
The default assumption on first session: every concept is `unknown`. Analogy-first is mandatory. The agent adjusts based on the user's behavior (skip commands + quiz performance), not self-declarations.

**Visual-First Teaching**:
The rule that every concept chunk must include a diagram before any verbal explanation. The diagram IS the visual form of the analogy — titled with the analogy name (not the technical term). The technical term goes inside the diagram as a label. Flow: diagram (analogy title) → verbal analogy bridge → introduce technical term → persona check. The agent first checks if the book source has a relevant figure; if not, uses `render_diagram` tool.
_Avoid_: Writing paragraphs first and adding a diagram at the end; titling the diagram with the technical term (defeats analogy-first)

**render_diagram Tool**:
A custom tool registered by the BookQuest extension. Generates properly-aligned Unicode box-drawing diagrams capped at 78 columns for terminal fit. Supports three types: flow (PREFERRED — simple inline steps), hierarchy (trees), comparison (trade-offs — use sparingly). Widths are proportionally capped so diagrams never overflow the terminal.
_Avoid_: Comparison tables for simple concepts; diagrams wider than 78 columns; hand-crafted ASCII diagrams (alignment is unreliable)

**Different Lens (🪟)**:
An optional one-sentence alternative perspective on a concept offered after the user responds to a checkpoint. Gives a different angle — industrial vs startup use, historical evolution, real-world trade-off between two implementations. Marked with 🪟. Keeps the user hooked by showing the concept isn't a one-dimensional fact.
_Avoid_: Forcing a lens for every chunk; elaborating unprompted beyond one sentence

**"Got the analogy, give me the real thing"**:
A user control command that skips Layers 2-3 of the Layered Understanding Model and jumps straight to Layer 4 (deep technical details). Still requires the persona check after Layer 4. Gives engaged users a fast lane to depth without forcing them through intermediate steps.
_Avoid_: Using before the analogy is given (the analogy IS Layer 1 and cannot be skipped)

## Relationships

- **BookQuest** has two modes: independent-reading mode and **Tutor Mode**
- **Tutor Mode** requires a **Book Source** — the agent cannot teach from its own knowledge
- A **Reading Mission** is the independent-reading equivalent of Tutor Mode's guided teaching
- In Tutor Mode, chapters are unlocked by completing the end-of-chapter quiz + challenge (same as independent mode)
- XP in Tutor Mode is hybrid: micro-XP (+5) per checkpoint engagement during the guided tour, plus full chapter-completion XP from quiz/challenge/boss fight
- Mode is set per-chapter with a per-request escape hatch. Default is chosen during reconnaissance; user overrides per chapter. Progress file records mode per chapter.
- **Analogy-First Teaching** replaces the standard Socratic progression for unfamiliar concepts. Only after the analogy lands does the agent switch to Socratic questioning.
- **Engagement Signals** trigger the **I'm Lost Protocol** which uses **Analogy-First Teaching** from the **Fun Examples Registry**
- **Explain-to-Persona Checkpoints** are the primary validation of **Analogy-First Teaching** — if the user can explain to a 10-year-old, the analogy landed
- **Bridge Builder** achievement unlocks after 10 successful **Explain-to-Persona** explanations

## Example dialogue

> **User:** "Teach me Chapter 3 of DDIA in tutor mode."
> **Agent:** *[reads chapter internally, maps concept boundaries — private preparation]*
> *[displays book's skill tree: shows Ch.3 position in the branch]*
> "I'm going to teach you Chapter 3 section by section. I'll explain each concept, then check you understand before moving on. You can say 'faster' or 'explain more' anytime. Ready?"
> **User:** "Ready."
> **Agent:** *[teaches one concept chunk, checks, waits for response, then moves to next — never shows the full roadmap]*

> **Dev (reporting the anti-pattern):** "The agent scanned Chapter 3 and presented this roadmap: 'We'll cover: 1) declarative query languages, 2) relational vs document models, 3) the object-relational mismatch...' That's a Concept Roadmap — a summary in disguise. The agent should never show this."

## Example dialogue — Analogy-First Teaching

> **Agent:** (detects B-Trees are unfamiliar — not in knowledge graph)
> "Let's start with your kitchen. Imagine you have a pantry. Jars are organized alphabetically. When you need cumin, you go straight to 'C' — you don't rummage through everything. That's a B-Tree (Balanced Tree). It keeps data sorted so the database can find anything in just a few steps."
>
> **User:** "Oh, so it's like an index?"
>
> **Agent:** "Exactly like an index! A B-Tree *is* the index structure. Now — what happens when you add a new jar to an already-full shelf? The shelf splits. That's what a B-Tree does when it grows. Now explain it to me like I'm 10."
>
> **User:** "It's like a really organized bookshelf where every book has a specific spot so you can grab any book super fast."
>
> **Agent:** "Perfect. +10 XP! The book calls that 'self-balancing' — the tree rearranges itself as you add data so searching stays fast. Want to go deeper on how it actually splits?"

## Flagged ambiguities

- "Just teach me the topic" — resolved: teaching requires a book source, not free-form agent knowledge
- "Don't make me read" — resolved: in Tutor Mode, the agent reads the book and teaches; the user does not read independently
- "Summarize this chapter" — resolved: Tutor Mode replaces summaries with interactive teaching; never a summary dump
- "Show me the chapter outline / concept roadmap" — resolved: the concept-boundary map is Private Preparation, never shown. Presenting it is a form of summarization
- "Display skill tree" — resolved: this refers to the book-level branch/chapter tree, not a concept breakdown of the current chapter
- "I don't get this, just tell me the answer" — resolved: use the I'm Lost Protocol, not a summary. Pause, rewind, rebuild with analogy-first
- "Explain it differently" — resolved: switch to analogy-first, pick a fresh analogy from the Fun Examples Registry
- "Can you make this fun?" — resolved: this is the default. Every concept gets an analogy-first introduction. If the user asks for more fun, try a different persona for the explain-to-persona checkpoint
