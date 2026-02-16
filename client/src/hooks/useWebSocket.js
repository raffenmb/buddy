import { useEffect, useRef } from "react";
import { useBuddy } from "../context/BuddyState";
import { routeCommand } from "../lib/commandRouter";

const AUTH_TOKEN = import.meta.env.VITE_AUTH_TOKEN || "";

function getWsUrl() {
  // Explicit env override
  if (import.meta.env.VITE_WS_URL) {
    const base = import.meta.env.VITE_WS_URL;
    return AUTH_TOKEN ? `${base}?token=${AUTH_TOKEN}` : base;
  }

  // In dev mode (Vite dev server), connect directly to the backend
  if (import.meta.env.DEV) {
    const base = "ws://localhost:3001";
    return AUTH_TOKEN ? `${base}?token=${AUTH_TOKEN}` : base;
  }

  // Production: derive from current page location
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const base = `${proto}//${window.location.host}`;
  return AUTH_TOKEN ? `${base}?token=${AUTH_TOKEN}` : base;
}

export default function useWebSocket() {
  const { dispatch } = useBuddy();
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const backoffRef = useRef(1000);

  useEffect(() => {
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
