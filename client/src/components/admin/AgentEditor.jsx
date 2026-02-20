import { useState, useEffect } from "react";
import { useBuddy } from "../../context/BuddyState";
import { useAlert } from "../AlertModal";
import { apiFetch } from "../../lib/api";
import { AVATAR_PRESETS } from "../../assets/avatars/index.js";
import ToolSelector from "./ToolSelector";

const MODEL_OPTIONS = [
  { value: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
  { value: "claude-sonnet-4-5-20250929", label: "Sonnet 4.5" },
  { value: "claude-opus-4-6", label: "Opus 4.6" },
];

export default function AgentEditor({ agentId, onDeleted }) {
  const { state, dispatch } = useBuddy();
  const { showAlert, showConfirm } = useAlert();
  const [agent, setAgent] = useState(null);
  const [identity, setIdentity] = useState("");
  const [userInfo, setUserInfo] = useState("");
  const [enabledTools, setEnabledTools] = useState(null);
  const [name, setName] = useState("");
  const [model, setModel] = useState("");
  const [avatar, setAvatar] = useState("buddy");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!agentId) return;
    loadAgent();
  }, [agentId]);

  async function loadAgent() {
    try {
      const [agentData, identityData, userInfoData] = await Promise.all([
        apiFetch(`/api/agents/${agentId}`),
        apiFetch(`/api/agents/${agentId}/files/identity.md`).catch(() => ({ content: "" })),
        apiFetch(`/api/agents/${agentId}/files/user.md`).catch(() => ({ content: "" })),
      ]);
      setAgent(agentData);
      setName(agentData.name);
      setModel(agentData.model);
      setAvatar(agentData.avatar || "buddy");
      setIdentity(identityData.content || "");
      setUserInfo(userInfoData.content || "");

      if (agentData.enabled_tools) {
        try {
          const parsed = typeof agentData.enabled_tools === "string"
            ? JSON.parse(agentData.enabled_tools)
            : agentData.enabled_tools;
          setEnabledTools(parsed);
        } catch {
          setEnabledTools(null);
        }
      } else {
        setEnabledTools(null);
      }
    } catch (err) {
      console.error("Failed to load agent:", err);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await Promise.all([
        apiFetch(`/api/agents/${agentId}`, {
          method: "PUT",
          body: { name, model, avatar, enabled_tools: enabledTools },
        }),
        apiFetch(`/api/agents/${agentId}/files/identity.md`, {
          method: "PUT",
          body: { content: identity },
        }),
        apiFetch(`/api/agents/${agentId}/files/user.md`, {
          method: "PUT",
          body: { content: userInfo },
        }),
      ]);
      // Update chat screen if editing the active agent
      if (agentId === state.agent.id) {
        dispatch({ type: "SET_AGENT", payload: { name, avatar } });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      showAlert("Save failed: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const isShared = agent.is_shared === 1;
    const isLastUser = isShared && agent.userCount === 1;

    const message = isShared && !isLastUser
      ? `Remove "${name}" from your agents? Other users still have access.`
      : isShared && isLastUser
        ? `You're the last user. Delete "${name}" permanently? This cannot be undone.`
        : `Delete agent "${name}"? This cannot be undone.`;

    const confirmed = await showConfirm(message);
    if (!confirmed) return;
    try {
      await apiFetch(`/api/agents/${agentId}`, { method: "DELETE" });
      onDeleted();
    } catch (err) {
      showAlert(err.message);
    }
  }

  if (!agent) {
    return (
      <div
        className="flex-1 flex items-center justify-center p-8"
        style={{ color: "var(--color-text-muted)" }}
      >
        Loading...
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {agent.is_shared === 1 && (
        <div
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm"
          style={{
            backgroundColor: "var(--color-bg-raised)",
            color: "var(--color-text-muted)",
            border: "1px solid var(--color-border)",
          }}
        >
          Shared with {agent.userCount || 1} {agent.userCount === 1 ? "user" : "users"} — changes affect everyone
        </div>
      )}

      {/* Name */}
      <div>
        <label
          className="block text-sm font-medium mb-1"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl px-3 py-2 outline-none text-sm"
          style={{
            backgroundColor: "var(--color-bg-raised)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-primary)",
          }}
        />
      </div>

      {/* Avatar */}
      <div>
        <label
          className="block text-sm font-medium mb-2"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Avatar
        </label>
        <div className="flex gap-4 flex-wrap">
          {Object.entries(AVATAR_PRESETS).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => setAvatar(key)}
              className="flex flex-col items-center gap-1 p-2 rounded-xl transition-colors"
              style={{
                border: avatar === key
                  ? "2px solid var(--color-accent)"
                  : "2px solid var(--color-border)",
                backgroundColor: avatar === key
                  ? "var(--color-bg-raised)"
                  : "transparent",
              }}
            >
              <img src={preset.idle} alt={preset.label} width="60" height="60" />
              <span
                className="text-xs"
                style={{ color: "var(--color-text-muted)" }}
              >
                {preset.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Model — button picker instead of <select> */}
      <div>
        <label
          className="block text-sm font-medium mb-2"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Model
        </label>
        <div className="flex flex-wrap gap-2">
          {MODEL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setModel(opt.value)}
              className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
              style={{
                backgroundColor: model === opt.value
                  ? "var(--color-accent)"
                  : "var(--color-bg-raised)",
                color: model === opt.value
                  ? "#FFFFFF"
                  : "var(--color-text-secondary)",
                border: model === opt.value
                  ? "1px solid var(--color-accent)"
                  : "1px solid var(--color-border)",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Personality */}
      <div>
        <label
          className="block text-sm font-medium mb-1"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Personality
        </label>
        <textarea
          value={identity}
          onChange={(e) => setIdentity(e.target.value)}
          rows={6}
          placeholder="Describe this agent's personality and tone..."
          className="w-full rounded-xl px-3 py-2 text-sm font-mono outline-none resize-y"
          style={{
            backgroundColor: "var(--color-bg-raised)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-primary)",
          }}
        />
      </div>

      {/* User Info */}
      <div>
        <label
          className="block text-sm font-medium mb-1"
          style={{ color: "var(--color-text-secondary)" }}
        >
          User Info
        </label>
        <textarea
          value={userInfo}
          onChange={(e) => setUserInfo(e.target.value)}
          rows={4}
          placeholder="Information about the user this agent should know..."
          className="w-full rounded-xl px-3 py-2 text-sm font-mono outline-none resize-y"
          style={{
            backgroundColor: "var(--color-bg-raised)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-primary)",
          }}
        />
      </div>

      {/* Tools */}
      <div>
        <label
          className="block text-sm font-medium mb-2"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Enabled Tools
        </label>
        <ToolSelector enabledTools={enabledTools} onChange={setEnabledTools} />
      </div>

      {/* Actions */}
      <div
        className="pt-4"
        style={{ borderTop: "1px solid var(--color-border)" }}
      >
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full px-5 py-3 rounded-xl text-white font-semibold transition-colors disabled:opacity-50"
          style={{ backgroundColor: "var(--color-accent)" }}
        >
          {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
        </button>

        {agentId !== "buddy" && (
          <button
            onClick={handleDelete}
            className="w-full mt-3 px-5 py-2 text-sm font-medium transition-colors"
            style={{ color: agent?.is_shared === 1 && agent?.userCount > 1 ? "var(--color-text-secondary)" : "#EF4444" }}
          >
            {agent?.is_shared === 1 && agent?.userCount > 1 ? "Leave Agent" : "Delete Agent"}
          </button>
        )}
      </div>
    </div>
  );
}
