# Buddy — AI Avatar Interface with Dynamic Canvas

## Vision

Buddy is an AI interface where a small avatar character lives in the corner of your screen, talks to you through subtitles, and throws supplementary content (charts, data, images, video, text) onto the dynamic canvas behind it. No chat history. No scrolling messages. Just a character saying one thing at a time, like watching a movie with subtitles, while the background becomes whatever the AI needs it to be.

The user sees one response at a time. The AI remembers everything.

### The Three Layers

**Layer 1 — MVP (this document):** Static avatar image + subtitle responses + dynamic canvas on web. Text input only. No TTS. No voice. Prove the paradigm works.

**Layer 2 — Enhanced Experience:** Add TTS (avatar speaks out loud), voice input (talk to Buddy), animated avatar (expressions, gestures), multi-surface support (phone, glasses). Subtitles remain as an option/fallback.

**Layer 3 — OpenClaw Multi-Agent:** Native integration with OpenClaw Gateway. Switch between agents ("Let me talk to my cooking agent"). Each agent gets its own avatar appearance, personality, and canvas behavior. Agent roster pulled from OpenClaw config.

---

## Core Concept

```
┌─────────────────────────────────────────────────────────────┐
│                        THE SCREEN                           │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                                                     │   │
│   │              DYNAMIC CANVAS                         │   │
│   │       (charts, text, images, video,                 │   │
│   │        data tables — whatever Buddy                 │   │
│   │        wants to show you)                           │   │
│   │                                                     │   │
│   │                                                     │   │
│   │                                                     │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
│   ┌──────────┐                                              │
│   │  BUDDY   │  "Here's what I found for                   │
│   │  (avatar │   your dinner plans..."                     │
│   │  image)  │                                              │
│   └──────────┘  ^^^ subtitle text (disappears on next)     │
│                                                             │
│   [ type something to Buddy... ]                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

Two output streams from the AI:

- **Subtitle stream:** The avatar's spoken words, displayed as subtitle text near the avatar. One response at a time — old subtitles vanish when new ones appear. This is the primary, conversational output.
- **Canvas stream:** Structured visual commands (cards, charts, tables, video, images, text blocks). Rendered on the background behind the avatar.

The user never sees a chat log. It feels like a conversation, not a document.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         BROWSER                                 │
│                                                                  │
│  ┌────────────┐  ┌──────────────────────────────────────────┐    │
│  │  Avatar    │  │          Canvas Renderer                 │    │
│  │            │  │  ┌─────────┐ ┌──────────┐ ┌──────────┐  │    │
│  │ - Static   │  │  │ Command │ │Component │ │ Rendered │  │    │
│  │   image    │  │  │ Router  │→│ Registry │→│ Surface  │  │    │
│  │ - Mouth    │  │  └─────────┘ └──────────┘ └──────────┘  │    │
│  │   toggle   │  │                                          │    │
│  │ - Subtitle │  │                                          │    │
│  └──────┬─────┘  └──────────────────┬───────────────────────┘    │
│         │                           │                            │
│  ┌──────┴───────────────────────────┴───────────────────────┐    │
│  │              WebSocket Client                            │    │
│  │  Receives: { subtitle } and { canvas_commands }          │    │
│  └──────────────────────┬───────────────────────────────────┘    │
│                         │                                        │
└─────────────────────────┼────────────────────────────────────────┘
                          │ WebSocket
┌─────────────────────────┼────────────────────────────────────────┐
│                     BUDDY SERVER                                │
│                         │                                        │
│  ┌──────────────────────┴───────────────────────────────────┐    │
│  │                                                          │    │
│  │  ┌──────────┐  ┌───────────┐  ┌────────────────────┐    │    │
│  │  │ Express  │  │  Claude   │  │   Response         │    │    │
│  │  │ /prompt  │→ │  Client   │→ │   Splitter         │    │    │
│  │  └──────────┘  │  (Tools)  │  │                    │    │    │
│  │                │           │  │ text → subtitle WS  │    │    │
│  │                │  Session  │  │ canvas → canvas WS  │    │    │
│  │                │  Memory   │  └────────────────────┘    │    │
│  │                └───────────┘                            │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Future: connect to OpenClaw Gateway as channel adapter          │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. User types a message in the input bar and hits enter.
2. Frontend sends the text via HTTP POST to `POST /api/prompt`.
3. Backend appends the user message to the **session history** (in-memory array).
4. Backend sends the full conversation history to Claude API with the canvas tool definitions.
5. Claude responds with a mix of tool calls (canvas commands) and text (the spoken response).
6. **Response Splitter** separates the response:
   - **Text content** → sent to frontend as `{ type: "subtitle", text: "..." }` via WebSocket.
   - **Canvas tool calls** → sent as `{ type: "canvas_command", command, params }` via WebSocket.
7. Frontend receives both:
   - Subtitle text replaces any previous subtitle. Avatar mouth toggles open/closed during a brief "talking" animation.
   - Canvas commands render on the background.
8. Backend appends Claude's full response (text + tool calls + tool results) to the session history. **This is the rolling memory.** The user never sees the history, but Claude has the full conversation context on every turn.

### Rolling Memory

The user experience is "one subtitle at a time" — no chat log, no scrollback. But the backend maintains the complete conversation as a standard Claude messages array:

```javascript
// Server-side session (in memory for MVP, persisted to disk/db later)
const session = {
  messages: [
    { role: "user", content: "What should I make for dinner?" },
    { role: "assistant", content: [
      { type: "text", text: "How about a simple pasta with..." },
      { type: "tool_use", name: "canvas_add_card", ... }
    ]},
    { role: "user", content: "That sounds great, what about dessert?" },
    // ... full history continues
  ]
};
```

Every call to Claude includes the full message history (up to context limits). When the session gets long, implement a simple compaction strategy: summarize older messages into a system message and trim the array. This mirrors how OpenClaw handles session compaction.

For MVP, just keep growing the array. Context limits won't be an issue for testing conversations.

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Backend runtime | Node.js 18+ | Async, WebSocket native |
| AI client | `@anthropic-ai/sdk` | Claude tool use |
| HTTP server | Express | Simple API layer |
| WebSocket | `ws` | Lightweight, bidirectional |
| Frontend | React 18 (Vite) | Component model, fast iteration |
| Canvas styling | Tailwind CSS | Rapid UI |
| Charts | Recharts | React-native charting |
| State management | React Context + useReducer | Fits command pattern |

No TTS. No STT. No audio libraries. Just text in, text + canvas commands out.

---

## Project Structure

```
buddy/
├── server/
│   ├── index.js                # Express + WebSocket entry point
│   ├── claude-client.js        # Claude API + tool use loop + session memory
│   ├── tools.js                # All canvas tool definitions
│   ├── response-splitter.js    # Separates subtitle text from canvas commands
│   ├── session.js              # Session/memory management
│   └── .env                    # ANTHROPIC_API_KEY
├── client/
│   ├── src/
│   │   ├── App.jsx             # Main app shell
│   │   ├── main.jsx            # Vite entry
│   │   ├── context/
│   │   │   └── BuddyState.jsx  # Global state (canvas + subtitle + avatar)
│   │   ├── components/
│   │   │   ├── Avatar.jsx      # Avatar image + mouth toggle + subtitle display
│   │   │   ├── Canvas.jsx      # Full-screen background canvas
│   │   │   ├── InputBar.jsx    # Text input
│   │   │   ├── canvas-elements/
│   │   │   │   ├── Card.jsx
│   │   │   │   ├── Chart.jsx
│   │   │   │   ├── DataTable.jsx
│   │   │   │   ├── TextBlock.jsx
│   │   │   │   ├── VideoPlayer.jsx
│   │   │   │   ├── ImageDisplay.jsx
│   │   │   │   └── Notification.jsx
│   │   │   └── assets/
│   │   │       ├── buddy-idle.png       # Mouth closed
│   │   │       └── buddy-talking.png    # Mouth open
│   │   ├── hooks/
│   │   │   └── useWebSocket.js          # WS connection + message routing
│   │   └── lib/
│   │       └── commandRouter.js         # Maps commands → state mutations
│   ├── index.html
│   ├── tailwind.config.js
│   └── vite.config.js
├── package.json
└── README.md
```

---

## Avatar Implementation (MVP)

The avatar is intentionally simple for MVP. Two images and a timer.

### Assets Needed

Two images of the same character:
- `buddy-idle.png` — mouth closed (or neutral expression)
- `buddy-talking.png` — mouth open

These can be hand-drawn, AI-generated, pixel art, cartoon style — whatever feels right. They just need to be the same character in the same position with the mouth being the only difference.

For a quick placeholder during development, even two simple emoji-style faces work. Replace with real art later.

### Talking Animation Logic

When a subtitle arrives, the avatar enters "talking" mode:

```
1. Subtitle text arrives from WebSocket.
2. Set avatar state to "talking."
3. Start a timer that toggles between buddy-idle.png and buddy-talking.png
   every 150-200ms (creates a simple mouth flapping effect).
