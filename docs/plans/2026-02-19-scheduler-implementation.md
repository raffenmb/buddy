# Scheduler Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an in-process scheduler that lets agents create timed events (reminders, recurring tasks) and delivers responses to users via WebSocket, queuing for offline delivery.

**Architecture:** A polling loop in `server/scheduler.js` checks SQLite every 30 seconds for due schedules, calls `processPrompt()` to generate agent responses, and delivers via `broadcastToUser()` or queues in `pending_messages` for offline users. Three new platform tools let agents create/list/delete schedules.

**Tech Stack:** Node.js setInterval, SQLite (better-sqlite3), cron-parser (new dependency)

---

### Task 1: Install cron-parser dependency

**Files:**
- Modify: `server/package.json`

**Step 1: Install the package**

Run: `cd /home/raff/Desktop/projects/buddy/server && npm install cron-parser`

Expected: `cron-parser` added to `package.json` dependencies and `node_modules`.

**Step 2: Commit**

```bash
git add server/package.json server/package-lock.json
git commit -m "Add cron-parser dependency for schedule cron expressions"
```

---

### Task 2: Add schedules and pending_messages tables to database

**Files:**
- Modify: `server/db.js:18-72` (add tables to schema block)
- Modify: `server/db.js:74-84` (add index migration)

**Step 1: Add the two new tables to the schema block**

In `server/db.js`, add these tables inside the existing `db.exec(...)` block (after the `agent_templates` table, before the closing backtick+paren on line 72):

```sql
  CREATE TABLE IF NOT EXISTS schedules (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agent_id        TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    prompt          TEXT NOT NULL,
    schedule_type   TEXT NOT NULL CHECK(schedule_type IN ('one-shot', 'recurring')),
    run_at          TEXT,
    cron_expression TEXT,
    next_run_at     TEXT,
    enabled         INTEGER DEFAULT 1,
    created_at      TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pending_messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    schedule_id TEXT REFERENCES schedules(id) ON DELETE SET NULL,
    messages    TEXT NOT NULL,
    created_at  TEXT DEFAULT (datetime('now')),
    delivered   INTEGER DEFAULT 0
  );
```

**Step 2: Add an index on next_run_at for fast polling**

In the migrations section (after line 84), add:

```js
// Index for scheduler polling
try { db.exec("CREATE INDEX IF NOT EXISTS idx_schedules_next_run ON schedules(next_run_at) WHERE enabled = 1"); } catch {}
```

**Step 3: Verify the server starts without errors**

Run: `cd /home/raff/Desktop/projects/buddy/server && node -e "import('./db.js').then(() => console.log('DB OK'))"`

Expected: "DB OK" with no errors.

**Step 4: Commit**

```bash
git add server/db.js
git commit -m "Add schedules and pending_messages tables to database schema"
```

---

### Task 3: Create the scheduler module

**Files:**
- Create: `server/scheduler.js`

**Step 1: Create the scheduler module**

Create `server/scheduler.js` with the following:

