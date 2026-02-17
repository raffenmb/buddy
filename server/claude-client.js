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
import { getAgent, getMemories, setMemory, getIdentity, getUserInfo } from "./agents.js";

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

  // Append enabled custom skill prompts
  // TODO: Refactor to on-demand loading once terminal execution is built.
  // Currently injects full skill prompts (token-inefficient). Target: only inject
  // name+description metadata here, let the agent read full SKILL.md via bash tool
  // when relevant. See docs/plans/2026-02-17-custom-skills-design.md.
  const enabledTools = parseEnabledTools(agent.enabled_tools);
  if (enabledTools) {
    const installedSkills = listSkills();
    const builtInNames = tools.map((t) => t.name);

    for (const toolName of enabledTools) {
      // Skip built-in tools — they're handled via the tools array, not system prompt
      if (builtInNames.includes(toolName)) continue;

      // Check if this is an installed skill
      const skill = installedSkills.find((s) => s.folderName === toolName);
      if (!skill) continue; // stale reference, skip silently

      const prompt = getSkillPrompt(toolName);
      if (prompt) {
        basePrompt += `\n\n## Skill: ${skill.name}\n${prompt}`;
      }
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
 * @returns {Promise<{allToolCalls: Array, finalTextContent: string}>}
 */
export async function processPrompt(userText, agentId = "buddy") {
  // 1. Load agent config and memories
  const agent = getAgent(agentId);
  if (!agent) {
    throw new Error(`Agent '${agentId}' not found`);
  }

  const memories = getMemories(agentId);
  const systemPrompt = buildSystemPrompt(agent, memories);

  // 2. Filter tools based on agent's enabled_tools setting
  //    Canvas tools are always included; only non-canvas tools are toggleable.
  //    Custom skills are NOT API tools — they're injected into the system prompt.
  let agentTools = tools;
  const enabledTools = parseEnabledTools(agent.enabled_tools);
  if (enabledTools) {
    agentTools = tools.filter(
      (t) => t.name.startsWith("canvas_") || enabledTools.includes(t.name)
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
