# ElevenLabs TTS Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add ElevenLabs TTS with per-agent voice selection, streaming audio over WebSocket, and automatic fallback to native browser TTS.

**Architecture:** Server-side `tts.js` module calls ElevenLabs HTTP streaming API, pipes MP3 chunks as binary WebSocket frames to the client. A new `useAudioPlayer` hook accumulates chunks and plays via AudioContext. Agent voice configuration stored in existing `voice_config` JSON column. Falls back to browser `speechSynthesis` when ElevenLabs is unavailable.

**Tech Stack:** ElevenLabs REST API (raw `fetch`, no SDK dependency), Web Audio API (`AudioContext.decodeAudioData`), existing `ws` WebSocket library.

**Design doc:** `docs/plans/2026-02-20-elevenlabs-tts-design.md`

---

### Task 1: Create server TTS module

**Files:**
- Create: `server/tts.js`

**Step 1: Create `server/tts.js` with three exports**

```js
// server/tts.js
// ElevenLabs TTS service — availability check, voice listing, streaming speech

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
const BASE_URL = "https://api.elevenlabs.io/v1";

// Track temporary unavailability (bad key, repeated errors)
let unavailableUntil = 0;

export function isAvailable() {
  if (!ELEVENLABS_API_KEY) return false;
  if (Date.now() < unavailableUntil) return false;
  return true;
}

export async function listVoices() {
  if (!ELEVENLABS_API_KEY) return [];
  try {
    const res = await fetch(`${BASE_URL}/voices`, {
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.voices || []).map((v) => ({
      voiceId: v.voice_id,
      name: v.name,
      category: v.category || "premade",
      previewUrl: v.preview_url || null,
    }));
  } catch {
    return [];
  }
}

/**
 * Stream TTS audio from ElevenLabs.
 * @param {string} text - Text to speak.
 * @param {object} voiceConfig - { voiceId, modelId, stability, similarityBoost }
 * @returns {Promise<ReadableStream|null>} - Readable byte stream of MP3 data, or null on error.
 */
export async function streamSpeech(text, voiceConfig) {
  if (!isAvailable() || !voiceConfig.voiceId) return null;

  const voiceId = voiceConfig.voiceId;
  const modelId = voiceConfig.modelId || "eleven_flash_v2_5";

  const body = { text, model_id: modelId };
  if (voiceConfig.stability !== undefined || voiceConfig.similarityBoost !== undefined) {
    body.voice_settings = {};
    if (voiceConfig.stability !== undefined) body.voice_settings.stability = voiceConfig.stability;
    if (voiceConfig.similarityBoost !== undefined) body.voice_settings.similarity_boost = voiceConfig.similarityBoost;
  }

  try {
    const res = await fetch(
      `${BASE_URL}/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (res.status === 401) {
      console.error("[tts] ElevenLabs API key invalid — disabling for 5 minutes");
      unavailableUntil = Date.now() + 5 * 60 * 1000;
      return null;
    }
    if (!res.ok) {
      console.error(`[tts] ElevenLabs error: ${res.status} ${res.statusText}`);
      return null;
    }

    return res.body;
  } catch (err) {
    console.error("[tts] ElevenLabs network error:", err.message);
    return null;
  }
}
```

**Step 2: Verify the module loads without errors**

Run: `cd /root/buddy/server && node -e "import('./tts.js').then(m => console.log('isAvailable:', m.isAvailable()))"`
Expected: `isAvailable: false` (no API key in test)

**Step 3: Commit**

```bash
git add server/tts.js
git commit -m "feat: add server/tts.js ElevenLabs TTS module"
```

---

### Task 2: Add TTS voices API endpoint

**Files:**
- Modify: `server/index.js` (add route after skills routes, around line 444)

**Step 1: Add the `/api/tts/voices` route**

Add after the skills routes block (after line 444) and before the session routes:

```js
// ─── TTS Routes ─────────────────────────────────────────────────────────────

