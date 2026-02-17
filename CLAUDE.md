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
- **Frontend:** React 18 with Vite, Tailwind CSS 4, Victory (charts)
- **State:** React Context + useReducer (command/reducer pattern)
- **TTS:** Browser Speech API (to be replaced with ElevenLabs/OpenAI in Layer 4)
- **Theme:** Light mode default with dark mode toggle (Figtree font, pastel/soft design system)
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
2. Server calls Claude API with full history + tool definitions (10 canvas always-on + toggleable non-canvas tools)
3. Tool use loop runs until `stop_reason === "end_turn"`. Server-side tools (YouTube search, remember_fact) execute and return real data. Canvas tools return `{ status: "rendered" }`.
4. Response Splitter separates tool calls (canvas) from text (subtitle)
5. Canvas commands broadcast via WebSocket **first**, then subtitle — so visuals appear before Buddy "speaks"
6. Frontend CommandRouter maps `canvas_*` commands → reducer actions → component re-renders

**Key server modules:**
- `server/index.js` — Express + WebSocket entry point
- `server/claude-client.js` — Claude API integration with tool use loop + YouTube search execution
- `server/tools.js` — Canvas + server-side tool definitions (10 canvas + 2 non-canvas)
- `server/response-splitter.js` — Separates subtitle text from canvas commands
- `server/session.js` — In-memory conversation history (SQLite in Layer 2)

**Key client modules:**
- `client/src/context/BuddyState.jsx` — Global state (useReducer): avatar, subtitle, canvas, input, connection, admin stack nav. Includes element ID deduplication.
- `client/src/components/TopBar.jsx` — Agent name, connection dot, theme toggle, admin gear button
- `client/src/components/Avatar.jsx` — Bottom-left, two-frame mouth toggle (150ms interval), JS-driven bob animation (requestAnimationFrame), subtitle display, browser TTS
- `client/src/components/Canvas.jsx` — Scrollable region with modes: ambient, content, media, clear. 5 flexbox-only layouts.
- `client/src/components/InputBar.jsx` — Pill-shaped input with circular send button
- `client/src/hooks/useWebSocket.js` — WS connection, message routing, reconnect with exponential backoff
- `client/src/hooks/useTheme.jsx` — ThemeProvider + useTheme hook, dark mode toggle, persists to localStorage
- `client/src/hooks/useEntryAnimation.js` — CSS transition entry animations (replaces @keyframes)
- `client/src/lib/commandRouter.js` — Maps canvas command names to reducer action types
- `client/src/components/canvas-elements/` — 7 components: Card, Chart (Victory), DataTable (flex rows), TextBlock, VideoPlayer (YouTube embed), ImageDisplay, Notification
- `client/src/components/admin/` — Stack-nav admin: AdminDashboard, AgentList, AgentEditor (button picker model selector), ToolSelector (toggle switches for non-canvas tools only)

**Custom Skills:**
- `server/skills/` — Directory for custom skill folders (each contains `SKILL.md` with YAML frontmatter)
- `server/skills.js` — Scans, validates, and manages custom skills (CRUD + YAML frontmatter parsing)
- Skills use Claude Code's `SKILL.md` format: YAML frontmatter with `name:` and `description:`, followed by a markdown prompt
- `enabled_tools` on each agent holds both built-in tool names and skill folder names
- `null` = all built-in tools ON, custom skills OFF. Explicit array = only listed items ON.
- **Current state:** Full skill prompts injected into system prompt (temporary, token-inefficient)
- **Planned refactor:** Once terminal execution is built, switch to on-demand loading — only name/description in system prompt, agent reads full SKILL.md via bash tool when relevant (matches Anthropic's recommended pattern, see design doc)

## Environment

Server requires `server/.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
PORT=3001
CLAUDE_MODEL=claude-sonnet-4-5-20250929
```

## Key Design Constraints

- **Canvas commands before subtitles** — visuals must appear before Buddy "speaks" about them
- **Canvas tools always sent to API** — not toggleable in admin. Non-canvas tools (search_youtube, remember_fact) are toggleable per agent.
- **Canvas tool results return `{ status: "rendered" }`** — display-only. Server-side tools (search_youtube, remember_fact) return real data.
- **TTS synced to speech** — mouth animation stops on `speechSynthesis.onend`, with fallback timer
- **Single session, in-memory** — resets on server restart (SQLite persistence is Layer 2)
- **Subtitle replaces previous** — never accumulate; old subtitle clears when user sends a new message
- **Canvas element IDs auto-deduplicated** — reducer appends `-2`, `-3` etc. on collision
- **System prompt instructs Buddy** to keep subtitles to 1-3 sentences, use canvas for detailed content, search YouTube for real URLs instead of guessing

## Cross-Platform Parity Rule

**All new frontend code must be written for 1:1 web/mobile parity.** The web client (`client/`) and future React Native app (`mobile/`) should share as much logic as possible and use only patterns that work on both platforms.

**Allowed:**
- Flexbox for all layout (`flex`, `flex-row`, `flex-col`, `flex-wrap`) — React Native's only layout engine
- Inline `style={{}}` for dynamic values, CSS custom properties via `var()` for theming
- JS-driven animations (`requestAnimationFrame`, `setInterval`, state-based) — maps to React Native `Animated`
- Victory charts (`victory` on web, `victory-native` on mobile)
- Custom button/toggle components instead of native form elements
- `rounded-*`, `text-*`, `font-*`, `p-*`, `m-*`, `gap-*` Tailwind utilities (NativeWind compatible)

**Banned (do not introduce):**
- `backdrop-blur` — not supported in React Native
- CSS Grid (`grid-cols-*`, `grid-rows-*`) — use flexbox with `flex-wrap` instead
- `@keyframes` / CSS animations — use JS-driven animations instead
- `<style>` tags in JSX — use Tailwind classes or inline styles
- `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<td>`, `<th>` — use flex rows instead
- `<select>`, `<option>` — use custom button pickers
- `<input type="checkbox">` — use custom toggle switch components
- `group-hover:` — not supported in React Native; use always-visible controls
- `hover:` as primary interaction — use `active:` states; `hover:` only as progressive enhancement
- `position: fixed` — use flex column layout with absolute positioning within containers

**Known web-only divergences (documented, acceptable):**
- `<iframe>` for YouTube embeds — will use `react-native-youtube-iframe` on mobile
- `window.speechSynthesis` — will use `expo-speech` on mobile
- Vite proxy for `/api` — mobile will connect directly to server URL
- Google Fonts `<link>` — mobile will use `expo-font`
- Skill folder upload (drag-drop, directory picker, `webkitdirectory`) — **desktop-only feature**. Users won't build/share skill folders from a phone. Future mobile path: a skill marketplace where users browse and enable pre-built skills.

**Cross-platform alert/confirm:**
- Never use browser `alert()` or `confirm()` — use `useAlert()` hook from `components/AlertModal.jsx`
- `showAlert(message)` replaces `alert()`, `showConfirm(message)` replaces `confirm()` (returns a promise resolving to `true`/`false`)
- Renders a themed flexbox modal that works identically on web and React Native