4. Calculate a "talk duration" based on subtitle text length:
   - Rough formula: (character count / 15) * 1000 ms
   - Example: 60 characters ≈ 4 seconds of mouth movement
   - Minimum: 1 second. Maximum: 10 seconds.
5. After talk duration, stop toggling. Set avatar back to idle image.
6. Subtitle text remains visible until the NEXT response arrives.
```

This creates the illusion that Buddy is "saying" the subtitle text. It doesn't need to be precise — just enough to feel alive.

### Avatar Component Behavior

- **Position:** Fixed, bottom-left corner of the screen. Overlays on top of the canvas.
- **Size:** ~120-160px wide. Should feel like a small character in the corner, not dominate the screen.
- **Background:** Slight gradient or shadow behind the avatar so it's visible against any canvas content.
- **Subtitle position:** To the right of the avatar, or in a subtitle bar along the bottom. Text appears with a quick fade-in. Styled like movie subtitles — semi-transparent dark background, white text, clean font.
- **Idle state:** Just the static idle image. Maybe a very subtle CSS animation (slight float/bob) to keep it from feeling completely dead.

---

## Canvas Tool Definitions

These control the visual surface behind the avatar. Identical to previous plan with minor refinements.

### `canvas_set_mode`

```json
{
  "name": "canvas_set_mode",
  "description": "Set the canvas display mode. 'ambient' shows a calm animated background. 'content' displays information cards/charts/tables. 'media' focuses on video or images. 'clear' resets to empty ambient state.",
  "input_schema": {
    "type": "object",
    "properties": {
      "mode": {
        "type": "string",
        "enum": ["ambient", "content", "media", "clear"],
        "description": "Canvas display mode"
      },
      "layout": {
        "type": "string",
        "enum": ["single", "two-column", "grid", "dashboard", "fullscreen"],
        "description": "Content layout (only for 'content' mode)"
      },
      "transition": {
        "type": "string",
        "enum": ["fade", "slide", "instant"],
        "description": "Transition animation"
      }
    },
    "required": ["mode"]
  }
}
```

### `canvas_add_card`

```json
{
  "name": "canvas_add_card",
  "description": "Add a content card to the canvas. Use for displaying information blocks, summaries, tips, or any structured content.",
  "input_schema": {
    "type": "object",
    "properties": {
      "id": { "type": "string", "description": "Unique identifier for this card" },
      "title": { "type": "string", "description": "Card title" },
      "body": { "type": "string", "description": "Card body content (supports markdown)" },
      "color": {
        "type": "string",
        "enum": ["default", "blue", "green", "red", "yellow", "purple", "gray"],
        "description": "Card accent color"
      },
      "icon": { "type": "string", "description": "Optional icon name (alert, info, check, star, heart, clock)" },
      "position": {
        "type": "string",
        "enum": ["auto", "top-left", "top-right", "center", "bottom-left", "bottom-right"],
        "description": "Preferred position (auto lets layout engine decide)"
      },
      "priority": { "type": "integer", "description": "Sort priority (lower = more prominent)" }
    },
    "required": ["id", "title", "body"]
  }
}
```

### `canvas_update_card`

```json
{
  "name": "canvas_update_card",
  "description": "Update an existing card by ID. Only provided fields change.",
  "input_schema": {
    "type": "object",
    "properties": {
      "id": { "type": "string" },
      "title": { "type": "string" },
      "body": { "type": "string" },
      "color": { "type": "string", "enum": ["default", "blue", "green", "red", "yellow", "purple", "gray"] }
    },
    "required": ["id"]
  }
}
```

### `canvas_remove_element`

```json
{
  "name": "canvas_remove_element",
  "description": "Remove any element from the canvas by ID.",
  "input_schema": {
    "type": "object",
    "properties": {
      "id": { "type": "string" },
      "transition": { "type": "string", "enum": ["fade", "slide", "instant"] }
    },
    "required": ["id"]
  }
}
```

### `canvas_show_text`

```json
{
  "name": "canvas_show_text",
  "description": "Display a large text block on the canvas for the user to read. Use when content is too long or detailed to say as a subtitle. Buddy can reference it: 'Here, take a look at this.'",
  "input_schema": {
    "type": "object",
    "properties": {
      "id": { "type": "string" },
      "title": { "type": "string", "description": "Optional heading" },
      "content": { "type": "string", "description": "Text content (supports markdown)" },
      "style": {
        "type": "string",
        "enum": ["document", "note", "code", "quote"],
        "description": "Visual style"
      }
    },
    "required": ["id", "content"]
  }
}
```

### `canvas_show_chart`

```json
{
  "name": "canvas_show_chart",
  "description": "Display a chart on the canvas.",
  "input_schema": {
    "type": "object",
    "properties": {
      "id": { "type": "string" },
      "chart_type": { "type": "string", "enum": ["bar", "line", "pie", "area"] },
      "title": { "type": "string" },
      "data": {
        "type": "array",
        "items": { "type": "object" },
        "description": "Array of data objects with 'label' key and numeric value keys"
      },
      "data_keys": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Which keys to plot"
      },
      "colors": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Optional hex color codes for each data key"
      }
    },
    "required": ["id", "chart_type", "title", "data", "data_keys"]
  }
}
```

### `canvas_show_table`

```json
{
  "name": "canvas_show_table",
  "description": "Display a data table on the canvas.",
  "input_schema": {
    "type": "object",
    "properties": {
      "id": { "type": "string" },
      "title": { "type": "string" },
      "columns": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "key": { "type": "string" },
            "label": { "type": "string" },
            "align": { "type": "string", "enum": ["left", "center", "right"] }
          },
          "required": ["key", "label"]
        }
      },
      "rows": {
        "type": "array",
        "items": { "type": "object" }
      }
    },
    "required": ["id", "title", "columns", "rows"]
  }
}
```

### `canvas_play_media`

```json
{
  "name": "canvas_play_media",
  "description": "Play a video or display an image on the canvas.",
  "input_schema": {
    "type": "object",
    "properties": {
      "id": { "type": "string" },
      "media_type": { "type": "string", "enum": ["video", "image", "gif"] },
      "url": { "type": "string", "description": "URL of the media" },
      "title": { "type": "string", "description": "Optional caption" },
      "autoplay": { "type": "boolean", "description": "For video: auto-start (default true)" },
      "display": {
        "type": "string",
        "enum": ["fullscreen", "contained", "background"],
        "description": "Display style"
      }
    },
    "required": ["id", "media_type", "url"]
  }
}
```

### `canvas_show_notification`

```json
{
  "name": "canvas_show_notification",
  "description": "Show a brief notification overlay. Auto-dismisses.",
  "input_schema": {
    "type": "object",
    "properties": {
      "message": { "type": "string" },
      "type": { "type": "string", "enum": ["info", "success", "warning", "error"] },
      "duration_ms": { "type": "integer", "description": "Display duration in ms (default 5000)" }
    },
    "required": ["message"]
  }
}
```

### `canvas_set_theme`

```json
{
  "name": "canvas_set_theme",
  "description": "Change the canvas visual theme.",
  "input_schema": {
    "type": "object",
    "properties": {
      "mode": { "type": "string", "enum": ["light", "dark"] },
      "accent_color": { "type": "string", "description": "Primary accent hex color" },
      "background": {
        "type": "string",
        "enum": ["solid", "gradient", "particles", "waves"],
        "description": "Background style for ambient mode"
      }
    },
    "required": ["mode"]
  }
}
```

### `canvas_surface_route` (future-proofing)

```json
{
  "name": "canvas_surface_route",
  "description": "Suggest which device surface should display canvas content. MVP: informational only (all content renders locally). Future: routes content to phone, glasses HUD, etc.",
  "input_schema": {
    "type": "object",
    "properties": {
      "target": {
        "type": "string",
        "enum": ["current", "phone", "web", "glasses_hud", "best_available"]
      },
      "reason": { "type": "string", "description": "Why this surface" }
    },
    "required": ["target"]
  }
}
```

---

## Implementation Details

### 1. Server — Entry Point (`server/index.js`)

Express + WebSocket server.

- `POST /api/prompt` — accepts `{ prompt: string }`.
- Passes prompt to Claude client (which maintains session memory).
- Passes Claude response to Response Splitter.
- Splitter broadcasts subtitle and canvas messages over WebSocket.
- Also serves as static file server for the client build in production.
- Port: 3001 (configurable via env).

### 2. Server — Session Management (`server/session.js`)

Maintains conversation history in memory.

```javascript
// Simple session store
class Session {
  constructor() {
    this.messages = [];  // Claude messages format
  }

