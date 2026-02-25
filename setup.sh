#!/bin/bash

# ─────────────────────────────────────────────────────────────
# Buddy — Guided Installer
# Takes you from git clone to a running Buddy instance.
# Usage: bash setup.sh
# ─────────────────────────────────────────────────────────────

set -euo pipefail

TOTAL_STEPS=10
CURRENT_STEP=0
LOG_FILE="$HOME/buddy-setup.log"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TAILSCALE_IP=""
SERVER_PID=""
ADMIN_USERNAME=""

# ─── Color & formatting helpers ──────────────────────────────

if [ -t 1 ] && command -v tput &>/dev/null && [ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ] 2>/dev/null; then
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

# Ask a yes/no question. Returns 0 for yes, 1 for no.
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

# Run a command, show a summary on success/failure, log full output.
run_logged() {
    local label="$1"
    shift
    echo "  Running: $label"
    {
        echo ""
        echo "=== $label ==="
        echo "Command: $*"
        echo "Time: $(date)"
    } >> "$LOG_FILE"
    if "$@" >> "$LOG_FILE" 2>&1; then
        ok "$label"
        return 0
    else
        fail "$label"
        echo "  See log for details: $LOG_FILE"
        return 1
    fi
}

# Read a password with hidden input.
read_password() {
    local prompt="$1"
    local varname="$2"
    local password_input
    printf "  %s (typing is hidden): " "$prompt"
    read -r -s password_input
    echo ""
    eval "$varname=\$password_input"
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

# Cleanup: kill temp server if running
cleanup() {
    stty echo 2>/dev/null || true
    if [ -n "$SERVER_PID" ]; then
        kill "$SERVER_PID" 2>/dev/null || true
        wait "$SERVER_PID" 2>/dev/null || true
    fi
}

trap cleanup EXIT

# ─── Banner ──────────────────────────────────────────────────

echo ""
echo "${BOLD}=========================================${RESET}"
echo "${BOLD}  Buddy — Guided Installer${RESET}"
echo "${BOLD}=========================================${RESET}"
echo ""
echo "  This script will install everything Buddy needs to get up"
echo "  and running. It will ask before installing anything."
echo ""
echo "  Log file: $LOG_FILE"

{
    echo "=== Buddy Setup Started ==="
    echo "Date: $(date)"
    echo "User: $(whoami)"
    echo "Script dir: $SCRIPT_DIR"
    echo ""
} > "$LOG_FILE"

# ─── Root check ──────────────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
    die "This script must be run as root." \
        "Try: sudo bash setup.sh"
fi

# ─── Pre-flight checks ──────────────────────────────────────

if [ ! -f "$SCRIPT_DIR/package.json" ] || [ ! -d "$SCRIPT_DIR/server" ] || [ ! -d "$SCRIPT_DIR/client" ]; then
    die "Missing project files (package.json, server/, client/)." \
        "Make sure you're running this from the buddy project directory."
fi

# ─── Step 1: Detect OS ──────────────────────────────────────

step "Detecting operating system..."

OS=""
DISTRO=""

case "$(uname -s)" in
    Linux*)
        OS="linux"
        if [ -f /etc/os-release ]; then
            # shellcheck source=/dev/null
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

{
    echo "OS=$OS"
    echo "DISTRO=$DISTRO"
} >> "$LOG_FILE"

# ─── Step 2: Create buddy user ──────────────────────────────

step "Creating buddy system user..."

if id buddy &>/dev/null; then
    ok "User 'buddy' already exists"
else
    useradd --system --create-home --shell /bin/bash buddy
    ok "Created user 'buddy' with home at /home/buddy"
fi

BUDDY_HOME="/home/buddy/.buddy"
mkdir -p "$BUDDY_HOME"
chown buddy:buddy "$BUDDY_HOME"
ok "Data directory ready: $BUDDY_HOME"

# ─── Step 3: Check/install build tools ──────────────────────

step "Checking build tools (needed for native modules)..."

NEED_BUILD_TOOLS=false

if [ "$OS" = "linux" ]; then
    if ! dpkg -s build-essential &>/dev/null || ! command -v python3 &>/dev/null; then
        NEED_BUILD_TOOLS=true
    fi
elif [ "$OS" = "mac" ]; then
    if ! xcode-select -p &>/dev/null; then
        NEED_BUILD_TOOLS=true
    fi
