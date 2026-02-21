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
  const [voiceProvider, setVoiceProvider] = useState("native");
  const [voiceId, setVoiceId] = useState("");
  const [voiceModelId, setVoiceModelId] = useState("eleven_flash_v2_5");
  const [voices, setVoices] = useState([]);
  const [ttsAvailable, setTtsAvailable] = useState(false);
  const [playingPreview, setPlayingPreview] = useState(null);

  useEffect(() => {
    if (!agentId) return;
    loadAgent();
  }, [agentId]);

  useEffect(() => {
    apiFetch("/api/tts/voices")
      .then((v) => {
        setVoices(v);
        setTtsAvailable(v.length > 0);
      })
      .catch(() => {
        setVoices([]);
        setTtsAvailable(false);
      });
  }, []);

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
      // Parse voice config
      if (agentData.voice_config) {
        try {
          const vc = typeof agentData.voice_config === "string"
            ? JSON.parse(agentData.voice_config)
            : agentData.voice_config;
          if (vc.voiceId) {
            setVoiceProvider("elevenlabs");
            setVoiceId(vc.voiceId);
            setVoiceModelId(vc.modelId || "eleven_flash_v2_5");
          }
        } catch {}
      }
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
          body: {
            name, model, avatar, enabled_tools: enabledTools,
            voice_config: voiceProvider === "elevenlabs" && voiceId
              ? { provider: "elevenlabs", voiceId, modelId: voiceModelId }
              : {},
          },
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

      {/* Voice */}
      <div>
        <label
          className="block text-sm font-medium mb-2"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Voice
        </label>
        {/* TTS Provider toggle */}
        <div className="flex flex-wrap gap-2 mb-3">
          <button
            onClick={() => setVoiceProvider("native")}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{
              backgroundColor: voiceProvider === "native"
                ? "var(--color-accent)"
                : "var(--color-bg-raised)",
              color: voiceProvider === "native"
                ? "#FFFFFF"
                : "var(--color-text-secondary)",
              border: voiceProvider === "native"
                ? "1px solid var(--color-accent)"
                : "1px solid var(--color-border)",
            }}
          >
            Device Voice
          </button>
          <button
            onClick={() => {
              if (ttsAvailable) setVoiceProvider("elevenlabs");
            }}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{
              backgroundColor: voiceProvider === "elevenlabs"
                ? "var(--color-accent)"
                : "var(--color-bg-raised)",
              color: voiceProvider === "elevenlabs"
                ? "#FFFFFF"
                : ttsAvailable
                  ? "var(--color-text-secondary)"
                  : "var(--color-text-muted)",
              border: voiceProvider === "elevenlabs"
                ? "1px solid var(--color-accent)"
                : "1px solid var(--color-border)",
              opacity: ttsAvailable ? 1 : 0.5,
              cursor: ttsAvailable ? "pointer" : "not-allowed",
            }}
          >
            ElevenLabs
          </button>
        </div>

        {/* ElevenLabs not configured message */}
        {voiceProvider === "native" && !ttsAvailable && (
          <p
            className="text-xs mb-2"
            style={{ color: "var(--color-text-muted)" }}
          >
            ElevenLabs not configured — set ELEVENLABS_API_KEY in server .env
          </p>
        )}

        {/* Voice list (ElevenLabs only) */}
        {voiceProvider === "elevenlabs" && ttsAvailable && (
          <>
            <div
              className="rounded-xl mb-3"
              style={{
                maxHeight: "240px",
                overflowY: "auto",
                border: "1px solid var(--color-border)",
                backgroundColor: "var(--color-bg-raised)",
              }}
            >
              {voices.map((v) => (
                <div
                  key={v.voiceId}
                  className="flex items-center gap-2 px-3 py-2"
                  style={{
                    borderBottom: "1px solid var(--color-border)",
                    backgroundColor: voiceId === v.voiceId
                      ? "var(--color-accent)"
                      : "transparent",
                    cursor: "pointer",
                  }}
                  onClick={() => setVoiceId(v.voiceId)}
                >
                  <span
                    className="flex-1 text-sm"
                    style={{
                      color: voiceId === v.voiceId
                        ? "#FFFFFF"
                        : "var(--color-text-primary)",
                    }}
                  >
                    {v.name}
                  </span>
                  {v.category && (
                    <span
                      className="text-xs px-2 py-0.5 rounded-xl"
                      style={{
                        backgroundColor: voiceId === v.voiceId
                          ? "rgba(255,255,255,0.2)"
                          : "var(--color-bg)",
                        color: voiceId === v.voiceId
                          ? "#FFFFFF"
                          : "var(--color-text-muted)",
                      }}
                    >
                      {v.category}
                    </span>
                  )}
                  {v.previewUrl && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (playingPreview === v.voiceId) {
                          setPlayingPreview(null);
                          return;
                        }
                        setPlayingPreview(v.voiceId);
                        const audio = new Audio(v.previewUrl);
                        audio.onended = () => setPlayingPreview(null);
                        audio.onerror = () => setPlayingPreview(null);
                        audio.play().catch(() => setPlayingPreview(null));
                      }}
                      className="px-2 py-1 rounded-xl text-xs font-medium"
                      style={{
                        backgroundColor: playingPreview === v.voiceId
                          ? "rgba(255,255,255,0.3)"
                          : voiceId === v.voiceId
                            ? "rgba(255,255,255,0.2)"
                            : "var(--color-bg)",
                        color: voiceId === v.voiceId
                          ? "#FFFFFF"
                          : "var(--color-text-secondary)",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      {playingPreview === v.voiceId ? "Stop" : "Play"}
                    </button>
                  )}
                </div>
              ))}
              {voices.length === 0 && (
                <div
                  className="px-3 py-4 text-sm text-center"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  No voices available
                </div>
              )}
            </div>

            {/* Voice Model toggle */}
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: "var(--color-text-muted)" }}
            >
              Voice Model
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setVoiceModelId("eleven_flash_v2_5")}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                style={{
                  backgroundColor: voiceModelId === "eleven_flash_v2_5"
                    ? "var(--color-accent)"
                    : "var(--color-bg-raised)",
                  color: voiceModelId === "eleven_flash_v2_5"
                    ? "#FFFFFF"
                    : "var(--color-text-secondary)",
                  border: voiceModelId === "eleven_flash_v2_5"
                    ? "1px solid var(--color-accent)"
                    : "1px solid var(--color-border)",
                }}
              >
                Flash v2.5
              </button>
              <button
                onClick={() => setVoiceModelId("eleven_multilingual_v2")}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                style={{
                  backgroundColor: voiceModelId === "eleven_multilingual_v2"
                    ? "var(--color-accent)"
                    : "var(--color-bg-raised)",
                  color: voiceModelId === "eleven_multilingual_v2"
                    ? "#FFFFFF"
                    : "var(--color-text-secondary)",
                  border: voiceModelId === "eleven_multilingual_v2"
                    ? "1px solid var(--color-accent)"
                    : "1px solid var(--color-border)",
                }}
              >
                Multilingual v2
              </button>
            </div>
          </>
        )}
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
