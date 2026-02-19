/**
 * Authentication utilities — user CRUD, JWT token management,
 * and password hashing via bcrypt. JWT secret is auto-generated
 * and persisted to ~/.buddy/config/jwt-secret.txt.
 */

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import db from "./db.js";
import { DIRS } from "./config.js";

const SECRET_PATH = join(DIRS.config, "jwt-secret.txt");

function getJwtSecret() {
  if (existsSync(SECRET_PATH)) {
    return readFileSync(SECRET_PATH, "utf-8").trim();
  }
  const secret = randomBytes(32).toString("hex");
  writeFileSync(SECRET_PATH, secret, "utf-8");
  return secret;
}

const JWT_SECRET = getJwtSecret();
const JWT_EXPIRY = "7d";

export function createUser({ username, password, displayName, isAdmin = false }) {
  const id = randomBytes(16).toString("hex");
  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare(`
    INSERT INTO users (id, username, password_hash, display_name, is_admin)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, username.toLowerCase(), passwordHash, displayName, isAdmin ? 1 : 0);
  return { id, username: username.toLowerCase(), displayName, isAdmin };
}

export function getUserByUsername(username) {
  return db.prepare("SELECT * FROM users WHERE username = ?").get(username.toLowerCase());
}

export function getUserById(id) {
  return db.prepare("SELECT id, username, display_name, is_admin, created_at FROM users WHERE id = ?").get(id);
}

export function listUsers() {
  return db.prepare("SELECT id, username, display_name, is_admin, created_at FROM users ORDER BY created_at").all();
}

export function updateUser(id, fields) {
  const allowed = ["display_name", "is_admin"];
  const sets = [];
  const values = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(fields[key]);
    }
  }
  if (fields.password) {
    sets.push("password_hash = ?");
    values.push(bcrypt.hashSync(fields.password, 10));
  }
  if (sets.length === 0) return null;
  values.push(id);
  return db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

export function deleteUser(id) {
  const user = getUserById(id);
  if (!user) throw new Error("User not found");
  if (user.is_admin) {
    const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE is_admin = 1").get().count;
    if (adminCount <= 1) {
      throw new Error("Cannot delete the last admin user");
    }
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
}

export function getUserCount() {
  return db.prepare("SELECT COUNT(*) as count FROM users").get().count;
}

export function verifyPassword(plaintext, hash) {
  return bcrypt.compareSync(plaintext, hash);
}

export function signToken(user) {
  return jwt.sign(
    { userId: user.id, username: user.username, isAdmin: !!user.is_admin },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}
