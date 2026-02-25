# Non-Root Deployment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Run Buddy as an unprivileged `buddy` Linux user with no privilege escalation path, automated through the existing `setup.sh` installer.

**Architecture:** The setup script runs as root, creates a `buddy` system user, installs the app to `/opt/buddy/` (root-owned, read-only), and launches it via a hardened systemd service. The app itself refuses to run as root and blocks privilege escalation commands at the guard layer.

**Tech Stack:** Bash (setup.sh), systemd, Node.js (server startup check), existing guard system

---

### Task 1: Add Privilege Escalation Commands to Blocked Guards

**Files:**
- Modify: `server/config.js:51-58` (the `blocked_commands` array in `DEFAULT_GUARDS`)

**Step 1: Add the new blocked commands**

In `server/config.js`, add `sudo`, `su`, `pkexec`, `doas`, and `runuser` to the `blocked_commands` array inside `DEFAULT_GUARDS`:

```javascript
  blocked_commands: [
    "shutdown",
    "reboot",
    "poweroff",
    "halt",
    "iptables",
    "ip6tables",
    "sudo",
    "su",
    "pkexec",
    "doas",
    "runuser",
  ],
```

**Step 2: Verify the change**

Start the server locally and confirm it boots without errors:

Run: `cd server && node index.js`
Expected: Server starts normally on port 3001. Press Ctrl+C to stop.

Note: This only affects newly-generated `guards.json` files (first run on a fresh install). Existing installs keep their current `guards.json`. This is correct behavior — we don't want to overwrite user customizations.

**Step 3: Commit**

```bash
git add server/config.js
git commit -m "feat: block privilege escalation commands (sudo, su, pkexec, doas, runuser)"
```

---

### Task 2: Add Root User Startup Check

**Files:**
- Modify: `server/index.js:1-8` (add check before any other code runs)

**Step 1: Add the root check**

Add this block at the top of `server/index.js`, after the comment header but before any imports:

```javascript
// ─── Root check ─────────────────────────────────────────────────────────────
// Refuse to run as root on Linux. The setup script creates a dedicated
// 'buddy' user — running as root defeats the privilege isolation.
if (process.platform === "linux" && process.getuid && process.getuid() === 0) {
  console.error(
    "ERROR: Buddy should not run as root.\n" +
    "The setup script creates a 'buddy' user for this purpose.\n" +
    "Start with: sudo -u buddy node index.js\n" +
    "Or use the systemd service: systemctl start buddy"
  );
  process.exit(1);
}
```

This goes between the comment header (lines 1-5) and the `import "dotenv/config";` line (line 7). It must be before imports so nothing initializes under root.

**Step 2: Verify it works on non-Linux**

Since we're developing on Windows, confirm the check doesn't trigger:

Run: `cd server && node index.js`
Expected: Server starts normally (the `process.platform === "linux"` guard skips the check on Windows/macOS).

**Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat: refuse to start as root on Linux"
```

---

### Task 3: Rewrite setup.sh for Non-Root Deployment

This is the largest task. The existing `setup.sh` uses pm2 and runs everything as the current user. The new version creates a `buddy` system user, installs to `/opt/buddy/`, and uses systemd.

**Files:**
- Modify: `setup.sh` (full rewrite of steps 1, 7, 9 and surrounding logic)

**Step 1: Add root requirement check at the top**

Replace the pre-flight checks section. The script must be run as root (or with sudo) since it needs to create users and install systemd services. Add after the banner:

```bash
# ─── Root check ──────────────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
    die "This script must be run as root." \
        "Try: sudo bash setup.sh"
fi
```

**Step 2: Update TOTAL_STEPS**

Change `TOTAL_STEPS=9` to `TOTAL_STEPS=10` (adding the "Create buddy user" step).

**Step 3: Add "Create buddy user" step after OS detection (new Step 2)**

Insert a new step after Step 1 (Detect OS) that creates the `buddy` system user if it doesn't exist:

```bash
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
```

**Step 4: Update Steps 3-4 (build tools and Node.js)**

These stay the same — they run as root and install system packages. Just renumber them to Steps 3 and 4.

**Step 5: Update Step 5 (Configure .env)**

Change the .env path from `$SCRIPT_DIR/server/.env` to `/opt/buddy/server/.env`. The .env file needs to be readable by the buddy user. Update all references:

```bash
ENV_FILE="/opt/buddy/server/.env"
```

But we write the .env *after* copying the code to `/opt/buddy/` (Step 7), so move the .env configuration to after the copy step. Or, write to a temp location and copy later. The simplest approach: keep the interactive prompts in this step, save values to variables, and write the file after the copy in Step 7.

Save the values to variables:
```bash
# (after collecting API_KEY, ELEVENLABS_KEY, CLAUDE_MODEL)
# Don't write .env yet — we need /opt/buddy/ to exist first (Step 7)
ok "Configuration collected (will be written after install)"
```

**Step 6: Update Step 6 (npm install) — renumber to Step 7, run from /opt/buddy/**

After copying code to `/opt/buddy/`:

```bash
step "Installing npm dependencies..."

