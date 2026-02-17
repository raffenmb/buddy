# Buddy — Personal AI Avatar with Dynamic Canvas

## Vision

Buddy is a personal AI assistant that lives on your devices. A small avatar character sits in the corner of your screen, talks to you through subtitles, and throws content (charts, data, images, video, text) onto the dynamic canvas behind it. No chat history. No scrolling messages. Just a character saying one thing at a time, with the background becoming whatever the AI needs it to be.

The user sees one response at a time. The AI remembers everything.

Buddy runs on a dedicated home server and connects to any device — desktop browser, phone, tablet — over a private network. One brain, multiple screens.

### The Layers

**Layer 1 — MVP (DONE):** Static avatar + subtitle responses + dynamic canvas on web. Text input, browser TTS, YouTube search. Proves the paradigm works.

**Layer 2 — Dedicated Server:** Persistent sessions (survive restarts), auth token, always-on process management, Tailscale for remote access, **multi-agent system** (agent registry, switching via dropdown, per-agent memory/identity/model). Buddy becomes a service, not a dev project.

**Layer 3 — Mobile App:** React Native app for phone/tablet. Same Buddy, same canvas, native feel. Connects to the same server over Tailscale.

**Layer 4 — Enhanced Experience:** Premium TTS with per-agent voices, voice input, animated per-agent avatars, voice-activated agent switching, more server-side tools (web search, weather, calendar, smart home). Buddy gets smarter and more capable.

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
| Canvas styling | Tailwind CSS 4 (NativeWind on mobile) | Rapid UI, cross-platform via NativeWind |
| Charts | Victory (web) / victory-native (mobile) | Same API on both platforms |
| State management | React Context + useReducer | Fits command pattern |
| TTS (web) | Browser Speech API | Free, no dependencies |
| YouTube search | yt-search | Real video URLs, no API key |

---

## Project Structure

```
buddy/
├── server/
│   ├── index.js                # Express + WebSocket entry point
│   ├── claude-client.js        # Claude API + tool use loop (per-agent model + system prompt)
│   ├── tools.js                # Canvas + server-side tool definitions (incl. remember_fact)
│   ├── response-splitter.js    # Separates subtitle text from canvas commands
│   ├── session.js              # Session management (in-memory → SQLite, per-agent history)
│   ├── agents.js               # Agent CRUD + memory operations (Layer 2)
│   ├── db.js                   # SQLite connection + schema init (Layer 2)
│   ├── sandbox/
│   │   ├── executor.js         # docker exec wrapper (execFile, no host shell)
│   │   ├── healthcheck.js      # Container status check + auto-start
│   │   ├── guards.js           # Command safety validation
│   │   ├── toolHandler.js      # Routes sandbox tool calls (shell_exec, read/write_file, etc.)
│   │   └── fileTransfer.js     # Host ↔ container file copy
│   └── .env                    # ANTHROPIC_API_KEY, AUTH_TOKEN
├── client/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── context/
│   │   │   └── BuddyState.jsx  # Global state (canvas + subtitle + avatar)
│   │   ├── components/
│   │   │   ├── TopBar.jsx      # Agent name, connection dot, theme toggle, admin gear
│   │   │   ├── Avatar.jsx      # Avatar image + mouth toggle + subtitle + TTS (JS animations)
│   │   │   ├── Canvas.jsx      # Full-screen background canvas (flexbox-only layouts)
│   │   │   ├── InputBar.jsx    # Pill-shaped input (sends agent_id with prompts)
│   │   │   ├── admin/          # Stack-nav admin dashboard
│   │   │   │   ├── AdminDashboard.jsx
│   │   │   │   ├── AgentList.jsx
│   │   │   │   ├── AgentEditor.jsx  # Button picker model selector
│   │   │   │   ├── ToolSelector.jsx  # Toggle switches (no checkboxes)
│   │   │   │   └── FileManager.jsx
│   │   │   └── canvas-elements/
│   │   │       ├── Card.jsx
│   │   │       ├── Chart.jsx     # Victory charts
│   │   │       ├── DataTable.jsx  # Flex rows (no HTML tables)
│   │   │       ├── TextBlock.jsx
│   │   │       ├── VideoPlayer.jsx  # YouTube embeds + raw video
│   │   │       ├── ImageDisplay.jsx
│   │   │       └── Notification.jsx
│   │   ├── hooks/
│   │   │   ├── useWebSocket.js
│   │   │   ├── useTheme.jsx     # Theme provider + dark mode toggle
│   │   │   └── useEntryAnimation.js  # CSS transition entry animations
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
├── Dockerfile.buddy-sandbox     # Sandbox container image
├── docker-compose.yml           # Sandbox container orchestration
├── setup.sh                     # One-time setup (deps + Docker sandbox + build + pm2)
├── package.json
└── ecosystem.config.cjs         # pm2 config
```