```js
/**
 * In-process scheduler — polls SQLite every 30 seconds for due schedules,
 * triggers agent prompts, and queues responses for offline users.
 */

import db from "./db.js";
import { processPrompt } from "./claude-client.js";
import { splitAndBroadcast } from "./response-splitter.js";
import { getAgent } from "./agents.js";
import { default as cronParser } from "cron-parser";

const POLL_INTERVAL_MS = 30_000;
let intervalId = null;

// These get injected from index.js at startup
let broadcastToUser = null;
let isUserOnline = null;

/**
 * Start the scheduler polling loop.
 * @param {Object} hooks - Functions from index.js for broadcasting.
 * @param {Function} hooks.broadcastToUser - (userId, data) => void
 * @param {Function} hooks.isUserOnline - (userId) => boolean
 */
export function startScheduler(hooks) {
  broadcastToUser = hooks.broadcastToUser;
  isUserOnline = hooks.isUserOnline;

  console.log("[scheduler] Starting scheduler (polling every 30s)");

  // Run once immediately on startup to catch missed events
  checkSchedules();

  intervalId = setInterval(checkSchedules, POLL_INTERVAL_MS);
}

export function stopScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[scheduler] Scheduler stopped");
  }
}

/**
 * Poll for due schedules and execute them.
 */
async function checkSchedules() {
  const now = new Date().toISOString();
  const dueSchedules = db
    .prepare("SELECT * FROM schedules WHERE next_run_at <= ? AND enabled = 1")
    .all(now);

  if (dueSchedules.length === 0) return;

  console.log(`[scheduler] ${dueSchedules.length} schedule(s) due`);

  for (const schedule of dueSchedules) {
    try {
      await executeSchedule(schedule);
    } catch (err) {
      console.error(`[scheduler] Error executing schedule '${schedule.name}':`, err);
    }
  }
}

/**
 * Execute a single due schedule.
 */
async function executeSchedule(schedule) {
  // Temporarily disable to prevent double-fire if poll runs again during API call
  db.prepare("UPDATE schedules SET enabled = 0 WHERE id = ?").run(schedule.id);

  const agent = getAgent(schedule.agent_id);
  if (!agent) {
    console.warn(`[scheduler] Agent '${schedule.agent_id}' not found for schedule '${schedule.name}', disabling`);
    return;
  }

  const syntheticPrompt = `[SCHEDULED: ${schedule.name}] ${schedule.prompt}`;
  console.log(`[scheduler] Firing '${schedule.name}' for user ${schedule.user_id} via agent ${schedule.agent_id}`);

  try {
    // Call processPrompt — no confirmation callback (scheduled tasks run unattended)
    const result = await processPrompt(syntheticPrompt, schedule.agent_id, schedule.user_id, {});

    // Deliver or queue the response
    if (isUserOnline(schedule.user_id)) {
      const send = (data) => broadcastToUser(schedule.user_id, data);
      // Notify that this is from a scheduled task
      send({
        type: "canvas_command",
        command: "canvas_show_notification",
        params: { message: `Scheduled: ${schedule.name}`, type: "info" },
      });
      splitAndBroadcast(result.allToolCalls, result.finalTextContent, send);
    } else {
      // Queue for offline delivery
      const messages = buildMessageQueue(schedule, result);
      db.prepare(
        "INSERT INTO pending_messages (user_id, agent_id, schedule_id, messages) VALUES (?, ?, ?, ?)"
      ).run(schedule.user_id, schedule.agent_id, schedule.id, JSON.stringify(messages));
      console.log(`[scheduler] User offline — queued response for '${schedule.name}'`);
    }
  } catch (err) {
    console.error(`[scheduler] processPrompt failed for '${schedule.name}':`, err);
  }

  // Update schedule state
  if (schedule.schedule_type === "one-shot") {
    // Leave disabled, it's done
    console.log(`[scheduler] One-shot '${schedule.name}' completed`);
  } else {
    // Compute next run and re-enable
    const nextRun = computeNextRun(schedule.cron_expression);
    if (nextRun) {
      db.prepare("UPDATE schedules SET next_run_at = ?, enabled = 1 WHERE id = ?").run(
        nextRun,
        schedule.id
      );
      console.log(`[scheduler] Recurring '${schedule.name}' next run: ${nextRun}`);
    } else {
      console.warn(`[scheduler] Could not compute next run for '${schedule.name}', leaving disabled`);
    }
  }
}

/**
 * Build an array of WebSocket messages to queue for offline delivery.
 */
function buildMessageQueue(schedule, result) {
  const messages = [];

  // Notification that a scheduled task ran
  messages.push({
    type: "canvas_command",
    command: "canvas_show_notification",
    params: { message: `Scheduled: ${schedule.name}`, type: "info" },
  });

  // Canvas commands
  for (const toolCall of result.allToolCalls) {
    if (toolCall.name.startsWith("canvas_")) {
      messages.push({
        type: "canvas_command",
        command: toolCall.name,
        params: toolCall.input,
      });
    }
  }

  // Subtitle
  if (result.finalTextContent && result.finalTextContent.trim().length > 0) {
    messages.push({ type: "subtitle", text: result.finalTextContent });
  }

  return messages;
}

/**
 * Compute the next run time from a cron expression.
 * Returns an ISO string or null on failure.
 */
function computeNextRun(cronExpression) {
  try {
    const interval = cronParser.parseExpression(cronExpression);
    return interval.next().toISOString();
  } catch (err) {
    console.error(`[scheduler] Invalid cron expression '${cronExpression}':`, err.message);
    return null;
  }
}

// ─── Schedule CRUD (called by platform tool handlers) ───────────────────────

/**
 * Create a new schedule.
 */
export function createSchedule({ name, prompt, schedule_type, run_at, cron_expression, agent_id, user_id }) {
  const id = `sched-${Date.now().toString(36)}`;

  let next_run_at;
  if (schedule_type === "one-shot") {
    if (!run_at) throw new Error("run_at is required for one-shot schedules");
    next_run_at = new Date(run_at).toISOString();
  } else {
    if (!cron_expression) throw new Error("cron_expression is required for recurring schedules");
    next_run_at = computeNextRun(cron_expression);
    if (!next_run_at) throw new Error(`Invalid cron expression: ${cron_expression}`);
  }

  db.prepare(`
    INSERT INTO schedules (id, user_id, agent_id, name, prompt, schedule_type, run_at, cron_expression, next_run_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, user_id, agent_id, name, prompt, schedule_type, run_at || null, cron_expression || null, next_run_at);

  return { id, name, next_run_at };
}

