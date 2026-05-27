---
name: bookquest
description: >
  ⚠️ MOVED — BookQuest is now a hybrid skill+extension pi package.
  Install via: pi install git:github.com/<user>/bookquest-skill
  The skill is at skills/bookquest/SKILL.md.
  The extension is at extensions/bookquest.ts.
trigger: commands: ["/bookquest"]
---

# BookQuest — ⚠️ Restructured

This file is kept for backward compatibility. BookQuest is now a
**pi package** with a hybrid architecture:

| Component | Location | Purpose |
|-----------|----------|---------|
| Extension | `extensions/bookquest.ts` | Enforces hard rules (code, can't be ignored) |
| Skill | `skills/bookquest/SKILL.md` | Teaching & behavioral guidance |
| Teaching | `skills/bookquest/TEACHING.md` | Socratic method guide |
| Challenges | `skills/bookquest/CHALLENGES.md` | Challenge types |
| Schema | `skills/bookquest/PROGRESS-SCHEMA.md` | Progress file schema |

## If you're using pi

Install as a pi package:

```bash
pi install git:github.com/<your-username>/bookquest-skill
pi config   # Enable extension + skill
```

Then:

```
pi
/bookquest
```

## If you're using another agent

Copy the `skills/bookquest/` directory to your agent's skills folder:

```bash
cp -r skills/bookquest ~/.agents/skills/bookquest
```

The skill works standalone (without the extension) but hard rules like
auto-save and level validation won't be enforced — the LLM must follow
them from the instructions.