---

## Layer 1 — MVP (DONE)

Everything below is implemented and working.

### What's Built
- Express + WebSocket server with Claude API integration
- Tool use loop with 12 tools (11 canvas + YouTube search)
- In-memory session with rolling conversation history
- Response splitter (canvas commands before subtitles)
- React frontend with global state (useReducer, 18 action types including admin stack nav)
- Light/dark theme with Figtree font, soft pastel design system (CSS custom properties)
- Avatar with two-frame mouth toggle, JS-driven bob animation (requestAnimationFrame)
- Browser TTS synced to mouth animation
- Canvas with 5 flexbox-only layout modes (single, two-column, grid, dashboard, fullscreen)
- 7 canvas element components (Card, Chart via Victory, DataTable via flex rows, TextBlock, VideoPlayer, ImageDisplay, Notification)
- YouTube embed support (auto-detects YouTube URLs, renders iframe)
- YouTube search tool (server-side, returns real video URLs)
- Transition-based entry animations (no @keyframes), subtitle fade-in
- Auto-deduplication of element IDs
- **Cross-platform ready:** no backdrop-blur, CSS Grid, `<table>`, `<select>`, `<style>` tags, or `group-hover:` — all patterns compatible with React Native/NativeWind
- Admin dashboard with stack navigation, button picker model selector, toggle switch tool selector

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
  CREATE TABLE agents (
    id TEXT PRIMARY KEY,             -- e.g. 'buddy', 'chef', 'fitness'
    name TEXT NOT NULL,              -- Display name: 'Buddy', 'Chef Marco'
    model TEXT NOT NULL DEFAULT 'claude-sonnet-4-5-20250929',
    system_prompt TEXT NOT NULL,     -- Personality + instructions
    avatar_config TEXT,              -- JSON: { image, idleFrames, talkFrames } (Layer 4)
    voice_config TEXT,               -- JSON: { provider, voiceId, rate, pitch } (Layer 4)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE agent_memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT REFERENCES agents(id),
    key TEXT NOT NULL,               -- e.g. 'user_name', 'favorite_cuisine'
    value TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(agent_id, key)
  );
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY DEFAULT 'default',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT REFERENCES sessions(id),
    agent_id TEXT REFERENCES agents(id) DEFAULT 'buddy',
    role TEXT NOT NULL,              -- 'user', 'assistant'
    content TEXT NOT NULL,           -- JSON string of content blocks
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

### 2.6 Agent Registry

Multiple agents, each with their own personality, model, and conversation history. Agents are stored in the `agents` table (see schema in 2.1).

**Changes:**
- `server/agents.js` — New module. CRUD operations for agents: `getAgent(id)`, `listAgents()`, `createAgent({id, name, model, system_prompt})`, `updateAgent(id, fields)`, `deleteAgent(id)`.
- `server/index.js` — New API endpoints:
  - `GET /api/agents` — List all agents (id, name, model).
  - `POST /api/agents` — Create a new agent.
  - `PUT /api/agents/:id` — Update agent fields (model, system_prompt, name, etc.).
  - `DELETE /api/agents/:id` — Delete agent and its messages/memory.
- `server/claude-client.js` — Accept an `agent` object. Use `agent.model` when calling the Claude API. Prepend `agent.system_prompt` as the system message. Inject agent memories into the system prompt (e.g. "You know the following about the user: ...").
- `server/session.js` — `getMessages()` filters by `agent_id`. Each agent has its own conversation history.
- **Seed data** — On first run, create a default `buddy` agent with the current system prompt and model from `.env`.

