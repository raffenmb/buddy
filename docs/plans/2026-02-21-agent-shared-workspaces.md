# Agent Shared Workspaces Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let agents share data through user-scoped workspaces with privacy boundaries between private and shared agents.

**Architecture:** New `workspace_items` SQLite table scoped by workspace ID (`user-<userId>` for private agents, `agent-<agentId>` for shared agents). Five new always-on platform tools. New `server/shell/workspace.js` module with workspace resolution logic.

**Tech Stack:** SQLite (better-sqlite3), Node.js, existing tool/platform patterns

**Design doc:** `docs/plans/2026-02-21-agent-shared-workspaces-design.md`

---

### Task 1: Add workspace_items table to database

**Files:**
- Modify: `server/db.js:16-96` (schema section)

**Step 1: Add the table creation SQL**

Add this block inside the existing `db.exec(...)` statement, after the `pending_messages` table (before the closing backtick on line 96):

```sql
  CREATE TABLE IF NOT EXISTS workspace_items (
    id            TEXT PRIMARY KEY,
    workspace_id  TEXT NOT NULL,
    key           TEXT NOT NULL,
    value         TEXT NOT NULL,
    created_by    TEXT NOT NULL,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now')),
    UNIQUE(workspace_id, key)
  );
```

**Step 2: Add index for workspace queries**

Add after the existing `CREATE INDEX` statements (around line 114-117):

```js
try { db.exec("CREATE INDEX IF NOT EXISTS idx_workspace_items_workspace ON workspace_items(workspace_id)"); } catch {}
```

**Step 3: Verify the server starts without errors**

Run: `cd server && node -e "import('./db.js').then(() => console.log('OK'))"`
Expected: `OK` with no errors

**Step 4: Commit**

```bash
git add server/db.js
git commit -m "feat: add workspace_items table for agent shared workspaces"
```

---

### Task 2: Create workspace module

**Files:**
- Create: `server/shell/workspace.js`

**Step 1: Create the workspace module**

```js
/**
 * Shared workspace operations — lets agents share data through
 * user-scoped (private agents) or agent-scoped (shared agents) workspaces.
 */

import { randomUUID } from "crypto";
import db from "../db.js";
import { getAgent } from "../agents.js";

/**
 * Resolve the workspace ID for an agent.
 * Private agents → 'user-<userId>' (shared among all user's private agents)
 * Shared agents → 'agent-<agentId>' (isolated per shared agent)
 */
function resolveWorkspaceId(agentId, userId) {
  const agent = getAgent(agentId);
  if (!agent) throw new Error(`Agent '${agentId}' not found`);
  return agent.is_shared ? `agent-${agentId}` : `user-${userId}`;
}

/**
 * List all items in the agent's workspace.
 * Returns key, first 100 chars of value as preview, created_by, updated_at.
 */
export function listWorkspace(agentId, userId) {
  const workspaceId = resolveWorkspaceId(agentId, userId);
  const rows = db.prepare(
    "SELECT key, value, created_by, updated_at FROM workspace_items WHERE workspace_id = ? ORDER BY updated_at DESC"
  ).all(workspaceId);

  return rows.map((row) => ({
    key: row.key,
    preview: row.value.length > 100 ? row.value.slice(0, 100) + "..." : row.value,
    created_by: row.created_by,
    updated_at: row.updated_at,
  }));
}

/**
 * Read a specific item by key.
 */
export function readWorkspace(agentId, userId, key) {
  const workspaceId = resolveWorkspaceId(agentId, userId);
  const row = db.prepare(
    "SELECT key, value, created_by, created_at, updated_at FROM workspace_items WHERE workspace_id = ? AND key = ?"
  ).get(workspaceId, key);

  if (!row) return { error: `Item '${key}' not found in workspace` };
  return row;
}

/**
 * Create or update an item by key (upsert).
 */
export function writeWorkspace(agentId, userId, key, value) {
  const workspaceId = resolveWorkspaceId(agentId, userId);
  const id = randomUUID();

  db.prepare(`
    INSERT INTO workspace_items (id, workspace_id, key, value, created_by)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(workspace_id, key) DO UPDATE SET
      value = excluded.value,
      updated_at = datetime('now')
  `).run(id, workspaceId, key, value, agentId);

  return { status: "written", workspace_id: workspaceId, key };
}

/**
 * Delete an item by key.
 */
export function deleteWorkspace(agentId, userId, key) {
  const workspaceId = resolveWorkspaceId(agentId, userId);
  const result = db.prepare(
    "DELETE FROM workspace_items WHERE workspace_id = ? AND key = ?"
  ).run(workspaceId, key);

  if (result.changes === 0) return { error: `Item '${key}' not found in workspace` };
  return { status: "deleted", key };
}

/**
 * Copy an item from the current workspace into a shared agent's workspace.
 * Only allowed from private agent → shared agent direction.
 */
export function publishWorkspace(agentId, userId, key, targetAgentId, targetKey) {
  // Verify source agent is private (not shared)
  const sourceAgent = getAgent(agentId);
  if (!sourceAgent) throw new Error(`Agent '${agentId}' not found`);
  if (sourceAgent.is_shared) {
    return { error: "Cannot publish from a shared agent. Only private agents can publish to shared agents." };
  }

  // Verify target agent exists and is shared
  const targetAgent = getAgent(targetAgentId);
  if (!targetAgent) return { error: `Target agent '${targetAgentId}' not found` };
  if (!targetAgent.is_shared) {
    return { error: `Target agent '${targetAgentId}' is not a shared agent. Can only publish to shared agents.` };
  }

  // Read source item
  const sourceWorkspaceId = `user-${userId}`;
  const sourceItem = db.prepare(
    "SELECT value FROM workspace_items WHERE workspace_id = ? AND key = ?"
  ).get(sourceWorkspaceId, key);

  if (!sourceItem) return { error: `Item '${key}' not found in your workspace` };

  // Write to target workspace
  const targetWorkspaceId = `agent-${targetAgentId}`;
  const destKey = targetKey || key;
  const id = randomUUID();

  db.prepare(`
    INSERT INTO workspace_items (id, workspace_id, key, value, created_by)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(workspace_id, key) DO UPDATE SET
      value = excluded.value,
      updated_at = datetime('now')
  `).run(id, targetWorkspaceId, destKey, sourceItem.value, agentId);

  return { status: "published", from_key: key, to_agent: targetAgentId, to_key: destKey };
}
```

