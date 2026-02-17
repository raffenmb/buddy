# Buddy Agent — Sandboxed Command Execution Implementation Plan

## Overview

Implement a Dockerized command execution layer for the Buddy AI agent that allows the LLM to manipulate the filesystem, run shell commands, and manage its own knowledge documents — all within a sandboxed environment. This must work identically on Linux (Ubuntu) and macOS with zero-friction setup for non-technical users.

**Architecture:** Node.js/TypeScript server with persistent WebSocket → LLM generates tool calls → execution engine runs commands inside a Docker container → results fed back to model.

---

## Phase 1: Docker Environment Setup

### Goal
Create a self-contained Docker environment that starts automatically and provides the agent with a sandboxed filesystem and shell access.

### Tasks

#### 1.1 Create `Dockerfile.buddy-sandbox`
```dockerfile
FROM node:20-slim

# Install common utilities the agent might need
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    jq \
    imagemagick \
    ffmpeg \
    git \
    zip \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Create the agent workspace
RUN mkdir -p /agent/data /agent/knowledge /agent/uploads /agent/temp

WORKDIR /agent

# The container stays alive as a persistent execution environment
CMD ["tail", "-f", "/dev/null"]
```

- `/agent/data/` — user-created folders (e.g., wine-labels, beer-labels)
- `/agent/knowledge/` — agent's self-managed knowledge files (folder index, tool docs, etc.)
- `/agent/uploads/` — temporary landing zone for incoming files (photos from the app, etc.)
- `/agent/temp/` — scratch space for intermediate work

#### 1.2 Create `docker-compose.yml`
```yaml
version: '3.8'
services:
  buddy-sandbox:
    build:
      context: .
      dockerfile: Dockerfile.buddy-sandbox
    container_name: buddy-sandbox
    restart: always
    volumes:
      - buddy-data:/agent/data
      - buddy-knowledge:/agent/knowledge
    # No ports exposed — communication happens via docker exec from the host
    # Resource limits to prevent runaway commands
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '1.0'

volumes:
  buddy-data:
  buddy-knowledge:
```

Key decisions:
- `restart: always` ensures the sandbox comes back after reboot (Docker auto-starts on both Linux and macOS)
- Named volumes (`buddy-data`, `buddy-knowledge`) persist data across container rebuilds
- No network ports exposed — the sandbox is accessed only via `docker exec` from the Buddy server process
- Resource limits prevent a bad command from consuming the host

#### 1.3 Create `setup.sh` (one-time setup script)
```bash
#!/bin/bash
set -e

echo "🤖 Setting up Buddy sandbox..."

# Check for Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed."
    echo "   macOS: Install Docker Desktop from https://docker.com/products/docker-desktop"
    echo "   Linux: Run 'curl -fsSL https://get.docker.com | sh'"
    exit 1
fi

# Check Docker is running
if ! docker info &> /dev/null 2>&1; then
    echo "❌ Docker is installed but not running. Please start Docker and try again."
    exit 1
fi

# Build and start
docker compose up -d --build

echo "✅ Buddy sandbox is running!"
echo "   Data persists in Docker volumes: buddy-data, buddy-knowledge"
```

---

## Phase 2: Command Execution Engine

### Goal
Build a TypeScript module that the Buddy server uses to execute commands inside the Docker container, with safety guards and timeout handling.

### Tasks

#### 2.1 Create `src/sandbox/executor.ts`

This is the core execution module. It uses `docker exec` to run commands inside the persistent container.

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const CONTAINER_NAME = 'buddy-sandbox';
const DEFAULT_TIMEOUT_MS = 30_000; // 30 seconds
const MAX_OUTPUT_LENGTH = 50_000; // chars, to prevent giant outputs from blowing up context

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

