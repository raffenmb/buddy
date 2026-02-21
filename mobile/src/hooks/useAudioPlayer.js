import { useEffect, useRef, useCallback } from 'react';
import { useAudioPlayer as useExpoAudioPlayer, AudioModule } from 'expo-audio';
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system';
import { useBuddy } from '../context/BuddyProvider';

export default function useAudioPlayer() {
  const { state, dispatch, wsRef } = useBuddy();
  const chunksRef = useRef([]);
  const playerRef = useRef(null);
  const fallbackTimer = useRef(null);
  const isTtsActive = useRef(false);
  const fallbackTextRef = useRef(null);
  const currentUriRef = useRef(null);

  // Configure audio mode once
  useEffect(() => {
    AudioModule.setAudioModeAsync({
      playsInSilentModeIOS: true,
      shouldPlayInBackground: true,
    });
  }, []);

  const stopTalking = useCallback(() => {
    dispatch({ type: 'STOP_TALKING' });
  }, [dispatch]);

  // Cancel all audio playback
  const cancelAudio = useCallback(async () => {
    if (playerRef.current) {
      try {
        playerRef.current.pause();
        playerRef.current.remove();
      } catch {}
      playerRef.current = null;
    }
    if (currentUriRef.current) {
      FileSystem.deleteAsync(currentUriRef.current, { idempotent: true });
      currentUriRef.current = null;
    }
    Speech.stop();
    chunksRef.current = [];
    isTtsActive.current = false;
    clearTimeout(fallbackTimer.current);
    stopTalking();
  }, [stopTalking]);

  // Play accumulated MP3 chunks via expo-audio
  const playAccumulatedAudio = useCallback(async () => {
    const chunks = chunksRef.current;
    chunksRef.current = [];

    if (chunks.length === 0) {
      stopTalking();
      return;
    }

    try {
      // Merge chunks into one buffer
      const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
      const merged = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(new Uint8Array(chunk), offset);
        offset += chunk.byteLength;
      }

      // Convert to base64 and write to temp file
      const bytes = merged;
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      const uri = FileSystem.cacheDirectory + 'tts-' + Date.now() + '.mp3';
      await FileSystem.writeAsStringAsync(uri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      currentUriRef.current = uri;

      // Play using expo-audio AudioPlayer
      const player = AudioModule.createPlayer(uri);
      playerRef.current = player;

      player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) {
          stopTalking();
          player.remove();
          playerRef.current = null;
          FileSystem.deleteAsync(uri, { idempotent: true });
          currentUriRef.current = null;
        }
      });

      player.play();
    } catch (err) {
      console.error('[audio] Failed to play audio:', err);
      stopTalking();
    }
  }, [stopTalking]);

  // Native TTS fallback via expo-speech
  const playNativeTTS = useCallback(
    (text) => {
      if (!text) return;
      Speech.stop();
      Speech.speak(text, {
        onDone: stopTalking,
        onError: stopTalking,
      });

      // Fallback timer in case onDone never fires
      const fallbackDuration = Math.min(
        Math.max((text.length / 15) * 1000, 1000),
        15000
      );
      setTimeout(stopTalking, fallbackDuration);
    },
    [stopTalking]
  );

  // Wire up WebSocket TTS event handlers via wsRef
  useEffect(() => {
    if (!wsRef.current) wsRef.current = {};

    wsRef.current.onTtsStart = () => {
      cancelAudio();
      isTtsActive.current = true;
      chunksRef.current = [];
    };

    wsRef.current.onAudioChunk = (data) => {
      if (isTtsActive.current) {
        // Convert Blob to ArrayBuffer if needed
        if (data instanceof ArrayBuffer) {
          chunksRef.current.push(data);
        } else if (data && data.arrayBuffer) {
          data.arrayBuffer().then((buf) => chunksRef.current.push(buf));
        }
      }
    };

    wsRef.current.onTtsEnd = () => {
      isTtsActive.current = false;
      playAccumulatedAudio();
    };

    wsRef.current.onTtsFallback = (text) => {
      isTtsActive.current = false;
      chunksRef.current = [];
      if (fallbackTextRef.current) {
        playNativeTTS(fallbackTextRef.current);
      }
    };

    wsRef.current.cancelAudio = cancelAudio;
  }, [wsRef, cancelAudio, playAccumulatedAudio, playNativeTTS]);

  // Track subtitle text for native TTS fallback
  useEffect(() => {
    if (state.subtitle.visible && state.subtitle.text) {
      fallbackTextRef.current = state.subtitle.text;
    }
  }, [state.subtitle.visible, state.subtitle.text]);

  // When subtitle appears and no TTS event arrives within 200ms, use native TTS
  useEffect(() => {
    if (!state.subtitle.visible || !state.subtitle.text) return;

    clearTimeout(fallbackTimer.current);
    fallbackTimer.current = setTimeout(() => {
      if (!isTtsActive.current) {
        playNativeTTS(state.subtitle.text);
      }
    }, 200);

    return () => clearTimeout(fallbackTimer.current);
  }, [state.subtitle.visible, state.subtitle.text, playNativeTTS]);

  // Cancel audio when user sends a new message
  useEffect(() => {
    if (state.input.isProcessing) {
      cancelAudio();
    }
  }, [state.input.isProcessing, cancelAudio]);

  return { cancelAudio };
}
