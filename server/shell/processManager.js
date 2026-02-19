/**
 * Process manager — manages long-lived background processes on the host.
 *
 * Spawns detached child processes, pipes their stdout/stderr to log files
 * under ~/.buddy/processes/<id>/, and tracks them in a module-level Map.
 * Supports starting, stopping, querying status, and reading logs.
 */

import { spawn } from "child_process";
import { homedir } from "os";
import { join } from "path";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  createWriteStream,
  readdirSync,
  existsSync,
} from "fs";
import { DIRS } from "../config.js";

// ─── Active process tracking ────────────────────────────────────────────────

/** @type {Map<string, { proc: import("child_process").ChildProcess, meta: Object }>} */
const activeProcesses = new Map();

// ─── ID generation ──────────────────────────────────────────────────────────

/**
 * Generate a process ID from an optional name or the command.
 * Takes the first 2 words of the command, sanitizes to alphanum+dash,
 * and appends a base36 timestamp.
 *
 * @param {string} command
 * @param {string} [name]
 * @returns {string}
 */
function generateId(command, name) {
  const base = name
    ? name
    : command
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .join("-");

  const sanitized = base
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || "proc";

  const timestamp = Date.now().toString(36);
  return `${sanitized}-${timestamp}`;
}

// ─── Meta helpers ───────────────────────────────────────────────────────────

function metaPath(id) {
  return join(DIRS.processes, id, "meta.json");
}

function writeMeta(id, meta) {
  writeFileSync(metaPath(id), JSON.stringify(meta, null, 2) + "\n");
}

