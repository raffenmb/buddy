# Shared Agents Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement many-to-many shared agents with per-user attach/detach, replacing the current `user_id IS NULL` model.

**Architecture:** New `agent_users` junction table + `is_shared` flag on agents. Shared agents are explicitly linked to users. Any user can create shared agents. Users can leave without deleting. Last user standing can permanently delete.

**Tech Stack:** SQLite (better-sqlite3), Express routes, React frontend (existing admin panel components)

**Design doc:** `docs/plans/2026-02-19-shared-agents-design.md`

---

### Task 1: Database Migration — `agent_users` Table + `is_shared` Column

**Files:**
- Modify: `server/db.js:96-115` (migrations section)

**Step 1: Add the migration code**

After the existing migrations in `server/db.js` (after line 111, before the seed default session), add:

```js
// Add is_shared column to agents
try { db.exec("ALTER TABLE agents ADD COLUMN is_shared INTEGER NOT NULL DEFAULT 0"); } catch {}

// Create agent_users junction table for shared agent membership
db.exec(`
  CREATE TABLE IF NOT EXISTS agent_users (
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (agent_id, user_id)
  );
`);

// Migrate existing shared agents (user_id IS NULL) to new model
const legacyShared = db.prepare("SELECT id FROM agents WHERE user_id IS NULL AND is_shared = 0").all();
if (legacyShared.length > 0) {
  const allUsers = db.prepare("SELECT id FROM users").all();
  const markShared = db.prepare("UPDATE agents SET is_shared = 1 WHERE id = ?");
  const insertMembership = db.prepare("INSERT OR IGNORE INTO agent_users (agent_id, user_id) VALUES (?, ?)");

  const migrate = db.transaction(() => {
    for (const agent of legacyShared) {
      markShared.run(agent.id);
      for (const user of allUsers) {
        insertMembership.run(agent.id, user.id);
      }
    }
  });
  migrate();
}
```

**Step 2: Test manually**

Run: `cd server && node -e "import('./db.js').then(() => console.log('OK'))"`

Expected: no errors, tables created. If running against existing DB with shared agents, they get migrated.

**Step 3: Commit**

```bash
git add server/db.js
git commit -m "Add agent_users table and is_shared migration for shared agents"
```

---

### Task 2: Update `agents.js` — CRUD for Shared Agent Membership

**Files:**
- Modify: `server/agents.js:132-214` (CRUD section + access control)

**Step 1: Update `listAgents` to use junction table**

Replace the current `listAgents` function (line 138-142) with:

```js
export function listAgents(userId) {
  return db.prepare(`
    SELECT a.id, a.name, a.model, a.avatar, a.enabled_tools, a.avatar_config, a.voice_config, a.user_id, a.is_shared,
      CASE WHEN a.is_shared = 1
        THEN (SELECT COUNT(*) FROM agent_users WHERE agent_id = a.id)
        ELSE NULL
      END AS userCount
    FROM agents a
    WHERE (a.is_shared = 0 AND a.user_id = ?)
       OR (a.is_shared = 1 AND a.id IN (SELECT agent_id FROM agent_users WHERE user_id = ?))
  `).all(userId, userId);
}
```

**Step 2: Update `createAgent` to handle shared agents**

Modify `createAgent` (line 144-161). Add `shared` to destructured params and add junction table logic after the INSERT:

