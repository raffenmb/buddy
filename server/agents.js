/**
 * Agent registry — CRUD for agents, per-agent memory, and file-based
 * identity/user prompts, all backed by SQLite + filesystem.
 * Seeds the default "buddy" agent on import (unclaimed for backward-compat).
 * Call seedBuddyAgent(userId) to claim or create a buddy for a specific user.
 */

import db from "./db.js";
import { join } from "path";
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, rmSync, unlinkSync, statSync } from "fs";
import { DIRS } from "./config.js";

const AGENTS_DIR = DIRS.agents;

const CORE_FILES = ["identity.md", "user.md"];

// ─── Default personality (written to identity.md for buddy) ──────────────────

const BUDDY_PERSONALITY = `Warm, friendly, slightly casual. Think helpful friend, not corporate assistant.
You can be playful and have personality. React to what the user says.
You're a presence in their space. Be natural.`;

const DEFAULT_PERSONALITY = `Be helpful and friendly.`;

// ─── File system setup ───────────────────────────────────────────────────────

function ensureAgentDir(agentId) {
  const dir = join(AGENTS_DIR, agentId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// Create agents/ root and buddy/ directory with default files
if (!existsSync(AGENTS_DIR)) {
  mkdirSync(AGENTS_DIR, { recursive: true });
}

const buddyDir = ensureAgentDir("buddy");
if (!existsSync(join(buddyDir, "identity.md"))) {
  writeFileSync(join(buddyDir, "identity.md"), BUDDY_PERSONALITY, "utf-8");
}
if (!existsSync(join(buddyDir, "user.md"))) {
  writeFileSync(join(buddyDir, "user.md"), "", "utf-8");
}

// ─── Seed default agent ───────────────────────────────────────────────────────

const defaultModel = process.env.CLAUDE_MODEL || "claude-sonnet-4-5-20250929";

export function seedBuddyAgent(userId) {
  const existingBuddy = db.prepare(
    "SELECT id, user_id FROM agents WHERE id = 'buddy' AND (user_id = ? OR user_id IS NULL)"
  ).get(userId);
  if (existingBuddy) {
    // If it's unclaimed, claim it
    if (!existingBuddy.user_id) {
      db.prepare("UPDATE agents SET user_id = ? WHERE id = 'buddy' AND user_id IS NULL").run(userId);
    }
    return;
  }

  // 'buddy' id is taken by another user — create a user-specific buddy
  const agentId = db.prepare("SELECT id FROM agents WHERE id = 'buddy'").get()
    ? `buddy-${userId.slice(0, 8)}`
    : "buddy";

  db.prepare(`
    INSERT INTO agents (id, name, model, system_prompt, user_id)
    VALUES (?, 'Buddy', ?, ?, ?)
  `).run(agentId, defaultModel, BUDDY_PERSONALITY, userId);

  db.prepare("UPDATE agents SET enabled_tools = ? WHERE id = ? AND enabled_tools IS NULL").run(
    JSON.stringify(["search-youtube"]), agentId
  );

  const dir = ensureAgentDir(agentId);
  if (!existsSync(join(dir, "identity.md"))) {
    writeFileSync(join(dir, "identity.md"), BUDDY_PERSONALITY, "utf-8");
  }
  if (!existsSync(join(dir, "user.md"))) {
    writeFileSync(join(dir, "user.md"), "", "utf-8");
  }
}

// Backward-compat: seed buddy without user for fresh installs
const buddyExists = db.prepare("SELECT id FROM agents WHERE id = 'buddy'").get();
if (!buddyExists) {
  db.prepare(`INSERT INTO agents (id, name, model, system_prompt) VALUES ('buddy', 'Buddy', ?, ?)`).run(defaultModel, BUDDY_PERSONALITY);
  db.prepare("UPDATE agents SET enabled_tools = ? WHERE id = 'buddy' AND enabled_tools IS NULL").run(JSON.stringify(["search-youtube"]));
  const dir = ensureAgentDir("buddy");
  if (!existsSync(join(dir, "identity.md"))) writeFileSync(join(dir, "identity.md"), BUDDY_PERSONALITY, "utf-8");
  if (!existsSync(join(dir, "user.md"))) writeFileSync(join(dir, "user.md"), "", "utf-8");
}

// ─── Migration: rename old tool names to skill folder names ──────────────────

const TOOL_RENAMES = { search_youtube: "search-youtube", remember_fact: "remember-fact" };
const DEPRECATED_SKILLS = ["remember-fact"];
const PLATFORM_TOOLS = [
  "shell_exec", "read_file", "write_file", "list_directory",
  "process_start", "process_stop", "process_status", "process_logs",
  "spawn_agent", "create_agent_template",
  "create_schedule", "list_schedules", "delete_schedule",
  "workspace_list", "workspace_read", "workspace_write", "workspace_delete", "workspace_publish",
  "memory_save", "memory_search", "memory_list", "memory_delete",
  "browser_open", "browser_snapshot", "browser_screenshot", "browser_click",
  "browser_type", "browser_navigate", "browser_close",
];

for (const agent of db.prepare("SELECT id, enabled_tools FROM agents").all()) {
  if (!agent.enabled_tools) continue;
  let tools;
  try {
    tools = JSON.parse(agent.enabled_tools);
  } catch { continue; }
  if (!Array.isArray(tools)) continue;

  let changed = false;
  tools = tools.map((name) => {
    if (TOOL_RENAMES[name]) { changed = true; return TOOL_RENAMES[name]; }
    return name;
  });
  // Remove platform tool names — they're always on and redundant in enabled_tools
  // Also remove deprecated skills replaced by native platform tools
  const before = tools.length;
  tools = tools.filter((name) => !PLATFORM_TOOLS.includes(name) && !DEPRECATED_SKILLS.includes(name));
  if (tools.length !== before) changed = true;

  if (changed) {
    db.prepare("UPDATE agents SET enabled_tools = ? WHERE id = ?").run(
      tools.length > 0 ? JSON.stringify(tools) : null,
      agent.id
    );
  }
}

// ─── Agent CRUD ───────────────────────────────────────────────────────────────

export function getAgent(id) {
  return db.prepare("SELECT * FROM agents WHERE id = ?").get(id);
}

export function listAgents(userId) {
  return db.prepare(`
    SELECT a.id, a.name, a.model, a.avatar, a.enabled_tools, a.avatar_config, a.voice_config, a.user_id, a.is_shared,
      CASE WHEN a.is_shared = 1
        THEN (SELECT COUNT(*) FROM agent_users WHERE agent_id = a.id)
        ELSE NULL
      END AS userCount
    FROM agents a
    WHERE (a.is_shared = 0 AND a.user_id = ?)
       OR (a.is_shared = 1 AND a.id IN (SELECT agent_id FROM agent_users WHERE user_id = ?))
  `).all(userId, userId);
}

export function createAgent({ id, name, model, system_prompt, avatar_config, voice_config, identity, user_info, userId, shared }) {
  const m = model || defaultModel;
  const sp = system_prompt || DEFAULT_PERSONALITY;
  const av = avatar_config ? JSON.stringify(avatar_config) : "{}";
  const vc = voice_config ? JSON.stringify(voice_config) : "{}";
  const isShared = shared ? 1 : 0;

  db.prepare(`
    INSERT INTO agents (id, name, model, system_prompt, avatar_config, voice_config, user_id, is_shared)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, m, sp, av, vc, isShared ? null : (userId || null), isShared);

  if (isShared) {
    const allUsers = db.prepare("SELECT id FROM users").all();
    const insert = db.prepare("INSERT OR IGNORE INTO agent_users (agent_id, user_id) VALUES (?, ?)");
    const seed = db.transaction(() => {
      for (const user of allUsers) {
        insert.run(id, user.id);
      }
    });
    seed();
  }

  // Create folder + core files (identity.md holds personality only)
  const dir = ensureAgentDir(id);
  writeFileSync(join(dir, "identity.md"), identity || DEFAULT_PERSONALITY, "utf-8");
  writeFileSync(join(dir, "user.md"), user_info || "", "utf-8");

  return getAgent(id);
}

export function updateAgent(id, fields) {
  const allowed = ["name", "model", "system_prompt", "avatar_config", "voice_config", "avatar", "enabled_tools"];
  const sets = [];
  const values = [];

  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = ?`);
      let val = fields[key];
      if (key === "avatar_config" || key === "voice_config") {
        val = JSON.stringify(val);
      } else if (key === "enabled_tools") {
        val = val === null ? null : JSON.stringify(val);
      }
      values.push(val);
    }
  }

  if (sets.length === 0) return null;

  sets.push("updated_at = datetime('now')");
  values.push(id);

  return db.prepare(`UPDATE agents SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

export function deleteAgent(id, userId) {
  if (id === "buddy") {
    throw new Error("Cannot delete the default buddy agent");
  }
  const agent = getAgent(id);
  if (!agent) throw new Error("Agent not found");

  if (agent.is_shared) {
    // Remove this user from the shared agent
    db.prepare("DELETE FROM agent_users WHERE agent_id = ? AND user_id = ?").run(id, userId);

    // Clean up user's schedules and pending messages for this agent
    db.prepare("DELETE FROM schedules WHERE agent_id = ? AND user_id = ?").run(id, userId);
    db.prepare("DELETE FROM pending_messages WHERE agent_id = ? AND user_id = ?").run(id, userId);

    // Check if anyone is left
    const remaining = db.prepare("SELECT COUNT(*) AS cnt FROM agent_users WHERE agent_id = ?").get(id);
    if (remaining.cnt > 0) {
      return { detached: true }; // Other users still have it
    }
    // Last user — fall through to full delete
  } else {
    // Private agent — only owner can delete
    if (agent.user_id && agent.user_id !== userId) {
      throw new Error("Cannot delete another user's agent");
    }
  }

  // Full delete (private agent, or last user on shared agent)
  db.prepare("DELETE FROM agents WHERE id = ?").run(id);
  const dir = join(AGENTS_DIR, id);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
  return { deleted: true };
}

// ─── Access Control ──────────────────────────────────────────────────────────

export function canAccessAgent(agentId, userId) {
  const agent = getAgent(agentId);
  if (!agent) return false;
  if (agent.is_shared) {
    return !!db.prepare("SELECT 1 FROM agent_users WHERE agent_id = ? AND user_id = ?").get(agentId, userId);
  }
  return agent.user_id === userId;
}

export function attachUserToSharedAgents(userId) {
  const sharedAgents = db.prepare("SELECT id FROM agents WHERE is_shared = 1").all();
  const insert = db.prepare("INSERT OR IGNORE INTO agent_users (agent_id, user_id) VALUES (?, ?)");
  const attach = db.transaction(() => {
    for (const agent of sharedAgents) {
      insert.run(agent.id, userId);
    }
  });
  attach();
}

// ─── Agent Files ─────────────────────────────────────────────────────────────

export function getAgentFiles(agentId) {
  const dir = join(AGENTS_DIR, agentId);
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((f) => {
      const fp = join(dir, f);
      return statSync(fp).isFile();
    })
    .map((name) => ({
      name,
      isCore: CORE_FILES.includes(name),
    }));
}

export function readAgentFile(agentId, filename) {
  const fp = join(AGENTS_DIR, agentId, filename);
  if (!existsSync(fp)) return null;
  return readFileSync(fp, "utf-8");
}

export function writeAgentFile(agentId, filename, content) {
  ensureAgentDir(agentId);
  const fp = join(AGENTS_DIR, agentId, filename);
  writeFileSync(fp, content, "utf-8");
}

export function deleteAgentFile(agentId, filename) {
  if (CORE_FILES.includes(filename)) {
    throw new Error(`Cannot delete core file: ${filename}`);
  }
  const fp = join(AGENTS_DIR, agentId, filename);
  if (existsSync(fp)) {
    unlinkSync(fp);
  }
}

export function getIdentity(agentId) {
  return readAgentFile(agentId, "identity.md") || "";
}

export function getUserInfo(agentId) {
  return readAgentFile(agentId, "user.md") || "";
}

// ─── Agent Memory ─────────────────────────────────────────────────────────────

export function getMemories(agentId) {
  return db.prepare(
    "SELECT key, value FROM agent_memory WHERE agent_id = ? ORDER BY updated_at DESC"
  ).all(agentId);
}

export function setMemory(agentId, key, value) {
  return db.prepare(`
    INSERT INTO agent_memory (agent_id, key, value)
    VALUES (?, ?, ?)
    ON CONFLICT(agent_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(agentId, key, value);
}

export function deleteMemory(agentId, key) {
  return db.prepare(
    "DELETE FROM agent_memory WHERE agent_id = ? AND key = ?"
  ).run(agentId, key);
}
