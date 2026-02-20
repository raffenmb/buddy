/**
 * ElevenLabs TTS module — provides text-to-speech streaming via the
 * ElevenLabs API. Reads ELEVENLABS_API_KEY from process.env. Temporarily
 * disables itself for 5 minutes on 401 responses to avoid spamming bad
 * requests.
 */

// ─── Module-level state ─────────────────────────────────────────────────────

const API_KEY = process.env.ELEVENLABS_API_KEY;
const BASE_URL = "https://api.elevenlabs.io/v1";
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

let unavailableUntil = 0;

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns true if the ElevenLabs API key is configured and the service
 * is not temporarily disabled (e.g. after a 401 response).
 */
function isAvailable() {
  if (!API_KEY) return false;
  if (Date.now() < unavailableUntil) return false;
  return true;
}

/**
 * Fetches the list of available voices from ElevenLabs.
 * Returns [{ voiceId, name, category, previewUrl }] or [] on error.
 */
async function listVoices() {
  if (!API_KEY) return [];

  try {
    const res = await fetch(`${BASE_URL}/voices`, {
      headers: { "xi-api-key": API_KEY },
    });

    if (!res.ok) return [];

    const data = await res.json();
    return (data.voices || []).map((v) => ({
      voiceId: v.voice_id,
      name: v.name,
      category: v.category,
      previewUrl: v.preview_url,
    }));
  } catch (err) {
    console.error("[tts] listVoices error:", err.message);
    return [];
  }
}

/**
 * Streams synthesised speech as MP3 audio from ElevenLabs.
 *
 * @param {string} text         — the text to speak
 * @param {object} voiceConfig  — { voiceId, modelId, stability, similarityBoost }
 * @returns {ReadableStream|null} readable stream of MP3 data, or null on error
 */
async function streamSpeech(text, voiceConfig) {
  if (!isAvailable()) return null;

  const {
    voiceId,
    modelId = "eleven_flash_v2_5",
    stability,
    similarityBoost,
  } = voiceConfig;

  const url = `${BASE_URL}/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability,
          similarity_boost: similarityBoost,
        },
      }),
    });

    if (res.status === 401) {
      console.error("[tts] 401 Unauthorized — disabling for 5 minutes");
      unavailableUntil = Date.now() + COOLDOWN_MS;
      return null;
    }

    if (!res.ok) {
      console.error(`[tts] streamSpeech error: HTTP ${res.status}`);
      return null;
    }

    return res.body;
  } catch (err) {
    console.error("[tts] streamSpeech error:", err.message);
    return null;
  }
}

// ─── Exports ────────────────────────────────────────────────────────────────

export { isAvailable, listVoices, streamSpeech };
