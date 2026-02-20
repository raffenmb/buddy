# Setup Installer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite setup.sh as a single-command installer that takes a user from `git clone` to a running Buddy instance with admin account, API keys, and optional Tailscale.

**Architecture:** Single bash script handles everything in order: system deps, Node, .env creation (interactive prompts for API keys and model), npm install, frontend build, admin account creation (via temp server + curl to /auth/register), Tailscale setup, pm2 launch.

**Tech Stack:** Bash, curl, pm2, Tailscale CLI

---

### Task 1: Update server/.env.example

**Files:**
- Modify: `server/.env.example`

**Step 1: Update the .env.example to include ElevenLabs key**

Replace the full contents of `server/.env.example` with:

```
ANTHROPIC_API_KEY=sk-ant-...
ELEVENLABS_API_KEY=
PORT=3001
CLAUDE_MODEL=claude-sonnet-4-5-20250929
BUDDY_ENV=production
```

Note: `BUDDY_ENV` changes from `development` to `production` to reflect the intended default for users installing from GitHub.

**Step 2: Commit**

```bash
git add server/.env.example
git commit -m "Update .env.example: add ElevenLabs key, default to production"
```

---

### Task 2: Add health check endpoint to server

The setup script needs to know when the server is ready. There's currently no health endpoint.

**Files:**
- Modify: `server/index.js` (add route near other API routes, around line 120)

**Step 1: Add health check route**

Add this route before the auth routes in `server/index.js`:

```javascript
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});
```

Place it right before the `// ─── Auth routes` section.

**Step 2: Verify manually**

Start the server, hit `curl http://localhost:3001/api/health`, confirm `{"status":"ok"}`.

**Step 3: Commit**

```bash
git add server/index.js
git commit -m "Add /api/health endpoint for setup script readiness check"
```

---

### Task 3: Rewrite setup.sh — scaffolding and helpers

Start fresh. Write the script skeleton with color helpers, logging, and utility functions.

**Files:**
- Modify: `setup.sh` (replace entire contents)

**Step 1: Write the script skeleton**

Replace `setup.sh` with:

```bash
#!/bin/bash

# ─────────────────────────────────────────────────────────────
# Buddy — Zero-Friction Guided Installer
# Detects your OS, installs prerequisites, and gets Buddy running.
# Usage: bash setup.sh
# ─────────────────────────────────────────────────────────────

set -euo pipefail

TOTAL_STEPS=9
CURRENT_STEP=0
LOG_FILE="$HOME/buddy-setup.log"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TAILSCALE_IP=""

# ─── Color & formatting helpers ──────────────────────────────

if [ -t 1 ] && command -v tput &> /dev/null && [ "$(tput colors 2>/dev/null)" -ge 8 ] 2>/dev/null; then
    GREEN=$(tput setaf 2)
    RED=$(tput setaf 1)
    YELLOW=$(tput setaf 3)
    CYAN=$(tput setaf 6)
    BOLD=$(tput bold)
    RESET=$(tput sgr0)
else
    GREEN=""
    RED=""
    YELLOW=""
    CYAN=""
    BOLD=""
    RESET=""
fi

ok()   { echo "  ${GREEN}✔${RESET} $1"; }
fail() { echo "  ${RED}✘${RESET} $1"; }
warn() { echo "  ${YELLOW}!${RESET} $1"; }
info() { echo "  ${CYAN}→${RESET} $1"; }

step() {
    CURRENT_STEP=$((CURRENT_STEP + 1))
    echo ""
    echo "${BOLD}[Step ${CURRENT_STEP}/${TOTAL_STEPS}] $1${RESET}"
}

ask_yn() {
    local prompt="$1"
    local answer
    while true; do
        read -r -p "  ${prompt} (y/n): " answer
        case "$answer" in
            [Yy]|[Yy][Ee][Ss]) return 0 ;;
            [Nn]|[Nn][Oo]) return 1 ;;
            *) echo "  Please answer y or n." ;;
        esac
    done
}

run_logged() {
    local label="$1"
    shift
    echo "  Running: $label"
    echo "" >> "$LOG_FILE"
    echo "=== $label ===" >> "$LOG_FILE"
    echo "Command: $*" >> "$LOG_FILE"
    echo "Time: $(date)" >> "$LOG_FILE"
    if "$@" >> "$LOG_FILE" 2>&1; then
        ok "$label"
        return 0
    else
        fail "$label"
        echo "  See log for details: $LOG_FILE"
        return 1
    fi
}

read_password() {
    local prompt="$1"
    local var_name="$2"
    printf "  %s (typing is hidden): " "$prompt"
    stty -echo 2>/dev/null || true
    local pw=""
    read -r pw
    stty echo 2>/dev/null || true
    echo ""
    eval "$var_name=\$pw"
}

die() {
    echo ""
    fail "$1"
    if [ -n "${2:-}" ]; then
        info "$2"
    fi
    echo ""
    echo "  Full log: $LOG_FILE"
    exit 1
}

# ─── Start ───────────────────────────────────────────────────

echo ""
echo "${BOLD}=========================================${RESET}"
echo "${BOLD}  Buddy — Guided Installer${RESET}"
echo "${BOLD}=========================================${RESET}"
echo ""
echo "  This script will install everything Buddy needs and get"
echo "  it running. It will ask before installing anything."
echo ""
echo "  Log file: $LOG_FILE"

echo "=== Buddy Setup Started ===" > "$LOG_FILE"
echo "Date: $(date)" >> "$LOG_FILE"
echo "User: $(whoami)" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"
```