/**
 * List schedules for a user.
 */
export function listSchedules(user_id, enabledOnly = true) {
  const query = enabledOnly
    ? "SELECT * FROM schedules WHERE user_id = ? AND enabled = 1 ORDER BY next_run_at"
    : "SELECT * FROM schedules WHERE user_id = ? ORDER BY next_run_at";
  return db.prepare(query).all(user_id);
}

/**
 * Delete a schedule.
 */
export function deleteSchedule(schedule_id, user_id) {
  const result = db.prepare("DELETE FROM schedules WHERE id = ? AND user_id = ?").run(schedule_id, user_id);
  if (result.changes === 0) throw new Error(`Schedule '${schedule_id}' not found`);
  return { deleted: true };
}

// ─── Pending Messages (offline delivery) ────────────────────────────────────

/**
 * Get and mark pending messages as delivered for a user.
 * Returns the messages array to replay.
 */
export function deliverPendingMessages(user_id) {
  const rows = db
    .prepare("SELECT * FROM pending_messages WHERE user_id = ? AND delivered = 0 ORDER BY created_at")
    .all(user_id);

  if (rows.length === 0) return [];

  // Mark as delivered
  db.prepare("UPDATE pending_messages SET delivered = 1 WHERE user_id = ? AND delivered = 0").run(user_id);

  // Flatten all messages from all pending rows
  const allMessages = [];
  for (const row of rows) {
    const messages = JSON.parse(row.messages);
    allMessages.push(...messages);
  }

  return allMessages;
}
```

**Step 2: Verify the module loads without errors**

Run: `cd /home/raff/Desktop/projects/buddy/server && node -e "import('./scheduler.js').then(() => console.log('OK'))"`

Expected: "OK" with no errors.

**Step 3: Commit**

```bash
git add server/scheduler.js
git commit -m "Add scheduler module with polling loop, CRUD, and offline delivery"
```

---

### Task 4: Add platform tool definitions for scheduling

**Files:**
- Modify: `server/tools.js:558-574` (add tools before PLATFORM_TOOL_NAMES, update the export)

**Step 1: Add the three new tool definitions**

In `server/tools.js`, add these three tools after the `create_agent_template` tool object (after the closing `}` on line 558, before the closing `];` on line 559):

```js
  {
    name: "create_schedule",
    description:
      "Create a scheduled event — a one-shot reminder/deadline or a recurring task. One-shot requires run_at (ISO datetime). Recurring requires cron_expression (standard 5-field cron: minute hour day-of-month month day-of-week). The agent will receive a prompt at the scheduled time.",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Human-readable name for this schedule (e.g. 'Dentist reminder', 'Weekly lesson plans').",
        },
        prompt: {
          type: "string",
          description: "The message that will be sent to the agent when this schedule fires.",
        },
        schedule_type: {
          type: "string",
          enum: ["one-shot", "recurring"],
          description: "One-shot fires once at run_at time. Recurring fires on the cron schedule.",
        },
        run_at: {
          type: "string",
          description: "ISO 8601 datetime for one-shot schedules (e.g. '2026-02-20T15:00:00'). Required for one-shot.",
        },
        cron_expression: {
          type: "string",
          description: "Standard 5-field cron expression for recurring schedules (e.g. '0 17 * * 1' = every Monday at 5pm). Required for recurring.",
        },
        agent_id: {
          type: "string",
          description: "Agent to handle this schedule. Defaults to the current agent.",
        },
      },
      required: ["name", "prompt", "schedule_type"],
    },
  },
  {
    name: "list_schedules",
    description:
      "List scheduled events for the current user. Shows name, type, next run time, and cron expression.",
    input_schema: {
      type: "object",
      properties: {
        enabled_only: {
          type: "boolean",
          description: "If true (default), only show enabled schedules. Set false to include completed/disabled ones.",
        },
      },
      required: [],
    },
  },
  {
    name: "delete_schedule",
    description:
      "Delete a scheduled event by its ID. Use list_schedules to find the ID.",
    input_schema: {
      type: "object",
      properties: {
        schedule_id: {
          type: "string",
          description: "The schedule ID to delete (e.g. 'sched-abc123').",
        },
      },
      required: ["schedule_id"],
    },
  },
