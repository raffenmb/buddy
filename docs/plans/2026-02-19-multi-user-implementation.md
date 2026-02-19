# Multi-User Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add multi-user authentication and per-user agent/session scoping to Buddy so multiple household members can share one server.

**Architecture:** Add a `users` table with bcrypt auth + JWT tokens. Scope agents and sessions by `user_id`. Replace the global WebSocket broadcast with per-connection routing. Add login UI on the frontend and user management in the admin panel.

**Tech Stack:** `bcryptjs` (password hashing), `jsonwebtoken` (JWT), Node.js `readline` (CLI setup), existing SQLite/Express/React stack.

**Design doc:** `docs/plans/2026-02-19-multi-user-support-design.md`

---

## Phase 1: Server Dependencies + Users Table + CLI Setup

### Task 1: Add server dependencies

**Files:**
- Modify: `server/package.json`

**Step 1: Install bcryptjs and jsonwebtoken**

```bash
cd server && npm install bcryptjs jsonwebtoken
```

`bcryptjs` (pure JS, no native compilation needed) for password hashing. `jsonwebtoken` for JWT sign/verify.

**Step 2: Verify installation**

```bash
cd server && node -e "require('bcryptjs'); require('jsonwebtoken'); console.log('OK')"
```

Expected: `OK`

**Step 3: Commit**

```bash
git add server/package.json server/package-lock.json
git commit -m "feat: add bcryptjs and jsonwebtoken dependencies"
```

---

### Task 2: Create users table and migration

**Files:**
- Modify: `server/db.js:18-63` (add users table to schema)
- Modify: `server/db.js:65-72` (add migration for user_id columns)

**Step 1: Add users table to the schema block**

In `server/db.js`, add the `users` table **before** the `agents` table in the `db.exec()` block (lines 18-63), since `agents` will reference it:

```javascript
// Add inside the db.exec() block, BEFORE the agents table:
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    is_admin      INTEGER DEFAULT 0,
    created_at    TEXT DEFAULT (datetime('now'))
  );
```

**Step 2: Add user_id column to agents table**

In the migrations section (after line 69), add:

```javascript
// Add user_id to agents (nullable — NULL means shared agent)
try { db.exec("ALTER TABLE agents ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE"); } catch {}
```

**Step 3: Add user_id column to sessions table**

```javascript
// Add user_id to sessions (nullable for migration — new sessions require it)
try { db.exec("ALTER TABLE sessions ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE"); } catch {}
```

**Step 4: Verify by starting server**

```bash
cd server && node -e "import('./db.js').then(() => console.log('Schema OK'))"
```

Expected: `Schema OK` (no errors)

**Step 5: Commit**

```bash
git add server/db.js
git commit -m "feat: add users table and user_id columns to agents/sessions"
```

---

### Task 3: Create server/auth.js — user CRUD and password utilities

**Files:**
- Create: `server/auth.js`

**Step 1: Create the auth module**

Create `server/auth.js` with these exports:

```javascript
/**
 * Auth module — user CRUD, password hashing, JWT sign/verify.
 */

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes, createHash } from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import db from "./db.js";
import { DIRS } from "./config.js";

// ─── JWT Secret ──────────────────────────────────────────────────────────────

const SECRET_PATH = join(DIRS.config, "jwt-secret.txt");

function getJwtSecret() {
  if (existsSync(SECRET_PATH)) {
    return readFileSync(SECRET_PATH, "utf-8").trim();
  }
  const secret = randomBytes(32).toString("hex");
  writeFileSync(SECRET_PATH, secret, "utf-8");
  return secret;
}

const JWT_SECRET = getJwtSecret();
const JWT_EXPIRY = "7d";

// ─── User CRUD ───────────────────────────────────────────────────────────────

export function createUser({ username, password, displayName, isAdmin = false }) {
  const id = randomBytes(16).toString("hex");
  const passwordHash = bcrypt.hashSync(password, 10);

  db.prepare(`
    INSERT INTO users (id, username, password_hash, display_name, is_admin)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, username.toLowerCase(), passwordHash, displayName, isAdmin ? 1 : 0);

  return { id, username: username.toLowerCase(), displayName, isAdmin };
}

export function getUserByUsername(username) {
  return db.prepare("SELECT * FROM users WHERE username = ?").get(username.toLowerCase());
}

export function getUserById(id) {
  return db.prepare("SELECT id, username, display_name, is_admin, created_at FROM users WHERE id = ?").get(id);
}

export function listUsers() {
  return db.prepare("SELECT id, username, display_name, is_admin, created_at FROM users ORDER BY created_at").all();
}

export function updateUser(id, fields) {
  const allowed = ["display_name", "is_admin"];
  const sets = [];
  const values = [];

  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(fields[key]);
    }
  }

  if (fields.password) {
    sets.push("password_hash = ?");
    values.push(bcrypt.hashSync(fields.password, 10));
  }

  if (sets.length === 0) return null;
  values.push(id);
  return db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

export function deleteUser(id) {
  // Guard: cannot delete last admin
  const user = getUserById(id);
  if (!user) throw new Error("User not found");

  if (user.is_admin) {
    const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE is_admin = 1").get().count;
    if (adminCount <= 1) {
      throw new Error("Cannot delete the last admin user");
    }
  }

  db.prepare("DELETE FROM users WHERE id = ?").run(id);
}

export function getUserCount() {
  return db.prepare("SELECT COUNT(*) as count FROM users").get().count;
}

// ─── Password Verification ──────────────────────────────────────────────────

export function verifyPassword(plaintext, hash) {
  return bcrypt.compareSync(plaintext, hash);
}

// ─── JWT ─────────────────────────────────────────────────────────────────────

