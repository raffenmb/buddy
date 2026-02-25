# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Vision

Buddy is a **trusted personal AI agent** that runs 24/7 on a dedicated always-on home PC. It has full host access — it can run any command, read/write any file, manage background processes, create its own skills, and spawn sub-agents to delegate complex work. The user interacts with Buddy through a conversational web interface with a small avatar character, subtitles, TTS, and a full-screen canvas for rich visual content.

**The agent IS the interface.** Creating tools, managing skills, viewing processes, administering the system — all done by asking Buddy. The admin UI is minimal (agent list, basic settings, skill upload). Everything else happens through conversation.

**Key principles:**
- **Full host access** — Buddy can do anything the user can do in a terminal, with a confirmation gate for destructive operations
- **Self-evolving** — Buddy creates and modifies its own skills, builds sub-agent templates, and extends its capabilities over time
- **Conversation-first** — the agent manages itself through conversation, not through admin panels
- **Skills as the single extensibility layer** — no separate "tool registry." Built-in tools are platform primitives; everything else is a skill (SKILL.md + optional scripts)
- **Anthropic-only** — Buddy uses only Anthropic Claude models. Setup requires only an Anthropic API key. This lets us use Anthropic-specific features (prompt caching, tool cache, output summarization via Haiku, etc.) without cross-provider compatibility concerns. Multi-provider support may come later, but is not a current design goal.

## Tech Stack

- **Backend:** Node.js 18+, Express, `ws` (WebSockets), `@anthropic-ai/sdk`, `@anthropic-ai/claude-agent-sdk`, `yt-search`, `puppeteer`
- **Frontend:** React 18 with Vite, Tailwind CSS 4, Victory (charts)
- **Database:** SQLite via `better-sqlite3` at `~/.buddy/buddy.db`
- **State:** React Context + useReducer (command/reducer pattern)
- **TTS:** ElevenLabs API (server-side streaming via WebSocket) with browser Speech API fallback
- **Theme:** Light mode default with dark mode toggle (Figtree font, pastel/soft design system)
- **No TypeScript** — vanilla JS (.jsx/.js files)

## Commands

```bash
# Install dependencies
npm run install:all

# Development (local machine)
cd server && node index.js        # Backend (port 3001)
cd client && npm run dev           # Frontend dev server (port 5173)

# Production deployment (VPS)
sudo bash setup.sh                 # One-command install as non-root buddy user
```

No automated test framework is configured. Testing is manual.

## Architecture

### Server-as-OS Model

The server provides **platform primitives** (built-in tools) that give Buddy full control of the host machine. Skills are the single extensibility layer built on top of these primitives.

**Platform primitives (always available, not toggleable):**

| Tool | Purpose |
|------|---------|
| `shell_exec` | Run any command on the host |
| `read_file` | Read any file |
| `write_file` | Write files (dev mode: restricted to `~/.buddy/` and `/tmp/`) |
| `list_directory` | List directory contents |
| `process_start` | Launch a long-lived background process |
| `process_stop` | Stop a managed process (SIGTERM, then SIGKILL after 5s) |
| `process_status` | Check status of managed processes |
| `process_logs` | Tail stdout/stderr logs from managed processes |
| `spawn_agent` | Delegate a task to an independent sub-agent worker |
| `create_agent_template` | Define reusable sub-agent configurations |
| `create_schedule` | Create one-shot or recurring scheduled events |
| `list_schedules` | List a user's scheduled events |
| `delete_schedule` | Remove a scheduled event |
| `workspace_list` | List items in the agent's shared workspace |
| `workspace_read` | Read a workspace item by key |
| `workspace_write` | Create/update a workspace item |
| `workspace_delete` | Delete a workspace item |
| `workspace_publish` | Copy an item to a shared agent's workspace |
| `memory_save` | Save a fact to long-term memory |
| `memory_search` | Search memories by keyword |
| `memory_list` | List all memory keys |
| `memory_delete` | Delete a memory by key |
| `browser_open` | Open a URL in headless browser |
| `browser_snapshot` | Get accessibility tree of current page |
| `browser_screenshot` | Take a PNG screenshot |
| `browser_click` | Click an element by selector or text |
| `browser_type` | Type text into a field |
| `browser_navigate` | Navigate to a different URL |
| `browser_close` | Close the browser |

**Skills (per agent via admin UI):**
- Default skills seeded from `server/default-skills/` on first run (e.g. `search-youtube`, `remember-fact`)
- User-installed skills from `~/.buddy/skills/`

### Two Output Streams

