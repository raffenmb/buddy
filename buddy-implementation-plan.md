# Buddy — Personal AI Avatar with Dynamic Canvas

## Vision

Buddy is a personal AI assistant that lives on your devices. A small avatar character sits in the corner of your screen, talks to you through subtitles, and throws content (charts, data, images, video, text) onto the dynamic canvas behind it. No chat history. No scrolling messages. Just a character saying one thing at a time, with the background becoming whatever the AI needs it to be.

The user sees one response at a time. The AI remembers everything.

Buddy runs on a dedicated home server and connects to any device — desktop browser, phone, tablet — over a private network. One brain, multiple screens.

### The Layers

**Layer 1 — MVP (DONE):** Static avatar + subtitle responses + dynamic canvas on web. Text input, browser TTS, YouTube search. Proves the paradigm works.

**Layer 2 — Dedicated Server:** Persistent sessions (survive restarts), auth token, always-on process management, Tailscale for remote access. Buddy becomes a service, not a dev project.

**Layer 3 — Mobile App:** React Native app for phone/tablet. Same Buddy, same canvas, native feel. Connects to the same server over Tailscale.

**Layer 4 — Enhanced Experience:** Premium TTS, voice input, animated avatar, more server-side tools (web search, weather, calendar, smart home). Buddy gets smarter and more capable.

**Layer 5 — Multi-Device Intelligence:** Device registration, smart content routing (video to TV, quick answers to phone), cross-device session continuity, offline queue.

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

- **Subtitle stream:** The avatar's spoken words, displayed as subtitle text near the avatar. One response at a time — old subtitles vanish when new ones appear. Also spoken aloud via TTS.
- **Canvas stream:** Structured visual commands (cards, charts, tables, video, images, text blocks). Rendered on the background behind the avatar.

The user never sees a chat log. It feels like a conversation, not a document.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLIENT DEVICES                                │
│                                                                  │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐        │
│  │  Web Browser  │  │  Phone App    │  │  Tablet App   │        │
│  │  (React)      │  │  (React      │  │  (React       │        │
│  │               │  │   Native)    │  │   Native)     │        │
│  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘        │
│          │                  │                  │                 │
│          └──────────────────┼──────────────────┘                 │
│                             │                                    │
│                        WebSocket                                 │
│                      (Tailscale VPN)                             │
│                             │                                    │
└─────────────────────────────┼────────────────────────────────────┘
                              │
┌─────────────────────────────┼────────────────────────────────────┐
│                   BUDDY SERVER (Dedicated PC)                    │
│                             │                                    │
│  ┌──────────────────────────┴──────────────────────────────┐     │
│  │                                                          │     │
│  │  ┌──────────┐  ┌───────────┐  ┌────────────────────┐    │     │
│  │  │ Express  │  │  Claude   │  │   Response         │    │     │
│  │  │ /prompt  │→ │  Client   │→ │   Splitter         │    │     │
│  │  │ + Auth   │  │  (Tools)  │  │                    │    │     │
│  │  └──────────┘  │           │  │ text → subtitle WS  │    │     │
│  │                │  Session  │  │ canvas → canvas WS  │    │     │
│  │                │  (SQLite) │  └────────────────────┘    │     │
│  │                └───────────┘                            │     │
│  │                                                          │     │
│  │  ┌──────────────────────────────────────────────────┐    │     │
│  │  │  Server-Side Tools                               │    │     │
│  │  │  - YouTube search (yt-search)                    │    │     │
│  │  │  - Web search (future)                           │    │     │
│  │  │  - Weather, calendar, smart home (future)        │    │     │
│  │  └──────────────────────────────────────────────────┘    │     │
│  │                                                          │     │
│  └──────────────────────────────────────────────────────────┘     │
│                                                                   │
│  Managed by pm2 — auto-restart, log rotation, always-on          │
│  Reachable via Tailscale at 100.x.x.x:3001                      │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. User types a message on any device and hits enter.
2. Client sends the text via HTTP POST to `POST /api/prompt` (with auth token).
3. Server appends the user message to the **persistent session** (SQLite).
4. Server sends the full conversation history to Claude API with tool definitions.
5. Claude responds with a mix of tool calls and text. Server-side tools (YouTube search, etc.) execute and return real results. Canvas tools return `{ status: "rendered" }`.
6. **Response Splitter** separates the response:
   - **Canvas tool calls** → sent as `{ type: "canvas_command", command, params }` via WebSocket.
   - **Text content** → sent as `{ type: "subtitle", text: "..." }` via WebSocket.
   - Canvas commands always come BEFORE subtitle, so visuals appear before Buddy "speaks."