```js
export function createAgent({ id, name, model, system_prompt, avatar_config, voice_config, identity, user_info, userId, shared }) {
  const m = model || defaultModel;
  const sp = system_prompt || DEFAULT_PERSONALITY;
  const av = avatar_config ? JSON.stringify(avatar_config) : "{}";
  const vc = voice_config ? JSON.stringify(voice_config) : "{}";
  const isShared = shared ? 1 : 0;

  db.prepare(`
    INSERT INTO agents (id, name, model, system_prompt, avatar_config, voice_config, user_id, is_shared)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, m, sp, av, vc, isShared ? null : (userId || null), isShared);

  if (isShared) {
    const allUsers = db.prepare("SELECT id FROM users").all();
    const insert = db.prepare("INSERT OR IGNORE INTO agent_users (agent_id, user_id) VALUES (?, ?)");
    const seed = db.transaction(() => {
      for (const user of allUsers) {
        insert.run(id, user.id);
      }
    });
    seed();
  }

  // Create folder + core files
  const dir = ensureAgentDir(id);
  writeFileSync(join(dir, "identity.md"), identity || DEFAULT_PERSONALITY, "utf-8");
  writeFileSync(join(dir, "user.md"), user_info || "", "utf-8");

  return getAgent(id);
}
```

**Step 3: Replace `deleteAgent` with shared-aware version**

Replace the current `deleteAgent` (line 189-205) with:

```js
export function deleteAgent(id, userId) {
  if (id === "buddy") {
    throw new Error("Cannot delete the default buddy agent");
  }
  const agent = getAgent(id);
  if (!agent) throw new Error("Agent not found");

  if (agent.is_shared) {
    // Remove this user from the shared agent
    db.prepare("DELETE FROM agent_users WHERE agent_id = ? AND user_id = ?").run(id, userId);

    // Clean up user's schedules and pending messages for this agent
    db.prepare("DELETE FROM schedules WHERE agent_id = ? AND user_id = ?").run(id, userId);
    db.prepare("DELETE FROM pending_messages WHERE agent_id = ? AND user_id = ?").run(id, userId);

    // Check if anyone is left
    const remaining = db.prepare("SELECT COUNT(*) AS cnt FROM agent_users WHERE agent_id = ?").get(id);
    if (remaining.cnt > 0) {
      return { detached: true }; // Other users still have it
    }
    // Last user — fall through to full delete
  } else {
    // Private agent — only owner can delete
    if (agent.user_id && agent.user_id !== userId) {
      throw new Error("Cannot delete another user's agent");
    }
  }

  // Full delete (private agent, or last user on shared agent)
  db.prepare("DELETE FROM agents WHERE id = ?").run(id);
  const dir = join(AGENTS_DIR, id);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
  return { deleted: true };
}
```

**Step 4: Update `canAccessAgent` to use junction table**

Replace the current `canAccessAgent` (line 209-214) with:

```js
export function canAccessAgent(agentId, userId) {
  const agent = getAgent(agentId);
  if (!agent) return false;
  if (agent.is_shared) {
    return !!db.prepare("SELECT 1 FROM agent_users WHERE agent_id = ? AND user_id = ?").get(agentId, userId);
  }
  return agent.user_id === userId;
}
```

**Step 5: Add helper to attach new users to all shared agents**

Add a new exported function after `canAccessAgent`:

```js
export function attachUserToSharedAgents(userId) {
  const sharedAgents = db.prepare("SELECT id FROM agents WHERE is_shared = 1").all();
  const insert = db.prepare("INSERT OR IGNORE INTO agent_users (agent_id, user_id) VALUES (?, ?)");
  const attach = db.transaction(() => {
    for (const agent of sharedAgents) {
      insert.run(agent.id, userId);
    }
  });
  attach();
}
```

**Step 6: Commit**

```bash
git add server/agents.js
git commit -m "Update agent CRUD for shared agent junction table model"
```

---

### Task 3: Update Server Routes

**Files:**
- Modify: `server/index.js:17` (imports)
- Modify: `server/index.js:258-302` (agent POST, DELETE routes)
- Modify: `server/index.js:198-201` (user creation route)

**Step 1: Update imports**

At line 17 of `server/index.js`, add `attachUserToSharedAgents` to the import from `./agents.js`:

```js
import { listAgents, getAgent, createAgent, updateAgent, deleteAgent, getMemories, deleteMemory, getAgentFiles, readAgentFile, writeAgentFile, deleteAgentFile, canAccessAgent, seedBuddyAgent, attachUserToSharedAgents } from "./agents.js";
```

**Step 2: Update POST /api/agents**

Replace lines 258-273 with:

```js
app.post("/api/agents", (req, res) => {
  const { id, name, system_prompt, model, avatar_config, voice_config, identity, user_info, shared } = req.body;
  if (!id || !name) return res.status(400).json({ error: "id and name are required" });
  if (getAgent(id)) return res.status(409).json({ error: "Agent with this id already exists" });

  try {
    const agent = createAgent({
      id, name, model, system_prompt, avatar_config, voice_config, identity, user_info,
      userId: req.user.userId,
      shared: !!shared,
    });
    res.status(201).json(agent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

Key change: removed the admin gate (`if (shared && !req.user.isAdmin)`), and pass `shared` flag and `userId` to `createAgent`.

**Step 3: Update DELETE /api/agents/:id**

Replace lines 290-302 with:

```js
app.delete("/api/agents/:id", (req, res) => {
  try {
    const agent = getAgent(req.params.id);
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    if (!agent.is_shared && agent.user_id !== req.user.userId) {
      return res.status(403).json({ error: "Cannot delete another user's agent" });
    }
    if (agent.is_shared) {
      const isMember = db.prepare("SELECT 1 FROM agent_users WHERE agent_id = ? AND user_id = ?").get(req.params.id, req.user.userId);
      if (!isMember) return res.status(403).json({ error: "Not a member of this shared agent" });
    }
    const result = deleteAgent(req.params.id, req.user.userId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
```

**Step 4: Update user creation to attach shared agents**

At line 200 (after `seedBuddyAgent(user.id)`), add:

```js
    seedBuddyAgent(user.id);
    attachUserToSharedAgents(user.id);
```

**Step 5: Commit**

```bash
git add server/index.js
git commit -m "Update routes for shared agent creation, deletion, and user attachment"
```

---

### Task 4: Update CLAUDE.md Documentation

**Files:**
- Modify: `CLAUDE.md` — update the SQLite tables section and agent ownership description

**Step 1: Add `agent_users` to SQLite tables section**

In the "SQLite tables" table in CLAUDE.md, add a row:

```
| `agent_users` | Many-to-many shared agent membership (agent_id, user_id) |
```

**Step 2: Update agent ownership description**

In any references to `user_id IS NULL` meaning shared, update to mention the new `is_shared` flag and `agent_users` junction table.

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "Document agent_users table and shared agent model in CLAUDE.md"
```

---

### Task 5: Frontend — Two Create Buttons in AgentList

**Files:**
- Modify: `client/src/components/admin/AgentList.jsx:10-46` (state + create logic)
- Modify: `client/src/components/admin/AgentList.jsx:117-186` (create section JSX)

**Step 1: Add `createShared` state and update handleCreate**

Add state variable after line 12:

```js
const [createShared, setCreateShared] = useState(false);
```

Update `handleCreate` (line 28-46) to pass `shared` flag:

```js
async function handleCreate() {
  const id = newId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const name = newName.trim();
  if (!id || !name) return;

  try {
    await apiFetch("/api/agents", {
      method: "POST",
      body: { id, name, shared: createShared },
    });
    setNewId("");
    setNewName("");
    setShowCreate(false);
    setCreateShared(false);
    await loadAgents();
    dispatch({ type: "ADMIN_PUSH_EDITOR", payload: id });
  } catch (err) {
    showAlert(err.message);
  }
}
```

**Step 2: Replace single button with two buttons**

Replace lines 172-185 (the `else` branch with the single "+ New Agent" button) with:

```jsx
          <div className="flex gap-2">
            <button
              onClick={() => { setCreateShared(false); setShowCreate(true); }}
              className="flex-1 text-sm px-4 py-3 rounded-2xl font-medium transition-colors"
              style={{
                backgroundColor: "var(--color-bg-surface)",
                boxShadow: "var(--shadow-card)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-secondary)",
              }}
            >
              + New Agent
            </button>
            <button
              onClick={() => { setCreateShared(true); setShowCreate(true); }}
              className="flex-1 text-sm px-4 py-3 rounded-2xl font-medium transition-colors"
              style={{
                backgroundColor: "var(--color-bg-surface)",
                boxShadow: "var(--shadow-card)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-secondary)",
              }}
            >
              + Shared Agent
            </button>
          </div>
```

**Step 3: Add a label in the create form showing which type**

Inside the create form (the `showCreate ? (` branch around line 119), add a small type indicator at the top of the form, before the first input:

```jsx
            <div
              className="text-xs font-medium px-2 py-1 rounded-lg self-start"
              style={{
                backgroundColor: "var(--color-bg-raised)",
                color: "var(--color-text-muted)",
              }}
            >
              {createShared ? "Shared Agent" : "Personal Agent"}
            </div>
```

**Step 4: Commit**

```bash
git add client/src/components/admin/AgentList.jsx
git commit -m "Add separate create buttons for personal and shared agents"
```

---

### Task 6: Frontend — Shared Badge + Leave/Delete Logic

**Files:**
- Modify: `client/src/components/admin/AgentList.jsx:56-114` (agent cards)
- Modify: `client/src/components/admin/AgentEditor.jsx:94-103` (delete handler)
- Modify: `client/src/components/admin/AgentEditor.jsx:274-282` (delete button JSX)

**Step 1: Update badge condition in AgentList**

Replace the current badge condition (lines 84-95) from `{!a.user_id && (` to:

```jsx
                  {a.is_shared === 1 && a.userCount >= 2 && (
                    <span
                      className="text-xs px-2 py-0.5 rounded-lg flex-shrink-0"
                      style={{
                        backgroundColor: "var(--color-bg-raised)",
                        color: "var(--color-text-muted)",
                        border: "1px solid var(--color-border)",
                      }}
                    >
                      Shared
                    </span>
                  )}
```

**Step 2: Update AgentEditor delete to handle Leave vs Delete**

In `AgentEditor.jsx`, update the `handleDelete` function (lines 94-103):

```js
  async function handleDelete() {
    const isShared = agent.is_shared === 1;
    const isLastUser = isShared && agent.userCount === 1;

    const message = isShared && !isLastUser
      ? `Remove "${name}" from your agents? Other users still have access.`
      : isShared && isLastUser
        ? `You're the last user. Delete "${name}" permanently? This cannot be undone.`
        : `Delete agent "${name}"? This cannot be undone.`;

    const confirmed = await showConfirm(message);
    if (!confirmed) return;
    try {
      await apiFetch(`/api/agents/${agentId}`, { method: "DELETE" });
      onDeleted();
    } catch (err) {
      showAlert(err.message);
    }
  }
```

**Step 3: Update delete button text**

Replace the delete button JSX (lines 274-282):

```jsx
        {agentId !== "buddy" && (
          <button
            onClick={handleDelete}
            className="w-full mt-3 px-5 py-2 text-sm font-medium transition-colors"
            style={{ color: agent?.is_shared === 1 && agent?.userCount > 1 ? "var(--color-text-secondary)" : "#EF4444" }}
          >
            {agent?.is_shared === 1 && agent?.userCount > 1 ? "Leave Agent" : "Delete Agent"}
          </button>
        )}
```

**Step 4: Ensure `GET /api/agents/:id` returns `is_shared` and `userCount`**

Back in `server/index.js`, the `GET /api/agents/:id` route (line 249-256) returns `getAgent(id)` which just does `SELECT *`. We need to augment it with `userCount` for shared agents.

Update the route:

```js
app.get("/api/agents/:id", (req, res) => {
  if (!canAccessAgent(req.params.id, req.user.userId)) {
    return res.status(403).json({ error: "Access denied" });
  }
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: "Agent not found" });
  if (agent.is_shared) {
    agent.userCount = db.prepare("SELECT COUNT(*) AS cnt FROM agent_users WHERE agent_id = ?").get(req.params.id).cnt;
  }
  res.json(agent);
});
```

**Step 5: Commit**

```bash
git add client/src/components/admin/AgentList.jsx client/src/components/admin/AgentEditor.jsx server/index.js
git commit -m "Add shared badge, leave/delete logic, and userCount to agent detail"
```

---

### Task 7: Frontend — Shared Info in AgentEditor

**Files:**
- Modify: `client/src/components/admin/AgentEditor.jsx:116-117` (top of editor, after loading check)

**Step 1: Add shared info banner**

After the loading check and before the Name field (between lines 116-117), add:

```jsx
      {agent.is_shared === 1 && (
        <div
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm"
          style={{
            backgroundColor: "var(--color-bg-raised)",
            color: "var(--color-text-muted)",
            border: "1px solid var(--color-border)",
          }}
        >
          Shared with {agent.userCount || 1} {agent.userCount === 1 ? "user" : "users"} — changes affect everyone
        </div>
      )}
```

**Step 2: Commit**

```bash
git add client/src/components/admin/AgentEditor.jsx
git commit -m "Show shared user count banner in agent editor"
```

---

### Task 8: Manual Testing Checklist

No code to write. Run the server and test each scenario:

**Step 1: Start the server and frontend**

```bash
cd server && node index.js &
cd client && npm run dev &
```

**Step 2: Test migration**

- If you have existing shared agents (`user_id IS NULL`), verify they got migrated to `is_shared = 1` with `agent_users` rows
- Check with: `sqlite3 ~/.buddy/buddy.db "SELECT * FROM agent_users; SELECT id, is_shared FROM agents WHERE is_shared = 1;"`

**Step 3: Test shared agent creation**

- Log in as any user
- Go to admin panel, click "+ Shared Agent"
- Fill in ID and name, create
- Verify the form shows "Shared Agent" label
- Verify the agent appears in the list

**Step 4: Test shared badge**

- Log in as a second user
- Verify the shared agent appears in their list with "Shared" badge
- Both users should see it

**Step 5: Test leave**

- As second user, open the shared agent in editor
- Click "Leave Agent"
- Confirm the dialog mentions "Other users still have access"
- Verify the agent disappears from their list
- Verify the first user still sees it (but now without "Shared" badge since only 1 user)

**Step 6: Test last-user delete**

- As the remaining user, open the agent
- Verify button says "Delete Agent" (not "Leave")
- Confirm dialog mentions "You're the last user"
- Delete it
- Verify agent is gone from the database

**Step 7: Test new user gets shared agents**

- Create a shared agent
- Create a new user via admin panel
- Log in as the new user
- Verify they can see the shared agent

**Step 8: Commit any fixes**

```bash
git add -A && git commit -m "Fix issues found during shared agent manual testing"
```
