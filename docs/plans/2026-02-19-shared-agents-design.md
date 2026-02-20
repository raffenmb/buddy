# Shared Agents Design

## Summary

Shared agents are agents visible to multiple users. Any user can create a shared agent, which is automatically added to every user's agent list. Users can remove themselves from a shared agent without deleting it. The agent is only permanently deleted when the last attached user removes it.

## Data Model

### New table: `agent_users`

```sql
CREATE TABLE agent_users (
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (agent_id, user_id)
);
```

### Changes to `agents` table

- Add column: `is_shared INTEGER NOT NULL DEFAULT 0`
- Existing `user_id` column stays for private agent ownership
- For shared agents: `is_shared = 1`, membership tracked via `agent_users`

### Query patterns

- **List agents for user:** `SELECT * FROM agents WHERE (is_shared = 0 AND user_id = ?) OR (is_shared = 1 AND id IN (SELECT agent_id FROM agent_users WHERE user_id = ?))`
- **User count for agent:** `SELECT COUNT(*) FROM agent_users WHERE agent_id = ?`
- **Check membership:** `SELECT 1 FROM agent_users WHERE agent_id = ? AND user_id = ?`

### Migration

On startup, the existing migration system in `db.js`:

1. Creates `agent_users` table
2. Adds `is_shared` column to `agents` (default 0)
3. Migrates existing shared agents (`user_id IS NULL`): sets `is_shared = 1`, inserts `agent_users` row for every existing user

## Backend API

### Agent creation (`POST /api/agents`)

- Body accepts `shared: true/false` (no admin gate — any user can create shared agents)
- `shared: true`: creates agent with `is_shared = 1`, inserts `agent_users` row for every user
- `shared: false` (default): creates agent with `is_shared = 0, user_id = req.user.userId`

### User creation (`POST /api/admin/users`)

- After creating user and seeding buddy agent, inserts `agent_users` rows for all active shared agents

### Agent removal (`DELETE /api/agents/:id`)

- **Private agents:** deletes agent (owner only, same as today)
- **Shared agents:** removes requesting user's `agent_users` row
  - If last row: permanently deletes agent, memory, files, schedules
  - If other users remain: just detaches the user

### Agent listing (`GET /api/agents`)

- Returns private agents + shared agents the user is attached to
- Each shared agent includes `userCount` field
- Badge shown when `userCount >= 2`

### Access control (`canAccessAgent`)

- Private: `user_id = userId`
- Shared: row exists in `agent_users` for that user

## Frontend

### AgentList.jsx — Creation

Two buttons side by side:

- **"+ New Agent"** — creates a private agent
- **"+ New Shared Agent"** — creates a shared agent

Both open the same inline form (ID + name). The shared button sends `shared: true` on submit.

### AgentList.jsx — Badge

- Show "Shared" text badge on agent cards when `is_shared && userCount >= 2`
- No badge when only 1 user attached (or private)

### AgentList.jsx — Delete/Leave

- **Private agents:** "Delete" button with confirmation (same as today)
- **Shared agents, `userCount >= 2`:** "Leave" button — "Remove this agent from your list? Other users still have access."
- **Shared agents, `userCount === 1`:** "Delete" button — "You're the last user. This will permanently delete the agent."

### AgentEditor.jsx

- No major changes — editing shared agents works the same
- Shared edits (personality, model, skills) affect all users
- Optional: show "Shared with X users" info line when `is_shared`

## Edge Cases

### Scheduler

- When a user leaves a shared agent, delete their schedules for that agent
- Discard pending messages for that agent/user pair

### Mid-conversation deletion

- If the agent is deleted while a user is chatting, the next prompt returns a graceful error ("Agent no longer available")

### Memory

- Shared agent memory belongs to the agent, not to any user
- Stays intact as users join/leave
- Cleaned up only when the last user deletes the agent

### Buddy agent

- Each user's personal buddy is private (`is_shared = 0`), unaffected
- Existing `user_id IS NULL` agents migrated to `is_shared = 1` with `agent_users` rows for all users

### Conversations

- User's conversation history with a shared agent persists after leaving (orphaned, not deleted)
- Only cleaned up when the agent itself is permanently deleted
