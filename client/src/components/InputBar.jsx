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

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900/90 backdrop-blur border-t border-gray-800">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={`Type something to ${agent.name}...`}
        disabled={input.isProcessing}
        className="w-full bg-transparent text-white px-6 py-4 outline-none placeholder-gray-500 disabled:opacity-50"
      />
    </div>
  );
}
