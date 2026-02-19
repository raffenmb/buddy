# Multi-User Support

**Date:** 2026-02-19
**Status:** Design approved, pending implementation plan

## Overview

Add multi-user support to Buddy so multiple people in a household can use the same server with their own agents, conversations, and memory — while sharing agents and data when appropriate.

## Motivation

Buddy runs on a dedicated home PC. Right now it's single-user: one shared auth token, one hardcoded session, global agents. A household has multiple people who each want their own agent with their own personality, memory, and conversation history. But they also want to share — e.g., a shared calendar agent that both users can talk to, or one user asking their agent to check another user's calendar via a shared agent.

## Design Decisions

### Authentication: Simple Username/Password

No OAuth, no email, no magic links. Username + password, bcrypt-hashed, stored in SQLite. JWT tokens (7-day expiry) for API and WebSocket auth. The server is on a home network — this is appropriate security for the trust level.

### First-Run Admin Setup in Terminal

When the server starts and finds zero users in the database, it runs an interactive CLI prompt before starting Express/WS:

```
Welcome to Buddy! Let's create your admin account.

  Username: raff
  Display name: Raff
  Password: ********
  Confirm password: ********

Admin account created. Starting server...
```

Uses Node.js `readline` stdlib. Server doesn't listen on any port until setup completes. No setup page on the frontend.

### Admin Rules

- First user created is admin (`is_admin = 1`)
- Admin can create/delete other users and promote/demote admins
- There must always be at least one admin — server blocks delete/demote if it would leave zero admins
- Non-admin users can manage their own agents and settings but not other users

### Agent Ownership: Per-User + Shared

- Each user has private agents (only they can see/use them)
- Shared agents (`user_id IS NULL`) are visible and usable by all users
- Only admin can create/delete shared agents
- Shared agents have separate conversation histories per user (same personality, separate threads)

### Data Sharing Model

The sharing boundary is the agent's ownership:

- **Shared agents:** Any user can access their data (memory, config). Any user's agent can read/write shared agent memory.
- **Private agents:** Only the owning user's agents can access data. User's own agents CAN read each other's memory (cross-agent within same user). Other users' agents CANNOT access private agent data.

Example: Raff has a private to-do agent and a private calendar agent. His calendar agent can read his to-do agent's memory. Sarah's agents cannot access either. But if there's a shared "household calendar" agent, both Raff's and Sarah's agents can read/write its memory.

### Skills: Global, Per-Agent Enable

Skills are installed once on the server (`~/.buddy/skills/`), available to all users. Each agent's `enabled_tools` controls which skills it uses. No per-user skill libraries.

### Platform Tools: No Per-User Scoping

`shell_exec`, `read_file`, `write_file`, etc. are host-level primitives. Any user's agent can run commands. The confirmation gate is the safety layer, not user-level permissions.

## Database Schema

### New Table: `users`

```sql
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  is_admin      INTEGER DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now'))
);
```

### Modified: `agents`

```sql
ALTER TABLE agents ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
-- NULL user_id = shared agent
```

### Modified: `sessions`

```sql
ALTER TABLE sessions ADD COLUMN user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE;
-- Replace hardcoded 'default' with per-user sessions
```

### Unchanged

- `messages` — already scoped by `session_id` + `agent_id`. User-scoped sessions make messages implicitly user-scoped.
- `agent_memory` — already scoped by `agent_id`. Agent ownership determines access.
- `agent_templates` — global. Reusable sub-agent configs, not data containers.

### Migration

1. Create `users` table
2. Add `user_id` column to `agents` (nullable)
3. Add `user_id` column to `sessions`
4. On first-run CLI setup: create admin user, update existing `buddy` agent and `default` session to reference admin's `user_id`

## Authentication Flow

### JWT

- Server secret auto-generated on first run, stored at `~/.buddy/config/jwt-secret.txt`
- JWT payload: `{ userId, username, isAdmin }`
- 7-day expiry
- Sent as `Authorization: Bearer <token>` on API requests
- Sent as `?token=<jwt>` on WebSocket connection