This is just the scaffold. Steps are added in subsequent tasks.

**Step 2: Commit**

```bash
git add setup.sh
git commit -m "Rewrite setup.sh: scaffold with helpers and header"
```

---

### Task 4: setup.sh — Steps 1-3 (OS, build tools, Node)

**Files:**
- Modify: `setup.sh` (append after the Start section)

**Step 1: Add OS detection (Step 1)**

Append to `setup.sh`:

```bash
# ─── Step 1: Detect OS ──────────────────────────────────────

step "Detecting operating system..."

OS=""
DISTRO=""

case "$(uname -s)" in
    Linux*)
        OS="linux"
        if [ -f /etc/os-release ]; then
            . /etc/os-release
            DISTRO="$ID"
        fi
        ;;
    Darwin*)
        OS="mac"
        ;;
    *)
        die "Unsupported operating system: $(uname -s)" \
            "Buddy supports Linux (Ubuntu/Debian) and macOS."
        ;;
esac

if [ "$OS" = "linux" ]; then
    ok "Linux detected (${DISTRO:-unknown distro})"
    if [ "$DISTRO" != "ubuntu" ] && [ "$DISTRO" != "debian" ]; then
        warn "This installer is tested on Ubuntu/Debian. Other distros may work but aren't guaranteed."
        if ! ask_yn "Continue anyway?"; then
            echo "  Exiting."
            exit 0
        fi
    fi
elif [ "$OS" = "mac" ]; then
    ok "macOS detected ($(sw_vers -productVersion 2>/dev/null || echo 'unknown version'))"
fi

echo "OS=$OS" >> "$LOG_FILE"
echo "DISTRO=$DISTRO" >> "$LOG_FILE"
```

**Step 2: Add build tools check (Step 2)**

Append to `setup.sh`:

