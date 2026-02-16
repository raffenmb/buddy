# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Buddy is an AI avatar interface where a small character lives in the corner of the screen, speaks through subtitles (one response at a time, no chat history), and renders dynamic visual content (charts, cards, tables, media) on a full-screen canvas behind it. The user sees only the current response; the server maintains full conversation history invisibly.

The spec lives in `buddy-implementation-plan.md`. It defines three layers — only **Layer 1 (MVP)** is in scope: static avatar + subtitles + dynamic canvas, text input only, no TTS/voice.

## Tech Stack

- **Backend:** Node.js 18+, Express, `ws` (WebSockets), `@anthropic-ai/sdk`
- **Frontend:** React 18 with Vite, Tailwind CSS, Recharts
- **State:** React Context + useReducer (command/reducer pattern)
- **No TypeScript** — vanilla JS (.jsx/.js files)

## Commands

```bash
# Install dependencies
npm install

# Start backend (port 3001)
cd server && node index.js

# Start frontend dev server (port 5173, separate terminal)
cd client && npm run dev
```

No automated test framework is configured. Testing is manual (see test scenarios in the implementation plan).

## Architecture

**Two output streams** from every AI response:
1. **Subtitle** — short conversational text displayed next to the avatar (replaces previous)
2. **Canvas commands** — structured tool calls that render visual elements on the background

**Data flow:**
1. User types → `POST /api/prompt` → server appends to session history
2. Server calls Claude API with full history + 11 canvas tool definitions
3. Tool use loop runs until `stop_reason === "end_turn"`
4. Response Splitter separates tool calls (canvas) from text (subtitle)
5. Canvas commands broadcast via WebSocket **first**, then subtitle — so visuals appear before Buddy "speaks"
6. Frontend CommandRouter maps `canvas_*` commands → reducer actions → component re-renders

**Key server modules:**
- `server/index.js` — Express + WebSocket entry point
- `server/claude-client.js` — Claude API integration with tool use loop
- `server/tools.js` — Canvas tool definitions (11 tools)
- `server/response-splitter.js` — Separates subtitle text from canvas commands
- `server/session.js` — In-memory conversation history (rolling memory)

**Key client modules:**
- `client/src/context/BuddyState.jsx` — Global state (useReducer): avatar, subtitle, canvas, input, connection
- `client/src/components/Avatar.jsx` — Fixed bottom-left, two-frame mouth toggle animation (idle/talking PNGs, 150ms interval), subtitle display
- `client/src/components/Canvas.jsx` — Full-screen background with modes: ambient, content, media, clear
- `client/src/components/InputBar.jsx` — Text input, POST on enter, disabled while processing
- `client/src/hooks/useWebSocket.js` — WS connection, message routing, reconnect with backoff
- `client/src/lib/commandRouter.js` — Maps canvas command names to reducer action types

## Environment

Server requires `server/.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
PORT=3001
CLAUDE_MODEL=claude-sonnet-4-5-20250929
```

## Key Design Constraints

- **Canvas commands before subtitles** — visuals must appear before Buddy "speaks" about them
- **All canvas tool results return `{ status: "rendered" }`** — tools are display-only
- **Talk duration from text length** — `Math.min(Math.max(text.length / 15 * 1000, 1000), 10000)` ms
- **Single session, in-memory** — resets on server restart (persistence is Layer 2)
- **Subtitle replaces previous** — never accumulate; old subtitle clears when user sends a new message
- **Canvas element IDs must be unique and descriptive**
- **System prompt instructs Buddy** to keep subtitles to 1-3 sentences and use canvas for detailed content
