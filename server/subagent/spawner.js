/**
 * Sub-agent spawner — uses the Claude Agent SDK to run independent
 * sub-agent conversations for delegated tasks.
 *
 * Exports template CRUD (backed by SQLite agent_templates table)
 * and spawnSubAgent() which calls the Agent SDK's query() function
 * and returns the result.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { homedir } from "os";
import db from "../db.js";

// Default tools available to sub-agents (Agent SDK tool names)
const DEFAULT_ALLOWED_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "Bash",
  "Glob",
  "Grep",
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
 * Spawn a sub-agent to complete a task using the Claude Agent SDK.
 *
 * @param {Object} opts
 * @param {string} opts.task - The task description for the sub-agent.
 * @param {string} [opts.template] - Template name to load config from.
 * @param {number} [opts.timeout] - Timeout in ms (default: 300000 = 5 minutes).
 * @returns {Promise<{ result: string, error: boolean }>}
 */
export async function spawnSubAgent({ task, template: templateName, timeout = 300_000 }) {
  let systemPrompt = "You are a helpful sub-agent. Complete the task and return the result.";
  let allowedTools = [...DEFAULT_ALLOWED_TOOLS];
  let maxTurns = 10;

  if (templateName) {
    const tmpl = getTemplate(templateName);
    if (tmpl) {
      systemPrompt = tmpl.system_prompt || systemPrompt;
      allowedTools = tmpl.allowed_tools || allowedTools;
      if (tmpl.max_turns) maxTurns = tmpl.max_turns;
    } else {
      return { result: `Template '${templateName}' not found.`, error: true };
    }
  }

  const runAgent = async () => {
    let resultText = "";
    for await (const message of query({
      prompt: task,
      options: {
        model: "haiku",
        systemPrompt,
        tools: allowedTools,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        maxTurns,
        cwd: homedir(),
        persistSession: false,
      },
    })) {
      if (message.type === "result") {
        resultText = message.result || "";
      }
    }
    return resultText;
  };

  try {
    const result = await Promise.race([
      runAgent(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Sub-agent timed out after ${timeout}ms`)), timeout)
      ),
    ]);
    return { result, error: false };
  } catch (err) {
    return { result: err.message || String(err), error: true };
  }
}