7. Client receives both:
   - Subtitle text replaces any previous subtitle. Avatar mouth toggles. Browser TTS speaks the text.
   - Canvas commands render on the background.
8. Server persists Claude's full response to the session. The user never sees history, but Claude has full context on every turn.

### WebSocket Protocol

All messages are JSON. This protocol is shared across all clients (web, mobile).

**Server → Client:**
```javascript
{ type: "subtitle", text: "Here's what I found..." }
{ type: "canvas_command", command: "canvas_add_card", params: { id, title, body, ... } }
{ type: "processing", status: true }   // Buddy is thinking
{ type: "processing", status: false }  // Buddy is done
```

**Client → Server (future, for voice input):**
```javascript
{ type: "prompt", text: "What's the weather like?" }
```

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Server runtime | Node.js 18+ | Async, WebSocket native |
| AI client | `@anthropic-ai/sdk` | Claude tool use |
| HTTP server | Express | Simple API layer |
| WebSocket | `ws` | Lightweight, bidirectional |
| Persistence | SQLite (better-sqlite3) | Zero-config, file-based, fast |
| Process manager | pm2 | Always-on, auto-restart, logs |
| Remote access | Tailscale | Zero-config VPN, encrypted |
| Web frontend | React 18 (Vite) | Component model, fast iteration |
| Mobile frontend | React Native (Expo) | Shared JS, native feel |
| Canvas styling | Tailwind CSS | Rapid UI |
| Charts | Recharts | React-native charting |
| State management | React Context + useReducer | Fits command pattern |
| TTS (web) | Browser Speech API | Free, no dependencies |
| YouTube search | yt-search | Real video URLs, no API key |

---

## Project Structure

```
buddy/
├── server/
│   ├── index.js                # Express + WebSocket entry point
│   ├── claude-client.js        # Claude API + tool use loop
│   ├── tools.js                # Canvas + server-side tool definitions
│   ├── response-splitter.js    # Separates subtitle text from canvas commands
│   ├── session.js              # Session management (in-memory → SQLite)
│   └── .env                    # ANTHROPIC_API_KEY, AUTH_TOKEN
├── client/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── context/
│   │   │   └── BuddyState.jsx  # Global state (canvas + subtitle + avatar)
│   │   ├── components/
│   │   │   ├── Avatar.jsx      # Avatar image + mouth toggle + subtitle + TTS
│   │   │   ├── Canvas.jsx      # Full-screen background canvas
│   │   │   ├── InputBar.jsx    # Text input
│   │   │   └── canvas-elements/
│   │   │       ├── Card.jsx
│   │   │       ├── Chart.jsx
│   │   │       ├── DataTable.jsx
│   │   │       ├── TextBlock.jsx
│   │   │       ├── VideoPlayer.jsx  # YouTube embeds + raw video
│   │   │       ├── ImageDisplay.jsx
│   │   │       └── Notification.jsx
│   │   ├── hooks/
│   │   │   └── useWebSocket.js
│   │   └── lib/
│   │       └── commandRouter.js
│   ├── index.html
│   └── vite.config.js
├── mobile/                     # Layer 3
│   ├── App.js
│   ├── src/
│   │   ├── context/            # Same state pattern as web
│   │   ├── components/         # Native equivalents
│   │   ├── hooks/
│   │   └── lib/
│   └── app.json
├── package.json
└── ecosystem.config.cjs        # pm2 config
```

---

## Layer 1 — MVP (DONE)

Everything below is implemented and working.

### What's Built
- Express + WebSocket server with Claude API integration
- Tool use loop with 12 tools (11 canvas + YouTube search)
- In-memory session with rolling conversation history
- Response splitter (canvas commands before subtitles)
- React frontend with global state (useReducer, 16 action types)
- Avatar with two-frame mouth toggle, idle bob animation
- Browser TTS synced to mouth animation
- Canvas with 5 layout modes (single, two-column, grid, dashboard, fullscreen)
- 7 canvas element components (Card, Chart, DataTable, TextBlock, VideoPlayer, ImageDisplay, Notification)
- YouTube embed support (auto-detects YouTube URLs, renders iframe)
- YouTube search tool (server-side, returns real video URLs)
- Element enter animations, subtitle fade-in, ambient gradient background
- Auto-deduplication of element IDs