  addUserMessage(text) {
    this.messages.push({ role: "user", content: text });
  }

  addAssistantResponse(response) {
    // Store Claude's full response (text blocks + tool_use blocks)
    this.messages.push({ role: "assistant", content: response.content });
  }

  addToolResults(results) {
    // Store tool results for the conversation
    this.messages.push({ role: "user", content: results });
  }

  getMessages() {
    return this.messages;
  }

  // Future: compaction when history gets long
  // Summarize older messages, keep recent ones verbatim
}
```

For MVP, single session — one user, one conversation. The session lives in memory and resets when the server restarts. Persistence (save to disk, database) is a Layer 2 concern.

### 3. Server — Claude Client (`server/claude-client.js`)

Handles the Claude API conversation loop with tool use.

Key behaviors:

- Import tool definitions from `tools.js`.
- Build system prompt (see System Prompt section below).
- On each user message:
  1. Add user message to session.
  2. Call `anthropic.messages.create()` with model, tools, system prompt, and full session messages.
  3. Enter tool use loop: if `stop_reason === "tool_use"`, extract tool calls, generate tool results (all tools return `{ status: "rendered" }`), add assistant response and tool results to session, call Claude again.
  4. Continue until `stop_reason === "end_turn"`.
  5. Add final response to session.
  6. Return the final response (which contains both text blocks and any tool_use blocks from the last turn).

- Also return ALL tool calls from ALL turns in the loop (not just the final turn), so the response splitter can process every canvas command that was issued.

### 4. Server — Response Splitter (`server/response-splitter.js`)

Takes the accumulated Claude response and broadcasts it to clients.

```javascript
function splitAndBroadcast(allToolCalls, finalTextContent, broadcast) {
  // 1. Process canvas commands (in order they were called)
  for (const toolCall of allToolCalls) {
    if (toolCall.name.startsWith("canvas_")) {
      broadcast({
        type: "canvas_command",
        command: toolCall.name,
        params: toolCall.input,
        sequence: toolCall.sequence  // preserve ordering
      });
    }
  }

  // 2. Send subtitle text (concatenated text blocks from final response)
  if (finalTextContent) {
    broadcast({
      type: "subtitle",
      text: finalTextContent
    });
  }
}
```

The subtitle always comes AFTER canvas commands, so the background updates before Buddy "speaks." This feels natural — Buddy sets up the visual, then comments on it.

### 5. Frontend — State Management (`client/src/context/BuddyState.jsx`)

```javascript
const initialState = {
  // Avatar
  avatar: {
    isTalking: false,    // true while mouth is toggling
  },

  // Subtitle
  subtitle: {
    text: "",            // current subtitle text (empty = no subtitle showing)
    visible: false       // controls fade in/out
  },

  // Canvas
  canvas: {
    mode: "ambient",
    layout: "single",
    theme: { mode: "dark", accent_color: "#3B82F6", background: "particles" },
    elements: [],        // all rendered elements (cards, charts, tables, etc.)
    notification: null
  },

  // Input
  input: {
    isProcessing: false  // true while waiting for Claude response
  },

  // Connection
  connected: false,

  // Agent info (future)
  agent: {
    name: "Buddy",
    id: "default"
  }
};
```

Reducer actions:

- `SET_SUBTITLE` — replace subtitle text, set visible true, set isTalking true
- `CLEAR_SUBTITLE` — set visible false (called when user sends next message)
- `STOP_TALKING` — set isTalking false (called after talk duration timer)
- `CANVAS_SET_MODE`, `CANVAS_ADD_CARD`, `CANVAS_UPDATE_CARD`, `CANVAS_REMOVE_ELEMENT`, `CANVAS_SHOW_TEXT`, `CANVAS_SHOW_CHART`, `CANVAS_SHOW_TABLE`, `CANVAS_PLAY_MEDIA`, `CANVAS_SHOW_NOTIFICATION`, `CANVAS_SET_THEME` — 1:1 mapping with canvas tool names
- `SET_PROCESSING` — toggle loading state
- `SET_CONNECTED` — WebSocket connection status

### 6. Frontend — Avatar Component (`client/src/components/Avatar.jsx`)

The simplest component in the system.

Structure:
```
┌──────────────────────────────────────────────┐
│                                              │
│  ┌────────┐  "Here's what I found for       │
│  │ Buddy  │   your dinner plans. I put      │
│  │ image  │   a few recipes up for you      │
│  │        │   to look through."             │
│  └────────┘                                  │
│                                              │
└──────────────────────────────────────────────┘
```

Behaviors:

- **Image display:** Show `buddy-idle.png` by default. When `isTalking` is true, alternate between `buddy-idle.png` and `buddy-talking.png` every 150ms using a `setInterval`.
- **Subtitle display:** Show `subtitle.text` to the right of the avatar image when `subtitle.visible` is true. Fade in with CSS transition. Semi-transparent dark background strip behind the text for readability against any canvas content.
- **Talk duration:** When a new subtitle arrives, calculate talk time from text length (`Math.min(Math.max(text.length / 15 * 1000, 1000), 10000)`). Start mouth toggle. After the duration, dispatch `STOP_TALKING` but keep subtitle visible.
- **Subtitle clearing:** When the user sends a new message (detected in InputBar or via processing state change), dispatch `CLEAR_SUBTITLE` to fade out the old subtitle.
- **Idle animation:** Optional subtle CSS animation on the avatar image — a gentle floating/bobbing motion. Just `@keyframes float { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-4px) } }` with a slow duration.
- **Thinking indicator:** When `input.isProcessing` is true, show a small "..." or thinking indicator near the avatar.
- **Position:** Fixed bottom-left. The avatar + subtitle area sits above the input bar. Z-index above the canvas.

### 7. Frontend — Canvas Component (`client/src/components/Canvas.jsx`)

Full-screen background behind avatar.

- **Ambient mode:** Animated background. For MVP, a simple CSS gradient animation or particles effect (use a lightweight particle library or pure CSS). Dark theme by default so content pops.
- **Content mode:** Renders elements from `canvas.elements` array in the specified layout. Elements arranged using CSS grid.
- **Media mode:** Single media element takes most of the screen.
- **Clear:** Fade all elements out, return to ambient.
- **Layout handling:**
  - `single` — centered column, max-width ~800px
  - `two-column` — CSS grid with 2 equal columns
  - `grid` — CSS grid with auto-fill columns
  - `dashboard` — first element spans 2 columns, rest in grid
  - `fullscreen` — single element takes full canvas

Each element type (Card, Chart, Table, TextBlock, etc.) is a separate component in `canvas-elements/`. They receive their data as props and render accordingly.

Elements should animate in (fade + slide up, ~200ms) and animate out when removed.

### 8. Frontend — Input Bar (`client/src/components/InputBar.jsx`)

Simple text input at the bottom of the screen.

- Text input with placeholder "Type something to Buddy..."
- Submit on Enter key.
- On submit:
  1. Dispatch `SET_PROCESSING(true)` and `CLEAR_SUBTITLE` (removes old subtitle).
  2. POST to `/api/prompt` with the text.
  3. Response comes through WebSocket (not the HTTP response — the POST just returns `{ status: "ok" }`).
  4. When WebSocket messages arrive, they update the state and `SET_PROCESSING(false)`.
- Disable input while processing.
- Minimal design — thin bar at the very bottom, doesn't compete with the avatar or canvas.

### 9. Frontend — WebSocket Hook (`client/src/hooks/useWebSocket.js`)

Manages connection and routes messages to state.

- Connect to `ws://localhost:3001` on mount.
- On message:
  - `{ type: "subtitle", text }` → dispatch `SET_SUBTITLE`
  - `{ type: "canvas_command", command, params }` → route through commandRouter → dispatch appropriate canvas action
  - `{ type: "processing", status }` → dispatch `SET_PROCESSING`
