/**
 * Browser automation — Puppeteer-based browser tools using accessibility tree
 * snapshots as the primary observation mechanism.
 */

import puppeteer from "puppeteer";
import { join } from "path";
import { DIRS } from "../config.js";

// ─── Module state ──────────────────────────────────────────────────────────────

let browser = null;
let page = null;
let idleTimer = null;

const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// ─── Internal helpers ──────────────────────────────────────────────────────────

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    console.log("[browser] Idle timeout — closing browser");
    await doClose();
  }, IDLE_TIMEOUT);
}

async function ensureBrowser() {
  if (!browser || !browser.connected) {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    page = (await browser.pages())[0] || (await browser.newPage());
    await page.setViewport({ width: 1280, height: 800 });
  }
  resetIdleTimer();
  return page;
}

/**
 * Format an accessibility tree snapshot into a readable text representation.
 * Caps output at ~8000 characters to stay within tool result limits.
 */
function formatAccessibilityTree(node, indent = 0, lines = []) {
  if (!node) return lines;

  const MAX_CHARS = 8000;

  // Filter noise: skip generic/none roles with no name or value
  const role = node.role || "";
  const name = node.name || "";
  const value = node.value || "";

  const skipRoles = ["none", "generic", "InlineTextBox", "LineBreak"];
  const hasContent = name.trim() || value.trim();

  if (!skipRoles.includes(role) && (hasContent || indent === 0)) {
    const prefix = "  ".repeat(indent);
    let line = `${prefix}[${role}]`;
    if (name.trim()) line += ` "${name.trim()}"`;
    if (value.trim()) line += ` value="${value.trim()}"`;
    lines.push(line);
  }

  if (node.children) {
    for (const child of node.children) {
      // Check total length before recursing
      const totalLen = lines.reduce((sum, l) => sum + l.length + 1, 0);
      if (totalLen > MAX_CHARS) {
        lines.push("  ... (truncated — use browser_snapshot for full tree)");
        break;
      }
      formatAccessibilityTree(child, indent + 1, lines);
    }
  }

  return lines;
}

async function getAccessibilitySnapshot() {
  if (!page) return "(no page open)";
  try {
    const snapshot = await page.accessibility.snapshot();
    if (!snapshot) return "(empty page)";
    const lines = formatAccessibilityTree(snapshot);
    return lines.join("\n") || "(no accessible content)";
  } catch (err) {
    return `(accessibility error: ${err.message})`;
  }
}

async function doClose() {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (browser) {
    try { await browser.close(); } catch {}
    browser = null;
    page = null;
  }
}

// ─── Exported tool functions ───────────────────────────────────────────────────

/**
 * Open a URL in the browser (launches browser if needed).
 */
export async function openBrowser(url) {
  try {
    const p = await ensureBrowser();
    await p.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    const title = await p.title();
    const snapshot = await getAccessibilitySnapshot();
    return { status: "opened", url: p.url(), title, snapshot };
  } catch (err) {
    return { error: `Failed to open ${url}: ${err.message}` };
  }
}

/**
 * Get the current page's accessibility tree snapshot.
 */
export async function getSnapshot() {
  try {
    if (!page) return { error: "No browser page open. Use browser_open first." };
    resetIdleTimer();
    const title = await page.title();
    const snapshot = await getAccessibilitySnapshot();
    return { url: page.url(), title, snapshot };
  } catch (err) {
    return { error: `Snapshot failed: ${err.message}` };
  }
}

/**
 * Take a screenshot and save as PNG.
 */
export async function takeScreenshot(path) {
  try {
    if (!page) return { error: "No browser page open. Use browser_open first." };
    resetIdleTimer();
    const filePath = path || join(DIRS.shared, `screenshot-${Date.now()}.png`);
    await page.screenshot({ path: filePath, fullPage: false });
    return { status: "captured", path: filePath };
  } catch (err) {
    return { error: `Screenshot failed: ${err.message}` };
  }
}

/**
 * Click an element by CSS selector or text content.
 */
export async function clickElement(selector, options = {}) {
  try {
    if (!page) return { error: "No browser page open. Use browser_open first." };
    resetIdleTimer();

    if (options.text) {
      // Click by visible text — find element containing this text
      const clicked = await page.evaluate((text) => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          if (walker.currentNode.textContent.trim().includes(text)) {
            const el = walker.currentNode.parentElement;
            if (el) { el.click(); return true; }
          }
        }
        return false;
      }, options.text);
      if (!clicked) return { error: `No element found with text "${options.text}"` };
    } else {
      await page.click(selector);
    }

    // Wait a moment for navigation/rendering
    await page.waitForNetworkIdle({ timeout: 5000 }).catch(() => {});
    const snapshot = await getAccessibilitySnapshot();
    return { status: "clicked", snapshot };
  } catch (err) {
    return { error: `Click failed: ${err.message}` };
  }
}

/**
 * Type text into a field. Optionally target a specific selector.
 */
export async function typeText(text, selector, options = {}) {
  try {
    if (!page) return { error: "No browser page open. Use browser_open first." };
    resetIdleTimer();

    if (selector) {
      await page.click(selector);
      await page.type(selector, text);
    } else {
      await page.keyboard.type(text);
    }

    if (options.pressEnter) {
      await page.keyboard.press("Enter");
      await page.waitForNetworkIdle({ timeout: 5000 }).catch(() => {});
    }

    const snapshot = await getAccessibilitySnapshot();
    return { status: "typed", snapshot };
  } catch (err) {
    return { error: `Type failed: ${err.message}` };
  }
}

/**
 * Navigate to a URL on the existing page.
 */
export async function navigateTo(url) {
  try {
    if (!page) return { error: "No browser page open. Use browser_open first." };
    resetIdleTimer();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    const title = await page.title();
    const snapshot = await getAccessibilitySnapshot();
    return { status: "navigated", url: page.url(), title, snapshot };
  } catch (err) {
    return { error: `Navigation failed: ${err.message}` };
  }
}

/**
 * Close the browser and clean up.
 */
export async function closeBrowser() {
  try {
    await doClose();
    return { status: "closed" };
  } catch (err) {
    return { error: `Close failed: ${err.message}` };
  }
}
