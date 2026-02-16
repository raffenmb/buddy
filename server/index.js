/**
 * Buddy server — Express + WebSocket entry point.
 * Handles HTTP API for prompt submission and WebSocket for real-time
 * canvas commands and subtitle broadcasts.
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { processPrompt } from "./claude-client.js";
import { splitAndBroadcast } from "./response-splitter.js";

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());

/**
 * Broadcast a JSON message to all connected WebSocket clients.
 * @param {object} data - The message payload to serialize and send.
 */
function broadcast(data) {
  const message = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      // WebSocket.OPEN
      client.send(message);
    }
  });
}

// ─── HTTP Routes ───────────────────────────────────────────────────────────────

/**
 * POST /api/prompt
 * Accepts { prompt } in the body. Returns immediately with { status: "ok" },
 * then processes the prompt asynchronously and broadcasts results via WebSocket.
 */
app.post("/api/prompt", (req, res) => {
  const { prompt } = req.body;

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

      // Run through Claude with tool-use loop
      const result = await processPrompt(prompt.trim());

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

// ─── HTTP + WebSocket Server ───────────────────────────────────────────────────

const server = createServer(app);

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("WebSocket client connected");

  ws.on("close", () => {
    console.log("WebSocket client disconnected");
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});

// ─── Start ─────────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`Buddy server running on http://localhost:${PORT}`);
  console.log(`WebSocket server ready on ws://localhost:${PORT}`);
});
