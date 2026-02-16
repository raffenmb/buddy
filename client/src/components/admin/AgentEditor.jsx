import { useState, useEffect } from "react";
import { apiFetch } from "../../lib/api";
import { AVATAR_PRESETS } from "../../assets/avatars/index.js";
import ToolSelector from "./ToolSelector";
import FileManager from "./FileManager";

const MODEL_OPTIONS = [
  { value: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
  { value: "claude-sonnet-4-5-20250929", label: "Sonnet 4.5" },
  { value: "claude-opus-4-6", label: "Opus 4.6" },
];

export default function AgentEditor({ agentId, onDeleted }) {
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

      // Parse enabled_tools
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
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert("Save failed: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete agent "${name}"? This cannot be undone.`)) return;
    try {
      await apiFetch(`/api/agents/${agentId}`, { method: "DELETE" });
      onDeleted();
    } catch (err) {
      alert(err.message);
    }
  }

  if (!agent) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        Select an agent to edit
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
          />
        </div>

        {/* Avatar */}
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">Avatar</label>
          <div className="flex gap-4">
            {Object.entries(AVATAR_PRESETS).map(([key, preset]) => (
              <button
                key={key}
                onClick={() => setAvatar(key)}
                className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-colors ${
                  avatar === key
                    ? "border-indigo-500 bg-indigo-500/10"
                    : "border-gray-700 hover:border-gray-500"
                }`}
              >
                <img src={preset.idle} alt={preset.label} width="60" height="60" />
                <span className="text-xs text-gray-400">{preset.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Model */}
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Model</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500 cursor-pointer"
          >
            {MODEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Identity */}
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Identity (identity.md)</label>
          <textarea
            value={identity}
            onChange={(e) => setIdentity(e.target.value)}
            rows={10}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 font-mono outline-none focus:border-indigo-500 resize-y"
          />
        </div>

        {/* User Info */}
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">User Info (user.md)</label>
          <textarea
            value={userInfo}
            onChange={(e) => setUserInfo(e.target.value)}
            rows={4}
            placeholder="Information about the user this agent should know..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 font-mono outline-none focus:border-indigo-500 resize-y"
          />
        </div>

        {/* Tools */}
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">Enabled Tools</label>
          <ToolSelector enabledTools={enabledTools} onChange={setEnabledTools} />
        </div>

        {/* Files */}
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">Extra Files</label>
          <FileManager agentId={agentId} />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-4 border-t border-gray-800">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-white font-medium transition-colors"
          >
            {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
          </button>

          {agentId !== "buddy" && (
            <button
              onClick={handleDelete}
              className="px-5 py-2 bg-red-900/50 hover:bg-red-800/50 rounded-lg text-red-300 font-medium transition-colors"
            >
              Delete Agent
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
