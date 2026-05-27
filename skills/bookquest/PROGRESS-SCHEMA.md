# PROGRESS-SCHEMA.md — BookQuest Progress File

## File Location

- **Global**: `~/.pi/book-progress/<book-slug>.json`
- **Per-project**: `<project>/.bookquest/<book-slug>.json`

The user chooses during reconnaissance. Default to global.

## Multi-Book Registry

A single `registry.json` in the progress directory tracks all active books:

```json
{
  "books": [
    {
      "slug": "ddia",
      "title": "Designing Data-Intensive Applications",
      "source": "/path/to/ddia.pdf",
      "global": true,
      "addedAt": "2026-05-26T10:00:00Z",
      "lastActiveAt": "2026-05-27T14:30:00Z"
    },
    {
      "slug": "clean-code",
      "title": "Clean Code",
      "source": "/path/to/clean-code.pdf",
      "global": true,
      "addedAt": "2026-05-25T09:00:00Z",
      "lastActiveAt": "2026-05-27T14:30:00Z"
    }
  ],
  "globalStats": {
    "totalXp": 700,
    "level": 3,
    "streak": { "current": 5, "longest": 5, "lastSessionDate": "2026-05-27" }
  }
}
```

The registry enables the dashboard view and cross-book features. Each book still has its own progress file for chapter-level detail.

### Registry Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "BookQuest Registry",
  "type": "object",
  "required": ["books", "globalStats"],
  "properties": {
    "books": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["slug", "title", "source", "addedAt", "lastActiveAt"],
        "properties": {
          "slug": { "type": "string", "description": "URL-safe identifier" },
          "title": { "type": "string" },
          "source": { "type": "string", "description": "File path or URL" },
          "global": { "type": "boolean", "description": "True if stored in global dir, false if per-project" },
          "addedAt": { "type": "string", "format": "date-time" },
          "lastActiveAt": { "type": "string", "format": "date-time" }
        }
      }
    },
    "globalStats": {
      "type": "object",
      "required": ["totalXp", "level", "streak"],
      "properties": {
        "totalXp": { "type": "integer", "minimum": 0 },
        "level": { "type": "integer", "minimum": 1 },
        "streak": {
          "type": "object",
          "properties": {
            "current": { "type": "integer", "minimum": 0 },
            "longest": { "type": "integer", "minimum": 0 },
            "lastSessionDate": { "type": "string", "format": "date" }
          }
        }
      }
    }
  }
}
```

### Per-Book Progress Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "BookQuest Progress",
  "type": "object",
  "required": ["book", "progress", "gamification", "knowledgeGraph"],
  "properties": {
    "book": {
      "type": "object",
      "required": ["title", "source", "slug"],
      "properties": {
        "title": { "type": "string" },
        "source": { "type": "string", "description": "File path or URL" },
        "slug": { "type": "string", "description": "URL-safe identifier" },
        "author": { "type": "string" },
        "totalChapters": { "type": "integer" },
        "dateStarted": { "type": "string", "format": "date" },
        "dateCompleted": { "type": "string", "format": "date" },
        "defaultMode": { "type": "string", "enum": ["independent", "tutor"], "description": "Default mode for chapters. User overrides per chapter." }
      }
    },
    "progress": {
      "type": "object",
      "required": ["currentChapter", "completedChapters", "skillTree"],
      "properties": {
        "currentChapter": { "type": "integer" },
        "completedChapters": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["chapter", "title", "completedAt"],
            "properties": {
              "chapter": { "type": "integer" },
              "title": { "type": "string" },
              "completedAt": { "type": "string", "format": "date-time" },
              "quizScore": { "type": "number", "minimum": 0, "maximum": 1 },
              "challengeCompleted": { "type": "boolean" },
              "xpEarned": { "type": "integer" },
              "mode": { "type": "string", "enum": ["independent", "tutor"], "description": "Which mode was used for this chapter" }
            }
          }
        },
        "skillTree": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["id", "name", "status"],
            "properties": {
              "id": { "type": "string" },
              "name": { "type": "string" },
              "chapters": { "type": "array", "items": { "type": "integer" } },
              "status": { "type": "string", "enum": ["locked", "unlocked", "in_progress", "complete"] },
              "isBossFight": { "type": "boolean" },
              "bossFightPassed": { "type": "boolean" }
            }
          }
        }
      }
    },
    "gamification": {
      "type": "object",
      "required": ["xp", "level", "achievements", "sessions"],
      "properties": {
        "xp": { "type": "integer", "minimum": 0 },
        "level": { "type": "integer", "minimum": 1 },
        "achievements": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["id", "name", "unlockedAt"],
            "properties": {
              "id": { "type": "string" },
              "name": { "type": "string" },
              "description": { "type": "string" },
              "icon": { "type": "string" },
              "unlockedAt": { "type": "string", "format": "date-time" }
            }
          }
        },
        "sessions": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["date", "xpEarned"],
            "properties": {
              "date": { "type": "string", "format": "date" },
              "xpEarned": { "type": "integer" },
              "chaptersCovered": { "type": "array", "items": { "type": "integer" } },
              "duration": { "type": "integer", "description": "Minutes" }
            }
          }
        }
      }
    },
    "knowledgeGraph": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["concept", "chapter", "confidence"],
        "properties": {
          "concept": { "type": "string" },
          "chapter": { "type": "integer" },
          "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
          "connections": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["to", "chapter", "type"],
              "properties": {
                "to": { "type": "string" },
                "chapter": { "type": "integer" },
                "type": {
                  "type": "string",
                  "enum": ["extends", "contrasts", "composes", "evolves", "applies", "enables", "requires", "specialization"]
                }
              }
            }
          }
        }
      }
    }
  }
}
```

