#!/bin/bash

# ─────────────────────────────────────────────────────────────
# Buddy Setup Script
# Run this after cloning the repo to get everything running.
# Usage: bash setup.sh
# ─────────────────────────────────────────────────────────────

set -e

echo ""
echo "========================================="
echo "  Buddy — Setup Script"
echo "========================================="
echo ""

# ─── Check prerequisites ──────────────────────────────────────

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed."
    echo ""
    echo "Install it first:"
    echo "  Ubuntu/Debian:  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs"
    echo "  Mac:            brew install node"
    echo "  Or visit:       https://nodejs.org"
    echo ""
    exit 1
fi

NODE_VERSION=$(node -v)
echo "Node.js found: $NODE_VERSION"

# Check for npm
if ! command -v npm &> /dev/null; then
    echo "ERROR: npm is not installed. It usually comes with Node.js."
    exit 1
fi

echo "npm found: $(npm -v)"
echo ""

# ─── Install dependencies ─────────────────────────────────────

echo "Installing dependencies..."
npm run install:all
echo ""
echo "Dependencies installed."
echo ""

# ─── Configure environment ─────────────────────────────────────

if [ -f server/.env ]; then
    echo "server/.env already exists. Skipping configuration."
    echo "  (Edit server/.env manually if you need to change settings)"
    echo ""
else
    echo "─────────────────────────────────────────"
    echo "  Configuration"
    echo "─────────────────────────────────────────"
    echo ""
    echo "You need a Claude API key from Anthropic."
    echo "Get one at: https://console.anthropic.com/settings/keys"
    echo ""
    read -p "Paste your Anthropic API key: " API_KEY

    if [ -z "$API_KEY" ]; then
        echo "ERROR: API key is required."
        exit 1
    fi

    cat > server/.env << EOF
ANTHROPIC_API_KEY=$API_KEY
PORT=3001
CLAUDE_MODEL=claude-sonnet-4-5-20250929
AUTH_TOKEN=
EOF

    echo ""
    echo "server/.env created."
    echo ""
fi

# ─── Build the client ──────────────────────────────────────────

echo "Building the client..."
npm run build
echo ""
echo "Client built."
echo ""

# ─── Install and configure pm2 ─────────────────────────────────

echo "Setting up pm2 (process manager)..."

if ! command -v pm2 &> /dev/null; then
    echo "Installing pm2..."
    npm install -g pm2
fi

# Stop existing instance if running
pm2 delete buddy-server 2>/dev/null || true

# Start the server
pm2 start ecosystem.config.cjs
pm2 save

echo ""
echo "========================================="
echo "  Setup Complete!"
echo "========================================="
echo ""
echo "Buddy is running on: http://localhost:3001"
echo ""
echo "NEXT STEPS:"
echo ""
echo "1. Open http://localhost:3001 in your browser to test it."
echo ""
echo "2. To access from other devices, install Tailscale:"
echo "   https://tailscale.com/download"
echo "   Then run: tailscale up"
echo "   Your Tailscale IP: run 'tailscale ip' to find it"
echo "   Access from other devices at: http://<tailscale-ip>:3001"
echo ""
echo "3. To make Buddy start on boot, run this command:"
echo "   pm2 startup"
echo "   Then copy and run the command it gives you."
echo ""
echo "USEFUL COMMANDS:"
echo "  pm2 status          - check if Buddy is running"
echo "  pm2 logs            - see server logs"
echo "  pm2 restart all     - restart the server"
echo "  pm2 stop all        - stop the server"
echo ""
