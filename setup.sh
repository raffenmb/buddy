#!/bin/bash

# ─────────────────────────────────────────────────────────────
# Buddy — Zero-Friction Guided Installer
# Detects your OS, installs prerequisites, and gets Buddy running.
# Usage: bash setup.sh
# ─────────────────────────────────────────────────────────────

TOTAL_STEPS=10
CURRENT_STEP=0
LOG_FILE="$HOME/buddy-setup.log"

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

die() {
    echo ""
    fail "$1"
    if [ -n "$2" ]; then
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
            # Wait for the install to finish
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

# ─── Step 3: Install Node.js ────────────────────────────────

step "Checking Node.js..."

if command -v node &> /dev/null; then
    NODE_VER=$(node -v)
    # Check if version is 18+
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

# Verify npm is available
if ! command -v npm &> /dev/null; then
    die "npm not found (it should come with Node.js)." \
        "Try reinstalling Node.js."
fi

# ─── Step 4: Install Docker ─────────────────────────────────

step "Checking Docker..."

DOCKER_AVAILABLE=false
DOCKER_JUST_INSTALLED=false

if command -v docker &> /dev/null; then
    if docker info &> /dev/null 2>&1; then
        ok "Docker is installed and running"
        DOCKER_AVAILABLE=true
    else
        warn "Docker is installed but not running or you don't have permission."
        if [ "$OS" = "linux" ]; then
            info "Trying to start Docker..."
            if sudo systemctl start docker 2>> "$LOG_FILE"; then
                # Also check if user is in docker group
                if docker info &> /dev/null 2>&1; then
                    ok "Docker started successfully"
                    DOCKER_AVAILABLE=true
                else
                    warn "Docker is running but your user can't access it."
                    info "Adding you to the docker group..."
                    sudo usermod -aG docker "$USER" 2>> "$LOG_FILE"
                    warn "You've been added to the docker group."
                    warn "You need to log out and log back in for this to take effect."
                    warn "After logging back in, re-run: bash setup.sh"
                    info "The script will continue without Docker for now."
                fi
            else
                warn "Could not start Docker. Continuing without sandbox features."
            fi
        elif [ "$OS" = "mac" ]; then
            warn "Please start Docker Desktop and re-run this script."
            info "Continuing without Docker for now."
        fi
    fi
else
    warn "Docker is not installed."
    info "Docker is used for the sandbox feature (lets Buddy run code safely)."
    info "Buddy will work without it, but sandbox features will be disabled."
    echo ""
    if ask_yn "Install Docker now?"; then
        if [ "$OS" = "linux" ]; then
            run_logged "Installing Docker" bash -c "curl -fsSL https://get.docker.com | sh" || \
                die "Failed to install Docker." "Try installing manually: https://docs.docker.com/engine/install/"
            DOCKER_JUST_INSTALLED=true

            # Add user to docker group
            info "Adding your user to the docker group..."
            sudo usermod -aG docker "$USER" 2>> "$LOG_FILE"

            # Start Docker
            run_logged "Starting Docker" sudo systemctl start docker || \
                warn "Could not start Docker automatically."

            # Try to activate the group without requiring re-login
            # We'll use sg to run subsequent docker commands in this script
            if sg docker -c "docker info" &> /dev/null 2>&1; then
                ok "Docker installed and accessible"
                DOCKER_AVAILABLE=true
            else
                warn "Docker installed but requires logout/login to use without sudo."
                warn "After setup finishes, log out, log back in, and run: bash setup.sh"
                info "The script will continue — Docker sandbox will be set up on next run."
            fi
        elif [ "$OS" = "mac" ]; then
            if command -v brew &> /dev/null; then
                run_logged "Installing Docker Desktop via Homebrew" brew install --cask docker || \
                    die "Failed to install Docker Desktop." "Download manually: https://docker.com/products/docker-desktop"
                warn "Docker Desktop has been installed but needs to be started."
                info "Open Docker Desktop from your Applications folder, then re-run this script."
                info "Continuing without Docker for now."
            else
                warn "Cannot auto-install Docker Desktop without Homebrew."
                info "Download Docker Desktop: https://docker.com/products/docker-desktop"
                info "Or install Homebrew first: https://brew.sh"
                info "Continuing without Docker for now."
            fi
        fi
    else
        info "Skipping Docker. Buddy will work, but sandbox features will be disabled."
        info "You can install Docker later and re-run this script."
    fi
fi

# ─── Step 5: Clone check ────────────────────────────────────

step "Checking project files..."

if [ ! -f "package.json" ] || [ ! -d "server" ] || [ ! -d "client" ]; then
    die "This script must be run from the buddy project directory." \
        "Run: cd buddy && bash setup.sh"
fi

ok "Project files found"

# ─── Step 6: API key configuration ───────────────────────────

step "Configuring API key..."

if [ -f server/.env ]; then
    # Check if the key is actually set (not just the placeholder)
    EXISTING_KEY=$(grep -o 'ANTHROPIC_API_KEY=.*' server/.env 2>/dev/null | cut -d= -f2)
    if [ -n "$EXISTING_KEY" ] && [ "$EXISTING_KEY" != "sk-ant-..." ]; then
        ok "API key already configured in server/.env"
        if ask_yn "Keep the existing API key?"; then
            info "Keeping existing configuration."
        else
            rm server/.env
        fi
    else
        info "server/.env exists but API key is not set."
        rm server/.env
    fi
fi

if [ ! -f server/.env ]; then
    echo ""
    echo "  Buddy needs a Claude API key from Anthropic."
    echo "  ${CYAN}Get one at: https://console.anthropic.com/settings/keys${RESET}"
    echo "  You'll need to add a payment method (API calls cost a few cents each)."
    echo ""

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

    cat > server/.env << EOF
ANTHROPIC_API_KEY=$API_KEY
PORT=3001
CLAUDE_MODEL=claude-sonnet-4-5-20250929
AUTH_TOKEN=
EOF

    ok "API key saved to server/.env"
fi

# ─── Step 7: Install npm dependencies ────────────────────────

step "Installing npm dependencies..."

run_logged "Installing server and client dependencies" npm run install:all || \
    die "Failed to install dependencies." \
        "Check the log file and make sure you have internet access."

# ─── Step 8: Build frontend ─────────────────────────────────

step "Building the frontend..."

run_logged "Building client" npm run build || \
    die "Failed to build the frontend." \
        "Check the log file for errors."

# ─── Step 9: Start Docker sandbox ────────────────────────────

step "Setting up Docker sandbox..."

if [ "$DOCKER_AVAILABLE" = true ]; then
    # Use sg if Docker was just installed on Linux (group not yet active in this shell)
    DOCKER_CMD="docker compose up -d --build"
    if [ "$DOCKER_JUST_INSTALLED" = true ] && [ "$OS" = "linux" ]; then
        run_logged "Building and starting sandbox container" sg docker -c "$DOCKER_CMD" || \
            warn "Failed to start sandbox. You can retry after logging out and back in."
    else
        run_logged "Building and starting sandbox container" $DOCKER_CMD || \
            warn "Failed to start sandbox. Check Docker and retry."
    fi

    # Seed workspace.json if first run
    SEED_CMD="docker exec buddy-sandbox sh -c 'test -f /agent/knowledge/workspace.json || cat > /agent/knowledge/workspace.json << WSJSON
{
  \"version\": 1,
  \"description\": \"Agent self-managed index of the workspace\",
  \"folders\": {},
  \"notes\": []
}
WSJSON'"

    if [ "$DOCKER_JUST_INSTALLED" = true ] && [ "$OS" = "linux" ]; then
        sg docker -c "$SEED_CMD" >> "$LOG_FILE" 2>&1 || true
    else
        eval "$SEED_CMD" >> "$LOG_FILE" 2>&1 || true
    fi

    ok "Docker sandbox running"
else
    warn "Docker not available — skipping sandbox setup."
    info "Buddy will work, but sandbox features will be disabled."
    info "Install/start Docker and re-run this script to enable sandbox."
fi

# ─── Step 10: Install pm2 + start server ─────────────────────

step "Starting Buddy with pm2..."

if ! command -v pm2 &> /dev/null; then
    info "Installing pm2 (process manager)..."
    run_logged "Installing pm2 globally" npm install -g pm2 || \
        die "Failed to install pm2." \
            "Try running: sudo npm install -g pm2"
fi

# Stop existing instance if running
pm2 delete buddy-server >> "$LOG_FILE" 2>&1 || true

run_logged "Starting Buddy server" pm2 start ecosystem.config.cjs || \
    die "Failed to start the server." \
        "Try running manually: cd server && node index.js"

pm2 save >> "$LOG_FILE" 2>&1 || true

ok "Buddy is running!"

# ─── Done ────────────────────────────────────────────────────

echo ""
echo "${BOLD}=========================================${RESET}"
echo "${GREEN}${BOLD}  Setup Complete!${RESET}"
echo "${BOLD}=========================================${RESET}"
echo ""
echo "  Buddy is running at: ${BOLD}http://localhost:3001${RESET}"
echo ""
echo "  Open that URL in a browser to start talking to Buddy."
echo ""
echo "  ${BOLD}Next steps:${RESET}"
echo ""
echo "  1. ${CYAN}Access from your phone/other devices:${RESET}"
echo "     Install Tailscale on this machine and your devices."
echo "     https://tailscale.com/download"
echo ""
echo "  2. ${CYAN}Auto-start on reboot:${RESET}"
echo "     Run: ${BOLD}pm2 startup${RESET}"
echo "     Then copy and run the command it gives you."
echo ""
echo "  ${BOLD}Useful commands:${RESET}"
echo "    pm2 status          — check if Buddy is running"
echo "    pm2 logs            — see server logs"
echo "    pm2 restart all     — restart the server"
echo "    pm2 stop all        — stop the server"
echo ""
if [ "$DOCKER_AVAILABLE" != true ]; then
    echo "  ${YELLOW}Note:${RESET} Docker sandbox was not set up."
    echo "  Install Docker and re-run ${BOLD}bash setup.sh${RESET} to enable it."
    echo ""
fi
