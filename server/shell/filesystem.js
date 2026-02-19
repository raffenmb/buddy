/**
 * Host filesystem tools — read, write, and list files directly on the host.
 * Replaces the Docker sandbox file operations.
 *
 * In development mode, writes are restricted to DIRS.root (~/.buddy) and /tmp
 * to avoid accidentally modifying system files during testing.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "fs";
import { resolve, dirname } from "path";
import { homedir } from "os";
import { ENV, DIRS } from "../config.js";

/**
 * Read a file from the host filesystem.
 *
 * @param {string} filePath - Path to the file (resolved to absolute).
 * @returns {{ content: string|null, error: string|null }}
 */
export function readFile(filePath) {
  const abs = resolve(filePath);

  try {
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      return { content: null, error: `Path is a directory: ${abs}` };
    }
    const content = readFileSync(abs, "utf-8");
    return { content, error: null };
  } catch (err) {
    if (err.code === "ENOENT") {
      return { content: null, error: `File not found: ${abs}` };
    }
    return { content: null, error: err.message };
  }
}

/**
 * Write a file to the host filesystem.
 *
 * In development mode, only allows writes under DIRS.root (~/.buddy) or /tmp.
 * In production mode, all paths are allowed.
 * Creates parent directories automatically.
 *
 * @param {string} filePath - Path to write to (resolved to absolute).
 * @param {string} content - File content to write (utf-8).
 * @returns {{ error: string|null }}
 */
export function writeFile(filePath, content) {
  const abs = resolve(filePath);

  // Development mode write restriction
  if (ENV === "development") {
    const allowed = abs.startsWith(DIRS.root) || abs.startsWith("/tmp");
    if (!allowed) {
      return {
        error: `Development mode: writes restricted to ${DIRS.root} or /tmp (got ${abs})`,
      };
    }
  }

  try {
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, "utf-8");
    return { error: null };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * List entries in a directory.
 *
 * @param {string} [dirPath] - Directory to list (defaults to user home).
 * @returns {{ entries: Array<{name: string, type: string, size: number, modified: string}>|null, error: string|null }}
 */
export function listDirectory(dirPath) {
  const abs = resolve(dirPath || homedir());

  try {
    const entries = readdirSync(abs).map((name) => {
      try {
        const stat = statSync(resolve(abs, name));
        return {
          name,
          type: stat.isDirectory() ? "directory" : "file",
          size: stat.size,
          modified: stat.mtime.toISOString(),
        };
      } catch {
        // Entry exists in listing but can't be stat'd (permissions, broken symlink, etc.)
        return { name, type: "file", size: 0, modified: null };
      }
    });
    return { entries, error: null };
  } catch (err) {
    if (err.code === "ENOENT") {
      return { entries: null, error: `Directory not found: ${abs}` };
    }
    return { entries: null, error: err.message };
  }
}
