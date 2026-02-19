# Server-as-OS Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild Buddy's backend from Docker-sandboxed to a "Server as OS" model with full host access, process management, sub-agent spawning, and self-evolving skills.

**Architecture:** The server provides platform primitives (shell, filesystem, process manager, sub-agent spawner) as built-in tools. Skills are the single extensibility layer — folders with SKILL.md + optional scripts. Docker is removed entirely. A confirmation gate pauses destructive commands and renders interactive approval cards on the canvas. Environment modes (development/production) control access scope.

**Tech Stack:** Node.js 18+, Express, ws (WebSockets), @anthropic-ai/sdk, better-sqlite3, child_process (spawn/fork), yt-search, React 18, Vite, Tailwind CSS 4

**Design doc:** `docs/plans/2026-02-18-server-as-os-redesign.md`

---

## Phase 1: Foundation — Remove Docker, Add Host Shell

Strip the Docker sandbox and replace it with direct host execution. This is the base everything else builds on.

### Task 1: Create ~/.buddy directory structure and config module

**Files:**
- Create: `server/config.js`
- Modify: `server/.env` (add BUDDY_ENV)
- Modify: `server/.env.example` (add BUDDY_ENV)

**Step 1: Create config module**

```javascript
// server/config.js
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const BUDDY_HOME = join(homedir(), ".buddy");
const ENV = process.env.BUDDY_ENV || "development";

const DIRS = {
  root: BUDDY_HOME,
  skills: join(BUDDY_HOME, "skills"),
  agents: join(BUDDY_HOME, "agents"),
  processes: join(BUDDY_HOME, "processes"),
  logs: join(BUDDY_HOME, "logs"),
  shared: join(BUDDY_HOME, "shared"),
  config: join(BUDDY_HOME, "config"),
};

// Ensure all directories exist
for (const dir of Object.values(DIRS)) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// Default guards config
const GUARDS_PATH = join(DIRS.config, "guards.json");
if (!existsSync(GUARDS_PATH)) {
  writeFileSync(GUARDS_PATH, JSON.stringify({
    patterns: [
      { pattern: "rm\\s+-rf\\s+/(?!home|tmp)", reason: "Recursive delete outside home/tmp" },
      { pattern: "mkfs", reason: "Filesystem format" },
      { pattern: "dd\\s+if=", reason: "Raw disk write" },
      { pattern: ":(\\)\\{\\s*:|:&\\s*\\};:", reason: "Fork bomb" },
      { pattern: "curl.*\\|\\s*sh", reason: "Pipe curl to shell" },
      { pattern: "wget.*\\|\\s*sh", reason: "Pipe wget to shell" },
      { pattern: ">\\s*/dev/sd", reason: "Write to block device" }
    ],
    blocked_commands: ["shutdown", "reboot", "poweroff", "halt", "iptables", "ip6tables"]
  }, null, 2), "utf-8");
}

export { BUDDY_HOME, ENV, DIRS, GUARDS_PATH };
```

**Step 2: Add BUDDY_ENV to .env files**

Add to `server/.env` and `server/.env.example`:
```
BUDDY_ENV=development
```

**Step 3: Verify directory creation**

Run: `node -e "import('./server/config.js').then(() => console.log('ok'))"`
Expected: `~/.buddy/` directory tree created with `config/guards.json`

**Step 4: Commit**

```bash
git add server/config.js server/.env.example
git commit -m "feat: add ~/.buddy directory structure and config module"
```

---

### Task 2: Build host shell executor with environment guards

**Files:**
- Create: `server/shell/executor.js`
- Create: `server/shell/guards.js`

**Step 1: Create guards module**

```javascript
// server/shell/guards.js
import { readFileSync } from "fs";
import { GUARDS_PATH, ENV, DIRS } from "../config.js";

function loadGuards() {
  const raw = readFileSync(GUARDS_PATH, "utf-8");
  return JSON.parse(raw);
}

/**
 * Validate a command against guard patterns and environment restrictions.
 * Returns { safe, needsConfirmation, reason } — safe means execute freely,
 * needsConfirmation means pause and ask the user.
 */
export function validateCommand(command) {
  const guards = loadGuards();

  // Check blocked commands (always blocked regardless of env)
  const firstWord = command.trim().split(/\s+/)[0];
  if (guards.blocked_commands.includes(firstWord)) {
    return { safe: false, needsConfirmation: false, reason: `Blocked command: ${firstWord}` };
  }

  // In development mode, restrict writes outside ~/.buddy and /tmp
  if (ENV === "development") {
    // Check for write operations to restricted paths
    const writePatterns = [
      />\s*\/(?!home|tmp)/,        // redirect to root paths
      /tee\s+\/(?!home|tmp)/,      // tee to root paths
      /install/i,                   // package installs need confirmation in dev
    ];
    for (const pattern of writePatterns) {
      if (pattern.test(command)) {
        return { safe: false, needsConfirmation: true, reason: "Development mode: operation outside ~/.buddy and /tmp" };
      }
    }
  }

  // Check destructive patterns — these need confirmation, not blocking
  for (const { pattern, reason } of guards.patterns) {
    if (new RegExp(pattern).test(command)) {
      return { safe: false, needsConfirmation: true, reason };
    }
  }

  return { safe: true, needsConfirmation: false };
}
```

**Step 2: Create shell executor**

```javascript
// server/shell/executor.js
import { spawn } from "child_process";
import { homedir } from "os";
import { validateCommand } from "./guards.js";

const MAX_OUTPUT = 50000; // 50KB output cap

/**
 * Execute a shell command on the host.
 * @param {string} command - Shell command to run.
 * @param {object} options
 * @param {string} options.cwd - Working directory (default: home).
 * @param {number} options.timeout - Timeout in ms (default: 30000).
 * @param {Function} options.requestConfirmation - Async callback to request user confirmation.
 * @returns {Promise<{stdout, stderr, exitCode, timedOut, denied}>}
 */
export async function executeShell(command, options = {}) {
  const { cwd = homedir(), timeout = 30000, requestConfirmation } = options;

  // Validate command
  const validation = validateCommand(command);

  if (!validation.safe && !validation.needsConfirmation) {
    return { stdout: "", stderr: `Command blocked: ${validation.reason}`, exitCode: 1, timedOut: false, denied: true };
  }

  if (validation.needsConfirmation) {
    if (!requestConfirmation) {
      return { stdout: "", stderr: `Command requires confirmation but no confirmation handler available: ${validation.reason}`, exitCode: 1, timedOut: false, denied: true };
    }
    const approved = await requestConfirmation(command, validation.reason);
    if (!approved) {
      return { stdout: "", stderr: "Command denied by user.", exitCode: 1, timedOut: false, denied: true };
    }
  }

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const proc = spawn("sh", ["-c", command], {
      cwd,
      timeout,
      env: { ...process.env, HOME: homedir() },
    });

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
      if (stdout.length > MAX_OUTPUT) {
        stdout = stdout.slice(0, MAX_OUTPUT) + "\n[output truncated]";
        proc.kill();
      }
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
      if (stderr.length > MAX_OUTPUT) {
        stderr = stderr.slice(0, MAX_OUTPUT) + "\n[output truncated]";
      }
    });

    proc.on("close", (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1, timedOut, denied: false });
    });

    proc.on("error", (err) => {
      resolve({ stdout, stderr: err.message, exitCode: 1, timedOut: false, denied: false });
    });

    setTimeout(() => {
      if (!proc.killed) {
        timedOut = true;
        proc.kill("SIGKILL");
      }
    }, timeout);
  });
}
```