## Example Progress File

```json
{
  "book": {
    "title": "Designing Data-Intensive Applications",
    "source": "/Users/me/books/DDIA.pdf",
    "slug": "ddia",
    "author": "Martin Kleppmann",
    "totalChapters": 12,
    "dateStarted": "2026-05-26",
    "defaultMode": "independent"
  },
  "progress": {
    "currentChapter": 4,
    "completedChapters": [
      {
        "chapter": 1,
        "title": "Reliable, Scalable, Maintainable Applications",
        "completedAt": "2026-05-26T10:30:00Z",
        "quizScore": 0.85,
        "challengeCompleted": true,
        "xpEarned": 65,
        "mode": "independent"
      },
      {
        "chapter": 2,
        "title": "Data Models and Query Languages",
        "completedAt": "2026-05-26T14:00:00Z",
        "quizScore": 0.72,
        "challengeCompleted": true,
        "xpEarned": 55,
        "mode": "independent"
      },
      {
        "chapter": 3,
        "title": "Storage and Retrieval",
        "completedAt": "2026-05-27T09:00:00Z",
        "quizScore": 0.90,
        "challengeCompleted": true,
        "xpEarned": 70,
        "mode": "independent"
      }
    ],
    "skillTree": [
      {
        "id": "foundations",
        "name": "Foundations",
        "chapters": [1, 2, 3],
        "status": "complete",
        "isBossFight": false
      },
      {
        "id": "foundations-boss",
        "name": "Foundations Boss Fight",
        "chapters": [1, 2, 3],
        "status": "complete",
        "isBossFight": true,
        "bossFightPassed": true
      },
      {
        "id": "data-models",
        "name": "Data Models & Storage",
        "chapters": [4, 5, 6],
        "status": "in_progress",
        "isBossFight": false
      },
      {
        "id": "distributed",
        "name": "Distributed Systems",
        "chapters": [7, 8, 9],
        "status": "locked",
        "isBossFight": false
      }
    ]
  },
  "gamification": {
    "xp": 290,
    "level": 2,
    "achievements": [
      {
        "id": "first-chapter",
        "name": "First Steps",
        "description": "Complete your first chapter",
        "icon": "🎯",
        "unlockedAt": "2026-05-26T10:30:00Z"
      },
      {
        "id": "perfect-quiz",
        "name": "Perfectionist",
        "description": "Score 100% on a checkpoint quiz",
        "icon": "🎯",
        "unlockedAt": "2026-05-27T09:00:00Z"
      }
    ],
    "sessions": [
      {
        "date": "2026-05-26",
        "xpEarned": 120,
        "chaptersCovered": [1, 2],
        "duration": 90
      },
      {
        "date": "2026-05-27",
        "xpEarned": 70,
        "chaptersCovered": [3],
        "duration": 45
      }
    ]
  },
  "knowledgeGraph": [
    {
      "concept": "Reliability",
      "chapter": 1,
      "confidence": 0.85,
      "connections": [
        {"to": "Replication", "chapter": 4, "type": "requires"},
        {"to": "Fault Tolerance", "chapter": 1, "type": "composes"}
      ]
    },
    {
      "concept": "Relational Model",
      "chapter": 2,
      "confidence": 0.72,
      "connections": [
        {"to": "Document Model", "chapter": 2, "type": "contrasts"},
        {"to": "Query Languages", "chapter": 2, "type": "enables"}
      ]
    },
    {
      "concept": "B-Trees",
      "chapter": 3,
      "confidence": 0.90,
      "connections": [
        {"to": "LSM-Trees", "chapter": 3, "type": "contrasts"},
        {"to": "Storage Engines", "chapter": 4, "type": "applies"}
      ]
    }
  ]
}
```

## Agent-Agnostic Design Notes

- All fields use standard JSON types — no special encoding.
- Dates use ISO 8601 format.
- The file is append-only for `sessions` and `achievements` — never remove entries.
- Any agent can read this file to continue a BookQuest session.
- Confidence values (0-1) are derived from quiz scores and challenge performance.
- Levels are computed from XP using `scripts/level-calc.js`. The agent MUST use this script — never calculate manually.