function readMeta(id) {
  try {
    return JSON.parse(readFileSync(metaPath(id), "utf-8"));
  } catch {
    return null;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Start a long-lived background process.
 *
 * @param {string} command - Shell command to run.
 * @param {Object} [options]
 * @param {string} [options.cwd]  - Working directory (default: user home).
 * @param {string} [options.name] - Optional human-friendly name for the process.
 * @returns {{ id: string, pid: number, status: string } | { error: string }}
 */
export function startProcess(command, options) {
  const cwd = options?.cwd ?? homedir();
  const name = options?.name ?? undefined;

  if (!command || !command.trim()) {
    return { error: "No command provided" };
  }

  const id = generateId(command, name);
  const procDir = join(DIRS.processes, id);

  // Create process directory and log files
  mkdirSync(procDir, { recursive: true });

  const stdoutPath = join(procDir, "stdout.log");
  const stderrPath = join(procDir, "stderr.log");

  const stdoutStream = createWriteStream(stdoutPath, { flags: "a" });
  const stderrStream = createWriteStream(stderrPath, { flags: "a" });

  // Spawn detached process
  const proc = spawn("sh", ["-c", command], {
    cwd,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, HOME: homedir() },
  });

  // Pipe output to log files
  proc.stdout.pipe(stdoutStream);
  proc.stderr.pipe(stderrStream);

  // Build metadata
  const meta = {
    id,
    command,
    cwd,
    pid: proc.pid,
    status: "running",
    startedAt: new Date().toISOString(),
    exitCode: null,
    stoppedAt: null,
  };

  writeMeta(id, meta);
  activeProcesses.set(id, { proc, meta });

  // Handle process exit
  proc.on("close", (code) => {
    meta.status = "stopped";
    meta.exitCode = code;
    meta.stoppedAt = new Date().toISOString();
    writeMeta(id, meta);

    // Close log streams
    stdoutStream.end();
    stderrStream.end();

    // Keep meta in Map for status queries until explicitly cleaned
    // but remove the proc reference
    activeProcesses.delete(id);
  });

  proc.on("error", (err) => {
    meta.status = "stopped";
    meta.exitCode = 1;
    meta.stoppedAt = new Date().toISOString();
    meta.error = err.message;
    writeMeta(id, meta);

    stdoutStream.end();
    stderrStream.end();
    activeProcesses.delete(id);
  });

  // Unref so the main process can exit without waiting
  proc.unref();

  return { id, pid: proc.pid, status: "running" };
}

/**
 * Stop a running background process.
 * Sends SIGTERM first, then SIGKILL after 5 seconds if still alive.
 *
 * @param {string} id - Process ID.
 * @returns {{ status: string, id: string } | { error: string }}
 */
export function stopProcess(id) {
  const entry = activeProcesses.get(id);
  if (!entry) {
    // Check if it exists on disk but already stopped
    const meta = readMeta(id);
    if (meta) {
      return { error: `Process ${id} is not running (status: ${meta.status})` };
    }
    return { error: `Process ${id} not found` };
  }

  const { proc, meta } = entry;

  try {
    // Send SIGTERM to the process group (negative PID kills the group)
    process.kill(-proc.pid, "SIGTERM");
  } catch {
    // Process may have already exited
    try {
      proc.kill("SIGTERM");
    } catch {
      // Already dead
    }
  }

  // Force kill after 5 seconds if still alive
  const killTimer = setTimeout(() => {
    try {
      process.kill(-proc.pid, "SIGKILL");
    } catch {
      try {
        proc.kill("SIGKILL");
      } catch {
        // Already dead
      }
    }
  }, 5000);

  // Clean up the timer when the process exits
  proc.on("close", () => {
    clearTimeout(killTimer);
  });

  return { status: "stopping", id };
}

/**
 * Get status of a process or all active processes.
 *
 * @param {string} [id] - Process ID. If omitted, returns all active process metas.
 * @returns {Object | Object[] | { error: string }}
 */
export function getProcessStatus(id) {
  if (!id) {
    // Return all active process metas
    const results = [];
    for (const [, entry] of activeProcesses) {
      results.push({ ...entry.meta });
    }
    return results;
  }

  // Check active processes first
  const entry = activeProcesses.get(id);
  if (entry) {
    return { ...entry.meta };
  }

  // Fall back to disk
  const meta = readMeta(id);
  if (meta) {
    return meta;
  }

  return { error: `Process ${id} not found` };
}

/**
 * Read log output from a process.
 *
 * @param {string} id - Process ID.
 * @param {Object} [options]
 * @param {number}  [options.lines=50]       - Number of lines to return from the end.
 * @param {"stdout"|"stderr"} [options.stream="stdout"] - Which log stream to read.
 * @returns {{ log: string, totalLines: number } | { error: string }}
 */
export function getProcessLogs(id, options) {
  const lines = options?.lines ?? 50;
  const stream = options?.stream ?? "stdout";

  const logFile = stream === "stderr"
    ? join(DIRS.processes, id, "stderr.log")
    : join(DIRS.processes, id, "stdout.log");

  if (!existsSync(logFile)) {
    // Check if the process directory exists at all
    if (!existsSync(join(DIRS.processes, id))) {
      return { error: `Process ${id} not found` };
    }
    return { log: "", totalLines: 0 };
  }

  try {
    const content = readFileSync(logFile, "utf-8");
    const allLines = content.split("\n");

    // Remove trailing empty line from final newline
    if (allLines.length > 0 && allLines[allLines.length - 1] === "") {
      allLines.pop();
    }

    const totalLines = allLines.length;
    const lastN = allLines.slice(-lines).join("\n");

    return { log: lastN, totalLines };
  } catch (err) {
    return { error: `Failed to read logs: ${err.message}` };
  }
}

/**
 * List all processes (active and historical) from the processes directory.
 *
 * @returns {Object[]} Array of meta objects.
 */
export function listAllProcesses() {
  const results = [];

  try {
    const dirs = readdirSync(DIRS.processes);
    for (const dir of dirs) {
      const meta = readMeta(dir);
      if (meta) {
        results.push(meta);
      }
    }
  } catch {
    // Processes directory might not have any entries yet
  }

  return results;
}
