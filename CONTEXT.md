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

## Relationships

- **BookQuest** has two modes: independent-reading mode and **Tutor Mode**
- **Tutor Mode** requires a **Book Source** — the agent cannot teach from its own knowledge
- A **Reading Mission** is the independent-reading equivalent of Tutor Mode's guided teaching
- In Tutor Mode, chapters are unlocked by completing the end-of-chapter quiz + challenge (same as independent mode)
- XP in Tutor Mode is hybrid: micro-XP (+5) per checkpoint engagement during the guided tour, plus full chapter-completion XP from quiz/challenge/boss fight
- Mode is set per-chapter with a per-request escape hatch. Default is chosen during reconnaissance; user overrides per chapter. Progress file records mode per chapter.

## Example dialogue

> **User:** "Teach me Chapter 3 of DDIA in tutor mode."
> **Agent:** *[reads chapter internally, maps concept boundaries — private preparation]*
> *[displays book's skill tree: shows Ch.3 position in the branch]*
> "I'm going to teach you Chapter 3 section by section. I'll explain each concept, then check you understand before moving on. You can say 'faster' or 'explain more' anytime. Ready?"
> **User:** "Ready."
> **Agent:** *[teaches one concept chunk, checks, waits for response, then moves to next — never shows the full roadmap]*

> **Dev (reporting the anti-pattern):** "The agent scanned Chapter 3 and presented this roadmap: 'We'll cover: 1) declarative query languages, 2) relational vs document models, 3) the object-relational mismatch...' That's a Concept Roadmap — a summary in disguise. The agent should never show this."

## Flagged ambiguities

- "Just teach me the topic" — resolved: teaching requires a book source, not free-form agent knowledge
- "Don't make me read" — resolved: in Tutor Mode, the agent reads the book and teaches; the user does not read independently
- "Summarize this chapter" — resolved: Tutor Mode replaces summaries with interactive teaching; never a summary dump
- "Show me the chapter outline / concept roadmap" — resolved: the concept-boundary map is Private Preparation, never shown. Presenting it is a form of summarization
- "Display skill tree" — resolved: this refers to the book-level branch/chapter tree, not a concept breakdown of the current chapter
