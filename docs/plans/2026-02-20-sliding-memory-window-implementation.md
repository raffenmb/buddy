# Sliding Memory Window Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the unbounded conversation history with a token-budgeted sliding window, add server-side canvas state persistence, and inject canvas state into the system prompt so Claude always knows what's on screen.

**Architecture:** `getMessages()` queries only the tail of the messages table and returns messages that fit within a token budget. The server tracks canvas state in a `canvas_state` column on the `sessions` table, updating it as canvas tool calls flow through. On each API call, a compact canvas snapshot is injected into the system prompt. On WebSocket connect, the server sends the canvas state to rehydrate the frontend.

**Tech Stack:** Node.js, Express, better-sqlite3, ws (WebSockets), React 18

**Design doc:** `docs/plans/2026-02-20-sliding-memory-window-design.md`

---

## Task 1: Add `canvas_state` Column to Sessions Table

**Files:**
- Modify: `server/db.js`

**Step 1: Add migration**

After the existing `ALTER TABLE sessions ADD COLUMN user_id` migration (line ~108), add:

```javascript
// Add canvas_state column to sessions (JSON blob tracking current canvas elements)
try { db.exec("ALTER TABLE sessions ADD COLUMN canvas_state TEXT DEFAULT '{\"elements\":[]}'"); } catch {}
```

**Step 2: Verify**

Start the server (`cd server && node index.js`), confirm it boots without errors and the column exists.

**Step 3: Commit**

```bash
git add server/db.js
git commit -m "Add canvas_state column to sessions table"
```

---

## Task 2: Add Canvas State Helpers to `session.js`

**Files:**
- Modify: `server/session.js`

**Step 1: Add `getCanvasState` function**

```javascript
export function getCanvasState(userId, agentId = "buddy") {
  const sessionId = ensureSession(userId);
  const row = db.prepare(
    "SELECT canvas_state FROM sessions WHERE id = ?"
  ).get(sessionId);
  if (!row || !row.canvas_state) return [];
  try {
    const parsed = JSON.parse(row.canvas_state);
    return parsed.elements || [];
  } catch {
    return [];
  }
}
```

**Step 2: Add `updateCanvasState` function**

```javascript
export function updateCanvasState(userId, elements) {
  const sessionId = ensureSession(userId);
  db.prepare(
    "UPDATE sessions SET canvas_state = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(JSON.stringify({ elements }), sessionId);
}
```

**Step 3: Add `applyCanvasCommand` function**

This mirrors the frontend reducer logic so the server tracks the same state:

```javascript
export function applyCanvasCommand(userId, commandName, params) {
  const elements = getCanvasState(userId);

  switch (commandName) {
    case "canvas_set_mode": {
      if (params.mode === "clear") {
        updateCanvasState(userId, []);
        return;
      }
      // Mode changes without clear don't affect elements
      return;
    }
    case "canvas_add_card":
      elements.push({ type: "card", ...params });
      break;
    case "canvas_show_text":
      elements.push({ type: "text", ...params });
      break;
    case "canvas_show_chart":
      elements.push({ type: "chart", ...params });
      break;
    case "canvas_show_table":
      elements.push({ type: "table", ...params });
      break;
    case "canvas_play_media":
      elements.push({ type: "media", ...params });
      break;
    case "canvas_show_confirmation":
      elements.push({ type: "confirmation", ...params });
      break;
    case "canvas_update_card": {
      const idx = elements.findIndex(el => el.id === params.id);
      if (idx !== -1) elements[idx] = { ...elements[idx], ...params };
      break;
    }
    case "canvas_remove_element": {
      const removeIdx = elements.findIndex(el => el.id === params.id);
      if (removeIdx !== -1) elements.splice(removeIdx, 1);
      break;
    }
    case "canvas_show_notification":
    case "canvas_set_theme":
      // Notifications are ephemeral, themes don't affect element state
      return;
    default:
      return;
  }

  updateCanvasState(userId, elements);
}
```

**Step 4: Commit**

```bash
git add server/session.js
git commit -m "Add canvas state helpers to session module"
```

---

## Task 3: Token-Budgeted `getMessages()`

**Files:**
- Modify: `server/session.js`

**Step 1: Add token budget constant**

At the top of `session.js`, after the imports:

```javascript
// Token budget for the sliding message window.
// Claude's context is 200K tokens. We reserve ~120K for messages,
// leaving room for system prompt (~5K), tools (~15K), canvas state, and response.
const MESSAGE_TOKEN_BUDGET = 120000;

// Rough token estimate: ~4 characters per token
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}
```

**Step 2: Rewrite `getMessages`**

Replace the existing `getMessages` function:

