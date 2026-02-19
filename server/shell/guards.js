/**
 * Command safety guards — validates commands before host execution.
 *
 * Reads guards.json from GUARDS_PATH (created by config.js on first run).
 * Three outcomes:
 *   1. Hard-blocked  — command's first word is in blocked_commands → reject
 *   2. Needs confirmation — matches a destructive_patterns regex or
 *      (in dev mode) writes outside ~/.buddy and /tmp → pause for user approval
 *   3. Safe — nothing matched → proceed
 */

import { readFileSync } from "fs";
import { GUARDS_PATH, ENV, BUDDY_HOME } from "../config.js";

// ─── Load guards.json ─────────────────────────────────────────────────────────

let guards;
try {
  guards = JSON.parse(readFileSync(GUARDS_PATH, "utf-8"));
} catch {
  guards = { destructive_patterns: [], blocked_commands: [] };
}

const blockedCommands = new Set(guards.blocked_commands ?? []);

const destructivePatterns = (guards.destructive_patterns ?? []).map(
  (pattern) => {
    try {
      return new RegExp(pattern);
    } catch {
      return null;
    }
  }
).filter(Boolean);

// ─── Dev-mode write guards ──────────────────────────────────────────────────
// In development, commands that write outside ~/.buddy and /tmp need confirmation.

/**
 * Patterns that suggest writing outside safe directories.
 * Each entry: { regex, reason }.
 */
const devWritePatterns = [
  {
    // Redirect output (> or >>) to a path that isn't under ~/.buddy or /tmp
    regex: new RegExp(
      `(?:>|>>)\\s*(?!${escapeForRegex(BUDDY_HOME)}|/tmp)(/\\S+|~(?!/\\.buddy)\\S*)`
    ),
    reason: "Redirect writes outside ~/.buddy and /tmp",
  },
  {
    // tee to a path outside safe dirs
    regex: new RegExp(
      `tee\\s+(?:-[a-zA-Z]\\s+)*(?!${escapeForRegex(BUDDY_HOME)}|/tmp)(/\\S+|~(?!/\\.buddy)\\S*)`
    ),
    reason: "tee writes outside ~/.buddy and /tmp",
  },
  {
    // Package install commands (apt, yum, brew, npm -g, pip)
    regex: /(?:sudo\s+)?(?:apt(?:-get)?|yum|dnf|brew|pacman)\s+install/,
    reason: "System package install",
  },
  {
    regex: /npm\s+(?:install|i)\s+-g/,
    reason: "Global npm install",
  },
  {
    regex: /pip3?\s+install(?!\s+--user)/,
    reason: "pip install (may write to system dirs)",
  },
];

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Validate a command before execution.
 *
 * @param {string} command - The shell command string.
 * @returns {{ safe: boolean, needsConfirmation: boolean, reason?: string }}
 */
export function validateCommand(command) {
  const trimmed = command.trim();
  if (!trimmed) {
    return { safe: false, needsConfirmation: false, reason: "Empty command" };
  }

  // 1. Hard-blocked commands (first word match)
  const firstWord = trimmed.split(/\s+/)[0];
  if (blockedCommands.has(firstWord)) {
    return {
      safe: false,
      needsConfirmation: false,
      reason: `Blocked command: ${firstWord}`,
    };
  }

  // 2. Destructive patterns from guards.json — needs user confirmation
  for (const regex of destructivePatterns) {
    if (regex.test(trimmed)) {
      return {
        safe: false,
        needsConfirmation: true,
        reason: `Destructive pattern detected: ${regex.source}`,
      };
    }
  }

  // 3. Dev-mode write guards — restrict writes outside safe dirs
  if (ENV === "development") {
    for (const { regex, reason } of devWritePatterns) {
      if (regex.test(trimmed)) {
        return {
          safe: false,
          needsConfirmation: true,
          reason,
        };
      }
    }
  }

  // 4. All clear
  return { safe: true, needsConfirmation: false };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeForRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
