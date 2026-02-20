/**
 * Response splitter — takes the accumulated tool calls and final text
 * from a Claude response and broadcasts them to all connected WebSocket
 * clients in the correct order: canvas commands first, then subtitle.
 */

/**
 * Broadcast canvas commands and subtitle text to all connected clients.
 * Canvas commands are sent first so visuals appear before Buddy "speaks".
 *
 * @param {Array} allToolCalls - Array of { name, input } from the tool-use loop.
 * @param {string} finalTextContent - Concatenated text blocks from the final response.
 * @param {Function} broadcast - Function that sends a JSON message to all WS clients.
 * @param {object} [options={}] - Optional callbacks.
 * @param {Function} [options.onSubtitle] - Async callback invoked with the subtitle text
 *   after the subtitle message is broadcast. Called fire-and-forget (errors are logged
 *   but do not block the main flow). Useful for triggering TTS streaming.
 */
export function splitAndBroadcast(allToolCalls, finalTextContent, broadcast, options = {}) {
  console.log(`[splitter] ${allToolCalls.length} tool calls:`, allToolCalls.map(t => t.name));

  // 1. Send canvas commands first (visuals before speech)
  // Skip canvas_show_form — it's already sent by the blocking form handler
  for (const toolCall of allToolCalls) {
    if (toolCall.name.startsWith("canvas_") && toolCall.name !== "canvas_show_form") {
      broadcast({
        type: "canvas_command",
        command: toolCall.name,
        params: toolCall.input,
      });
    }
  }

  // 2. Send subtitle text (Buddy "speaks")
  if (finalTextContent && finalTextContent.trim().length > 0) {
    broadcast({
      type: "subtitle",
      text: finalTextContent,
    });

    // 3. Trigger TTS if callback provided
    if (options.onSubtitle) {
      options.onSubtitle(finalTextContent).catch((err) => {
        console.error("[splitter] TTS callback error:", err);
      });
    }
  }

  // 4. Signal that processing is complete
  broadcast({
    type: "processing",
    status: false,
  });
}