app.get("/api/tts/voices", async (req, res) => {
  const { listVoices } = await import("./tts.js");
  try {
    const voices = await listVoices();
    res.json(voices);
  } catch (err) {
    console.error("[tts] Failed to list voices:", err);
    res.json([]);
  }
});
```

**Step 2: Add the TTS availability status endpoint**

Add right after the voices route:

```js
app.get("/api/tts/status", (req, res) => {
  // Synchronous import won't work with ESM, use dynamic import cached at top
  import("./tts.js").then((tts) => {
    res.json({ available: tts.isAvailable() });
  });
});
```

**Step 3: Verify the endpoints load**

Run: `cd /root/buddy/server && node -e "import('./index.js')" &` then `sleep 2 && curl -s http://localhost:3001/api/health`
Expected: `{"status":"ok"}`

Note: The `/api/tts/voices` endpoint requires auth. A full integration test would need a token. For now, verifying the server starts is sufficient.

**Step 4: Commit**

```bash
git add server/index.js
git commit -m "feat: add /api/tts/voices and /api/tts/status endpoints"
```

---

### Task 3: Integrate TTS streaming into the response pipeline

**Files:**
- Modify: `server/index.js` (prompt handler, lines 456-533)
- Modify: `server/response-splitter.js` (add TTS trigger)

**Step 1: Import tts at the top of `server/index.js`**

Add after line 24 (after other imports):

```js
import { isAvailable as ttsAvailable, streamSpeech } from "./tts.js";
```

**Step 2: Modify `splitAndBroadcast` to accept and use a TTS callback**

Replace `server/response-splitter.js` content with:

```js
/**
 * Response splitter — takes the accumulated tool calls and final text
 * from a Claude response and broadcasts them to all connected WebSocket
 * clients in the correct order: canvas commands first, then subtitle.
 * Optionally triggers TTS for the subtitle text.
 */

/**
 * @param {Array} allToolCalls - Array of { name, input } from the tool-use loop.
 * @param {string} finalTextContent - Concatenated text blocks from the final response.
 * @param {Function} broadcast - Function that sends a JSON message to all WS clients.
 * @param {Object} [options] - Optional config.
 * @param {Function} [options.onSubtitle] - Async callback(text) called after subtitle is broadcast. Used for TTS.
 */
export function splitAndBroadcast(allToolCalls, finalTextContent, broadcast, options = {}) {
  console.log(`[splitter] ${allToolCalls.length} tool calls:`, allToolCalls.map(t => t.name));

  // 1. Send canvas commands first (visuals before speech)
  // Skip canvas_show_form — it's already sent by the blocking form handler
  for (const toolCall of allToolCalls) {
    if (toolCall.name.startsWith("canvas_") && toolCall.name !== "canvas_show_form") {
      broadcast({
        type: "canvas_command",
        command: toolCall.name,
        params: toolCall.input,
      });
    }
  }

  // 2. Send subtitle text (Buddy "speaks")
  if (finalTextContent && finalTextContent.trim().length > 0) {
    broadcast({
      type: "subtitle",
      text: finalTextContent,
    });

    // 3. Trigger TTS if callback provided
    if (options.onSubtitle) {
      options.onSubtitle(finalTextContent).catch((err) => {
        console.error("[splitter] TTS callback error:", err);
      });
    }
  }

  // 4. Signal that processing is complete
  broadcast({
    type: "processing",
    status: false,
  });
}
```

**Step 3: Wire TTS into the prompt handler in `server/index.js`**

In the `POST /api/prompt` handler (around line 524), modify the `splitAndBroadcast` call.

Replace line 524:
```js
      splitAndBroadcast(result.allToolCalls, result.finalTextContent, send);
```

