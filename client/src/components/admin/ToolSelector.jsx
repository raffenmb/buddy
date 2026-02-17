import { useState, useEffect, useRef } from "react";
import { useAlert } from "../AlertModal";
import { apiFetch } from "../../lib/api";

const BUILT_IN_TOOLS = [
  { name: "search_youtube", label: "YouTube Search" },
  { name: "remember_fact", label: "Remember Facts" },
  { name: "shell_exec", label: "Shell Execute", sandbox: true },
  { name: "read_file", label: "Read File", sandbox: true },
  { name: "write_file", label: "Write File", sandbox: true },
  { name: "list_directory", label: "List Directory", sandbox: true },
  { name: "send_file", label: "Send File", sandbox: true },
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
      type: t.sandbox ? "sandbox" : "built-in",
    })),
    ...skills.map((s) => ({ name: s.folderName, label: s.name, type: "custom" })),
  ];

  // When enabledTools is null: standard built-in tools ON, sandbox tools OFF, custom skills OFF
  const isNullMode = enabledTools === null;
  const standardTools = BUILT_IN_TOOLS.filter((t) => !t.sandbox);
  const selected = isNullMode
    ? standardTools.map((t) => t.name)
    : enabledTools || [];

  function isChecked(itemName, itemType) {
    if (isNullMode && itemType === "built-in") return true;
    if (isNullMode && (itemType === "sandbox" || itemType === "custom")) return false;
    return selected.includes(itemName);
  }

  function toggle(itemName, itemType) {
    let next;

    if (isNullMode) {
      // Transitioning from null to explicit array
      if (itemType === "built-in") {
        // Turning OFF a standard built-in
        next = standardTools.map((t) => t.name).filter((n) => n !== itemName);
      } else {
        // Turning ON a sandbox tool or custom skill
        next = [...standardTools.map((t) => t.name), itemName];
      }
    } else if (selected.includes(itemName)) {
      next = selected.filter((n) => n !== itemName);
    } else {
      next = [...selected, itemName];
    }

    // If only standard built-in tools are ON, return to null
    const stdNames = standardTools.map((t) => t.name);
    const allStdOn = stdNames.every((n) => next.includes(n));
    const onlyStd = next.length === stdNames.length && allStdOn;

    onChange(onlyStd ? null : next);
  }

  async function handleDeleteSkill(folderName) {
    try {
      await apiFetch(`/api/skills/${folderName}`, { method: "DELETE" });

      // Remove from local skills list
      setSkills((prev) => prev.filter((s) => s.folderName !== folderName));

      // Remove from enabled_tools if present
      if (enabledTools && enabledTools.includes(folderName)) {
        const next = enabledTools.filter((n) => n !== folderName);
        const stdNames = standardTools.map((t) => t.name);
        const allStdOn = stdNames.every((n) => next.includes(n));
        const onlyStd = next.length === stdNames.length && allStdOn;
        onChange(onlyStd ? null : next);
      }
    } catch (err) {
      showAlert("Failed to delete skill: " + err.message);
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
        next = [...standardTools.map((t) => t.name), folderName];
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
            <div className="flex items-center gap-2 min-w-0">
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
                      : item.type === "sandbox"
                        ? "#8B5CF6"
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
                {item.type === "built-in" ? "Built-in" : item.type === "sandbox" ? "Sandbox" : "Custom"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {item.type === "custom" && (
                <button
                  onClick={() => handleDeleteSkill(item.name)}
                  className="text-xs px-2 py-1 rounded-lg transition-colors"
                  style={{ color: "#EF4444" }}
                  title="Delete skill from server"
                >
                  Delete
                </button>
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
