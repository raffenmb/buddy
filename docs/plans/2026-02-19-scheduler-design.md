# Scheduler Design — Agent-Driven Timed Events

**Date:** 2026-02-19
**Branch:** feature/scheduler
**Approach:** In-Process Scheduler (Approach 1)

## Overview

A server-side scheduler that lets agents create timed events — one-shot reminders, deadlines, and recurring tasks. When an event fires, the server injects a synthetic prompt into the agent's conversation, calls the Claude API, and delivers the response to the user. If the user is offline, responses are queued and delivered on reconnect.

The agent creates and manages schedules via platform tools during normal conversation. No admin UI required — schedules are managed conversationally.

## Database Schema

### `schedules` table

| Column | Type | Purpose |
|--------|------|---------|
| `id` | TEXT PK | Unique ID (e.g. `sched-a7b3c`) |
| `user_id` | TEXT FK → users | Owner |
| `agent_id` | TEXT FK → agents | Which agent handles the trigger |
| `name` | TEXT NOT NULL | Human-readable label |
| `prompt` | TEXT NOT NULL | Message injected when it fires |
| `schedule_type` | TEXT NOT NULL | `"one-shot"` or `"recurring"` |
| `run_at` | TEXT | ISO datetime for one-shot events |
| `cron_expression` | TEXT | Cron string for recurring (e.g. `0 17 * * 1`) |
| `next_run_at` | TEXT | Pre-computed next fire time (indexed) |
| `enabled` | INTEGER DEFAULT 1 | Toggle |
| `created_at` | TEXT | Timestamp |

`next_run_at` is pre-computed so the poller query is a simple comparison — no cron parsing at query time.

### `pending_messages` table

| Column | Type | Purpose |
|--------|------|---------|
| `id` | INTEGER PK | Auto-increment |
| `user_id` | TEXT FK → users | Recipient |
| `agent_id` | TEXT FK → agents | Which agent generated the response |
| `schedule_id` | TEXT FK → schedules | Which schedule triggered it |
| `messages` | TEXT | JSON array of WebSocket messages |
| `created_at` | TEXT | When the schedule fired |
| `delivered` | INTEGER DEFAULT 0 | 0 = pending, 1 = delivered |

## Platform Tools

Three new tools added to `tools.js`, always available:

### `create_schedule`

```
Inputs:
  name: string (required)
  prompt: string (required)
  schedule_type: "one-shot" | "recurring" (required)
  run_at: ISO datetime (required for one-shot)
  cron_expression: cron string (required for recurring)
  agent_id: string (optional, defaults to calling agent)

Returns: { id, name, next_run_at }
```

### `list_schedules`

```
Inputs:
  enabled_only: boolean (optional, default true)

Returns: array of schedule objects
```

### `delete_schedule`

```
Inputs:
  schedule_id: string (required)

Returns: { deleted: true }
```

No `update_schedule` — delete and recreate. Can add later if needed.

## Scheduler Module (`server/scheduler.js`)

### Startup

- `startScheduler()` called from `server/index.js` after server starts
- Sets `setInterval` polling loop every 30 seconds
- Runs one immediate check on startup (catches events that fired while server was down)

### Poll Cycle (`checkSchedules()`)

1. Query: `SELECT * FROM schedules WHERE next_run_at <= datetime('now') AND enabled = 1`
2. For each due schedule:
   - Mark as processing (prevent double-fire)
   - Inject synthetic user message: `[SCHEDULED: {name}] {prompt}`
   - Call `processPrompt()` with the schedule's `user_id` and `agent_id`
   - Capture response (subtitle + canvas commands)
   - If user online: broadcast via `broadcastToUser()`
   - If user offline: write to `pending_messages`
   - Update schedule:
     - One-shot: set `enabled = 0`
     - Recurring: compute next `next_run_at` from cron expression

### Offline Delivery

- On WebSocket connection auth, check `pending_messages` for that `user_id`
- Send a notification: "N scheduled tasks ran while you were away"
- Replay queued messages in order
- Mark as `delivered = 1`

## Dependency

`cron-parser` npm package — parses cron expressions and computes next occurrence. Tiny, no transitive dependencies.

## System Prompt Changes

Add scheduling tools to the platform tools section in `server/system-prompt.md`:

- Document the three new tools
- Instruct agent to proactively create schedules when users mention deadlines/reminders/recurring tasks
- Instruct agent to respond naturally to `[SCHEDULED: name]` prefixed messages

## Frontend Changes

Minimal:

- **No new components** — schedules managed conversationally
- **No admin UI changes** — agent handles CRUD via tools
- **WebSocket reconnect** — server replays pending messages as normal subtitle/canvas_command messages, preceded by an info notification
- Queued messages are indistinguishable from live messages to the frontend

## Design Decisions

- **In-process scheduler** over separate daemon — simplest, direct access to `processPrompt()` and `broadcastToUser()`, no IPC needed
- **30-second polling** over event-driven — sub-millisecond SQLite queries make this effectively free; adequate granularity for reminders and tasks
- **Pre-computed `next_run_at`** over runtime cron parsing — keeps the hot path (poll query) trivial
- **Conversation-first** over admin UI — aligns with project principle that the agent IS the interface
- **Execute-and-queue** over skip-if-offline — recurring tasks like lesson plan building should run regardless of user presence