**Step 3: Verify executor works**

Run: `node -e "import('./server/shell/executor.js').then(m => m.executeShell('echo hello').then(r => console.log(r)))"`
Expected: `{ stdout: 'hello\n', stderr: '', exitCode: 0, timedOut: false, denied: false }`

**Step 4: Commit**

```bash
git add server/shell/executor.js server/shell/guards.js
git commit -m "feat: add host shell executor with environment guards"
```

---

### Task 3: Build host filesystem tools

**Files:**
- Create: `server/shell/filesystem.js`

**Step 1: Create filesystem module**

```javascript
// server/shell/filesystem.js
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "fs";
import { dirname, resolve } from "path";
import { homedir } from "os";
import { ENV, DIRS } from "../config.js";

/**
 * Check if a path is writable in the current environment.
 * Development mode restricts writes to ~/.buddy and /tmp.
 */
function isWriteAllowed(filePath) {
  if (ENV === "production") return true;

  const resolved = resolve(filePath);
  return resolved.startsWith(DIRS.root) || resolved.startsWith("/tmp");
}

export function readFile(filePath) {
  try {
    const resolved = resolve(filePath);
    if (!existsSync(resolved)) {
      return { content: null, error: `File not found: ${filePath}` };
    }
    const stat = statSync(resolved);
    if (stat.isDirectory()) {
      return { content: null, error: `Path is a directory: ${filePath}` };
    }
    const content = readFileSync(resolved, "utf-8");
    return { content, error: null };
  } catch (err) {
    return { content: null, error: err.message };
  }
}

export function writeFile(filePath, content) {
  try {
    const resolved = resolve(filePath);
    if (!isWriteAllowed(resolved)) {
      return { error: `Development mode: writes restricted to ~/.buddy and /tmp. Path: ${filePath}` };
    }
    mkdirSync(dirname(resolved), { recursive: true });
    writeFileSync(resolved, content, "utf-8");
    return { error: null };
  } catch (err) {
    return { error: err.message };
  }
}

export function listDirectory(dirPath) {
  try {
    const resolved = resolve(dirPath || homedir());
    if (!existsSync(resolved)) {
      return { entries: null, error: `Directory not found: ${dirPath}` };
    }
    const entries = readdirSync(resolved).map((name) => {
      const fullPath = resolve(resolved, name);
      const stat = statSync(fullPath);
      return {
        name,
        type: stat.isDirectory() ? "directory" : "file",
        size: stat.size,
        modified: stat.mtime.toISOString(),
      };
    });
    return { entries, error: null };
  } catch (err) {
    return { entries: null, error: err.message };
  }
}
```

**Step 2: Verify filesystem module**

Run: `node -e "import('./server/shell/filesystem.js').then(m => console.log(m.listDirectory('/home')))"`
Expected: Lists directories under /home

**Step 3: Commit**

```bash
git add server/shell/filesystem.js
git commit -m "feat: add host filesystem tools with env-mode write restrictions"
```

---

### Task 4: Rewrite tools.js — replace sandbox tools with host tools

**Files:**
- Modify: `server/tools.js`

**Step 1: Replace sandbox tool definitions with host tool definitions**

Keep all 10 canvas tools + search_youtube + remember_fact unchanged. Remove: `read_skill`, `shell_exec` (sandbox version), `read_file` (sandbox version), `write_file` (sandbox version), `list_directory` (sandbox version), `send_file`.

Replace with new host tool definitions:

```javascript
// Replace lines 383-488 (read_skill through send_file) with:
  {
    name: "shell_exec",
    description:
      "Execute a shell command on the host machine. Has access to all installed utilities (python3, git, curl, etc). Returns stdout, stderr, and exit code. Destructive commands will require user confirmation.",
    input_schema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute.",
        },
        cwd: {
          type: "string",
          description: "Working directory (default: user home directory).",
        },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds (default: 30000, max: 600000).",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "read_file",
    description:
      "Read the contents of a file on the host machine. Can read any file the server process has access to.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute path to the file to read.",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description:
      "Write content to a file on the host machine. Creates parent directories if needed. In development mode, writes are restricted to ~/.buddy and /tmp.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute path for the file.",
        },
        content: {
          type: "string",
          description: "Content to write to the file.",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "list_directory",
    description:
      "List files and directories at a given path on the host machine. Returns name, type (file/directory), size, and modification date for each entry.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute path to list (default: user home directory).",
        },
      },
      required: [],
    },
  },
```

**Step 2: Add PLATFORM_TOOL_NAMES export**

At the bottom of the file, after `export default tools;`, add:

```javascript
export const PLATFORM_TOOL_NAMES = ["shell_exec", "read_file", "write_file", "list_directory"];
```

**Step 3: Commit**

```bash
git add server/tools.js
git commit -m "feat: replace sandbox tool definitions with host platform tools"
```

---

### Task 5: Rewrite claude-client.js — remove sandbox, wire host tools

**Files:**
- Modify: `server/claude-client.js`

**Step 1: Replace imports**

Replace lines 1-16:
```javascript
import Anthropic from "@anthropic-ai/sdk";
import yts from "yt-search";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import tools, { PLATFORM_TOOL_NAMES } from "./tools.js";
import { listSkills } from "./skills.js";
import { addUserMessage, addAssistantResponse, addToolResults, getMessages } from "./session.js";
import { getAgent, getMemories, setMemory, getIdentity, getUserInfo, updateAgent } from "./agents.js";
import { executeShell } from "./shell/executor.js";
import { readFile, writeFile, listDirectory } from "./shell/filesystem.js";
import { DIRS } from "./config.js";
```

**Step 2: Update buildSystemPrompt — replace read_skill with read_file instructions**

In the skills section of `buildSystemPrompt` (lines 71-107), change the instruction from `read_skill` to `read_file`:

