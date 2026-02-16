import { useEffect, useState } from "react";
import { useBuddy } from "../context/BuddyState";

const AUTH_TOKEN = import.meta.env.VITE_AUTH_TOKEN || "";

export default function AgentSwitcher() {
  const { state, dispatch } = useBuddy();
  const [agents, setAgents] = useState([]);

  useEffect(() => {
    async function fetchAgents() {
      try {
        const headers = {};
        if (AUTH_TOKEN) headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;

        const res = await fetch("/api/agents", { headers });
        if (res.ok) {
          const data = await res.json();
          setAgents(data);
        }
      } catch (err) {
        console.error("Failed to fetch agents:", err);
      }
    }

    fetchAgents();
  }, []);

  // Don't render if only 1 agent
  if (agents.length <= 1) return null;

  function handleChange(e) {
    const selected = agents.find((a) => a.id === e.target.value);
    if (selected) {
      dispatch({ type: "SET_AGENT", payload: selected });
    }
  }

  return (
    <div className="fixed top-4 right-4 z-50">
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
    </div>
  );
}
