/**
 * Buddy server — Express + WebSocket entry point.
 * Handles HTTP API for prompt submission, agent CRUD, session management,
 * authentication, and WebSocket for real-time canvas/subtitle broadcasts.
 */

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

import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { writeFileSync } from "fs";
import { processPrompt } from "./claude-client.js";
import { splitAndBroadcast } from "./response-splitter.js";
import { listAgents, getAgent, createAgent, updateAgent, deleteAgent, getMemories, deleteMemory, getAgentFiles, readAgentFile, writeAgentFile, deleteAgentFile, canAccessAgent, seedBuddyAgent, attachUserToSharedAgents } from "./agents.js";
import db from "./db.js";
import { listSkills, validateAndAddSkill, updateSkill, deleteSkill, getSkillContent } from "./skills.js";
import { resetSession, getCanvasState, updateCanvasElement } from "./session.js";
import { DIRS } from "./config.js";
import { runSetupIfNeeded } from "./setup.js";
import { verifyToken, getUserCount, getUserByUsername, verifyPassword, signToken, createUser, getUserById, listUsers, updateUser, deleteUser } from "./auth.js";
import { startScheduler, deliverPendingMessages } from "./scheduler.js";
import { isAvailable as ttsIsAvailable, listVoices, streamSpeech } from "./tts.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

function authMiddleware(req, res, next) {
  // Login and register are exempt (register handles its own admin check)
  if (req.path === "/auth/login" || req.path === "/auth/register") return next();

  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: "Authorization required" });

  const token = header.replace(/^Bearer\s+/i, "");
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: "Invalid or expired token" });

  req.user = decoded; // { userId, username, isAdmin }
  next();
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", authMiddleware);

// ─── Per-Connection State ─────────────────────────────────────────────────────

const wsConnections = new Map(); // ws -> { userId, agentId }

function sendTo(ws, data) {
  if (ws.readyState === 1) ws.send(JSON.stringify(data));
}

function broadcastToUser(userId, data) {
  const message = JSON.stringify(data);
  for (const [ws, conn] of wsConnections) {
    if (conn.userId === userId && ws.readyState === 1) ws.send(message);
  }
}

function parseVoiceConfig(raw) {
  if (!raw) return {};
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return {};
  }
}

function isUserOnline(userId) {
  for (const [ws, conn] of wsConnections) {
    if (conn.userId === userId && ws.readyState === 1) return true;
  }
  return false;
}

// ─── Confirmation Gate ───────────────────────────────────────────────────────

const pendingConfirmations = new Map();
let confirmIdCounter = 0;

function requestConfirmationForClient(ws, command, reason) {
  return new Promise((resolve) => {
    const id = `confirm-${++confirmIdCounter}`;
    console.log(`[confirm] Sending confirmation request ${id} (ws.readyState=${ws.readyState})`);
    pendingConfirmations.set(id, resolve);
    sendTo(ws, {
      type: "canvas_command",
      command: "canvas_show_confirmation",
      params: { id, title: "Confirm Action", command, reason },
    });
    setTimeout(() => {
      if (pendingConfirmations.has(id)) {
        console.log(`[confirm] Timeout — auto-denying ${id}`);
        pendingConfirmations.delete(id);
        resolve(false);
      }
    }, 60000);
  });
}

// ─── Form Gate ───────────────────────────────────────────────────────────────

const pendingForms = new Map();
let formIdCounter = 0;

function requestFormForClient(ws, params) {
  return new Promise((resolve) => {
    const id = params.id || `form-${++formIdCounter}`;
    pendingForms.set(id, resolve);
    sendTo(ws, {
      type: "canvas_command",
      command: "canvas_show_form",
      params: { ...params, id },
    });
    setTimeout(() => {
      if (pendingForms.has(id)) {
        pendingForms.delete(id);
        resolve({ error: "Form timed out — no response after 5 minutes." });
      }
    }, 300000);
  });
}

// ─── Auth Routes (exempt from auth middleware) ──────────────────────────────

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  const user = getUserByUsername(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  const token = signToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      isAdmin: !!user.is_admin,
    },
  });
});

