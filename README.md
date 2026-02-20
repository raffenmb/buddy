# Buddy

A personal AI agent that runs 24/7 on your home PC. Full host access, conversational interface, and an extensible skills system — all powered by Claude.

Buddy lives on a dedicated always-on machine and gives you a single place to manage your digital life through conversation. Ask it to run commands, manage background processes, search YouTube, remember things about you, schedule recurring tasks, and delegate complex work to sub-agents. The web interface features a small animated avatar, real-time subtitles with text-to-speech, and a full-screen canvas for rich visual content like charts, tables, cards, and media.

## Features

### Conversational Interface
Every interaction happens through natural conversation. Buddy responds with short spoken subtitles (1-3 sentences) displayed next to an animated avatar, while detailed content appears on a full-screen canvas behind it. The avatar has idle and talking animations with a bobbing motion, and speaks responses aloud using text-to-speech.

### Full Host Access
Buddy can do anything you can do in a terminal. Run shell commands, read and write files anywhere on disk, install packages, manage services, and interact with APIs. A safety layer automatically intercepts dangerous commands (recursive delete, disk formatting, piping to shell, etc.) and shows an interactive confirmation card so you can approve or deny before anything executes.

### Rich Canvas Display
Detailed content renders on a background canvas with multiple layout modes. Buddy can display:
- **Cards** with titles, icons, and markdown content
- **Charts** — bar, line, pie, and area (powered by Victory)
- **Data tables** with headers and rows
- **Text blocks** in document, note, code, or quote styles
- **YouTube videos** embedded directly
- **Images** from any URL
- **Toast notifications** for quick status updates

Canvas state persists across page refreshes and is tracked server-side so Buddy always knows what's currently on screen.

### Skills System
Skills are the single extensibility layer. Each skill is a folder with a `SKILL.md` file (YAML frontmatter + instructions) and optional bundled scripts. Only skill names and descriptions are loaded into the system prompt — Buddy reads the full instructions on-demand when a skill is relevant.

Two default skills are included:
- **Remember Facts** — stores personal info (name, preferences, job) across conversations using a Python script backed by SQLite
- **YouTube Search** — finds real video URLs via `yt-search` so Buddy never guesses links

You can create new skills two ways: upload a folder through the admin UI, or ask Buddy to write one for you. Skills can include scripts in any language — Buddy runs them via `shell_exec`.

### Sub-Agent Delegation
For complex multi-step tasks (codebase refactors, extended research, multi-file edits), Buddy can spawn invisible worker agents powered by the Claude Agent SDK. Sub-agents run in-process with full coding tools (file read/write/edit, bash, glob, grep) and return a summary when finished. You can save reusable agent templates with custom system prompts and tool configurations.

### Scheduling
Create one-shot reminders or recurring tasks with standard cron expressions. When a schedule fires, Buddy processes the prompt as if you asked it directly. If you're offline, responses queue up and deliver when you reconnect. Common patterns:
- `0 9 * * *` — every day at 9am
- `30 8 * * 1-5` — weekdays at 8:30am
- `0 17 * * 1` — every Monday at 5pm

### Background Process Management
Start, stop, and monitor long-running processes (dev servers, file watchers, builds) by name. Buddy tracks PIDs, captures stdout/stderr logs, and can tail output on demand.

### Multi-User Support
JWT-based authentication with admin and regular user roles. The first account created becomes admin. Agents can be personal or shared across users. Each user gets isolated sessions and conversation history.

### Output Summarization
Long command output (200+ lines) is automatically summarized by Haiku to save tokens. Full output is always saved to disk — Buddy can read the log file if the summary isn't enough.

### Environment Modes
- **Production** — full host access, only pattern-matched commands need confirmation
- **Development** — shell and filesystem writes restricted to `~/.buddy/` and `/tmp/`, all commands need confirmation

### Light and Dark Theme
Toggle between a light pastel design (default) and dark mode. Preference persists across sessions.

## Quick Start

### Prerequisites

