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
 * user info, and memories.
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

  return systemPromptTemplate
    .replace("{{name}}", agent.name)
    .replace("{{personality}}", personality)
    .replace("{{user_info}}", userInfoSection)
    .replace("{{memories}}", memoriesSection)
    .trim();
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
  let agentTools = tools;
  if (agent.enabled_tools) {
    try {
      const enabledTools = typeof agent.enabled_tools === "string"
        ? JSON.parse(agent.enabled_tools)
        : agent.enabled_tools;
      if (Array.isArray(enabledTools)) {
        agentTools = tools.filter((t) => enabledTools.includes(t.name));
      }
    } catch {
      // If parsing fails, use all tools
    }
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
