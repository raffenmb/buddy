import { useEffect, useRef } from "react";
import { useBuddy } from "../context/BuddyState";
import { routeCommand } from "../lib/commandRouter";

function getWsUrl() {
  const token = localStorage.getItem("buddy_token");

  if (import.meta.env.VITE_WS_URL) {
    const base = import.meta.env.VITE_WS_URL;
    return token ? `${base}?token=${token}` : base;
  }

  if (import.meta.env.DEV) {
    const base = "ws://localhost:3001";
    return token ? `${base}?token=${token}` : base;
  }

  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const base = `${proto}//${window.location.host}`;
  return token ? `${base}?token=${token}` : base;
}

export default function useWebSocket() {
  const { dispatch, wsRef } = useBuddy();
  const reconnectTimeoutRef = useRef(null);
  const backoffRef = useRef(1000);

  useEffect(() => {
    const token = localStorage.getItem("buddy_token");
    if (!token) return; // Don't connect without auth

    function connect() {
      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        dispatch({ type: "SET_CONNECTED", payload: true });
        backoffRef.current = 1000;
      });

      ws.addEventListener("close", () => {
        dispatch({ type: "SET_CONNECTED", payload: false });
        scheduleReconnect();
      });

      ws.addEventListener("error", () => {
        ws.close();
      });

      ws.addEventListener("message", (event) => {
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
            default:
              break;
          }
        } catch (err) {
          console.error("WebSocket message parse error:", err);
        }
      });
    }

    function scheduleReconnect() {
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
        backoffRef.current = Math.min(backoffRef.current * 2, 10000);
      }, backoffRef.current);
    }

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [dispatch]);
}