export function signToken(user) {
  return jwt.sign(
    { userId: user.id, username: user.username, isAdmin: !!user.is_admin },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}
```

**Step 2: Verify**

```bash
cd server && node -e "import('./auth.js').then(m => console.log(typeof m.createUser, typeof m.signToken))"
```

Expected: `function function`

**Step 3: Commit**

```bash
git add server/auth.js
git commit -m "feat: add auth module with user CRUD, bcrypt, and JWT"
```

---

### Task 4: Create server/setup.js — first-run CLI admin setup

**Files:**
- Create: `server/setup.js`

**Step 1: Create the setup module**

Create `server/setup.js`:

```javascript
/**
 * First-run setup — interactive CLI to create the admin account.
 * Called before the server starts listening. Blocks until complete.
 */

import { createInterface } from "readline";
import { createUser, getUserCount } from "./auth.js";

/**
 * If no users exist, prompt for admin account creation in the terminal.
 * Returns immediately if users already exist.
 */
export async function runSetupIfNeeded() {
  if (getUserCount() > 0) return;

  console.log("\n  Welcome to Buddy! Let's create your admin account.\n");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

  try {
    const username = (await ask("  Username: ")).trim().toLowerCase();
    if (!username || !/^[a-z0-9_-]+$/.test(username)) {
      console.error("\n  Username must be lowercase alphanumeric (a-z, 0-9, -, _).\n");
      process.exit(1);
    }

    const displayName = (await ask("  Display name: ")).trim();
    if (!displayName) {
      console.error("\n  Display name is required.\n");
      process.exit(1);
    }

    // Read password with masking
    const password = await readPassword(rl, "  Password: ");
    if (!password || password.length < 4) {
      console.error("\n  Password must be at least 4 characters.\n");
      process.exit(1);
    }

    const confirm = await readPassword(rl, "  Confirm password: ");
    if (password !== confirm) {
      console.error("\n  Passwords do not match.\n");
      process.exit(1);
    }

    const user = createUser({ username, password, displayName, isAdmin: true });
    console.log(`\n  Admin account "${user.username}" created. Starting server...\n`);
  } finally {
    rl.close();
  }
}

/**
 * Read a line from stdin with character masking (shows * for each char).
 */
function readPassword(rl, prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    if (stdin.isTTY) stdin.setRawMode(true);

    let password = "";
    const onData = (ch) => {
      const c = ch.toString("utf8");
      if (c === "\n" || c === "\r" || c === "\u0004") {
        // Enter or Ctrl+D
        if (stdin.isTTY) stdin.setRawMode(wasRaw);
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(password);
      } else if (c === "\u0003") {
        // Ctrl+C
        process.exit(0);
      } else if (c === "\u007f" || c === "\b") {
        // Backspace
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stdout.write("\b \b");
        }
      } else {
        password += c;
        process.stdout.write("*");
      }
    };
    stdin.on("data", onData);
  });
}
```

**Step 2: Verify import**

```bash
cd server && node -e "import('./setup.js').then(m => console.log(typeof m.runSetupIfNeeded))"
```

Expected: `function`

**Step 3: Commit**

```bash
git add server/setup.js
git commit -m "feat: add first-run CLI admin account setup"
```

---

### Task 5: Wire setup into server startup

**Files:**
- Modify: `server/index.js:411-418` (wrap server.listen in async startup)

**Step 1: Add import and async startup**

At the top of `server/index.js`, add the import:

```javascript
import { runSetupIfNeeded } from "./setup.js";
```

Replace the `server.listen(...)` block (lines 413-418) with:

```javascript
// ─── Start ────────────────────────────────────────────────────────────────────

(async () => {
  await runSetupIfNeeded();

  server.listen(PORT, () => {
    console.log(`Buddy server running on http://localhost:${PORT}`);
    console.log(`WebSocket server ready on ws://localhost:${PORT}`);
    console.log(`Environment: ${process.env.BUDDY_ENV || "development"}`);
    console.log(`Data directory: ${DIRS.root}`);
  });
})();
```

**Step 2: Verify server starts (with existing users, setup is skipped)**

```bash
cd server && timeout 3 node index.js || true
```

Expected: Server starts normally (if users table has rows) or prompts for setup (if empty).

**Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat: run first-run CLI setup before server starts"
```

---

## Phase 2: JWT Auth Middleware + Auth Routes

### Task 6: Replace AUTH_TOKEN middleware with JWT auth

**Files:**
- Modify: `server/index.js:25` (remove AUTH_TOKEN)
- Modify: `server/index.js:38-51` (replace authMiddleware)

**Step 1: Add auth imports**

At the top of `server/index.js`, add:

```javascript
import { verifyToken, getUserCount } from "./auth.js";
```

**Step 2: Replace auth middleware**

Remove the `AUTH_TOKEN` const (line 25). Replace the `authMiddleware` function (lines 39-49) and `app.use("/api", authMiddleware)` (line 51) with:

```javascript
// JWT auth middleware — attaches req.user to authenticated requests
function authMiddleware(req, res, next) {
  // Auth endpoints are exempt
  if (req.path.startsWith("/api/auth/")) return next();

  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: "Authorization required" });

  const token = header.replace(/^Bearer\s+/i, "");
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: "Invalid or expired token" });

  req.user = decoded; // { userId, username, isAdmin }
  next();
}

app.use("/api", authMiddleware);
```

**Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat: replace shared AUTH_TOKEN with JWT auth middleware"
```

---

### Task 7: Add auth API routes (login, register, me)

**Files:**
- Modify: `server/index.js` (add routes before agent routes, around line 95)

**Step 1: Add auth imports**

Update the existing auth import to include more functions:

```javascript
import { verifyToken, getUserCount, getUserByUsername, verifyPassword, signToken, createUser, getUserById } from "./auth.js";
```

**Step 2: Add auth routes before the agent routes section**

Insert before `// ─── Agent Routes ───`:

```javascript
// ─── Auth Routes (no auth middleware needed) ────────────────────────────────

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  const user = getUserByUsername(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  const token = signToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      isAdmin: !!user.is_admin,
    },
  });
});

app.post("/api/auth/register", (req, res) => {
  const { username, password, displayName } = req.body;

  // Only allow registration if no users exist (first-run from web)
  // or if the requester is an admin
  const userCount = getUserCount();
  if (userCount > 0) {
    // Must be admin
    if (!req.user || !req.user.isAdmin) {
      return res.status(403).json({ error: "Only admins can create accounts" });
    }
  }

  if (!username || !password || !displayName) {
    return res.status(400).json({ error: "username, password, and displayName required" });
  }

  if (!/^[a-z0-9_-]+$/.test(username.toLowerCase())) {
    return res.status(400).json({ error: "Username must be lowercase alphanumeric (a-z, 0-9, -, _)" });
  }

  if (password.length < 4) {
    return res.status(400).json({ error: "Password must be at least 4 characters" });
  }

  try {
    const isAdmin = userCount === 0; // First user is admin
    const user = createUser({ username, password, displayName, isAdmin });
    const token = signToken({ id: user.id, username: user.username, is_admin: isAdmin ? 1 : 0 });
    res.status(201).json({
      token,
      user: { id: user.id, username: user.username, displayName: user.displayName, isAdmin },
    });
  } catch (err) {
    if (err.message.includes("UNIQUE constraint")) {
      return res.status(409).json({ error: "Username already taken" });
    }
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/auth/me", (req, res) => {
  const user = getUserById(req.user.userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  res.json({
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    isAdmin: !!user.is_admin,
  });
});
```

**Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat: add auth API routes (login, register, me)"
```

---

## Phase 3: User-Scope Agents

### Task 8: Add userId parameter to agent CRUD functions

**Files:**
- Modify: `server/agents.js:101-167` (all CRUD functions)

**Step 1: Update listAgents to accept userId**

```javascript
export function listAgents(userId) {
  // Return agents owned by this user + shared agents (user_id IS NULL)
  return db.prepare(
    "SELECT id, name, model, avatar, enabled_tools, avatar_config, voice_config, user_id FROM agents WHERE user_id = ? OR user_id IS NULL"
  ).all(userId);
}
```

**Step 2: Update createAgent to accept userId**

Add `userId` to the destructured params and the INSERT:

```javascript
export function createAgent({ id, name, model, system_prompt, avatar_config, voice_config, identity, user_info, userId }) {
  const m = model || defaultModel;
  const sp = system_prompt || DEFAULT_PERSONALITY;
  const av = avatar_config ? JSON.stringify(avatar_config) : "{}";
  const vc = voice_config ? JSON.stringify(voice_config) : "{}";

  db.prepare(`
    INSERT INTO agents (id, name, model, system_prompt, avatar_config, voice_config, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, m, sp, av, vc, userId || null);

  // Create folder + core files
  const dir = ensureAgentDir(id);
  writeFileSync(join(dir, "identity.md"), identity || DEFAULT_PERSONALITY, "utf-8");
  writeFileSync(join(dir, "user.md"), user_info || "", "utf-8");

  return getAgent(id);
}
```

**Step 3: Update deleteAgent to check ownership**

```javascript
export function deleteAgent(id, userId) {
  if (id === "buddy") {
    throw new Error("Cannot delete the default buddy agent");
  }

  const agent = getAgent(id);
  if (!agent) throw new Error("Agent not found");

  // Only owner can delete private agents. Shared agents: handled by route (admin check).
  if (agent.user_id && agent.user_id !== userId) {
    throw new Error("Cannot delete another user's agent");
  }

  db.prepare("DELETE FROM agents WHERE id = ?").run(id);

  const dir = join(AGENTS_DIR, id);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}
```

**Step 4: Commit**

```bash
git add server/agents.js
git commit -m "feat: add userId parameter to agent CRUD functions"
```

---

### Task 9: Migrate buddy agent seeding to use admin user

**Files:**
- Modify: `server/agents.js:47-62` (buddy seed logic)

The buddy agent is seeded on import before any user exists. We need to handle this differently — seed it AFTER first-run setup creates the admin.

**Step 1: Export a seedBuddyAgent function instead of running it at import**

Replace the current buddy seeding block (lines 47-62) with an exported function:

```javascript
// ─── Seed default agent ───────────────────────────────────────────────────────

const defaultModel = process.env.CLAUDE_MODEL || "claude-sonnet-4-5-20250929";

/**
 * Seed the default "buddy" agent for a user if it doesn't exist.
 * Called after user creation (first-run setup or admin creates user).
 */
export function seedBuddyAgent(userId) {
  // Create a unique buddy agent ID for this user
  const existingBuddy = db.prepare(
    "SELECT id FROM agents WHERE id = 'buddy' AND (user_id = ? OR user_id IS NULL)"
  ).get(userId);

  if (existingBuddy) return;

  // Check if the plain 'buddy' id exists (from pre-multi-user migration)
  const legacyBuddy = db.prepare("SELECT id, user_id FROM agents WHERE id = 'buddy'").get();

  if (legacyBuddy && !legacyBuddy.user_id) {
    // Claim the legacy buddy agent for this user
    db.prepare("UPDATE agents SET user_id = ? WHERE id = 'buddy'").run(userId);
    return;
  }

  if (!legacyBuddy) {
    // Create fresh buddy agent
    db.prepare(`
      INSERT INTO agents (id, name, model, system_prompt, user_id)
      VALUES ('buddy', 'Buddy', ?, ?, ?)
    `).run(defaultModel, BUDDY_PERSONALITY, userId);

    // Ensure default skills
    db.prepare("UPDATE agents SET enabled_tools = ? WHERE id = 'buddy' AND enabled_tools IS NULL").run(
      JSON.stringify(["search-youtube", "remember-fact"])
    );

    // Create folder + core files
    const dir = ensureAgentDir("buddy");
    if (!existsSync(join(dir, "identity.md"))) {
      writeFileSync(join(dir, "identity.md"), BUDDY_PERSONALITY, "utf-8");
    }
    if (!existsSync(join(dir, "user.md"))) {
      writeFileSync(join(dir, "user.md"), "", "utf-8");
    }
  }
}

// Keep backward-compat: seed buddy without user for fresh installs (will be claimed on first setup)
const buddyExists = db.prepare("SELECT id FROM agents WHERE id = 'buddy'").get();
if (!buddyExists) {
  db.prepare(`
    INSERT INTO agents (id, name, model, system_prompt)
    VALUES ('buddy', 'Buddy', ?, ?)
  `).run(defaultModel, BUDDY_PERSONALITY);

  db.prepare("UPDATE agents SET enabled_tools = ? WHERE id = 'buddy' AND enabled_tools IS NULL").run(
    JSON.stringify(["search-youtube", "remember-fact"])
  );

  const dir = ensureAgentDir("buddy");
  if (!existsSync(join(dir, "identity.md"))) {
    writeFileSync(join(dir, "identity.md"), BUDDY_PERSONALITY, "utf-8");
  }
  if (!existsSync(join(dir, "user.md"))) {
    writeFileSync(join(dir, "user.md"), "", "utf-8");
  }
}
```

**Step 2: Call seedBuddyAgent in setup.js after admin creation**

In `server/setup.js`, import and call it:

```javascript
import { seedBuddyAgent } from "./agents.js";
// After createUser():
seedBuddyAgent(user.id);
```

**Step 3: Commit**

```bash
git add server/agents.js server/setup.js
git commit -m "feat: seed buddy agent per-user with migration for legacy data"
```

---

### Task 10: Add memory access control

**Files:**
- Modify: `server/agents.js:218-236` (memory functions)

**Step 1: Add a canAccessAgent helper**

Add this function in `server/agents.js`:

```javascript
/**
 * Check if a user can access an agent's data.
 * Rules:
 * - Shared agents (user_id IS NULL): any user can access
 * - Private agents: only the owning user can access
 */
export function canAccessAgent(agentId, userId) {
  const agent = getAgent(agentId);
  if (!agent) return false;
  if (!agent.user_id) return true; // Shared agent
  return agent.user_id === userId;
}
```

No changes needed to the memory functions themselves — access control is enforced at the route level using `canAccessAgent`.

**Step 2: Commit**

```bash
git add server/agents.js
git commit -m "feat: add canAccessAgent helper for data access control"
```

---

## Phase 4: User-Scope Sessions

### Task 11: Update session.js to use userId

**Files:**
- Modify: `server/session.js` (all functions)

**Step 1: Replace all functions to use userId instead of hardcoded 'default'**

Rewrite `server/session.js`:

```javascript
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

/**
 * Append a user message to the conversation history.
 */
export function addUserMessage(text, agentId = "buddy", userId) {
  const sessionId = ensureSession(userId);
  db.prepare(
    "INSERT INTO messages (session_id, agent_id, role, content) VALUES (?, ?, 'user', ?)"
  ).run(sessionId, agentId, JSON.stringify(text));
}

/**
 * Append an assistant response to the conversation history.
 */
export function addAssistantResponse(response, agentId = "buddy", userId) {
  const sessionId = ensureSession(userId);
  db.prepare(
    "INSERT INTO messages (session_id, agent_id, role, content) VALUES (?, ?, 'assistant', ?)"
  ).run(sessionId, agentId, JSON.stringify(response.content));
}

/**
 * Append tool results back into the conversation as a user message.
 */
export function addToolResults(results, agentId = "buddy", userId) {
  const sessionId = ensureSession(userId);
  db.prepare(
    "INSERT INTO messages (session_id, agent_id, role, content) VALUES (?, ?, 'user', ?)"
  ).run(sessionId, agentId, JSON.stringify(results));
}

/**
 * Return the full message history for the Claude API call.
 */
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

/**
 * Delete messages — by agent or all, scoped to a user.
 */
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
```

**Step 2: Commit**

```bash
git add server/session.js
git commit -m "feat: scope sessions and messages by userId"
```

---

### Task 12: Update claude-client.js to pass userId through session calls

**Files:**
- Modify: `server/claude-client.js:124-339` (processPrompt function)

**Step 1: Add userId parameter to processPrompt**

Change the function signature:

```javascript
export async function processPrompt(userText, agentId = "buddy", userId, callbacks = {}) {
```

**Step 2: Pass userId to all session calls**

Find and update every call to session functions:

- Line ~159: `addUserMessage(userText, agentId)` → `addUserMessage(userText, agentId, userId)`
- Line ~165: `getMessages(agentId)` → `getMessages(agentId, userId)`
- Line ~316: `addAssistantResponse(response, agentId)` → `addAssistantResponse(response, agentId, userId)`
- Line ~317: `addToolResults(toolResults, agentId)` → `addToolResults(toolResults, agentId, userId)`
- Line ~323: `getMessages(agentId)` → `getMessages(agentId, userId)`
- Line ~330: `addAssistantResponse(response, agentId)` → `addAssistantResponse(response, agentId, userId)`

**Step 3: Commit**

```bash
git add server/claude-client.js
git commit -m "feat: pass userId through claude-client session calls"
```

---

## Phase 5: User-Scope API Routes + WebSocket

### Task 13: Update all API routes to use req.user

**Files:**
- Modify: `server/index.js` (agent routes: ~97-145, memory routes: ~147-156, agent file routes: ~158-193, session routes: ~253-259, prompt route: ~263-323)

**Step 1: Update agent routes**

```javascript
app.get("/api/agents", (req, res) => {
  res.json(listAgents(req.user.userId));
});

app.post("/api/agents", (req, res) => {
  const { id, name, system_prompt, model, avatar_config, voice_config, identity, user_info, shared } = req.body;

  if (!id || !name) {
    return res.status(400).json({ error: "id and name are required" });
  }

  if (getAgent(id)) {
    return res.status(409).json({ error: "Agent with this id already exists" });
  }

  // Shared agents: admin only
  if (shared && !req.user.isAdmin) {
    return res.status(403).json({ error: "Only admins can create shared agents" });
  }

  try {
    const agent = createAgent({
      id, name, model, system_prompt, avatar_config, voice_config, identity, user_info,
      userId: shared ? null : req.user.userId,
    });
    res.status(201).json(agent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/agents/:id", (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: "Agent not found" });

  // Check access: owner or shared agent
  if (agent.user_id && agent.user_id !== req.user.userId) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    updateAgent(req.params.id, req.body);
    res.json(getAgent(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/agents/:id", (req, res) => {
  try {
    const agent = getAgent(req.params.id);
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    // Shared agents: admin only
    if (!agent.user_id && !req.user.isAdmin) {
      return res.status(403).json({ error: "Only admins can delete shared agents" });
    }

    deleteAgent(req.params.id, req.user.userId);
    res.json({ status: "deleted" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
```

**Step 2: Update memory routes with access control**

Import `canAccessAgent` from agents.js, then:

```javascript
app.get("/api/agents/:id/memory", (req, res) => {
  if (!canAccessAgent(req.params.id, req.user.userId)) {
    return res.status(403).json({ error: "Access denied" });
  }
  res.json(getMemories(req.params.id));
});

app.delete("/api/agents/:id/memory/:key", (req, res) => {
  if (!canAccessAgent(req.params.id, req.user.userId)) {
    return res.status(403).json({ error: "Access denied" });
  }
  deleteMemory(req.params.id, req.params.key);
  res.json({ status: "deleted" });
});
```

**Step 3: Update agent file routes with access control**

```javascript
app.get("/api/agents/:id/files", (req, res) => {
  if (!canAccessAgent(req.params.id, req.user.userId)) {
    return res.status(403).json({ error: "Access denied" });
  }
  res.json(getAgentFiles(req.params.id));
});

app.get("/api/agents/:id/files/:filename", (req, res) => {
  if (!canAccessAgent(req.params.id, req.user.userId)) {
    return res.status(403).json({ error: "Access denied" });
  }
  const content = readAgentFile(req.params.id, req.params.filename);
  if (content === null) return res.status(404).json({ error: "File not found" });
  res.json({ name: req.params.filename, content });
});

app.put("/api/agents/:id/files/:filename", (req, res) => {
  if (!canAccessAgent(req.params.id, req.user.userId)) {
    return res.status(403).json({ error: "Access denied" });
  }
  const { content } = req.body;
  if (content === undefined) return res.status(400).json({ error: "content is required" });
  writeAgentFile(req.params.id, req.params.filename, content);
  res.json({ status: "saved", name: req.params.filename });
});

app.delete("/api/agents/:id/files/:filename", (req, res) => {
  if (!canAccessAgent(req.params.id, req.user.userId)) {
    return res.status(403).json({ error: "Access denied" });
  }
  try {
    deleteAgentFile(req.params.id, req.params.filename);
    res.json({ status: "deleted" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
```

**Step 4: Update session route**

```javascript
app.post("/api/session/reset", (req, res) => {
  const { agent_id } = req.body || {};
  resetSession(req.user.userId, agent_id || null);
  res.json({ status: "reset" });
});
```

**Step 5: Update prompt route**

Pass `req.user.userId` to `processPrompt`:

```javascript
const result = await processPrompt(prompt.trim(), agentId, req.user.userId, { requestConfirmation });
```

Also add agent access check at the top:

```javascript
// Verify agent access
if (!canAccessAgent(agentId, req.user.userId)) {
  return res.status(403).json({ error: "Access denied to this agent" });
}
```

**Step 6: Commit**

```bash
git add server/index.js
git commit -m "feat: scope all API routes by authenticated user"
```

---

### Task 14: Add admin user management routes

**Files:**
- Modify: `server/index.js` (add routes after auth routes)

**Step 1: Import remaining auth functions**

Make sure the import from auth.js includes `listUsers`, `updateUser`, `deleteUser`.

**Step 2: Add admin routes**

```javascript
// ─── Admin User Routes ──────────────────────────────────────────────────────

app.get("/api/admin/users", (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: "Admin only" });
  res.json(listUsers());
});

app.post("/api/admin/users", (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: "Admin only" });

  const { username, password, displayName } = req.body;
  if (!username || !password || !displayName) {
    return res.status(400).json({ error: "username, password, and displayName required" });
  }

  if (!/^[a-z0-9_-]+$/.test(username.toLowerCase())) {
    return res.status(400).json({ error: "Username must be lowercase alphanumeric" });
  }

  if (password.length < 4) {
    return res.status(400).json({ error: "Password must be at least 4 characters" });
  }

  try {
    const user = createUser({ username, password, displayName, isAdmin: false });
    // Seed buddy agent for the new user
    seedBuddyAgent(user.id);
    res.status(201).json(user);
  } catch (err) {
    if (err.message.includes("UNIQUE constraint")) {
      return res.status(409).json({ error: "Username already taken" });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/admin/users/:id", (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: "Admin only" });

  const { is_admin } = req.body;

  // Guard: can't demote yourself if you're the last admin
  if (is_admin === 0 && req.params.id === req.user.userId) {
    const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE is_admin = 1").get().count;
    if (adminCount <= 1) {
      return res.status(400).json({ error: "Cannot demote the last admin" });
    }
  }

  try {
    updateUser(req.params.id, req.body);
    res.json(getUserById(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/admin/users/:id", (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: "Admin only" });

  if (req.params.id === req.user.userId) {
    return res.status(400).json({ error: "Cannot delete your own account" });
  }

  try {
    deleteUser(req.params.id);
    res.json({ status: "deleted" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
```

**Step 3: Import `seedBuddyAgent` from agents.js and `db` from db.js in index.js**

Add `seedBuddyAgent` to the agents.js import. Add `import db from "./db.js"`.

**Step 4: Commit**

```bash
git add server/index.js
git commit -m "feat: add admin user management API routes"
```

---

### Task 15: Replace global WebSocket state with per-connection routing

**Files:**
- Modify: `server/index.js:53-68` (currentAgentId + broadcast)
- Modify: `server/index.js:344-409` (WebSocket connection handler)

**Step 1: Replace global state with per-connection Map**

Remove `let currentAgentId = "buddy"` (line 55).

Replace the `broadcast` function with `sendTo` and a connections Map:

```javascript
// ─── Per-connection WebSocket state ──────────────────────────────────────────

const wsConnections = new Map(); // ws -> { userId, agentId }

/**
 * Send a JSON message to a specific WebSocket client.
 */
function sendTo(ws, data) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(data));
  }
}

/**
 * Broadcast a JSON message to all connected clients for a specific user.
 */
function broadcastToUser(userId, data) {
  const message = JSON.stringify(data);
  for (const [ws, conn] of wsConnections) {
    if (conn.userId === userId && ws.readyState === 1) {
      ws.send(message);
    }
  }
}
```

**Step 2: Update WebSocket connection handler with JWT auth**

```javascript
wss.on("connection", (ws, req) => {
  // JWT auth from query param
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get("token");
  const decoded = verifyToken(token);

  if (!decoded) {
    ws.close(4001, "Unauthorized");
    return;
  }

  wsConnections.set(ws, { userId: decoded.userId, agentId: null });
  console.log(`WebSocket client connected: ${decoded.username}`);

  ws.on("message", async (data, isBinary) => {
    if (isBinary) return;

    try {
      const msg = JSON.parse(data.toString());
      const conn = wsConnections.get(ws);

      if (msg.type === "confirm_response") {
        const resolver = pendingConfirmations.get(msg.id);
        if (resolver) {
          pendingConfirmations.delete(msg.id);
          resolver(msg.approved === true);
        }
        return;
      }

      if (msg.type === "file_upload") {
        const fileBuffer = Buffer.from(msg.data, "base64");
        const filePath = join(DIRS.shared, msg.filename);
        writeFileSync(filePath, fileBuffer);

        const agentId = conn.agentId || "buddy";
        const userMessage = msg.text
          ? `${msg.text}\n\n[File uploaded to: ${filePath}]`
          : `[File uploaded to: ${filePath}] (filename: ${msg.filename})`;

        sendTo(ws, { type: "processing", status: true });
        try {
          const result = await processPrompt(userMessage, agentId, conn.userId, {
            requestConfirmation: (command, reason) => requestConfirmationForClient(ws, command, reason),
          });
          splitAndBroadcast(result.allToolCalls, result.finalTextContent, (data) => sendTo(ws, data));
        } catch (err) {
          console.error("Error processing file upload:", err);
          sendTo(ws, { type: "subtitle", text: "Sorry, something went wrong processing that file." });
          sendTo(ws, { type: "processing", status: false });
        }
      }
    } catch {
      // Not JSON — ignore
    }
  });

  ws.on("close", () => {
    const conn = wsConnections.get(ws);
    console.log(`WebSocket client disconnected: ${conn?.userId || "unknown"}`);
    wsConnections.delete(ws);
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});
```

**Step 3: Update confirmation gate to target specific client**

Add a per-client version of requestConfirmation:

```javascript
function requestConfirmationForClient(ws, command, reason) {
  return new Promise((resolve) => {
    const id = `confirm-${++confirmIdCounter}`;
    pendingConfirmations.set(id, resolve);

    sendTo(ws, {
      type: "canvas_command",
      command: "canvas_show_confirmation",
      params: { id, title: "Confirm Action", command, reason },
    });

    setTimeout(() => {
      if (pendingConfirmations.has(id)) {
        pendingConfirmations.delete(id);
        resolve(false);
      }
    }, 60000);
  });
}
```

**Step 4: Update prompt route to use per-connection state**

The prompt route needs to find the WebSocket for the requesting user and route responses there. Replace the prompt route's async block:

```javascript
app.post("/api/prompt", (req, res) => {
  const { prompt, agent_id } = req.body;
  const agentId = agent_id || "buddy";
  const userId = req.user.userId;

  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return res.status(400).json({ error: "prompt is required" });
  }

  // Verify agent access
  if (!canAccessAgent(agentId, userId)) {
    return res.status(403).json({ error: "Access denied to this agent" });
  }

  res.json({ status: "ok" });

  (async () => {
    // Find WS connection(s) for this user to send responses
    const send = (data) => broadcastToUser(userId, data);

    try {
      send({ type: "processing", status: true });

      // Find this user's WS connection and update agentId
      for (const [ws, conn] of wsConnections) {
        if (conn.userId === userId) {
          conn.agentId = agentId;
        }
      }

      // Handle agent switching
      const agent = getAgent(agentId);
      if (agent) {
        send({
          type: "canvas_command",
          command: "canvas_set_mode",
          params: { mode: "clear" },
        });

        send({
          type: "agent_switch",
          agent: {
            id: agent.id,
            name: agent.name,
            avatar: agent.avatar,
            avatar_config: agent.avatar_config,
            voice_config: agent.voice_config,
          },
        });
      }

      // Build per-client confirmation callback
      let clientWs = null;
      for (const [ws, conn] of wsConnections) {
        if (conn.userId === userId) { clientWs = ws; break; }
      }

      const result = await processPrompt(prompt.trim(), agentId, userId, {
        requestConfirmation: clientWs
          ? (command, reason) => requestConfirmationForClient(clientWs, command, reason)
          : undefined,
      });

      splitAndBroadcast(result.allToolCalls, result.finalTextContent, send);
    } catch (error) {
      console.error("Error processing prompt:", error);
      send({ type: "subtitle", text: "Sorry, something went wrong on my end. Try again?" });
      send({ type: "processing", status: false });
    }
  })();
});
```

**Step 5: Commit**

```bash
git add server/index.js
git commit -m "feat: per-connection WebSocket state with user-scoped routing"
```

---

## Phase 6: Frontend Auth

### Task 16: Create auth context and token management

**Files:**
- Create: `client/src/context/AuthContext.jsx`

**Step 1: Create the auth context**

```javascript
import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { apiFetch } from "../lib/api";

const AuthContext = createContext(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem("buddy_token"));
  const [loading, setLoading] = useState(true);

  // Validate existing token on mount
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    apiFetch("/api/auth/me")
      .then((data) => setUser(data))
      .catch(() => {
        localStorage.removeItem("buddy_token");
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username, password) => {
    const data = await apiFetch("/api/auth/login", {
      method: "POST",
      body: { username, password },
    });
    localStorage.setItem("buddy_token", data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("buddy_token");
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
```

**Step 2: Commit**

```bash
git add client/src/context/AuthContext.jsx
git commit -m "feat: add auth context with login/logout and token management"
```

---

### Task 17: Update apiFetch to use JWT from localStorage

**Files:**
- Modify: `client/src/lib/api.js`

**Step 1: Replace AUTH_TOKEN with localStorage token**

```javascript
// Use relative URLs — Vite proxy handles /api in dev, same-origin in production
const BASE_URL = "";

export async function apiFetch(path, options = {}) {
  const headers = { ...options.headers };

  const token = localStorage.getItem("buddy_token");
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (options.body && typeof options.body === "object") {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    // Token expired or invalid — clear and let AuthContext handle redirect
    localStorage.removeItem("buddy_token");
    window.dispatchEvent(new Event("buddy_auth_expired"));
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }

  return res.json();
}
```

**Step 2: Commit**

```bash
git add client/src/lib/api.js
git commit -m "feat: use JWT from localStorage in apiFetch, handle 401"
```

---

### Task 18: Update useWebSocket to use JWT token

**Files:**
- Modify: `client/src/hooks/useWebSocket.js`

**Step 1: Replace AUTH_TOKEN with localStorage token**

Remove the `AUTH_TOKEN` import. Update `getWsUrl`:

```javascript
function getWsUrl() {
  const token = localStorage.getItem("buddy_token");

  if (import.meta.env.VITE_WS_URL) {
    const base = import.meta.env.VITE_WS_URL;
    return token ? `${base}?token=${token}` : base;
  }

  if (import.meta.env.DEV) {
    const base = "ws://localhost:3001";
    return token ? `${base}?token=${token}` : base;
  }

  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const base = `${proto}//${window.location.host}`;
  return token ? `${base}?token=${token}` : base;
}
```

Also update the `useEffect` dependency array to reconnect when auth changes. Add token as a watched value:

```javascript
export default function useWebSocket() {
  const { dispatch, wsRef } = useBuddy();
  const reconnectTimeoutRef = useRef(null);
  const backoffRef = useRef(1000);
  const token = localStorage.getItem("buddy_token");

  useEffect(() => {
    if (!token) return; // Don't connect without auth

    function connect() {
      // ... same as before
    }
    // ... rest same
    connect();
    return () => { /* cleanup */ };
  }, [dispatch, token]);
}
```

**Step 2: Commit**

```bash
git add client/src/hooks/useWebSocket.js
git commit -m "feat: use JWT for WebSocket auth, skip connect without token"
```

---

### Task 19: Create Login page component

**Files:**
- Create: `client/src/components/Login.jsx`

**Step 1: Create Login component**

```javascript
import { useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username.trim() || !password) return;

    setLoading(true);
    setError("");
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="flex flex-col items-center justify-center h-full p-6"
      style={{ backgroundColor: "var(--color-bg-base)" }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-8 flex flex-col gap-6"
        style={{
          backgroundColor: "var(--color-bg-surface)",
          boxShadow: "var(--shadow-card)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div className="flex flex-col items-center gap-2">
          <h1
            className="text-2xl font-bold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Buddy
          </h1>
          <p
            className="text-sm"
            style={{ color: "var(--color-text-muted)" }}
          >
            Sign in to continue
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            autoComplete="username"
            autoFocus
            className="w-full rounded-xl px-4 py-3 text-sm outline-none"
            style={{
              backgroundColor: "var(--color-bg-raised)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-primary)",
            }}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            className="w-full rounded-xl px-4 py-3 text-sm outline-none"
            style={{
              backgroundColor: "var(--color-bg-raised)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-primary)",
            }}
          />

          {error && (
            <p className="text-sm" style={{ color: "#EF4444" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-3 rounded-xl text-white font-semibold text-sm transition-colors disabled:opacity-50"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add client/src/components/Login.jsx
git commit -m "feat: add Login page component"
```

---

### Task 20: Update App.jsx with auth routing

**Files:**
- Modify: `client/src/App.jsx`

**Step 1: Wrap with AuthProvider, add login routing**

```javascript
import { useEffect } from "react";
import { BuddyProvider, useBuddy } from "./context/BuddyState";
import { ThemeProvider } from "./hooks/useTheme";
import { AlertProvider } from "./components/AlertModal";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { apiFetch } from "./lib/api";
import Canvas from "./components/Canvas";
import Avatar from "./components/Avatar";
import InputBar from "./components/InputBar";
import TopBar from "./components/TopBar";
import AdminDashboard from "./components/admin/AdminDashboard";
import Login from "./components/Login";
import useWebSocket from "./hooks/useWebSocket";

function BuddyApp() {
  useWebSocket();
  const { state, dispatch } = useBuddy();

  useEffect(() => {
    apiFetch(`/api/agents/${state.agent.id}`)
      .then((data) => {
        dispatch({ type: "SET_AGENT", payload: { name: data.name, avatar: data.avatar || "buddy" } });
      })
      .catch(() => {});
  }, []);

  if (state.view === "admin") {
    return <AdminDashboard />;
  }

  return (
    <div className="flex flex-col h-full">
      <TopBar />
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <Canvas />
        <Avatar />
      </div>
      <InputBar />
    </div>
  );
}

function AuthGate() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        className="flex items-center justify-center h-full"
        style={{ backgroundColor: "var(--color-bg-base)", color: "var(--color-text-muted)" }}
      >
        Loading...
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <BuddyProvider>
      <BuddyApp />
    </BuddyProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AlertProvider>
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
      </AlertProvider>
    </ThemeProvider>
  );
}
```

**Step 2: Commit**

```bash
git add client/src/App.jsx
git commit -m "feat: add auth gate — show Login when not authenticated"
```

---

### Task 21: Add logout button and user display to TopBar

**Files:**
- Modify: `client/src/components/TopBar.jsx`

**Step 1: Add auth import and logout button**

Import `useAuth`:

```javascript
import { useAuth } from "../context/AuthContext";
```

Inside the component, destructure:

```javascript
const { user, logout } = useAuth();
```

Add user display name and logout button in the right side div (alongside theme toggle and admin gear):

```javascript
{/* Right: user name + logout + theme toggle + admin gear */}
<div className="flex items-center gap-2">
  <span
    className="text-xs font-medium px-2"
    style={{ color: "var(--color-text-muted)" }}
  >
    {user?.displayName}
  </span>

  <button
    onClick={logout}
    className="p-2 rounded-xl transition-colors"
    style={{ color: "var(--color-text-secondary)" }}
    title="Sign out"
  >
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  </button>

  {/* theme toggle button (unchanged) */}
  {/* admin gear button — only show for admins */}
</div>
```

Make the admin gear button conditional on `user?.isAdmin`:

```javascript
{user?.isAdmin && (
  <button onClick={openAdmin} ...>
    {/* gear svg */}
  </button>
)}
```

**Step 2: Commit**

```bash
git add client/src/components/TopBar.jsx
git commit -m "feat: add user display, logout button, and admin-only gear to TopBar"
```

---

## Phase 7: Admin User Management UI

### Task 22: Create UserList admin component

**Files:**
- Create: `client/src/components/admin/UserList.jsx`

**Step 1: Create UserList component**

```javascript
import { useState, useEffect } from "react";
import { useAlert } from "../AlertModal";
import { apiFetch } from "../../lib/api";

export default function UserList() {
  const { showAlert, showConfirm } = useAlert();
  const [users, setUsers] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      setUsers(await apiFetch("/api/admin/users"));
    } catch (err) {
      console.error("Failed to load users:", err);
    }
  }

  async function handleCreate() {
    const username = newUsername.trim().toLowerCase();
    const displayName = newDisplayName.trim();
    const password = newPassword;

    if (!username || !displayName || !password) return;

    try {
      await apiFetch("/api/admin/users", {
        method: "POST",
        body: { username, displayName, password },
      });
      setNewUsername("");
      setNewDisplayName("");
      setNewPassword("");
      setShowCreate(false);
      await loadUsers();
    } catch (err) {
      showAlert(err.message);
    }
  }

  async function toggleAdmin(user) {
    const newVal = user.is_admin ? 0 : 1;
    const action = newVal ? "promote" : "demote";
    const confirmed = await showConfirm(`${action} "${user.display_name}" ${newVal ? "to" : "from"} admin?`);
    if (!confirmed) return;

    try {
      await apiFetch(`/api/admin/users/${user.id}`, {
        method: "PUT",
        body: { is_admin: newVal },
      });
      await loadUsers();
    } catch (err) {
      showAlert(err.message);
    }
  }

  async function handleDelete(user) {
    const confirmed = await showConfirm(`Delete user "${user.display_name}"? All their agents and data will be permanently deleted.`);
    if (!confirmed) return;

    try {
      await apiFetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      await loadUsers();
    } catch (err) {
      showAlert(err.message);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h2
        className="text-sm font-semibold uppercase tracking-wide"
        style={{ color: "var(--color-text-muted)" }}
      >
        Users
      </h2>

      {users.map((u) => (
        <div
          key={u.id}
          className="flex items-center gap-3 p-4 rounded-2xl"
          style={{
            backgroundColor: "var(--color-bg-surface)",
            boxShadow: "var(--shadow-card)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div className="flex-1 min-w-0">
            <div
              className="text-sm font-semibold truncate"
              style={{ color: "var(--color-text-primary)" }}
            >
              {u.display_name}
            </div>
            <div
              className="text-xs truncate"
              style={{ color: "var(--color-text-muted)" }}
            >
              @{u.username}
            </div>
          </div>

          {/* Admin badge / toggle */}
          <button
            onClick={() => toggleAdmin(u)}
            className="px-3 py-1 rounded-lg text-xs font-medium transition-colors"
            style={{
              backgroundColor: u.is_admin ? "var(--color-accent)" : "var(--color-bg-raised)",
              color: u.is_admin ? "#FFFFFF" : "var(--color-text-muted)",
              border: u.is_admin ? "none" : "1px solid var(--color-border)",
            }}
          >
            {u.is_admin ? "Admin" : "User"}
          </button>

          {/* Delete */}
          <button
            onClick={() => handleDelete(u)}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "var(--color-text-muted)" }}
            title="Delete user"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      ))}

      {/* Create user */}
      {showCreate ? (
        <div
          className="rounded-2xl p-4 flex flex-col gap-3"
          style={{
            backgroundColor: "var(--color-bg-surface)",
            boxShadow: "var(--shadow-card)",
            border: "1px solid var(--color-border)",
          }}
        >
          <input
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            placeholder="username"
            autoFocus
            className="w-full rounded-xl px-3 py-2 text-sm outline-none"
            style={{
              backgroundColor: "var(--color-bg-raised)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-primary)",
            }}
          />
          <input
            value={newDisplayName}
            onChange={(e) => setNewDisplayName(e.target.value)}
            placeholder="Display Name"
            className="w-full rounded-xl px-3 py-2 text-sm outline-none"
            style={{
              backgroundColor: "var(--color-bg-raised)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-primary)",
            }}
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-xl px-3 py-2 text-sm outline-none"
            style={{
              backgroundColor: "var(--color-bg-raised)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-primary)",
            }}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              className="flex-1 text-sm px-4 py-2 rounded-xl text-white font-medium transition-colors"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              Create
            </button>
            <button
              onClick={() => { setShowCreate(false); setNewUsername(""); setNewDisplayName(""); setNewPassword(""); }}
              className="flex-1 text-sm px-4 py-2 rounded-xl font-medium transition-colors"
              style={{
                backgroundColor: "var(--color-bg-raised)",
                color: "var(--color-text-secondary)",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowCreate(true)}
          className="w-full text-sm px-4 py-3 rounded-2xl font-medium transition-colors"
          style={{
            backgroundColor: "var(--color-bg-surface)",
            boxShadow: "var(--shadow-card)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-secondary)",
          }}
        >
          + New User
        </button>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add client/src/components/admin/UserList.jsx
git commit -m "feat: add UserList admin component with create/delete/admin toggle"
```

---

### Task 23: Add Users section to AdminDashboard

**Files:**
- Modify: `client/src/components/admin/AdminDashboard.jsx`

**Step 1: Import UserList and useAuth**

```javascript
import { useAuth } from "../../context/AuthContext";
import UserList from "./UserList";
```

**Step 2: Add Users section below the agent list/editor**

Inside the AdminDashboard component, add `useAuth`:

```javascript
const { user } = useAuth();
```

Update the body section to include UserList after the agent area:

```javascript
{/* Body: stack nav */}
<div className="flex-1 overflow-y-auto">
  {adminScreen === "editor" && adminSelectedAgentId ? (
    <AgentEditor
      key={adminSelectedAgentId}
      agentId={adminSelectedAgentId}
      onDeleted={handleDeleted}
    />
  ) : (
    <div className="p-4 max-w-2xl mx-auto flex flex-col gap-6">
      <AgentList />
      {user?.isAdmin && <UserList />}
    </div>
  )}
</div>
```

Note: This requires removing the `<div className="p-4 max-w-2xl mx-auto">` wrapper from inside AgentList.jsx (since we're wrapping it here now). Update AgentList to just return the inner content without its own outer wrapper — change the outermost `<div className="p-4 max-w-2xl mx-auto">` to `<div className="flex flex-col gap-3">`.

**Step 3: Commit**

```bash
git add client/src/components/admin/AdminDashboard.jsx client/src/components/admin/AgentList.jsx
git commit -m "feat: add Users section to admin dashboard"
```

---

### Task 24: Add shared agent badge to agent list/picker

**Files:**
- Modify: `client/src/components/admin/AgentList.jsx` (agent cards)
- Modify: `client/src/components/TopBar.jsx` (agent picker dropdown)

**Step 1: Show "Shared" badge in AgentList cards**

In AgentList, inside the agent card button, add after the agent name:

```javascript
<div className="min-w-0 flex-1">
  <div className="flex items-center gap-2">
    <span
      className="text-sm font-semibold truncate"
      style={{ color: "var(--color-text-primary)" }}
    >
      {a.name}
    </span>
    {!a.user_id && (
      <span
        className="text-xs px-2 py-0.5 rounded-lg"
        style={{
          backgroundColor: "var(--color-bg-raised)",
          color: "var(--color-text-muted)",
          border: "1px solid var(--color-border)",
        }}
      >
        Shared
      </span>
    )}
  </div>
</div>
```

**Step 2: Show "Shared" indicator in TopBar picker**

In the TopBar agent picker dropdown, add a subtle indicator:

```javascript
<button key={a.id} onClick={() => switchAgent(a)} ...>
  {a.name}
  {!a.user_id && (
    <span
      className="text-xs ml-1"
      style={{ color: "var(--color-text-muted)" }}
    >
      (shared)
    </span>
  )}
</button>
```

**Step 3: Commit**

```bash
git add client/src/components/admin/AgentList.jsx client/src/components/TopBar.jsx
git commit -m "feat: show shared agent badge in agent list and picker"
```

---

### Task 25: Update CLAUDE.md and CORS config

**Files:**
- Modify: `CLAUDE.md` (document multi-user)
- Modify: `server/index.js:29-35` (CORS)
- Modify: `server/.env` (remove AUTH_TOKEN, document new env vars)

**Step 1: Update CORS — remove AUTH_TOKEN reference**

Replace the CORS config:

```javascript
app.use(cors({ origin: true, credentials: true }));
```

Since we're using JWT now (not cookies), CORS is simpler — allow all origins with credentials.

**Step 2: Remove AUTH_TOKEN from .env documentation**

In CLAUDE.md, update the Environment section to remove `AUTH_TOKEN` references and add note about multi-user auth.

**Step 3: Update SQLite tables section in CLAUDE.md**

Add `users` table to the table list. Note `user_id` on `agents` and `sessions`.

**Step 4: Commit**

```bash
git add CLAUDE.md server/index.js
git commit -m "docs: update CLAUDE.md for multi-user, simplify CORS"
```

---

## Phase 8: Migration + Verification

### Task 26: Handle legacy single-user data migration

**Files:**
- Modify: `server/setup.js` (add migration logic after admin creation)

**Step 1: After creating admin user, claim orphaned data**

In `server/setup.js`, after `seedBuddyAgent(user.id)`, add:

```javascript
// Claim orphaned sessions and agents from pre-multi-user era
import db from "./db.js";

// Claim the legacy 'default' session
db.prepare("UPDATE sessions SET user_id = ? WHERE id = 'default' AND user_id IS NULL").run(user.id);

// Claim any agents without a user_id
db.prepare("UPDATE agents SET user_id = ? WHERE user_id IS NULL").run(user.id);
```

**Step 2: Commit**

```bash
git add server/setup.js
git commit -m "feat: migrate orphaned legacy data to admin user on first setup"
```

---

### Task 27: End-to-end manual verification

**No files changed — verification only.**

**Step 1: Delete existing database (fresh start)**

```bash
rm ~/.buddy/buddy.db
```

**Step 2: Start server — should prompt for admin setup**

```bash
cd server && node index.js
```

Expected: CLI prompts for username, display name, password.

**Step 3: Open frontend — should show login page**

Navigate to `http://localhost:5173`. Expected: Login form.

**Step 4: Login with admin credentials**

Enter the credentials created in step 2. Expected: Main Buddy interface loads.

**Step 5: Create a second user via admin panel**

Click gear icon → Users → + New User. Create a user.

**Step 6: Open incognito window, login as second user**

Expected: Sees only their own agents (their Buddy). Can't see admin's private agents.

**Step 7: Test shared agent**

As admin, create a shared agent. Both users should see it in their agent lists with "Shared" badge.

**Step 8: Verify data isolation**

Send messages as User A. Log in as User B — User B should not see User A's conversation history (even for the same shared agent).
