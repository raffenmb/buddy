/**
 * Claude API client — sends user prompts through the Claude messages API,
 * handles the tool-use loop, and returns collected tool calls + final text.
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import tools, { PLATFORM_TOOL_NAMES } from "./tools.js";
import { listSkills } from "./skills.js";
import { addUserMessage, addAssistantResponse, addToolResults, getMessages } from "./session.js";
import { getAgent, getMemories, getIdentity, getUserInfo, updateAgent } from "./agents.js";
import { executeShell } from "./shell/executor.js";
import { readFile, writeFile, listDirectory } from "./shell/filesystem.js";
import { startProcess, stopProcess, getProcessStatus, getProcessLogs } from "./shell/processManager.js";
import { maybeSummarize } from "./shell/summarizer.js";
import { spawnSubAgent, createTemplate } from "./subagent/spawner.js";
import { DIRS } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const anthropic = new Anthropic();

// Cache the base template — read once on startup
const systemPromptTemplate = readFileSync(
  join(__dirname, "system-prompt.md"),
  "utf-8"
);

/**
 * Build the full system prompt from base template + per-agent personality,
 * user info, memories, and enabled custom skills.
 */
function buildSystemPrompt(agent, memories) {
  const personality = getIdentity(agent.id) || "Be helpful and friendly.";

  const userInfo = getUserInfo(agent.id);
  const userInfoSection = userInfo && userInfo.trim()
    ? "## About the user\n" + userInfo
    : "";

  let memoriesSection = "";
  if (memories.length > 0) {
    memoriesSection = "## What you remember about the user\n";
    for (const mem of memories) {
      memoriesSection += `- ${mem.key}: ${mem.value}\n`;
    }
  }

  let basePrompt = systemPromptTemplate
    .replace("{{name}}", agent.name)
    .replace("{{personality}}", personality)
    .replace("{{user_info}}", userInfoSection)
    .replace("{{memories}}", memoriesSection)
    .trim();

  basePrompt += `\n\nYour agent ID is: ${agent.id}`;

  // Inject metadata-only skill listing — full prompts loaded on-demand via read_file tool
  const enabledTools = parseEnabledTools(agent.enabled_tools);
  if (enabledTools) {
    const installedSkills = listSkills();
    const builtInNames = tools.map((t) => t.name);
    const staleRefs = [];
    const enabledSkills = [];

    for (const toolName of enabledTools) {
      // Skip built-in tools — they're handled via the tools array, not system prompt
      if (builtInNames.includes(toolName)) continue;

      // Check if this is an installed skill
      const skill = installedSkills.find((s) => s.folderName === toolName);
      if (!skill) {
        staleRefs.push(toolName);
        continue;
      }

      enabledSkills.push(skill);
    }

    if (enabledSkills.length > 0) {
      basePrompt += `\n\n## Custom Skills\nYou have custom skills available at ${DIRS.skills}. When a user's request matches a skill's description, use the read_file tool to read the skill's SKILL.md for full instructions before responding.\n\nAvailable skills:`;
      for (const skill of enabledSkills) {
        basePrompt += `\n- **${skill.name}** (path: \`${join(DIRS.skills, skill.folderName, "SKILL.md")}\`): ${skill.description}`;
      }
    }

    // Clean up stale skill references from agent's enabled_tools
    if (staleRefs.length > 0) {
      console.warn(`Agent '${agent.id}': removing stale skill references: ${staleRefs.join(", ")}`);
      const cleaned = enabledTools.filter((n) => !staleRefs.includes(n));
      updateAgent(agent.id, { enabled_tools: cleaned.length > 0 ? cleaned : null });
    }
  }

  return basePrompt;
}

/**
 * Parse the enabled_tools field from an agent record.
 * Returns an array of tool/skill names, or null if all built-in tools enabled.
 */