run_logged "Installing server and client dependencies" npm --prefix /opt/buddy run install:all || \
    die "Failed to install dependencies." \
        "Check the log file and make sure you have internet access."
```

**Step 7: Add "Copy code to /opt/buddy/" step (new Step 6)**

Insert a step that copies the project to `/opt/buddy/`:

```bash
# ─── Step 6: Install application code ───────────────────────

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
```

**Step 8: Update the build step to use /opt/buddy/**

```bash
step "Building the frontend..."

run_logged "Building client" npm --prefix /opt/buddy run build || \
    die "Failed to build the frontend." \
        "Check the log file for errors."
```

**Step 9: Update the admin account creation step**

Change the temp server start to run as the buddy user:

```bash
# Start server temporarily as buddy user
(cd /opt/buddy/server && exec sudo -u buddy env NODE_ENV=production BUDDY_SKIP_SETUP=1 node index.js) >> "$LOG_FILE" 2>&1 &
SERVER_PID=$!
```

Everything else in this step stays the same (the curl calls to create the admin account).

**Step 10: Replace pm2 step with systemd step**

Replace the entire pm2 step with:

```bash
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
```

**Step 11: Update the summary output**

Replace the pm2 commands with systemd equivalents:

```bash
echo "  ${BOLD}Useful commands:${RESET}"
echo "    systemctl status buddy   — check if Buddy is running"
echo "    journalctl -u buddy -f   — follow server logs"
echo "    systemctl restart buddy  — restart the server"
echo "    systemctl stop buddy     — stop the server"
```

**Step 12: Verify the full script has correct step numbering**

Walk through the script and confirm `TOTAL_STEPS=10` matches:

1. Detect OS
2. Create buddy user
3. Check/install build tools
4. Check/install Node.js
5. Configure environment (collect values)
6. Install application to /opt/buddy/
7. Install npm dependencies
8. Build frontend
9. Create admin account (+ Tailscale)
10. Install systemd service

**Step 13: Commit**

```bash
git add setup.sh
git commit -m "feat: setup.sh creates buddy user, installs to /opt/buddy, uses systemd"
```

---

### Task 4: Update ecosystem.config.cjs

**Files:**
- Modify: `ecosystem.config.cjs`

**Step 1: Update the config to use /opt/buddy/ path**

The ecosystem config is still useful for developers running locally with pm2. Update it so it works from either location:

```javascript
module.exports = {
  apps: [
    {
      name: "buddy-server",
      cwd: "./server",
      script: "index.js",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
```

This file doesn't need changes — it uses relative paths (`./server`) which work from wherever the repo is cloned. It remains the pm2 config for local development. The production systemd service doesn't use it.

**No changes needed. Skip this task.**

---

### Task 5: Update CLAUDE.md Documentation

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update the Environment Modes table**

Find the "Environment Modes" section and update the table to reflect non-root deployment:

```markdown
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
```

**Step 2: Update the Commands section**

Add the production deployment command:

```markdown
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
```

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for non-root deployment"
```

---

### Task 6: Manual Testing Checklist

No code to write — this is the verification step before considering the work done.

**Step 1: Test locally (Windows/macOS — confirms no regressions)**

Run: `cd server && node index.js`
Expected: Server starts normally. The root check is Linux-only, so no change on Windows/macOS.

**Step 2: Test the guard changes**

1. Delete `~/.buddy/config/guards.json` (so it regenerates from defaults)
2. Start the server
3. Confirm `guards.json` now contains `sudo`, `su`, `pkexec`, `doas`, `runuser` in `blocked_commands`

**Step 3: Test on a Linux VPS (if available)**

1. Clone the repo to a fresh Ubuntu server
2. Run `sudo bash setup.sh`
3. Confirm the `buddy` user was created: `id buddy`
4. Confirm the service is running: `systemctl status buddy`
5. Confirm the app is accessible: `curl http://localhost:3001`
6. Confirm privilege escalation fails:
   - Through the app: ask Buddy to run `sudo apt update` — should get "Blocked command: sudo"
   - On the host: `sudo -u buddy sudo ls` — should get "buddy is not in the sudoers file"
7. Confirm the app can't modify its own code: `sudo -u buddy touch /opt/buddy/test` — should get "Permission denied"
