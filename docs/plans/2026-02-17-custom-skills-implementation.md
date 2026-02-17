# Custom Skills Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add drag-and-drop custom skills (Claude Code SKILL.md format) to Buddy agents, with prompt injection into the system prompt and a unified tool/skill toggle UI.

**Architecture:** Skills are folders in `server/skills/` each containing a `SKILL.md` with YAML frontmatter (name, description) and a markdown prompt. The server scans them on startup, exposes CRUD via REST API, and injects enabled skill prompts into the system prompt during Claude API calls. The frontend ToolSelector becomes a unified list of built-in tools + custom skills with badges, toggles, delete, and an upload drop zone.

**Tech Stack:** Node.js (fs, path), Express routes, React (useState, useEffect), existing `apiFetch` helper, File System Access API / webkitdirectory for folder upload.

---

### Task 1: Create `server/skills.js` module

**Files:**
- Create: `server/skills.js`

**Step 1: Create the skills module with YAML frontmatter parsing and CRUD**

```js
/**
 * Custom skills registry — scans server/skills/ for SKILL.md folders,
 * parses YAML frontmatter, and provides CRUD operations.
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdirSync, existsSync, readFileSync, readdirSync, writeFileSync, rmSync, statSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, "skills");

// Ensure skills directory exists on startup
if (!existsSync(SKILLS_DIR)) {
  mkdirSync(SKILLS_DIR, { recursive: true });
}

// In-memory cache of parsed skills, rebuilt on scan
let skillsCache = [];

/**
 * Parse YAML frontmatter from a SKILL.md string.
 * Expects --- delimited frontmatter at the top of the file.
 * Returns { name, description, prompt } or null if invalid.
 */
function parseSkillMd(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return null;

  const frontmatter = match[1];
  const prompt = match[2].trim();

  // Simple YAML key-value extraction (no library needed for name/description)
  let name = "";
  let description = "";

  for (const line of frontmatter.split("\n")) {
    const nameMatch = line.match(/^name:\s*"?([^"]*)"?\s*$/);
    if (nameMatch) name = nameMatch[1].trim();

    const descMatch = line.match(/^description:\s*"?([^"]*)"?\s*$/);
    if (descMatch) description = descMatch[1].trim();
  }

  return { name, description, prompt };
}

/**
 * Scan the skills directory and rebuild the in-memory cache.
 */
function scanSkills() {
  if (!existsSync(SKILLS_DIR)) {
    skillsCache = [];
    return;
  }

  skillsCache = readdirSync(SKILLS_DIR)
    .filter((entry) => {
      const entryPath = join(SKILLS_DIR, entry);
      return statSync(entryPath).isDirectory();
    })
    .map((folderName) => {
      const skillMdPath = join(SKILLS_DIR, folderName, "SKILL.md");
      if (!existsSync(skillMdPath)) return null;

      const content = readFileSync(skillMdPath, "utf-8");
      const parsed = parseSkillMd(content);
      if (!parsed || !parsed.name || !parsed.description) return null;

      return {
        folderName,
        name: parsed.name,
        description: parsed.description,
      };
    })
    .filter(Boolean);
}

// Initial scan on module load
scanSkills();

/**
 * List all valid installed skills.
 * @returns {Array<{ folderName: string, name: string, description: string }>}
 */
export function listSkills() {
  return skillsCache;
}

/**
 * Get the full prompt content for a skill by folder name.
 * @param {string} folderName
 * @returns {string|null} The markdown prompt content, or null if not found.
 */
export function getSkillPrompt(folderName) {
  const skillMdPath = join(SKILLS_DIR, folderName, "SKILL.md");
  if (!existsSync(skillMdPath)) return null;

  const content = readFileSync(skillMdPath, "utf-8");
  const parsed = parseSkillMd(content);
  return parsed ? parsed.prompt : null;
}

/**
 * Validate and add a new skill from uploaded content.
 * @param {string} folderName - The folder name for the skill.
 * @param {string} skillMdContent - The raw SKILL.md file content.
 * @returns {{ success: boolean, error?: string }}
 */
export function validateAndAddSkill(folderName, skillMdContent) {
  // Check duplicate folder name
  const skillDir = join(SKILLS_DIR, folderName);
  if (existsSync(skillDir)) {
    return {
      success: false,
      error: `A skill named '${folderName}' is already installed. Remove the existing one first or rename the folder.`,
    };
  }

  // Parse and validate content
  const parsed = parseSkillMd(skillMdContent);

  if (!parsed) {
    return {
      success: false,
      error: "SKILL.md must have YAML frontmatter delimited by --- at the top of the file.",
    };
  }

  if (!parsed.name) {
    return {
      success: false,
      error: "SKILL.md is missing a 'name' field. Add `name: your-skill-name` to the YAML frontmatter at the top of the file.",
    };
  }

  if (!parsed.description) {
    return {
      success: false,
      error: 'SKILL.md is missing a \'description\' field. Add `description: "what this skill does"` to the YAML frontmatter.',
    };
  }

  // Write to disk
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), skillMdContent, "utf-8");

  // Rebuild cache
  scanSkills();

  return { success: true };
}

/**
 * Delete a skill by folder name.
 * @param {string} folderName
 * @returns {{ success: boolean, error?: string }}
 */
export function deleteSkill(folderName) {
  const skillDir = join(SKILLS_DIR, folderName);
  if (!existsSync(skillDir)) {
    return { success: false, error: `Skill '${folderName}' not found.` };
  }

  rmSync(skillDir, { recursive: true, force: true });
  scanSkills();

  return { success: true };
}
```

