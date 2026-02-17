/**
 * Sandbox executor — runs commands inside the buddy-sandbox Docker container
 * via `docker exec`. Includes timeout handling, output truncation, and
 * safety guard integration.
 *
 * Uses execFile (not exec) to bypass the host shell entirely. This avoids
 * Windows cmd.exe quoting issues — arguments are passed as an array directly
 * to the Docker CLI, with no shell interpretation on the host side.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { validateCommand } from "./guards.js";

const execFileAsync = promisify(execFile);

const CONTAINER_NAME = "buddy-sandbox";
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_LENGTH = 50_000;

/**
 * @typedef {Object} ExecutionResult
 * @property {string} stdout
 * @property {string} stderr
 * @property {number} exitCode
 * @property {boolean} timedOut
 */

/**
 * Execute a command inside the sandbox container.
 *
 * @param {string} command - Shell command to run.
 * @param {Object} [options]
 * @param {string} [options.cwd] - Working directory inside container (default: /agent).
 * @param {number} [options.timeout] - Timeout in ms (default: 30000).
 * @returns {Promise<ExecutionResult>}
 */
export async function executeInSandbox(command, options) {
  const cwd = options?.cwd ?? "/agent";
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;

  // Safety check
  const validation = validateCommand(command);
  if (!validation.safe) {
    return {
      stdout: "",
      stderr: `Command blocked: ${validation.reason}`,
      exitCode: 1,
      timedOut: false,
    };
  }

  // Pass arguments as an array — no host shell involved, no quoting issues.
  // The command string is passed as a single argument to `sh -c` inside the container.
  const args = [
    "exec",
    "--workdir", cwd,
    CONTAINER_NAME,
    "sh", "-lc", command,
  ];

  try {
    const { stdout, stderr } = await execFileAsync("docker", args, {
      timeout,
      maxBuffer: 1024 * 1024 * 10, // 10MB
    });

    return {
      stdout: truncate(stdout, MAX_OUTPUT_LENGTH),
      stderr: truncate(stderr, MAX_OUTPUT_LENGTH),
      exitCode: 0,
      timedOut: false,
    };
  } catch (error) {
    if (error.killed) {
      return {
        stdout: truncate(error.stdout ?? "", MAX_OUTPUT_LENGTH),
        stderr: "Command timed out",
        exitCode: 124,
        timedOut: true,
      };
    }
    return {
      stdout: truncate(error.stdout ?? "", MAX_OUTPUT_LENGTH),
      stderr: truncate(error.stderr ?? error.message, MAX_OUTPUT_LENGTH),
      exitCode: error.code ?? 1,
      timedOut: false,
    };
  }
}

function truncate(str, maxLen) {
  if (!str) return "";
  if (str.length <= maxLen) return str;
  return (
    str.slice(0, maxLen) +
    `\n... [truncated, ${str.length - maxLen} chars omitted]`
  );
}