### Current Limitations (addressed in later layers)
- Sessions reset on server restart (in-memory only)
- No authentication (localhost only)
- Must be on the same network
- Web only, no mobile app
- Browser TTS quality varies by OS
- No voice input

---

## Layer 2 — Dedicated Server

Make Buddy a persistent, remotely accessible service running on a dedicated PC.

### 2.1 Persistent Sessions (SQLite)

Replace in-memory session with SQLite via `better-sqlite3`.

**Changes:**
- `server/session.js` — Rewrite to use SQLite. Store messages as JSON blobs.
- Schema:
  ```sql
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY DEFAULT 'default',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT REFERENCES sessions(id),
    role TEXT NOT NULL,          -- 'user', 'assistant'
    content TEXT NOT NULL,       -- JSON string of content blocks
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  ```
- Session survives server restarts.
- `getMessages()` reconstructs the Claude messages array from DB rows.
- Add `POST /api/session/reset` endpoint to clear history and start fresh.

**Future:** Session compaction when history gets long — summarize older messages into a system message, trim the array. Keep recent messages verbatim.

### 2.2 Authentication

Simple bearer token auth. Not a user system — just a shared secret so only your devices can talk to the server.

**Changes:**
- `server/.env` — Add `AUTH_TOKEN=some-random-string`
- `server/index.js` — Middleware that checks `Authorization: Bearer <token>` on HTTP requests.
- WebSocket auth — Client sends token in the initial connection URL as query param: `ws://host:3001?token=xxx`. Server validates on `connection` event and closes unauthorized sockets.
- Client stores token (env var for web, secure storage for mobile).

### 2.3 Always-On with pm2

**Setup:**
```bash
npm install -g pm2

# ecosystem.config.cjs at project root
module.exports = {
  apps: [{
    name: 'buddy-server',
    cwd: './server',
    script: 'index.js',
    node_args: '--experimental-vm-modules',
    env: {
      NODE_ENV: 'production'
    },
    watch: false,
    max_restarts: 10,
    restart_delay: 1000
  }]
};

# Start
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup    # auto-start on boot
```

### 2.4 Tailscale for Remote Access

**Setup:**
1. Install Tailscale on the server PC and every client device.
2. All devices join the same Tailnet.
3. Server gets a stable Tailscale IP like `100.64.1.1`.
4. Clients connect to `ws://100.64.1.1:3001` instead of `localhost:3001`.
5. No port forwarding, no DNS, no TLS needed — Tailscale tunnel is already encrypted.

**Changes:**
- `client/src/hooks/useWebSocket.js` — Make the server URL configurable (env var or settings).
- `client/src/components/InputBar.jsx` — Make the API URL configurable to match.
- `server/index.js` — Update CORS to allow Tailscale IPs or use `*` with token auth.

### 2.5 Production Web Client

Build the Vite app and serve it from Express so you don't need to run two processes.

**Changes:**
- `server/index.js` — In production, serve `client/dist/` as static files.
- Add build script: `cd client && npm run build`
- pm2 manages just the one Node process which serves both API and static files.

### Layer 2 Verification

- Restart server — conversation history preserved.
- Open browser from a different device on Tailscale — connects and works.
- Kill server process — pm2 restarts it automatically.
- Send a prompt without auth token — rejected.

---

## Layer 3 — Mobile App

React Native app using Expo. Reuses the same WebSocket protocol and state management pattern.

### 3.1 Project Setup

```bash
npx create-expo-app buddy-mobile
cd buddy-mobile
npx expo install expo-secure-store expo-speech
```

### 3.2 Shared Logic

The mobile app reuses the same patterns, not the same code (React Native components are different from web):

- **State management** — Same `useReducer` with the same action types and reducer logic. Copy `BuddyState.jsx` and `commandRouter.js` directly.
- **WebSocket hook** — Same logic, connects to Tailscale IP. Store the server URL and auth token in Expo SecureStore.
- **TTS** — Use `expo-speech` instead of browser `speechSynthesis`.

### 3.3 Native Components

| Web Component | Mobile Equivalent |
|---------------|------------------|
| `Avatar.jsx` | Same concept — `Image` component with animated toggle, `Text` for subtitle |
| `Canvas.jsx` | `ScrollView` with layout logic, same element rendering |
| `InputBar.jsx` | `TextInput` with keyboard handling |
| `Card.jsx` | `View` with styled container |
| `Chart.jsx` | `react-native-chart-kit` or `victory-native` |
| `DataTable.jsx` | `FlatList` with row rendering |
| `TextBlock.jsx` | `Text` with style variants |
| `VideoPlayer.jsx` | `expo-av` Video component or `react-native-webview` for YouTube |
| `Notification.jsx` | `Animated.View` toast |

