# ElevenLabs TTS Integration Design

**Date:** 2026-02-20
**Status:** Approved

## Overview

Replace the browser-only `window.speechSynthesis` TTS with an ElevenLabs-powered pipeline that streams high-quality synthesized audio from the server to the client over WebSocket. Native browser/device TTS remains as an automatic silent fallback when ElevenLabs is unavailable or unconfigured.

## Goals

- Per-agent ElevenLabs voice selection (pre-built, cloned, or library voices)
- Server-side API calls (API key never exposed to client)
- Streaming audio delivery over existing WebSocket connection
- Automatic silent fallback to native TTS
- Cross-platform compatible design (web now, React Native later)

## Non-Goals

- Per-user API keys (global .env only)
- Voice cloning UI (users clone via ElevenLabs dashboard, cloned voices appear in picker)
- Real-time WebSocket input streaming from LLM → ElevenLabs (subtitles are short, HTTP streaming is sufficient)

---

## 1. Data Model & Configuration

### voice_config JSON (per agent)

```json
{
  "provider": "elevenlabs",
  "voiceId": "Xb7hH8MSUJpSbSDYk0k2",
  "modelId": "eleven_flash_v2_5",
  "stability": 0.5,
  "similarityBoost": 0.75
}
```

- Empty `{}` or `provider` absent/`"native"` → use native TTS
- `modelId` defaults to `eleven_flash_v2_5` if omitted
- `stability` and `similarityBoost` are optional (ElevenLabs has per-voice defaults)

No DB schema changes — `voice_config` column already exists on `agents` and is wired through CRUD.

### Server Environment

```env
ELEVENLABS_API_KEY=xi-...    # Empty or absent = ElevenLabs disabled globally
```

### New REST Endpoint

`GET /api/tts/voices` — proxies `GET https://api.elevenlabs.io/v1/voices`, returns:
```json
[
  { "voiceId": "...", "name": "Rachel", "category": "premade", "previewUrl": "https://..." },
  { "voiceId": "...", "name": "My Clone", "category": "cloned", "previewUrl": "https://..." }
]
```

Returns `[]` if no API key configured.

---

## 2. Server-Side TTS Module

### New module: `server/tts.js`

Responsibilities:
1. Expose `isAvailable()` — checks if `ELEVENLABS_API_KEY` is set
2. Expose `streamSpeech(text, voiceConfig)` — calls ElevenLabs HTTP streaming endpoint, returns a readable stream of MP3 chunks
3. Expose `listVoices()` — calls ElevenLabs voices endpoint, returns formatted voice list

### Audio Flow

```
Claude response arrives
        │
        ▼
response-splitter.js separates subtitle text from canvas commands
        │
        ▼
Canvas commands sent via WS (JSON)  ──→  client renders visuals
        │
        ▼
Subtitle text sent via WS (JSON)    ──→  client shows subtitle bubble
        │
        ▼
tts.js called with (text, voiceConfig)
        │
   ┌────┴────┐
   │ Has API  │
   │  key +   │
   │ voiceId? │
   └────┬────┘
    yes │        no
        │         │
        ▼         ▼
  Call ElevenLabs  Send JSON: { type: "tts_fallback" }
  streaming API         │
        │               ▼
        ▼         Client uses window.speechSynthesis
  Binary chunks
  arrive from
  ElevenLabs
        │
        ▼
  Send JSON: { type: "tts_start", format: "mp3" }
  For each chunk:
    WS binary frame ──→ client accumulates audio data
  Send JSON: { type: "tts_end" }
        │
        ▼
  Client decodes full audio, plays, dispatches STOP_TALKING when done
```

### WebSocket Message Protocol

| Direction | Type | Format | Content |
|-----------|------|--------|---------|
| Server → Client | `tts_start` | JSON | `{ type: "tts_start", format: "mp3" }` |
| Server → Client | (audio data) | Binary | Raw MP3 chunks |
| Server → Client | `tts_end` | JSON | `{ type: "tts_end" }` |
| Server → Client | `tts_fallback` | JSON | `{ type: "tts_fallback" }` |

### ElevenLabs API Details

- **Endpoint:** `POST https://api.elevenlabs.io/v1/text-to-speech/{voiceId}/stream`
- **Output format:** `mp3_44100_128` (universally playable, good quality/bandwidth balance)
- **Default model:** `eleven_flash_v2_5` (~75ms latency, ideal for real-time)
- **Alternative model:** `eleven_multilingual_v2` (higher quality, 300-500ms latency)
- **Authentication:** `xi-api-key` header

---

## 3. Client-Side Audio Playback

### New hook: `useAudioPlayer`

```
useAudioPlayer hook
    │
    ├── Listens for tts_start, binary frames, tts_end, tts_fallback on WebSocket
    ├── Creates AudioContext lazily on first tts_start
    ├── Accumulates binary chunks into a single ArrayBuffer
    ├── On tts_end: decodes complete buffer via AudioContext.decodeAudioData()
    ├── Plays decoded audio via AudioBufferSourceNode
    ├── Dispatches STOP_TALKING when playback completes
    └── On tts_fallback: delegates to existing SpeechSynthesisUtterance logic
```