- Reconnect with backoff on disconnect.
- Expose `connected` boolean.

### 10. Frontend — Command Router (`client/src/lib/commandRouter.js`)

Maps canvas command names to reducer action types.

```javascript
const actionMap = {
  "canvas_set_mode": "CANVAS_SET_MODE",
  "canvas_add_card": "CANVAS_ADD_CARD",
  "canvas_update_card": "CANVAS_UPDATE_CARD",
  "canvas_remove_element": "CANVAS_REMOVE_ELEMENT",
  "canvas_show_text": "CANVAS_SHOW_TEXT",
  "canvas_show_chart": "CANVAS_SHOW_CHART",
  "canvas_show_table": "CANVAS_SHOW_TABLE",
  "canvas_play_media": "CANVAS_PLAY_MEDIA",
  "canvas_show_notification": "CANVAS_SHOW_NOTIFICATION",
  "canvas_set_theme": "CANVAS_SET_THEME",
  "canvas_surface_route": "CANVAS_SURFACE_ROUTE"  // no-op for MVP
};

export function routeCommand(command, params, dispatch) {
  const type = actionMap[command];
  if (type) {
    dispatch({ type, payload: params });
  }
}
```

---

## System Prompt for Claude

```
You are Buddy, a personal AI assistant displayed as a small avatar character on a screen. You talk to the user through subtitles — your text responses appear as subtitle text next to your avatar, one response at a time, like a character in a movie.

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
- 'clear': use to wipe the canvas back to ambient when changing topics
```

