# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Buddy is a personal AI avatar interface where a small character lives in the corner of the screen, speaks through subtitles and TTS (one response at a time, no chat history), and renders dynamic visual content (charts, cards, tables, video, media) on a full-screen canvas behind it. The user sees only the current response; the server maintains full conversation history invisibly.

The roadmap lives in `buddy-implementation-plan.md`. It defines five layers:
- **Layer 1 (MVP) — DONE:** Static avatar + subtitles + dynamic canvas + browser TTS + YouTube search
- **Layer 2:** Dedicated server (SQLite persistence, auth, pm2, Tailscale)
- **Layer 3:** Mobile app (React Native / Expo)
- **Layer 4:** Enhanced experience (premium TTS, voice input, animated avatar, more tools)
- **Layer 5:** Multi-device intelligence (device routing, cross-device sessions)

## Tech Stack

- **Backend:** Node.js 18+, Express, `ws` (WebSockets), `@anthropic-ai/sdk`, `yt-search`
- **Frontend:** React 18 with Vite, Tailwind CSS, Recharts
- **State:** React Context + useReducer (command/reducer pattern)
- **TTS:** Browser Speech API (to be replaced with ElevenLabs/OpenAI in Layer 4)
- **No TypeScript** — vanilla JS (.jsx/.js files)

## Commands

```bash
# Install dependencies
npm run install:all

# Start backend (port 3001)
cd server && node index.js

# Start frontend dev server (port 5173, separate terminal)
cd client && npm run dev
```

No automated test framework is configured. Testing is manual (see test scenarios in the implementation plan).

## Architecture

**Two output streams** from every AI response:
1. **Subtitle** — short conversational text displayed next to the avatar (replaces previous), spoken aloud via TTS
2. **Canvas commands** — structured tool calls that render visual elements on the background

**Data flow:**
1. User types → `POST /api/prompt` → server appends to session history
2. Server calls Claude API with full history + 12 tool definitions (11 canvas + YouTube search)
3. Tool use loop runs until `stop_reason === "end_turn"`. Server-side tools (YouTube search) execute and return real data. Canvas tools return `{ status: "rendered" }`.
4. Response Splitter separates tool calls (canvas) from text (subtitle)
5. Canvas commands broadcast via WebSocket **first**, then subtitle — so visuals appear before Buddy "speaks"
6. Frontend CommandRouter maps `canvas_*` commands → reducer actions → component re-renders

**Key server modules:**
- `server/index.js` — Express + WebSocket entry point
- `server/claude-client.js` — Claude API integration with tool use loop + YouTube search execution
- `server/tools.js` — Canvas + server-side tool definitions (12 tools)
- `server/response-splitter.js` — Separates subtitle text from canvas commands
- `server/session.js` — In-memory conversation history (SQLite in Layer 2)

**Key client modules:**
- `client/src/context/BuddyState.jsx` — Global state (useReducer): avatar, subtitle, canvas, input, connection. Includes element ID deduplication.
- `client/src/components/Avatar.jsx` — Fixed bottom-left, two-frame mouth toggle (150ms interval), subtitle display, browser TTS synced to speech end event
- `client/src/components/Canvas.jsx` — Fixed scrollable region with modes: ambient, content, media, clear. 5 layout modes.
- `client/src/components/InputBar.jsx` — Text input, POST on enter, disabled while processing
- `client/src/hooks/useWebSocket.js` — WS connection, message routing, reconnect with exponential backoff
- `client/src/lib/commandRouter.js` — Maps canvas command names to reducer action types
- `client/src/components/canvas-elements/` — 7 components: Card, Chart (Recharts), DataTable, TextBlock, VideoPlayer (YouTube embed), ImageDisplay, Notification

## Environment

Server requires `server/.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
PORT=3001
CLAUDE_MODEL=claude-sonnet-4-5-20250929
```

## Key Design Constraints

- **Canvas commands before subtitles** — visuals must appear before Buddy "speaks" about them
- **Canvas tool results return `{ status: "rendered" }`** — display-only. Server-side tools (search_youtube) return real data.
- **TTS synced to speech** — mouth animation stops on `speechSynthesis.onend`, with fallback timer
- **Single session, in-memory** — resets on server restart (SQLite persistence is Layer 2)
- **Subtitle replaces previous** — never accumulate; old subtitle clears when user sends a new message
- **Canvas element IDs auto-deduplicated** — reducer appends `-2`, `-3` etc. on collision
- **System prompt instructs Buddy** to keep subtitles to 1-3 sentences, use canvas for detailed content, search YouTube for real URLs instead of guessing