function parseEnabledTools(enabledToolsRaw) {
  if (!enabledToolsRaw) return null;
  try {
    const parsed = typeof enabledToolsRaw === "string"
      ? JSON.parse(enabledToolsRaw)
      : enabledToolsRaw;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Process a user prompt through the Claude API with tool-use loop.
 *
 * @param {string} userText - The user's input text.
 * @param {string} agentId - The agent to use for this prompt.
 * @param {Object} [callbacks] - Optional callbacks.
 * @param {Function} [callbacks.requestConfirmation] - Async callback for destructive command approval.
 * @returns {Promise<{allToolCalls: Array, finalTextContent: string}>}
 */
export async function processPrompt(userText, agentId = "buddy", callbacks = {}) {
  // 1. Load agent config and memories
  const agent = getAgent(agentId);
  if (!agent) {
    throw new Error(`Agent '${agentId}' not found`);
  }

  const memories = getMemories(agentId);
  const systemPrompt = buildSystemPrompt(agent, memories);

  // 2. Filter tools: canvas always included, platform tools always included, others per enabled_tools
  const enabledTools = parseEnabledTools(agent.enabled_tools);
  let agentTools;
  if (enabledTools) {
    agentTools = tools.filter(
      (t) => t.name.startsWith("canvas_") || PLATFORM_TOOL_NAMES.includes(t.name) || enabledTools.includes(t.name)
    );
  } else {
    // null = all tools ON
    agentTools = tools;
  }

  // 3. Add user message to session history
  addUserMessage(userText, agentId);

  // 4. Initial Claude API call
  let response = await anthropic.messages.create({
    model: agent.model,
    system: systemPrompt,
    messages: getMessages(agentId),
    tools: agentTools,
    max_tokens: 4096,
  });

  // Accumulate all tool calls across loop iterations
  const allToolCalls = [];

  // 5. Tool-use loop: keep going while Claude wants to call tools
  while (response.stop_reason === "tool_use") {
    // Extract tool_use blocks from the response
    const toolUseBlocks = response.content.filter(
      (block) => block.type === "tool_use"
    );

    // Collect them
    for (const toolUse of toolUseBlocks) {
      allToolCalls.push({
        name: toolUse.name,
        input: toolUse.input,
      });
    }

    // Build tool_result blocks
    const toolResults = await Promise.all(
      toolUseBlocks.map(async (toolUse) => {
        if (toolUse.name === "shell_exec") {
          const result = await executeShell(toolUse.input.command, {
            cwd: toolUse.input.cwd,
            timeout: Math.min(toolUse.input.timeout || 30000, 600000),
            requestConfirmation: callbacks.requestConfirmation,
          });
          const combined = [result.stdout, result.stderr].filter(Boolean).join("\n");
          const { content: summarized, logPath } = await maybeSummarize(combined, "shell output");
          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify({ output: summarized, exitCode: result.exitCode, ...(logPath && { fullOutputPath: logPath }) }),
            ...(result.denied && { is_error: true }),
          };
        }
        if (toolUse.name === "read_file") {
          const result = readFile(toolUse.input.path);
          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: result.error ? JSON.stringify({ error: result.error }) : result.content,
            ...(result.error && { is_error: true }),
          };
        }
        if (toolUse.name === "write_file") {
          const result = writeFile(toolUse.input.path, toolUse.input.content);
          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: result.error ? JSON.stringify({ error: result.error }) : JSON.stringify({ status: "written", path: toolUse.input.path }),
            ...(result.error && { is_error: true }),
          };
        }
        if (toolUse.name === "list_directory") {
          const result = listDirectory(toolUse.input.path);
          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: result.error ? JSON.stringify({ error: result.error }) : JSON.stringify(result.entries),
            ...(result.error && { is_error: true }),
          };
        }
        if (toolUse.name === "process_start") {
          const result = startProcess(toolUse.input.command, {
            cwd: toolUse.input.cwd,
            name: toolUse.input.name,
          });
          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
            ...(result.error && { is_error: true }),
          };
        }
        if (toolUse.name === "process_stop") {
          const result = stopProcess(toolUse.input.id);
          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
            ...(result.error && { is_error: true }),
          };
        }
        if (toolUse.name === "process_status") {
          const result = getProcessStatus(toolUse.input.id);
          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
            ...(result.error && { is_error: true }),
          };
        }
        if (toolUse.name === "process_logs") {
          const result = getProcessLogs(toolUse.input.id, {
            lines: toolUse.input.lines,
            stream: toolUse.input.stream,
          });
          const logContent = result.error ? JSON.stringify(result) : result.log;
          const { content: summarized } = await maybeSummarize(logContent, "process logs");
          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: result.error ? JSON.stringify(result) : JSON.stringify({ log: summarized, totalLines: result.totalLines }),
            ...(result.error && { is_error: true }),
          };
        }
        if (toolUse.name === "spawn_agent") {
          const result = await spawnSubAgent({
            task: toolUse.input.task,
            template: toolUse.input.template,
            timeout: toolUse.input.timeout,
          });
          const { content: summarized } = await maybeSummarize(result.result, "sub-agent result");
          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: summarized,
            ...(result.error && { is_error: true }),
          };
        }
        if (toolUse.name === "create_agent_template") {
          const result = createTemplate(toolUse.input);
          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          };
        }
        return {
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify({ status: "rendered" }),
        };
      })
    );

    // Add assistant response and tool results to session
    addAssistantResponse(response, agentId);
    addToolResults(toolResults, agentId);

    // Call Claude again with the updated conversation
    response = await anthropic.messages.create({
      model: agent.model,
      system: systemPrompt,
      messages: getMessages(agentId),
      tools: agentTools,
      max_tokens: 4096,
    });
  }

  // 6. stop_reason === "end_turn" — add the final response to session
  addAssistantResponse(response, agentId);

  // 7. Extract text content from the final response
  const finalTextContent = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  return { allToolCalls, finalTextContent };
}
