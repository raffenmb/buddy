/**
 * Session management — maintains in-memory conversation history
 * for the current Buddy session. Resets on server restart.
 */

class Session {
  constructor() {
    this.messages = [];
  }

  /**
   * Append a user message to the conversation history.
   * @param {string} text - The user's input text.
   */
  addUserMessage(text) {
    this.messages.push({
      role: "user",
      content: text,
    });
  }

  /**
   * Append an assistant response to the conversation history.
   * Stores the full content array (text blocks + tool_use blocks).
   * @param {object} response - The Claude API response object.
   */
  addAssistantResponse(response) {
    this.messages.push({
      role: "assistant",
      content: response.content,
    });
  }

  /**
   * Append tool results back into the conversation as a user message.
   * The Claude API expects tool_result blocks wrapped in a user role message.
   * @param {Array} results - Array of tool_result content blocks.
   */
  addToolResults(results) {
    this.messages.push({
      role: "user",
      content: results,
    });
  }

  /**
   * Return the full message history for the Claude API call.
   * @returns {Array} Array of message objects.
   */
  getMessages() {
    return this.messages;
  }
}

export default new Session();