With:
```js
      // Get voice config for TTS
      const agentData = getAgent(agentId);
      let voiceConfig = {};
      if (agentData && agentData.voice_config) {
        try {
          voiceConfig = typeof agentData.voice_config === "string"
            ? JSON.parse(agentData.voice_config)
            : agentData.voice_config;
        } catch {}
      }

      splitAndBroadcast(result.allToolCalls, result.finalTextContent, send, {
        onSubtitle: async (text) => {
          // Determine if we should use ElevenLabs TTS
          if (!ttsAvailable() || !voiceConfig.voiceId) {
            broadcastToUser(userId, { type: "tts_fallback" });
            return;
          }

          // Find a WS connection for this user to send binary frames
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

          // Send tts_start marker
          sendTo(targetWs, { type: "tts_start", format: "mp3" });

          // Stream binary audio chunks
          try {
            const reader = audioStream.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (targetWs.readyState === 1) {
                targetWs.send(value);
              }
            }
          } catch (err) {
            console.error("[tts] Stream error:", err.message);
          }

          // Send tts_end marker
          sendTo(targetWs, { type: "tts_end" });
        },
      });
```

**Step 4: Also wire TTS into the file_upload handler**

In the `ws.on("message")` handler (around line 647), find:
```js
          splitAndBroadcast(result.allToolCalls, result.finalTextContent, (d) => sendTo(ws, d));
```

Replace with:
```js
          const uploadAgentData = getAgent(agentId);
          let uploadVoiceConfig = {};
          if (uploadAgentData && uploadAgentData.voice_config) {
            try {
              uploadVoiceConfig = typeof uploadAgentData.voice_config === "string"
                ? JSON.parse(uploadAgentData.voice_config)
                : uploadAgentData.voice_config;
            } catch {}
          }

          splitAndBroadcast(result.allToolCalls, result.finalTextContent, (d) => sendTo(ws, d), {
            onSubtitle: async (text) => {
              if (!ttsAvailable() || !uploadVoiceConfig.voiceId) {
                sendTo(ws, { type: "tts_fallback" });
                return;
              }

              const audioStream = await streamSpeech(text, uploadVoiceConfig);
              if (!audioStream) {
                sendTo(ws, { type: "tts_fallback" });
                return;
              }

              sendTo(ws, { type: "tts_start", format: "mp3" });
              try {
                const reader = audioStream.getReader();
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  if (ws.readyState === 1) ws.send(value);
                }
              } catch (err) {
                console.error("[tts] Stream error:", err.message);
              }
              sendTo(ws, { type: "tts_end" });
            },
          });
```

**Step 5: Commit**

```bash
git add server/index.js server/response-splitter.js
git commit -m "feat: wire ElevenLabs TTS streaming into response pipeline"
```

---

### Task 4: Handle binary WebSocket frames on the client

**Files:**
- Modify: `client/src/hooks/useWebSocket.js`

**Step 1: Add binary message handling and TTS message types**

The current `ws.addEventListener("message")` handler (line 50) only handles JSON. We need to handle binary frames (audio chunks) and new JSON TTS message types.

Replace the `ws.addEventListener("message", ...)` block (lines 50-79) with:

```js
      ws.addEventListener("message", (event) => {
        // Binary frame — audio chunk from ElevenLabs TTS
        if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
          window.dispatchEvent(new CustomEvent("buddy-tts-chunk", { detail: event.data }));
          return;
        }

        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case "subtitle":
              dispatch({ type: "SET_SUBTITLE", payload: { text: data.text } });
              break;
            case "canvas_command":
              routeCommand(data.command, data.params, dispatch);
              break;
            case "processing":
              dispatch({ type: "SET_PROCESSING", payload: data.status });
              break;
            case "agent_switch":
              dispatch({ type: "SET_AGENT", payload: data.agent });
              if (data.canvas) {
                dispatch({ type: "CANVAS_REHYDRATE", payload: { elements: data.canvas } });
              }
              break;
            case "canvas_rehydrate":
              dispatch({ type: "CANVAS_REHYDRATE", payload: { elements: data.elements } });
              break;
            case "tts_start":
              window.dispatchEvent(new CustomEvent("buddy-tts-start", { detail: data }));
              break;
            case "tts_end":
              window.dispatchEvent(new CustomEvent("buddy-tts-end"));
              break;
            case "tts_fallback":
              window.dispatchEvent(new CustomEvent("buddy-tts-fallback"));
              break;
            default:
              break;
          }
        } catch (err) {
          console.error("WebSocket message parse error:", err);
        }
      });
```

