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

## Challenge Difficulty Scaling

| Chapter Position | Difficulty |
|-----------------|------------|
| Chapters 1-3 (early) | Types 1, 5, 7 — simpler, more guided |
| Chapters 4-7 (middle) | Types 2, 3, 6 — moderate, require synthesis |
| Chapters 8+ (advanced) | Types 3, 4, 8 — complex, require deep understanding |
| Boss Fights | Combination of all types across all chapters in section |

## Scoring Challenges

- **Complete** (correct + complete): +20 XP, unlock next chapter
- **Partial** (correct but incomplete): +10 XP, give hint, allow retry
- **Incorrect**: +0 XP, ask guiding questions, retry with support
- **Exceptional** (elegant or creative): +30 XP, award special achievement