```bash
# ─── Step 2: Install build tools ────────────────────────────

step "Checking build tools (needed for native modules)..."

NEED_BUILD_TOOLS=false

if [ "$OS" = "linux" ]; then
    if ! dpkg -s build-essential &> /dev/null || ! command -v python3 &> /dev/null; then
        NEED_BUILD_TOOLS=true
    fi
elif [ "$OS" = "mac" ]; then
    if ! xcode-select -p &> /dev/null; then
        NEED_BUILD_TOOLS=true
    fi
fi

if [ "$NEED_BUILD_TOOLS" = true ]; then
    warn "Build tools are needed to compile native modules (better-sqlite3)."
    if ask_yn "Install build tools now?"; then
        if [ "$OS" = "linux" ]; then
            run_logged "Updating package lists" sudo apt-get update -y || \
                die "Failed to update package lists." "Check your internet connection and try again."
            run_logged "Installing build-essential and python3" sudo apt-get install -y build-essential python3 || \
                die "Failed to install build tools." "Try running: sudo apt-get install -y build-essential python3"
        elif [ "$OS" = "mac" ]; then
            info "This will open an Xcode Command Line Tools installer dialog."
            info "Click 'Install' in the dialog, then wait for it to finish."
            xcode-select --install 2>> "$LOG_FILE" || true
            echo "  Waiting for Xcode Command Line Tools installation..."
            until xcode-select -p &> /dev/null; do
                sleep 5
            done
            ok "Xcode Command Line Tools installed"
        fi
    else
        warn "Skipping build tools. npm install may fail for native modules."
    fi
else
    ok "Build tools already installed"
fi
```

**Step 3: Add Node.js check (Step 3)**

Append to `setup.sh`:

```bash
# ─── Step 3: Install Node.js ────────────────────────────────

step "Checking Node.js..."

if command -v node &> /dev/null; then
    NODE_VER=$(node -v)
    NODE_MAJOR=$(echo "$NODE_VER" | sed 's/^v//' | cut -d. -f1)
    if [ "$NODE_MAJOR" -ge 18 ] 2>/dev/null; then
        ok "Node.js ${NODE_VER} found (meets requirement: v18+)"
    else
        warn "Node.js ${NODE_VER} found but v18+ is required."
        if ask_yn "Install Node.js 20?"; then
            if [ "$OS" = "linux" ]; then
                run_logged "Adding NodeSource repository" bash -c "curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -" || \
                    die "Failed to add NodeSource repository." "Check your internet connection."
                run_logged "Installing Node.js 20" sudo apt-get install -y nodejs || \
                    die "Failed to install Node.js."
            elif [ "$OS" = "mac" ]; then
                if command -v brew &> /dev/null; then
                    run_logged "Installing Node.js 20 via Homebrew" brew install node@20 || \
                        die "Failed to install Node.js via Homebrew."
                else
                    die "Node.js 18+ is required but your version is too old." \
                        "Install Homebrew (https://brew.sh) then run: brew install node@20"
                fi
            fi
            ok "Node.js $(node -v) installed"
        else
            die "Node.js 18+ is required." "Install it manually and re-run this script."
        fi
    fi
else
    warn "Node.js is not installed."
    if ask_yn "Install Node.js 20 now?"; then
        if [ "$OS" = "linux" ]; then
            run_logged "Adding NodeSource repository" bash -c "curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -" || \
                die "Failed to add NodeSource repository." "Check your internet connection."
            run_logged "Installing Node.js 20" sudo apt-get install -y nodejs || \
                die "Failed to install Node.js."
        elif [ "$OS" = "mac" ]; then
            if command -v brew &> /dev/null; then
                run_logged "Installing Node.js 20 via Homebrew" brew install node@20 || \
                    die "Failed to install Node.js via Homebrew."
            else
                die "Homebrew is required to install Node.js on macOS." \
                    "Install Homebrew first: /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
            fi
        fi
        ok "Node.js $(node -v) installed"
    else
        die "Node.js is required to run Buddy." "Install it manually and re-run this script."
    fi
fi

if ! command -v npm &> /dev/null; then
    die "npm not found (it should come with Node.js)." \
        "Try reinstalling Node.js."
fi
```

**Step 4: Commit**

```bash
git add setup.sh
git commit -m "setup.sh: add OS detection, build tools, and Node.js steps"
```

---