---

## Setup & Run

### Prerequisites

- Node.js 18+
- Anthropic API key

### Environment

Create `server/.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
PORT=3001
CLAUDE_MODEL=claude-sonnet-4-5-20250929
```

### Install & Run

```bash
# Install
cd buddy
npm install

# Start server
cd server && node index.js

# Start frontend (separate terminal)
cd client && npm run dev
```

Open `http://localhost:5173`.

---

## Testing

### Test 1 — Simple Conversation

Type: "Hey Buddy, what's up?"

Expected: Subtitle appears with a casual greeting. Avatar mouth flaps during talk duration. Canvas stays ambient. No cards, no charts.

### Test 2 — Information with Canvas

Type: "What should I make for dinner tonight? I like Italian food."

Expected: Buddy's subtitle says something brief like "Oh, I've got some ideas — check these out." Canvas switches to content mode with 2-3 recipe cards.

### Test 3 — Data Display

Type: "Show me a comparison of the top 5 programming languages by popularity."

Expected: Brief subtitle from Buddy. Canvas shows a bar chart and/or table.

### Test 4 — Subtitle Replacement

Type: "Tell me a fun fact." Then type: "Tell me another one."

Expected: First subtitle appears, avatar talks. Second message clears the first subtitle. New subtitle replaces it. No history of the first fact visible.

