/**
 * Claude API client — sends user prompts through the Claude messages API,
 * handles the tool-use loop, and returns collected tool calls + final text.
 */

import Anthropic from "@anthropic-ai/sdk";
import yts from "yt-search";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import tools from "./tools.js";
import { listSkills, getSkillPrompt } from "./skills.js";
import { addUserMessage, addAssistantResponse, addToolResults, getMessages } from "./session.js";
import { getAgent, getMemories, setMemory, getIdentity, getUserInfo, updateAgent } from "./agents.js";
import { handleSandboxTool, SANDBOX_TOOL_NAMES } from "./sandbox/toolHandler.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const anthropic = new Anthropic();

// Cache the base template — read once on startup
const systemPromptTemplate = readFileSync(
  join(__dirname, "system-prompt.md"),
  "utf-8"
);

async function executeYouTubeSearch(input) {
  try {
    const maxResults = Math.min(input.max_results || 3, 5);
    const result = await yts(input.query);
    const videos = result.videos.slice(0, maxResults).map((v) => ({
      title: v.title,
      url: v.url,
      duration: v.timestamp,
      views: v.views,
      author: v.author.name,
    }));
    return { videos };
  } catch (err) {
    console.error("YouTube search error:", err);
    return { error: "YouTube search failed", videos: [] };
  }
}

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

  // Inject metadata-only skill listing — full prompts loaded on-demand via read_skill tool
  const enabledTools = parseEnabledTools(agent.enabled_tools);
  if (enabledTools) {
    const installedSkills = listSkills();
    const builtInNames = tools.map((t) => t.name);
    const staleRefs = [];
    const enabledSkills = [];

    for (const toolName of enabledTools) {
      // Skip built-in tools — they're handled via the tools array, not system prompt
      if (builtInNames.includes(toolName)) continue;
      if (SANDBOX_TOOL_NAMES.includes(toolName)) continue;

      // Check if this is an installed skill
      const skill = installedSkills.find((s) => s.folderName === toolName);
      if (!skill) {
        staleRefs.push(toolName);
        continue;
      }

      enabledSkills.push(skill);
    }

    if (enabledSkills.length > 0) {
      basePrompt += "\n\n## Custom Skills\nYou have custom skills available. When a user's request matches a skill's description, call the `read_skill` tool with the skill's folder name to load its full instructions before responding.\n\nAvailable skills:";
      for (const skill of enabledSkills) {
        basePrompt += `\n- **${skill.name}** (folder: \`${skill.folderName}\`): ${skill.description}`;
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
 * Check whether an agent has any custom skills enabled.
 */
function agentHasCustomSkills(agent) {
  const enabledTools = parseEnabledTools(agent.enabled_tools);
  if (!enabledTools) return false;

  const installedSkills = listSkills();
  const builtInNames = tools.map((t) => t.name);
  return enabledTools.some(
    (name) =>
      !builtInNames.includes(name) &&
      !SANDBOX_TOOL_NAMES.includes(name) &&
      installedSkills.some((s) => s.folderName === name)
  );
}

/**
 * Process a user prompt through the Claude API with tool-use loop.
 *
 * @param {string} userText - The user's input text.
 * @param {string} agentId - The agent to use for this prompt.
 * @param {Object} [callbacks] - Optional callbacks.
 * @param {Function} [callbacks.sendFile] - Callback to deliver a file to the user.
 * @param {boolean} [callbacks.sandboxAvailable] - Whether the Docker sandbox is running.
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

  // 2. Filter tools based on agent's enabled_tools setting
  //    - Canvas tools: always included
  //    - Standard non-canvas tools (search_youtube, remember_fact): included when enabled_tools is null
  //    - Sandbox tools (shell_exec, etc.): opt-in only — require explicit listing in enabled_tools
  //    - read_skill: included only when agent has custom skills enabled
  const hasSkills = agentHasCustomSkills(agent);
  let agentTools = tools;
  const enabledTools = parseEnabledTools(agent.enabled_tools);
  if (enabledTools) {
    agentTools = tools.filter(
      (t) => t.name.startsWith("canvas_") || enabledTools.includes(t.name) || (t.name === "read_skill" && hasSkills)
    );
  } else {
    // null = all standard tools ON, sandbox tools OFF, read_skill OFF (no skills when null)
    agentTools = tools.filter(
      (t) => !SANDBOX_TOOL_NAMES.includes(t.name) && t.name !== "read_skill"
    );
  }

  // Strip sandbox tools if Docker isn't available
  if (!callbacks.sandboxAvailable) {
    agentTools = agentTools.filter(
      (t) => !SANDBOX_TOOL_NAMES.includes(t.name)
    );
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
        if (toolUse.name === "search_youtube") {
          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(await executeYouTubeSearch(toolUse.input)),
          };
        }
        if (toolUse.name === "remember_fact") {
          setMemory(agentId, toolUse.input.key, toolUse.input.value);
          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify({ status: "remembered" }),
          };
        }
        if (toolUse.name === "read_skill") {
          const prompt = getSkillPrompt(toolUse.input.skill_name);
          if (prompt) {
            return {
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: prompt,
            };
          }
          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify({ error: `Skill '${toolUse.input.skill_name}' not found.` }),
            is_error: true,
          };
        }
        if (SANDBOX_TOOL_NAMES.includes(toolUse.name)) {
          const result = await handleSandboxTool(
            toolUse.name,
            toolUse.input,
            callbacks.sendFile
          );
          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: result.content,
            ...(result.isError && { is_error: true }),
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
