/**
 * Sandbox tool handler — routes tool calls from the LLM to the sandbox executor.
 * Handles: shell_exec, read_file, write_file, list_directory, send_file.
 *
 * Returns { content, isError } so the caller can set is_error on the
 * tool_result block — Claude treats error results differently and is more
 * likely to acknowledge and handle failures.
 */

import { posix } from "path";
import { readFileSync, unlinkSync } from "fs";
import { executeInSandbox } from "./executor.js";
import { copyFileFromSandbox } from "./fileTransfer.js";

/**
 * Validate that a path resolves within /agent/ after normalization.
 * Prevents ../../ traversal attacks.
 */
function isPathSafe(filePath) {
  const resolved = posix.resolve("/", filePath);
  return resolved.startsWith("/agent/");
}

/**
 * Reject paths containing shell metacharacters to prevent injection
 * when paths are interpolated into shell commands.
 */
function hasShellMetachars(str) {
  return /[;"'`$\\|&<>(){}!\n\r]/.test(str);
}

function error(message) {
  return { content: message, isError: true };
}

function success(message) {
  return { content: message, isError: false };
}

/**
 * Handle a sandbox tool call.
 *
 * @param {string} toolName - The tool name.
 * @param {Record<string, any>} params - Tool parameters from the LLM.
 * @param {Function} [sendFile] - Callback to send a file to the user (for send_file tool).
 * @returns {Promise<{content: string, isError: boolean}>}
 */
export async function handleSandboxTool(toolName, params, sendFile) {
  switch (toolName) {
    case "shell_exec": {
      if (params.cwd && !isPathSafe(params.cwd)) {
        return error("Error: Working directory must be within /agent/");
      }
      const result = await executeInSandbox(params.command, {
        cwd: params.cwd,
        timeout: params.timeout,
      });
      let output = "";
      if (result.stdout) output += result.stdout;
      if (result.stderr) output += `\nSTDERR: ${result.stderr}`;
      if (result.timedOut) output += "\n[Command timed out]";
      output += `\n[exit code: ${result.exitCode}]`;
      return {
        content: output.trim(),
        isError: result.exitCode !== 0,
      };
    }

    case "read_file": {
      if (!isPathSafe(params.path)) {
        return error("Error: Can only read files within /agent/");
      }
      if (hasShellMetachars(params.path)) {
        return error("Error: Path contains invalid characters");
      }
      const result = await executeInSandbox(`cat "${params.path}"`);
      if (result.exitCode !== 0) {
        return error(`Error reading file: ${result.stderr}`);
      }
      return success(result.stdout);
    }

    case "write_file": {
      if (!isPathSafe(params.path)) {
        return error("Error: Can only write files within /agent/");
      }
      if (hasShellMetachars(params.path)) {
        return error("Error: Path contains invalid characters");
      }
      // Use base64 encoding to safely transfer arbitrary content
      const encoded = Buffer.from(params.content, "utf-8").toString("base64");
      const result = await executeInSandbox(
        `mkdir -p "$(dirname "${params.path}")" && echo "${encoded}" | base64 -d > "${params.path}"`
      );
      if (result.exitCode !== 0) {
        return error(`Error writing file: ${result.stderr}`);
      }
      return success(`File written: ${params.path}`);
    }

    case "list_directory": {
      const dirPath = params.path || "/agent/data";
      if (!isPathSafe(dirPath)) {
        return error("Error: Can only list directories within /agent/");
      }
      if (hasShellMetachars(dirPath)) {
        return error("Error: Path contains invalid characters");
      }
      const result = await executeInSandbox(`ls -la "${dirPath}"`);
      if (result.exitCode !== 0) {
        return error(`Error listing directory: ${result.stderr}`);
      }
      return success(result.stdout);
    }

    case "send_file": {
      if (!isPathSafe(params.path)) {
        return error("Error: Can only send files from within /agent/");
      }
      if (hasShellMetachars(params.path)) {
        return error("Error: Path contains invalid characters");
      }
      if (!sendFile) {
        return error("Error: File delivery not available");
      }

      try {
        const hostPath = copyFileFromSandbox(params.path);
        const fileBuffer = readFileSync(hostPath);

        sendFile({
          filename: posix.basename(params.path),
          data: fileBuffer.toString("base64"),
          message: params.message || null,
        });

        unlinkSync(hostPath); // clean up host temp
        return success(`File sent to user: ${posix.basename(params.path)}`);
      } catch (err) {
        return error(`Error sending file: ${err.message}`);
      }
    }

    default:
      return error(`Unknown sandbox tool: ${toolName}`);
  }
}

/** Names of all sandbox tools for quick lookup */
export const SANDBOX_TOOL_NAMES = [
  "shell_exec",
  "read_file",
  "write_file",
  "list_directory",
  "send_file",
];
