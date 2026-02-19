---
name: "Remember Facts"
description: "Remember facts about the user across conversations. Use when the user shares personal info like their name, preferences, job, or interests."
---

## Remember Facts

Store and retrieve per-agent key-value facts about the user. Run via `shell_exec`:

```
python3 ~/.buddy/skills/remember-fact/scripts/remember.py <action> <agent_id> [key] [value]
```

Your agent ID is provided in your system prompt.

### Actions

**Set a fact:**
```
python3 ~/.buddy/skills/remember-fact/scripts/remember.py set <agent_id> <key> <value>
```
Output: `{ "status": "remembered", "key": "...", "value": "..." }`

**Get a specific fact:**
```
python3 ~/.buddy/skills/remember-fact/scripts/remember.py get <agent_id> <key>
```
Output: `{ "key": "...", "value": "..." }` or `{ "error": "not found" }`

**List all facts:**
```
python3 ~/.buddy/skills/remember-fact/scripts/remember.py list <agent_id>
```
Output: `{ "memories": [{ "key": "...", "value": "..." }, ...] }`

**Delete a fact:**
```
python3 ~/.buddy/skills/remember-fact/scripts/remember.py delete <agent_id> <key>
```
Output: `{ "status": "deleted", "key": "..." }`

### Guidelines

- When the user tells you something personal (name, preferences, job, etc.), save it with `set`.
- Use remembered facts naturally in conversation — don't announce that you're remembering things.
- Use short, descriptive keys (e.g. "name", "favorite_color", "job", "pet_name").