export async function executeInSandbox(
  command: string,
  options?: {
    cwd?: string;       // defaults to /agent
    timeout?: number;   // ms, defaults to 30s
    env?: Record<string, string>;
  }
): Promise<ExecutionResult> {
  const cwd = options?.cwd ?? '/agent';
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;

  // Build the docker exec command
  const envFlags = options?.env
    ? Object.entries(options.env).map(([k, v]) => `-e ${k}="${v}"`).join(' ')
    : '';

  const dockerCmd = `docker exec ${envFlags} ${CONTAINER_NAME} sh -c 'cd ${cwd} && ${escapeForShell(command)}'`;

  try {
    const { stdout, stderr } = await execAsync(dockerCmd, {
      timeout,
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
    });

    return {
      stdout: truncate(stdout, MAX_OUTPUT_LENGTH),
      stderr: truncate(stderr, MAX_OUTPUT_LENGTH),
      exitCode: 0,
      timedOut: false,
    };
  } catch (error: any) {
    if (error.killed) {
      return {
        stdout: truncate(error.stdout ?? '', MAX_OUTPUT_LENGTH),
        stderr: 'Command timed out',
        exitCode: 124,
        timedOut: true,
      };
    }
    return {
      stdout: truncate(error.stdout ?? '', MAX_OUTPUT_LENGTH),
      stderr: truncate(error.stderr ?? error.message, MAX_OUTPUT_LENGTH),
      exitCode: error.code ?? 1,
      timedOut: false,
    };
  }
}

function escapeForShell(cmd: string): string {
  // Escape single quotes for sh -c wrapper
  return cmd.replace(/'/g, "'\\''");
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + `\n... [truncated, ${str.length - maxLen} chars omitted]`;
}
```

#### 2.2 Create `src/sandbox/healthcheck.ts`

Verify the sandbox container is running before attempting execution.

```typescript
import { execAsync } from './executor'; // reuse the promisified exec

export async function isSandboxRunning(): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      `docker inspect -f '{{.State.Running}}' buddy-sandbox`
    );
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

export async function ensureSandboxRunning(): Promise<void> {
  if (!(await isSandboxRunning())) {
    await execAsync('docker compose up -d');
  }
}
```

Call `ensureSandboxRunning()` on Buddy server startup.

---

## Phase 3: Tool Definitions for the LLM

### Goal
Define the tools the LLM can call to interact with the sandbox. These plug into Buddy's existing tool/function-calling schema.

### Tasks

#### 3.1 Define sandbox tools

Add these to your existing tool registry. The LLM calls these; your orchestrator routes them to the executor.

```typescript
// Tool definitions to register with your existing tool schema
export const sandboxTools = [
  {
    name: 'shell_exec',
    description: 'Execute a shell command in the sandbox environment. Use for file operations, running scripts, installing packages, etc. Working directory is /agent by default.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute'
        },
        cwd: {
          type: 'string',
          description: 'Working directory (default: /agent)',
          default: '/agent'
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 30000)',
          default: 30000
        }
      },
      required: ['command']
    }
  },
  {
    name: 'read_file',
    description: 'Read the contents of a file in the sandbox.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute path to the file (must be within /agent/)'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Write content to a file in the sandbox. Creates parent directories if needed.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute path for the file (must be within /agent/)'
        },
        content: {
          type: 'string',
          description: 'Content to write to the file'
        }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'list_directory',
    description: 'List files and directories at a given path in the sandbox.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute path to list (default: /agent/data)',
          default: '/agent/data'
        }
      },
      required: []
    }
  }
];
```

#### 3.2 Create tool handler router `src/sandbox/toolHandler.ts`

```typescript
import { executeInSandbox } from './executor';