### Task 5: setup.sh — Step 4 (project check + .env configuration)

**Files:**
- Modify: `setup.sh` (append)

**Step 1: Add project check and .env configuration**

Append to `setup.sh`:

```bash
# ─── Step 4: Configure environment ──────────────────────────

step "Checking project files..."

if [ ! -f "$SCRIPT_DIR/package.json" ] || [ ! -d "$SCRIPT_DIR/server" ] || [ ! -d "$SCRIPT_DIR/client" ]; then
    die "This script must be run from the buddy project directory." \
        "Run: cd buddy && bash setup.sh"
fi

ok "Project files found"

step "Configuring environment..."

ENV_FILE="$SCRIPT_DIR/server/.env"

if [ -f "$ENV_FILE" ]; then
    EXISTING_KEY=$(grep -o 'ANTHROPIC_API_KEY=.*' "$ENV_FILE" 2>/dev/null | cut -d= -f2)
    if [ -n "$EXISTING_KEY" ] && [ "$EXISTING_KEY" != "sk-ant-..." ]; then
        ok "Environment already configured in server/.env"
        if ask_yn "Keep the existing configuration?"; then
            info "Keeping existing configuration."
            SKIP_ENV=true
        else
            SKIP_ENV=false
        fi
    else
        SKIP_ENV=false
    fi
else
    SKIP_ENV=false
fi

if [ "$SKIP_ENV" = false ]; then
    # --- Anthropic API key (required) ---
    echo ""
    echo "  Buddy needs a Claude API key from Anthropic."
    echo "  ${CYAN}Get one at: https://console.anthropic.com/settings/keys${RESET}"
    echo ""

    while true; do
        read -r -p "  Anthropic API key: " API_KEY
        if [ -z "$API_KEY" ]; then
            warn "API key cannot be empty."
        elif [[ "$API_KEY" == sk-ant-* ]]; then
            break
        else
            warn "That doesn't look like an Anthropic API key (should start with sk-ant-)."
            if ask_yn "Use it anyway?"; then
                break
            fi
        fi
    done

    # --- ElevenLabs API key (optional) ---
    echo ""
    echo "  ${CYAN}Optional:${RESET} ElevenLabs API key for text-to-speech."
    echo "  Get one at: https://elevenlabs.io/app/settings/api-keys"
    read -r -p "  ElevenLabs API key (press Enter to skip): " ELEVENLABS_KEY

    # --- Claude model selection ---
    echo ""
    echo "  Choose your default Claude model:"
    echo ""
    echo "    1) Haiku    — Fastest, cheapest"
    echo "    2) Sonnet   — Best balance ${GREEN}(Recommended)${RESET}"
    echo "    3) Opus     — Most capable, most expensive"
    echo ""

    while true; do
        read -r -p "  Enter 1, 2, or 3 (default: 2): " MODEL_CHOICE
        MODEL_CHOICE="${MODEL_CHOICE:-2}"
        case "$MODEL_CHOICE" in
            1) CLAUDE_MODEL="claude-haiku-4-5-20251001"; break ;;
            2) CLAUDE_MODEL="claude-sonnet-4-5-20250929"; break ;;
            3) CLAUDE_MODEL="claude-opus-4-5-20250501"; break ;;
            *) warn "Please enter 1, 2, or 3." ;;
        esac
    done

    ok "Model set to: $CLAUDE_MODEL"

    # --- Write .env ---
    cat > "$ENV_FILE" << EOF
ANTHROPIC_API_KEY=$API_KEY
ELEVENLABS_API_KEY=${ELEVENLABS_KEY:-}
PORT=3001
CLAUDE_MODEL=$CLAUDE_MODEL
BUDDY_ENV=production
EOF

    ok "Configuration saved to server/.env"
fi
```

Note: `TOTAL_STEPS` changes from 9 to 10 since we split project check and .env config into separate visual steps. Actually, let's keep project check as part of step 4 (no separate step counter increment) so we stay at 9 steps. The project check just prints an ok/fail line within step 4.

