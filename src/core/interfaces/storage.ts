/**
 * Storage interfaces.
 */

import type { Session, SessionInfo, SessionMessage } from "../types/session.js";

/**
 * Interface for session storage.
 */
export interface ISessionStore {
  /**
   * Get an existing session or create a new one.
   */
  getOrCreate(key: string): Session;

  /**
   * Save a session to persistent storage.
   */
  save(session: Session): void;

  /**
   * Delete a session.
   */
  delete(key: string): boolean;

  /**
   * List all sessions.
   */
  listSessions(): SessionInfo[];
}

/**
 * Interface for memory storage.
 */
export interface IMemoryStore {
  /**
   * Read long-term memory.
   */
  readLongTerm(): Promise<string>;

  /**
   * Write long-term memory.
   */
  writeLongTerm(content: string): Promise<void>;

  /**
   * Read today's notes.
   */
  readToday(): Promise<string>;

  /**
   * Append to today's notes.
   */
  appendToday(content: string): Promise<void>;

  /**
   * Get recent memories (last N days).
   */
  getRecentMemories(days: number): Promise<string[]>;

  /**
   * Get combined memory context.
   */
  getMemoryContext(): Promise<string>;
}
