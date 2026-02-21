/**
 * Shared workspace operations — lets agents share data through
 * user-scoped (private agents) or agent-scoped (shared agents) workspaces.
 */

import { randomUUID } from "crypto";
import db from "../db.js";
import { getAgent } from "../agents.js";

/**
 * Resolve the workspace ID for an agent.
 * Private agents → 'user-<userId>' (shared among all user's private agents)
 * Shared agents → 'agent-<agentId>' (isolated per shared agent)
 */
function resolveWorkspaceId(agentId, userId) {
  const agent = getAgent(agentId);
  if (!agent) return null;
  return agent.is_shared ? `agent-${agentId}` : `user-${userId}`;
}

/**
 * List all items in the agent's workspace.
 * Returns key, first 100 chars of value as preview, created_by, updated_at.
 */
export function listWorkspace(agentId, userId) {
  const workspaceId = resolveWorkspaceId(agentId, userId);
  if (!workspaceId) return { error: `Agent '${agentId}' not found` };
  const rows = db.prepare(
    "SELECT key, value, created_by, updated_at FROM workspace_items WHERE workspace_id = ? ORDER BY updated_at DESC"
  ).all(workspaceId);

  return rows.map((row) => ({
    key: row.key,
    preview: row.value.length > 100 ? row.value.slice(0, 100) + "..." : row.value,
    created_by: row.created_by,
    updated_at: row.updated_at,
  }));
}

/**
 * Read a specific item by key.
 */
export function readWorkspace(agentId, userId, key) {
  const workspaceId = resolveWorkspaceId(agentId, userId);
  if (!workspaceId) return { error: `Agent '${agentId}' not found` };
  const row = db.prepare(
    "SELECT key, value, created_by, created_at, updated_at FROM workspace_items WHERE workspace_id = ? AND key = ?"
  ).get(workspaceId, key);

  if (!row) return { error: `Item '${key}' not found in workspace` };
  return row;
}

/**
 * Create or update an item by key (upsert).
 */
export function writeWorkspace(agentId, userId, key, value) {
  const workspaceId = resolveWorkspaceId(agentId, userId);
  if (!workspaceId) return { error: `Agent '${agentId}' not found` };
  const id = randomUUID();

  db.prepare(`
    INSERT INTO workspace_items (id, workspace_id, key, value, created_by)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(workspace_id, key) DO UPDATE SET
      value = excluded.value,
      updated_at = datetime('now')
  `).run(id, workspaceId, key, value, agentId);

  return { status: "written", workspace_id: workspaceId, key };
}

/**
 * Delete an item by key.
 */
export function deleteWorkspace(agentId, userId, key) {
  const workspaceId = resolveWorkspaceId(agentId, userId);
  if (!workspaceId) return { error: `Agent '${agentId}' not found` };
  const result = db.prepare(
    "DELETE FROM workspace_items WHERE workspace_id = ? AND key = ?"
  ).run(workspaceId, key);

  if (result.changes === 0) return { error: `Item '${key}' not found in workspace` };
  return { status: "deleted", key };
}

/**
 * Copy an item from the current workspace into a shared agent's workspace.
 * Only allowed from private agent → shared agent direction.
 */
export function publishWorkspace(agentId, userId, key, targetAgentId, targetKey) {
  // Verify source agent is private (not shared)
  const sourceAgent = getAgent(agentId);
  if (!sourceAgent) return { error: `Agent '${agentId}' not found` };
  if (sourceAgent.is_shared) {
    return { error: "Cannot publish from a shared agent. Only private agents can publish to shared agents." };
  }

  // Verify target agent exists and is shared
  const targetAgent = getAgent(targetAgentId);
  if (!targetAgent) return { error: `Target agent '${targetAgentId}' not found` };
  if (!targetAgent.is_shared) {
    return { error: `Target agent '${targetAgentId}' is not a shared agent. Can only publish to shared agents.` };
  }

  // Read source item
  const sourceWorkspaceId = `user-${userId}`;
  const sourceItem = db.prepare(
    "SELECT value FROM workspace_items WHERE workspace_id = ? AND key = ?"
  ).get(sourceWorkspaceId, key);

  if (!sourceItem) return { error: `Item '${key}' not found in your workspace` };

  // Write to target workspace
  const targetWorkspaceId = `agent-${targetAgentId}`;
  const destKey = targetKey || key;
  const id = randomUUID();

  db.prepare(`
    INSERT INTO workspace_items (id, workspace_id, key, value, created_by)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(workspace_id, key) DO UPDATE SET
      value = excluded.value,
      updated_at = datetime('now')
  `).run(id, targetWorkspaceId, destKey, sourceItem.value, agentId);

  return { status: "published", from_key: key, to_agent: targetAgentId, to_key: destKey };
}