export async function handleSandboxTool(
  toolName: string,
  params: Record<string, any>
): Promise<string> {
  switch (toolName) {
    case 'shell_exec': {
      const result = await executeInSandbox(params.command, {
        cwd: params.cwd,
        timeout: params.timeout,
      });
      // Format result for the LLM
      let output = '';
      if (result.stdout) output += result.stdout;
      if (result.stderr) output += `\nSTDERR: ${result.stderr}`;
      if (result.timedOut) output += '\n[Command timed out]';
      output += `\n[exit code: ${result.exitCode}]`;
      return output.trim();
    }

    case 'read_file': {
      // Validate path is within /agent/
      if (!params.path.startsWith('/agent/')) {
        return 'Error: Can only read files within /agent/';
      }
      const result = await executeInSandbox(`cat "${params.path}"`);
      if (result.exitCode !== 0) {
        return `Error reading file: ${result.stderr}`;
      }
      return result.stdout;
    }

    case 'write_file': {
      if (!params.path.startsWith('/agent/')) {
        return 'Error: Can only write files within /agent/';
      }
      // Create parent dirs and write via heredoc
      const result = await executeInSandbox(
        `mkdir -p "$(dirname "${params.path}")" && cat > "${params.path}" << 'BUDDY_EOF'\n${params.content}\nBUDDY_EOF`
      );
      if (result.exitCode !== 0) {
        return `Error writing file: ${result.stderr}`;
      }
      return `File written: ${params.path}`;
    }

    case 'list_directory': {
      const path = params.path || '/agent/data';
      const result = await executeInSandbox(`ls -la "${path}"`);
      if (result.exitCode !== 0) {
        return `Error listing directory: ${result.stderr}`;
      }
      return result.stdout;
    }

    default:
      return `Unknown tool: ${toolName}`;
  }
}
```

---

## Phase 4: File Upload Pipeline

### Goal
Handle files sent from the custom app (photos, documents, etc.) by saving them into the sandbox and making them available to the agent.

### Tasks

#### 4.1 Create `src/sandbox/fileTransfer.ts`

```typescript
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

const CONTAINER_NAME = 'buddy-sandbox';

/**
 * Copy a file from the host into the sandbox container.
 * Returns the path inside the container.
 */
export function copyFileToSandbox(
  hostPath: string,
  sandboxDir: string = '/agent/uploads'
): string {
  const filename = `${uuidv4()}_${path.basename(hostPath)}`;
  const containerPath = `${sandboxDir}/${filename}`;

  // Ensure the directory exists in the container
  execSync(`docker exec ${CONTAINER_NAME} mkdir -p ${sandboxDir}`);

  // Copy the file
  execSync(`docker cp "${hostPath}" ${CONTAINER_NAME}:${containerPath}`);

  return containerPath;
}

/**
 * Copy a file from the sandbox to the host (for sending files back to the user).
 */
export function copyFileFromSandbox(
  containerPath: string,
  hostDir: string
): string {
  const filename = path.basename(containerPath);
  const hostPath = path.join(hostDir, filename);

  execSync(`docker cp ${CONTAINER_NAME}:${containerPath} "${hostPath}"`);

  return hostPath;
}

/**
 * Save a Buffer (e.g., from an incoming WebSocket message) to a temp file,
 * then copy into sandbox. Returns the container path.
 */
export function saveBufferToSandbox(
  buffer: Buffer,
  originalFilename: string,
  sandboxDir: string = '/agent/uploads'
): string {
  const tempPath = `/tmp/buddy_upload_${uuidv4()}_${originalFilename}`;
  fs.writeFileSync(tempPath, buffer);

  const containerPath = copyFileToSandbox(tempPath, sandboxDir);

  // Clean up temp file
  fs.unlinkSync(tempPath);

  return containerPath;
}
```

#### 4.2 Integration with WebSocket message handler

In your existing WebSocket message handler, when a file/image is received:

```typescript
// Pseudocode — adapt to your existing message handling
websocket.on('message', async (msg) => {
  if (msg.type === 'file_upload') {
    // Save the file into the sandbox
    const containerPath = saveBufferToSandbox(
      msg.fileBuffer,
      msg.filename
    );

    // Include the file path in the context for the LLM
    const userMessage = msg.text
      ? `${msg.text}\n\n[File uploaded to: ${containerPath}]`
      : `[File uploaded to: ${containerPath}] (filename: ${msg.filename})`;

    // Pass to your agent loop with the file info
    await processAgentMessage(userMessage);
  }
});
```

---

## Phase 5: Agent Knowledge Self-Management

### Goal
Give the agent a knowledge directory it can read/write to maintain its own understanding of what folders exist, what they're for, and how to use them. This is how the agent "remembers" that you created a wine-labels folder.

### Tasks

#### 5.1 Seed initial knowledge file

On first run, create `/agent/knowledge/workspace.json` inside the container:

```json
{
  "version": 1,
  "description": "Agent's self-managed index of the workspace",
  "folders": {},
  "notes": []
}
```

#### 5.2 Add a system prompt section for self-management

Include this in the system prompt sent to the LLM on every interaction:

```
## Workspace Management