### API Endpoints

- `POST /api/auth/login` — `{ username, password }` -> `{ token, user }`
- `POST /api/auth/register` — admin only (or if zero users exist). `{ username, displayName, password }` -> `{ user }`
- `GET /api/auth/me` — validate token, return current user

### Middleware

Replace current single-token `authMiddleware` with JWT decode middleware:
- Decode JWT from `Authorization` header
- Attach `req.user = { id, username, isAdmin }` to request
- 401 if token missing/invalid/expired
- Auth endpoints (`/api/auth/login`) exempt from middleware

## API Changes

### Agent Routes

- `GET /api/agents` — returns agents where `user_id = req.user.id` OR `user_id IS NULL`
- `POST /api/agents` — creates with `user_id = req.user.id`. Optional `shared: true` creates with `user_id = NULL` (admin only)
- `PUT /api/agents/:id` — only if owned or shared
- `DELETE /api/agents/:id` — only if owned. Shared agents: admin only.

### Prompt Route

- `POST /api/prompt` — server verifies agent is owned by user or shared before processing. Session scoped by `user_id`.

### Session Routes

- `POST /api/session/reset` — resets only the requesting user's session
- Sessions auto-created per user on first prompt

### Memory Routes

- `GET/POST /api/agents/:id/memory` — allowed if: (a) you own the agent, (b) it's shared, (c) it belongs to another of your agents (same user). Denied for another user's private agent.

### New Admin Routes

- `GET /api/admin/users` — admin only, list all users
- `POST /api/admin/users` — admin only, create user
- `PUT /api/admin/users/:id` — admin only, update user (promote/demote admin)
- `DELETE /api/admin/users/:id` — admin only, delete user (blocked if last admin)

## WebSocket Changes

### Per-Connection State

```javascript
// Before: single global
let currentAgentId = 'buddy';

// After: per-connection map
const connections = new Map(); // ws -> { userId, agentId }
```

- On connect: decode JWT from `?token=`, store `userId` in map
- Agent switches update only that connection's state
- Canvas commands, subtitles, confirmation dialogs route to the originating connection only
- On disconnect: remove from map

### Confirmation Gate

Per-connection. If Raff's agent triggers a destructive command, only Raff sees the confirmation dialog.

## Frontend Changes

### New: Login Page

- Username + password form
- Shown when no valid JWT in `localStorage`
- On success: store token, fetch user, navigate to main app
- Matches existing pastel/Figtree design

### State Changes

- New `user` field in global state: `{ id, username, displayName, isAdmin }`
- On app load: check `localStorage` for JWT -> `GET /api/auth/me` -> set user or show login
- Logout: clear `localStorage`, reset state, show login

### Token Handling

- API fetch wrapper attaches `Authorization: Bearer <token>` to all requests
- `useWebSocket` passes token as `?token=<jwt>`
- On 401 from any API call: clear token, redirect to login

### Admin Panel

- New "Users" section (visible to admin only)
- User list with display names, admin toggle, delete button
- "Add User" form: username, display name, password
- Delete confirmation via `useAlert`
- Shared agents show a visual badge in agent list

### No Changes To

- Canvas, Avatar, InputBar, chart/table components
- Command router, reducer actions
- Theme, entry animations, TTS

## Filesystem Changes

```
~/.buddy/
  config/
    guards.json
    jwt-secret.txt              # NEW — JWT signing secret
  users/                        # NEW — per-user data
    <user-id>/
      agents/
        <agent-id>/
          user.md               # Per-user context for this agent
  agents/                       # Shared agent files (existing location)
    <agent-id>/
      identity.md
      user.md
  skills/                       # Global (unchanged)
  processes/                    # Global (unchanged)
  logs/                         # Global (unchanged)
  shared/                       # Global (unchanged)
  buddy.db                      # Single DB with user_id columns
```

## Sub-Agent Behavior

- `spawn_agent` inherits the calling user's context
- Sub-agents follow the same access rules as the parent agent's user
- `agent_templates` remain global