Note: We use `window.dispatchEvent` with custom events so the `useAudioPlayer` hook can listen without being coupled to the WebSocket hook. This is the simplest cross-component communication pattern that works identically on web and (with a shim) React Native.

**Step 2: Commit**

```bash
git add client/src/hooks/useWebSocket.js
git commit -m "feat: handle binary WS frames and TTS messages in useWebSocket"
```

---

### Task 5: Create the useAudioPlayer hook

**Files:**
- Create: `client/src/hooks/useAudioPlayer.js`

**Step 1: Create the hook**

```js
// client/src/hooks/useAudioPlayer.js
// Handles ElevenLabs audio playback (accumulate MP3 chunks, decode, play)
// and falls back to browser speechSynthesis when server sends tts_fallback.

import { useEffect, useRef, useCallback } from "react";
import { useBuddy } from "../context/BuddyState";

export default function useAudioPlayer() {
  const { state, dispatch } = useBuddy();
  const audioContextRef = useRef(null);
  const chunksRef = useRef([]);
  const activeSourceRef = useRef(null);
  const fallbackTextRef = useRef(null);

  // Cancel any in-progress audio (ElevenLabs or native)
  const cancelAudio = useCallback(() => {
    // Stop AudioContext source
    if (activeSourceRef.current) {
      try { activeSourceRef.current.stop(); } catch {}
      activeSourceRef.current = null;
    }
    // Stop native TTS
    window.speechSynthesis.cancel();
    // Clear chunks
    chunksRef.current = [];
  }, []);

  // Play accumulated MP3 chunks via AudioContext
  const playAccumulatedAudio = useCallback(async () => {
    const chunks = chunksRef.current;
    chunksRef.current = [];

    if (chunks.length === 0) {
      dispatch({ type: "STOP_TALKING" });
      return;
    }

    // Merge all chunks into a single ArrayBuffer
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }

    // Lazily create AudioContext
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = audioContextRef.current;

    try {
      const audioBuffer = await ctx.decodeAudioData(merged.buffer);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      activeSourceRef.current = source;

      source.onended = () => {
        activeSourceRef.current = null;
        dispatch({ type: "STOP_TALKING" });
      };

      source.start(0);
    } catch (err) {
      console.error("[audio] Failed to decode audio:", err);
      dispatch({ type: "STOP_TALKING" });
    }
  }, [dispatch]);

  // Play using native browser TTS
  const playNativeTTS = useCallback((text) => {
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;

    utterance.onend = () => dispatch({ type: "STOP_TALKING" });
    utterance.onerror = () => dispatch({ type: "STOP_TALKING" });

    window.speechSynthesis.speak(utterance);

    // Fallback timer in case onend never fires
    const fallbackDuration = Math.min(
      Math.max((text.length / 15) * 1000, 1000),
      15000
    );
    setTimeout(() => dispatch({ type: "STOP_TALKING" }), fallbackDuration);
  }, [dispatch]);

  useEffect(() => {
    function onTtsStart() {
      cancelAudio();
      chunksRef.current = [];
    }

    async function onTtsChunk(event) {
      const data = event.detail;
      let arrayBuffer;
      if (data instanceof Blob) {
        arrayBuffer = await data.arrayBuffer();
      } else if (data instanceof ArrayBuffer) {
        arrayBuffer = data;
      } else {
        return;
      }
      chunksRef.current.push(arrayBuffer);
    }

    function onTtsEnd() {
      playAccumulatedAudio();
    }

    function onTtsFallback() {
      // Use the current subtitle text for native TTS
      // The subtitle is set before tts_fallback arrives
      cancelAudio();
    }

    window.addEventListener("buddy-tts-start", onTtsStart);
    window.addEventListener("buddy-tts-chunk", onTtsChunk);
    window.addEventListener("buddy-tts-end", onTtsEnd);
    window.addEventListener("buddy-tts-fallback", onTtsFallback);

    return () => {
      window.removeEventListener("buddy-tts-start", onTtsStart);
      window.removeEventListener("buddy-tts-chunk", onTtsChunk);
      window.removeEventListener("buddy-tts-end", onTtsEnd);
      window.removeEventListener("buddy-tts-fallback", onTtsFallback);
      cancelAudio();
    };
  }, [cancelAudio, playAccumulatedAudio]);

  // Track subtitle text for native TTS fallback
  useEffect(() => {
    if (state.subtitle.visible && state.subtitle.text) {
      fallbackTextRef.current = state.subtitle.text;
    }
  }, [state.subtitle.visible, state.subtitle.text]);

  // When subtitle appears and no tts_start/tts_fallback arrives within 100ms,
  // use native TTS (this handles the case when server has no ElevenLabs configured)
  useEffect(() => {
    if (!state.subtitle.visible || !state.subtitle.text) return;

    let handled = false;

    function markHandled() { handled = true; }

    window.addEventListener("buddy-tts-start", markHandled, { once: true });
    window.addEventListener("buddy-tts-fallback", markHandled, { once: true });

    const timer = setTimeout(() => {
      window.removeEventListener("buddy-tts-start", markHandled);
      window.removeEventListener("buddy-tts-fallback", markHandled);
      if (!handled) {
        // No TTS message received — use native TTS directly
        playNativeTTS(state.subtitle.text);
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("buddy-tts-start", markHandled);
      window.removeEventListener("buddy-tts-fallback", markHandled);
    };
  }, [state.subtitle.visible, state.subtitle.text, playNativeTTS]);

  // Listen for tts_fallback to trigger native TTS with stored subtitle text
  useEffect(() => {
    function onFallback() {
      if (fallbackTextRef.current) {
        playNativeTTS(fallbackTextRef.current);
      }
    }

    window.addEventListener("buddy-tts-fallback", onFallback);
    return () => window.removeEventListener("buddy-tts-fallback", onFallback);
  }, [playNativeTTS]);

  // Cancel audio when a new message is being processed (user sent new input)
  useEffect(() => {
    if (state.input.isProcessing) {
      cancelAudio();
    }
  }, [state.input.isProcessing, cancelAudio]);

  return { cancelAudio };
}
```

