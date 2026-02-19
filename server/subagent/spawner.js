/**
 * Sub-agent spawner — forks worker.js as a child process to run
 * independent Claude API conversations for delegated tasks.
 *
 * Exports template CRUD (backed by SQLite agent_templates table)
 * and spawnSubAgent() which forks a worker, sends a task, and
 * returns the result.
 */

import { fork } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import db from "../db.js";
import tools from "../tools.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = join(__dirname, "worker.js");

// Default tools available to sub-agents
const DEFAULT_ALLOWED_TOOLS = [
  "shell_exec",
  "read_file",
  "write_file",
  "list_directory",
];

// ─── Template CRUD ───────────────────────────────────────────────────────────

/**
 * Create or update a sub-agent template.
 *
 * @param {Object} opts
 * @param {string} opts.name - Template name (primary key).
 * @param {string} opts.system_prompt - System prompt for the sub-agent.
 * @param {string[]} [opts.allowed_tools] - Tool names the sub-agent can use.
 * @param {number} [opts.max_turns] - Max tool-use loop iterations (default: 10).
 * @returns {{ status: string, name: string }}
 */
export function createTemplate({ name, system_prompt, allowed_tools, max_turns }) {
  db.prepare(`
    INSERT INTO agent_templates (name, system_prompt, allowed_tools, max_turns, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(name) DO UPDATE SET
      system_prompt = excluded.system_prompt,
      allowed_tools = excluded.allowed_tools,
      max_turns     = excluded.max_turns,
      updated_at    = datetime('now')
  `).run(
    name,
    system_prompt,
    JSON.stringify(allowed_tools || DEFAULT_ALLOWED_TOOLS),
    max_turns || 10
  );
  return { status: "created", name };
}

/**
 * Get a template by name.
 * @param {string} name
 * @returns {Object|null}
 */
export function getTemplate(name) {
  const row = db.prepare("SELECT * FROM agent_templates WHERE name = ?").get(name);
  if (!row) return null;
  return {
    ...row,
    allowed_tools: JSON.parse(row.allowed_tools || "[]"),
  };
}

/**
 * List all templates.
 * @returns {Object[]}
 */
export function listTemplates() {
  const rows = db.prepare("SELECT * FROM agent_templates ORDER BY name").all();
  return rows.map((row) => ({
    ...row,
    allowed_tools: JSON.parse(row.allowed_tools || "[]"),
  }));
}

/**
 * Delete a template by name.
 * @param {string} name
 * @returns {{ deleted: boolean }}
 */
export function deleteTemplate(name) {
  const result = db.prepare("DELETE FROM agent_templates WHERE name = ?").run(name);
  return { deleted: result.changes > 0 };
}

// ─── Spawn ───────────────────────────────────────────────────────────────────

/**
 * Spawn a sub-agent worker to complete a task.
 *
 * @param {Object} opts
 * @param {string} opts.task - The task description for the sub-agent.
 * @param {string} [opts.template] - Template name to load config from.
 * @param {number} [opts.timeout] - Timeout in ms (default: 300000 = 5 minutes).
 * @returns {Promise<{ result: string, error: boolean }>}
 */
export function spawnSubAgent({ task, template: templateName, timeout = 300_000 }) {
  return new Promise(async (resolve) => {
    // Load template if specified
    let systemPrompt = "You are a helpful sub-agent. Complete the task and return the result.";
    let allowedTools = DEFAULT_ALLOWED_TOOLS;
    let maxTurns = 10;
    let model = "claude-haiku-4-5-20251001";

    if (templateName) {
      const tmpl = getTemplate(templateName);
      if (tmpl) {
        systemPrompt = tmpl.system_prompt;
        allowedTools = tmpl.allowed_tools;
        maxTurns = tmpl.max_turns;
      } else {
        resolve({
          result: `Template '${templateName}' not found.`,
          error: true,
        });
        return;
      }
    }

    // Filter tool definitions to only the allowed ones
    const filteredTools = tools.filter((t) => allowedTools.includes(t.name));

    // Fork the worker
    const child = fork(WORKER_PATH, [], {
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });

    let settled = false;

    // Timeout guard
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGKILL");
        resolve({
          result: `Sub-agent timed out after ${timeout}ms.`,
          error: true,
        });
      }
    }, timeout);

    // Capture stderr for debugging
    let stderrOutput = "";
    child.stderr.on("data", (chunk) => {
      stderrOutput += chunk.toString();
    });

    // Listen for result
    child.on("message", (msg) => {
      if (settled) return;

      if (msg.type === "result") {
        settled = true;
        clearTimeout(timer);
        child.kill();
        resolve({ result: msg.result, error: false });
      } else if (msg.type === "error") {
        settled = true;
        clearTimeout(timer);
        child.kill();
        resolve({ result: msg.error, error: true });
      }
    });

    // Handle unexpected exit
    child.on("exit", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        const detail = stderrOutput
          ? `\nWorker stderr: ${stderrOutput.slice(0, 500)}`
          : "";
        resolve({
          result: `Sub-agent worker exited unexpectedly (code ${code}).${detail}`,
          error: true,
        });
      }
    });

    // Handle fork errors
    child.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({
          result: `Sub-agent fork error: ${err.message}`,
          error: true,
        });
      }
    });

    // Send the task to the worker
    child.send({
      type: "start",
      task,
      systemPrompt,
      tools: filteredTools,
      model,
      maxTurns,
    });
  });
}
