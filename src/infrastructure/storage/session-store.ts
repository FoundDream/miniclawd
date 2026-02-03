/**
 * Session storage implementation.
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from "fs";
import { join } from "path";
import { ensureDir, safeFilename } from "../../utils/paths.js";
import type { Session, SessionMessage, SessionInfo } from "../../core/types/session.js";
import type { ISessionStore } from "../../core/interfaces/storage.js";
import logger from "../../utils/logger.js";

/**
 * Create a new session.
 */
function createSession(key: string): Session {
  return {
    key,
    messages: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: {},
  };
}

/**
 * Add a message to a session.
 */
export function addMessage(
  session: Session,
  role: SessionMessage["role"],
  content: string,
  extras?: Partial<SessionMessage>
): void {
  const msg: SessionMessage = {
    role,
    content,
    timestamp: new Date().toISOString(),
    ...extras,
  };
  session.messages.push(msg);
  session.updatedAt = new Date();
}

/**
 * Get message history for LLM context.
 */
export function getHistory(session: Session, maxMessages: number = 50): Array<{ role: string; content: string }> {
  const recent =
    session.messages.length > maxMessages
      ? session.messages.slice(-maxMessages)
      : session.messages;

  return recent.map((m) => ({ role: m.role, content: m.content }));
}

/**
 * Clear all messages in a session.
 */
export function clearSession(session: Session): void {
  session.messages = [];
  session.updatedAt = new Date();
}

/**
 * Session manager that handles persistence.
 */
export class SessionManager implements ISessionStore {
  private sessionsDir: string;
  private cache: Map<string, Session> = new Map();

  constructor(workspace: string) {
    this.sessionsDir = ensureDir(join(process.env.HOME || "", ".miniclawd", "sessions"));
  }

  private getSessionPath(key: string): string {
    const safeKey = safeFilename(key.replace(":", "_"));
    return join(this.sessionsDir, `${safeKey}.jsonl`);
  }

  /**
   * Get an existing session or create a new one.
   */
  getOrCreate(key: string): Session {
    // Check cache
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }

    // Try to load from disk
    const session = this.load(key) || createSession(key);
    this.cache.set(key, session);
    return session;
  }

  /**
   * Load a session from disk.
   */
  private load(key: string): Session | null {
    const path = this.getSessionPath(key);

    if (!existsSync(path)) {
      return null;
    }

    try {
      const content = readFileSync(path, "utf-8");
      const lines = content.split("\n").filter((line) => line.trim());

      const messages: SessionMessage[] = [];
      let metadata: Record<string, unknown> = {};
      let createdAt: Date | null = null;

      for (const line of lines) {
        const data = JSON.parse(line);

        if (data._type === "metadata") {
          metadata = data.metadata || {};
          createdAt = data.createdAt ? new Date(data.createdAt) : null;
        } else {
          messages.push(data as SessionMessage);
        }
      }

      return {
        key,
        messages,
        createdAt: createdAt || new Date(),
        updatedAt: new Date(),
        metadata,
      };
    } catch (error) {
      logger.warn({ key, error }, "Failed to load session");
      return null;
    }
  }

  /**
   * Save a session to disk.
   */
  save(session: Session): void {
    const path = this.getSessionPath(session.key);

    const lines: string[] = [];

    // Write metadata first
    const metadataLine = {
      _type: "metadata",
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
      metadata: session.metadata,
    };
    lines.push(JSON.stringify(metadataLine));

    // Write messages
    for (const msg of session.messages) {
      lines.push(JSON.stringify(msg));
    }

    writeFileSync(path, lines.join("\n") + "\n");
    this.cache.set(session.key, session);
  }

  /**
   * Delete a session.
   */
  delete(key: string): boolean {
    this.cache.delete(key);
    const path = this.getSessionPath(key);

    if (existsSync(path)) {
      unlinkSync(path);
      return true;
    }
    return false;
  }

  /**
   * List all sessions.
   */
  listSessions(): SessionInfo[] {
    const sessions: SessionInfo[] = [];

    const files = readdirSync(this.sessionsDir).filter((f) => f.endsWith(".jsonl"));

    for (const file of files) {
      const path = join(this.sessionsDir, file);
      try {
        const content = readFileSync(path, "utf-8");
        const firstLine = content.split("\n")[0];
        if (firstLine) {
          const data = JSON.parse(firstLine);
          if (data._type === "metadata") {
            sessions.push({
              key: file.replace(".jsonl", "").replace("_", ":"),
              createdAt: data.createdAt,
              updatedAt: data.updatedAt,
              path,
            });
          }
        }
      } catch {
        continue;
      }
    }

    return sessions.sort((a, b) => {
      const aTime = a.updatedAt || "";
      const bTime = b.updatedAt || "";
      return bTime.localeCompare(aTime);
    });
  }
}
