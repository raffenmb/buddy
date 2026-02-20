# Setup Installer Design

**Date:** 2026-02-20
**Status:** Approved

## Goal

Package Buddy for easy installation from GitHub. A non-technical user should be able to clone the repo, run `bash setup.sh`, and have a fully working Buddy instance with admin account, API keys configured, and optional Tailscale remote access — all from one terminal session.

## Approach

Single bash script (`setup.sh`) that handles everything. No separate Node setup scripts needed (though `server/setup.js` remains as a fallback for users who start the server without running setup).

## Setup Flow (10 Steps)

### Step 1: Detect OS
- Linux (Ubuntu/Debian) or macOS
- Warn on untested distros, offer to continue

### Step 2: Check/install build tools
- Linux: `build-essential`, `python3` (for better-sqlite3 native compilation)
- macOS: Xcode Command Line Tools

### Step 3: Check/install Node.js 18+
- Offer to install Node 20 via NodeSource (Linux) or Homebrew (macOS)

### Step 4: Configure .env
- **Anthropic API key** (required) — validate `sk-ant-*` prefix
- **ElevenLabs API key** (optional) — press Enter to skip, stored for future use
- **Claude model selection** — numbered picker:
  1. `claude-haiku-4-5-20251001` — Fastest, cheapest
  2. `claude-sonnet-4-5-20250929` — Best balance (default)
  3. `claude-opus-4-5-20250501` — Most capable
- **BUDDY_ENV** — defaults to `production` (full host access)
- Result: writes `server/.env`

### Step 5: Install npm dependencies
- `npm run install:all` (server + client)

### Step 6: Build frontend
- `npm run build` (Vite production build)

### Step 7: Create admin account
- Start server temporarily in background (`node server/index.js &`)
- Wait for server to be ready (poll health endpoint)
- Prompt for: username (lowercase alphanumeric), display name, password (hidden via `stty -echo`), confirm password
- Call `POST /auth/register` via curl
- Stop temporary server
- If users already exist (re-run), skip this step

### Step 8: Tailscale setup (optional)
- Check if Tailscale is installed
- If not: offer to install via `curl -fsSL https://tailscale.com/install.sh | sh` (Linux) or `brew install tailscale` (macOS)
- Check if already connected (`tailscale status`)
- If not connected: run `sudo tailscale up`, display auth URL for browser login, wait for auth
- Show Tailscale IP (`tailscale ip -4`) for remote access
- Entire step is skippable

### Step 9: Install pm2 + start server
- Install pm2 globally if not present
- Stop existing buddy-server instance if running
- Start via `pm2 start server/index.js --name buddy-server`
- Save pm2 list
- Offer to set up auto-start on boot (`pm2 startup`)

### Step 10: Print summary
```
Buddy is running at:
  Local:     http://localhost:3001
  Tailscale: http://100.x.x.x:3001    (if set up)

Admin account: <username>

Useful commands:
  pm2 status / pm2 logs / pm2 restart all / pm2 stop all
```

## Idempotency

The script is safe to re-run:
- Build tools: skip if installed
- Node: skip if 18+ present
- .env: ask whether to keep existing config
- npm install / build: always run (idempotent)
- Admin account: curl to /auth/register detects existing users, skips
- Tailscale: skip if already connected
- pm2: stops existing instance before starting fresh

## Files Changed

| File | Change |
|------|--------|
| `setup.sh` | Rewritten — remove Docker, add ElevenLabs/model/Tailscale/admin |
| `server/.env.example` | Add `ELEVENLABS_API_KEY` |
| `.gitignore` | Verify `server/.env` is ignored |

## What's Removed (vs current setup.sh)

- All Docker sandbox code (Steps 4, 9 in old script)
- Docker-related variables (`DOCKER_AVAILABLE`, `DOCKER_JUST_INSTALLED`)
- `ecosystem.config.cjs` usage (use pm2 direct start instead)
- `BUDDY_ENV=development` default (now production)

## What's Added (vs current setup.sh)

- ElevenLabs API key prompt (optional, stored in .env)
- Claude model selection picker
- Admin user creation via temp server + curl
- Full interactive Tailscale setup
- `BUDDY_ENV=production` default
- Auto-start on boot option via `pm2 startup`

## Design Decisions

- **Single bash script**: User runs one command. No Node setup scripts, no two-phase process.
- **Temp server for user creation**: Reuses existing auth.js/bcrypt/JWT logic. No reimplementation in bash.
- **Password hiding via `stty -echo`**: Simple and portable. Prints "(typing is hidden)" so user knows it's working.
- **ElevenLabs stored now, used later**: The key goes in .env immediately. Server doesn't read it yet — that comes when TTS integration is built.
- **Production default**: Someone running setup.sh on their home PC wants full host access. Development mode is for contributors working on Buddy's code.
- **pm2 over systemd**: Works on both Linux and macOS, familiar to Node ecosystem, easy log access.