### 3.4 Mobile-Specific Considerations

- **Connection settings** — First-launch setup screen: enter Tailscale IP and auth token.
- **Background behavior** — Disconnect WebSocket when app backgrounds, reconnect on foreground.
- **Keyboard handling** — InputBar pushes content up when keyboard appears.
- **Screen sizes** — Responsive layouts. Phone uses `single` layout by default, tablet can use `two-column`.
- **Push notifications (future)** — If Buddy needs to reach you proactively.

### Layer 3 Verification

- Open web and phone simultaneously — both receive the same response.
- Send a message from phone — canvas updates on both devices.
- Switch from wifi to cell service — Tailscale reconnects, Buddy still works.
- Kill and reopen app — reconnects, previous session still there.

---

## Layer 4 — Enhanced Experience

### 4.1 Premium TTS

Replace browser Speech API with ElevenLabs or OpenAI TTS for natural-sounding voice.

**Approach:**
- Server generates audio after getting subtitle text.
- Sends audio as a binary WebSocket message or a URL to a cached audio file.
- Client plays the audio and syncs mouth animation to audio duration.
- Subtitles remain as visual fallback and accessibility.

### 4.2 Voice Input

Add a mic button for speech-to-text.

**Approach:**
- Web: `MediaRecorder` API → send audio to server → Whisper API → transcript → process as prompt.
- Mobile: `expo-av` recording → same server flow.
- Push-to-talk or voice activity detection.

### 4.3 Animated Avatar

Replace two-frame toggle with richer animations.

- Sprite sheet or Lottie animations: idle, talking, thinking, happy, concerned, surprised.
- Add avatar expression tool so Claude can set mood: `{ expression: "thinking" }`.
- Different avatar skins/characters (future customization).

### 4.4 More Server-Side Tools

| Tool | What It Does |
|------|-------------|
| `search_web` | Search the web via SerpAPI or Brave Search, return results for Claude to reference |
| `get_weather` | Fetch weather data, display as card or chart |
| `search_images` | Find images to display on canvas |
| `run_code` | Execute code snippets in a sandbox, return output |
| `read_url` | Fetch and summarize a webpage |
| `set_reminder` | Schedule a reminder (needs notification system) |
| `smart_home` | Control Home Assistant devices via API |
| `get_calendar` | Read calendar events from Google Calendar API |

Each tool follows the same pattern: defined in `tools.js`, executed server-side in the tool loop in `claude-client.js`, results returned to Claude for decision-making.

---

## Layer 5 — Multi-Device Intelligence

### 5.1 Device Registration

Devices identify themselves on WebSocket connect:
```javascript
// Client sends on connection
{ type: "register", device: { id: "matts-phone", type: "phone", name: "Matt's iPhone" } }
```

Server tracks connected devices. Claude can see what's available.

### 5.2 Smart Content Routing

The `canvas_surface_route` tool (already defined, currently a no-op) becomes active:
- Claude decides which device should show content: "This video would be better on the TV."
- Server routes canvas commands to specific devices based on device ID.
- Subtitle always goes to the device that sent the prompt.

### 5.3 Cross-Device Session Continuity

- Start a conversation on your phone, continue on desktop.
- Session is server-side, so context is always preserved.
- Canvas state can be synced — new device gets current canvas state on connect.

### 5.4 Offline Queue

When a device loses connection:
- Queue messages locally.
- Send queued prompts when reconnected.
- Server buffers responses for disconnected devices (up to a limit).

---

## Canvas Tool Reference

12 tools currently defined in `server/tools.js`.

### Display Tools
| Tool | Purpose | Required Params |
|------|---------|----------------|
| `canvas_set_mode` | Set display mode (ambient/content/media/clear) and layout | mode |
| `canvas_set_theme` | Change visual theme (light/dark, accent color, background style) | mode |
| `canvas_surface_route` | Route content to a device (no-op until Layer 5) | target |