**Step 2: Verify module imports cleanly**

Run: `cd server && node -e "import('./shell/workspace.js').then(() => console.log('OK'))"`
Expected: `OK`

**Step 3: Commit**

```bash
git add server/shell/workspace.js
git commit -m "feat: add workspace module with CRUD and publish operations"
```

---

### Task 3: Add tool definitions

**Files:**
- Modify: `server/tools.js:809-827` (after last tool, before PLATFORM_TOOL_NAMES export)

**Step 1: Add the 5 workspace tool definitions**

Insert before the `export const PLATFORM_TOOL_NAMES` line (line 811). Add these tool objects to the `tools` array:

```js
  {
    name: "workspace_list",
    description:
      "List all items in the shared workspace accessible to this agent. Private agents share a workspace with all other agents owned by the same user. Shared agents have their own isolated workspace. Returns item keys, value previews, who created each item, and when it was last updated.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "workspace_read",
    description:
      "Read a specific item from the shared workspace by its key. Returns the full value (JSON or plain text), creator, and timestamps.",
    input_schema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "The item key to read.",
        },
      },
      required: ["key"],
    },
  },
  {
    name: "workspace_write",
    description:
      "Create or update an item in the shared workspace. Use for storing shopping lists, meal plans, notes, or any data that should be accessible to other agents. Value can be JSON (for structured data like lists) or plain text (for freeform notes).",
    input_schema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "The item key (e.g. 'shopping-list', 'meal-plan', 'project-notes').",
        },
        value: {
          type: "string",
          description: "The content to store. Use JSON for structured data (arrays, objects) or plain text for freeform content.",
        },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "workspace_delete",
    description:
      "Remove an item from the shared workspace by its key.",
    input_schema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "The item key to delete.",
        },
      },
      required: ["key"],
    },
  },
  {
    name: "workspace_publish",
    description:
      "Copy an item from your workspace into a shared agent's workspace. Only works from a private agent's workspace to a shared agent's workspace (not the reverse). Use when you want to make private data available to a shared agent that other users can access.",
    input_schema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "The item key to publish from your workspace.",
        },
        target_agent_id: {
          type: "string",
          description: "The ID of the shared agent to publish to.",
        },
        target_key: {
          type: "string",
          description: "Optional different key name in the target workspace. Defaults to the same key.",
        },
      },
      required: ["key", "target_agent_id"],
    },
  },
```

**Step 2: Add names to PLATFORM_TOOL_NAMES**

Add these 5 names to the `PLATFORM_TOOL_NAMES` array:

```js
  "workspace_list",
  "workspace_read",
  "workspace_write",
  "workspace_delete",
  "workspace_publish",
```

