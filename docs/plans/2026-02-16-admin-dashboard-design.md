# Admin Dashboard Design

## Overview

A full-page admin dashboard accessible via a gear icon from the main Buddy screen. Allows creating, editing, and deleting agents with per-agent identity files, user files, avatar presets, model selection, and tool toggling — all stored on the host server.

---

## Data Model

### Database: `agents` table changes

- Remove reliance on `system_prompt` column (prompt assembled from files at runtime)
- Add `avatar` column (TEXT, default `'buddy'`) — preset name
- Add `enabled_tools` column (TEXT, default NULL) — JSON array of tool names, null = all tools

### File system: `server/agents/<agent-id>/`

Each agent gets a folder with at least two core files:

```
server/agents/
  buddy/
    identity.md      ← core (protected, only editable by admin or self)
    user.md           ← core (protected, only editable by admin or self)
    shopping-list.md  ← non-core (any agent can read/write)
  chef/
    identity.md
    user.md
    recipes.md
```

**Core files** = `identity.md` and `user.md` (convention-based, fixed names, always protected).
**Non-core files** = everything else in the folder (any agent can edit).

### System prompt assembly (runtime)

Built by the server on each API call:
1. Read `agents/<id>/identity.md` → main system prompt
2. Read `agents/<id>/user.md` → appended as `## About the user:` section
3. Append agent memories from DB → `## What you remember:` section

### Tool filtering

- `enabled_tools = NULL` → all tools passed to Claude API
- `enabled_tools = ["canvas_add_card", "remember_fact", ...]` → only those tools sent
- Filtering happens in `claude-client.js` before the API call

---

## API Changes

### Existing routes (unchanged)

- `GET /api/agents` — list agents
- `GET /api/agents/:id` — get agent detail
- `POST /api/agents` — create agent (now also creates folder + blank files)
- `PUT /api/agents/:id` — update agent (now includes avatar, enabled_tools)
- `DELETE /api/agents/:id` — delete agent (now also deletes folder)
- `GET /api/agents/:id/memory` — get memories
- `DELETE /api/agents/:id/memory/:key` — delete memory

### New file routes

- `GET /api/agents/:id/files` — list all files in agent folder
- `GET /api/agents/:id/files/:filename` — read file content
- `PUT /api/agents/:id/files/:filename` — create or update file
- `DELETE /api/agents/:id/files/:filename` — delete file (blocked for core files)

---

## Avatar Presets

Three presets, each with idle + talking SVG frames:

| Preset | Description |
|--------|-------------|
| `buddy` | Current character (existing SVGs, moved to `avatars/` subfolder) |
| `robot` | Simple robot face (boxy head, antenna, dot eyes) |
| `owl` | Round owl character (big eyes, small beak) |

File location: `client/src/assets/avatars/<preset>-idle.svg` and `<preset>-talking.svg`

Avatar component reads `agent.avatar` and loads the matching pair. Falls back to `"buddy"`.

---

## Model Options

| Display Name | API Model ID |
|---|---|
| Haiku | `claude-haiku-4-5-20251001` |
| Sonnet | `claude-sonnet-4-5-20250929` |
| Opus | `claude-opus-4-6` |

Default for new agents: Sonnet.

---

## Client UI

### Navigation

- Gear icon in top-right corner (replaces or sits next to agent switcher)
- Clicking toggles between `"buddy"` view and `"admin"` view
- State-based routing via context (`view` field), no router library
- "Back to Buddy" button in dashboard header

### Dashboard layout

```
┌──────────────────────────────────────────────────────┐
│  ← Back to Buddy              Admin Dashboard        │
├──────────────┬───────────────────────────────────────┤
│              │                                       │
│  Agents      │   Agent Editor                        │
│              │                                       │
│  ┌────────┐  │   Name: [Chef                    ]    │
│  │ Buddy ●│  │   Avatar: (●) (○) (○)                │
│  ├────────┤  │   Model:  [Sonnet ▼]                  │
│  │ Chef   │  │                                       │
│  ├────────┤  │   ─── Identity ───────────────────    │
│  │ + New  │  │   [large text editor              ]   │
│  └────────┘  │                                       │
│              │   ─── User Info ───────────────────    │
│              │   [large text editor              ]   │
│              │                                       │
│              │   ─── Tools ──────────────────────    │
│              │   ☑ canvas_add_card                   │
│              │   ☑ canvas_show_chart                 │
│              │   ☐ search_youtube                    │
│              │   ...                                 │
│              │                                       │
│              │   ─── Files ──────────────────────    │
│              │   identity.md (core)  🔒              │
│              │   user.md (core)      🔒              │
│              │   shopping-list.md    [edit] [delete]  │
│              │   + Add file                          │
│              │                                       │
│              │   [Save]  [Delete Agent]               │
└──────────────┴───────────────────────────────────────┘
```

### Styling

Dark glass aesthetic matching existing app:
- `bg-gray-900`, `bg-gray-800/80`, `backdrop-blur`, `border-gray-700`
- Consistent with InputBar, AgentSwitcher, Avatar components

### Key interactions

- Left sidebar: agent list with active indicator, "+" to create
- Selecting agent loads config into editor
- Tool checkboxes with friendly display names
- Files section: core files locked, non-core editable/deletable
- Clicking non-core file opens inline text editor
- Save persists all changes (name, model, avatar, files, tools)
- Delete Agent with confirmation, disabled for buddy
- New agent: prompts for ID and name, creates folder with blank files

---

## File Isolation Rules

| Action | Same agent | Other agent | Admin dashboard |
|--------|-----------|-------------|-----------------|
| Read core files | Yes | Yes | Yes |
| Write core files | Yes | No | Yes |
| Read non-core files | Yes | Yes | Yes |
| Write non-core files | Yes | Yes | Yes |
| Delete core files | No | No | No |
| Delete non-core files | Yes | Yes | Yes |
