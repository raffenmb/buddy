/**
 * Session management — SQLite-backed conversation history,
 * scoped per user and agent.
 */

import { randomBytes } from "crypto";
import db from "./db.js";

// Token budget for the sliding message window.
// Claude's context is 200K tokens. We reserve ~120K for messages,
// leaving room for system prompt (~5K), tools (~15K), canvas state, and response.
const MESSAGE_TOKEN_BUDGET = 120000;

// Rough token estimate: ~4 characters per token
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * Get or create a session for a user.
 * Each user gets one session (auto-created on first use).
 */
function ensureSession(userId) {
  const existing = db.prepare("SELECT id FROM sessions WHERE user_id = ?").get(userId);
  if (existing) return existing.id;

  const id = `session-${randomBytes(8).toString("hex")}`;
  db.prepare("INSERT INTO sessions (id, user_id) VALUES (?, ?)").run(id, userId);
  return id;
}

export function addUserMessage(text, agentId = "buddy", userId) {
  const sessionId = ensureSession(userId);
  db.prepare(
    "INSERT INTO messages (session_id, agent_id, role, content) VALUES (?, ?, 'user', ?)"
  ).run(sessionId, agentId, JSON.stringify(text));
}

export function addAssistantResponse(response, agentId = "buddy", userId) {
  const sessionId = ensureSession(userId);
  db.prepare(
    "INSERT INTO messages (session_id, agent_id, role, content) VALUES (?, ?, 'assistant', ?)"
  ).run(sessionId, agentId, JSON.stringify(response.content));
}

export function addToolResults(results, agentId = "buddy", userId) {
  const sessionId = ensureSession(userId);
  db.prepare(
    "INSERT INTO messages (session_id, agent_id, role, content) VALUES (?, ?, 'user', ?)"
  ).run(sessionId, agentId, JSON.stringify(results));
}

export function getMessages(agentId = "buddy", userId) {
  const sessionId = ensureSession(userId);

  // Query from the tail — LIMIT 200 is far more than will ever fit in context,
  // but ensures the query is O(1) regardless of total table size.
  const rows = db.prepare(
    "SELECT role, content FROM messages WHERE session_id = ? AND agent_id = ? ORDER BY id DESC LIMIT 200"
  ).all(sessionId, agentId);

  // Reverse to chronological order
  rows.reverse();

  // Walk from newest to oldest, accumulating tokens
  let totalTokens = 0;
  let cutoff = 0;

  for (let i = rows.length - 1; i >= 0; i--) {
    const tokens = estimateTokens(rows[i].content);
    if (totalTokens + tokens > MESSAGE_TOKEN_BUDGET) {
      cutoff = i + 1;
      break;
    }
    totalTokens += tokens;
  }

  // Ensure we don't start on an assistant or tool_result message —
  // Claude requires messages to start with a user role.
  while (cutoff < rows.length && rows[cutoff].role !== "user") {
    cutoff++;
  }

  const windowed = rows.slice(cutoff);

  return windowed.map((row) => ({
    role: row.role,
    content: JSON.parse(row.content),
  }));
}

export function resetSession(userId, agentId = null) {
  const sessionId = ensureSession(userId);
  if (agentId) {
    db.prepare(
      "DELETE FROM messages WHERE session_id = ? AND agent_id = ?"
    ).run(sessionId, agentId);
  } else {
    db.prepare("DELETE FROM messages WHERE session_id = ?").run(sessionId);
    // Clear canvas state on full session reset
    db.prepare(
      "UPDATE sessions SET canvas_state = '{\"elements\":[]}' WHERE id = ?"
    ).run(sessionId);
  }
}

export function getCanvasState(userId) {
  const sessionId = ensureSession(userId);
  const row = db.prepare(
    "SELECT canvas_state FROM sessions WHERE id = ?"
  ).get(sessionId);
  if (!row || !row.canvas_state) return [];
  try {
    const parsed = JSON.parse(row.canvas_state);
    return parsed.elements || [];
  } catch {
    return [];
  }
}

export function updateCanvasState(userId, elements) {
  const sessionId = ensureSession(userId);
  db.prepare(
    "UPDATE sessions SET canvas_state = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(JSON.stringify({ elements }), sessionId);
}

export function applyCanvasCommand(userId, commandName, params) {
  const elements = getCanvasState(userId);

  switch (commandName) {
    case "canvas_set_mode": {
      if (params.mode === "clear") {
        updateCanvasState(userId, []);
        return;
      }
      return;
    }
    case "canvas_add_card":
      elements.push({ type: "card", ...params });
      break;
    case "canvas_show_text":
      elements.push({ type: "text", ...params });
      break;
    case "canvas_show_chart":
      elements.push({ type: "chart", ...params });
      break;
    case "canvas_show_table":
      elements.push({ type: "table", ...params });
      break;
    case "canvas_play_media":
      elements.push({ type: "media", ...params });
      break;
    case "canvas_show_confirmation":
      // Confirmations are ephemeral (60s timeout) — don't persist
      return;
    case "canvas_update_card": {
      const idx = elements.findIndex(el => el.id === params.id);
      if (idx !== -1) elements[idx] = { ...elements[idx], ...params };
      break;
    }
    case "canvas_remove_element": {
      const removeIdx = elements.findIndex(el => el.id === params.id);
      if (removeIdx !== -1) elements.splice(removeIdx, 1);
      break;
    }
    case "canvas_show_notification":
    case "canvas_set_theme":
      return;
    default:
      return;
  }

  updateCanvasState(userId, elements);
}
