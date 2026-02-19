/**
 * Host shell executor — runs commands directly on the host machine
 * via `sh -c`. Integrates safety guards and supports user confirmation
 * for destructive commands.
 *
 * Replaces the Docker sandbox executor. Instead of running inside a
 * container, commands execute on the host with environment guards that
 * block dangerous commands and pause for user approval when needed.
 */

import { spawn } from "child_process";
import { homedir } from "os";
import { validateCommand } from "./guards.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 50_000; // 50KB per stream

/**
 * @typedef {Object} ExecutionResult
 * @property {string}  stdout
 * @property {string}  stderr
 * @property {number}  exitCode
 * @property {boolean} timedOut
 * @property {boolean} denied
 */

/**
 * Execute a shell command on the host.
 *
 * @param {string} command - Shell command to run.
 * @param {Object} [options]
 * @param {string}   [options.cwd]                  - Working directory (default: user home).
 * @param {number}   [options.timeout]               - Timeout in ms (default: 30000).
 * @param {function} [options.requestConfirmation]   - Async callback that resolves to true/false.
 * @returns {Promise<ExecutionResult>}
 */
export async function executeShell(command, options) {
  const cwd = options?.cwd ?? homedir();
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;
  const requestConfirmation = options?.requestConfirmation ?? null;

  // ── Safety check ──────────────────────────────────────────────────────────
  const validation = validateCommand(command);

  if (!validation.safe && !validation.needsConfirmation) {
    // Hard-blocked — no way through
    return {
      stdout: "",
      stderr: `Command blocked: ${validation.reason}`,
      exitCode: 1,
      timedOut: false,
      denied: true,
    };
  }

  if (!validation.safe && validation.needsConfirmation) {
    // Destructive — ask user for approval
    if (typeof requestConfirmation === "function") {
      let approved;
      try {
        approved = await requestConfirmation(command, validation.reason);
      } catch {
        approved = false;
      }
      if (!approved) {
        return {
          stdout: "",
          stderr: `Command denied by user: ${validation.reason}`,
          exitCode: 1,
          timedOut: false,
          denied: true,
        };
      }
      // User approved — fall through to execution
    } else {
      // No callback available — deny by default
      return {
        stdout: "",
        stderr: `Command requires confirmation but no confirmation handler available: ${validation.reason}`,
        exitCode: 1,
        timedOut: false,
        denied: true,
      };
    }
  }

  // ── Execute ───────────────────────────────────────────────────────────────
  return new Promise((resolve) => {
    const proc = spawn("sh", ["-c", command], {
      cwd,
      env: { ...process.env, HOME: homedir() },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdoutChunks = [];
    const stderrChunks = [];
    let stdoutLen = 0;
    let stderrLen = 0;
    let timedOut = false;

    // Timeout handler
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, timeout);

    proc.stdout.on("data", (chunk) => {
      if (stdoutLen < MAX_OUTPUT_BYTES) {
        stdoutChunks.push(chunk);
        stdoutLen += chunk.length;
      }
    });

    proc.stderr.on("data", (chunk) => {
      if (stderrLen < MAX_OUTPUT_BYTES) {
        stderrChunks.push(chunk);
        stderrLen += chunk.length;
      }
    });

    proc.on("close", (code) => {
      clearTimeout(timer);

      const stdout = truncate(
        Buffer.concat(stdoutChunks).toString("utf-8"),
        MAX_OUTPUT_BYTES
      );
      const stderr = timedOut
        ? "Command timed out"
        : truncate(
            Buffer.concat(stderrChunks).toString("utf-8"),
            MAX_OUTPUT_BYTES
          );

      resolve({
        stdout,
        stderr,
        exitCode: timedOut ? 124 : (code ?? 1),
        timedOut,
        denied: false,
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        stdout: "",
        stderr: `Spawn error: ${err.message}`,
        exitCode: 1,
        timedOut: false,
        denied: false,
      });
    });
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncate(str, maxLen) {
  if (!str) return "";
  if (str.length <= maxLen) return str;
  return (
    str.slice(0, maxLen) +
    `\n... [truncated, ${str.length - maxLen} chars omitted]`
  );
}