**Step 2: Commit**

```bash
git add client/src/hooks/useAudioPlayer.js
git commit -m "feat: add useAudioPlayer hook for ElevenLabs + native TTS"
```

---

### Task 6: Refactor Avatar.jsx to use useAudioPlayer

**Files:**
- Modify: `client/src/components/Avatar.jsx`

**Step 1: Remove inline TTS logic and add useAudioPlayer**

Add import at the top (after line 4):
```js
import useAudioPlayer from "../hooks/useAudioPlayer";
```

Remove the module-level variable (line 7):
```js
let lastSpokenText = null;
```

Add the hook inside the component (after line 11, after destructuring state):
```js
  useAudioPlayer();
```

Delete the entire TTS useEffect block (lines 74-107):
```js
  // TTS + talk duration — only speak text that hasn't been spoken yet
  useEffect(() => {
    if (subtitle.visible && subtitle.text && subtitle.text !== lastSpokenText) {
      lastSpokenText = subtitle.text;
      ...
    }

    return () => {
      clearTimeout(talkTimerRef.current);
      window.speechSynthesis.cancel();
    };
  }, [subtitle.visible, subtitle.text, dispatch]);
```

Also remove `talkTimerRef` declaration (line 13):
```js
  const talkTimerRef = useRef(null);
```

**Step 2: Verify Avatar.jsx still renders correctly**

The avatar should still show the talking animation when `avatar.isTalking` is true, and the subtitle bubble when `subtitle.visible` is true. TTS is now handled by the hook.

**Step 3: Commit**

