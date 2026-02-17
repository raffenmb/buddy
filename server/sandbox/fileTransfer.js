/**
 * File transfer — copies files between the host and the sandbox container.
 * Uses os.tmpdir() for cross-platform temp paths (Linux/macOS/Windows).
 * Uses execFileSync to bypass the host shell (avoids Windows cmd.exe quoting issues).
 */

import { execFileSync } from "child_process";
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from "fs";
import { basename, join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

const CONTAINER_NAME = "buddy-sandbox";

/**
 * Sanitize a filename to prevent injection — keep only safe chars.
 */
function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * Copy a file from the host into the sandbox container.
 * @param {string} hostPath - Absolute path on the host.
 * @param {string} [sandboxDir] - Target directory inside container.
 * @returns {string} Path inside the container.
 */
export function copyFileToSandbox(hostPath, sandboxDir = "/agent/uploads") {
  const safeOriginal = sanitizeFilename(basename(hostPath));
  const filename = `${randomUUID()}_${safeOriginal}`;
  const containerPath = `${sandboxDir}/${filename}`;

  execFileSync("docker", ["exec", CONTAINER_NAME, "mkdir", "-p", sandboxDir]);
  execFileSync("docker", ["cp", hostPath, `${CONTAINER_NAME}:${containerPath}`]);

  return containerPath;
}

/**
 * Copy a file from the sandbox container to the host.
 * @param {string} containerPath - Path inside the container.
 * @param {string} [hostDir] - Target directory on the host.
 * @returns {string} Path on the host.
 */
export function copyFileFromSandbox(containerPath, hostDir) {
  const dir = hostDir || join(tmpdir(), "buddy_outbox");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const filename = basename(containerPath);
  const hostPath = join(dir, filename);

  execFileSync("docker", ["cp", `${CONTAINER_NAME}:${containerPath}`, hostPath]);

  return hostPath;
}

/**
 * Save a Buffer (e.g. from a WebSocket upload) into the sandbox.
 * Writes to a temp file on the host, copies into container, cleans up.
 *
 * @param {Buffer} buffer - File data.
 * @param {string} originalFilename - Original filename.
 * @param {string} [sandboxDir] - Target directory inside container.
 * @returns {string} Path inside the container.
 */
export function saveBufferToSandbox(
  buffer,
  originalFilename,
  sandboxDir = "/agent/uploads"
) {
  const tempPath = join(
    tmpdir(),
    `buddy_upload_${randomUUID()}_${sanitizeFilename(originalFilename)}`
  );
  writeFileSync(tempPath, buffer);

  const containerPath = copyFileToSandbox(tempPath, sandboxDir);

  // Clean up host temp file
  unlinkSync(tempPath);

  return containerPath;
}