fi

if [ "$NEED_BUILD_TOOLS" = true ]; then
    warn "Build tools are needed to compile native modules (better-sqlite3)."
    if ask_yn "Install build tools now?"; then
        if [ "$OS" = "linux" ]; then
            run_logged "Updating package lists" apt-get update -y || \
                die "Failed to update package lists." "Check your internet connection and try again."
            run_logged "Installing build-essential and python3" apt-get install -y build-essential python3 || \
                die "Failed to install build tools." "Try running: apt-get install -y build-essential python3"
        elif [ "$OS" = "mac" ]; then
            info "This will open an Xcode Command Line Tools installer dialog."
            info "Click 'Install' in the dialog, then wait for it to finish."
            xcode-select --install 2>>"$LOG_FILE" || true
            echo "  Waiting for Xcode Command Line Tools installation..."
            until xcode-select -p &>/dev/null; do
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

# ─── Step 4: Check/install Node.js 18+ ──────────────────────

step "Checking Node.js..."

install_node() {
    if [ "$OS" = "linux" ]; then
        run_logged "Adding NodeSource repository" bash -c "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -" || \
            die "Failed to add NodeSource repository." "Check your internet connection."
        run_logged "Installing Node.js 20" apt-get install -y nodejs || \
            die "Failed to install Node.js."
    elif [ "$OS" = "mac" ]; then
        if command -v brew &>/dev/null; then
            run_logged "Installing Node.js 20 via Homebrew" brew install node@20 || \
                die "Failed to install Node.js via Homebrew."
        else
            die "Homebrew is required to install Node.js on macOS." \
                "Install Homebrew first: /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        fi
    fi
    ok "Node.js $(node -v) installed"
}

if command -v node &>/dev/null; then
    NODE_VER=$(node -v)
    NODE_MAJOR=$(echo "$NODE_VER" | sed 's/^v//' | cut -d. -f1)
    if [ "$NODE_MAJOR" -ge 18 ] 2>/dev/null; then
        ok "Node.js ${NODE_VER} found (meets requirement: v18+)"
    else
        warn "Node.js ${NODE_VER} found but v18+ is required."
        if ask_yn "Install Node.js 20?"; then
            install_node
        else
            die "Node.js 18+ is required." "Install it manually and re-run this script."
        fi
    fi
else
    warn "Node.js is not installed."
    if ask_yn "Install Node.js 20 now?"; then
        install_node
    else
        die "Node.js is required to run Buddy." "Install it manually and re-run this script."
    fi
fi

# Verify npm is available
if ! command -v npm &>/dev/null; then
    die "npm not found (it should come with Node.js)." \
        "Try reinstalling Node.js."
fi

# ─── Step 5: Configure environment ───────────────────────────

step "Configuring environment..."

SKIP_ENV=false

# Check for existing .env in current install or source directory
ENV_CHECK_PATH=""
if [ -f "/opt/buddy/server/.env" ]; then
    ENV_CHECK_PATH="/opt/buddy/server/.env"
elif [ -f "$SCRIPT_DIR/server/.env" ]; then
    ENV_CHECK_PATH="$SCRIPT_DIR/server/.env"
fi

if [ -n "$ENV_CHECK_PATH" ]; then
    EXISTING_KEY=$(grep -o 'ANTHROPIC_API_KEY=.*' "$ENV_CHECK_PATH" 2>/dev/null | cut -d= -f2 || true)
    if [ -n "$EXISTING_KEY" ] && [ "$EXISTING_KEY" != "sk-ant-..." ]; then
        ok "API key already configured in ${ENV_CHECK_PATH}"
        if ask_yn "Keep the existing configuration?"; then
            info "Keeping existing configuration."
            SKIP_ENV=true
        fi
    else
        info "${ENV_CHECK_PATH} exists but API key is not set."
    fi
fi

