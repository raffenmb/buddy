# Sliding Memory Window + Canvas State Persistence

## Problem

Conversation history grows unbounded. Every message ever exchanged is loaded from SQLite and sent to Claude on every API call. This will eventually exceed the context window, costs grow linearly, and there's no mechanism to handle it. Additionally, canvas state lives only in React client state — if the conversation that created canvas elements slides out of memory, Claude loses awareness of what the user is looking at.

## Solution

Two changes:

1. **Sliding message window** — `getMessages()` loads only the most recent messages that fit within a token budget, queried efficiently from the DB tail. Old messages stay archived in SQLite but aren't sent to Claude.

2. **Server-side canvas state** — the server tracks current canvas elements in the DB. On each prompt, a compact canvas snapshot is injected into the system prompt so Claude always knows what's on screen, even if the tool calls that created those elements have slid out of the message window.

## Design

### Sliding Window (`session.js`)

- `getMessages()` queries `ORDER BY id DESC LIMIT 200`, then reverses the result.
- Walks from newest to oldest, estimating tokens per message using character count / 4 (no tokenizer dependency).
- Accumulates messages until hitting the token budget (~80K tokens, leaving headroom for system prompt + tools + canvas state).
- Never splits a user/assistant pair — if a user message fits but its preceding assistant response doesn't, both are dropped.
- Old messages remain in the `messages` table permanently, just not sent to Claude.
- The `LIMIT 200` query is O(1) against the index regardless of total table size.

**Token budget constant:** Defined in `session.js`, easy to tune. Default ~80,000 tokens.

### Server-Side Canvas State

**Schema change:** Add `canvas_state` TEXT column to `sessions` table (JSON, defaults to `'{"elements":[]}'`).

**Canvas state tracking (`claude-client.js`):**
- When processing canvas tool call results in the tool-use loop, update the session's `canvas_state` in the DB.
- Mirror the frontend reducer logic: add element on `canvas_add_card`/`canvas_show_text`/etc., remove on `canvas_remove_element`, clear elements on `canvas_set_mode` with mode `clear`, update on `canvas_update_card`.
- New helper: `getCanvasState(userId, agentId)` returns the parsed canvas elements array.
- New helper: `updateCanvasState(userId, agentId, elements)` writes the JSON back.

**Canvas injection into system prompt (`claude-client.js` → `buildSystemPrompt()`):**
- After existing sections (personality, user info, memories, skills), append a "What's currently on the canvas" section.
- Lists each element compactly: type, id, title, and truncated content summary.
- Skipped entirely if canvas is empty (no wasted tokens).
- Example:
  ```
  ## What's currently on the canvas
  The user can see the following elements on their screen right now:
  - [card] id="weather-today": title="Today's Weather", content="72°F, sunny..."
  - [chart] id="cpu-usage": title="CPU Usage", type="line"
  ```

### Canvas Rehydration on Reconnect

- On WebSocket connection, the server loads the canvas state for that user+agent from the DB.
- Sends a `canvas_set_mode` command followed by individual element commands for each stored element.
- The frontend processes these through the existing `commandRouter` → reducer pipeline (no new client-side code).
- Handles scheduled events that put content on the canvas while the user was offline.
- On agent switch, clear the canvas and send the new agent's canvas state.

### What Doesn't Change

- No "new conversation" button — the window slides silently.
- No summarization of old messages — archived as-is in the DB.
- No frontend conversation UI changes — the window is invisible to the user.
- No new dependencies — character-based token estimation only.
- No changes to the `messages` table schema.
- No changes to how messages are written (`addUserMessage`, `addAssistantResponse`, `addToolResults` unchanged).

## Files Modified

| File | Change |
|------|--------|
| `server/session.js` | Token-budgeted `getMessages()` with `LIMIT 200` query |
| `server/db.js` | Add `canvas_state` column migration to `sessions` table |
| `server/claude-client.js` | Canvas state tracking in tool-use loop, canvas injection in `buildSystemPrompt()`, pass userId/agentId for canvas helpers |
| `server/index.js` | Send canvas state on WebSocket connect, clear+resend on agent switch |