Wait — looking at the flow again: 1) OS, 2) Build tools, 3) Node, 4) .env config, 5) npm install, 6) build, 7) admin account, 8) Tailscale, 9) pm2+start. That's 9. The project check is a quick validation within step 4, not a separate step. Update the script to put the project check before any step (as a pre-flight), not as a numbered step.

Move the project file check up before step 1, right after the banner. Update accordingly.

**Step 2: Commit**

```bash
git add setup.sh
git commit -m "setup.sh: add project check and .env configuration step"
```

---

### Task 6: setup.sh — Steps 5-6 (npm install + build)

**Files:**
- Modify: `setup.sh` (append)

**Step 1: Add npm install and build steps**

Append to `setup.sh`:

```bash
# ─── Step 5: Install dependencies ───────────────────────────

step "Installing npm dependencies..."

run_logged "Installing server and client dependencies" npm run install:all --prefix "$SCRIPT_DIR" || \
    die "Failed to install dependencies." \
        "Check the log file and make sure you have internet access."

# ─── Step 6: Build frontend ─────────────────────────────────

step "Building the frontend..."

run_logged "Building client" npm run build --prefix "$SCRIPT_DIR" || \
    die "Failed to build the frontend." \
        "Check the log file for errors."
```

**Step 2: Commit**

```bash
git add setup.sh
git commit -m "setup.sh: add npm install and frontend build steps"
```

---

### Task 7: setup.sh — Step 7 (admin account creation)

This is the most involved step. Start the server temporarily, wait for it to be ready, prompt for credentials, POST to /auth/register, stop the server.

**Files:**
- Modify: `setup.sh` (append)

**Step 1: Add admin account creation**

Append to `setup.sh`:

```bash
# ─── Step 7: Create admin account ───────────────────────────

step "Creating admin account..."

# Check if server already has users by trying to start it briefly
info "Starting server temporarily..."

cd "$SCRIPT_DIR/server"
node index.js &
SERVER_PID=$!
cd "$SCRIPT_DIR"

# Wait for server to be ready (up to 30 seconds)
SERVER_READY=false
for i in $(seq 1 30); do
    if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
        SERVER_READY=true
        break
    fi
    sleep 1
done

if [ "$SERVER_READY" = false ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    die "Server failed to start within 30 seconds." \
        "Check the log: $LOG_FILE"
fi

ok "Server is ready"

# Check if users already exist by trying a register without auth
# If 403, users exist and we'd need admin auth — skip
TEST_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST http://localhost:3001/api/auth/register \
    -H "Content-Type: application/json" \
    -d '{"username":"__test__","password":"test","displayName":"test"}' 2>/dev/null)

if [ "$TEST_RESPONSE" = "403" ]; then
    ok "Admin account already exists — skipping."
else
    # Clean up the test user if it somehow succeeded (shouldn't happen)
    # The 403 means users exist. If we got here, no users exist yet.

    echo ""
    echo "  Let's create your admin account."
    echo ""

    # Username
    while true; do
        read -r -p "  Username (lowercase, letters/numbers/-/_): " ADMIN_USER
        ADMIN_USER=$(echo "$ADMIN_USER" | tr '[:upper:]' '[:lower:]')
        if [ -z "$ADMIN_USER" ]; then
            warn "Username cannot be empty."
        elif echo "$ADMIN_USER" | grep -qE '^[a-z0-9_-]+$'; then
            break
        else
            warn "Username must be lowercase letters, numbers, hyphens, or underscores."
        fi
    done

    # Display name
    while true; do
        read -r -p "  Display name: " ADMIN_DISPLAY
        if [ -n "$ADMIN_DISPLAY" ]; then
            break
        fi
        warn "Display name cannot be empty."
    done

    # Password
    while true; do
        read_password "Password" ADMIN_PASS
        if [ -z "$ADMIN_PASS" ]; then
            warn "Password cannot be empty."
            continue
        fi
        if [ ${#ADMIN_PASS} -lt 4 ]; then
            warn "Password must be at least 4 characters."
            continue
        fi
        read_password "Confirm password" ADMIN_PASS_CONFIRM
        if [ "$ADMIN_PASS" = "$ADMIN_PASS_CONFIRM" ]; then
            break
        fi
        warn "Passwords do not match. Try again."
    done

    # Register the admin user
    REGISTER_RESPONSE=$(curl -s -w "\n%{http_code}" \
        -X POST http://localhost:3001/api/auth/register \
        -H "Content-Type: application/json" \
        -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\",\"displayName\":\"$ADMIN_DISPLAY\"}" 2>/dev/null)

    REGISTER_HTTP=$(echo "$REGISTER_RESPONSE" | tail -1)
    REGISTER_BODY=$(echo "$REGISTER_RESPONSE" | sed '$d')

    if [ "$REGISTER_HTTP" = "201" ]; then
        ok "Admin account \"$ADMIN_USER\" created!"
    elif [ "$REGISTER_HTTP" = "409" ]; then
        warn "Username \"$ADMIN_USER\" already exists."
        ok "Skipping account creation."
    else
        warn "Account creation returned HTTP $REGISTER_HTTP"
        echo "  Response: $REGISTER_BODY" >> "$LOG_FILE"
        warn "You can create an account later at http://localhost:3001"
    fi
fi

# Stop the temporary server
kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true
info "Temporary server stopped."
```