```javascript
    if (enabledSkills.length > 0) {
      basePrompt += `\n\n## Custom Skills\nYou have custom skills available at ${DIRS.skills}. When a user's request matches a skill's description, use the read_file tool to read the skill's SKILL.md for full instructions before responding.\n\nAvailable skills:`;
      for (const skill of enabledSkills) {
        basePrompt += `\n- **${skill.name}** (path: \`${join(DIRS.skills, skill.folderName, "SKILL.md")}\`): ${skill.description}`;
      }
    }
```

**Step 3: Remove SANDBOX_TOOL_NAMES references and read_skill handling**

In `parseEnabledTools` and skill detection logic, remove all references to `SANDBOX_TOOL_NAMES`. In tool filtering (lines 170-189), replace with simpler logic:

```javascript
  // Filter tools: canvas always included, platform tools always included, others per enabled_tools
  const enabledTools = parseEnabledTools(agent.enabled_tools);
  let agentTools;
  if (enabledTools) {
    agentTools = tools.filter(
      (t) => t.name.startsWith("canvas_") || PLATFORM_TOOL_NAMES.includes(t.name) || enabledTools.includes(t.name)
    );
  } else {
    // null = all standard tools ON (canvas + platform + search + memory)
    agentTools = tools;
  }
```

**Step 4: Replace tool execution in the tool-use loop**

Replace the sandbox tool handling (lines 255-267) and read_skill handling (lines 239-254) with host tool execution:

```javascript
        if (toolUse.name === "shell_exec") {
          const result = await executeShell(toolUse.input.command, {
            cwd: toolUse.input.cwd,
            timeout: Math.min(toolUse.input.timeout || 30000, 600000),
            requestConfirmation: callbacks.requestConfirmation,
          });
          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify({ stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode }),
            ...(result.denied && { is_error: true }),
          };
        }
        if (toolUse.name === "read_file") {
          const result = readFile(toolUse.input.path);
          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: result.error ? JSON.stringify({ error: result.error }) : result.content,
            ...(result.error && { is_error: true }),
          };
        }
        if (toolUse.name === "write_file") {
          const result = writeFile(toolUse.input.path, toolUse.input.content);
          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: result.error ? JSON.stringify({ error: result.error }) : JSON.stringify({ status: "written", path: toolUse.input.path }),
            ...(result.error && { is_error: true }),
          };
        }
        if (toolUse.name === "list_directory") {
          const result = listDirectory(toolUse.input.path);
          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: result.error ? JSON.stringify({ error: result.error }) : JSON.stringify(result.entries),
            ...(result.error && { is_error: true }),
          };
        }
```

**Step 5: Update processPrompt signature — remove sandboxAvailable, add requestConfirmation**

Change the callbacks parameter usage. Remove `callbacks.sandboxAvailable` and `callbacks.sendFile`. Add `callbacks.requestConfirmation` (passed through from index.js).

**Step 6: Commit**

```bash
git add server/claude-client.js
git commit -m "feat: wire host shell/filesystem tools into Claude tool-use loop"
```

---

### Task 6: Rewrite index.js — remove Docker, add confirmation WebSocket flow

**Files:**
- Modify: `server/index.js`

**Step 1: Replace imports**

Remove:
```javascript
import { ensureSandboxRunning } from "./sandbox/healthcheck.js";
import { saveBufferToSandbox } from "./sandbox/fileTransfer.js";
```

Add:
```javascript
import { DIRS } from "./config.js";
```

**Step 2: Remove sandboxAvailable tracking**

Delete `let sandboxAvailable = false;` (line 327) and the sandbox startup in `server.listen` (lines 403-409).

**Step 3: Add confirmation request mechanism**

Add a pending confirmations map and WebSocket handler:

```javascript
// ─── Confirmation Gate ───────────────────────────────────────────────────────

const pendingConfirmations = new Map();
let confirmIdCounter = 0;

function requestConfirmation(command, reason) {
  return new Promise((resolve) => {
    const id = `confirm-${++confirmIdCounter}`;
    pendingConfirmations.set(id, resolve);

    // Send confirmation card to canvas
    broadcast({
      type: "canvas_command",
      command: "canvas_show_confirmation",
      params: { id, title: "Confirm Action", command, reason },
    });

    // Auto-deny after 60 seconds
    setTimeout(() => {
      if (pendingConfirmations.has(id)) {
        pendingConfirmations.delete(id);
        resolve(false);
      }
    }, 60000);
  });
}
```

**Step 4: Handle confirm_response in WebSocket message handler**

In the `ws.on("message")` handler, add:

```javascript
      if (msg.type === "confirm_response") {
        const resolver = pendingConfirmations.get(msg.id);
        if (resolver) {
          pendingConfirmations.delete(msg.id);
          resolver(msg.approved === true);
        }
      }
```

**Step 5: Update processPrompt call**

In the `/api/prompt` route, replace:
```javascript
const result = await processPrompt(prompt.trim(), agentId, { sendFile, sandboxAvailable });
```
with:
```javascript
const result = await processPrompt(prompt.trim(), agentId, { requestConfirmation });
```

**Step 6: Remove file_upload handler referencing sandbox**

Remove or simplify the `file_upload` WebSocket handler (lines 354-382). File uploads now go directly to `~/.buddy/shared/` on the host without Docker:

```javascript
      if (msg.type === "file_upload") {
        const fileBuffer = Buffer.from(msg.data, "base64");
        const filePath = join(DIRS.shared, msg.filename);
        writeFileSync(filePath, fileBuffer);

        const userMessage = msg.text
          ? `${msg.text}\n\n[File uploaded to: ${filePath}]`
          : `[File uploaded to: ${filePath}] (filename: ${msg.filename})`;

        broadcast({ type: "processing", status: true });
        try {
          const result = await processPrompt(userMessage, currentAgentId, { requestConfirmation });
          splitAndBroadcast(result.allToolCalls, result.finalTextContent, broadcast);
        } catch (err) {
          console.error("Error processing file upload:", err);
          broadcast({ type: "subtitle", text: "Sorry, something went wrong processing that file." });
          broadcast({ type: "processing", status: false });
        }
      }
```

**Step 7: Add static route for shared files**

Before the production static file section, add:

```javascript
// Serve files from ~/.buddy/shared/ for file delivery
app.use("/files", express.static(DIRS.shared));
```

**Step 8: Commit**

```bash
git add server/index.js
git commit -m "feat: remove Docker, add confirmation gate and host file handling"
```

---

### Task 7: Update skills.js — point to ~/.buddy/skills/

**Files:**
- Modify: `server/skills.js`

**Step 1: Change SKILLS_DIR to use config**

Replace lines 1-16:
```javascript
import { mkdirSync, existsSync, readFileSync, readdirSync, writeFileSync, rmSync, statSync } from "fs";
import { join } from "path";
import { DIRS } from "./config.js";

