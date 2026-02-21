# Agent Shared Workspaces Design

**Date:** 2026-02-21
**Status:** Approved

## Problem

Agents are isolated from each other. A user's cooking agent can't share a shopping list with their main agent. There's no mechanism for agents to share data.

## Solution

A shared workspace model using a new `workspace_items` SQLite table, scoped by workspace ID. Five new always-on platform tools let agents list, read, write, delete, and publish workspace items.

## Workspace Scoping

- **Private agents** → workspace ID is `user-<userId>`. All of a user's private agents share one workspace.
- **Shared agents** → workspace ID is `agent-<agentId>`. Each shared agent gets its own isolated workspace.
- **Privacy boundary:** Shared agents cannot see into any user's private workspace. This prevents another user from accessing private data via a shared agent.
- **Cross-boundary publishing:** A private agent can explicitly copy an item into a shared agent's workspace (one-way, private → shared only).

## Data Model

```sql
CREATE TABLE IF NOT EXISTS workspace_items (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL,    -- 'user-<userId>' or 'agent-<agentId>'
  key           TEXT NOT NULL,
  value         TEXT NOT NULL,    -- JSON string (structured) or plain text (freeform)
  created_by    TEXT NOT NULL,    -- agent_id that created it
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now')),
  UNIQUE(workspace_id, key)
);
```

## New Platform Tools

| Tool | Purpose |
|------|---------|
| `workspace_list` | List all items in the agent's workspace (keys + preview + metadata) |
| `workspace_read` | Read a specific item by key |
| `workspace_write` | Create or update an item by key (JSON or plain text) |
| `workspace_delete` | Remove an item by key |
| `workspace_publish` | Copy an item from current workspace into a shared agent's workspace |

### Workspace Resolution

Invisible to the agent — no workspace_id parameter exposed. The server resolves it:

1. Query `agents` table for calling agent's `is_shared` flag
2. If `is_shared = 1` → workspace is `agent-<agentId>`
3. Otherwise → workspace is `user-<userId>` from the authenticated session

### Tool Schemas

**workspace_list** — no required parameters. Returns array of `{ key, preview, created_by, updated_at }`.

**workspace_read** — `key` (required). Returns full item value.

**workspace_write** — `key` (required), `value` (required). Upserts. Value is any string (JSON for structured data, plain text for freeform).

**workspace_delete** — `key` (required). Removes item.

**workspace_publish** — `key` (required), `target_agent_id` (required, must be shared agent), `target_key` (optional, defaults to same key). Copies item from current workspace to target.

## Implementation Integration

**New module:** `server/shell/workspace.js`
- Exports: `listWorkspace`, `readWorkspace`, `writeWorkspace`, `deleteWorkspace`, `publishWorkspace`
- Each takes `(agentId, userId, params)` and resolves workspace ID internally

**Modified files:**
- `server/db.js` — add `workspace_items` table + index on `workspace_id`
- `server/tools.js` — add 5 tool definitions, add names to `PLATFORM_TOOL_NAMES`
- `server/claude-client.js` — add cases to platform tool handler switch

**No changes needed to:**
- Frontend (server-side tools only)
- Agent CRUD or admin UI (always-on platform primitives)
- System prompt (tool-based discovery)
- Skills system