**Step 2: Commit**

```bash
git add server/skills.js
git commit -m "feat: add server/skills.js module for custom skill CRUD and YAML parsing"
```

---

### Task 2: Add skills API routes to `server/index.js`

**Files:**
- Modify: `server/index.js:16` (add import)
- Modify: `server/index.js:165-166` (add routes between Agent File Routes and Session Routes)

**Step 1: Add import at the top of index.js**

At line 16, after the agents import, add:

```js
import { listSkills, validateAndAddSkill, deleteSkill } from "./skills.js";
```

**Step 2: Add skills routes**

Insert a new route section between the Agent File Routes block (ends ~line 165) and the Session Routes block (starts ~line 167). Add:

```js
// ─── Skills Routes ───────────────────────────────────────────────────────────

app.get("/api/skills", (req, res) => {
  res.json(listSkills());
});

app.post("/api/skills", (req, res) => {
  const { folderName, content } = req.body;

  if (!folderName || typeof folderName !== "string") {
    return res.status(400).json({ error: "folderName is required" });
  }

  if (!content || typeof content !== "string") {
    return res.status(400).json({
      error: "This folder doesn't contain a SKILL.md file. Each skill needs a SKILL.md with a name and description in the frontmatter.",
    });
  }

  const result = validateAndAddSkill(folderName.trim(), content);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  res.status(201).json({ status: "created", folderName: folderName.trim() });
});

app.delete("/api/skills/:folderName", (req, res) => {
  const result = deleteSkill(req.params.folderName);
  if (!result.success) {
    return res.status(404).json({ error: result.error });
  }
  res.json({ status: "deleted" });
});
```

**Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat: add GET/POST/DELETE /api/skills routes"
```

---

### Task 3: Integrate skills into system prompt building in `claude-client.js`

**Files:**
- Modify: `server/claude-client.js:11` (add import)
- Modify: `server/claude-client.js:46-68` (update `buildSystemPrompt` function)

**Step 1: Add skills import**

At line 11, after `import tools from "./tools.js";`, add:

```js
import { listSkills, getSkillPrompt } from "./skills.js";
```

**Step 2: Update `buildSystemPrompt` to accept enabled_tools and append skill prompts**

Replace the `buildSystemPrompt` function (lines 46-68) with:

```js
/**
 * Build the full system prompt from base template + per-agent personality,
 * user info, memories, and enabled custom skills.
 */
function buildSystemPrompt(agent, memories) {
  const personality = getIdentity(agent.id) || "Be helpful and friendly.";

  const userInfo = getUserInfo(agent.id);
  const userInfoSection = userInfo && userInfo.trim()
    ? "## About the user\n" + userInfo
    : "";

  let memoriesSection = "";
  if (memories.length > 0) {
    memoriesSection = "## What you remember about the user\n";
    for (const mem of memories) {
      memoriesSection += `- ${mem.key}: ${mem.value}\n`;
    }
  }

  let basePrompt = systemPromptTemplate
    .replace("{{name}}", agent.name)
    .replace("{{personality}}", personality)
    .replace("{{user_info}}", userInfoSection)
    .replace("{{memories}}", memoriesSection)
    .trim();

  // Append enabled custom skill prompts
  const enabledTools = parseEnabledTools(agent.enabled_tools);
  if (enabledTools) {
    const installedSkills = listSkills();
    const builtInNames = tools.map((t) => t.name);

    for (const toolName of enabledTools) {
      // Skip built-in tools — they're handled via the tools array, not system prompt
      if (builtInNames.includes(toolName)) continue;

      // Check if this is an installed skill
      const skill = installedSkills.find((s) => s.folderName === toolName);
      if (!skill) continue; // stale reference, skip silently

      const prompt = getSkillPrompt(toolName);
      if (prompt) {
        basePrompt += `\n\n## Skill: ${skill.name}\n${prompt}`;
      }
    }
  }

  return basePrompt;
}

