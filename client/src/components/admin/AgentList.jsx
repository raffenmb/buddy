import { useState, useEffect } from "react";
import { useBuddy } from "../../context/BuddyState";
import { useAlert } from "../AlertModal";
import { apiFetch } from "../../lib/api";
import { AVATAR_PRESETS } from "../../assets/avatars/index.js";

export default function AgentList() {
  const { dispatch } = useBuddy();
  const { showAlert } = useAlert();
  const [agents, setAgents] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [createShared, setCreateShared] = useState(false);

  useEffect(() => {
    loadAgents();
  }, []);

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
        body: { id, name, shared: createShared },
      });
      setNewId("");
      setNewName("");
      setShowCreate(false);
      setCreateShared(false);
      await loadAgents();
      dispatch({ type: "ADMIN_PUSH_EDITOR", payload: id });
    } catch (err) {
      showAlert(err.message);
    }
  }

  function openAgent(agentId) {
    dispatch({ type: "ADMIN_PUSH_EDITOR", payload: agentId });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Agent cards */}
      <div className="flex flex-col gap-3">
        {agents.map((a) => {
          const preset = AVATAR_PRESETS[a.avatar] || AVATAR_PRESETS.buddy;
          return (
            <button
              key={a.id}
              onClick={() => openAgent(a.id)}
              className="flex items-center gap-4 p-4 rounded-2xl text-left transition-colors w-full"
              style={{
                backgroundColor: "var(--color-bg-surface)",
                boxShadow: "var(--shadow-card)",
                border: "1px solid var(--color-border)",
              }}
            >
              <img
                src={preset.idle}
                alt=""
                width="48"
                height="48"
                className="flex-shrink-0 rounded-xl"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className="text-sm font-semibold truncate"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {a.name}
                  </span>
                  {a.is_shared === 1 && a.userCount >= 2 && (
                    <span
                      className="text-xs px-2 py-0.5 rounded-lg flex-shrink-0"
                      style={{
                        backgroundColor: "var(--color-bg-raised)",
                        color: "var(--color-text-muted)",
                        border: "1px solid var(--color-border)",
                      }}
                    >
                      Shared
                    </span>
                  )}
                </div>
              </div>
              {/* Chevron right */}
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--color-text-muted)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="flex-shrink-0"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          );
        })}
      </div>

      {/* Create agent section */}
      <div className="mt-4">
        {showCreate ? (
          <div
            className="rounded-2xl p-4 space-y-3"
            style={{
              backgroundColor: "var(--color-bg-surface)",
              boxShadow: "var(--shadow-card)",
              border: "1px solid var(--color-border)",
            }}
          >
            <div
              className="text-xs font-medium px-2 py-1 rounded-lg self-start"
              style={{
                backgroundColor: "var(--color-bg-raised)",
                color: "var(--color-text-muted)",
              }}
            >
              {createShared ? "Shared Agent" : "Personal Agent"}
            </div>
            <input
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              placeholder="agent-id"
              className="w-full rounded-xl px-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: "var(--color-bg-raised)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-primary)",
              }}
              autoFocus
            />
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Display Name"
              className="w-full rounded-xl px-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: "var(--color-bg-raised)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-primary)",
              }}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                className="flex-1 text-sm px-4 py-2 rounded-xl text-white font-medium transition-colors"
                style={{ backgroundColor: "var(--color-accent)" }}
              >
                Create
              </button>
              <button
                onClick={() => { setShowCreate(false); setNewId(""); setNewName(""); }}
                className="flex-1 text-sm px-4 py-2 rounded-xl font-medium transition-colors"
                style={{
                  backgroundColor: "var(--color-bg-raised)",
                  color: "var(--color-text-secondary)",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => { setCreateShared(false); setShowCreate(true); }}
              className="flex-1 text-sm px-4 py-3 rounded-2xl font-medium transition-colors"
              style={{
                backgroundColor: "var(--color-bg-surface)",
                boxShadow: "var(--shadow-card)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-secondary)",
              }}
            >
              + New Agent
            </button>
            <button
              onClick={() => { setCreateShared(true); setShowCreate(true); }}
              className="flex-1 text-sm px-4 py-3 rounded-2xl font-medium transition-colors"
              style={{
                backgroundColor: "var(--color-bg-surface)",
                boxShadow: "var(--shadow-card)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-secondary)",
              }}
            >
              + Shared Agent
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
