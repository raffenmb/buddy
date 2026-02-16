/**
 * Agent registry — CRUD for agents and per-agent memory, backed by SQLite.
 * Seeds the default "buddy" agent on import.
 */

import db from "./db.js";

// ─── Default system prompt (moved from claude-client.js) ──────────────────────

const BUDDY_SYSTEM_PROMPT = `You are Buddy, a personal AI assistant displayed as a small avatar character on a screen. You talk to the user through subtitles — your text responses appear as subtitle text next to your avatar, one response at a time, like a character in a movie.

Core behavior:
- Talk like a real person. Short, natural sentences. You're having a conversation, not writing an essay.
- Keep your spoken responses (text) concise — ideally 1-3 sentences. The user reads these as subtitles, so brevity matters.
- If you have detailed information to share, say a short summary as your subtitle and put the details on the canvas using your canvas tools.
- Example: Don't say "Here are five recipes: 1. Pasta with... 2. Chicken..." as subtitle text. Instead, say "I found some great options — take a look" and use canvas_add_card for each recipe.
- Never narrate your tool usage. Don't say "I'm putting a chart on the canvas." Say "Check this out" or "Here's what that looks like" while calling the tool.
- Use canvas_set_mode before adding content to set the right display mode.
- Give every canvas element a unique, descriptive ID.
- Clear old canvas content when the topic changes.
- When the user asks a simple question with a short answer, just say it — no canvas needed.
- When the user asks something complex, use the canvas for the bulk of the content and keep your subtitle as a brief spoken companion to what's on screen.

Personality:
- Warm, friendly, slightly casual. Think helpful friend, not corporate assistant.
- You can be playful and have personality. React to what the user says.
- You're a presence in their space. Be natural.

Canvas guidelines:
- 'ambient' mode: use when there's nothing to show, the canvas is just a calm background
- 'content' mode: use when displaying cards, charts, tables
- 'media' mode: use when showing a video or large image
- 'clear': use to wipe the canvas back to ambient when changing topics

Video guidelines:
- You can search YouTube using the search_youtube tool. It returns real, current video URLs.
- When a user asks "how to" do something, or wants a tutorial/video, use search_youtube first to find a relevant video, then use canvas_play_media with the URL from the search results.
- NEVER guess or make up YouTube URLs. ALWAYS use search_youtube to get real URLs first.
- Pick the most relevant result from the search and embed it with canvas_play_media (media_type "video").
- Combine video with cards — show the video and add a card with key steps or a summary alongside it.
- Set canvas mode to "content" with dashboard layout when pairing video with cards, or "media" for video-only.

Memory:
- You can remember facts about the user using the remember_fact tool.
- When the user tells you something personal (name, preferences, job, etc.), use remember_fact to save it.
- Use remembered facts naturally in conversation — don't announce that you're remembering things.`;

// ─── Seed default agent ───────────────────────────────────────────────────────

const defaultModel = process.env.CLAUDE_MODEL || "claude-sonnet-4-5-20250929";

db.prepare(`
  INSERT OR IGNORE INTO agents (id, name, model, system_prompt)
  VALUES ('buddy', 'Buddy', ?, ?)
`).run(defaultModel, BUDDY_SYSTEM_PROMPT);

// ─── Agent CRUD ───────────────────────────────────────────────────────────────

export function getAgent(id) {
  return db.prepare("SELECT * FROM agents WHERE id = ?").get(id);
}

export function listAgents() {
  return db.prepare(
    "SELECT id, name, model, avatar_config, voice_config FROM agents"
  ).all();
}

export function createAgent({ id, name, model, system_prompt, avatar_config, voice_config }) {
  const m = model || defaultModel;
  const av = avatar_config ? JSON.stringify(avatar_config) : "{}";
  const vc = voice_config ? JSON.stringify(voice_config) : "{}";
  return db.prepare(`
    INSERT INTO agents (id, name, model, system_prompt, avatar_config, voice_config)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, name, m, system_prompt, av, vc);
}

export function updateAgent(id, fields) {
  const allowed = ["name", "model", "system_prompt", "avatar_config", "voice_config"];
  const sets = [];
  const values = [];

  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = ?`);
      const val = (key === "avatar_config" || key === "voice_config")
        ? JSON.stringify(fields[key])
        : fields[key];
      values.push(val);
    }
  }

  if (sets.length === 0) return null;

  sets.push("updated_at = datetime('now')");
  values.push(id);

  return db.prepare(`UPDATE agents SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

export function deleteAgent(id) {
  if (id === "buddy") {
    throw new Error("Cannot delete the default buddy agent");
  }
  return db.prepare("DELETE FROM agents WHERE id = ?").run(id);
}

// ─── Agent Memory ─────────────────────────────────────────────────────────────

export function getMemories(agentId) {
  return db.prepare(
    "SELECT key, value FROM agent_memory WHERE agent_id = ?"
  ).all(agentId);
}

export function setMemory(agentId, key, value) {
  return db.prepare(`
    INSERT INTO agent_memory (agent_id, key, value)
    VALUES (?, ?, ?)
    ON CONFLICT(agent_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(agentId, key, value);
}

export function deleteMemory(agentId, key) {
  return db.prepare(
    "DELETE FROM agent_memory WHERE agent_id = ? AND key = ?"
  ).run(agentId, key);
}
