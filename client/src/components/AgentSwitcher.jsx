import { useEffect, useState } from "react";
import { useBuddy } from "../context/BuddyState";
import { apiFetch } from "../lib/api";

export default function AgentSwitcher() {
  const { state, dispatch } = useBuddy();
  const [agents, setAgents] = useState([]);

  useEffect(() => {
    async function fetchAgents() {
      try {
        const data = await apiFetch("/api/agents");
        setAgents(data);
      } catch (err) {
        console.error("Failed to fetch agents:", err);
      }
    }

    fetchAgents();
  }, []);

  function handleChange(e) {
    const selected = agents.find((a) => a.id === e.target.value);
    if (selected) {
      dispatch({ type: "SET_AGENT", payload: selected });
    }
  }

  function openAdmin() {
    dispatch({ type: "SET_VIEW", payload: "admin" });
  }

  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
      {agents.length > 1 && (
        <select
          value={state.agent.id}
          onChange={handleChange}
          className="bg-gray-800/80 backdrop-blur text-white border border-gray-700 rounded-lg px-3 py-2 outline-none cursor-pointer text-sm"
        >
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      )}

      <button
        onClick={openAdmin}
        className="bg-gray-800/80 backdrop-blur text-white border border-gray-700 rounded-lg p-2 outline-none cursor-pointer hover:bg-gray-700/80 transition-colors"
        title="Admin Dashboard"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </div>
  );
}