Every AI response produces:
1. **Subtitle** — short conversational text displayed next to the avatar (replaces previous), spoken aloud via TTS
2. **Canvas commands** — structured tool calls that render visual elements on the background

### Data Flow

1. User types -> `POST /api/prompt` -> server appends to session history
2. Server calls Claude API with full history + tool definitions (14 canvas + 18 platform, always on) + skill metadata in system prompt
3. Tool use loop runs until `stop_reason === "end_turn"`. Platform tools execute on the host. Canvas tools return `{ status: "rendered" }`.
4. Response Splitter separates tool calls (canvas) from text (subtitle)
5. Canvas commands broadcast via WebSocket **first**, then subtitle — so visuals appear before Buddy "speaks"
6. Frontend CommandRouter maps `canvas_*` commands -> reducer actions -> component re-renders

### Confirmation Gate

Destructive commands (rm -rf, disk operations, service management, etc.) trigger an interactive **ActionConfirm** canvas element:

1. Agent calls `shell_exec` with a command matching a guard pattern in `~/.buddy/config/guards.json`
2. Server pauses execution, sends `canvas_show_confirmation` to frontend
3. ActionConfirm card appears on canvas with command, reason, and Approve/Deny buttons
4. User clicks -> frontend sends `confirm_response` via WebSocket
5. Server executes or rejects the command
6. Card updates to show outcome (stays visible as audit record)

Timeout: 60 seconds, auto-denied. Guard patterns are editable by the agent (but editing guards itself triggers confirmation).

### Form Gate

`canvas_show_form` uses the same blocking pattern as the confirmation gate. The tool-use loop pauses while the form is displayed, and resumes when the user submits (or after a 5-minute timeout). The submitted data is returned as the tool result so the agent can act on it. Forms are ephemeral — not persisted to canvas state.

### Output Summarization

Long command output (>200 lines) is summarized by Haiku before returning to Claude, saving tokens. Full output is always saved to `~/.buddy/logs/exec-<id>.log` — Claude can `read_file` on the log if the summary isn't enough. Short output (<200 lines) passes through directly.

### Sub-Agent Model

The main agent is always the face of the conversation. Sub-agents are invisible workers powered by the Claude Agent SDK:
- Main agent delegates via `spawn_agent` tool
- `spawnSubAgent()` calls the Agent SDK's `query()` async generator in-process (no child process fork)
- Sub-agents run with `bypassPermissions` mode and get coding tools: Read, Write, Edit, Bash, Glob, Grep
- Default model is Haiku for speed/cost efficiency
- Results returned to main agent (summarized by Haiku if large)
- Reusable templates stored in SQLite `agent_templates` table

### Agent Workspaces

Agents share data through workspaces — a key-value store in SQLite (`workspace_items` table).

- **Private agents** share a user-scoped workspace (`user-<userId>`). All of a user's personal agents can read/write the same items.
- **Shared agents** get an isolated workspace (`agent-<agentId>`). Cannot see into any user's private workspace.
- **Publishing:** Private agents can explicitly copy items into a shared agent's workspace (one-way). This is the only cross-boundary data flow.
- **Discovery:** Agents use `workspace_list` to see what's available — no injection into system prompt.

### Skills (Single Extensibility Layer)

Skills live at `~/.buddy/skills/`. Each skill is a folder:

```
check-weather/
  SKILL.md              # YAML frontmatter (name, description) + prompt instructions
  scripts/
    get_weather.py      # Bundled script, executed via shell_exec
```

**Progressive disclosure (on-demand loading):**
1. System prompt lists only name + description for each enabled skill
2. Agent reads full SKILL.md via `read_file` when it decides a skill is relevant
3. Agent runs bundled scripts via `shell_exec`

**Two creation paths:**
- User uploads via admin UI -> validated -> written to `~/.buddy/skills/`
- Agent creates via `write_file` -> server detects on next prompt scan

### Environment Modes

```
BUDDY_ENV=development   # Laptop — writes restricted to ~/.buddy/ and /tmp/
BUDDY_ENV=production    # VPS/home PC — scoped to buddy user's permissions
```

