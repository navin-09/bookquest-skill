# CHALLENGES.md — Interactive Challenge Types for BookQuest

## Challenge Selection Guide

Pick the challenge type based on the chapter's topic:

| Topic Type | Best Challenge |
|------------|---------------|
| Algorithm / Data Structure | Code tracing or implementation |
| System Design / Architecture | Design scenario |
| Protocol / Networking | Diagram or step-by-step walkthrough |
| Database / Storage | Schema design or query optimization |
| Coding Pattern / Idiom | Refactor or write from scratch |
| Theory / Concept | Analogy creation or real-world mapping |
| Tool / Framework | Mini hands-on task |
| **Any (best for engagement)** | **Teach a Persona** (see type 9) |

## Challenge Types

### 1. Code Tracing
*"Trace through this algorithm with input [X]. What's the state at each step?"*

Provide a code snippet from the chapter. User traces execution manually. Award XP for correct step-by-step walkthrough.

### 2. Implement From Description
*"The chapter described [algorithm/data structure] in words. Now implement it from memory — don't peek."*

User codes without looking. Then compare with the book's version.

### 3. Design Scenario
*"You need to build [system] with requirements [A, B, C]. Using concepts from this chapter, sketch your approach. What trade-offs are you making?"*

User describes their design. Challenge them on decisions.

### 4. Bug Hunt
*"Here's a code snippet that uses [concept from chapter] but has 3 bugs. Find them."*

Provide broken code. User identifies and fixes.

### 5. Analogy Builder
*"Explain [technical concept] using only analogies from everyday life. Make it so a 10-year-old could understand."*

Tests deep understanding through metaphor.

### 6. Compare & Contrast
*"The chapter covers [A] and [B]. Create a table comparing them: when to use which, trade-offs, and an example where each shines."*

### 7. Diagram Challenge
*"Draw (describe in text) the architecture of [system from chapter]. Label all components and data flows."*

### 8. Real-World Mapping
*"The chapter describes [abstract concept]. Find a real-world system that uses it. How does the real system map to the chapter's description?"*

### 9. Teach a Persona (NEW — best for unfamiliar concepts)
*"You need to teach [concept] to [persona]. What do you say? What questions would they ask? How do you handle their confusion?"*

**How it works:**
1. Assign a persona (see the [Explain-to-Persona templates in TEACHING.md](./TEACHING.md#explain-to-persona-templates))
2. The user teaches the concept to that persona
3. The agent roleplays the persona, asking follow-up questions from that persona's perspective
4. The user must adapt their explanation on the fly

**Persona roleplay examples:**
- **As a 10-year-old:** *"But why can't you just use one big list? Isn't that simpler?"*
- **As a grandma:** *"So it's like knitting? What happens if you drop a stitch?"*
- **As a PM:** *"How many engineering weeks does this save us?"*
- **As a junior dev:** *"What's the most common mistake people make with this?"*

**Scoring:**
- +20 XP if the user successfully teaches the persona (persona stops asking questions)
- +30 XP if the user handles 3+ follow-up questions from the persona
- Partial: +10 XP if the persona has to ask for clarification more than once

### 10. Find the Fun (NEW — tests creativity + understanding)
*"The book explains [concept] using [book's example]. Invent a BETTER analogy from everyday life. Your analogy should be more memorable than the book's."*

**Why this matters:** Creating a new analogy forces the user to understand the concept deeply enough to find novel parallels. It also builds the Fun Examples Registry organically.

**Scoring:**
- +20 XP for any valid analogy
- +30 XP if the analogy is notably creative or memorable
- +10 XP bonus if the user can say where their analogy breaks (identifying the mismatch between analogy and reality)

## Challenge Difficulty Scaling

| Chapter Position | Difficulty |
|-----------------|------------|
| Chapters 1-3 (early) | Types 1, 5, 7, 9 — simpler, more guided |
| Chapters 4-7 (middle) | Types 2, 3, 6, 10 — moderate, require synthesis |
| Chapters 8+ (advanced) | Types 3, 4, 8, 9 — complex, require deep understanding |
| Boss Fights | Combination of all types across all chapters in section |

## Scoring Challenges

- **Complete** (correct + complete): +20 XP, unlock next chapter
- **Partial** (correct but incomplete): +10 XP, give hint, allow retry
- **Incorrect**: +0 XP, ask guiding questions, retry with support
- **Exceptional** (elegant or creative): +30 XP, award special achievement

## Daily Challenge (🌅)

The extension picks one challenge per day from a rotating pool and injects it into
the system prompt. It's a bonus objective that adds FOMO + variety.

**How it works:**
- One challenge is auto-generated each day (based on a concept from the knowledge graph)
- It appears at session start under `🌅 Daily Challenge`
- Types can be: explain-to-persona, concept-connection, real-world mapping, analogy-invent, teach-back-mini
- Completing it awards +15-20 bonus XP on top of normal session rewards
- It resets daily — missed challenges are gone forever

**Your role:**
- Present the challenge as a bonus objective, not a mandatory task
- *"🌅 Daily Challenge: [prompt] — worth +N bonus XP if you get it this session!"*
- Track whether the user completed it; if so, note it for the session summary
- The challenge is designed to feel like a side quest — low pressure, high reward