**Agent definition example:**
```javascript
{
  id: 'chef',
  name: 'Chef Marco',
  model: 'claude-sonnet-4-5-20250929',
  system_prompt: `You are Chef Marco, a warm Italian chef who helps with cooking...
    Keep subtitle responses to 1-3 sentences. Use the canvas for recipes,
    ingredient lists, and cooking videos. You love Italian and French cuisine
    but know all styles.`
}
```

### 2.7 Agent Switching

The user can switch between agents via a frontend dropdown. The server loads the selected agent's personality, model, and history.

**Server changes:**
- `server/index.js` — `POST /api/prompt` accepts an optional `agent_id` field. Defaults to `'buddy'`.
- WebSocket protocol addition:
  ```javascript
  // Server → Client (when agent switches)
  { type: "agent_switch", agent: { id, name, avatar_config, voice_config } }
  ```
- When switching agents, the server clears the current canvas (sends `canvas_set_mode: clear`) so the new agent starts fresh.

**Client changes (already implemented):**
- `client/src/components/TopBar.jsx` — Shows current agent name and connection status. Agent switching done from admin dashboard (no `<select>` dropdown — cross-platform).
- `client/src/context/BuddyState.jsx` — `agent` in state with `SET_AGENT` action. Admin stack nav with `ADMIN_PUSH_EDITOR` / `ADMIN_POP_TO_LIST`.
- `client/src/components/InputBar.jsx` — Includes `agent_id` from state when posting to `/api/prompt`.
- `client/src/components/Avatar.jsx` — Displays the current agent's name below the avatar.

**Future (Layer 4+):** Natural language agent switching — if you say "let me talk to Chef Marco," the current agent can detect the intent and trigger a handoff via a `switch_agent` tool call. The server would process the switch and route the conversation to the new agent.

### 2.8 Agent Memory

Each agent accumulates knowledge about the user over time. Memories are key-value pairs stored in `agent_memory` and injected into the agent's system prompt on every turn.

**Changes:**
- `server/agents.js` — Add `getMemories(agentId)`, `setMemory(agentId, key, value)`, `deleteMemory(agentId, key)`.
- `server/tools.js` — New server-side tool `remember_fact`:
  ```javascript
  {
    name: 'remember_fact',
    description: 'Store a fact about the user for future conversations. Use this when the user shares a preference, name, or important detail.',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Short label, e.g. "favorite_color", "user_name"' },
        value: { type: 'string', description: 'The fact to remember' }
      },
      required: ['key', 'value']
    }
  }
  ```
- `server/claude-client.js` — Before each API call, fetch the agent's memories and append them to the system prompt:
  ```
  ## What you remember about the user:
  - user_name: Matt
  - favorite_cuisine: Italian
  - dietary_restrictions: none
  ```
- Each agent only sees its own memories, but some facts (like `user_name`) could optionally be shared across agents (future enhancement).

**API endpoints:**
- `GET /api/agents/:id/memory` — View an agent's memories (useful for debugging/admin).
- `DELETE /api/agents/:id/memory/:key` — Delete a specific memory.

### Layer 2 Verification

- Restart server — conversation history preserved.
- Open browser from a different device on Tailscale — connects and works.
- Kill server process — pm2 restarts it automatically.
- Send a prompt without auth token — rejected.
- Create a second agent — appears in dropdown, has its own personality and history.
- Switch agents via dropdown — avatar name changes, canvas clears, new agent responds in character.
- Tell Agent A your name — Agent A remembers it. Agent B does not (separate memory).
- Change an agent's model via API — next response uses the new model.

---

## Layer 3 — Mobile App

React Native app using Expo. The web client has been designed for 1:1 cross-platform parity — most component logic, state, and styling patterns carry over directly.

### 3.1 Project Setup

```bash
npx create-expo-app buddy-mobile
cd buddy-mobile
npx expo install expo-secure-store expo-speech expo-font
npm install nativewind victory-native react-native-youtube-iframe @react-navigation/native @react-navigation/native-stack
```

### 3.2 What Copies Over Directly (no changes needed)

These files use only cross-platform patterns and can be copied 1:1 from `client/src/`:

- **`context/BuddyState.jsx`** — useReducer, all action types, deduplication logic
- **`lib/commandRouter.js`** — pure JS mapping
- **`hooks/useTheme.jsx`** — ThemeProvider context (swap `localStorage` → `expo-secure-store`, `document.documentElement` → React Native `Appearance`)
- **`hooks/useEntryAnimation.js`** — swap `data-entered` CSS transitions → `Animated.Value` with `Animated.timing`

### 3.3 What Needs Thin Wrappers

The web components were designed to minimize these differences. Each needs a small platform adapter, not a rewrite:

| Web Component | Mobile Change | Effort |
|---------------|--------------|--------|
| `TopBar.jsx` | `View` + `TouchableOpacity` instead of `div` + `button` | Minimal — same layout, same icons |
| `Avatar.jsx` | `Animated.View` for bob (already uses `requestAnimationFrame`), `expo-speech` for TTS | Small — animation logic identical, TTS API swap |
| `Canvas.jsx` | `ScrollView` instead of `div` with `overflow-y-auto`, same flexbox layouts | Small — layouts are already flexbox-only |
| `InputBar.jsx` | `TextInput` instead of `input`, keyboard-aware container | Small — same pill shape, same logic |
| `Card.jsx` | `View` + `Text` instead of `div` — same inline styles | Trivial |
| `Chart.jsx` | `import from "victory-native"` instead of `"victory"` — same API | Trivial |
| `DataTable.jsx` | `View` flex rows — already flex-based, no `<table>` to replace | Trivial |
| `TextBlock.jsx` | `View` + `Text` — same style map | Trivial |
| `VideoPlayer.jsx` | `react-native-youtube-iframe` instead of `<iframe>` | Moderate — different component API |
| `ImageDisplay.jsx` | `Image` component — same props | Trivial |
| `Notification.jsx` | `Animated.View` toast — same fade logic | Small |
| `AdminDashboard.jsx` | `@react-navigation/native-stack` — already uses stack nav pattern in state | Small — swap state-based nav for native stack |
| `AgentList.jsx` | `FlatList` + `TouchableOpacity` cards — same layout | Small |
| `AgentEditor.jsx` | `ScrollView` form — button picker already used (no `<select>`) | Small |
| `ToolSelector.jsx` | Same toggle switch component — already custom (no `<input type="checkbox">`) | Trivial |
| `FileManager.jsx` | `View` rows — controls already always-visible (no `group-hover`) | Trivial |

### 3.4 What's Web-Only (needs mobile equivalent)

| Web Feature | Mobile Replacement |
|---|---|
| `window.speechSynthesis` | `expo-speech` |
| `<iframe>` YouTube embeds | `react-native-youtube-iframe` |
| Google Fonts `<link>` | `expo-font` with Figtree loaded at app start |
| Vite proxy (`/api` → localhost:3001) | Direct URL to Tailscale IP |
| `localStorage` | `expo-secure-store` |
| CSS custom properties (`var(--color-*)`) | Theme object from `useTheme` context |
| NativeWind handles Tailwind classes | Install `nativewind` + configure `babel.config.js` |

### 3.5 Mobile-Specific Considerations

- **Connection settings** — First-launch setup screen: enter Tailscale IP and auth token.
- **Background behavior** — Disconnect WebSocket when app backgrounds, reconnect on foreground.
- **Keyboard handling** — InputBar pushes content up when keyboard appears (`KeyboardAvoidingView`).
- **Screen sizes** — Phone uses `single` layout by default, tablet can use `two-column`.
- **Push notifications (future)** — If Buddy needs to reach you proactively.

### Layer 3 Verification

- Open web and phone simultaneously — both receive the same response.
- Send a message from phone — canvas updates on both devices.
- Switch from wifi to cell service — Tailscale reconnects, Buddy still works.
- Kill and reopen app — reconnects, previous session still there.
- Visual parity — light/dark themes, card shadows, chart colors, toggle switches all match the web version.

---

## Layer 4 — Enhanced Experience

### 4.1 Premium TTS (Per-Agent Voices)

Replace browser Speech API with ElevenLabs or OpenAI TTS for natural-sounding voice. Each agent can have its own voice.