**Important notes:**
- The `__test__` register attempt is a probe. If 403, users exist (the endpoint blocks non-admin registration when users exist). If it returns 201, that means no users exist and the test user was created as admin — that's a problem. To avoid this, we should check differently.

**Better approach:** Instead of probing with a test user, just try the real registration. If it returns 403, users already exist. Let me revise:

Actually, the cleanest approach: Just always prompt for credentials. If the register call returns 409 (username taken) or 403 (users exist, not admin), we tell the user and skip. The 403 case means setup was already run.

Revised flow:
1. Start server
2. Prompt for username, display name, password
3. POST to /auth/register
4. If 201: success
5. If 403: "Admin account already exists — skipping"
6. If 409: "Username already taken"
7. Stop server

Wait, this still prompts for credentials even when unnecessary. Better: check first by hitting a lightweight endpoint. We could add a `/api/auth/status` endpoint that returns `{ userCount: N }`. But that adds a code change.

**Simplest correct approach:** Try the register with a definitely-invalid payload first to see if we get 403 (users exist) vs 400 (validation error, meaning no users exist yet). Actually, examining the code: if `userCount > 0 && !req.user.isAdmin`, we get 403. If `userCount === 0`, it proceeds to validation. So sending an empty body when no users exist returns 400 (missing fields), vs 403 when users exist.

Revised probe:
```bash
PROBE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST http://localhost:3001/api/auth/register \
    -H "Content-Type: application/json" \
    -d '{}' 2>/dev/null)

if [ "$PROBE" = "403" ]; then
    ok "Admin account already exists — skipping."
else
    # No users yet — prompt for admin credentials
    ...
fi
```

This is clean: empty body → 403 means users exist (blocked by admin check), 400 means no users yet (hit validation). Update the task 7 code above accordingly.

**Step 2: Commit**

```bash
git add setup.sh
git commit -m "setup.sh: add admin account creation via temp server"
```

---

### Task 8: setup.sh — Step 8 (Tailscale)

**Files:**
- Modify: `setup.sh` (append)

**Step 1: Add Tailscale setup**

Append to `setup.sh`:

