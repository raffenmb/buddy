/**
 * Sandbox healthcheck — verifies the Docker container is running
 * and starts it if needed.
 *
 * Uses execFile to bypass the host shell (avoids Windows cmd.exe quoting issues).
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const COMPOSE_FILE = join(__dirname, "..", "..", "docker-compose.yml");

const CONTAINER_NAME = "buddy-sandbox";

/**
 * Check if the sandbox container is currently running.
 * @returns {Promise<boolean>}
 */
export async function isSandboxRunning() {
  try {
    const { stdout } = await execFileAsync("docker", [
      "inspect", "-f", "{{.State.Running}}", CONTAINER_NAME,
    ]);
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

/**
 * Check if Docker is available on this machine.
 * @returns {Promise<boolean>}
 */
export async function isDockerAvailable() {
  try {
    await execFileAsync("docker", ["info"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure the sandbox container is running. Starts it via docker compose if not.
 * Returns true if sandbox is available, false if Docker isn't installed.
 * @returns {Promise<boolean>}
 */
export async function ensureSandboxRunning() {
  if (!(await isDockerAvailable())) {
    console.log(
      "Docker not available — sandbox features disabled. Install Docker to enable."
    );
    return false;
  }

  if (await isSandboxRunning()) {
    return true;
  }

  console.log("Sandbox container not running, starting...");
  try {
    await execFileAsync("docker", ["compose", "-f", COMPOSE_FILE, "up", "-d"]);
    console.log("Sandbox container started.");
    return true;
  } catch (err) {
    console.error("Failed to start sandbox container:", err.message);
    return false;
  }
}
