import { useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import { useBuddy } from '../context/BuddyProvider';
import { getToken } from '../lib/storage';
import { getBaseUrl } from '../lib/api';
import { COMMAND_MAP } from '@buddy/shared';

export default function useWebSocket() {
  const { dispatch, wsRef } = useBuddy();
  const reconnectTimer = useRef(null);
  const reconnectDelay = useRef(1000);
  const appState = useRef(AppState.currentState);

  const connect = useCallback(async () => {
    const token = await getToken();
    const baseUrl = getBaseUrl();
    if (!token || !baseUrl) return;

    const wsUrl = baseUrl.replace(/^http/, 'ws') + '?token=' + token;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      dispatch({ type: 'SET_CONNECTED', payload: true });
      reconnectDelay.current = 1000;
    };

    ws.onmessage = (event) => {
      // Binary data = TTS audio chunk
      if (typeof event.data !== 'string') {
        if (wsRef.current?.onAudioChunk) {
          wsRef.current.onAudioChunk(event.data);
        }
        return;
      }

      try {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case 'subtitle':
            dispatch({ type: 'SET_SUBTITLE', payload: { text: msg.text } });
            if (wsRef.current?.onSubtitle) wsRef.current.onSubtitle(msg.text);
            break;
          case 'canvas_command': {
            const actionType = COMMAND_MAP[msg.command];
            if (actionType) dispatch({ type: actionType, payload: msg.params });
            break;
          }
          case 'processing':
            dispatch({ type: 'SET_PROCESSING', payload: msg.status });
            break;
          case 'agent_switch':
            dispatch({ type: 'SET_AGENT', payload: msg.agent });
            if (msg.canvas) {
              dispatch({ type: 'CANVAS_REHYDRATE', payload: { elements: msg.canvas } });
            }
            break;
          case 'canvas_rehydrate':
            dispatch({ type: 'CANVAS_REHYDRATE', payload: { elements: msg.elements } });
            break;
          case 'tts_start':
            if (wsRef.current?.onTtsStart) wsRef.current.onTtsStart();
            break;
          case 'tts_end':
            if (wsRef.current?.onTtsEnd) wsRef.current.onTtsEnd();
            break;
          case 'tts_fallback':
            if (wsRef.current?.onTtsFallback) wsRef.current.onTtsFallback(msg.text);
            break;
          default:
            break;
        }
      } catch (err) {
        console.error('WebSocket message parse error:', err);
      }
    };

    ws.onclose = () => {
      dispatch({ type: 'SET_CONNECTED', payload: false });
      if (appState.current === 'active') {
        reconnectTimer.current = setTimeout(() => {
          reconnectDelay.current = Math.min(reconnectDelay.current * 2, 10000);
          connect();
        }, reconnectDelay.current);
      }
    };

    ws.onerror = () => ws.close();

    wsRef.current = { ...wsRef.current, ws };
  }, [dispatch, wsRef]);

  // Handle app state changes (background/foreground)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextState === 'active'
      ) {
        connect();
      } else if (nextState.match(/inactive|background/)) {
        wsRef.current?.ws?.close();
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [connect, wsRef]);

  // Initial connect
  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.ws?.close();
    };
  }, [connect]);

  // Send helper
  const send = useCallback(
    (data) => {
      const ws = wsRef.current?.ws;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
      }
    },
    [wsRef]
  );

  return { send };
}