- A Linux (Ubuntu/Debian) or macOS machine
- An [Anthropic API key](https://console.anthropic.com/settings/keys)

### Install

```bash
git clone https://github.com/raffenmb/buddy.git
cd buddy
bash setup.sh
```

The guided installer handles everything in 9 steps:

1. **Detects your OS** (Linux or macOS)
2. **Installs build tools** if missing (`build-essential` / Xcode CLI Tools)
3. **Installs Node.js 18+** if missing (via NodeSource or Homebrew)
4. **Configures environment** — prompts for your Anthropic API key and lets you choose a Claude model (Haiku, Sonnet, or Opus)
5. **Installs dependencies** (`npm run install:all`)
6. **Builds the frontend** (Vite production build)
7. **Creates your admin account** (username, display name, password)
8. **Sets up Tailscale** for remote access (optional — see below)
9. **Starts Buddy with pm2** and optionally configures auto-start on boot

When it finishes, open `http://localhost:3001` in your browser and log in.

### Managing Buddy

```bash
pm2 status          # check if running
pm2 logs            # view server logs
pm2 restart all     # restart
pm2 stop all        # stop
```

## Remote Access with Tailscale

[Tailscale](https://tailscale.com) creates a private WireGuard mesh network between your devices. It lets you reach Buddy from your phone, laptop, or any device — anywhere — without opening router ports or configuring firewalls.

The setup script offers to install and configure Tailscale automatically. If you skipped it during setup or need to set it up manually:

### Install Tailscale

**Linux (Ubuntu/Debian):**
```bash
curl -fsSL https://tailscale.com/install.sh | sh
```

**macOS (Homebrew):**
```bash
brew install tailscale
```

Or download from [tailscale.com/download](https://tailscale.com/download).

### Connect

**Linux:**
```bash
# Start the daemon
sudo systemctl enable --now tailscaled

# Authenticate (opens a URL — sign in with Google, GitHub, etc.)
sudo tailscale up

# Get your Tailscale IP
tailscale ip -4
```

**macOS:**
```bash
# Start Tailscale and authenticate
sudo tailscale up

# Get your Tailscale IP
tailscale ip -4
```

### Access Buddy Remotely

Once connected, Buddy is available at:

```
http://<your-tailscale-ip>:3001
```

### Connect Other Devices

1. Install Tailscale on your phone or laptop from [tailscale.com/download](https://tailscale.com/download)
2. Sign in with the same account you used on the server
3. Open `http://<your-tailscale-ip>:3001` in a browser on that device

All traffic between devices is end-to-end encrypted via WireGuard. No data passes through Tailscale's servers.

### Troubleshooting Tailscale

| Problem | Fix |
|---------|-----|
| `tailscale ip` returns nothing | Run `sudo tailscale up` to authenticate |
| `tailscaled` not running (Linux) | `sudo systemctl enable --now tailscaled` |
| Can't reach Buddy from another device | Make sure both devices are signed into the same Tailscale account |
| Connection drops on mobile | Check that Tailscale VPN is active in your phone's settings |

## Development

For local development with hot reload:

```bash
# Terminal 1 — backend
cd server && node index.js

# Terminal 2 — frontend (Vite dev server, port 5173)
cd client && npm run dev
```

The Vite dev server proxies `/api` and `/ws` requests to the backend on port 3001.

### Environment

Copy the example and fill in your API key:

```bash
cp server/.env.example server/.env
```

```env
ANTHROPIC_API_KEY=sk-ant-...
ELEVENLABS_API_KEY=              # optional, for future TTS upgrade
PORT=3001
CLAUDE_MODEL=claude-sonnet-4-5-20250929
BUDDY_ENV=development
```

## Tech Stack

- **Backend:** Node.js, Express, WebSockets (`ws`), `@anthropic-ai/sdk`, `@anthropic-ai/claude-agent-sdk`
- **Frontend:** React 18, Vite, Tailwind CSS 4, Victory (charts)
- **Database:** SQLite via `better-sqlite3`
- **Process Manager:** pm2
- **Auth:** JWT + bcrypt
- **Remote Access:** Tailscale (WireGuard mesh VPN)

## Architecture

```
Browser                          Server                        Host Machine
┌──────────────┐    HTTP/WS     ┌──────────────────┐          ┌────────────┐
│              │ ──────────────>│  Express + WS     │          │            │
│  React App   │                │                  │  spawn   │  Shell     │
│  - Avatar    │<───────────────│  Claude API      │ ────────>│  Files     │
│  - Canvas    │   canvas cmds  │  Tool-use loop   │  read    │  Processes │
│  - InputBar  │   + subtitle   │  Response split  │ <────────│  System    │
│              │                │  Session mgmt    │          │            │
└──────────────┘                └──────────────────┘          └────────────┘
                                        │
                                        v
                                 ~/.buddy/buddy.db
                                 ~/.buddy/skills/
                                 ~/.buddy/agents/
                                 ~/.buddy/processes/
                                 ~/.buddy/logs/
```

1. User sends a message via the input bar
2. Server appends it to session history and calls the Claude API with all tools
3. Claude responds with tool calls and text in a loop until done
4. Response splitter separates canvas commands from subtitle text
5. Canvas commands broadcast via WebSocket **first**, then the subtitle — so visuals appear before Buddy "speaks"
6. Frontend renders canvas elements and displays the subtitle with TTS

All user data lives in `~/.buddy/`, completely decoupled from the codebase.

## License

MIT