```javascript
export function getMessages(agentId = "buddy", userId) {
  const sessionId = ensureSession(userId);

  // Query from the tail — LIMIT 200 is far more than will ever fit in context,
  // but ensures the query is O(1) regardless of total table size.
  const rows = db.prepare(
    "SELECT role, content FROM messages WHERE session_id = ? AND agent_id = ? ORDER BY id DESC LIMIT 200"
  ).all(sessionId, agentId);

  // Reverse to chronological order
  rows.reverse();

  // Walk from newest to oldest, accumulating tokens
  let totalTokens = 0;
  let cutoff = 0; // index of first message to include

  for (let i = rows.length - 1; i >= 0; i--) {
    const tokens = estimateTokens(rows[i].content);
    if (totalTokens + tokens > MESSAGE_TOKEN_BUDGET) {
      cutoff = i + 1;
      break;
    }
    totalTokens += tokens;
  }

  // Ensure we don't start on an assistant or tool_result message —
  // Claude requires messages to start with a user role.
  while (cutoff < rows.length && rows[cutoff].role !== "user") {
    cutoff++;
  }

  const windowed = rows.slice(cutoff);

  return windowed.map((row) => ({
    role: row.role,
    content: JSON.parse(row.content),
  }));
}
```

**Step 3: Verify**

Start the server, send a prompt, confirm the response works normally. Check server logs for cache info to confirm messages are being sent.

**Step 4: Commit**

```bash
git add server/session.js
git commit -m "Implement token-budgeted sliding message window"
```

---

## Task 4: Track Canvas State in `claude-client.js`

**Files:**
- Modify: `server/claude-client.js`

**Step 1: Import the canvas helper**

Update the import from `./session.js` (line 12) to include `applyCanvasCommand`:

```javascript
import { addUserMessage, addAssistantResponse, addToolResults, getMessages, applyCanvasCommand } from "./session.js";
```

**Step 2: Update `processPrompt` to accept `userId` for canvas tracking**

`processPrompt` already receives `userId` as a parameter. After the canvas tool calls return `{ status: "rendered" }` in the tool results mapping (around line 360-364), add canvas state tracking.

Find the default tool result return at the end of the `toolUseBlocks.map` callback:

```javascript
return {
  type: "tool_result",
  tool_use_id: toolUse.id,
  content: JSON.stringify({ status: "rendered" }),
};
```

Replace it with:

```javascript
// Canvas tool — track state server-side and return rendered
if (toolUse.name.startsWith("canvas_")) {
  applyCanvasCommand(userId, toolUse.name, toolUse.input);
}
return {
  type: "tool_result",
  tool_use_id: toolUse.id,
  content: JSON.stringify({ status: "rendered" }),
};
```

**Step 3: Verify**

Start the server, send a prompt that triggers canvas output (e.g. "show me a card with today's date"). Check the database to confirm `canvas_state` is populated on the session row:

```bash
sqlite3 ~/.buddy/buddy.db "SELECT canvas_state FROM sessions LIMIT 1"
```

**Step 4: Commit**

```bash
git add server/claude-client.js
git commit -m "Track canvas state server-side during tool-use loop"
```

---

## Task 5: Inject Canvas State into System Prompt

**Files:**
- Modify: `server/claude-client.js`

**Step 1: Import `getCanvasState`**

Update the import from `./session.js` to also include `getCanvasState`:

```javascript
import { addUserMessage, addAssistantResponse, addToolResults, getMessages, applyCanvasCommand, getCanvasState } from "./session.js";
```

**Step 2: Update `buildSystemPrompt` to accept userId and inject canvas**

Change the function signature from `buildSystemPrompt(agent, memories)` to `buildSystemPrompt(agent, memories, userId)`.

At the end of `buildSystemPrompt`, before the `return basePrompt`, add:

```javascript
  // Inject current canvas state so Claude knows what the user sees
  if (userId) {
    const canvasElements = getCanvasState(userId);
    if (canvasElements.length > 0) {
      basePrompt += "\n\n## What's currently on the canvas\nThe user can see the following elements on their screen right now:";
      for (const el of canvasElements) {
        const summary = el.title || el.content || el.body || "";
        const truncated = summary.length > 150 ? summary.slice(0, 150) + "..." : summary;
        basePrompt += `\n- [${el.type}] id="${el.id}"${truncated ? `: ${truncated}` : ""}`;
      }
    }
  }
```

**Step 3: Update the `buildSystemPrompt` call site**

In `processPrompt`, update the call (around line 135):

```javascript
const systemPrompt = buildSystemPrompt(agent, memories, userId);
```

**Step 4: Verify**

Send a prompt that puts content on the canvas, then send a follow-up like "what's on the canvas?" to confirm Claude can see it. Also verify after enough messages that the canvas context persists even when older messages slide out.

