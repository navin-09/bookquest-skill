# Familiarity states are inferred from user behavior, not self-declared

When a user encounters an unfamiliar concept in a tech book, they lose interest and start skimming. The skill needed a way to detect what the user already knows so it can skip unnecessary analogies (for familiar concepts) while never missing one for unfamiliar concepts. The fix: a 3-state familiarity model (`unknown`, `familiar`, `overconfident`) derived from user behavior (skip commands + quiz performance) rather than explicit self-declaration forms. Originally 5 states but simplified after review — `reinforced` and `family-known` created ambiguous confidence gaps (0.5–0.69 with no defined behavior) and required taxonomic logic the LLM couldn't reliably execute.

## Status

accepted

## Considered Options

- **Pre-chapter declaration form** — At chapter start, show a concept list and ask the user to check off what they know. Rejected because it adds friction to the reading flow. The user wants to read, not fill out a form. Also unreliable — users may over or underestimate their knowledge.

- **Cold start default for everything** — Assume everything is unfamiliar forever. Rejected because it wastes time. A backend engineer reading a distributed systems book doesn't need the kitchen analogy for B-Trees. Every unnecessary analogy risks patronization and disengagement.

- **Trust-but-verify with 5 behavioral states** (original) — `unknown`, `familiar`, `overconfident`, `reinforced`, `family-known`. Simplified to 3 states after review: `reinforced` was behaviorally identical to `familiar` (dead state), and `family-known` required a sibling-concept taxonomy that didn't exist in the schema.

- **Trust-but-verify with 3 behavioral states** (chosen) — Default to `unknown` on cold start (safe bet). When the user says "skip" or "I know this," immediately believe them and skip the analogy (tiebreaker rule: user's claim always wins). BUT verify by checking quiz performance afterwards:
  - Aces quiz → permanently marks as `familiar` (analogy skipped next time)
  - Fails quiz → corrects: "you knew the gist but missed [edge case]" → drops related concepts to `unknown`

## Consequences

- The knowledge graph's `confidence` field maps simply: `< 0.5` = unknown, `≥ 0.7` = familiar. No schema changes needed.
- `overconfident` state is transient: if the user fails a quiz after claiming familiarity, the concept drops back to `unknown` for re-teaching. There's no permanent "overconfident" tag, avoiding schema bloat.
- No family-level detection. The agent treats each concept independently. If a user knows B-Trees, that doesn't automatically speed up LSM-Trees — but if they ace both, both become `familiar` independently.
- The system gets faster over time without user effort. First session: full treatment. Session 5: the agent knows the user's level from past quiz data.
- Tiebreaker rule: user's "I know this" claim always wins immediately. The quiz is the verification, not the gate.
- Risk: if the user says "skip" but never gets quizzed (e.g., session interrupted mid-chapter), default the concept back to `unknown` for next session.
