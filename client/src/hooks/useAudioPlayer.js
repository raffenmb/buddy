import { useEffect, useRef, useCallback } from "react";
import { useBuddy } from "../context/BuddyState";

export default function useAudioPlayer() {
  const { state, dispatch } = useBuddy();
  const audioContextRef = useRef(null);
  const chunksRef = useRef([]);
  const activeSourceRef = useRef(null);
  const fallbackTextRef = useRef(null);

  // cancelAudio — stops any in-progress audio (AudioContext source + speechSynthesis)
  const cancelAudio = useCallback(() => {
    if (activeSourceRef.current) {
      try { activeSourceRef.current.stop(); } catch {}
      activeSourceRef.current = null;
    }
    window.speechSynthesis.cancel();
    chunksRef.current = [];
  }, []);

  // playAccumulatedAudio — merge chunks, decode, play
  const playAccumulatedAudio = useCallback(async () => {
    const chunks = chunksRef.current;
    chunksRef.current = [];

    if (chunks.length === 0) {
      dispatch({ type: "STOP_TALKING" });
      return;
    }

    const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }

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

  // playNativeTTS — browser speech synthesis
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

  // Main event listeners for TTS events
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

  // When subtitle appears and no TTS event arrives within 200ms, use native TTS.
  // This handles the case when the server has no ElevenLabs configured at all
  // (no tts_start, no tts_fallback — just a subtitle message).
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
        playNativeTTS(state.subtitle.text);
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("buddy-tts-start", markHandled);
      window.removeEventListener("buddy-tts-fallback", markHandled);
    };
  }, [state.subtitle.visible, state.subtitle.text, playNativeTTS]);

  // Cancel audio when user sends a new message (processing starts)
  useEffect(() => {
    if (state.input.isProcessing) {
      cancelAudio();
    }
  }, [state.input.isProcessing, cancelAudio]);

  return { cancelAudio };
}