You have a persistent workspace at /agent/data/ where you can create folders and organize files for the user.

You maintain a knowledge file at /agent/knowledge/workspace.json that tracks:
- What folders exist and their purpose
- Any notes about how the user wants things organized

IMPORTANT: Whenever you create, rename, or delete a folder, ALWAYS update workspace.json accordingly. Read it at the start of any file-management task to understand the current state.

When the user asks you to set up a new organizational system (e.g., "create a folder for my wine labels"), you should:
1. Read workspace.json to check current state
2. Create the folder
3. Update workspace.json with the new folder and its purpose
4. Confirm to the user what you did
```

#### 5.3 Inject workspace context

Before each agent turn that might involve files, read and inject the workspace state:

```typescript
// In your agent loop, before calling the LLM
async function getWorkspaceContext(): Promise<string> {
  const result = await executeInSandbox('cat /agent/knowledge/workspace.json 2>/dev/null || echo "{}"');
  return `Current workspace state:\n${result.stdout}`;
}
```

This gets prepended to the conversation context so the model always knows what folders exist.

---

## Phase 6: Safety & Guardrails

### Goal
Prevent the agent from doing dangerous things, even though it's sandboxed.

### Tasks

#### 6.1 Create `src/sandbox/guards.ts`

```typescript
const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\/(?!agent)/,    // rm -rf outside /agent
  /:(){ :\|:& };:/,             // fork bomb
  /mkfs/,                       // filesystem format
  /dd\s+if=/,                   // raw disk write
  /curl.*\|\s*sh/,              // pipe curl to shell
  /wget.*\|\s*sh/,              // pipe wget to shell
  />\s*\/dev\/sd/,              // write to block devices
];

const BLOCKED_COMMANDS = [
  'shutdown', 'reboot', 'poweroff', 'halt',
  'iptables', 'ip6tables',
];