```bash
# ─── Step 8: Tailscale setup ────────────────────────────────

step "Setting up remote access with Tailscale..."

echo ""
echo "  Tailscale lets you securely access Buddy from any device"
echo "  (phone, laptop, tablet) without port forwarding."
echo "  ${CYAN}https://tailscale.com${RESET}"
echo ""

if ! ask_yn "Set up Tailscale now?"; then
    info "Skipping Tailscale. You can set it up later."
    info "Install: https://tailscale.com/download"
else
    # Check if Tailscale is installed
    if ! command -v tailscale &> /dev/null; then
        info "Installing Tailscale..."
        if [ "$OS" = "linux" ]; then
            run_logged "Installing Tailscale" bash -c "curl -fsSL https://tailscale.com/install.sh | sh" || \
                die "Failed to install Tailscale." "Install manually: https://tailscale.com/download/linux"
        elif [ "$OS" = "mac" ]; then
            if command -v brew &> /dev/null; then
                run_logged "Installing Tailscale via Homebrew" brew install tailscale || \
                    die "Failed to install Tailscale." "Install manually: https://tailscale.com/download/mac"
            else
                warn "Cannot auto-install Tailscale without Homebrew."
                info "Install from: https://tailscale.com/download/mac"
                info "Or install Homebrew first: https://brew.sh"
            fi
        fi
    else
        ok "Tailscale is already installed"
    fi

    # Check if connected
    if command -v tailscale &> /dev/null; then
        TS_STATUS=$(tailscale status 2>&1 || true)
        if echo "$TS_STATUS" | grep -q "Tailscale is stopped\|not logged in\|NeedsLogin"; then
            echo ""
            info "Tailscale needs to be connected. Running 'tailscale up'..."
            info "A URL will appear below — open it in your browser to log in."
            echo ""
            sudo tailscale up
            echo ""

            # Verify connection
            if tailscale status &> /dev/null 2>&1; then
                TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "")
                if [ -n "$TAILSCALE_IP" ]; then
                    ok "Tailscale connected! Your IP: ${BOLD}$TAILSCALE_IP${RESET}"
                else
                    ok "Tailscale connected!"
                fi
            else
                warn "Tailscale may not be fully connected. Check with: tailscale status"
            fi
        else
            TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "")
            if [ -n "$TAILSCALE_IP" ]; then
                ok "Tailscale is already connected (IP: ${BOLD}$TAILSCALE_IP${RESET})"
            else
                ok "Tailscale is already connected"
            fi
        fi
    fi
fi
```

**Step 2: Commit**

```bash
git add setup.sh
git commit -m "setup.sh: add interactive Tailscale setup"
```

---

### Task 9: setup.sh — Step 9 (pm2 + final summary)

**Files:**
- Modify: `setup.sh` (append)

**Step 1: Add pm2 start and summary**

Append to `setup.sh`:

```bash
# ─── Step 9: Start with pm2 ─────────────────────────────────

step "Starting Buddy..."

if ! command -v pm2 &> /dev/null; then
    info "Installing pm2 (process manager for auto-restart)..."
    run_logged "Installing pm2 globally" sudo npm install -g pm2 || \
        die "Failed to install pm2." \
            "Try running: sudo npm install -g pm2"
fi

# Stop existing instance if running
pm2 delete buddy-server >> "$LOG_FILE" 2>&1 || true

run_logged "Starting Buddy server" pm2 start "$SCRIPT_DIR/server/index.js" \
    --name buddy-server \
    --cwd "$SCRIPT_DIR/server" \
    --node-args="--env-file=.env" || \
    die "Failed to start the server." \
        "Try running manually: cd server && node index.js"

pm2 save >> "$LOG_FILE" 2>&1 || true

ok "Buddy is running!"

# Offer auto-start on boot
echo ""
if ask_yn "Start Buddy automatically when this machine boots?"; then
    info "Setting up pm2 startup..."
    STARTUP_CMD=$(pm2 startup 2>&1 | grep "sudo" | head -1)
    if [ -n "$STARTUP_CMD" ]; then
        echo "  Running: $STARTUP_CMD"
        eval "$STARTUP_CMD" >> "$LOG_FILE" 2>&1 || warn "Auto-start setup failed. Run 'pm2 startup' manually."
        pm2 save >> "$LOG_FILE" 2>&1 || true
        ok "Auto-start configured"
    else
        # pm2 startup might have worked directly
        pm2 save >> "$LOG_FILE" 2>&1 || true
        ok "Auto-start configured"
    fi
fi

# ─── Done ────────────────────────────────────────────────────

echo ""
echo "${BOLD}=========================================${RESET}"
echo "${GREEN}${BOLD}  Setup Complete!${RESET}"
echo "${BOLD}=========================================${RESET}"
echo ""
echo "  Buddy is running at:"
echo "    ${BOLD}Local:${RESET}     http://localhost:3001"
if [ -n "$TAILSCALE_IP" ]; then
    echo "    ${BOLD}Tailscale:${RESET} http://${TAILSCALE_IP}:3001"
fi
echo ""
if [ -n "${ADMIN_USER:-}" ]; then
    echo "  Admin account: ${BOLD}$ADMIN_USER${RESET}"
    echo ""
fi
if [ -n "$TAILSCALE_IP" ]; then
    echo "  ${CYAN}Access from other devices:${RESET}"
    echo "    1. Install Tailscale on that device: https://tailscale.com/download"
    echo "    2. Sign in with the ${BOLD}same account${RESET}"
    echo "    3. Open ${BOLD}http://${TAILSCALE_IP}:3001${RESET}"
    echo ""
fi
echo "  ${BOLD}Useful commands:${RESET}"
echo "    pm2 status          — check if Buddy is running"
echo "    pm2 logs            — see server logs"
echo "    pm2 restart all     — restart the server"
echo "    pm2 stop all        — stop the server"
echo ""
```

**Step 2: Commit**

```bash
git add setup.sh
git commit -m "setup.sh: add pm2 startup and final summary"
```

---

### Task 10: Cleanup and final verification

**Files:**
- Possibly modify: `setup.sh` (fix any issues found)
- Delete or keep: `ecosystem.config.cjs` (no longer referenced by setup.sh, but harmless)

**Step 1: Review the full setup.sh for correctness**

Read through the entire script end-to-end. Check:
- `TOTAL_STEPS` matches actual number of steps (should be 9)
- `SCRIPT_DIR` is used consistently for paths
- Project check happens before Step 1 (pre-flight)
- All variables are quoted properly
- `set -euo pipefail` won't cause false failures on intentional non-zero exits (use `|| true` where needed)
- Password variables are not logged anywhere
- The temp server is always cleaned up (even on error — consider adding a trap)

**Step 2: Add cleanup trap**

Near the top of the script (after `SERVER_PID` would be set), add:

```bash
cleanup() {
    if [ -n "${SERVER_PID:-}" ]; then
        kill "$SERVER_PID" 2>/dev/null || true
        wait "$SERVER_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT
```

This ensures the temp server is always stopped, even if the script errors out.

**Step 3: Test idempotency**

Run `bash setup.sh` twice. Second run should:
- Skip build tools (already installed)
- Skip Node (already installed)
- Ask about keeping .env (say yes)
- Run npm install (fast, deps cached)
- Build frontend (idempotent)
- Skip admin creation (users exist → 403 probe)
- Skip Tailscale (already connected)
- Restart pm2 instance

**Step 4: Final commit**

```bash
git add setup.sh
git commit -m "setup.sh: add cleanup trap, final polish"
```

---

### Task 11: Update .env.example and commit

**Files:**
- Modify: `server/.env.example`

**Step 1: Update .env.example**

This was Task 1 but doing it alongside the other changes makes more sense as a final commit.

**Step 2: Commit all remaining changes**

```bash
git add server/.env.example setup.sh
git commit -m "Complete setup installer rewrite

Remove Docker sandbox steps, add ElevenLabs API key support,
Claude model selection, admin account creation, and interactive
Tailscale setup. Default to production environment."
```
