import { useState, useEffect, useRef } from "react";
import { useAlert } from "../AlertModal";
import { apiFetch } from "../../lib/api";

const BUILT_IN_TOOLS = [
  { name: "search_youtube", label: "YouTube Search" },
  { name: "remember_fact", label: "Remember Facts" },
];

function ToggleSwitch({ checked, onChange }) {
  return (
    <button
      onClick={onChange}
      className="relative w-11 h-6 rounded-full flex-shrink-0 transition-colors"
      style={{
        backgroundColor: checked ? "var(--color-accent)" : "var(--color-bg-raised)",
        border: checked ? "none" : "1px solid var(--color-border)",
      }}
    >
      <span
        className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
        style={{
          backgroundColor: checked ? "#FFFFFF" : "var(--color-text-muted)",
          left: checked ? "calc(100% - 22px)" : "2px",
        }}
      />
    </button>
  );
}

export default function ToolSelector({ enabledTools, onChange }) {
  const { showAlert } = useAlert();
  const [skills, setSkills] = useState([]);
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [editing, setEditing] = useState(null); // { folderName, content }
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadSkills();
  }, []);

  async function loadSkills() {
    try {
      const data = await apiFetch("/api/skills");
      setSkills(data);
    } catch (err) {
      console.error("Failed to load skills:", err);
    }
  }

  // Build unified list: built-in tools first, then custom skills
  const allItems = [
    ...BUILT_IN_TOOLS.map((t) => ({
      ...t,
      type: "built-in",
    })),
    ...skills.map((s) => ({ name: s.folderName, label: s.name, description: s.description, type: "custom" })),
  ];

  // When enabledTools is null: built-in tools ON, custom skills OFF
  const isNullMode = enabledTools === null;
  const selected = isNullMode
    ? BUILT_IN_TOOLS.map((t) => t.name)
    : enabledTools || [];

  function isChecked(itemName, itemType) {
    if (isNullMode && itemType === "built-in") return true;
    if (isNullMode && itemType === "custom") return false;
    return selected.includes(itemName);
  }

  function toggle(itemName, itemType) {
    let next;

    if (isNullMode) {
      // Transitioning from null to explicit array
      if (itemType === "built-in") {
        // Turning OFF a built-in
        next = BUILT_IN_TOOLS.map((t) => t.name).filter((n) => n !== itemName);
      } else {
        // Turning ON a custom skill
        next = [...BUILT_IN_TOOLS.map((t) => t.name), itemName];
      }
    } else if (selected.includes(itemName)) {
      next = selected.filter((n) => n !== itemName);
    } else {
      next = [...selected, itemName];
    }

    // If only built-in tools are ON, return to null
    const builtInNames = BUILT_IN_TOOLS.map((t) => t.name);
    const allBuiltInOn = builtInNames.every((n) => next.includes(n));
    const onlyBuiltIn = next.length === builtInNames.length && allBuiltInOn;

    onChange(onlyBuiltIn ? null : next);
  }

  async function handleDeleteSkill(folderName) {
    try {
      await apiFetch(`/api/skills/${folderName}`, { method: "DELETE" });

      // Remove from local skills list
      setSkills((prev) => prev.filter((s) => s.folderName !== folderName));

      // Remove from enabled_tools if present
      if (enabledTools && enabledTools.includes(folderName)) {
        const next = enabledTools.filter((n) => n !== folderName);
        const builtInNames = BUILT_IN_TOOLS.map((t) => t.name);
        const allBuiltInOn = builtInNames.every((n) => next.includes(n));
        const onlyBuiltIn = next.length === builtInNames.length && allBuiltInOn;
        onChange(onlyBuiltIn ? null : next);
      }
    } catch (err) {
      showAlert("Failed to delete skill: " + err.message);
    }
  }

  // ─── Edit handling ───────────────────────────────────────────────────────────

  async function handleEditSkill(folderName) {
    setEditError("");
    try {
      const data = await apiFetch(`/api/skills/${folderName}`);
      setEditing({ folderName, content: data.content });
    } catch (err) {
      showAlert("Failed to load skill: " + err.message);
    }
  }

  async function handleSaveEdit() {
    if (!editing) return;
    setEditSaving(true);
    setEditError("");

    try {
      await apiFetch(`/api/skills/${editing.folderName}`, {
        method: "PUT",
        body: { content: editing.content },
      });
      await loadSkills();
      setEditing(null);
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditSaving(false);
    }
  }

  // ─── Upload handling ─────────────────────────────────────────────────────────

  async function uploadSkill(folderName, skillMdContent) {
    setUploading(true);
    setUploadError("");

    try {
      await apiFetch("/api/skills", {
        method: "POST",
        body: { folderName, content: skillMdContent },
      });

      // Reload skills list
      await loadSkills();

      // Auto-enable the new skill for this agent
      let next;
      if (isNullMode) {
        next = [...BUILT_IN_TOOLS.map((t) => t.name), folderName];
      } else {
        next = [...(enabledTools || []), folderName];
      }
      onChange(next);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    setUploadError("");

    const items = e.dataTransfer?.items;
    if (!items || items.length === 0) return;

    // Try File System Access API (Chrome/Edge)
    const firstItem = items[0];
    if (firstItem.getAsFileSystemHandle) {
      try {
        const handle = await firstItem.getAsFileSystemHandle();
        if (handle.kind !== "directory") {
          setUploadError("Please drop a folder, not a file.");
          return;
        }
        await readFromDirectoryHandle(handle);
        return;
      } catch (err) {
        // Fallback below
        console.warn("File System Access API failed, trying fallback:", err);
      }
    }

    // Fallback: check webkitGetAsEntry
    const entry = firstItem.webkitGetAsEntry?.();
    if (entry && entry.isDirectory) {
      await readFromWebkitEntry(entry);
      return;
    }

    setUploadError("Please drop a folder, not a file. Your browser may not support folder drag-and-drop — try the Browse button instead.");
  }

  async function readFromDirectoryHandle(dirHandle) {
    const folderName = dirHandle.name;
    let skillMdContent = null;

    for await (const [name, handle] of dirHandle.entries()) {
      if (name === "SKILL.md" && handle.kind === "file") {
        const file = await handle.getFile();
        skillMdContent = await file.text();
        break;
      }
    }

    if (!skillMdContent) {
      setUploadError(
        "This folder doesn't contain a SKILL.md file. Each skill needs a SKILL.md with a name and description in the frontmatter."
      );
      return;
    }

    await uploadSkill(folderName, skillMdContent);
  }

  async function readFromWebkitEntry(dirEntry) {
    const folderName = dirEntry.name;

    const readEntries = () =>
      new Promise((resolve, reject) => {
        dirEntry.createReader().readEntries(resolve, reject);
      });

    const readFile = (fileEntry) =>
      new Promise((resolve, reject) => {
        fileEntry.file((file) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsText(file);
        }, reject);
      });

    const entries = await readEntries();
    const skillMdEntry = entries.find(
      (e) => e.isFile && e.name === "SKILL.md"
    );

    if (!skillMdEntry) {
      setUploadError(
        "This folder doesn't contain a SKILL.md file. Each skill needs a SKILL.md with a name and description in the frontmatter."
      );
      return;
    }

    const content = await readFile(skillMdEntry);
    await uploadSkill(folderName, content);
  }

  async function handleBrowse() {
    setUploadError("");

    // Try showDirectoryPicker first (modern browsers)
    if (window.showDirectoryPicker) {
      try {
        const dirHandle = await window.showDirectoryPicker();
        await readFromDirectoryHandle(dirHandle);
        return;
      } catch (err) {
        if (err.name === "AbortError") return; // user cancelled
        console.warn("showDirectoryPicker failed:", err);
      }
    }

    // Fallback: trigger hidden file input with webkitdirectory
    fileInputRef.current?.click();
  }

  function handleFileInputChange(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // webkitdirectory gives us all files with webkitRelativePath
    const skillMdFile = files.find((f) => {
      const parts = f.webkitRelativePath.split("/");
      return parts.length === 2 && parts[1] === "SKILL.md";
    });

    if (!skillMdFile) {
      setUploadError(
        "This folder doesn't contain a SKILL.md file. Each skill needs a SKILL.md with a name and description in the frontmatter."
      );
      return;
    }

    const folderName = skillMdFile.webkitRelativePath.split("/")[0];
    const reader = new FileReader();
    reader.onload = () => uploadSkill(folderName, reader.result);
    reader.readAsText(skillMdFile);

    // Reset input so the same folder can be selected again
    e.target.value = "";
  }

  return (
    <div>
      {/* Unified toggle list */}
      <div className="flex flex-col gap-1">
        {allItems.map((item) => (
          <div
            key={item.name}
            className="flex items-center justify-between py-2 px-1"
          >
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className="text-sm"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {item.label}
                </span>
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor:
                      item.type === "custom"
                        ? "var(--color-accent)"
                        : "var(--color-bg-raised)",
                    color:
                      item.type === "built-in"
                        ? "var(--color-text-muted)"
                        : "#FFFFFF",
                    border:
                      item.type === "built-in"
                        ? "1px solid var(--color-border)"
                        : "none",
                  }}
                >
                  {item.type === "custom" ? "Custom" : "Built-in"}
                </span>
              </div>
              {item.description && (
                <span
                  className="text-xs mt-0.5"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {item.description}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {item.type === "custom" && (
                <>
                  <button
                    onClick={() => handleEditSkill(item.name)}
                    className="text-xs px-2 py-1 rounded-lg transition-colors"
                    style={{ color: "var(--color-accent)" }}
                    title="Edit skill SKILL.md"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteSkill(item.name)}
                    className="text-xs px-2 py-1 rounded-lg transition-colors"
                    style={{ color: "#EF4444" }}
                    title="Delete skill from server"
                  >
                    Delete
                  </button>
                </>
              )}
              <ToggleSwitch
                checked={isChecked(item.name, item.type)}
                onChange={() => toggle(item.name, item.type)}
              />
            </div>
          </div>
        ))}

        {allItems.length === 0 && (
          <div
            className="text-sm py-2 px-1"
            style={{ color: "var(--color-text-muted)" }}
          >
            No tools available.
          </div>
        )}
      </div>

      {/* Skill editor */}
      {editing && (
        <div
          className="mt-3 rounded-xl p-4 flex flex-col gap-3"
          style={{
            backgroundColor: "var(--color-bg-raised)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div className="flex items-center justify-between">
            <span
              className="text-sm font-medium"
              style={{ color: "var(--color-text-primary)" }}
            >
              Editing: {editing.folderName}/SKILL.md
            </span>
            <button
              onClick={() => { setEditing(null); setEditError(""); }}
              className="text-xs px-2 py-1 rounded-lg"
              style={{ color: "var(--color-text-muted)" }}
            >
              Cancel
            </button>
          </div>
          <textarea
            value={editing.content}
            onChange={(e) => setEditing({ ...editing, content: e.target.value })}
            className="w-full rounded-lg p-3 text-sm"
            style={{
              backgroundColor: "var(--color-bg-primary)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border)",
              fontFamily: "monospace",
              minHeight: "200px",
              resize: "vertical",
            }}
          />
          {editError && (
            <div
              className="text-sm p-3 rounded-xl"
              style={{
                backgroundColor: "#FEF2F2",
                color: "#DC2626",
                border: "1px solid #FECACA",
              }}
            >
              {editError}
            </div>
          )}
          <button
            onClick={handleSaveEdit}
            disabled={editSaving}
            className="self-end text-sm px-4 py-1.5 rounded-lg transition-colors"
            style={{
              backgroundColor: "var(--color-accent)",
              color: "#FFFFFF",
              opacity: editSaving ? 0.6 : 1,
            }}
          >
            {editSaving ? "Saving..." : "Save"}
          </button>
        </div>
      )}

      {/* Upload drop zone */}
      <div
        className="mt-4 rounded-xl p-6 flex flex-col items-center justify-center gap-2 transition-colors"
        style={{
          border: dragOver
            ? "2px dashed var(--color-accent)"
            : "2px dashed var(--color-border)",
          backgroundColor: dragOver
            ? "var(--color-bg-raised)"
            : "transparent",
          minHeight: "100px",
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <span
          className="text-sm"
          style={{ color: "var(--color-text-muted)" }}
        >
          {uploading
            ? "Uploading..."
            : "Drop a skill folder here"}
        </span>
        {!uploading && (
          <button
            onClick={handleBrowse}
            className="text-sm px-3 py-1 rounded-lg transition-colors"
            style={{
              color: "var(--color-accent)",
              border: "1px solid var(--color-accent)",
            }}
          >
            Browse
          </button>
        )}
      </div>

      {/* Validation error message */}
      {uploadError && (
        <div
          className="mt-2 text-sm p-3 rounded-xl"
          style={{
            backgroundColor: "#FEF2F2",
            color: "#DC2626",
            border: "1px solid #FECACA",
          }}
        >
          {uploadError}
        </div>
      )}

      {/* Hidden file input fallback for webkitdirectory */}
      <input
        ref={fileInputRef}
        type="file"
        webkitdirectory=""
        style={{ display: "none" }}
        onChange={handleFileInputChange}
      />
    </div>
  );
}
