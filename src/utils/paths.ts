/**
 * Path utility functions.
 */

import { existsSync, mkdirSync } from "fs";
import { join } from "path";

/**
 * Ensure a directory exists, creating it if necessary.
 */
export function ensureDir(path: string): string {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
  return path;
}

/**
 * Expand ~ to home directory.
 */
export function expandUser(path: string): string {
  if (path.startsWith("~")) {
    return path.replace(/^~/, process.env.HOME || "");
  }
  return path;
}

/**
 * Get the miniclawd data directory (~/.miniclawd).
 */
export function getDataPath(): string {
  return ensureDir(join(process.env.HOME || "", ".miniclawd"));
}

/**
 * Get the workspace path.
 */
export function getWorkspacePath(workspace?: string): string {
  const path = workspace
    ? expandUser(workspace)
    : join(process.env.HOME || "", ".miniclawd", "workspace");
  return ensureDir(path);
}

/**
 * Get the sessions storage directory.
 */
export function getSessionsPath(): string {
  return ensureDir(join(getDataPath(), "sessions"));
}

/**
 * Get the memory directory within the workspace.
 */
export function getMemoryPath(workspace?: string): string {
  const ws = workspace || getWorkspacePath();
  return ensureDir(join(ws, "memory"));
}

/**
 * Get the skills directory within the workspace.
 */
export function getSkillsPath(workspace?: string): string {
  const ws = workspace || getWorkspacePath();
  return ensureDir(join(ws, "skills"));
}

/**
 * Get today's date in YYYY-MM-DD format.
 */
export function todayDate(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Get current timestamp in ISO format.
 */
export function timestamp(): string {
  return new Date().toISOString();
}

/**
 * Truncate a string to max length, adding suffix if truncated.
 */
export function truncateString(s: string, maxLen: number = 100, suffix: string = "..."): string {
  if (s.length <= maxLen) {
    return s;
  }
  return s.slice(0, maxLen - suffix.length) + suffix;
}

/**
 * Convert a string to a safe filename.
 */
export function safeFilename(name: string): string {
  const unsafe = '<>:"/\\|?*';
  let result = name;
  for (const char of unsafe) {
    result = result.replace(new RegExp(`\\${char}`, "g"), "_");
  }
  return result.trim();
}

/**
 * Parse a session key into channel and chat_id.
 */
export function parseSessionKey(key: string): [string, string] {
  const parts = key.split(":", 2);
  if (parts.length !== 2) {
    throw new Error(`Invalid session key: ${key}`);
  }
  return [parts[0], parts[1]];
}
