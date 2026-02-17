/**
 * Agent registry — CRUD for agents, per-agent memory, and file-based
 * identity/user prompts, all backed by SQLite + filesystem.
 * Seeds the default "buddy" agent on import.
 */

import db from "./db.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, rmSync, unlinkSync, statSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = join(__dirname, "agents");

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

db.prepare(`
  INSERT OR IGNORE INTO agents (id, name, model, system_prompt)
  VALUES ('buddy', 'Buddy', ?, ?)
`).run(defaultModel, BUDDY_PERSONALITY);

// Ensure Buddy has sandbox tools enabled (idempotent — only sets if currently null)
const buddyAgent = db.prepare("SELECT enabled_tools FROM agents WHERE id = 'buddy'").get();
if (!buddyAgent.enabled_tools) {
  db.prepare("UPDATE agents SET enabled_tools = ? WHERE id = 'buddy'").run(
    JSON.stringify(["search_youtube", "remember_fact", "shell_exec", "read_file", "write_file", "list_directory", "send_file"])
  );
}

// ─── Agent CRUD ───────────────────────────────────────────────────────────────

export function getAgent(id) {
  return db.prepare("SELECT * FROM agents WHERE id = ?").get(id);
}

export function listAgents() {
  return db.prepare(
    "SELECT id, name, model, avatar, enabled_tools, avatar_config, voice_config FROM agents"
  ).all();
}

export function createAgent({ id, name, model, system_prompt, avatar_config, voice_config, identity, user_info }) {
  const m = model || defaultModel;
  const sp = system_prompt || DEFAULT_PERSONALITY;
  const av = avatar_config ? JSON.stringify(avatar_config) : "{}";
  const vc = voice_config ? JSON.stringify(voice_config) : "{}";

  db.prepare(`
    INSERT INTO agents (id, name, model, system_prompt, avatar_config, voice_config)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, name, m, sp, av, vc);

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

export function deleteAgent(id) {
  if (id === "buddy") {
    throw new Error("Cannot delete the default buddy agent");
  }
  db.prepare("DELETE FROM agents WHERE id = ?").run(id);

  // Remove agent folder
  const dir = join(AGENTS_DIR, id);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
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
    "SELECT key, value FROM agent_memory WHERE agent_id = ?"
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