**Approach:**
- Server generates audio after getting subtitle text.
- Sends audio as a binary WebSocket message or a URL to a cached audio file.
- Client plays the audio and syncs mouth animation to audio duration.
- Subtitles remain as visual fallback and accessibility.
- **Per-agent voices** — Each agent's `voice_config` (from the `agents` table, set up in 2.6) specifies which TTS provider, voice ID, rate, and pitch to use. When switching agents, the voice changes automatically. Agents without a custom voice config fall back to a default.

### 4.2 Voice Input

Add a mic button for speech-to-text.

**Approach:**
- Web: `MediaRecorder` API → send audio to server → Whisper API → transcript → process as prompt.
- Mobile: `expo-av` recording → same server flow.
- Push-to-talk or voice activity detection.

### 4.3 Animated Avatar (Per-Agent Avatars)

Replace two-frame toggle with richer animations. Each agent gets its own visual identity.

- Sprite sheet or Lottie animations: idle, talking, thinking, happy, concerned, surprised.
- Add avatar expression tool so Claude can set mood: `{ expression: "thinking" }`.
- **Per-agent avatars** — Each agent's `avatar_config` (from the `agents` table, set up in 2.6) defines its sprite sheet, idle/talk frames, and available expressions. Chef Marco might be a cartoon chef, a fitness agent might be a sporty character. When switching agents, the avatar swaps with a transition animation.
- **Agent transition** — Brief crossfade or slide animation when switching between agents so it feels intentional, not jarring.

### 4.5 Voice-Activated Agent Switching

Natural language agent handoff as an upgrade to the dropdown switcher from 2.7.

- Add a `switch_agent` tool to `tools.js` so the current agent can detect when the user wants a different agent and trigger the switch programmatically.
- System prompt instruction: "If the user asks to talk to another agent or requests a domain you don't specialize in, use the switch_agent tool."
- The switch happens seamlessly — canvas clears, new agent appears, and the new agent greets the user or picks up context.

### 4.4 On-Demand Skill Loading (Refactor)

Currently, when a custom skill is enabled for an agent, its entire SKILL.md prompt is injected into the system prompt on every turn — even if the skill isn't relevant to the current conversation. This wastes tokens and bloats context.

**Refactor:** Now that the sandbox provides `read_file`, switch to on-demand loading:
1. System prompt only includes skill **name + description** (metadata from SKILL.md frontmatter).
2. When the agent decides a skill is relevant, it uses `read_file` to load the full SKILL.md from disk.
3. The agent reads the skill instructions and follows them for that turn.

This matches Anthropic's recommended pattern for tool documentation — lightweight summaries in the system prompt, full docs loaded only when needed.

**Changes:**
- `server/claude-client.js` — In `buildSystemPrompt()`, replace full skill injection with a metadata-only section:
  ```
  ## Available Skills
  - test-greeter: Always greets the user enthusiastically when they say hello
  - recipe-helper: Helps find and format recipes from various cuisines

  To use a skill, read its full instructions with read_file at /agent/skills/<folder>/SKILL.md
  ```
- `server/skills.js` or setup — Copy/symlink skill files into the sandbox at `/agent/skills/` so the agent can access them via `read_file`.
- System prompt — Add a note explaining how to load and use skills on demand.

### 4.5 More Server-Side Tools

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
| `remember_fact` | Store a persistent fact about the user | key, value |

### Sandbox Tools (opt-in per agent, require Docker)
| Tool | Purpose | Required Params |
|------|---------|----------------|
| `shell_exec` | Run a shell command in the sandbox | command |
| `read_file` | Read a file from the sandbox | path |
| `write_file` | Write content to a file in the sandbox | path, content |
| `list_directory` | List files/directories in the sandbox | (path defaults to /agent/data) |
| `send_file` | Send a file from the sandbox to the user | path |

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
- SSH access to the dedicated server (for Layer 2+ deployment and remote development)

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

**Why cross-platform parity from the start?** Every web-only CSS feature (Grid, backdrop-blur, @keyframes, `<table>`, `<select>`) becomes a rewrite when building the mobile app. By constraining the web client to only use patterns that React Native/NativeWind supports — flexbox layouts, JS-driven animations, custom components instead of native form elements — the mobile app becomes a thin wrapper around the same logic rather than a parallel codebase. Victory charts, toggle switches, button pickers, and flex-row tables all work identically on both platforms.