const SKILLS_DIR = DIRS.skills;

// Ensure skills directory exists on startup
if (!existsSync(SKILLS_DIR)) {
  mkdirSync(SKILLS_DIR, { recursive: true });
}
```

Rest of the file stays the same — it already uses `SKILLS_DIR` throughout.

**Step 2: Commit**

```bash
git add server/skills.js
git commit -m "feat: point skills directory to ~/.buddy/skills/"
```

---

### Task 8: Update agents.js — point to ~/.buddy/agents/

**Files:**
- Modify: `server/agents.js`

**Step 1: Change AGENTS_DIR to use config**

Replace lines 1-13:
```javascript
import db from "./db.js";
import { join } from "path";
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, rmSync, unlinkSync, statSync } from "fs";
import { DIRS } from "./config.js";

const AGENTS_DIR = DIRS.agents;
```

**Step 2: Update default buddy enabled_tools**

Replace lines 57-63 (the sandbox tools default) with host platform tools:

```javascript
const buddyAgent = db.prepare("SELECT enabled_tools FROM agents WHERE id = 'buddy'").get();
if (!buddyAgent.enabled_tools) {
  db.prepare("UPDATE agents SET enabled_tools = ? WHERE id = 'buddy'").run(
    JSON.stringify(["search_youtube", "remember_fact", "shell_exec", "read_file", "write_file", "list_directory"])
  );
}
```

**Step 3: Commit**

```bash
git add server/agents.js
git commit -m "feat: point agent files to ~/.buddy/agents/"
```

---

### Task 9: Update db.js — point to ~/.buddy/buddy.db, add agent_templates table

**Files:**
- Modify: `server/db.js`

**Step 1: Change database path and add agent_templates table**

```javascript
import Database from "better-sqlite3";
import { join } from "path";
import { DIRS } from "./config.js";

const db = new Database(join(DIRS.root, "buddy.db"));

// Performance + integrity settings
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ─── Schema ─────────────────────────────────────────────────────────────────

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

try { db.exec("ALTER TABLE agents ADD COLUMN avatar TEXT DEFAULT 'buddy'"); } catch {}
try { db.exec("ALTER TABLE agents ADD COLUMN enabled_tools TEXT DEFAULT NULL"); } catch {}

// Seed default session
db.prepare("INSERT OR IGNORE INTO sessions (id) VALUES ('default')").run();

export default db;
```

**Step 2: Commit**

```bash
git add server/db.js
git commit -m "feat: move database to ~/.buddy/buddy.db, add agent_templates table"
```

---

### Task 10: Delete Docker/sandbox files

**Files:**
- Delete: `server/sandbox/executor.js`
- Delete: `server/sandbox/guards.js`
- Delete: `server/sandbox/toolHandler.js`
- Delete: `server/sandbox/fileTransfer.js`
- Delete: `server/sandbox/healthcheck.js`
- Delete: `Dockerfile.buddy-sandbox`
- Delete: `docker-compose.yml`

**Step 1: Remove all sandbox files**

```bash
rm -rf server/sandbox/
rm -f Dockerfile.buddy-sandbox docker-compose.yml
```

**Step 2: Commit**

```bash
git add -A
git commit -m "chore: remove Docker sandbox files"
```

---

### Task 11: Verify Phase 1 — basic prompt flow works

**Step 1: Start the server**

```bash
cd server && node index.js
```
Expected: Server starts without Docker references, no errors.

**Step 2: Start frontend dev server**

```bash
cd client && npm run dev
```

**Step 3: Test basic prompt**

Send "hello" through the UI.
Expected: Buddy responds with a subtitle. Canvas tools work. No sandbox errors.

**Step 4: Test shell_exec**

Send "list the files in my home directory"
Expected: Buddy uses `shell_exec` or `list_directory` and describes the contents.

**Step 5: Test read_file**

Send "read the file at ~/.buddy/config/guards.json"
Expected: Buddy reads and describes the guards config.

**Step 6: Commit any fixes needed**

```bash
git add -A
git commit -m "fix: phase 1 integration fixes"
```

---

## Phase 2: Process Manager

### Task 12: Build process manager module

**Files:**
- Create: `server/shell/processManager.js`

**Step 1: Create process manager**

```javascript
// server/shell/processManager.js
import { spawn } from "child_process";
import { createWriteStream, mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { DIRS } from "../config.js";

const activeProcesses = new Map();

function procDir(id) {
  return join(DIRS.processes, id);
}

function generateId(command) {
  const slug = command.split(/\s+/).slice(0, 2).join("-").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 20);
  const ts = Date.now().toString(36);
  return `${slug}-${ts}`;
}

export function startProcess(command, { cwd = homedir(), name } = {}) {
  const id = name || generateId(command);
  const dir = procDir(id);
  mkdirSync(dir, { recursive: true });

  const stdoutLog = join(dir, "stdout.log");
  const stderrLog = join(dir, "stderr.log");
  const metaPath = join(dir, "meta.json");

  const stdoutStream = createWriteStream(stdoutLog);
  const stderrStream = createWriteStream(stderrLog);

  const proc = spawn("sh", ["-c", command], {
    cwd,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, HOME: homedir() },
  });

  proc.stdout.pipe(stdoutStream);
  proc.stderr.pipe(stderrStream);
  proc.unref();

  const meta = {
    id,
    command,
    cwd,
    pid: proc.pid,
    status: "running",
    startedAt: new Date().toISOString(),
    exitCode: null,
  };

  writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
  activeProcesses.set(id, { proc, meta, dir: dir });

  proc.on("close", (code) => {
    meta.status = "stopped";
    meta.exitCode = code;
    meta.stoppedAt = new Date().toISOString();
    writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
  });

  return { id, pid: proc.pid, status: "running" };
}

export function stopProcess(id) {
  const entry = activeProcesses.get(id);
  if (!entry) return { error: `Process '${id}' not found or not managed by this session.` };

  try {
    process.kill(entry.proc.pid, "SIGTERM");
    setTimeout(() => {
      try { process.kill(entry.proc.pid, "SIGKILL"); } catch {}
    }, 5000);
    return { status: "stopping", id };
  } catch (err) {
    return { error: err.message };
  }
}

export function getProcessStatus(id) {
  if (id) {
    const entry = activeProcesses.get(id);
    if (!entry) {
      // Check if meta.json exists on disk (from a previous session)
      const metaPath = join(procDir(id), "meta.json");
      if (existsSync(metaPath)) {
        return JSON.parse(readFileSync(metaPath, "utf-8"));
      }
      return { error: `Process '${id}' not found.` };
    }
    return entry.meta;
  }

  // Return all active processes
  return Array.from(activeProcesses.values()).map((e) => e.meta);
}

