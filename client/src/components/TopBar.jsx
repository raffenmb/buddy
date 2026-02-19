import { useState, useEffect, useRef } from "react";
import { useBuddy } from "../context/BuddyState";
import { useTheme } from "../hooks/useTheme";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";

export default function TopBar() {
  const { state, dispatch } = useBuddy();
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [agents, setAgents] = useState([]);
  const pickerRef = useRef(null);

  // Close picker on outside tap
  useEffect(() => {
    if (!pickerOpen) return;
    function handlePress(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePress);
    return () => document.removeEventListener("mousedown", handlePress);
  }, [pickerOpen]);

  async function togglePicker() {
    if (pickerOpen) {
      setPickerOpen(false);
      return;
    }
    try {
      const list = await apiFetch("/api/agents");
      setAgents(list);
    } catch {
      setAgents([]);
    }
    setPickerOpen(true);
  }

  function switchAgent(agent) {
    setPickerOpen(false);
    if (agent.id === state.agent.id) return;
    dispatch({ type: "SET_AGENT", payload: { id: agent.id, name: agent.name, avatar: agent.avatar || "buddy" } });
    dispatch({ type: "CLEAR_SUBTITLE" });
    dispatch({ type: "CANVAS_SET_MODE", payload: { mode: "clear" } });
  }

  function openAdmin() {
    dispatch({ type: "SET_VIEW", payload: "admin" });
  }

  return (
    <div
      className="flex items-center justify-between px-4 py-3 border-b"
      style={{
        backgroundColor: "var(--color-bg-surface)",
        borderColor: "var(--color-border)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      {/* Left: agent name (tappable) + connection dot */}
      <div className="relative" ref={pickerRef}>
        <button
          onClick={togglePicker}
          className="flex items-center gap-2"
          style={{ background: "none", border: "none", padding: 0 }}
        >
          <span
            className="font-semibold text-base"
            style={{ color: "var(--color-text-primary)" }}
          >
            {state.agent.name}
          </span>
          {/* Chevron */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-text-muted)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform: pickerOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 150ms ease",
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
          <span
            className="w-2 h-2 rounded-full"
            style={{
              backgroundColor: state.connected
                ? "var(--color-secondary)"
                : "var(--color-text-muted)",
            }}
          />
        </button>

        {/* Agent picker dropdown */}
        {pickerOpen && (
          <div
            className="absolute left-0 mt-2 rounded-xl py-1 min-w-40"
            style={{
              backgroundColor: "var(--color-bg-surface)",
              border: "1px solid var(--color-border)",
              boxShadow: "var(--shadow-card)",
              zIndex: 50,
            }}
          >
            {agents.map((a) => (
              <button
                key={a.id}
                onClick={() => switchAgent(a)}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-left transition-colors"
                style={{
                  color: a.id === state.agent.id
                    ? "var(--color-accent)"
                    : "var(--color-text-primary)",
                  backgroundColor: "transparent",
                  fontWeight: a.id === state.agent.id ? 600 : 400,
                  border: "none",
                }}
              >
                {a.name}
                {!a.user_id && (
                  <span
                    className="text-xs ml-1"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    (shared)
                  </span>
                )}
              </button>
            ))}
            {agents.length === 0 && (
              <span
                className="block px-4 py-2 text-sm"
                style={{ color: "var(--color-text-muted)" }}
              >
                No agents found
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right: user + logout + theme toggle + admin gear */}
      <div className="flex items-center gap-2">
        <span
          className="text-xs font-medium px-2"
          style={{ color: "var(--color-text-muted)" }}
        >
          {user?.displayName}
        </span>

        <button
          onClick={logout}
          className="p-2 rounded-xl transition-colors"
          style={{ color: "var(--color-text-secondary)" }}
          title="Sign out"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>

        <button
          onClick={toggleTheme}
          className="p-2 rounded-xl transition-colors"
          style={{ color: "var(--color-text-secondary)" }}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? (
            // Sun icon
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            // Moon icon
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>

        {/* Admin gear — only for admins */}
        {user?.isAdmin && (
          <button
            onClick={openAdmin}
            className="p-2 rounded-xl transition-colors"
            style={{ color: "var(--color-text-secondary)" }}
            title="Admin Dashboard"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