/**
 * Parse the enabled_tools field from an agent record.
 * Returns an array of tool/skill names, or null if all built-in tools enabled.
 */
function parseEnabledTools(enabledToolsRaw) {
  if (!enabledToolsRaw) return null;
  try {
    const parsed = typeof enabledToolsRaw === "string"
      ? JSON.parse(enabledToolsRaw)
      : enabledToolsRaw;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
```

**Step 3: Refactor the tool filtering in `processPrompt` to use `parseEnabledTools`**

Replace lines 87-103 (the tool filtering block inside `processPrompt`) with:

```js
  // 2. Filter tools based on agent's enabled_tools setting
  //    Canvas tools are always included; only non-canvas tools are toggleable.
  //    Custom skills are NOT API tools — they're injected into the system prompt.
  let agentTools = tools;
  const enabledTools = parseEnabledTools(agent.enabled_tools);
  if (enabledTools) {
    agentTools = tools.filter(
      (t) => t.name.startsWith("canvas_") || enabledTools.includes(t.name)
    );
  }
```

**Step 4: Commit**

```bash
git add server/claude-client.js
git commit -m "feat: inject enabled custom skill prompts into system prompt"
```

---

### Task 4: Rewrite `ToolSelector.jsx` — unified list with badges, delete, upload

**Files:**
- Modify: `client/src/components/admin/ToolSelector.jsx` (full rewrite)

This is the largest task. The new ToolSelector:
1. Fetches installed skills from `GET /api/skills` on mount
2. Merges them with the hardcoded built-in tools into a single list
3. Shows each item with a badge ("Built-in" or "Custom"), toggle, and delete (custom only)
4. Below the list, shows a drop zone for uploading new skills
5. Handles folder drag-and-drop and browse via `showDirectoryPicker()` / `webkitdirectory` fallback

**Step 1: Rewrite ToolSelector.jsx**

Replace the entire file contents of `client/src/components/admin/ToolSelector.jsx` with:

```jsx
import { useState, useEffect, useRef } from "react";
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
    ...BUILT_IN_TOOLS.map((t) => ({ ...t, type: "built-in" })),
    ...skills.map((s) => ({ name: s.folderName, label: s.name, type: "custom" })),
  ];

  // When enabledTools is null, all built-in tools are ON, custom skills are OFF
  const allBuiltInEnabled = enabledTools === null;
  const selected = allBuiltInEnabled
    ? BUILT_IN_TOOLS.map((t) => t.name)
    : enabledTools || [];

  function isChecked(itemName, itemType) {
    if (allBuiltInEnabled && itemType === "built-in") return true;
    if (allBuiltInEnabled && itemType === "custom") return false;
    return selected.includes(itemName);
  }

  function toggle(itemName, itemType) {
    let next;

    if (allBuiltInEnabled) {
      // Transitioning from null (all built-in ON) to explicit array
      if (itemType === "built-in") {
        // Turning OFF a built-in: keep all other built-ins, no custom skills
        next = BUILT_IN_TOOLS.map((t) => t.name).filter((n) => n !== itemName);
      } else {
        // Turning ON a custom skill: keep all built-ins + add this skill
        next = [...BUILT_IN_TOOLS.map((t) => t.name), itemName];
      }
    } else if (selected.includes(itemName)) {
      next = selected.filter((n) => n !== itemName);
    } else {
      next = [...selected, itemName];
    }

    // If all built-in tools are ON and no custom skills are ON, return to null
    const builtInNames = BUILT_IN_TOOLS.map((t) => t.name);
    const allBuiltInOn = builtInNames.every((n) => next.includes(n));
    const noCustomOn = !next.some((n) => !builtInNames.includes(n));

    onChange(allBuiltInOn && noCustomOn ? null : next);
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
        const noCustomOn = !next.some((n) => !builtInNames.includes(n));
        onChange(allBuiltInOn && noCustomOn ? null : next);
      }
    } catch (err) {
      alert("Failed to delete skill: " + err.message);
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
      const builtInNames = BUILT_IN_TOOLS.map((t) => t.name);
      let next;
      if (allBuiltInEnabled) {
        next = [...builtInNames, folderName];
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

  /**
   * Read a SKILL.md from a dropped/browsed folder.
   * Uses the File System Access API (showDirectoryPicker) when available,
   * falls back to webkitdirectory <input>.
   */
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
                    item.type === "built-in"
                      ? "var(--color-bg-raised)"
                      : "var(--color-accent)",
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
                {item.type === "built-in" ? "Built-in" : "Custom"}
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
```

**Step 2: Commit**

```bash
git add client/src/components/admin/ToolSelector.jsx
git commit -m "feat: unified ToolSelector with badges, delete, and skill upload drop zone"
```

---

### Task 5: Update ToolSelector null-to-explicit transition logic

**Files:**
- Modify: `client/src/components/admin/ToolSelector.jsx` (the `toggle` function only — adjust if needed after Task 4 testing)

The current `toggle` function in the old ToolSelector uses a shortcut: if all toggleable tools are on, set `enabled_tools` back to `null`. With custom skills in the mix, the logic is: return to `null` only when all built-in tools are ON **and** no custom skills are ON.

This is already implemented in the Task 4 code above, but verify during testing that:
- Toggling off a built-in when `enabledTools === null` → array with remaining built-in tools
- Toggling on a custom skill when `enabledTools === null` → array with all built-in tools + that skill
- Toggling off the last custom skill while all built-ins are on → back to `null`

No code change needed — this is a verification-only step.

**Step 1: Manually test toggle behavior**

1. Start the server: `cd server && node index.js`
2. Start the client: `cd client && npm run dev`
3. Open the admin panel, edit an agent
4. Verify built-in tools show "Built-in" badge and are toggled ON by default
5. Toggle off "YouTube Search" — verify `enabledTools` becomes `["remember_fact"]`
6. Toggle it back on — verify `enabledTools` becomes `null` again
7. If a custom skill is installed, toggle it on — verify `enabledTools` becomes `["search_youtube", "remember_fact", "skill-folder-name"]`
8. Toggle the custom skill back off — verify `enabledTools` goes back to `null`

---

### Task 6: Create a test skill and do end-to-end manual testing

**Files:**
- Create: `server/skills/test-greeter/SKILL.md` (temporary test fixture)

**Step 1: Create a test skill folder**

Create `server/skills/test-greeter/SKILL.md` with:

```markdown
---
name: test-greeter
description: "Always greets the user enthusiastically when they say hello"
---

# Test Greeter

When the user says hello, hi, or any greeting, you MUST respond with an over-the-top enthusiastic greeting. Use exclamation marks liberally. Mention that you're SO EXCITED to talk to them.
```

**Step 2: Verify the full flow**

1. **API test:** `GET /api/skills` returns the test-greeter skill with correct name/description
2. **UI test:** Open agent editor — test-greeter appears in the tools list with a "Custom" badge
3. **Toggle test:** Enable test-greeter on an agent, save, verify `enabled_tools` includes `"test-greeter"`
4. **Prompt test:** With test-greeter enabled, send "hello" to the agent. Verify the response is enthusiastically over-the-top (confirming the skill prompt was injected)
5. **Delete test:** Click "Delete" on test-greeter in the UI. Verify it disappears from the list and `GET /api/skills` no longer returns it
6. **Upload test:** Drag the `test-greeter` folder back into the drop zone. Verify it re-appears
7. **Validation test:** Try uploading a folder without SKILL.md — verify the specific error message appears

**Step 3: Clean up test skill (optional)**

Remove `server/skills/test-greeter/` if you don't want it persisted, or keep it as an example.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: custom skills — complete implementation with upload, toggle, and system prompt injection"
```

---

### Task 7: Update CLAUDE.md with skills documentation

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add skills section to CLAUDE.md**

In the Architecture section, after the "Key client modules" list, add:

```markdown
**Custom Skills:**
- `server/skills/` — Directory for custom skill folders (each contains `SKILL.md` with YAML frontmatter)
- `server/skills.js` — Scans, validates, and manages custom skills (CRUD + YAML frontmatter parsing)
- Skills use Claude Code's `SKILL.md` format: YAML frontmatter with `name:` and `description:`, followed by a markdown prompt
- When enabled on an agent, skill prompts are appended to the system prompt sent to Claude
- `enabled_tools` on each agent holds both built-in tool names and skill folder names
- `null` = all built-in tools ON, custom skills OFF. Explicit array = only listed items ON.
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add custom skills architecture to CLAUDE.md"
```