export function getProcessLogs(id, { lines = 50, stream = "stdout" } = {}) {
  const logPath = join(procDir(id), `${stream}.log`);
  if (!existsSync(logPath)) {
    return { error: `No ${stream} log found for process '${id}'.` };
  }

  const content = readFileSync(logPath, "utf-8");
  const allLines = content.split("\n");
  const tail = allLines.slice(-lines).join("\n");
  return { log: tail, totalLines: allLines.length };
}
```

**Step 2: Commit**

```bash
git add server/shell/processManager.js
git commit -m "feat: add process manager for long-lived background processes"
```

---

### Task 13: Add process tools to tools.js and claude-client.js

**Files:**
- Modify: `server/tools.js`
- Modify: `server/claude-client.js`

**Step 1: Add 4 process tool definitions to tools.js**

Add after the `list_directory` tool definition:

```javascript
  {
    name: "process_start",
    description:
      "Start a long-running background process on the host. Returns a process ID for tracking. Use for servers, watchers, builds, or any command that should keep running.",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to run as a background process." },
        cwd: { type: "string", description: "Working directory (default: user home)." },
        name: { type: "string", description: "Optional human-readable name for the process (used as ID)." },
      },
      required: ["command"],
    },
  },
  {
    name: "process_stop",
    description: "Stop a running background process by its ID.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The process ID to stop." },
      },
      required: ["id"],
    },
  },
  {
    name: "process_status",
    description: "Get the status of managed background processes. Call with no ID to list all, or with a specific ID for details.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Optional process ID. Omit to list all." },
      },
      required: [],
    },
  },
  {
    name: "process_logs",
    description: "Read the recent output logs of a background process.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The process ID." },
        lines: { type: "integer", description: "Number of lines to tail (default: 50)." },
        stream: { type: "string", enum: ["stdout", "stderr"], description: "Which output stream (default: stdout)." },
      },
      required: ["id"],
    },
  },
```

Update the PLATFORM_TOOL_NAMES export:

```javascript
export const PLATFORM_TOOL_NAMES = [
  "shell_exec", "read_file", "write_file", "list_directory",
  "process_start", "process_stop", "process_status", "process_logs"
];
```

**Step 2: Wire process tools in claude-client.js**

Add import:
```javascript
import { startProcess, stopProcess, getProcessStatus, getProcessLogs } from "./shell/processManager.js";
```

Add tool handlers in the tool-use loop, after the `list_directory` handler:

```javascript
        if (toolUse.name === "process_start") {
          const result = startProcess(toolUse.input.command, {
            cwd: toolUse.input.cwd,
            name: toolUse.input.name,
          });
          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          };
        }
        if (toolUse.name === "process_stop") {
          const result = stopProcess(toolUse.input.id);
          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
            ...(result.error && { is_error: true }),
          };
        }
        if (toolUse.name === "process_status") {
          const result = getProcessStatus(toolUse.input.id);
          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
            ...(result.error && { is_error: true }),
          };
        }
        if (toolUse.name === "process_logs") {
          const result = getProcessLogs(toolUse.input.id, {
            lines: toolUse.input.lines,
            stream: toolUse.input.stream,
          });
          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
            ...(result.error && { is_error: true }),
          };
        }
```

**Step 3: Commit**

```bash
git add server/tools.js server/claude-client.js
git commit -m "feat: add process management tools (start/stop/status/logs)"
```

---

### Task 14: Verify Phase 2 — process management works

**Step 1: Test process_start**

Send: "Start a simple web server with python3 on port 8888"
Expected: Agent uses `process_start` with `python3 -m http.server 8888`, returns a process ID.

**Step 2: Test process_status**

Send: "What processes are running?"
Expected: Agent uses `process_status`, shows the python server is running.

**Step 3: Test process_logs**

Send: "Show me the logs from that server"
Expected: Agent uses `process_logs`, shows output.

**Step 4: Test process_stop**

Send: "Stop that server"
Expected: Agent uses `process_stop`, confirms it stopped.

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: phase 2 integration fixes"
```

---

## Phase 3: Output Summarization

### Task 15: Build output summarizer

**Files:**
- Create: `server/shell/summarizer.js`
- Modify: `server/claude-client.js`

**Step 1: Create summarizer module**

```javascript
// server/shell/summarizer.js
import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync } from "fs";
import { join } from "path";
import { DIRS } from "../config.js";

const anthropic = new Anthropic();
const LINE_THRESHOLD = 200;

/**
 * If output exceeds LINE_THRESHOLD lines, summarize it with Haiku
 * and save the full output to a log file.
 * @returns {Promise<{content: string, summarized: boolean, logPath?: string}>}
 */
export async function maybeSummarize(output, context = "command output") {
  const lines = output.split("\n");
  if (lines.length <= LINE_THRESHOLD) {
    return { content: output, summarized: false };
  }

  // Save full output to log file
  const logId = `exec-${Date.now().toString(36)}`;
  const logPath = join(DIRS.logs, `${logId}.log`);
  writeFileSync(logPath, output, "utf-8");

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `Summarize this ${context} concisely. Focus on: errors, warnings, key results, and actionable information. Omit boilerplate and repetitive lines.\n\n${output.slice(0, 30000)}`,
      }],
    });

    const summary = response.content[0].text;
    return {
      content: `[Summarized — ${lines.length} lines total, full output at ${logPath}]\n\n${summary}`,
      summarized: true,
      logPath,
    };
  } catch (err) {
    // Fallback: return first and last 50 lines
    const head = lines.slice(0, 50).join("\n");
    const tail = lines.slice(-50).join("\n");
    return {
      content: `[Output too long (${lines.length} lines), full output at ${logPath}]\n\nFirst 50 lines:\n${head}\n\n...\n\nLast 50 lines:\n${tail}`,
      summarized: true,
      logPath,
    };
  }
}
```

**Step 2: Wire summarizer into claude-client.js**

Add import:
```javascript
import { maybeSummarize } from "./shell/summarizer.js";
```

Update the `shell_exec` tool handler to summarize output:

```javascript
        if (toolUse.name === "shell_exec") {
          const result = await executeShell(toolUse.input.command, {
            cwd: toolUse.input.cwd,
            timeout: Math.min(toolUse.input.timeout || 30000, 600000),
            requestConfirmation: callbacks.requestConfirmation,
          });
          // Summarize long output to save tokens
          const combined = [result.stdout, result.stderr].filter(Boolean).join("\n");
          const { content: summarized, logPath } = await maybeSummarize(combined, "shell output");
          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify({ output: summarized, exitCode: result.exitCode, ...(logPath && { fullOutputPath: logPath }) }),
            ...(result.denied && { is_error: true }),
          };
        }
```