app.post("/api/auth/register", (req, res) => {
  // Middleware skips auth for this route, so decode JWT manually if present
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const decoded = verifyToken(authHeader.replace(/^Bearer\s+/i, ""));
    if (decoded) req.user = decoded;
  }

  const { username, password, displayName } = req.body;

  // Only allow if: no users exist (first-run), or requester is admin
  const userCount = getUserCount();
  if (userCount > 0 && (!req.user || !req.user.isAdmin)) {
    return res.status(403).json({ error: "Only admins can create accounts" });
  }

  if (!username || !password || !displayName) {
    return res.status(400).json({ error: "username, password, and displayName required" });
  }
  if (!/^[a-z0-9_-]+$/.test(username.toLowerCase())) {
    return res.status(400).json({ error: "Username must be lowercase alphanumeric" });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: "Password must be at least 4 characters" });
  }

  try {
    const isAdmin = userCount === 0;
    const user = createUser({ username, password, displayName, isAdmin });
    seedBuddyAgent(user.id);
    attachUserToSharedAgents(user.id);
    const token = signToken({ id: user.id, username: user.username, is_admin: isAdmin ? 1 : 0 });
    res.status(201).json({
      token,
      user: { id: user.id, username: user.username, displayName: user.displayName, isAdmin },
    });
  } catch (err) {
    if (err.message.includes("UNIQUE constraint")) {
      return res.status(409).json({ error: "Username already taken" });
    }
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/auth/me", (req, res) => {
  const user = getUserById(req.user.userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    isAdmin: !!user.is_admin,
  });
});

// ─── Admin User Routes ──────────────────────────────────────────────────────

app.get("/api/admin/users", (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: "Admin only" });
  res.json(listUsers());
});