| Behavior | development | production |
|----------|-------------|------------|
| Shell commands | Scoped to `~/.buddy/` and `/tmp/` | Full access within buddy user's permissions |
| Filesystem writes | Only `~/.buddy/` and `/tmp/` | Anywhere buddy user can write |
| Filesystem reads | Anywhere user can read | Anywhere buddy user can read |
| Destructive gate | All commands require confirmation | Only pattern-matched |
| Process management | Only agent-started processes | Full access (buddy user's processes) |
| Privilege escalation | Blocked (sudo, su, etc.) | Blocked (buddy user has no sudo) |

## Data Layout

```
~/.buddy/
  config/
    guards.json              # Destructive command patterns
  skills/
    <skill-folder>/
      SKILL.md
      scripts/
  agents/
    <agent-id>/
      identity.md            # Personality
      user.md                # User context
  processes/
    proc-<id>/
      meta.json              # Command, PID, status, startTime
      stdout.log
      stderr.log
  logs/
    exec-<id>.log            # Full output from summarized commands
  shared/
    <files for user download>
  buddy.db                   # SQLite
```

**SQLite tables:**

| Table | Purpose |
|-------|---------|
| `agents` | Agent configs (model, system_prompt, avatar, voice, enabled_tools, is_shared) |
| `agent_users` | Many-to-many shared agent membership (agent_id, user_id) |
| `agent_memory` | Per-agent key-value memory |
| `sessions` | Conversation sessions |
| `messages` | Session message history |
| `agent_templates` | Reusable sub-agent configurations (name, system_prompt, allowed_tools, max_turns) |
| `schedules` | Timed events (one-shot reminders, recurring tasks) |
| `pending_messages` | Queued responses for offline users from scheduled events |

## Key Server Modules

- `server/config.js` — BUDDY_HOME (`~/.buddy`), ENV, DIRS, GUARDS_PATH. Creates all directories and default config on first import. Every module imports paths from here.
- `server/index.js` — Express + WebSocket entry point, confirmation gate, static file route (`/files` -> `~/.buddy/shared/`)
- `server/claude-client.js` — Claude API integration with tool use loop, platform tool handlers, output summarization
- `server/tools.js` — Tool definitions (14 canvas + 18 platform). Exports `PLATFORM_TOOL_NAMES`.
- `server/response-splitter.js` — Separates subtitle text from canvas commands
- `server/db.js` — SQLite setup at `~/.buddy/buddy.db`, schema migrations
- `server/agents.js` — Agent CRUD, reads identity/user markdown from `~/.buddy/agents/`. Buddy defaults to `["search-youtube", "remember-fact"]` enabled skills. Shared agents use `is_shared` flag + `agent_users` junction table for many-to-many membership. Includes startup migration to rename old tool names and remove platform tools from enabled_tools.
- `server/skills.js` — Skill scanning, validation, CRUD at `~/.buddy/skills/`
- `server/session.js` — Conversation history management with token-budgeted sliding window. Canvas state persistence (server-side tracking of current canvas elements).
- `server/shell/executor.js` — Host command execution via `child_process.spawn`, guard validation, confirmation callback
- `server/shell/guards.js` — Destructive command detection (hard-blocked, needs-confirmation, dev-mode restrictions)
- `server/shell/filesystem.js` — Host filesystem operations (readFile, writeFile, listDirectory), dev-mode write restrictions
- `server/shell/processManager.js` — Long-lived background process lifecycle (start, stop, status, logs) at `~/.buddy/processes/`
- `server/shell/summarizer.js` — Haiku-based output summarization for long command output, log file storage
- `server/subagent/spawner.js` — Sub-agent template CRUD + `spawnSubAgent()` (calls Agent SDK `query()`, returns result)
- `server/scheduler.js` — In-process scheduler: 30s polling loop, schedule CRUD, processPrompt trigger, offline message queuing and delivery
- `server/tts.js` — ElevenLabs TTS service: availability check, voice listing, streaming speech. Calls ElevenLabs HTTP streaming endpoint, returns readable stream of MP3 chunks. Auto-disables for 5 minutes on auth failure.

## Key Client Modules

- `client/src/context/BuddyState.jsx` — Global state (useReducer): avatar, subtitle, canvas, input, connection, admin stack nav. Includes element ID deduplication and shared wsRef.
- `client/src/components/TopBar.jsx` — Agent name, connection dot, theme toggle, gear button (visible to all users, not just admins)
- `client/src/components/Avatar.jsx` — Bottom-left, two-frame mouth toggle (150ms interval), JS-driven bob animation (requestAnimationFrame), subtitle display, browser TTS
- `client/src/components/Canvas.jsx` — Scrollable region with modes: ambient, content, media, clear. 5 flexbox-only layouts.
- `client/src/components/InputBar.jsx` — Pill-shaped input with circular send button
- `client/src/hooks/useWebSocket.js` — WS connection, message routing, reconnect with exponential backoff. Uses shared wsRef from context.
- `client/src/hooks/useTheme.jsx` — ThemeProvider + useTheme hook, dark mode toggle, persists to localStorage
- `client/src/hooks/useEntryAnimation.js` — CSS transition entry animations (replaces @keyframes)
- `client/src/hooks/useAudioPlayer.js` — Audio playback hook: listens for TTS WebSocket events (tts_start, binary chunks, tts_end, tts_fallback), accumulates MP3 chunks, decodes via AudioContext, plays. Falls back to browser speechSynthesis. Cancels on new input.
- `client/src/lib/commandRouter.js` — Maps canvas command names to reducer action types (including `canvas_show_confirmation`)
- `client/src/components/canvas-elements/` — 11 components: Card, Chart (Victory), DataTable (flex rows), TextBlock, VideoPlayer (YouTube embed), Notification, **ActionConfirm** (interactive destructive command confirmation), ProgressBar, Timer, **Checklist** (interactive, syncs via WebSocket), **FormInput** (interactive, blocks tool loop like ActionConfirm)
- `client/src/components/admin/` — Stack-nav admin: AdminDashboard, AgentList (personal + shared agent creation), AgentEditor (button picker model selector, leave/delete for shared agents), ToolSelector (toggle switches for installed skills only). All users see AgentList; only admins see UserList.

## Environment

Server requires `server/.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
PORT=3001
CLAUDE_MODEL=claude-sonnet-4-5-20250929
BUDDY_ENV=development
```

`BUDDY_ENV` defaults to `development` if not set. Set to `production` on the always-on home PC for full host access.

## Key Design Constraints

- **Canvas commands before subtitles** — visuals must appear before Buddy "speaks" about them
- **Canvas tools always sent to API** — not toggleable in admin. Platform tools also always available.
- **Canvas tool results return `{ status: "rendered" }`** — display-only. Platform tools return real data.
- **TTS synced to speech** — mouth animation stops on `speechSynthesis.onend`, with fallback timer
- **Subtitle replaces previous** — never accumulate; old subtitle clears when user sends a new message
- **Canvas element IDs auto-deduplicated** — reducer appends `-2`, `-3` etc. on collision
- **System prompt instructs Buddy** to keep subtitles to 1-3 sentences, use canvas for detailed content, search YouTube for real URLs instead of guessing
- **Conversation-first administration** — the agent manages skills, processes, and system config through conversation. Admin UI is for basic settings only.
- **Skills are the single extensibility layer** — no separate tool registry. Built-in tools are platform primitives. Everything the agent builds on top is a skill.
- **On-demand skill loading** — only name/description in system prompt. Agent reads full SKILL.md via `read_file` when relevant (Anthropic's recommended pattern).
- **All user data lives in `~/.buddy/`** — decoupled from the codebase. Skills, agents, processes, logs, shared files, database, and config all live outside the repo.
- **Sliding message window** — `getMessages()` returns only recent messages within a ~120K token budget. Old messages stay in SQLite but aren't sent to Claude. Query uses `LIMIT 200 ORDER BY id DESC` for O(1) performance regardless of table size.
- **Server-side canvas state** — canvas elements are tracked in the `sessions.canvas_state` column. Injected into the system prompt so Claude always knows what's on screen. Canvas persists across page refreshes and survives beyond the message window. Confirmation and form elements are excluded (ephemeral, timeout-based). Checklist toggle state syncs via silent WebSocket updates (no agent interruption).

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
- `window.speechSynthesis` (native fallback) — will use `expo-speech` on mobile
- `AudioContext.decodeAudioData` (ElevenLabs playback) — will use `expo-av` on mobile
- Vite proxy for `/api` — mobile will connect directly to server URL
- Google Fonts `<link>` — mobile will use `expo-font`
- Skill folder upload (drag-drop, directory picker, `webkitdirectory`) — **desktop-only feature**. Users won't build/share skill folders from a phone.

**Cross-platform alert/confirm:**
- Never use browser `alert()` or `confirm()` — use `useAlert()` hook from `components/AlertModal.jsx`
- `showAlert(message)` replaces `alert()`, `showConfirm(message)` replaces `confirm()` (returns a promise resolving to `true`/`false`)
- Renders a themed flexbox modal that works identically on web and React Native
- Note: ActionConfirm (canvas-based confirmation for destructive commands) is separate from AlertModal (general-purpose modal)

## Design Documents

- `docs/plans/2026-02-18-server-as-os-redesign.md` — Full design document for the Server-as-OS architecture
- `docs/plans/2026-02-18-server-as-os-implementation.md` — 25-task implementation plan (7 phases)