Similarly update `process_logs` handler to summarize.

**Step 3: Commit**

```bash
git add server/shell/summarizer.js server/claude-client.js
git commit -m "feat: add Haiku-based output summarization for long command output"
```

---

## Phase 4: Confirmation Canvas Element

### Task 16: Add ActionConfirm canvas element

**Files:**
- Create: `client/src/components/canvas-elements/ActionConfirm.jsx`
- Modify: `client/src/components/canvas-elements/index.js`

**Step 1: Create the ActionConfirm component**

```jsx
// client/src/components/canvas-elements/ActionConfirm.jsx
import { useState } from "react";

const AUTH_TOKEN = import.meta.env.VITE_AUTH_TOKEN || "";

function getWsUrl() {
  if (import.meta.env.VITE_WS_URL) {
    const base = import.meta.env.VITE_WS_URL;
    return AUTH_TOKEN ? `${base}?token=${AUTH_TOKEN}` : base;
  }
  if (import.meta.env.DEV) {
    const base = "ws://localhost:3001";
    return AUTH_TOKEN ? `${base}?token=${AUTH_TOKEN}` : base;
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const base = `${proto}//${window.location.host}`;
  return AUTH_TOKEN ? `${base}?token=${AUTH_TOKEN}` : base;
}

export default function ActionConfirm({ id, title, command, reason, context }) {
  const [status, setStatus] = useState("pending"); // pending | approved | denied

  function respond(approved) {
    setStatus(approved ? "approved" : "denied");
    // Send response via a short-lived WebSocket message
    // (or use a shared ref — for now, HTTP fallback)
    try {
      const ws = new WebSocket(getWsUrl());
      ws.addEventListener("open", () => {
        ws.send(JSON.stringify({ type: "confirm_response", id, approved }));
        ws.close();
      });
    } catch (err) {
      console.error("Failed to send confirmation response:", err);
    }
  }

  const bgColor = status === "approved"
    ? "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700"
    : status === "denied"
    ? "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700"
    : "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700";

  return (
    <div className={`rounded-xl border-2 p-4 ${bgColor} flex flex-col gap-3`}>
      <div className="flex flex-row items-center gap-2">
        <span className="text-lg">{status === "approved" ? "\u2705" : status === "denied" ? "\u274C" : "\u26A0\uFE0F"}</span>
        <span className="font-semibold text-base">{title || "Confirm Action"}</span>
      </div>

      {reason && (
        <p className="text-sm opacity-75">{reason}</p>
      )}

      <div className="rounded-lg bg-gray-900 text-green-400 p-3 font-mono text-sm overflow-x-auto">
        {command}
      </div>

      {context && (
        <p className="text-sm opacity-60">{context}</p>
      )}

      {status === "pending" ? (
        <div className="flex flex-row gap-3">
          <button
            onClick={() => respond(true)}
            className="flex-1 rounded-lg bg-green-500 active:bg-green-600 text-white font-medium py-2 px-4"
          >
            Approve
          </button>
          <button
            onClick={() => respond(false)}
            className="flex-1 rounded-lg bg-red-500 active:bg-red-600 text-white font-medium py-2 px-4"
          >
            Deny
          </button>
        </div>
      ) : (
        <p className="text-sm font-medium">
          {status === "approved" ? "Approved — executing command." : "Denied — command cancelled."}
        </p>
      )}
    </div>
  );
}
```

**Step 2: Export from index.js**

Add to `client/src/components/canvas-elements/index.js`:
```javascript
export { default as ActionConfirm } from "./ActionConfirm.jsx";
```

**Step 3: Commit**

```bash
git add client/src/components/canvas-elements/ActionConfirm.jsx client/src/components/canvas-elements/index.js
git commit -m "feat: add ActionConfirm interactive canvas element"
```

---

### Task 17: Wire confirmation into command router and reducer

**Files:**
- Modify: `client/src/lib/commandRouter.js`
- Modify: `client/src/context/BuddyState.jsx`
- Modify: `client/src/components/Canvas.jsx`

**Step 1: Add command mapping**

In `commandRouter.js`, add to the actionMap:
```javascript
  "canvas_show_confirmation": "CANVAS_SHOW_CONFIRMATION",
```

**Step 2: Add reducer action**

In `BuddyState.jsx`, add case after `CANVAS_SET_THEME`:
```javascript
    case "CANVAS_SHOW_CONFIRMATION":
      return addElement(state, "confirmation", action.payload);
```

**Step 3: Add confirmation rendering in Canvas.jsx**

In the element type → component mapping in Canvas.jsx, add:
```javascript
import { ActionConfirm } from "./canvas-elements";
// ... in the render mapping:
case "confirmation": return <ActionConfirm key={el.id} {...el} />;
```

**Step 4: Also add canvas_show_confirmation to tools.js on the server**

```javascript
  {
    name: "canvas_show_confirmation",
    description: "Internal tool — shows a confirmation dialog on the user's canvas. Used automatically by the confirmation gate, not called directly by the agent.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        command: { type: "string" },
        reason: { type: "string" },
        context: { type: "string" },
      },
      required: ["id", "command"],
    },
  },
```

Note: This tool definition exists so the response-splitter recognizes it as a canvas command, but it's never sent to Claude — it's only used by the server's confirmation gate internally.

**Step 5: Commit**

```bash
git add client/src/lib/commandRouter.js client/src/context/BuddyState.jsx client/src/components/Canvas.jsx server/tools.js
git commit -m "feat: wire ActionConfirm through command router, reducer, and canvas"
```

---

### Task 18: Verify Phase 4 — confirmation gate works end-to-end

**Step 1: Test a destructive command**

Send: "Delete everything in /tmp/test-folder" (create the folder first)
Expected: A confirmation card appears on the canvas. Clicking Approve runs the command. Clicking Deny cancels it.

**Step 2: Test auto-deny timeout**

Trigger a destructive command and wait 60 seconds without responding.
Expected: Agent reports the command was timed out / denied.

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: phase 4 confirmation gate integration fixes"
```

---

## Phase 5: Sub-Agent Spawner

### Task 19: Build sub-agent spawner module

**Files:**
- Create: `server/subagent/spawner.js`
- Create: `server/subagent/worker.js`

**Step 1: Create worker script**

The worker runs in a child process, has its own Claude conversation, and returns a result.

