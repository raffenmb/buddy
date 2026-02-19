# Server-as-OS Redesign

**Date:** 2026-02-18
**Status:** Design approved, pending implementation plan

## Overview

Rebuild Buddy's backend from a Docker-sandboxed architecture to a "Server as OS" model where the agent has full host access, can create its own skills, spawn sub-agents, and manage long-running processes. The frontend stays largely unchanged — same Canvas, Avatar, Subtitle UI. The Docker sandbox is removed entirely.

## Motivation

Buddy runs 24/7 on a dedicated always-on home PC. The Docker sandbox limits what the agent can do (can't install host packages, can't manage host services, can't see the host filesystem). The goal is a trusted personal agent that can run any command, evolve its own capabilities, and delegate work to sub-agents — all through conversation.

## Design Decisions

### Trust Model
Full host access with a confirmation gate for destructive operations. The agent can do anything the user can do in a terminal, but destructive commands (rm -rf, service management, disk operations, etc.) require user approval via an interactive canvas element.

### Skills as the Single Extensibility Layer
No separate "tool registry." Built-in tools are the platform primitives (shell, filesystem, process management, sub-agents, canvas, search, memory). Everything the agent builds on top of those primitives is a **skill** — a folder with a SKILL.md (prompt instructions) and optional bundled scripts. This matches Anthropic's Agent Skills pattern.

### Sub-Agent Model
The main agent is always the face of the conversation. Sub-agents are invisible workers — the main agent delegates, waits, and relays results. The user never interacts with sub-agents directly.

### Conversation-First Admin
The admin UI stays minimal (agent list, basic settings, skill upload). Creating tools, managing skills, viewing processes — all done by asking the agent. The agent IS the interface.

### Environment Modes
`BUDDY_ENV=development` (laptop) restricts writes to `~/.buddy/` and `/tmp/`. `BUDDY_ENV=production` (always-on PC) gives full host access. Same code, one env var.

## Architecture

### Platform Primitives (Built-in Tools)

| Service | Tools | Purpose |
|---------|-------|---------|
| Shell | `shell_exec`, `shell_background` | Run commands on the host |
| Filesystem | `read_file`, `write_file`, `list_directory` | Read/write files anywhere on host |
| Process Manager | `process_start`, `process_stop`, `process_status`, `process_logs` | Long-lived background processes |
| Sub-Agent Spawner | `spawn_agent`, `create_agent_template` | Delegate tasks to independent workers |
| Canvas | 10 canvas tools + `canvas_show_confirmation` | Visual rendering + interactive confirmations |
| Search | `search_youtube` | YouTube video search |
| Memory | `remember_fact` | Per-agent key-value memory |

### Skills (Extensibility Layer)

Skills live at `~/.buddy/skills/`. Each skill is a folder:

```
check-weather/
  SKILL.md              # YAML frontmatter (name, description) + prompt instructions
  scripts/
    get_weather.py      # Bundled script, executed via shell_exec
```

**Loading — progressive disclosure:**
1. System prompt lists only name + description for each enabled skill
2. Agent reads full SKILL.md via `read_file` when it decides a skill is relevant
3. Agent runs bundled scripts via `shell_exec`

**Two creation paths:**
- User uploads via admin UI → validated → written to `~/.buddy/skills/`
- Agent creates via `write_file` → server detects on next prompt scan

### Shell & Process Management

**`shell_exec`** — run a command, wait for output, return it.
- `child_process.spawn()` directly on the host (no Docker)
- Configurable timeout (default 30s, max 10min)
- Returns `{stdout, stderr, exitCode}`
- Configurable working directory

**`process_start`** — launch a long-lived background process.
- Detached child process with stdout/stderr piped to log files
- Server tracks: PID, command, start time, status, log file paths
- Processes survive conversation resets but not server restarts
- Storage: `~/.buddy/processes/proc-<id>/` with meta.json + logs

**`process_stop`** — SIGTERM, then SIGKILL after 5s.

**`process_status`** — all managed processes or a specific one.

**`process_logs`** — tail stdout/stderr logs. Accepts `lines` param.

### Output Summarization (Token Efficiency)

Two-tier processing for command output:

1. **Short output (under ~200 lines)** — passed directly to Claude as tool result
2. **Long output (over ~200 lines)** — summarized by Haiku before returning to Claude

Full output always saved to `~/.buddy/logs/exec-<id>.log`. Claude can `read_file` on the log if the summary isn't enough.

**Proactive error reporting:** When a managed background process exits non-zero, the server summarizes the last ~100 lines of stderr via Haiku and injects it into the main agent's conversation.

### Sub-Agent Spawner

**`spawn_agent`** — delegate a task to an independent worker:
- Server creates a new Claude API conversation in a child process
- Sub-agent gets: task description, system prompt (from template), platform tools
- Works independently, makes its own Claude API calls
- Returns result to main agent as a tool result
- Result summarized via Haiku if large

**`create_agent_template`** — define reusable sub-agent configs:
- Stored in SQLite `agent_templates` table
- Fields: name, system_prompt, allowed_tools, max_turns
- Agent can create, update, delete templates

**Constraints:**
- Sub-agents cannot send canvas commands or subtitles directly
- Sub-agents cannot spawn their own sub-agents (no recursion)
- Sub-agents don't access main agent's conversation history
- Multiple sub-agents can run in parallel

### Confirmation Gate

Destructive commands trigger an interactive canvas confirmation:

1. Agent calls `shell_exec` with a command matching a guard pattern
2. Server pauses execution, sends `canvas_show_confirmation` to frontend
3. `ActionConfirm` card appears on canvas with command, reason, and Approve/Deny buttons
4. User clicks → frontend sends `{ type: "confirm_response", id, approved }` via WebSocket
5. Server executes or rejects the command
6. Card updates to show outcome (stays visible as audit record)

**Default guard patterns:** rm -rf outside home, kill/killall system processes, package removal, service management, disk operations, network changes.

**Timeout:** 60 seconds, auto-denied.

**Config:** `~/.buddy/config/guards.json` — editable by the agent (but editing guards itself triggers confirmation).

### Environment Modes

```
BUDDY_ENV=development   # Laptop
BUDDY_ENV=production    # Always-on PC
```

| Behavior | development | production |
|----------|-------------|------------|
| Shell commands | Scoped to `~/.buddy/` and `/tmp/` | Full host access |
| Process management | Only agent-started processes | Full access |
| Destructive gate | All commands require confirmation | Only pattern-matched |
| Filesystem writes | Only `~/.buddy/` and `/tmp/` | Full access |
| Filesystem reads | Anywhere | Anywhere |
| Sub-agents | Normal | Normal |
| Skills | Normal | Normal |

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

| Table | Fields |
|-------|--------|
| `agents` | id, name, model, system_prompt, avatar, avatar_config, voice_config, enabled_tools |
| `agent_memory` | agent_id, key, value |
| `sessions` | id, created_at |
| `messages` | session_id, agent_id, role, content |
| `agent_templates` | name, system_prompt, allowed_tools, max_turns |

## Frontend Changes

**New:**
- `ActionConfirm` canvas element (card with Approve/Deny buttons)
- `canvas_show_confirmation` command in command router
- `CANVAS_SHOW_CONFIRMATION` reducer action
- `confirm_response` WebSocket message (client → server)
- Static file route: `/files/*` → `~/.buddy/shared/`

**Changed:**
- ToolSelector simplified: built-in tools + installed skills (no sandbox category)

**Removed:**
- Docker/sandbox references
- `send_file` handling (replaced by `~/.buddy/shared/` + static route)

**Unchanged:**
- Avatar, subtitle, TTS, input bar, top bar
- All 7 existing canvas element types
- BuddyState reducer, command router, WebSocket hook
- Theme system, entry animations
- Admin stack nav, AgentList, AgentEditor
- AlertModal (kept for non-canvas alerts)
- Skill upload UI (destination changes to `~/.buddy/skills/`)

## What Gets Deleted

- `server/sandbox/` (entire directory)
- `Dockerfile.buddy-sandbox`
- `docker-compose.yml`
- `read_skill` tool definition
- `send_file` tool definition
- Docker healthcheck on server startup

## Testing Strategy

Develop on laptop with `BUDDY_ENV=development`. Agent has full capability within `~/.buddy/` and `/tmp/` — can create skills, run scripts, spawn sub-agents, manage processes. Just can't touch system files.

Test on always-on PC via Tailscale SSH with `BUDDY_ENV=production` for full host access validation.
