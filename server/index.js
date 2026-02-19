/**
 * Buddy server — Express + WebSocket entry point.
 * Handles HTTP API for prompt submission, agent CRUD, session management,
 * authentication, and WebSocket for real-time canvas/subtitle broadcasts.
 */

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
import { listAgents, getAgent, createAgent, updateAgent, deleteAgent, getMemories, deleteMemory, getAgentFiles, readAgentFile, writeAgentFile, deleteAgentFile } from "./agents.js";
import { listSkills, validateAndAddSkill, updateSkill, deleteSkill, getSkillContent } from "./skills.js";
import { resetSession } from "./session.js";
import { DIRS } from "./config.js";
import { runSetupIfNeeded } from "./setup.js";
import { verifyToken, getUserCount, getUserByUsername, verifyPassword, signToken, createUser, getUserById, listUsers, updateUser, deleteUser } from "./auth.js";

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

app.use("/api", authMiddleware);

// ─── Track current agent per-connection (module level) ────────────────────────

let currentAgentId = "buddy";

/**
 * Broadcast a JSON message to all connected WebSocket clients.
 * @param {object} data - The message payload to serialize and send.
 */
function broadcast(data) {
  const message = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

// ─── Confirmation Gate ───────────────────────────────────────────────────────

const pendingConfirmations = new Map();
let confirmIdCounter = 0;

function requestConfirmation(command, reason) {
  return new Promise((resolve) => {
    const id = `confirm-${++confirmIdCounter}`;
    pendingConfirmations.set(id, resolve);

    broadcast({
      type: "canvas_command",
      command: "canvas_show_confirmation",
      params: { id, title: "Confirm Action", command, reason },
    });

    setTimeout(() => {
      if (pendingConfirmations.has(id)) {
        pendingConfirmations.delete(id);
        resolve(false);
      }
    }, 60000);
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

// ─── Agent Routes ─────────────────────────────────────────────────────────────

app.get("/api/agents", (req, res) => {
  res.json(listAgents());
});

app.get("/api/agents/:id", (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: "Agent not found" });
  res.json(agent);
});

app.post("/api/agents", (req, res) => {
  const { id, name, system_prompt, model, avatar_config, voice_config, identity, user_info } = req.body;

  if (!id || !name) {
    return res.status(400).json({ error: "id and name are required" });
  }

  if (getAgent(id)) {
    return res.status(409).json({ error: "Agent with this id already exists" });
  }

  try {
    const agent = createAgent({ id, name, model, system_prompt, avatar_config, voice_config, identity, user_info });
    res.status(201).json(agent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/agents/:id", (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: "Agent not found" });

  try {
    updateAgent(req.params.id, req.body);
    res.json(getAgent(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/agents/:id", (req, res) => {
  try {
    deleteAgent(req.params.id);
    res.json({ status: "deleted" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Memory Routes ────────────────────────────────────────────────────────────

app.get("/api/agents/:id/memory", (req, res) => {
  res.json(getMemories(req.params.id));
});

app.delete("/api/agents/:id/memory/:key", (req, res) => {
  deleteMemory(req.params.id, req.params.key);
  res.json({ status: "deleted" });
});

// ─── Agent File Routes ────────────────────────────────────────────────────

app.get("/api/agents/:id/files", (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: "Agent not found" });
  res.json(getAgentFiles(req.params.id));
});

app.get("/api/agents/:id/files/:filename", (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: "Agent not found" });

  const content = readAgentFile(req.params.id, req.params.filename);
  if (content === null) return res.status(404).json({ error: "File not found" });
  res.json({ name: req.params.filename, content });
});

app.put("/api/agents/:id/files/:filename", (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: "Agent not found" });

  const { content } = req.body;
  if (content === undefined) return res.status(400).json({ error: "content is required" });

  writeAgentFile(req.params.id, req.params.filename, content);
  res.json({ status: "saved", name: req.params.filename });
});

app.delete("/api/agents/:id/files/:filename", (req, res) => {
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

// ─── Session Routes ───────────────────────────────────────────────────────────

app.post("/api/session/reset", (req, res) => {
  const { agent_id } = req.body || {};
  resetSession(agent_id || null);
  res.json({ status: "reset" });
});

// ─── Prompt Route ─────────────────────────────────────────────────────────────

app.post("/api/prompt", (req, res) => {
  const { prompt, agent_id } = req.body;
  const agentId = agent_id || "buddy";

  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return res.status(400).json({ error: "prompt is required" });
  }

  // Return immediately so the client isn't waiting on the HTTP response
  res.json({ status: "ok" });

  // Process asynchronously
  (async () => {
    try {
      // Signal that Buddy is thinking
      broadcast({ type: "processing", status: true });

      // Handle agent switching
      if (agentId !== currentAgentId) {
        const agent = getAgent(agentId);
        if (agent) {
          // Clear the canvas when switching agents
          broadcast({
            type: "canvas_command",
            command: "canvas_set_mode",
            params: { mode: "clear" },
          });

          // Notify clients of agent switch
          broadcast({
            type: "agent_switch",
            agent: {
              id: agent.id,
              name: agent.name,
              avatar: agent.avatar,
              avatar_config: agent.avatar_config,
              voice_config: agent.voice_config,
            },
          });

          currentAgentId = agentId;
        }
      }

      // Run through Claude with tool-use loop
      const result = await processPrompt(prompt.trim(), agentId, { requestConfirmation });

      // Split canvas commands and subtitle, broadcast in order
      splitAndBroadcast(result.allToolCalls, result.finalTextContent, broadcast);
    } catch (error) {
      console.error("Error processing prompt:", error);

      // Send an error subtitle so the user knows something went wrong
      broadcast({
        type: "subtitle",
        text: "Sorry, something went wrong on my end. Try again?",
      });
      broadcast({ type: "processing", status: false });
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
  // WebSocket auth — verify JWT from query param
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get("token");
  const decoded = token ? verifyToken(token) : null;
  if (!decoded) {
    ws.close(4001, "Unauthorized");
    return;
  }
  ws.user = decoded;

  console.log(`WebSocket client connected: ${decoded.username}`);

  // Handle binary messages (file uploads) and text messages
  ws.on("message", async (data, isBinary) => {
    // Binary message = file upload
    if (isBinary) {
      // Binary protocol not implemented yet — placeholder for future mobile uploads
      return;
    }

    // Text messages (JSON)
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === "confirm_response") {
        const resolver = pendingConfirmations.get(msg.id);
        if (resolver) {
          pendingConfirmations.delete(msg.id);
          resolver(msg.approved === true);
        }
        return;
      }

      if (msg.type === "file_upload") {
        const fileBuffer = Buffer.from(msg.data, "base64");
        const filePath = join(DIRS.shared, msg.filename);
        writeFileSync(filePath, fileBuffer);

        const userMessage = msg.text
          ? `${msg.text}\n\n[File uploaded to: ${filePath}]`
          : `[File uploaded to: ${filePath}] (filename: ${msg.filename})`;

        broadcast({ type: "processing", status: true });
        try {
          const result = await processPrompt(userMessage, currentAgentId, { requestConfirmation });
          splitAndBroadcast(result.allToolCalls, result.finalTextContent, broadcast);
        } catch (err) {
          console.error("Error processing file upload:", err);
          broadcast({ type: "subtitle", text: "Sorry, something went wrong processing that file." });
          broadcast({ type: "processing", status: false });
        }
      }
    } catch {
      // Not JSON — ignore
    }
  });

  ws.on("close", () => {
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
  });
})();