export function validateCommand(command: string): { safe: boolean; reason?: string } {
  // Check blocked patterns
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      return { safe: false, reason: `Blocked pattern detected: ${pattern}` };
    }
  }

  // Check blocked commands
  const firstWord = command.trim().split(/\s+/)[0];
  if (BLOCKED_COMMANDS.includes(firstWord)) {
    return { safe: false, reason: `Blocked command: ${firstWord}` };
  }

  return { safe: true };
}
```

#### 6.2 Integrate guards into executor

Add to `executeInSandbox()` before running:

```typescript
const validation = validateCommand(command);
if (!validation.safe) {
  return {
    stdout: '',
    stderr: `Command blocked: ${validation.reason}`,
    exitCode: 1,
    timedOut: false,
  };
}
```

---

## Phase 7: Retrieving Files for the User

### Goal
When the user asks the agent to send them a file (or the agent needs to return a processed image, document, etc.), extract it from the sandbox and serve it through the WebSocket.

### Tasks

#### 7.1 Add a `send_file` tool

```typescript
{
  name: 'send_file',
  description: 'Send a file from the sandbox back to the user through the chat.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file inside the sandbox to send to the user'
      },
      message: {
        type: 'string',
        description: 'Optional message to accompany the file'
      }
    },
    required: ['path']
  }
}
```

#### 7.2 Handle in tool router

```typescript
case 'send_file': {
  const hostPath = copyFileFromSandbox(params.path, '/tmp/buddy_outbox');
  const fileBuffer = fs.readFileSync(hostPath);

  // Send through your WebSocket to the client app
  websocket.send(JSON.stringify({
    type: 'file_delivery',
    filename: path.basename(params.path),
    data: fileBuffer.toString('base64'),
    message: params.message || null,
  }));

  fs.unlinkSync(hostPath); // clean up
  return `File sent to user: ${path.basename(params.path)}`;
}
```

---

## Implementation Order

1. **Phase 1** — Docker environment (Dockerfile, compose, setup script)
2. **Phase 2** — Executor module (core `docker exec` wrapper)
3. **Phase 6** — Safety guards (add before anything runs)
4. **Phase 3** — Tool definitions (register with existing schema)
5. **Phase 5** — Knowledge self-management (workspace.json seeding + system prompt)
6. **Phase 4** — File upload pipeline (WebSocket → sandbox)
7. **Phase 7** — File retrieval (sandbox → user)

## Testing Checklist

- [ ] `setup.sh` works on a clean machine with Docker installed (both macOS and Ubuntu)
- [ ] Container auto-restarts after `docker restart buddy-sandbox`
- [ ] Container comes back after system reboot
- [ ] `shell_exec` tool can create a folder and list it
- [ ] `write_file` creates parent directories automatically
- [ ] `read_file` returns error for paths outside `/agent/`
- [ ] Blocked commands (rm -rf /, fork bombs) are caught by guards
- [ ] Command timeout works (try `sleep 60` with 5s timeout)
- [ ] File upload from app lands in `/agent/uploads/`
- [ ] Agent can move uploaded file to a user-created folder
- [ ] Agent updates `workspace.json` when creating folders
- [ ] Agent reads `workspace.json` on next conversation to recall folder structure
- [ ] `send_file` delivers a file back through the WebSocket
- [ ] Named volumes survive `docker compose down && docker compose up`

## File Structure

```
buddy/
├── setup.sh
├── Dockerfile.buddy-sandbox
├── docker-compose.yml
├── src/
│   ├── sandbox/
│   │   ├── executor.ts
│   │   ├── healthcheck.ts
│   │   ├── toolHandler.ts
│   │   ├── fileTransfer.ts
│   │   └── guards.ts
│   └── ... (existing Buddy server code)
```

## Appendix: How OpenClaw Actually Does It (Reference Architecture)

After reviewing the OpenClaw source (`src/agents/bash-tools.ts`, `src/agents/sandbox.ts`, `src/agents/sandbox/context.ts`, `Dockerfile.sandbox`), here are the key architectural patterns they use:

### Sandbox Container Design
- **`Dockerfile.sandbox`** is a minimal `debian:bookworm-slim` image with bash, curl, git, jq, python3, and ripgrep. The container runs `sleep infinity` as its CMD — it stays alive as a persistent execution target, just like our plan.
- **`Dockerfile.sandbox-browser`** is a separate image that adds Chromium + CDP + optional noVNC for browser automation.
- **`Dockerfile.sandbox-common`** contains shared base layers.
- Containers currently run as **root inside the sandbox** (there's an open issue #7004 about adding a non-root USER directive). For Buddy, we should add a non-root user from the start.

### Execution Model
- The Gateway (Node.js/TypeScript) runs on the **host**. Tool calls from the LLM are intercepted by the gateway.
- For sandboxed sessions, exec commands run via `docker exec` into the persistent container — exactly the pattern in our plan (`src/agents/bash-tools.ts`).
- Commands run through `sh -lc` (login shell) inside the container, which sources `/etc/profile`. This is important because it means PATH can get reset. OpenClaw handles this by prepending custom PATH entries via an internal env var after profile sourcing.
- For the **main session** (just you, the owner), tools run **directly on the host** with no sandbox by default. Sandboxing is opt-in via `agents.defaults.sandbox.mode`.

### Sandbox Scoping
- **`scope: "agent"`** (default) — one container + one workspace per agent. Multiple sessions from the same agent share the container.
- **`scope: "session"`** — one container per conversation session. Maximum isolation but more resource usage.
- **`scope: "shared"`** — all sessions share one container (least isolation).
- For Buddy, `scope: "agent"` is the right default since it's a single-user system.

### Workspace Mounting & File Access
- The agent workspace (`~/.openclaw/workspace`) is mounted into the container.
- **`workspaceAccess: "rw"`** mounts the workspace read/write at `/workspace` inside the container.
- **`workspaceAccess: "ro"`** mounts read-only at `/agent` and gives the sandbox its own writable `/workspace`.
- **Inbound media** (photos, files sent via messaging) are copied into `media/inbound/*` inside the active sandbox workspace so tools can access them. This is exactly our file upload pipeline pattern.

### Networking
- **Default `docker.network` is `"none"`** — no internet access for sandbox containers by default. This is a security measure.
- For Buddy, we'll want to **change this to bridge/default** since internet access (YouTube search, APIs) is a requirement. Or use a custom Docker network with egress.

### Tool Policy System
- OpenClaw has a layered allow/deny system for tools:
  - **Profiles**: `minimal`, `coding`, `messaging`, `full`
  - **Tool groups**: `group:runtime` (exec, bash, process), `group:fs` (read, write, edit), etc.
  - **Per-agent overrides**: each agent can have its own allow/deny list
- **Safe binaries**: Common read-only utilities (ls, cat, grep, awk, etc.) bypass approval by default (`src/agents/bash-tools.ts` lines 85-89).
- **Exec approvals**: Dangerous commands can require user approval before running. The approval flow goes through the messaging channel (WhatsApp/Telegram/etc.) and the user approves/denies.

### Key Takeaways for Buddy

1. **Our Docker approach is validated** — OpenClaw uses the exact same pattern (persistent container, `docker exec`, `sleep infinity`).
2. **Network default should differ** — OpenClaw defaults to no network (`"none"`). Buddy needs internet for YouTube/API access, so we should default to bridge networking but add an option to restrict it.
3. **Add workspace access modes** — We should support both `rw` and `ro` workspace modes like OpenClaw does.
4. **File tool vs exec path distinction** — OpenClaw separates "file tools" (read/write/edit that use host-bridge paths) from "exec" (which uses container paths). Our `read_file`/`write_file` tools should be aware of this distinction.
5. **Login shell matters** — Using `sh -lc` means profile sourcing can reset PATH. We should handle this like OpenClaw does — prepend our custom paths after profile sourcing.
6. **Media inbound pipeline is confirmed** — OpenClaw copies inbound media into the sandbox workspace, exactly our `fileTransfer.ts` approach.
7. **Consider adding exec approvals later** — For a single-user system like Buddy this isn't critical now, but it's a nice safety feature for the future.

### Updated Docker Compose (Incorporating OpenClaw Learnings)

```yaml
version: '3.8'
services:
  buddy-sandbox:
    build:
      context: .
      dockerfile: Dockerfile.buddy-sandbox
    container_name: buddy-sandbox
    restart: always
    volumes:
      - buddy-data:/agent/data
      - buddy-knowledge:/agent/knowledge
    # Unlike OpenClaw's default "none", Buddy needs internet for APIs
    # Use default bridge network for outbound access
    network_mode: bridge
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '1.0'
    # Run as non-root (unlike current OpenClaw which has an open issue for this)
    user: "1000:1000"

volumes:
  buddy-data:
  buddy-knowledge:
```

### Updated Dockerfile (Incorporating OpenClaw Patterns)

```dockerfile
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

# Match OpenClaw's base utilities + add Buddy-specific tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    git \
    jq \
    python3 \
    python3-pip \
    ripgrep \
    imagemagick \
    ffmpeg \
    zip \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user (OpenClaw issue #7004 — we fix this from day one)
RUN useradd -m -s /bin/bash -u 1000 buddy

# Create workspace directories
RUN mkdir -p /agent/data /agent/knowledge /agent/uploads /agent/temp \
    && chown -R buddy:buddy /agent

USER buddy
WORKDIR /agent

CMD ["sleep", "infinity"]
```

## Notes for Claude Code

- The Buddy server is Node.js/TypeScript
- There is an existing tool/function-calling schema already defined — integrate the new sandbox tools into it rather than replacing it
- The app is a custom UI (not Telegram/WhatsApp) that communicates via persistent WebSocket
- Cross-platform support (Ubuntu + macOS) is a hard requirement
- Minimize setup friction — `setup.sh` should be the only thing a user runs
- Docker is the sandboxing mechanism — no special Linux users or ACLs needed
