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
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    is_admin      INTEGER DEFAULT 0,
    created_at    TEXT DEFAULT (datetime('now'))
  );

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
`);

// ─── Migrations ──────────────────────────────────────────────────────────────

// Add avatar and enabled_tools columns (idempotent)
try { db.exec("ALTER TABLE agents ADD COLUMN avatar TEXT DEFAULT 'buddy'"); } catch {}
try { db.exec("ALTER TABLE agents ADD COLUMN enabled_tools TEXT DEFAULT NULL"); } catch {}

// Add user_id to agents (nullable — NULL means shared agent)
try { db.exec("ALTER TABLE agents ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE"); } catch {}

// Add user_id to sessions
try { db.exec("ALTER TABLE sessions ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE"); } catch {}

// Index for scheduler polling
try { db.exec("CREATE INDEX IF NOT EXISTS idx_schedules_next_run ON schedules(next_run_at) WHERE enabled = 1"); } catch {}

// Seed default session
db.prepare("INSERT OR IGNORE INTO sessions (id) VALUES ('default')").run();

export default db;
