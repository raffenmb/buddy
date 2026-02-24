/**
 * Memory operations — native platform tools for agent memory CRUD + search.
 * Wraps existing DB functions from agents.js with tool-friendly return shapes.
 */

import db from "../db.js";
import { setMemory, deleteMemory, getMemories } from "../agents.js";

/**
 * Save a memory (create or update).
 */
export function saveMemory(agentId, key, value) {
  setMemory(agentId, key, value);
  return { status: "saved", key, value };
}

/**
 * Search memories by LIKE query across keys and values.
 */
export function searchMemories(agentId, query) {
  const pattern = `%${query}%`;
  const rows = db.prepare(
    "SELECT key, value FROM agent_memory WHERE agent_id = ? AND (key LIKE ? OR value LIKE ?) ORDER BY updated_at DESC"
  ).all(agentId, pattern, pattern);

  return { results: rows, count: rows.length };
}

/**
 * List memory keys with optional limit.
 */
export function listMemoryKeys(agentId, limit) {
  const memories = getMemories(agentId);
  const keys = memories.map((m) => m.key);
  const total = keys.length;

  if (limit && limit < total) {
    return { keys: keys.slice(0, limit), count: limit, total };
  }
  return { keys, count: total, total };
}

/**
 * Remove a memory by key.
 */
export function removeMemory(agentId, key) {
  const result = deleteMemory(agentId, key);
  if (result.changes === 0) {
    return { error: `Memory '${key}' not found` };
  }
  return { status: "deleted", key };
}
