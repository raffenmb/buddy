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

  // Filter out core files — those are edited in the main editor
  const nonCoreFiles = files.filter((f) => !f.isCore);

  return (
    <div>
      {nonCoreFiles.length === 0 && !showNewFile && (
        <p className="text-gray-500 text-sm mb-2">No extra files yet.</p>
      )}

      {nonCoreFiles.map((f) => (
        <div
          key={f.name}
          className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-800 group"
        >
          <span className="text-sm text-gray-300">{f.name}</span>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => openFile(f.name)}
              className="text-xs px-2 py-0.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
            >
              Edit
            </button>
            <button
              onClick={() => deleteFile(f.name)}
              className="text-xs px-2 py-0.5 bg-red-900/50 hover:bg-red-800/50 rounded text-red-300"
            >
              Delete
            </button>
          </div>
        </div>
      ))}

      {/* Inline file editor */}
      {editingFile && (
        <div className="mt-2 border border-gray-700 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-300">{editingFile}</span>
            <div className="flex gap-2">
              <button
                onClick={saveFile}
                className="text-xs px-3 py-1 bg-indigo-600 hover:bg-indigo-500 rounded text-white"
              >
                Save
              </button>
              <button
                onClick={() => setEditingFile(null)}
                className="text-xs px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full h-40 bg-gray-900 border border-gray-700 rounded p-2 text-sm text-gray-200 font-mono resize-y outline-none focus:border-indigo-500"
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
            className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 outline-none focus:border-indigo-500"
            onKeyDown={(e) => e.key === "Enter" && createFile()}
            autoFocus
          />
          <button
            onClick={createFile}
            className="text-xs px-3 py-1 bg-indigo-600 hover:bg-indigo-500 rounded text-white"
          >
            Create
          </button>
          <button
            onClick={() => { setShowNewFile(false); setNewFileName(""); }}
            className="text-xs px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowNewFile(true)}
          className="mt-2 text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors"
        >
          + Add File
        </button>
      )}
    </div>
  );
}
