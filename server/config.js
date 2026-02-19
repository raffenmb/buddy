/**
 * Buddy config — defines BUDDY_HOME (~/.buddy), directory structure,
 * environment, and safety guards. Creates all directories and default
 * config files on first import.
 */

import { homedir } from "os";
import { join } from "path";
import { mkdirSync, existsSync, writeFileSync } from "fs";

// ─── Environment ─────────────────────────────────────────────────────────────

const ENV = process.env.BUDDY_ENV || "development";

// ─── Directory structure ─────────────────────────────────────────────────────

const BUDDY_HOME = join(homedir(), ".buddy");

const DIRS = {
  root: BUDDY_HOME,
  skills: join(BUDDY_HOME, "skills"),
  agents: join(BUDDY_HOME, "agents"),
  processes: join(BUDDY_HOME, "processes"),
  logs: join(BUDDY_HOME, "logs"),
  shared: join(BUDDY_HOME, "shared"),
  config: join(BUDDY_HOME, "config"),
};

// Create all directories if they don't exist
for (const dir of Object.values(DIRS)) {
  mkdirSync(dir, { recursive: true });
}

// ─── Guards config ───────────────────────────────────────────────────────────

const GUARDS_PATH = join(DIRS.config, "guards.json");

const DEFAULT_GUARDS = {
  destructive_patterns: [
    "rm\\s+(-[^\\s]*)?\\s*-[^\\s]*r[^\\s]*\\s+/(?!home|tmp)",
    "rm\\s+(-[^\\s]*)?\\s*-[^\\s]*r[^\\s]*\\s+~(?!/\\.buddy)",
    "mkfs",
    "dd\\s+.*of=/dev/",
    ":\\(\\)\\{\\s*:\\|:\\s*&\\s*\\}\\s*;\\s*:",
    "curl\\s+.*\\|\\s*(ba)?sh",
    "wget\\s+.*\\|\\s*(ba)?sh",
    "curl\\s+.*\\|\\s*sudo",
    "wget\\s+.*\\|\\s*sudo",
    ">\\s*/dev/[sh]d[a-z]",
  ],
  blocked_commands: [
    "shutdown",
    "reboot",
    "poweroff",
    "halt",
    "iptables",
    "ip6tables",
  ],
};

if (!existsSync(GUARDS_PATH)) {
  writeFileSync(GUARDS_PATH, JSON.stringify(DEFAULT_GUARDS, null, 2) + "\n");
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export { BUDDY_HOME, ENV, DIRS, GUARDS_PATH };