if [ "$SKIP_ENV" = false ]; then
    # Anthropic API key (required)
    echo ""
    echo "  Buddy needs a Claude API key from Anthropic."
    echo "  ${CYAN}Get one at: https://console.anthropic.com/settings/keys${RESET}"
    echo ""

    API_KEY=""
    while true; do
        read -r -p "  Paste your Anthropic API key: " API_KEY
        if [ -z "$API_KEY" ]; then
            warn "API key cannot be empty. Please try again."
        elif [[ "$API_KEY" == sk-ant-* ]]; then
            break
        else
            warn "That doesn't look like an Anthropic API key (should start with sk-ant-)."
            if ask_yn "Use it anyway?"; then
                break
            fi
        fi
    done

    # ElevenLabs API key (optional)
    echo ""
    ELEVENLABS_KEY=""
    read -r -p "  ElevenLabs API key (press Enter to skip): " ELEVENLABS_KEY

    # Model selection
    echo ""
    echo "  Select a default Claude model (you can change this later in server/.env):"
    echo "    ${BOLD}1${RESET}) Haiku   — fast and cheap       (claude-haiku-4-5-20251001)"
    echo "    ${BOLD}2${RESET}) Sonnet  — balanced (default)   (claude-sonnet-4-5-20250929)"
    echo "    ${BOLD}3${RESET}) Opus    — most capable         (claude-opus-4-5-20250501)"
    echo ""

    MODEL_CHOICE=""
    read -r -p "  Choose [1/2/3] (default: 2): " MODEL_CHOICE

    case "$MODEL_CHOICE" in
        1) CLAUDE_MODEL="claude-haiku-4-5-20251001" ;;
        3) CLAUDE_MODEL="claude-opus-4-5-20250501" ;;
        *) CLAUDE_MODEL="claude-sonnet-4-5-20250929" ;;
    esac

    # Values will be written to /opt/buddy/server/.env during the install step
    ok "Environment configured (model: ${CLAUDE_MODEL})"
fi

# ─── Step 6: Install application to /opt/buddy/ ─────────────

step "Installing application to /opt/buddy/..."

if [ -d "/opt/buddy" ]; then
    info "Updating existing installation..."
    # Preserve .env if it exists
    if [ -f "/opt/buddy/server/.env" ]; then
        cp /opt/buddy/server/.env /tmp/buddy-env-backup
    fi
    rm -rf /opt/buddy
fi

cp -r "$SCRIPT_DIR" /opt/buddy
# Remove setup artifacts that don't belong in the install
rm -f /opt/buddy/setup.sh
chown -R root:root /opt/buddy
chmod -R 755 /opt/buddy

# Restore or write .env
if [ -f /tmp/buddy-env-backup ] && [ "$SKIP_ENV" = true ]; then
    mv /tmp/buddy-env-backup /opt/buddy/server/.env
    ok "Restored existing .env"
elif [ "$SKIP_ENV" = false ]; then
    {
        printf 'ANTHROPIC_API_KEY=%s\n' "$API_KEY"
        printf 'ELEVENLABS_API_KEY=%s\n' "${ELEVENLABS_KEY:-}"
        printf 'PORT=3001\n'
        printf 'CLAUDE_MODEL=%s\n' "$CLAUDE_MODEL"
        printf 'BUDDY_ENV=production\n'
    } > /opt/buddy/server/.env
fi

# .env must be readable by buddy user
chmod 640 /opt/buddy/server/.env
chown root:buddy /opt/buddy/server/.env

ok "Application installed to /opt/buddy/"

# ─── Step 7: Install npm dependencies ───────────────────────

step "Installing npm dependencies..."

run_logged "Installing server and client dependencies" npm --prefix /opt/buddy run install:all || \
    die "Failed to install dependencies." \
        "Check the log file and make sure you have internet access."

# ─── Step 8: Build frontend ─────────────────────────────────

step "Building the frontend..."

run_logged "Building client" npm --prefix /opt/buddy run build || \
    die "Failed to build the frontend." \
        "Check the log file for errors."

# ─── Step 9: Create admin account ────────────────────────────

step "Creating admin account..."

# Start server in background as buddy user (BUDDY_SKIP_SETUP=1 skips interactive CLI prompts,
# exec replaces subshell so SERVER_PID = node PID)
(cd /opt/buddy/server && exec sudo -u buddy env NODE_ENV=production BUDDY_SKIP_SETUP=1 node index.js) >> "$LOG_FILE" 2>&1 &
SERVER_PID=$!

# Wait up to 30 seconds for server to be ready
info "Waiting for server to start..."
SERVER_READY=false
for _ in $(seq 1 30); do
    if curl -s http://localhost:3001/api/health >/dev/null 2>&1; then
        SERVER_READY=true
        break
    fi
    sleep 1