### Content Tools
| Tool | Purpose | Required Params |
|------|---------|----------------|
| `canvas_add_card` | Add info card with title, body, color, icon | id, title, body |
| `canvas_update_card` | Update existing card fields | id |
| `canvas_remove_element` | Remove any element by ID | id |
| `canvas_show_text` | Display text block (document/note/code/quote) | id, content |
| `canvas_show_chart` | Display chart (bar/line/pie/area) | id, chart_type, title, data, data_keys |
| `canvas_show_table` | Display data table | id, title, columns, rows |
| `canvas_play_media` | Embed YouTube video, image, or GIF | id, media_type, url |
| `canvas_show_notification` | Show auto-dismiss toast | message |

### Server-Side Tools
| Tool | Purpose | Required Params |
|------|---------|----------------|
| `search_youtube` | Search YouTube, return real video URLs | query |

### Future Canvas Elements
- `canvas_show_code` — syntax-highlighted code with copy button
- `canvas_show_map` — interactive map
- `canvas_show_timeline` — chronological events
- `canvas_show_list` — interactive checklist
- `canvas_show_progress` — progress bar

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

### Install & Run (Development)

```bash
# Install
cd buddy
npm run install:all

# Start server (terminal 1)
cd server && node index.js

# Start frontend (terminal 2)
cd client && npm run dev
```

Open `http://localhost:5173`.

### Run (Production — Layer 2+)

```bash
# Build frontend
cd client && npm run build

# Start with pm2
pm2 start ecosystem.config.cjs
```

Open `http://<tailscale-ip>:3001`.

---

## Testing

### Test 1 — Simple Conversation
Type: "Hey Buddy, what's up?"
Expected: Subtitle appears with a casual greeting. Avatar mouth flaps. TTS speaks. Canvas stays ambient.

### Test 2 — Information with Canvas
Type: "What should I make for dinner tonight? I like Italian food."
Expected: Brief subtitle. Canvas shows 2-3 recipe cards.

### Test 3 — Data Display
Type: "Show me a comparison of the top 5 programming languages by popularity."
Expected: Brief subtitle. Canvas shows a bar chart and/or table.

### Test 4 — Video Search
Type: "Show me how to make bread."
Expected: Buddy searches YouTube, embeds a real working video, adds summary cards alongside.

### Test 5 — Subtitle Replacement
Type: "Tell me a fun fact." Then: "Tell me another one."
Expected: First subtitle replaced by second. No history visible.

### Test 6 — Memory Continuity
Type: "My name is Matt." Then later: "What's my name?"
Expected: Buddy responds "Matt." Rolling session history works.

### Test 7 — Canvas Clearing
Type: "Show me some dinner recipes." Then: "Let's talk about something else."
Expected: Recipe cards clear, new content appears or canvas returns to ambient.

### Test 8 — Remote Access (Layer 2)
Open Buddy from phone on cell service via Tailscale.
Expected: Connects, sends prompts, receives responses. Same as local.

### Test 9 — Multi-Device (Layer 5)
Open on two devices, send a message from one.
Expected: Both devices see the canvas update and subtitle.

---

## Key Design Decisions

**Why subtitles instead of chat?** Chat is a document format — you read a transcript. Subtitles are a presence format — you're with someone who's talking to you. One response at a time keeps the focus on the current moment and makes the canvas the star for anything detailed.

**Why a dedicated server instead of OpenClaw?** Full control over the stack. Tools, prompts, session management, and device routing are all tightly integrated. No protocol translation needed. The server is purpose-built for Buddy's two-stream output model rather than adapting to a general-purpose gateway.

**Why Tailscale instead of port forwarding?** Zero configuration, encrypted by default, no exposed ports. Works across any network (home wifi, cell, hotel, office) without DNS or TLS setup. Install and done.

**Why SQLite instead of Postgres?** Single user, single server. SQLite is zero-config, file-based, and fast enough for conversation history. No database server to maintain. The file lives right next to the app.

**Why a simple mouth toggle instead of real animation?** Old video games proved that two frames of mouth movement create the illusion of a character talking. It's charming, easy to implement, and replaceable later with Lottie animations or sprite sheets.

**Why keep rolling memory invisible?** The user experience is "conversation in the moment." Showing history turns it back into a chat app. But the AI needs continuity to be useful, so memory lives server-side.

**Why send canvas commands before subtitles?** So the visual content is already on screen when Buddy "talks about it." If Buddy says "check this out" and the chart appears at the same time or slightly before, it feels coordinated. If the chart appears after, it feels broken.

**Why server-side tools instead of Claude guessing?** Claude hallucinates URLs, outdated data, and wrong facts. Server-side tools (YouTube search, web search, APIs) return real, current data. Claude decides *what* to search for; the tool returns *what actually exists*.