### Test 5 — Memory Continuity

Type: "My name is Matt." Then later type: "What's my name?"

Expected: Buddy responds "Matt" (or however it phrases it). The rolling session history means Buddy remembers, even though the user can't see the earlier conversation.

### Test 6 — Canvas Clearing

Type: "Show me some dinner recipes." Then: "Actually, let's talk about something else. How does a car engine work?"

Expected: On topic change, Buddy clears the recipe cards and puts up new content about engines (or just clears the canvas and responds via subtitle if the answer is simple enough).

---

## Future Layers (Architecture Notes)

Not part of MVP. Documented so the builder makes compatible decisions.

### Layer 2 — Enhanced Experience

- **TTS:** Add ElevenLabs or OpenAI TTS. Subtitle text also plays as audio. Avatar mouth toggle syncs to audio duration instead of text length estimate.
- **Voice input:** Add mic button. Capture audio, send to Whisper, use transcript as prompt.
- **Animated avatar:** Replace static images with sprite sheet (idle, talking, thinking, happy, concerned, etc.). Add avatar expression tools.
- **Multi-surface:** WebSocket device registration. Canvas commands route to best available screen.
- **Session persistence:** Save session to disk. Resume on server restart.

### Layer 3 — OpenClaw Multi-Agent

- Buddy frontend connects to OpenClaw Gateway (port 18789) as a channel adapter.
- Agent switching: user says "Can I talk to my cooking agent?" → current agent calls a handoff mechanism → Gateway routes to cooking agent workspace → Buddy's avatar image/name could change to represent the new agent.
- Each agent workspace defines: avatar image, display name, personality, canvas preferences.
- Agent roster accessible from frontend (show a subtle agent switcher if desired).
- Rolling memory spans per-agent sessions (each agent has its own session history).