### Avatar.jsx Refactor

Current TTS logic (lines 75-107) moves into `useAudioPlayer`. Avatar.jsx becomes a consumer:
- Hook handles all audio playback (ElevenLabs or native)
- Avatar still handles mouth animation based on `avatar.isTalking` state (no change)
- New subtitle cancels any in-progress audio (same as current `speechSynthesis.cancel()`)

### Why Accumulate Instead of Stream Playback

`AudioContext.decodeAudioData()` requires a complete, valid audio container — it can't process arbitrary MP3 frame boundaries. For subtitles (1-3 sentences, 2-8 seconds of audio), accumulating all chunks then decoding is:
- Simple (no JS MP3 decoder dependency)
- Fast (network streaming still hides latency — audio arrives while we accumulate)
- Reliable (no frame alignment issues)

True frame-by-frame streaming would require a JS MP3 decoder library and adds complexity that isn't justified for short utterances.

---

## 4. Voice Picker UI

### New section in AgentEditor (between Avatar and Model)

```
┌─────────────────────────────────────────┐
│  Voice                                   │
│                                          │
│  TTS Provider                            │
│  [● ElevenLabs]  [○ Device Voice]        │
│                                          │
│  Voice (scrollable list)                 │
│  [  Rachel      premade  ♪]             │
│  [  Adam        premade  ♪]             │
│  [● Antoni      premade  ♪] ← selected  │
│  [  My Clone    cloned   ♪]             │
│  ...                                     │
│                                          │
│  Model                                   │
│  [● Flash v2.5]  [○ Multilingual v2]     │
└─────────────────────────────────────────┘
```

- **TTS Provider toggle:** Button-pill picker (matches avatar/model UI patterns). ElevenLabs disabled if no API key.
- **Voice list:** Scrollable button rows with name, category tag, preview play button (♪). Preview hits ElevenLabs preview URL.
- **Model toggle:** Two buttons — Flash v2.5 (default) and Multilingual v2. Only visible when ElevenLabs selected.
- **No `<select>` elements** — all button-based per cross-platform parity rules.

### Data Flow

1. AgentEditor mounts → `GET /api/tts/voices`
2. Empty response → ElevenLabs toggle disabled, "not configured" message
3. User selects provider + voice + model → stored in local state
4. Save → `voice_config` JSON sent via `PUT /api/agents/:id`

---

## 5. Error Handling

| Scenario | Behavior |
|----------|----------|
| No `ELEVENLABS_API_KEY` | Server sends `tts_fallback`. Voice picker shows "not configured". |
| Agent `voice_config` is `{}` | Native TTS (server sends `tts_fallback`). |
| ElevenLabs 429 (rate limited) | `tts_fallback` for this utterance. Next utterance retries. |
| ElevenLabs 401 (bad key) | Log warning, `tts_fallback`. Mark unavailable for 5 min. |
| Network error | `tts_fallback`. |
| Navigate away mid-playback | `useAudioPlayer` cleanup stops AudioContext. |
| Rapid successive subtitles | New subtitle cancels in-progress audio. |
| Very long text | Not expected (system prompt limits subtitles to 1-3 sentences). ElevenLabs handles up to 5000 chars. |

**No retry logic** — for conversational TTS, playing stale audio is worse than falling back to native. Next utterance retries automatically.

---

## 6. Mobile Parity

| Concern | Web | React Native (future) |
|---------|-----|----------------------|
| ElevenLabs audio | `AudioContext` + `decodeAudioData()` | `expo-av` `Audio.Sound` |
| Native fallback | `window.speechSynthesis` | `expo-speech` |
| Audio delivery | WebSocket binary frames | WebSocket binary frames (supported) |
| Voice picker UI | Button-based (current patterns) | Same components (NativeWind) |

The `useAudioPlayer` hook is structured so core logic (WS message handling, state machine) is shared. Only audio playback calls differ by platform. Web-only implementation for now.

---

## Files Changed

### New Files
- `server/tts.js` — ElevenLabs TTS service (availability check, streaming, voice listing)
- `client/src/hooks/useAudioPlayer.js` — Audio playback hook (WS listener, AudioContext, fallback)

### Modified Files
- `server/index.js` — Add `/api/tts/voices` endpoint, integrate TTS into response flow
- `client/src/components/Avatar.jsx` — Extract TTS into useAudioPlayer hook
- `client/src/components/admin/AgentEditor.jsx` — Add voice picker section
- `client/src/hooks/useWebSocket.js` — Handle binary WS frames + tts_* JSON messages
- `server/package.json` — Add `@elevenlabs/elevenlabs-js` dependency (or use raw fetch)

### Unchanged
- Database schema (voice_config column already exists)
- `server/agents.js` (already handles voice_config CRUD)
- `.env.example` (already has ELEVENLABS_API_KEY placeholder)
