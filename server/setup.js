/**
 * First-run setup — interactive CLI for creating the initial admin account.
 * Runs before server starts; skips silently if users already exist.
 * Password input is masked with asterisks.
 */

import { createInterface } from "readline";
import { createUser, getUserCount } from "./auth.js";

export async function runSetupIfNeeded() {
  if (getUserCount() > 0) return;

  console.log("\n  Welcome to Buddy! Let's create your admin account.\n");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

  try {
    const username = (await ask("  Username: ")).trim().toLowerCase();
    if (!username || !/^[a-z0-9_-]+$/.test(username)) {
      console.error("\n  Username must be lowercase alphanumeric (a-z, 0-9, -, _).\n");
      process.exit(1);
    }

    const displayName = (await ask("  Display name: ")).trim();
    if (!displayName) {
      console.error("\n  Display name is required.\n");
      process.exit(1);
    }

    const password = await readPassword(rl, "  Password: ");
    if (!password || password.length < 4) {
      console.error("\n  Password must be at least 4 characters.\n");
      process.exit(1);
    }

    const confirm = await readPassword(rl, "  Confirm password: ");
    if (password !== confirm) {
      console.error("\n  Passwords do not match.\n");
      process.exit(1);
    }

    const user = createUser({ username, password, displayName, isAdmin: true });
    console.log(`\n  Admin account "${user.username}" created. Starting server...\n`);
  } finally {
    rl.close();
  }
}

function readPassword(rl, prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    if (stdin.isTTY) stdin.setRawMode(true);

    let password = "";
    const onData = (ch) => {
      const c = ch.toString("utf8");
      if (c === "\n" || c === "\r" || c === "\u0004") {
        if (stdin.isTTY) stdin.setRawMode(wasRaw);
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(password);
      } else if (c === "\u0003") {
        process.exit(0);
      } else if (c === "\u007f" || c === "\b") {
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stdout.write("\b \b");
        }
      } else {
        password += c;
        process.stdout.write("*");
      }
    };
    stdin.on("data", onData);
  });
}