### Future Canvas Elements

- `canvas_show_code` — syntax-highlighted code
- `canvas_show_map` — interactive map
- `canvas_show_timeline` — chronological events
- `canvas_show_list` — interactive checklist
- `canvas_show_progress` — progress bar
- `canvas_show_3d` — 3D model viewer
- `canvas_show_whiteboard` — collaborative drawing

---

## Key Design Decisions

**Why subtitles instead of chat?** Chat is a document format — you read a transcript. Subtitles are a presence format — you're with someone who's talking to you. One response at a time keeps the focus on the current moment and makes the canvas the star for anything detailed.

**Why no TTS for MVP?** TTS adds API costs, latency, audio handling complexity, and a dependency on external services. Subtitles prove the concept without any of that overhead. TTS is a Layer 2 enhancement that makes the experience better but isn't needed to validate the interaction model.

**Why a simple mouth toggle instead of real animation?** Because it works. Old video games proved that two frames of mouth movement are enough to create the illusion of a character talking. It's charming, easy to implement, and replaceable later with something more sophisticated.

**Why keep rolling memory invisible?** The user experience is "conversation in the moment." Showing history would turn it back into a chat app. But the AI needs continuity to be useful, so memory lives server-side. This also maps cleanly to OpenClaw's session model in Layer 3.

**Why send canvas commands before subtitles?** So the visual content is already on screen when Buddy "talks about it." If Buddy says "check this out" and the chart appears at the same time or slightly before, it feels coordinated. If the chart appears after, it feels broken.
