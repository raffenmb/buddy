/**
 * Command safety guards — validates commands before sandbox execution.
 * Blocks dangerous patterns even though the container is sandboxed.
 */

const BLOCKED_PATTERNS = [
  { pattern: /rm\s+-rf\s+\/(?!agent)/, reason: "rm -rf outside /agent" },
  { pattern: /:\(\)\{\s*:\|:&\s*\};:/, reason: "fork bomb" },
  { pattern: /mkfs/, reason: "filesystem format" },
  { pattern: /dd\s+if=/, reason: "raw disk write" },
  { pattern: /curl.*\|\s*sh/, reason: "pipe curl to shell" },
  { pattern: /wget.*\|\s*sh/, reason: "pipe wget to shell" },
  { pattern: />\s*\/dev\/sd/, reason: "write to block device" },
];

const BLOCKED_COMMANDS = [
  "shutdown",
  "reboot",
  "poweroff",
  "halt",
  "iptables",
  "ip6tables",
];

/**
 * Check whether a command is safe to run in the sandbox.
 * @param {string} command
 * @returns {{ safe: boolean, reason?: string }}
 */
export function validateCommand(command) {
  for (const { pattern, reason } of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      return { safe: false, reason: `Blocked: ${reason}` };
    }
  }

  const firstWord = command.trim().split(/\s+/)[0];
  if (BLOCKED_COMMANDS.includes(firstWord)) {
    return { safe: false, reason: `Blocked command: ${firstWord}` };
  }

  return { safe: true };
}
