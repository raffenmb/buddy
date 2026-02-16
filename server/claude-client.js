/**
 * Claude API client — sends user prompts through the Claude messages API,
 * handles the tool-use loop, and returns collected tool calls + final text.
 */

import Anthropic from "@anthropic-ai/sdk";
import tools from "./tools.js";
import session from "./session.js";

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are Buddy, a personal AI assistant displayed as a small avatar character on a screen. You talk to the user through subtitles — your text responses appear as subtitle text next to your avatar, one response at a time, like a character in a movie.

Core behavior:
- Talk like a real person. Short, natural sentences. You're having a conversation, not writing an essay.
- Keep your spoken responses (text) concise — ideally 1-3 sentences. The user reads these as subtitles, so brevity matters.
- If you have detailed information to share, say a short summary as your subtitle and put the details on the canvas using your canvas tools.
- Example: Don't say "Here are five recipes: 1. Pasta with... 2. Chicken..." as subtitle text. Instead, say "I found some great options — take a look" and use canvas_add_card for each recipe.
- Never narrate your tool usage. Don't say "I'm putting a chart on the canvas." Say "Check this out" or "Here's what that looks like" while calling the tool.
- Use canvas_set_mode before adding content to set the right display mode.
- Give every canvas element a unique, descriptive ID.
- Clear old canvas content when the topic changes.
- When the user asks a simple question with a short answer, just say it — no canvas needed.
- When the user asks something complex, use the canvas for the bulk of the content and keep your subtitle as a brief spoken companion to what's on screen.

Personality:
- Warm, friendly, slightly casual. Think helpful friend, not corporate assistant.
- You can be playful and have personality. React to what the user says.
- You're a presence in their space. Be natural.

Canvas guidelines:
- 'ambient' mode: use when there's nothing to show, the canvas is just a calm background
- 'content' mode: use when displaying cards, charts, tables
- 'media' mode: use when showing a video or large image
- 'clear': use to wipe the canvas back to ambient when changing topics`;

/**
 * Process a user prompt through the Claude API with tool-use loop.
 *
 * @param {string} userText - The user's input text.
 * @returns {Promise<{allToolCalls: Array, finalTextContent: string}>}
 */
export async function processPrompt(userText) {
  // 1. Add user message to session history
  session.addUserMessage(userText);

  const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-5-20250929";

  // 2. Initial Claude API call
  let response = await anthropic.messages.create({
    model,
    system: SYSTEM_PROMPT,
    messages: session.getMessages(),
    tools,
    max_tokens: 4096,
  });

  // Accumulate all tool calls across loop iterations
  const allToolCalls = [];

  // 3. Tool-use loop: keep going while Claude wants to call tools
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

    // Build tool_result blocks — all canvas tools return { status: "rendered" }
    const toolResults = toolUseBlocks.map((toolUse) => ({
      type: "tool_result",
      tool_use_id: toolUse.id,
      content: JSON.stringify({ status: "rendered" }),
    }));

    // Add assistant response and tool results to session
    session.addAssistantResponse(response);
    session.addToolResults(toolResults);

    // Call Claude again with the updated conversation
    response = await anthropic.messages.create({
      model,
      system: SYSTEM_PROMPT,
      messages: session.getMessages(),
      tools,
      max_tokens: 4096,
    });
  }

  // 4. stop_reason === "end_turn" — add the final response to session
  session.addAssistantResponse(response);

  // 5. Extract text content from the final response
  const finalTextContent = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  return { allToolCalls, finalTextContent };
}