```

**Step 2: Add the new tool names to PLATFORM_TOOL_NAMES**

Update the `PLATFORM_TOOL_NAMES` array (line 561-572) to include the three new names:

```js
export const PLATFORM_TOOL_NAMES = [
  "shell_exec",
  "read_file",
  "write_file",
  "list_directory",
  "process_start",
  "process_stop",
  "process_status",
  "process_logs",
  "spawn_agent",
  "create_agent_template",
  "create_schedule",
  "list_schedules",
  "delete_schedule",
];
```

**Step 3: Verify tools load correctly**

Run: `cd /home/raff/Desktop/projects/buddy/server && node -e "import('./tools.js').then(m => { console.log('Tools:', m.default.length); console.log('Platform:', m.PLATFORM_TOOL_NAMES.length) })"`

Expected: `Tools: 23` (was 20), `Platform: 13` (was 10)

**Step 4: Commit**

```bash
git add server/tools.js
git commit -m "Add create_schedule, list_schedules, delete_schedule platform tools"
```

---

### Task 5: Add tool handlers in claude-client.js

**Files:**
- Modify: `server/claude-client.js:1-19` (add import)
- Modify: `server/claude-client.js:300-313` (add handlers before the default canvas return)

**Step 1: Add the scheduler import**

Add to the imports at the top of `server/claude-client.js` (after line 18):

```js
import { createSchedule, listSchedules, deleteSchedule } from "./scheduler.js";
```

**Step 2: Add tool handlers**

In the tool-use loop, add handlers for the three new tools. Insert them after the `create_agent_template` handler (after line 307) and before the default canvas return (line 308-312):

```js
        if (toolUse.name === "create_schedule") {
          try {
            const result = createSchedule({
              ...toolUse.input,
              agent_id: toolUse.input.agent_id || agentId,
              user_id: userId,
            });
            return {
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: JSON.stringify(result),
            };
          } catch (err) {
            return {
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: JSON.stringify({ error: err.message }),
              is_error: true,
            };
          }
        }
        if (toolUse.name === "list_schedules") {
          const result = listSchedules(userId, toolUse.input.enabled_only !== false);
          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          };
        }
        if (toolUse.name === "delete_schedule") {
          try {
            const result = deleteSchedule(toolUse.input.schedule_id, userId);
            return {
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: JSON.stringify(result),
            };
          } catch (err) {
            return {
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: JSON.stringify({ error: err.message }),
              is_error: true,
            };
          }
        }
```

**Step 3: Commit**

```bash
git add server/claude-client.js
git commit -m "Add schedule tool handlers to Claude client tool-use loop"
```

---

### Task 6: Wire scheduler startup and offline delivery into index.js

**Files:**
- Modify: `server/index.js:1-23` (add imports)
- Modify: `server/index.js:504-514` (add offline delivery on WS connect)
- Modify: `server/index.js:566-577` (start scheduler after server listen)

**Step 1: Add imports**

Add to the imports at the top of `server/index.js` (after line 23):

```js
import { startScheduler, deliverPendingMessages } from "./scheduler.js";
```

**Step 2: Add isUserOnline helper**

Add this function after the `broadcastToUser` function (after line 64):

```js
function isUserOnline(userId) {
  for (const [ws, conn] of wsConnections) {
    if (conn.userId === userId && ws.readyState === 1) return true;
  }
  return false;
}
```

**Step 3: Add offline delivery on WebSocket connection**

In the `wss.on("connection", ...)` handler, after the connection is authenticated and added to `wsConnections` (after line 514, `console.log(...)`), add:

```js
  // Deliver any pending messages from schedules that fired while offline
  const pending = deliverPendingMessages(decoded.userId);
  if (pending.length > 0) {
    // Count unique scheduled tasks in the pending batch
    const scheduledCount = pending.filter(m => m.type === "canvas_command" && m.command === "canvas_show_notification").length;
    if (scheduledCount > 0) {
      sendTo(ws, {
        type: "canvas_command",
        command: "canvas_show_notification",
        params: {
          message: `${scheduledCount} scheduled task${scheduledCount > 1 ? "s" : ""} ran while you were away`,
          type: "info",
          duration_ms: 5000,
        },
      });
    }
    // Replay all queued messages
    for (const msg of pending) {
      sendTo(ws, msg);
    }
    console.log(`[scheduler] Delivered ${pending.length} pending messages to ${decoded.username}`);
  }
