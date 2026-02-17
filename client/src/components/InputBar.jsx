import { useState } from "react";
import { useBuddy } from "../context/BuddyState";

const AUTH_TOKEN = import.meta.env.VITE_AUTH_TOKEN || "";

export default function InputBar() {
  const { state, dispatch } = useBuddy();
  const { input, agent } = state;
  const [text, setText] = useState("");

  async function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed || input.isProcessing) return;

    dispatch({ type: "CLEAR_SUBTITLE" });
    dispatch({ type: "SET_PROCESSING", payload: true });
    setText("");

    try {
      const headers = { "Content-Type": "application/json" };
      if (AUTH_TOKEN) headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;

      await fetch("/api/prompt", {
        method: "POST",
        headers,
        body: JSON.stringify({ prompt: trimmed, agent_id: agent.id })
      });
    } catch (err) {
      console.error("Failed to send prompt:", err);
      dispatch({ type: "SET_PROCESSING", payload: false });
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  }

  const hasText = text.trim().length > 0;

  return (
    <div className="px-3 py-3" style={{ backgroundColor: "var(--color-bg-base)" }}>
      <div
        className="flex items-center gap-2 rounded-full px-4 py-2"
        style={{
          backgroundColor: "var(--color-bg-surface)",
          boxShadow: "var(--shadow-card)",
          border: "1px solid var(--color-border)",
        }}
      >
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Talk to ${agent.name}...`}
          disabled={input.isProcessing}
          className="flex-1 bg-transparent outline-none text-sm disabled:opacity-50"
          style={{
            color: "var(--color-text-primary)",
            fontFamily: "var(--font-family-base)",
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={!hasText || input.isProcessing}
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors disabled:opacity-40"
          style={{
            backgroundColor: hasText
              ? "var(--color-accent)"
              : "var(--color-bg-raised)",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke={hasText ? "#FFFFFF" : "var(--color-text-muted)"}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