**Step 3: Verify module loads**

Run: `cd server && node -e "import('./tools.js').then(m => console.log(m.PLATFORM_TOOL_NAMES.filter(n => n.startsWith('workspace'))))"`
Expected: `[ 'workspace_list', 'workspace_read', 'workspace_write', 'workspace_delete', 'workspace_publish' ]`

**Step 4: Commit**

```bash
git add server/tools.js
git commit -m "feat: add workspace tool definitions to platform tools"
```

---

### Task 4: Wire tools into claude-client

**Files:**
- Modify: `server/claude-client.js:18` (imports)
- Modify: `server/claude-client.js:370-373` (after delete_schedule handler, before form handler)

**Step 1: Add import**

Add to the imports at the top of `server/claude-client.js`, after the scheduler import (line 19):

```js
import { listWorkspace, readWorkspace, writeWorkspace, deleteWorkspace, publishWorkspace } from "./shell/workspace.js";
```

**Step 2: Add tool handler cases**

Insert after the `delete_schedule` handler block (ends around line 373) and before the `canvas_show_form` handler (line 375). Add these cases:

```js
        if (toolUse.name === "workspace_list") {
          const result = listWorkspace(agentId, userId);
          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          };
        }
        if (toolUse.name === "workspace_read") {
          const result = readWorkspace(agentId, userId, toolUse.input.key);
          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
            ...(result.error && { is_error: true }),
          };
        }
        if (toolUse.name === "workspace_write") {
          const result = writeWorkspace(agentId, userId, toolUse.input.key, toolUse.input.value);
          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          };
        }
        if (toolUse.name === "workspace_delete") {
          const result = deleteWorkspace(agentId, userId, toolUse.input.key);
          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
            ...(result.error && { is_error: true }),
          };
        }
        if (toolUse.name === "workspace_publish") {
          const result = publishWorkspace(
            agentId, userId,
            toolUse.input.key,
            toolUse.input.target_agent_id,
            toolUse.input.target_key
          );
          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
            ...(result.error && { is_error: true }),
          };
        }
```

**Step 3: Verify server starts**

Run: `cd server && node -e "import('./claude-client.js').then(() => console.log('OK'))"`
Expected: `OK`

**Step 4: Commit**

```bash
git add server/claude-client.js
git commit -m "feat: wire workspace tools into claude-client tool handler"
```

---

### Task 5: Update CLAUDE.md documentation

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add workspace tools to the platform primitives table**

In the "Platform primitives" table in CLAUDE.md, add these rows:

```
| `workspace_list` | List items in the agent's shared workspace |
| `workspace_read` | Read a workspace item by key |
| `workspace_write` | Create/update a workspace item |
| `workspace_delete` | Delete a workspace item |
| `workspace_publish` | Copy an item to a shared agent's workspace |
```

**Step 2: Add workspace section to Architecture**

Add a new subsection after "Sub-Agent Model" explaining the workspace model:

```markdown
### Agent Workspaces

Agents share data through workspaces — a key-value store in SQLite (`workspace_items` table).

- **Private agents** share a user-scoped workspace (`user-<userId>`). All of a user's personal agents can read/write the same items.
- **Shared agents** get an isolated workspace (`agent-<agentId>`). Cannot see into any user's private workspace.
- **Publishing:** Private agents can explicitly copy items into a shared agent's workspace (one-way). This is the only cross-boundary data flow.
- **Discovery:** Agents use `workspace_list` to see what's available — no injection into system prompt.
```

**Step 3: Update the platform tool count references**

Update "13 platform" to "18 platform" wherever it appears (tool count increased by 5).

**Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add workspace tools to CLAUDE.md"
```

---

### Task 6: Manual smoke test

**Step 1: Start the server**

Run: `cd server && node index.js`

**Step 2: Test via the web UI**

1. Open the app and talk to an agent
2. Ask: "Save a shopping list to the workspace with eggs, milk, and bread"
3. Verify agent calls `workspace_write`
4. Switch to a different personal agent
5. Ask: "What's in the workspace?"
6. Verify agent calls `workspace_list` and sees the shopping list
7. Ask: "Read the shopping list from the workspace"
8. Verify agent calls `workspace_read` and shows the full content

**Step 3: Test publish (if a shared agent exists)**

1. From a personal agent, ask: "Publish the shopping list to [shared agent name]"
2. Verify `workspace_publish` is called
3. Switch to the shared agent
4. Ask: "What's in the workspace?"
5. Verify it sees the published item

**Step 4: Final commit (if any fixes needed)**