done

if [ "$SERVER_READY" = false ]; then
    die "Server did not start within 30 seconds." \
        "Check the log or try: cd server && node index.js"
fi

ok "Server started"

# Check if users already exist
REGISTER_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3001/api/auth/register \
    -H "Content-Type: application/json" -d '{}')

if [ "$REGISTER_STATUS" = "403" ]; then
    ok "Admin account already exists — skipping."
elif [ "$REGISTER_STATUS" = "400" ]; then
    # No users yet, create the first admin
    info "No users found. Let's create the admin account."
    echo ""

    # Username
    while true; do
        read -r -p "  Username (lowercase, alphanumeric): " ADMIN_USERNAME
        if [ -z "$ADMIN_USERNAME" ]; then
            warn "Username cannot be empty."
        elif [[ "$ADMIN_USERNAME" =~ ^[a-z0-9_-]+$ ]]; then
            break
        else
            warn "Username must be lowercase letters, numbers, hyphens, or underscores."
        fi
    done

    # Display name
    ADMIN_DISPLAY=""
    while true; do
        read -r -p "  Display name: " ADMIN_DISPLAY
        if [ -n "$ADMIN_DISPLAY" ]; then
            break
        fi
        warn "Display name cannot be empty."
    done

    # Password
    while true; do
        read_password "Password (min 4 chars)" ADMIN_PASS
        if [ ${#ADMIN_PASS} -lt 4 ]; then
            warn "Password must be at least 4 characters."
            continue
        fi
        read_password "Confirm password" ADMIN_PASS_CONFIRM
        if [ "$ADMIN_PASS" != "$ADMIN_PASS_CONFIRM" ]; then
            warn "Passwords do not match. Try again."
            continue
        fi
        break
    done

    # Build JSON body safely — username is validated alphanumeric,
    # but password and display name can contain special characters.
    if command -v python3 &>/dev/null; then
        JSON_PASS=$(printf '%s' "$ADMIN_PASS" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')
        JSON_DISPLAY=$(printf '%s' "$ADMIN_DISPLAY" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')
    else
        # Fallback: escape backslashes and double quotes.
        # Safe because read -r -s captures a single line (no newlines/tabs).
        ESCAPED_PASS=$(printf '%s' "$ADMIN_PASS" | sed 's/\\/\\\\/g; s/"/\\"/g')
        JSON_PASS="\"${ESCAPED_PASS}\""
        ESCAPED_DISPLAY=$(printf '%s' "$ADMIN_DISPLAY" | sed 's/\\/\\\\/g; s/"/\\"/g')
        JSON_DISPLAY="\"${ESCAPED_DISPLAY}\""
    fi

    JSON_BODY="{\"username\":\"${ADMIN_USERNAME}\",\"password\":${JSON_PASS},\"displayName\":${JSON_DISPLAY}}"

    REGISTER_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3001/api/auth/register \
        -H "Content-Type: application/json" \
        -d "$JSON_BODY")

    REGISTER_CODE=$(echo "$REGISTER_RESPONSE" | tail -n 1)
    REGISTER_BODY=$(echo "$REGISTER_RESPONSE" | sed '$d')

    case "$REGISTER_CODE" in
        201)
            ok "Admin account '${ADMIN_USERNAME}' created successfully!"
            ;;
        409)
            warn "Username '${ADMIN_USERNAME}' is already taken."
            ;;
        *)
            warn "Unexpected response (HTTP ${REGISTER_CODE}). You may need to create an account manually."
            echo "  Response: ${REGISTER_BODY}" >> "$LOG_FILE"
            ;;
    esac
else
    warn "Unexpected response from server (HTTP ${REGISTER_STATUS}). Skipping account creation."
    info "You can create an account by visiting http://localhost:3001 after setup."
fi

# Stop temp server
if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    SERVER_PID=""
fi

unset ADMIN_PASS ADMIN_PASS_CONFIRM JSON_PASS ESCAPED_PASS JSON_BODY password_input 2>/dev/null || true

info "Temporary server stopped."

# ─── Tailscale setup (optional, part of Step 9) ──────────────

echo ""
echo "${BOLD}Remote access via Tailscale...${RESET}"
echo ""
echo "  Tailscale lets you securely access Buddy from your phone, laptop,"
echo "  or any device — anywhere in the world — without opening ports or"
echo "  configuring your router. It creates a private network between your"
echo "  devices using WireGuard."
echo ""

