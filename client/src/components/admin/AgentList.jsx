import { useState, useEffect } from "react";
import { apiFetch } from "../../lib/api";
import { AVATAR_PRESETS } from "../../assets/avatars/index.js";

export default function AgentList({ selectedId, onSelect, refreshKey }) {
  const [agents, setAgents] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");

  useEffect(() => {
    loadAgents();
  }, [refreshKey]);

  async function loadAgents() {
    try {
      const data = await apiFetch("/api/agents");
      setAgents(data);
    } catch (err) {
      console.error("Failed to load agents:", err);
    }
  }

  async function handleCreate() {
    const id = newId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    const name = newName.trim();
    if (!id || !name) return;

    try {
      await apiFetch("/api/agents", {
        method: "POST",
        body: { id, name },
      });
      setNewId("");
      setNewName("");
      setShowCreate(false);
      await loadAgents();
      onSelect(id);
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="w-64 border-r border-gray-800 flex flex-col">
      <div className="p-3 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Agents</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {agents.map((a) => {
          const preset = AVATAR_PRESETS[a.avatar] || AVATAR_PRESETS.buddy;
          return (
            <button
              key={a.id}
              onClick={() => onSelect(a.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                selectedId === a.id
                  ? "bg-indigo-600/20 border-r-2 border-indigo-500"
                  : "hover:bg-gray-800"
              }`}
            >
              <img src={preset.idle} alt="" width="32" height="32" className="flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-sm text-white truncate">{a.name}</div>
                <div className="text-xs text-gray-500 truncate">{a.id}</div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="p-3 border-t border-gray-800">
        {showCreate ? (
          <div className="space-y-2">
            <input
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              placeholder="agent-id"
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 outline-none focus:border-indigo-500"
              autoFocus
            />
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Display Name"
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 outline-none focus:border-indigo-500"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                className="flex-1 text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-white transition-colors"
              >
                Create
              </button>
              <button
                onClick={() => { setShowCreate(false); setNewId(""); setNewName(""); }}
                className="flex-1 text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowCreate(true)}
            className="w-full text-sm px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-gray-300 transition-colors"
          >
            + New Agent
          </button>
        )}
      </div>
    </div>
  );
}
