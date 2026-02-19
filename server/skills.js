/**
 * Custom skills registry — scans ~/.buddy/skills/ for SKILL.md folders,
 * parses YAML frontmatter, and provides CRUD operations.
 */

import { mkdirSync, existsSync, readFileSync, readdirSync, writeFileSync, rmSync, statSync } from "fs";
import { join } from "path";
import { DIRS } from "./config.js";

const SKILLS_DIR = DIRS.skills;

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
 * Get the raw SKILL.md file content for a skill by folder name.
 * @param {string} folderName
 * @returns {string|null} The raw file content, or null if not found.
 */
export function getSkillContent(folderName) {
  const skillMdPath = join(SKILLS_DIR, folderName, "SKILL.md");
  if (!existsSync(skillMdPath)) return null;
  return readFileSync(skillMdPath, "utf-8");
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
 * Update an existing skill's SKILL.md content.
 * @param {string} folderName - The folder name of the skill to update.
 * @param {string} skillMdContent - The new SKILL.md file content.
 * @returns {{ success: boolean, error?: string }}
 */
export function updateSkill(folderName, skillMdContent) {
  const skillDir = join(SKILLS_DIR, folderName);
  if (!existsSync(skillDir)) {
    return { success: false, error: `Skill '${folderName}' not found.` };
  }

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

  writeFileSync(join(skillDir, "SKILL.md"), skillMdContent, "utf-8");
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
