/**
 * Session management — SQLite-backed conversation history,
 * scoped per agent. Named function exports replace the old singleton class.
 */

import db from "./db.js";

/**
 * Append a user message to the conversation history.
 * @param {string} text - The user's input text.
 * @param {string} agentId - Agent to scope the message to.
 */
export function addUserMessage(text, agentId = "buddy") {
  db.prepare(
    "INSERT INTO messages (session_id, agent_id, role, content) VALUES ('default', ?, 'user', ?)"
  ).run(agentId, JSON.stringify(text));
}

/**
 * Append an assistant response to the conversation history.
 * Stores the full content array (text blocks + tool_use blocks) as JSON.
 * @param {object} response - The Claude API response object.
 * @param {string} agentId - Agent to scope the message to.
 */
export function addAssistantResponse(response, agentId = "buddy") {
  db.prepare(
    "INSERT INTO messages (session_id, agent_id, role, content) VALUES ('default', ?, 'assistant', ?)"
  ).run(agentId, JSON.stringify(response.content));
}

/**
 * Append tool results back into the conversation as a user message.
 * The Claude API expects tool_result blocks wrapped in a user role message.
 * @param {Array} results - Array of tool_result content blocks.
 * @param {string} agentId - Agent to scope the message to.
 */
export function addToolResults(results, agentId = "buddy") {
  db.prepare(
    "INSERT INTO messages (session_id, agent_id, role, content) VALUES ('default', ?, 'user', ?)"
  ).run(agentId, JSON.stringify(results));
}

/**
 * Return the full message history for the Claude API call, scoped to an agent.
 * @param {string} agentId - Agent whose history to retrieve.
 * @returns {Array} Array of message objects with role and parsed content.
 */
export function getMessages(agentId = "buddy") {
  const rows = db.prepare(
    "SELECT role, content FROM messages WHERE session_id = 'default' AND agent_id = ? ORDER BY id"
  ).all(agentId);

  return rows.map((row) => ({
    role: row.role,
    content: JSON.parse(row.content),
  }));
}

/**
 * Delete messages — by agent or all.
 * @param {string|null} agentId - If provided, only delete that agent's messages. Null = all.
 */
export function resetSession(agentId = null) {
  if (agentId) {
    db.prepare(
      "DELETE FROM messages WHERE session_id = 'default' AND agent_id = ?"
    ).run(agentId);
  } else {
    db.prepare("DELETE FROM messages WHERE session_id = 'default'").run();
  }
}
