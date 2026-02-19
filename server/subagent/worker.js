/**
 * Sub-agent worker — runs as a forked child process.
 *
 * Receives a task via IPC message, runs its own Claude API conversation
 * with a tool-use loop, and sends the result back to the parent process.
 *
 * Because this is a separate process, it needs its own dotenv import
 * to load the ANTHROPIC_API_KEY.
 */

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { executeShell } from "../shell/executor.js";
import { readFile, writeFile, listDirectory } from "../shell/filesystem.js";

const anthropic = new Anthropic();

// ─── Tool handlers ───────────────────────────────────────────────────────────
// Sub-agents execute tools directly. shell_exec runs WITHOUT requestConfirmation
// because sub-agents are invisible workers that don't interact with the user.

const toolHandlers = {
  async shell_exec(input) {
    const result = await executeShell(input.command, {
      cwd: input.cwd,
      timeout: Math.min(input.timeout || 30000, 600000),
      // No requestConfirmation — sub-agents don't ask the user.
      // Commands requiring confirmation will be denied by the executor.
    });
    const combined = [result.stdout, result.stderr].filter(Boolean).join("\n");
    return {
      content: JSON.stringify({
        output: combined,
        exitCode: result.exitCode,
      }),
      is_error: result.denied,
    };
  },

  async read_file(input) {
    const result = readFile(input.path);
    return {
      content: result.error
        ? JSON.stringify({ error: result.error })
        : result.content,
      is_error: !!result.error,
    };
  },

  async write_file(input) {
    const result = writeFile(input.path, input.content);
    return {
      content: result.error
        ? JSON.stringify({ error: result.error })
        : JSON.stringify({ status: "written", path: input.path }),
      is_error: !!result.error,
    };
  },

  async list_directory(input) {
    const result = listDirectory(input.path);
    return {
      content: result.error
        ? JSON.stringify({ error: result.error })
        : JSON.stringify(result.entries),
      is_error: !!result.error,
    };
  },
};

// ─── Main loop ───────────────────────────────────────────────────────────────

async function runTask({ task, systemPrompt, tools, model, maxTurns }) {
  const messages = [{ role: "user", content: task }];
  let turns = 0;

  // Enable prompt caching — tools and system prompt are reused across loop iterations
  const rawTools = tools || [];
  const cachedTools = rawTools.length > 0
    ? rawTools.map((t, i) =>
        i === rawTools.length - 1
          ? { ...t, cache_control: { type: "ephemeral" } }
          : t
      )
    : rawTools;
  const cachedSystem = [
    {
      type: "text",
      text: systemPrompt || "You are a helpful sub-agent. Complete the task and return the result.",
      cache_control: { type: "ephemeral" },
    },
  ];

  // Initial Claude API call
  let response = await anthropic.messages.create({
    model: model || "claude-haiku-4-5-20251001",
    system: cachedSystem,
    messages,
    tools: cachedTools,
    max_tokens: 4096,
  });

  // Tool-use loop
  while (response.stop_reason === "tool_use" && turns < (maxTurns || 10)) {
    turns++;

    const toolUseBlocks = response.content.filter(
      (block) => block.type === "tool_use"
    );

    // Build tool_result blocks
    const toolResults = await Promise.all(
      toolUseBlocks.map(async (toolUse) => {
        const handler = toolHandlers[toolUse.name];
        if (!handler) {
          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify({
              error: `Unknown tool: ${toolUse.name}`,
            }),
            is_error: true,
          };
        }

        const result = await handler(toolUse.input);
        return {
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result.content,
          ...(result.is_error && { is_error: true }),
        };
      })
    );

    // Append assistant response and tool results to messages
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });

    // Call Claude again (tools + system cached from first call)
    response = await anthropic.messages.create({
      model: model || "claude-haiku-4-5-20251001",
      system: cachedSystem,
      messages,
      tools: cachedTools,
      max_tokens: 4096,
    });
  }

  // Extract final text content
  const textContent = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  return textContent;
}

// ─── IPC message handler ─────────────────────────────────────────────────────

process.on("message", async (msg) => {
  if (msg.type !== "start") return;

  try {
    const result = await runTask(msg);
    process.send({ type: "result", result });
  } catch (err) {
    process.send({ type: "error", error: err.message || String(err) });
  }
});
