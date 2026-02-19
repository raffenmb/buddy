/**
 * Output summarizer — when command output exceeds a line threshold,
 * saves the full output to a log file and calls Claude Haiku to produce
 * a concise summary. Falls back to head+tail truncation if Haiku fails.
 */

import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync } from "fs";
import { join } from "path";
import { DIRS } from "../config.js";

const LINE_THRESHOLD = 200;
const MAX_CHARS_FOR_HAIKU = 30_000;
const FALLBACK_LINES = 50;
const HAIKU_MODEL = "claude-haiku-4-5-20251001";

const anthropic = new Anthropic();

/**
 * @typedef {Object} SummaryResult
 * @property {string}  content    - The output to return (original or summarized).
 * @property {boolean} summarized - Whether the output was summarized.
 * @property {string}  [logPath]  - Path to the full output log file (if summarized).
 */

/**
 * Summarize long command output using Haiku to save tokens.
 *
 * If the output is under LINE_THRESHOLD lines, returns it unchanged.
 * Otherwise saves the full output to ~/.buddy/logs/ and calls Haiku
 * for a concise summary. Falls back to first/last N lines on error.
 *
 * @param {string} output  - Raw command output.
 * @param {string} context - Description for the summarizer (e.g. "shell output").
 * @returns {Promise<SummaryResult>}
 */
export async function maybeSummarize(output, context = "shell output") {
  const lines = output.split("\n");

  if (lines.length <= LINE_THRESHOLD) {
    return { content: output, summarized: false };
  }

  // ── Save full output to log file ────────────────────────────────────────
  const logId = Date.now().toString(36);
  const logPath = join(DIRS.logs, `exec-${logId}.log`);
  writeFileSync(logPath, output, "utf-8");

  // ── Attempt Haiku summary ──────────────────────────────────────────────
  const truncatedOutput = output.length > MAX_CHARS_FOR_HAIKU
    ? output.slice(0, MAX_CHARS_FOR_HAIKU) + "\n... [truncated]"
    : output;

  try {
    const response = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Summarize this ${context} concisely. Focus on errors, warnings, key results, and actionable information. Omit routine/verbose lines.\n\n${truncatedOutput}`,
        },
      ],
    });

    const summary = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    return {
      content: `[Summarized — ${lines.length} lines total, full output at ${logPath}]\n\n${summary}`,
      summarized: true,
      logPath,
    };
  } catch (err) {
    console.warn("Haiku summarization failed, falling back to head+tail:", err.message);
    return headTailFallback(lines, logPath);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * When Haiku is unavailable, return the first and last FALLBACK_LINES lines.
 */
function headTailFallback(lines, logPath) {
  const head = lines.slice(0, FALLBACK_LINES);
  const tail = lines.slice(-FALLBACK_LINES);
  const omitted = lines.length - FALLBACK_LINES * 2;

  const content = [
    `[Summarized — ${lines.length} lines total, full output at ${logPath}]`,
    "",
    ...head,
    "",
    `... [${omitted} lines omitted] ...`,
    "",
    ...tail,
  ].join("\n");

  return { content, summarized: true, logPath };
}