```

**Step 4: Start the scheduler after server listen**

In the startup block (line 568-577), add `startScheduler()` after the server starts listening. Modify the `server.listen` callback:

```js
  server.listen(PORT, () => {
    console.log(`Buddy server running on http://localhost:${PORT}`);
    console.log(`WebSocket server ready on ws://localhost:${PORT}`);
    console.log(`Environment: ${process.env.BUDDY_ENV || "development"}`);
    console.log(`Data directory: ${DIRS.root}`);

    // Start the scheduler after server is ready
    startScheduler({ broadcastToUser, isUserOnline });
  });
```

**Step 5: Commit**

```bash
git add server/index.js
git commit -m "Wire scheduler startup and offline message delivery into server"
```

---

### Task 7: Update system prompt with scheduling instructions

**Files:**
- Modify: `server/system-prompt.md:26-51` (add scheduling section after Sub-Agents section)

**Step 1: Add scheduling section to system prompt**

In `server/system-prompt.md`, add this section after the Sub-Agents section (after line 51, before the skill usage instructions):

```markdown
### Scheduling

You can create timed events that fire automatically — reminders, deadlines, and recurring tasks.

- `create_schedule` creates a one-shot or recurring schedule. One-shot schedules need a `run_at` datetime. Recurring schedules need a `cron_expression` (standard 5-field: minute hour day-of-month month day-of-week).
- `list_schedules` shows the user's active schedules.
- `delete_schedule` removes a schedule by ID.

When a scheduled event fires, you'll receive a message like `[SCHEDULED: Weekly lesson plans] Build out my lesson plans for next week.` — respond naturally and do the work as if the user asked you directly. Don't mention that it was triggered by a schedule unless it's relevant.

Common cron patterns:
- `0 9 * * *` — every day at 9am
- `0 17 * * 1` — every Monday at 5pm
- `30 8 * * 1-5` — weekdays at 8:30am
- `0 0 1 * *` — first of every month at midnight

When a user mentions a reminder, deadline, or recurring task, proactively create a schedule for them. Confirm what you've set up with the name and next run time.
```

**Step 2: Commit**

```bash
git add server/system-prompt.md
git commit -m "Add scheduling instructions to agent system prompt"
```

---

### Task 8: Update CLAUDE.md documentation

**Files:**
- Modify: `CLAUDE.md` (add new tools to platform primitives table, add scheduler module to key server modules)

**Step 1: Add the three new tools to the platform primitives table**

In `CLAUDE.md`, find the platform primitives table and add:

```markdown
| `create_schedule` | Create one-shot or recurring scheduled events |
| `list_schedules` | List a user's scheduled events |
| `delete_schedule` | Remove a scheduled event |
```

**Step 2: Add scheduler.js to key server modules**

Add to the "Key Server Modules" section:

```markdown
- `server/scheduler.js` — In-process scheduler: 30s polling loop, schedule CRUD, processPrompt trigger, offline message queuing and delivery
```

**Step 3: Add pending_messages and schedules to SQLite tables**

Add to the SQLite tables documentation:

```markdown
| `schedules` | Timed events (one-shot reminders, recurring tasks) |
| `pending_messages` | Queued responses for offline users from scheduled events |
```

**Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "Document scheduler tools, module, and tables in CLAUDE.md"
```

---

### Task 9: Manual smoke test

**Step 1: Start the server**

Run: `cd /home/raff/Desktop/projects/buddy/server && node index.js`

Expected: Server starts, logs include `[scheduler] Starting scheduler (polling every 30s)`.

**Step 2: Test schedule creation via the UI**

Open the app, log in, and ask Buddy: "Remind me in 2 minutes to stretch."

Expected: Buddy calls `create_schedule` with a one-shot schedule, confirms the reminder name and time.

**Step 3: Wait for the schedule to fire**

Wait ~2 minutes. Expected: A notification appears ("Scheduled: ...") followed by Buddy's reminder response as a subtitle.

**Step 4: Test recurring schedule**

Ask: "Every day at 9am, tell me good morning."

Expected: Buddy creates a recurring schedule with cron expression `0 9 * * *`, confirms it's set.

**Step 5: Test list and delete**

Ask: "What schedules do I have?" then "Delete the good morning one."

Expected: Agent calls `list_schedules`, shows results, then calls `delete_schedule` to remove it.

**Step 6: Test offline delivery**

Create a schedule that fires in 1 minute, close the browser, wait 2 minutes, reopen. Expected: notification "1 scheduled task ran while you were away" followed by the agent's response.
