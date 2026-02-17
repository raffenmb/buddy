# Buddy — Setup Guide

This guide walks you through setting up Buddy on your own server from scratch. No programming knowledge required — just follow each step.

---

## What You'll End Up With

- Buddy running 24/7 on a computer in your home (or any server)
- Access from any device (phone, laptop, tablet) on your private network
- Persistent memory — Buddy remembers things across restarts
- Multiple AI agents you can create and switch between

---

## What You Need

Before starting, make sure you have:

1. **A computer to run the server** — any always-on machine (old laptop, desktop, Raspberry Pi, cloud VPS). Linux (Ubuntu/Debian) or Mac recommended.
2. **An Anthropic API key** — this is how Buddy talks to Claude. Get one at [console.anthropic.com](https://console.anthropic.com/settings/keys). You'll need to add a payment method — API calls cost a few cents per conversation.

---

## Step 1: Install Git (if you don't have it)

Check if you have Git:

```bash
git --version
```

If not installed:

- **Ubuntu/Debian:** `sudo apt install -y git`
- **Mac:** `xcode-select --install` (or `brew install git`)

---

## Step 2: Clone Buddy and Run Setup

```bash
git clone https://github.com/raffenmb/buddy.git
cd buddy
bash setup.sh
```

The setup script handles everything else automatically:

1. Detects your operating system
2. Installs build tools (asks permission first)
3. Installs Node.js if missing (asks permission first)
4. Installs Docker if missing (asks permission first)
5. Asks for your Anthropic API key
6. Installs all dependencies
7. Builds the frontend
8. Starts the Docker sandbox
9. Starts Buddy with pm2 (keeps it running in the background)

Each step shows progress and asks before installing anything. If something goes wrong, it tells you what happened and what to try. Full details are logged to `~/buddy-setup.log`.

When it finishes, open **http://localhost:3001** in a browser on that machine to verify it works.

---

## Step 3: Install Tailscale (Access from Other Devices)

Tailscale creates a private network between your devices — this is how you'll use Buddy from your phone, laptop, etc.

### On the server (the machine running Buddy):

1. Install Tailscale: [tailscale.com/download](https://tailscale.com/download)
2. Start it:
   ```bash
   sudo tailscale up
   ```
3. It will give you a URL to sign in — open it and create an account (or sign in with Google/GitHub/etc.)
4. Find your server's Tailscale IP:
   ```bash
   tailscale ip
   ```
   Write this down — it looks like `100.x.x.x`

### On your phone/laptop/tablet:

1. Install the Tailscale app (App Store, Play Store, or [tailscale.com/download](https://tailscale.com/download))
2. Sign in with the **same account** you used on the server
3. Open a browser and go to: `http://<tailscale-ip>:3001`

That's it — you're using Buddy from your phone.

---

## Step 4: Start on Boot (Optional but Recommended)

So Buddy survives reboots:

```bash
pm2 startup
```

This prints a command — **copy the entire command it gives you and run it.** It looks something like:

```
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u youruser --hp /home/youruser
```

After running that, Buddy will auto-start whenever the server reboots.

---

## You're Done!

Buddy is running. Here's what you can do:

### Talk to Buddy
Just type in the input bar. Buddy responds with subtitles and can show charts, cards, tables, and videos on the canvas behind it.

### Buddy Remembers You
Tell Buddy your name, your preferences, anything — it remembers across restarts.

### Create Custom Agents
Want a cooking assistant, a fitness coach, or a different personality? Create agents from the server:

```bash
curl -X POST http://localhost:3001/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "id": "chef",
    "name": "Chef",
    "system_prompt": "You are Chef, a culinary expert. You love helping people cook delicious meals. Keep responses short and friendly. Use canvas cards for recipes and ingredients."
  }'
```

Change the `id`, `name`, and `system_prompt` to create any agent you want. Once you have more than one agent, a dropdown appears in the top-right corner to switch between them.

---

## Useful Commands

| Command | What it does |
|---------|-------------|
| `pm2 status` | Check if Buddy is running |
| `pm2 logs` | See server logs (useful for debugging) |
| `pm2 restart all` | Restart the server |
| `pm2 stop all` | Stop the server |
| `tailscale ip` | Show your Tailscale IP |
| `tailscale status` | See all devices on your network |

---

## Re-running Setup

You can safely re-run `bash setup.sh` at any time. It will:
- Skip anything already installed
- Ask if you want to keep your existing API key
- Rebuild the frontend and restart the server

This is useful after installing Docker, updating Buddy, or fixing issues.

---

## Troubleshooting

**"Buddy is just thinking and not responding"**
- Check the server logs: `pm2 logs`
- Make sure your API key is correct in `server/.env`
- Make sure you have credits on your Anthropic account

**"Can't connect from my phone"**
- Make sure Tailscale is running on both the server and your phone
- Make sure you're signed into the same Tailscale account on both
- Try `tailscale status` on the server to see if your phone appears
- Use the IP from `tailscale ip`, not `localhost`

**"Server isn't running after reboot"**
- Run `pm2 startup` and follow the instructions
- Then `pm2 start ecosystem.config.cjs && pm2 save`

**"Docker sandbox not working"**
- Re-run `bash setup.sh` — it will set up Docker if it's now available
- On Linux, if you just installed Docker, log out and log back in first
- Check `~/buddy-setup.log` for detailed error messages

**"I want to update Buddy"**
```bash
cd buddy
git pull
bash setup.sh
```