```bash
git add client/src/components/Avatar.jsx
git commit -m "refactor: move TTS from Avatar.jsx to useAudioPlayer hook"
```

---

### Task 7: Add voice picker UI to AgentEditor

**Files:**
- Modify: `client/src/components/admin/AgentEditor.jsx`

**Step 1: Add voice-related state variables**

After the existing state declarations (around line 25), add:

```js
  const [voiceProvider, setVoiceProvider] = useState("native");
  const [voiceId, setVoiceId] = useState("");
  const [voiceModelId, setVoiceModelId] = useState("eleven_flash_v2_5");
  const [voices, setVoices] = useState([]);
  const [ttsAvailable, setTtsAvailable] = useState(false);
  const [playingPreview, setPlayingPreview] = useState(null);
```

**Step 2: Load voices and parse voice_config in `loadAgent`**

After the existing `loadAgent` function loads agent data (around line 44, after `setAvatar`), add voice config parsing:

```js
      // Parse voice config
      if (agentData.voice_config) {
        try {
          const vc = typeof agentData.voice_config === "string"
            ? JSON.parse(agentData.voice_config)
            : agentData.voice_config;
          if (vc.voiceId) {
            setVoiceProvider("elevenlabs");
            setVoiceId(vc.voiceId);
            setVoiceModelId(vc.modelId || "eleven_flash_v2_5");
          }
        } catch {}
      }
```

**Step 3: Add a useEffect to fetch available voices**

After the existing `useEffect` for loading the agent, add:

```js
  useEffect(() => {
    apiFetch("/api/tts/voices")
      .then((v) => {
        setVoices(v);
        setTtsAvailable(v.length > 0);
      })
      .catch(() => {
        setVoices([]);
        setTtsAvailable(false);
      });
  }, []);
```

**Step 4: Build voice_config in handleSave**

In the `handleSave` function, modify the PUT call body to include voice_config. Replace the `apiFetch` for the agent update (around line 68):

```js
        apiFetch(`/api/agents/${agentId}`, {
          method: "PUT",
          body: {
            name, model, avatar, enabled_tools: enabledTools,
            voice_config: voiceProvider === "elevenlabs" && voiceId
              ? { provider: "elevenlabs", voiceId, modelId: voiceModelId }
              : {},
          },
        }),
```

**Step 5: Add the Voice section JSX**

Add the following JSX block between the Avatar section and the Model section (after the avatar `</div>` around line 193, before `{/* Model */}`):

