import { useState, useEffect } from "react";
import { apiFetch } from "../../lib/api";

export default function FileManager({ agentId }) {
  const [files, setFiles] = useState([]);
  const [editingFile, setEditingFile] = useState(null);
  const [editContent, setEditContent] = useState("");
  const [newFileName, setNewFileName] = useState("");
  const [showNewFile, setShowNewFile] = useState(false);

  useEffect(() => {
    loadFiles();
  }, [agentId]);

  async function loadFiles() {
    try {
      const data = await apiFetch(`/api/agents/${agentId}/files`);
      setFiles(data);
    } catch (err) {
      console.error("Failed to load files:", err);
    }
  }

  async function openFile(filename) {
    try {
      const data = await apiFetch(`/api/agents/${agentId}/files/${filename}`);
      setEditingFile(filename);
      setEditContent(data.content);
    } catch (err) {
      console.error("Failed to read file:", err);
    }
  }

  async function saveFile() {
    if (!editingFile) return;
    try {
      await apiFetch(`/api/agents/${agentId}/files/${editingFile}`, {
        method: "PUT",
        body: { content: editContent },
      });
      setEditingFile(null);
      loadFiles();
    } catch (err) {
      console.error("Failed to save file:", err);
    }
  }

  async function deleteFile(filename) {
    if (!confirm(`Delete ${filename}?`)) return;
    try {
      await apiFetch(`/api/agents/${agentId}/files/${filename}`, {
        method: "DELETE",
      });
      loadFiles();
    } catch (err) {
      alert(err.message);
    }
  }

  async function createFile() {
    const name = newFileName.trim();
    if (!name) return;
    try {
      await apiFetch(`/api/agents/${agentId}/files/${name}`, {
        method: "PUT",
        body: { content: "" },
      });
      setNewFileName("");
      setShowNewFile(false);
      loadFiles();
    } catch (err) {
      console.error("Failed to create file:", err);
    }
  }

  const nonCoreFiles = files.filter((f) => !f.isCore);

  return (
    <div>
      {nonCoreFiles.length === 0 && !showNewFile && (
        <p className="text-sm mb-2" style={{ color: "var(--color-text-muted)" }}>
          No extra files yet.
        </p>
      )}

      {nonCoreFiles.map((f) => (
        <div
          key={f.name}
          className="flex items-center justify-between py-2 px-2 rounded-xl mb-1"
        >
          <span className="text-sm" style={{ color: "var(--color-text-primary)" }}>
            {f.name}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => openFile(f.name)}
              className="text-xs px-3 py-1 rounded-full font-medium transition-colors"
              style={{
                backgroundColor: "var(--color-bg-raised)",
                color: "var(--color-text-secondary)",
              }}
            >
              Edit
            </button>
            <button
              onClick={() => deleteFile(f.name)}
              className="text-xs px-3 py-1 rounded-full font-medium transition-colors"
              style={{ color: "#EF4444" }}
            >
              Delete
            </button>
          </div>
        </div>
      ))}

      {/* Inline file editor */}
      {editingFile && (
        <div
          className="mt-2 rounded-xl p-3"
          style={{
            border: "1px solid var(--color-border)",
            backgroundColor: "var(--color-bg-surface)",
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-sm font-medium"
              style={{ color: "var(--color-text-primary)" }}
            >
              {editingFile}
            </span>
            <div className="flex gap-2">
              <button
                onClick={saveFile}
                className="text-xs px-3 py-1.5 rounded-full text-white font-medium"
                style={{ backgroundColor: "var(--color-accent)" }}
              >
                Save
              </button>
              <button
                onClick={() => setEditingFile(null)}
                className="text-xs px-3 py-1.5 rounded-full font-medium"
                style={{
                  backgroundColor: "var(--color-bg-raised)",
                  color: "var(--color-text-secondary)",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full h-40 rounded-xl p-2 text-sm font-mono resize-y outline-none"
            style={{
              backgroundColor: "var(--color-bg-raised)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-primary)",
            }}
          />
        </div>
      )}

      {/* New file */}
      {showNewFile ? (
        <div className="flex gap-2 mt-2">
          <input
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            placeholder="filename.md"
            className="flex-1 rounded-xl px-3 py-1.5 text-sm outline-none"
            style={{
              backgroundColor: "var(--color-bg-raised)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-primary)",
            }}
            onKeyDown={(e) => e.key === "Enter" && createFile()}
            autoFocus
          />
          <button
            onClick={createFile}
            className="text-xs px-3 py-1.5 rounded-full text-white font-medium"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            Create
          </button>
          <button
            onClick={() => { setShowNewFile(false); setNewFileName(""); }}
            className="text-xs px-3 py-1.5 rounded-full font-medium"
            style={{
              backgroundColor: "var(--color-bg-raised)",
              color: "var(--color-text-secondary)",
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowNewFile(true)}
          className="mt-2 text-xs px-3 py-1.5 rounded-full font-medium transition-colors"
          style={{
            backgroundColor: "var(--color-bg-raised)",
            color: "var(--color-text-secondary)",
            border: "1px solid var(--color-border)",
          }}
        >
          + Add File
        </button>
      )}
    </div>
  );
}