if ask_yn "Set up Tailscale for remote access?"; then
    # Check if installed
    if ! command -v tailscale &>/dev/null; then
        info "Tailscale is not installed."
        if ask_yn "Install Tailscale now?"; then
            if [ "$OS" = "linux" ]; then
                run_logged "Installing Tailscale" bash -c "curl -fsSL https://tailscale.com/install.sh | sh" || \
                    die "Failed to install Tailscale." "Try installing manually: https://tailscale.com/download"
            elif [ "$OS" = "mac" ]; then
                if command -v brew &>/dev/null; then
                    run_logged "Installing Tailscale via Homebrew" brew install tailscale || \
                        die "Failed to install Tailscale." "Try installing manually: https://tailscale.com/download"
                else
                    warn "Cannot install Tailscale without Homebrew."
                    info "Install manually: https://tailscale.com/download"
                fi
            fi
        else
            info "Skipping Tailscale installation."
        fi
    fi

    # If tailscale is now available, ensure daemon is running and connect
    if command -v tailscale &>/dev/null; then
        # On Linux, ensure tailscaled service is running after fresh install
        if [ "$OS" = "linux" ] && command -v systemctl &>/dev/null; then
            systemctl enable --now tailscaled >> "$LOG_FILE" 2>&1 || true
        fi

        # Check if already connected by trying to get an IP
        TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || true)
        if [ -z "$TAILSCALE_IP" ]; then
            info "Tailscale is not connected. Running 'tailscale up'..."
            info "A URL will appear below — open it in your browser to log in."
            echo ""
            tailscale up
            echo ""

            # Check again after auth
            TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || true)
        fi

        if [ -n "$TAILSCALE_IP" ]; then
            ok "Tailscale connected! IP: ${BOLD}${TAILSCALE_IP}${RESET}"
        else
            warn "Could not get Tailscale IP. Check 'tailscale status' after setup."
        fi
    fi
else
    info "Skipping Tailscale. You can set it up later: https://tailscale.com/download"
fi

# ─── Step 10: Install systemd service ────────────────────────

step "Installing systemd service..."

cat > /etc/systemd/system/buddy.service << 'UNIT'
[Unit]
Description=Buddy AI Agent
After=network.target

[Service]
Type=simple
User=buddy
Group=buddy
WorkingDirectory=/opt/buddy/server
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/home/buddy/.buddy
ProtectHome=tmpfs

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable buddy
systemctl start buddy

# Verify it started
sleep 2
if systemctl is-active --quiet buddy; then
    ok "Buddy service is running"
else
    fail "Service failed to start"
    info "Check logs: journalctl -u buddy -n 50"
fi

# ─── Done ────────────────────────────────────────────────────

echo ""
echo "${BOLD}=========================================${RESET}"
echo "${GREEN}${BOLD}  Setup Complete!${RESET}"
echo "${BOLD}=========================================${RESET}"
echo ""
echo "  ${BOLD}Buddy is running at:${RESET}"
echo ""
echo "    Local:      ${BOLD}http://localhost:3001${RESET}"

if [ -n "$TAILSCALE_IP" ]; then
    echo "    Tailscale:  ${BOLD}http://${TAILSCALE_IP}:3001${RESET}"
fi

echo ""

if [ -n "$ADMIN_USERNAME" ]; then
    echo "  ${BOLD}Admin account:${RESET} ${ADMIN_USERNAME}"
    echo ""
fi

echo "  Open the URL above in a browser to start talking to Buddy."
echo ""

if [ -n "$TAILSCALE_IP" ]; then
    echo "  ${BOLD}Accessing from other devices:${RESET}"
    echo "    1. Install Tailscale on your phone/laptop: https://tailscale.com/download"
    echo "    2. Sign in with the same account you used above"
    echo "    3. Open ${BOLD}http://${TAILSCALE_IP}:3001${RESET} on that device"
    echo ""
fi

echo "  ${BOLD}Useful commands:${RESET}"
echo "    systemctl status buddy   — check if Buddy is running"
echo "    journalctl -u buddy -f   — follow server logs"
echo "    systemctl restart buddy  — restart the server"
echo "    systemctl stop buddy     — stop the server"
echo ""