```javascript
// server/subagent/worker.js
// Runs as a forked child process. Receives task via IPC, runs Claude loop, returns result.

import Anthropic from "@anthropic-ai/sdk";
import { executeShell } from "../shell/executor.js";
import { readFile, writeFile, listDirectory } from "../shell/filesystem.js";

const anthropic = new Anthropic();

const TOOL_HANDLERS = {
  shell_exec: async (input) => {
    const result = await executeShell(input.command, { cwd: input.cwd, timeout: input.timeout || 30000 });
    return JSON.stringify({ stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode });
  },
  read_file: async (input) => {
    const result = readFile(input.path);
    return result.error ? JSON.stringify({ error: result.error }) : result.content;
  },
  write_file: async (input) => {
    const result = writeFile(input.path, input.content);
    return result.error ? JSON.stringify({ error: result.error }) : JSON.stringify({ status: "written" });
  },
  list_directory: async (input) => {
    const result = listDirectory(input.path);
    return result.error ? JSON.stringify({ error: result.error }) : JSON.stringify(result.entries);
  },
};

process.on("message", async (msg) => {
  if (msg.type !== "start") return;

  const { task, systemPrompt, tools, model, maxTurns } = msg;

  try {
    const messages = [{ role: "user", content: task }];
    let turns = 0;

    let response = await anthropic.messages.create({
      model: model || "claude-haiku-4-5-20251001",
      system: systemPrompt || "You are a helpful sub-agent. Complete the given task and return a concise result.",
      messages,
      tools: tools || [],
      max_tokens: 4096,
    });

    while (response.stop_reason === "tool_use" && turns < (maxTurns || 10)) {
      turns++;
      const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");

      const toolResults = await Promise.all(
        toolUseBlocks.map(async (toolUse) => {
          const handler = TOOL_HANDLERS[toolUse.name];
          if (handler) {
            const content = await handler(toolUse.input);
            return { type: "tool_result", tool_use_id: toolUse.id, content };
          }
          return { type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify({ error: "Unknown tool" }), is_error: true };
        })
      );

      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });

      response = await anthropic.messages.create({
        model: model || "claude-haiku-4-5-20251001",
        system: systemPrompt || "You are a helpful sub-agent. Complete the given task and return a concise result.",
        messages,
        tools: tools || [],
        max_tokens: 4096,
      });
    }

    const resultText = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    process.send({ type: "result", result: resultText });
  } catch (err) {
    process.send({ type: "error", error: err.message });
  }
});
```

**Step 2: Create spawner module**

```javascript
// server/subagent/spawner.js
import { fork } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import db from "../db.js";
import tools from "../tools.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = join(__dirname, "worker.js");

const activeSubAgents = new Map();

// ─── Template CRUD ──────────────────────────────────────────────────────────

export function createTemplate({ name, system_prompt, allowed_tools, max_turns }) {
  db.prepare(`
    INSERT INTO agent_templates (name, system_prompt, allowed_tools, max_turns)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      system_prompt = excluded.system_prompt,
      allowed_tools = excluded.allowed_tools,
      max_turns = excluded.max_turns,
      updated_at = datetime('now')
  `).run(name, system_prompt, JSON.stringify(allowed_tools || []), max_turns || 10);
  return { status: "created", name };
}

export function getTemplate(name) {
  const row = db.prepare("SELECT * FROM agent_templates WHERE name = ?").get(name);
  if (!row) return null;
  return { ...row, allowed_tools: JSON.parse(row.allowed_tools) };
}

export function listTemplates() {
  return db.prepare("SELECT name, system_prompt, allowed_tools, max_turns FROM agent_templates").all()
    .map((row) => ({ ...row, allowed_tools: JSON.parse(row.allowed_tools) }));
}

export function deleteTemplate(name) {
  return db.prepare("DELETE FROM agent_templates WHERE name = ?").run(name);
}

// ─── Spawn ──────────────────────────────────────────────────────────────────

export function spawnSubAgent({ task, template: templateName, timeout = 300000 }) {
  return new Promise((resolve) => {
    let tmpl = null;
    if (templateName) {
      tmpl = getTemplate(templateName);
    }

    // Filter tools based on template's allowed_tools
    let subTools = tools.filter((t) =>
      ["shell_exec", "read_file", "write_file", "list_directory"].includes(t.name)
    );
    if (tmpl && tmpl.allowed_tools.length > 0) {
      subTools = tools.filter((t) => tmpl.allowed_tools.includes(t.name));
    }

    const child = fork(WORKER_PATH, [], {
      env: { ...process.env },
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });

    const id = `subagent-${Date.now().toString(36)}`;
    activeSubAgents.set(id, { child, task, startedAt: Date.now() });

    const timer = setTimeout(() => {
      child.kill();
      activeSubAgents.delete(id);
      resolve({ result: "Sub-agent timed out.", error: true });
    }, timeout);

    child.on("message", (msg) => {
      clearTimeout(timer);
      activeSubAgents.delete(id);
      child.kill();

      if (msg.type === "result") {
        resolve({ result: msg.result, error: false });
      } else {
        resolve({ result: `Sub-agent error: ${msg.error}`, error: true });
      }
    });

    child.on("exit", () => {
      clearTimeout(timer);
      activeSubAgents.delete(id);
    });

    child.send({
      type: "start",
      task,
      systemPrompt: tmpl?.system_prompt,
      tools: subTools,
      model: tmpl?.model || "claude-haiku-4-5-20251001",
      maxTurns: tmpl?.max_turns || 10,
    });
  });
}
```

**Step 3: Commit**

```bash
git add server/subagent/spawner.js server/subagent/worker.js
git commit -m "feat: add sub-agent spawner with template system"
```

---

### Task 20: Add sub-agent tools to tools.js and claude-client.js

**Files:**
- Modify: `server/tools.js`
- Modify: `server/claude-client.js`

**Step 1: Add spawn_agent and create_agent_template tool definitions to tools.js**

```javascript
  {
    name: "spawn_agent",
    description:
      "Spawn a sub-agent to handle a task independently. The sub-agent works in the background with its own conversation and tools, then returns a result. Use for research, complex file operations, or any task you want to delegate.",
    input_schema: {
      type: "object",
      properties: {
        task: { type: "string", description: "Clear description of what the sub-agent should accomplish." },
        template: { type: "string", description: "Optional name of a saved agent template to use." },
        timeout: { type: "number", description: "Timeout in milliseconds (default: 300000 = 5 minutes)." },
      },
      required: ["task"],
    },
  },
  {
    name: "create_agent_template",
    description:
      "Create or update a reusable sub-agent template. Templates define the system prompt, allowed tools, and max turns for sub-agents.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Template name (used as identifier)." },
        system_prompt: { type: "string", description: "System prompt for the sub-agent." },
        allowed_tools: {
          type: "array",
          items: { type: "string" },
          description: "Tool names the sub-agent can use (default: shell_exec, read_file, write_file, list_directory).",
        },
        max_turns: { type: "integer", description: "Maximum tool-use turns before stopping (default: 10)." },
      },
      required: ["name", "system_prompt"],
    },
  },
```

