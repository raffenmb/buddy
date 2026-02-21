/**
 * In-process scheduler — polls SQLite every 30 seconds for due schedules,
 * triggers agent prompts, and queues responses for offline users.
 */

import db from "./db.js";
import { processPrompt } from "./claude-client.js";
import { splitAndBroadcast } from "./response-splitter.js";
import { getAgent } from "./agents.js";
import { sendPushNotification } from "./push.js";
import { CronExpressionParser } from "cron-parser";

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
      send({ type: "processing", status: true });
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

      // Send push notification to mobile device
      await sendPushNotification(
        schedule.user_id,
        "Buddy",
        `Scheduled: ${schedule.name}`
      );
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
    const interval = CronExpressionParser.parse(cronExpression);
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