app.post("/api/admin/users", (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: "Admin only" });

  const { username, password, displayName } = req.body;
  if (!username || !password || !displayName) {
    return res.status(400).json({ error: "username, password, and displayName required" });
  }
  if (!/^[a-z0-9_-]+$/.test(username.toLowerCase())) {
    return res.status(400).json({ error: "Username must be lowercase alphanumeric" });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: "Password must be at least 4 characters" });
  }

  try {
    const user = createUser({ username, password, displayName, isAdmin: false });
    seedBuddyAgent(user.id);
    attachUserToSharedAgents(user.id);
    res.status(201).json(user);
  } catch (err) {
    if (err.message.includes("UNIQUE constraint")) {
      return res.status(409).json({ error: "Username already taken" });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/admin/users/:id", (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: "Admin only" });

  const { is_admin } = req.body;
  if (is_admin === 0 && req.params.id === req.user.userId) {
    const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE is_admin = 1").get().count;
    if (adminCount <= 1) {
      return res.status(400).json({ error: "Cannot demote the last admin" });
    }
  }

  try {
    updateUser(req.params.id, req.body);
    const updated = getUserById(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/admin/users/:id", (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: "Admin only" });
  if (req.params.id === req.user.userId) {
    return res.status(400).json({ error: "Cannot delete your own account" });
  }
  try {
    deleteUser(req.params.id);
    res.json({ status: "deleted" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Agent Routes ─────────────────────────────────────────────────────────────

app.get("/api/agents", (req, res) => {
  res.json(listAgents(req.user.userId));
});

app.get("/api/agents/:id", (req, res) => {
  if (!canAccessAgent(req.params.id, req.user.userId)) {
    return res.status(403).json({ error: "Access denied" });
  }
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: "Agent not found" });
  if (agent.is_shared) {
    agent.userCount = db.prepare("SELECT COUNT(*) AS cnt FROM agent_users WHERE agent_id = ?").get(req.params.id).cnt;
  }
  res.json(agent);
});

app.post("/api/agents", (req, res) => {
  const { id, name, system_prompt, model, avatar_config, voice_config, identity, user_info, shared } = req.body;
  if (!id || !name) return res.status(400).json({ error: "id and name are required" });
  if (getAgent(id)) return res.status(409).json({ error: "Agent with this id already exists" });

  try {
    const agent = createAgent({
      id, name, model, system_prompt, avatar_config, voice_config, identity, user_info,
      userId: req.user.userId,
      shared: !!shared,
    });
    res.status(201).json(agent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/agents/:id", (req, res) => {
  if (!canAccessAgent(req.params.id, req.user.userId)) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    updateAgent(req.params.id, req.body);
    res.json(getAgent(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/agents/:id", (req, res) => {
  try {
    const agent = getAgent(req.params.id);
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    if (!agent.is_shared && agent.user_id !== req.user.userId) {
      return res.status(403).json({ error: "Cannot delete another user's agent" });
    }
    if (agent.is_shared) {
      const isMember = db.prepare("SELECT 1 FROM agent_users WHERE agent_id = ? AND user_id = ?").get(req.params.id, req.user.userId);
      if (!isMember) return res.status(403).json({ error: "Not a member of this shared agent" });
    }
    const result = deleteAgent(req.params.id, req.user.userId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Memory Routes ────────────────────────────────────────────────────────────

app.get("/api/agents/:id/memory", (req, res) => {
  if (!canAccessAgent(req.params.id, req.user.userId)) {
    return res.status(403).json({ error: "Access denied" });
  }
  res.json(getMemories(req.params.id));
});

app.delete("/api/agents/:id/memory/:key", (req, res) => {
  if (!canAccessAgent(req.params.id, req.user.userId)) {
    return res.status(403).json({ error: "Access denied" });
  }
  deleteMemory(req.params.id, req.params.key);
  res.json({ status: "deleted" });
});

// ─── Agent File Routes ────────────────────────────────────────────────────

app.get("/api/agents/:id/files", (req, res) => {
  if (!canAccessAgent(req.params.id, req.user.userId)) return res.status(403).json({ error: "Access denied" });
  res.json(getAgentFiles(req.params.id));
});

app.get("/api/agents/:id/files/:filename", (req, res) => {
  if (!canAccessAgent(req.params.id, req.user.userId)) return res.status(403).json({ error: "Access denied" });
  const content = readAgentFile(req.params.id, req.params.filename);
  if (content === null) return res.status(404).json({ error: "File not found" });
  res.json({ name: req.params.filename, content });
});

app.put("/api/agents/:id/files/:filename", (req, res) => {
  if (!canAccessAgent(req.params.id, req.user.userId)) return res.status(403).json({ error: "Access denied" });
  const { content } = req.body;
  if (content === undefined) return res.status(400).json({ error: "content is required" });
  writeAgentFile(req.params.id, req.params.filename, content);
  res.json({ status: "saved", name: req.params.filename });
});

app.delete("/api/agents/:id/files/:filename", (req, res) => {
  if (!canAccessAgent(req.params.id, req.user.userId)) return res.status(403).json({ error: "Access denied" });
  try {
    deleteAgentFile(req.params.id, req.params.filename);
    res.json({ status: "deleted" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Skills Routes ───────────────────────────────────────────────────────────

app.get("/api/skills", (req, res) => {
  res.json(listSkills());
});

app.post("/api/skills", (req, res) => {
  const { folderName, content } = req.body;

  if (!folderName || typeof folderName !== "string") {
    return res.status(400).json({ error: "folderName is required" });
  }

  if (!content || typeof content !== "string") {
    return res.status(400).json({
      error: "This folder doesn't contain a SKILL.md file. Each skill needs a SKILL.md with a name and description in the frontmatter.",
    });
  }

  const result = validateAndAddSkill(folderName.trim(), content);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  res.status(201).json({ status: "created", folderName: folderName.trim() });
});

app.get("/api/skills/:folderName", (req, res) => {
  const content = getSkillContent(req.params.folderName);
  if (content === null) {
    return res.status(404).json({ error: "Skill not found" });
  }
  res.json({ folderName: req.params.folderName, content });
});

app.put("/api/skills/:folderName", (req, res) => {
  const { content } = req.body;

  if (!content || typeof content !== "string") {
    return res.status(400).json({ error: "content is required" });
  }

  const result = updateSkill(req.params.folderName, content);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  res.json({ status: "updated", folderName: req.params.folderName });
});

app.delete("/api/skills/:folderName", (req, res) => {
  const result = deleteSkill(req.params.folderName);
  if (!result.success) {
    return res.status(404).json({ error: result.error });
  }
  res.json({ status: "deleted" });
});

// ─── TTS Routes ─────────────────────────────────────────────────────────────

app.get("/api/tts/voices", async (req, res) => {
  try {
    const voices = await listVoices();
    res.json(voices);
  } catch {
    res.json([]);
  }
});

app.get("/api/tts/status", (req, res) => {
  res.json({ available: ttsIsAvailable() });
});

// ─── Push Notification Routes ────────────────────────────────────────────────

app.put("/api/push/register", (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: "Token required" });
  db.prepare("UPDATE users SET push_token = ? WHERE id = ?").run(token, req.user.userId);
  res.json({ status: "ok" });
});

// ─── Session Routes ───────────────────────────────────────────────────────────

app.post("/api/session/reset", (req, res) => {
  const { agent_id } = req.body || {};
  resetSession(req.user.userId, agent_id || null);
  res.json({ status: "reset" });
});

// ─── Prompt Route ─────────────────────────────────────────────────────────────

app.post("/api/prompt", (req, res) => {
  const { prompt, agent_id } = req.body;
  const agentId = agent_id || "buddy";
  const userId = req.user.userId;

  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return res.status(400).json({ error: "prompt is required" });
  }

  if (!canAccessAgent(agentId, userId)) {
    return res.status(403).json({ error: "Access denied to this agent" });
  }

  // Return immediately so the client isn't waiting on the HTTP response
  res.json({ status: "ok" });

  // Process asynchronously
  (async () => {
    const send = (data) => broadcastToUser(userId, data);

    try {
      // Signal that Buddy is thinking
      send({ type: "processing", status: true });

      // Check if agent is actually changing
      let previousAgentId = null;
      for (const [ws, conn] of wsConnections) {
        if (conn.userId === userId) {
          previousAgentId = conn.agentId;
          conn.agentId = agentId;
        }
      }

      // Only send agent switch when the agent actually changes
      // (skip null→agentId on first prompt — WS connect already handled rehydration)
      const agent = getAgent(agentId);
      if (agent && previousAgentId && previousAgentId !== agentId) {
        const newCanvas = getCanvasState(userId, agentId);
        send({
          type: "agent_switch",
          agent: {
            id: agent.id,
            name: agent.name,
            avatar: agent.avatar,
            avatar_config: agent.avatar_config,
            voice_config: agent.voice_config,
          },
          canvas: newCanvas,
        });
      }

      // Find a WS for confirmation callbacks
      let clientWs = null;
      for (const [ws, conn] of wsConnections) {
        if (conn.userId === userId) { clientWs = ws; break; }
      }

      // Run through Claude with tool-use loop
      const result = await processPrompt(prompt.trim(), agentId, userId, {
        requestConfirmation: clientWs
          ? (command, reason) => requestConfirmationForClient(clientWs, command, reason)
          : undefined,
        requestForm: clientWs
          ? (params) => requestFormForClient(clientWs, params)
          : undefined,
      });

      // Get voice config for TTS
      const voiceConfig = parseVoiceConfig(agent?.voice_config);

      // Split canvas commands and subtitle, broadcast in order
      splitAndBroadcast(result.allToolCalls, result.finalTextContent, send, {
        onSubtitle: async (text) => {
          if (!ttsIsAvailable() || !voiceConfig.voiceId) {
            broadcastToUser(userId, { type: "tts_fallback" });
            return;
          }

          let targetWs = null;
          for (const [ws, conn] of wsConnections) {
            if (conn.userId === userId && ws.readyState === 1) {
              targetWs = ws;
              break;
            }
          }
          if (!targetWs) return;

          const audioStream = await streamSpeech(text, voiceConfig);
          if (!audioStream) {
            broadcastToUser(userId, { type: "tts_fallback" });
            return;
          }

          sendTo(targetWs, { type: "tts_start", format: "mp3" });

          let streamSuccess = false;
          try {
            const reader = audioStream.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) { streamSuccess = true; break; }
              if (targetWs.readyState !== 1) {
                reader.cancel("client disconnected");
                return;
              }
              targetWs.send(value);
            }
          } catch (err) {
            console.error("[tts] Stream error:", err.message);
          }

          if (streamSuccess) {
            sendTo(targetWs, { type: "tts_end" });
          } else {
            sendTo(targetWs, { type: "tts_fallback" });
          }
        },
      });
    } catch (error) {
      console.error("Error processing prompt:", error);

      // Send an error subtitle so the user knows something went wrong
      send({ type: "subtitle", text: "Sorry, something went wrong on my end. Try again?" });
      send({ type: "processing", status: false });
    }
  })();
});

// Serve files from ~/.buddy/shared/ for file delivery
app.use("/files", express.static(DIRS.shared));

// ─── Static file serving (production) ─────────────────────────────────────────

if (process.env.NODE_ENV === "production") {
  const clientDist = join(__dirname, "..", "client", "dist");
  app.use(express.static(clientDist));
  app.get("*", (req, res) => {
    res.sendFile(join(clientDist, "index.html"));
  });
}

// ─── HTTP + WebSocket Server ──────────────────────────────────────────────────

const server = createServer(app);

const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get("token");
  const decoded = token ? verifyToken(token) : null;
  if (!decoded) {
    ws.close(4001, "Unauthorized");
    return;
  }

  wsConnections.set(ws, { userId: decoded.userId, agentId: null });
  console.log(`WebSocket client connected: ${decoded.username}`);

  // Deliver any pending messages from schedules that fired while offline
  const pending = deliverPendingMessages(decoded.userId);
  if (pending.length > 0) {
    // Count unique scheduled tasks in the pending batch
    const scheduledCount = pending.filter(m => m.type === "canvas_command" && m.command === "canvas_show_notification").length;
    if (scheduledCount > 0) {
      sendTo(ws, {
        type: "canvas_command",
        command: "canvas_show_notification",
        params: {
          message: `${scheduledCount} scheduled task${scheduledCount > 1 ? "s" : ""} ran while you were away`,
          type: "info",
          duration_ms: 5000,
        },
      });
    }
    // Replay all queued messages
    for (const msg of pending) {
      sendTo(ws, msg);
    }
    console.log(`[scheduler] Delivered ${pending.length} pending messages to ${decoded.username}`);
  }

  // Rehydrate canvas state for default agent (atomic single message)
  const initialCanvas = getCanvasState(decoded.userId, "buddy");
  if (initialCanvas.length > 0) {
    sendTo(ws, { type: "canvas_rehydrate", elements: initialCanvas });
  }

  ws.on("message", async (data, isBinary) => {
    if (isBinary) return;
    try {
      const msg = JSON.parse(data.toString());
      const conn = wsConnections.get(ws);

      if (msg.type === "confirm_response") {
        console.log(`[confirm] Received confirm_response: id=${msg.id}, approved=${msg.approved}`);
        const resolver = pendingConfirmations.get(msg.id);
        if (resolver) {
          pendingConfirmations.delete(msg.id);
          resolver(msg.approved === true);
        } else {
          console.log(`[confirm] No pending confirmation found for ${msg.id}`);
        }
        return;
      }

      if (msg.type === "form_response") {
        const resolver = pendingForms.get(msg.id);
        if (resolver) {
          pendingForms.delete(msg.id);
          resolver(msg.data);
        }
        return;
      }

      if (msg.type === "canvas_element_update") {
        // Silent update — no agent interruption. Used by Checklist toggles.
        if (conn.userId && msg.id && msg.updates) {
          const agentId = conn.agentId || "buddy";
          updateCanvasElement(conn.userId, agentId, msg.id, msg.updates);
        }
        return;
      }

      if (msg.type === "file_upload") {
        const fileBuffer = Buffer.from(msg.data, "base64");
        const filePath = join(DIRS.shared, msg.filename);
        writeFileSync(filePath, fileBuffer);

        const agentId = conn.agentId || "buddy";
        const userMessage = msg.text
          ? `${msg.text}\n\n[File uploaded to: ${filePath}]`
          : `[File uploaded to: ${filePath}] (filename: ${msg.filename})`;

        sendTo(ws, { type: "processing", status: true });
        try {
          const result = await processPrompt(userMessage, agentId, conn.userId, {
            requestConfirmation: (command, reason) => requestConfirmationForClient(ws, command, reason),
            requestForm: (params) => requestFormForClient(ws, params),
          });
          const uploadVoiceConfig = parseVoiceConfig(getAgent(agentId)?.voice_config);

          splitAndBroadcast(result.allToolCalls, result.finalTextContent, (d) => sendTo(ws, d), {
            onSubtitle: async (text) => {
              if (!ttsIsAvailable() || !uploadVoiceConfig.voiceId) {
                sendTo(ws, { type: "tts_fallback" });
                return;
              }

              const audioStream = await streamSpeech(text, uploadVoiceConfig);
              if (!audioStream) {
                sendTo(ws, { type: "tts_fallback" });
                return;
              }

              sendTo(ws, { type: "tts_start", format: "mp3" });

              let streamSuccess = false;
              try {
                const reader = audioStream.getReader();
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) { streamSuccess = true; break; }
                  if (ws.readyState !== 1) {
                    reader.cancel("client disconnected");
                    return;
                  }
                  ws.send(value);
                }
              } catch (err) {
                console.error("[tts] Stream error:", err.message);
              }

              if (streamSuccess) {
                sendTo(ws, { type: "tts_end" });
              } else {
                sendTo(ws, { type: "tts_fallback" });
              }
            },
          });
        } catch (err) {
          console.error("Error processing file upload:", err);
          sendTo(ws, { type: "subtitle", text: "Sorry, something went wrong processing that file." });
          sendTo(ws, { type: "processing", status: false });
        }
      }
    } catch {}
  });

  ws.on("close", () => {
    wsConnections.delete(ws);
    console.log("WebSocket client disconnected");
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

(async () => {
  await runSetupIfNeeded();

  server.listen(PORT, () => {
    console.log(`Buddy server running on http://localhost:${PORT}`);
    console.log(`WebSocket server ready on ws://localhost:${PORT}`);
    console.log(`Environment: ${process.env.BUDDY_ENV || "development"}`);
    console.log(`Data directory: ${DIRS.root}`);

    // Start the scheduler after server is ready
    startScheduler({ broadcastToUser, isUserOnline });
  });
})();
