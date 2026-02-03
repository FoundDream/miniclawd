/**
 * Session types for conversation history.
 */

/**
 * A message in the session history.
 */
export interface SessionMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: string;
  toolCallId?: string;
  name?: string;
  toolCalls?: unknown[];
  [key: string]: unknown;
}

/**
 * A conversation session.
 */
export interface Session {
  /** Session key (channel:chat_id) */
  key: string;
  /** Message history */
  messages: SessionMessage[];
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Additional metadata */
  metadata: Record<string, unknown>;
}

/**
 * Session info for listing.
 */
export interface SessionInfo {
  key: string;
  createdAt: string | null;
  updatedAt: string | null;
  path: string;
}
