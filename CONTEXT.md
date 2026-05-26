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
A single concept or idea from the book that the agent teaches in one exchange. The agent reads the source, explains the concept briefly, then immediately checks understanding — either with a question or by inviting the user to respond. Chunk size is dynamic: the agent reads ahead, identifies natural concept boundaries, and teaches one concept at a time.
_Avoid_: Multi-paragraph explanations, dumping a whole section

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

> **User:** "I don't want to read the book myself. Teach me Chapter 3 of DDIA."
> **Agent:** "Let me scan the chapter first. *[reads book source]* OK, Chapter 3 covers storage engines — B-Trees and LSM-Trees. Let me walk you through this interactively..."

## Flagged ambiguities

- "Just teach me the topic" — resolved: teaching requires a book source, not free-form agent knowledge
- "Don't make me read" — resolved: in Tutor Mode, the agent reads the book and teaches; the user does not read independently
- "Summarize this chapter" — resolved: Tutor Mode replaces summaries with interactive teaching; never a summary dump
