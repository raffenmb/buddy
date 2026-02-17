# Custom Skills Design

## Overview

Add drag-and-drop custom skills to Buddy agents. Skills use Claude Code's SKILL.md format: a folder containing a `SKILL.md` file with YAML frontmatter (`name:`, `description:`) and markdown prompt content. When enabled on an agent, the skill's prompt is injected into the system prompt sent to Claude.

## Skill Format

Each skill is a folder stored in `server/skills/`:

```
server/skills/
  systematic-debugging/
    SKILL.md
  cooking-helper/
    SKILL.md
```

SKILL.md structure (identical to Claude Code):

```markdown
---
name: cooking-helper
description: "Helps with recipes, meal planning, and cooking techniques"
---

# Cooking Helper

When the user asks about cooking, recipes, or meal planning...
[rest of prompt]
```

Compatible with Claude Code skills — users can drag a skill folder directly from `~/.claude/plugins/cache/...` into Buddy.

## Validation Rules

On upload, skills are validated with specific error messages:

1. Must be a folder containing a `SKILL.md` file
   - Error: "This folder doesn't contain a SKILL.md file. Each skill needs a SKILL.md with a name and description in the frontmatter."
2. `SKILL.md` must have YAML frontmatter with non-blank `name:`
   - Error: "SKILL.md is missing a 'name' field. Add `name: your-skill-name` to the YAML frontmatter at the top of the file."
3. `SKILL.md` must have YAML frontmatter with non-blank `description:`
   - Error: "SKILL.md is missing a 'description' field. Add `description: \"what this skill does\"` to the YAML frontmatter."
4. Folder name must not already exist in `server/skills/`
   - Error: "A skill named '{folderName}' is already installed. Remove the existing one first or rename the folder."

## Server Changes

### New module: `server/skills.js`

Scans `server/skills/` on startup, parses SKILL.md frontmatter. Exports:

- `listSkills()` — returns `[{ folderName, name, description }]`
- `getSkillPrompt(folderName)` — returns full markdown content below frontmatter
- `validateAndAddSkill(folderName, skillMdContent)` — validates, writes to disk, re-scans
- `deleteSkill(folderName)` — removes folder from disk, re-scans

### New API routes in `server/index.js`

- `GET /api/skills` — list all installed skills (name, description, folderName)
- `POST /api/skills` — upload a new skill (JSON body with folderName + SKILL.md content)
- `DELETE /api/skills/:folderName` — remove a skill from the server

### System prompt integration in `claude-client.js`

**Current (temporary):** Full skill prompts are injected into the system prompt for each enabled skill. This works but is token-inefficient — every API call pays the full token cost of all enabled skills.

**Planned refactor (after terminal execution feature):** Align with Anthropic's recommended pattern:
1. Only inject skill **name + description** (YAML metadata) into the system prompt
2. Agent uses its terminal/bash tool to `cat server/skills/<name>/SKILL.md` on demand when it decides a skill is relevant
3. Additional files in skill folders are read even later (progressive disclosure)

This matches exactly how Claude Code handles skills — see [Anthropic's skill docs](https://code.claude.com/docs/en/skills):
> "In a regular session, skill descriptions are loaded into context so Claude knows what's available, but full skill content only loads when invoked."

The refactor requires the terminal execution feature to be built first, since the agent needs filesystem access to read skills on demand. The code change will be in `buildSystemPrompt()` in `claude-client.js` — switch from appending full prompt content to appending only metadata, and add a note in the system prompt telling the agent where to find skill files.

## enabled_tools Behavior

The existing `enabled_tools` JSON array on each agent expands to hold both built-in tool names and skill folder names:

- `null` — all built-in tools ON, custom skills OFF (skills require explicit opt-in)
- `["search_youtube", "cooking-helper"]` — only those specific built-in tools and skills ON
- `[]` — everything OFF

## Frontend Changes

### ToolSelector.jsx redesign

Single unified toggle list replacing the current hardcoded 2-item list:

- Fetches custom skills from `GET /api/skills` and merges with built-in tools
- Each row shows: name, badge ("Built-in" muted / "Custom" accent), toggle switch
- Custom skills also show a delete button that removes from server entirely
- All items share the same toggle mechanism writing to `enabled_tools`

### Add Skill upload area

Below the toggle list, a drop zone / browse button:

- Dashed border area: "Drop a skill folder here or browse"
- On drop/browse: reads folder contents via File System API
- Client-side pre-validation (SKILL.md exists)
- Sends to `POST /api/skills`, server does full validation
- Validation errors shown inline below the drop zone
- On success: skill appears in toggle list, enabled by default for this agent

## Edge Cases

- **Deleted skill with stale reference:** If a skill is deleted but still in an agent's `enabled_tools`, it's silently skipped during system prompt building. The UI won't show it because it only renders skills that exist on disk.
- **Server restart:** Skills are re-scanned from `server/skills/` on startup. They persist on disk.
- **Drag-and-drop browser support:** The webkitdirectory/File System Access API is used for folder uploads. Falls back to browse with directory selection.

## Planned: On-Demand Skill Loading (requires terminal execution)

Once agents have terminal/bash execution capability, refactor skills from full system prompt injection to on-demand loading:

1. System prompt gets only metadata: `- cooking-helper: "Helps with recipes, meal planning, and cooking techniques"`
2. Agent reads `server/skills/cooking-helper/SKILL.md` via bash tool when relevant
3. Skills can have supporting files (reference docs, scripts) loaded progressively
4. This aligns with Anthropic's recommended pattern and saves tokens on every API call

**Dependencies:** Terminal execution feature must be implemented first. The current full-injection approach works as a stopgap.

## What This Does NOT Include

- Executable skills (server-side code execution via handler.js) — future enhancement
- Skill marketplace or sharing platform — future enhancement
- Skill versioning — future enhancement
- Skills with input schemas (formal Claude API tools) — future enhancement