**Step 5: Commit**

```bash
git add server/claude-client.js
git commit -m "Inject current canvas state into system prompt"
```

---

## Task 6: Canvas Rehydration on WebSocket Connect

**Files:**
- Modify: `server/index.js`
- Modify: `server/session.js` (export needed)

**Step 1: Import `getCanvasState` in index.js**

Add `getCanvasState` to the session import (line 20):

```javascript
import { resetSession, getCanvasState } from "./session.js";
```

**Step 2: Send canvas state on WebSocket connection**

In the `wss.on("connection")` handler (around line 531), after the pending messages delivery block, add:

```javascript
  // Send last-known agent's canvas state to rehydrate the frontend
  // We don't know which agent the client will use yet, so use "buddy" as default
  const initialCanvas = getCanvasState(decoded.userId, "buddy");
  if (initialCanvas.length > 0) {
    sendTo(ws, {
      type: "canvas_command",
      command: "canvas_set_mode",
      params: { mode: "content" },
    });
    for (const el of initialCanvas) {
      const { type: elType, ...params } = el;
      // Map element type back to canvas command name
      const commandMap = {
        card: "canvas_add_card",
        text: "canvas_show_text",
        chart: "canvas_show_chart",
        table: "canvas_show_table",
        media: "canvas_play_media",
        confirmation: "canvas_show_confirmation",
      };
      const command = commandMap[elType];
      if (command) {
        sendTo(ws, { type: "canvas_command", command, params });
      }
    }
  }
```

**Step 3: Clear and resend canvas on agent switch**

In the prompt route's agent switch block (around line 459-476), after the `canvas_set_mode: clear` broadcast, also clear the server-side canvas state for the old agent context and load the new agent's canvas. Import `applyCanvasCommand` in index.js:

```javascript
import { resetSession, getCanvasState, applyCanvasCommand } from "./session.js";
```

Then update the agent switch block in the prompt route. Replace the existing clear broadcast:

```javascript
// Agent switch notification
const agent = getAgent(agentId);
if (agent) {
  // Clear canvas (both broadcast and server state)
  send({
    type: "canvas_command",
    command: "canvas_set_mode",
    params: { mode: "clear" },
  });
  applyCanvasCommand(userId, "canvas_set_mode", { mode: "clear" });

  send({
    type: "agent_switch",
    agent: {
      id: agent.id,
      name: agent.name,
      avatar: agent.avatar,
      avatar_config: agent.avatar_config,
      voice_config: agent.voice_config,
    },
  });
}
```

Note: Since sessions are scoped per user (not per user+agent), the canvas state is per-user. When switching agents the canvas clears, which is the behavior we agreed on.

**Step 4: Verify**

1. Send a prompt that puts cards on the canvas
2. Refresh the browser — cards should reappear
3. Switch agents — canvas should clear
4. Switch back — canvas should be empty (was cleared on switch)

**Step 5: Commit**

```bash
git add server/index.js server/session.js
git commit -m "Rehydrate canvas state on WebSocket connect and agent switch"
```

---

## Task 7: Update CLAUDE.md Documentation

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update the relevant sections**

In the "Key Server Modules" section, update the `server/session.js` entry:

```
- `server/session.js` — Conversation history management with token-budgeted sliding window. Canvas state persistence (server-side tracking of current canvas elements).
```

In the "Key Design Constraints" section, add:

```
- **Sliding message window** — `getMessages()` returns only recent messages within a ~120K token budget. Old messages stay in SQLite but aren't sent to Claude. Query uses `LIMIT 200 ORDER BY id DESC` for O(1) performance regardless of table size.
- **Server-side canvas state** — canvas elements are tracked in the `sessions.canvas_state` column. Injected into the system prompt so Claude always knows what's on screen. Canvas persists across page refreshes and survives beyond the message window.
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "Document sliding memory window and canvas state persistence"
```

---

## Task 8: Manual Testing Checklist

Run through these scenarios to verify everything works:

1. **Basic conversation** — send several prompts, confirm responses work normally
2. **Canvas persistence** — ask Buddy to show cards on canvas, refresh the page, confirm they reappear
3. **Canvas awareness** — put content on canvas, then ask "what's on the canvas?" — Claude should know
4. **Agent switch** — switch to a different agent, confirm canvas clears
5. **Long conversation** — send many messages (or messages with large tool output) to verify the sliding window doesn't break. Older messages should silently drop.
6. **Canvas outlives conversation** — put content on canvas, send enough messages to push the canvas tool calls out of the window, then ask about the canvas — Claude should still know what's displayed
7. **Scheduled events** — trigger a scheduled prompt, confirm it works with the new `getMessages` (scheduler calls `processPrompt` directly)
