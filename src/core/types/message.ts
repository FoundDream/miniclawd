/**
 * Message types for inter-component communication.
 */

/**
 * Message received from a chat channel.
 */
export interface InboundMessage {
  /** Channel identifier (telegram, feishu, etc.) */
  channel: string;
  /** User identifier */
  senderId: string;
  /** Chat/channel identifier */
  chatId: string;
  /** Message text content */
  content: string;
  /** Timestamp */
  timestamp: Date;
  /** Media file paths */
  media: string[];
  /** Channel-specific metadata */
  metadata: Record<string, unknown>;
}

/**
 * Message to send to a chat channel.
 */
export interface OutboundMessage {
  /** Channel identifier */
  channel: string;
  /** Chat/channel identifier */
  chatId: string;
  /** Message content */
  content: string;
  /** Optional message ID to reply to */
  replyTo?: string;
  /** Media file paths */
  media: string[];
  /** Channel-specific metadata */
  metadata: Record<string, unknown>;
}