Update PLATFORM_TOOL_NAMES:
```javascript
export const PLATFORM_TOOL_NAMES = [
  "shell_exec", "read_file", "write_file", "list_directory",
  "process_start", "process_stop", "process_status", "process_logs",
  "spawn_agent", "create_agent_template"
];
```

**Step 2: Wire in claude-client.js**

Add import:
```javascript
import { spawnSubAgent, createTemplate } from "./subagent/spawner.js";
```

Add tool handlers:
```javascript
        if (toolUse.name === "spawn_agent") {
          const result = await spawnSubAgent({
            task: toolUse.input.task,
            template: toolUse.input.template,
            timeout: toolUse.input.timeout,
          });
          // Summarize long sub-agent results
          const { content: summarized } = await maybeSummarize(result.result, "sub-agent result");
          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: summarized,
            ...(result.error && { is_error: true }),
          };
        }
        if (toolUse.name === "create_agent_template") {
          const result = createTemplate(toolUse.input);
          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          };
        }
```

**Step 3: Commit**

```bash
git add server/tools.js server/claude-client.js
git commit -m "feat: add spawn_agent and create_agent_template tools"
```

---

### Task 21: Verify Phase 5 — sub-agents work

**Step 1: Test basic sub-agent**

Send: "I need you to research what version of Python is installed on this machine and what pip packages are available. Delegate this to a sub-agent."
Expected: Agent uses `spawn_agent`, waits, then relays the results.

**Step 2: Test template creation**

Send: "Create a sub-agent template called 'researcher' that's good at gathering information from the filesystem"
Expected: Agent uses `create_agent_template`, confirms creation.

**Step 3: Test spawning with template**

Send: "Use the researcher template to find all .md files in my home directory"
Expected: Agent spawns sub-agent with the researcher template.

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: phase 5 sub-agent integration fixes"
```

---

## Phase 6: Frontend Cleanup

### Task 22: Simplify ToolSelector — remove sandbox category

**Files:**
- Modify: `client/src/components/admin/ToolSelector.jsx`

**Step 1: Update tool categories**

Remove the "Sandbox" category. Platform tools (shell_exec, read_file, write_file, list_directory, process_*, spawn_agent, create_agent_template) are always available and don't appear as toggleable switches. Only show toggleable tools:
- Built-in: search_youtube, remember_fact
- Installed skills: whatever's in `~/.buddy/skills/`

Canvas tools stay hidden (always on).

**Step 2: Commit**

```bash
git add client/src/components/admin/ToolSelector.jsx
git commit -m "feat: simplify ToolSelector — remove sandbox category, platform tools always on"
```

---

### Task 23: Handle confirm_response via shared WebSocket ref

**Files:**
- Modify: `client/src/hooks/useWebSocket.js`
- Modify: `client/src/components/canvas-elements/ActionConfirm.jsx`

**Step 1: Export sendMessage from useWebSocket**

The ActionConfirm component currently opens a new WebSocket to send the response. This is fragile. Instead, expose a `sendMessage` function from the existing WebSocket hook via context or a ref.

Add a `sendMessage` function to useWebSocket that sends JSON through the existing connection, and make it available via the BuddyContext or a separate WebSocket context. Then update ActionConfirm to use it instead of opening a new connection.

The simplest approach: add `wsRef` to the BuddyContext value so any component can send messages.

**Step 2: Commit**

```bash
git add client/src/hooks/useWebSocket.js client/src/components/canvas-elements/ActionConfirm.jsx client/src/context/BuddyState.jsx
git commit -m "feat: share WebSocket ref via context for ActionConfirm responses"
```

---

### Task 24: Update system-prompt.md for new architecture

**Files:**
- Modify: `server/system-prompt.md`

**Step 1: Update system prompt template**

Update the system prompt to reflect the new architecture. The agent should know:
- It has full host access (shell_exec runs on the host, not in a sandbox)
- It can read/write files anywhere (with env mode restrictions)
- It can manage background processes
- It can spawn sub-agents for complex tasks
- Destructive commands will trigger a confirmation card the user must approve
- Skills live at `~/.buddy/skills/` and it can create/modify them with write_file
- It should keep subtitles to 1-3 sentences and use canvas for detailed content

**Step 2: Commit**

```bash
git add server/system-prompt.md
git commit -m "feat: update system prompt for Server-as-OS architecture"
```

---

## Phase 7: Final Integration & Testing

### Task 25: End-to-end integration test

**Step 1: Fresh start**

Stop the server. Delete `~/.buddy/` to start clean. Start the server.
Expected: `~/.buddy/` directory tree recreated, default guards.json written, buddy agent seeded.

**Step 2: Test full prompt flow**

Send: "Hello, what can you do?"
Expected: Buddy responds with subtitle describing its capabilities (shell, files, processes, sub-agents, skills).

**Step 3: Test skill creation via conversation**

Send: "Create a skill called 'system-monitor' that checks CPU and memory usage when I ask about system health. It should use a Python script."
Expected: Agent uses `write_file` to create `~/.buddy/skills/system-monitor/SKILL.md` and a Python script. Next prompt should show the skill in the system prompt metadata.

**Step 4: Test skill usage**

Send: "How's my system doing?" (should trigger the system-monitor skill)
Expected: Agent reads the skill, runs the Python script, relays results.

**Step 5: Test sub-agent + process combo**

Send: "Start a file watcher that monitors ~/.buddy/skills/ for changes, and also spawn a sub-agent to document all my current skills"
Expected: Agent uses `process_start` for the watcher and `spawn_agent` for the documentation task.

**Step 6: Test confirmation gate**

Send: "Delete the test-greeter skill folder completely"
Expected: Confirmation card appears on canvas. Approve → folder deleted. Check that existing canvas elements remain.

**Step 7: Commit final state**

```bash
git add -A
git commit -m "feat: Server-as-OS redesign complete — all phases integrated"
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| 1: Foundation | 1-11 | Host shell/filesystem, no Docker, config module |
| 2: Process Manager | 12-14 | Background process start/stop/status/logs |
| 3: Output Summarization | 15 | Haiku-based long output summarization |
| 4: Confirmation Gate | 16-18 | Interactive ActionConfirm canvas element |
| 5: Sub-Agent Spawner | 19-21 | spawn_agent + create_agent_template |
| 6: Frontend Cleanup | 22-24 | Simplified ToolSelector, shared WS ref, updated system prompt |
| 7: Final Integration | 25 | End-to-end testing of all features together |
