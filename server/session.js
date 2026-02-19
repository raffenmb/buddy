/**
 * Session management — SQLite-backed conversation history,
 * scoped per user and agent.
 */

import { randomBytes } from "crypto";
import db from "./db.js";

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
  const rows = db.prepare(
    "SELECT role, content FROM messages WHERE session_id = ? AND agent_id = ? ORDER BY id"
  ).all(sessionId, agentId);

  return rows.map((row) => ({
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
  }
}