```jsx
      {/* Voice */}
      <div>
        <label
          className="block text-sm font-medium mb-2"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Voice
        </label>

        {/* TTS Provider toggle */}
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => ttsAvailable && setVoiceProvider("elevenlabs")}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{
              backgroundColor: voiceProvider === "elevenlabs"
                ? "var(--color-accent)"
                : "var(--color-bg-raised)",
              color: voiceProvider === "elevenlabs"
                ? "#FFFFFF"
                : "var(--color-text-secondary)",
              border: voiceProvider === "elevenlabs"
                ? "1px solid var(--color-accent)"
                : "1px solid var(--color-border)",
              opacity: ttsAvailable ? 1 : 0.4,
              cursor: ttsAvailable ? "pointer" : "default",
            }}
          >
            ElevenLabs
          </button>
          <button
            onClick={() => setVoiceProvider("native")}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{
              backgroundColor: voiceProvider === "native"
                ? "var(--color-accent)"
                : "var(--color-bg-raised)",
              color: voiceProvider === "native"
                ? "#FFFFFF"
                : "var(--color-text-secondary)",
              border: voiceProvider === "native"
                ? "1px solid var(--color-accent)"
                : "1px solid var(--color-border)",
            }}
          >
            Device Voice
          </button>
        </div>

        {!ttsAvailable && voiceProvider === "native" && (
          <div
            className="text-xs mb-2 px-2"
            style={{ color: "var(--color-text-muted)" }}
          >
            ElevenLabs not configured — set ELEVENLABS_API_KEY in server .env
          </div>
        )}

        {/* Voice list (only when ElevenLabs selected) */}
        {voiceProvider === "elevenlabs" && voices.length > 0 && (
          <div
            className="rounded-xl overflow-hidden mb-3"
            style={{
              border: "1px solid var(--color-border)",
              maxHeight: "240px",
              overflowY: "auto",
            }}
          >
            {voices.map((v) => (
              <button
                key={v.voiceId}
                onClick={() => setVoiceId(v.voiceId)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors"
                style={{
                  backgroundColor: voiceId === v.voiceId
                    ? "var(--color-bg-raised)"
                    : "transparent",
                  color: "var(--color-text-primary)",
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                <span className="flex-1">{v.name}</span>
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: "var(--color-bg-surface)",
                    color: "var(--color-text-muted)",
                  }}
                >
                  {v.category}
                </span>
                {v.previewUrl && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (playingPreview === v.voiceId) {
                        setPlayingPreview(null);
                        return;
                      }
                      setPlayingPreview(v.voiceId);
                      const audio = new Audio(v.previewUrl);
                      audio.onended = () => setPlayingPreview(null);
                      audio.onerror = () => setPlayingPreview(null);
                      audio.play();
                    }}
                    className="text-xs px-2 py-1 rounded-lg"
                    style={{
                      backgroundColor: playingPreview === v.voiceId
                        ? "var(--color-accent)"
                        : "var(--color-bg-surface)",
                      color: playingPreview === v.voiceId
                        ? "#FFFFFF"
                        : "var(--color-text-muted)",
                    }}
                  >
                    {playingPreview === v.voiceId ? "..." : "Play"}
                  </button>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Voice model toggle (only when ElevenLabs selected) */}
        {voiceProvider === "elevenlabs" && (
          <div>
            <div
              className="text-xs mb-1"
              style={{ color: "var(--color-text-muted)" }}
            >
              Voice Model
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setVoiceModelId("eleven_flash_v2_5")}
                className="px-3 py-1.5 rounded-xl text-xs font-medium transition-colors"
                style={{
                  backgroundColor: voiceModelId === "eleven_flash_v2_5"
                    ? "var(--color-accent)"
                    : "var(--color-bg-raised)",
                  color: voiceModelId === "eleven_flash_v2_5"
                    ? "#FFFFFF"
                    : "var(--color-text-secondary)",
                  border: voiceModelId === "eleven_flash_v2_5"
                    ? "1px solid var(--color-accent)"
                    : "1px solid var(--color-border)",
                }}
              >
                Flash v2.5
              </button>
              <button
                onClick={() => setVoiceModelId("eleven_multilingual_v2")}
                className="px-3 py-1.5 rounded-xl text-xs font-medium transition-colors"
                style={{
                  backgroundColor: voiceModelId === "eleven_multilingual_v2"
                    ? "var(--color-accent)"
                    : "var(--color-bg-raised)",
                  color: voiceModelId === "eleven_multilingual_v2"
                    ? "#FFFFFF"
                    : "var(--color-text-secondary)",
                  border: voiceModelId === "eleven_multilingual_v2"
                    ? "1px solid var(--color-accent)"
                    : "1px solid var(--color-border)",
                }}
              >
                Multilingual v2
              </button>
            </div>
          </div>
        )}
      </div>
```

**Step 6: Commit**

```bash
git add client/src/components/admin/AgentEditor.jsx
git commit -m "feat: add voice picker UI to AgentEditor"
```

---

### Task 8: Handle TTS for scheduled/offline messages

**Files:**
- Modify: `server/index.js` (pending message delivery in WS connect handler, around lines 567-587)

**Step 1: Ensure scheduled messages don't trigger TTS**

Scheduled messages are replayed on WS connect — they shouldn't trigger TTS because:
1. They may be stale (from hours ago)
2. Playing multiple audio messages simultaneously would be chaotic

