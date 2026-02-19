/**
 * SQLite database — opens/creates buddy.db, enables WAL mode and
 * foreign keys, creates all Layer 2 tables, and seeds the default session.
 */

import Database from "better-sqlite3";
import { join } from "path";
import { DIRS } from "./config.js";

const db = new Database(join(DIRS.root, "buddy.db"));

// Performance + integrity settings
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ─── Schema ───────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    model       TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    avatar_config TEXT DEFAULT '{}',
    voice_config  TEXT DEFAULT '{}',
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS agent_memory (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    key        TEXT NOT NULL,
    value      TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(agent_id, key)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY DEFAULT 'default',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL DEFAULT 'default' REFERENCES sessions(id) ON DELETE CASCADE,
    agent_id   TEXT NOT NULL DEFAULT 'buddy'   REFERENCES agents(id) ON DELETE CASCADE,
    role       TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS agent_templates (
    name          TEXT PRIMARY KEY,
    system_prompt TEXT NOT NULL,
    allowed_tools TEXT DEFAULT '[]',
    max_turns     INTEGER DEFAULT 10,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
  );
`);

// ─── Migrations ──────────────────────────────────────────────────────────────

// Add avatar and enabled_tools columns (idempotent)
try { db.exec("ALTER TABLE agents ADD COLUMN avatar TEXT DEFAULT 'buddy'"); } catch {}
try { db.exec("ALTER TABLE agents ADD COLUMN enabled_tools TEXT DEFAULT NULL"); } catch {}

// Seed default session
db.prepare("INSERT OR IGNORE INTO sessions (id) VALUES ('default')").run();

export default db;
