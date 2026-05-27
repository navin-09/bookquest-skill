# Concept roadmaps are private preparation — never shown to the user

During a Tutor Mode session, the agent scanned a chapter, identified concept chunks, and presented the full roadmap of 8 concepts to the user before teaching any of them. This violated the core principle of "teach through dialogue, never dump summaries" — a roadmap is a summary in disguise. The fix: concept-boundary identification is private preparation only; the agent teaches one concept at a time with no preview of what's coming next.

## Status

accepted

## Considered Options

- **Allow a limited roadmap** (e.g., "we'll cover 3 sections") — rejected because any preview summarizes the content, violating the core principle. Even "we'll cover data models, normalization, and graph databases" tells the user what to expect, which is a summary.
- **No guardrails, rely on the existing anti-pattern list** — rejected because the existing rules were technically sufficient but the agent still violated them. The fix needed structural guardrails (explicit "never present the roadmap" language, a prominent warning at the top of the Guided Tour loop) rather than just listing more anti-patterns.
- **Show the chapter's concept tree as interactive navigation** — rejected because it over-engineers the skill and undermines the Socratic philosophy. The user should discover concepts, not navigate them.

## Consequences

- Agents following the skill may initially feel unnatural not previewing the chapter's scope — this is intentional. The discomfort of "teaching blind" forces proper chunk-by-chunk interaction.
- The book-level skill tree (branches/chapters) is still shown at session start. The ban is only on chapter-internal concept roadmaps.
- Future agents reading this ADR will understand that the guardrails exist because of a concrete failure, not over-engineering.