The current code replays messages via `sendTo(ws, msg)` — these are canvas commands and notifications, not subtitles with TTS. The `tts_fallback`/`tts_start`/`tts_end` messages are only generated in the prompt handler, so scheduled message replay won't accidentally trigger TTS. No changes needed.

**Step 2: Verify the scheduler's `processPrompt` path also gets TTS**

Look at `server/scheduler.js` — the scheduler calls `processPrompt` and uses `splitAndBroadcast` to deliver results. If the user is online, results go via broadcast. If offline, they're queued as pending messages.

For online delivery, the scheduler would need the same TTS callback. However, scheduled messages are informational (reminders, task results) and TTS for them is a nice-to-have, not a must-have. **Skip TTS for scheduled messages in this iteration** — they'll use native fallback.

**Step 3: Commit (no changes — document the decision)**

No code changes needed. The scheduler path already works correctly without TTS wiring. Scheduled subtitles will fall through to native TTS via the 200ms timeout in `useAudioPlayer`.

---

### Task 9: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (TTS line in Tech Stack section)

**Step 1: Update the TTS entry in Tech Stack**

Find:
```
- **TTS:** Browser Speech API (to be replaced with ElevenLabs/OpenAI later)
```

Replace with:
```
- **TTS:** ElevenLabs API (server-side streaming via WebSocket) with browser Speech API fallback
```

**Step 2: Add TTS module to Key Server Modules**

After the `server/scheduler.js` entry, add:
```
- `server/tts.js` — ElevenLabs TTS service: availability check, voice listing, streaming speech. Calls ElevenLabs HTTP streaming endpoint, returns readable stream of MP3 chunks. Auto-disables for 5 minutes on auth failure.
```

**Step 3: Add useAudioPlayer to Key Client Modules**

After the `client/src/hooks/useEntryAnimation.js` entry, add:
```
- `client/src/hooks/useAudioPlayer.js` — Audio playback hook: listens for TTS WebSocket events (tts_start, binary chunks, tts_end, tts_fallback), accumulates MP3 chunks, decodes via AudioContext, plays. Falls back to browser speechSynthesis. Cancels on new input.
```

**Step 4: Update Known web-only divergences**

Find:
```
- `window.speechSynthesis` — will use `expo-speech` on mobile
```

Replace with:
```
- `window.speechSynthesis` (native fallback) — will use `expo-speech` on mobile
- `AudioContext.decodeAudioData` (ElevenLabs playback) — will use `expo-av` on mobile
```

**Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with ElevenLabs TTS architecture"
```

---

### Task 10: Manual integration test

**No files changed — testing only.**

**Step 1: Test without ElevenLabs API key**

1. Ensure `ELEVENLABS_API_KEY` is empty in `server/.env`
2. Start the server: `cd /root/buddy/server && node index.js`
3. Start the client: `cd /root/buddy/client && npm run dev`
4. Open the app, log in, send a message
5. **Expected:** Subtitle appears, native browser TTS speaks the text (same as before)
6. Open admin → agent editor → verify Voice section shows "ElevenLabs not configured" and Device Voice is selected

**Step 2: Test with ElevenLabs API key**

1. Add a valid `ELEVENLABS_API_KEY` to `server/.env`
2. Restart the server
3. Open admin → agent editor → verify:
   - Voice section shows both ElevenLabs and Device Voice buttons
   - ElevenLabs button is clickable
   - Voice list loads with available voices
   - Preview play button works
   - Save with a selected voice
4. Send a message
5. **Expected:** Subtitle appears, ElevenLabs audio plays through speakers

**Step 3: Test fallback behavior**

1. Set an invalid `ELEVENLABS_API_KEY` (e.g., `xi-invalid`)
2. Restart the server
3. Agent still has voiceId configured
4. Send a message
5. **Expected:** Server logs "ElevenLabs API key invalid", client falls back to native TTS silently

**Step 4: Verify no regressions**

1. Canvas commands still render before speech
2. Thinking dots still appear while processing
3. Avatar mouth animation still syncs to talking state
4. Agent switching works correctly
5. Session reset works correctly
