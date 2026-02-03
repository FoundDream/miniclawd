/**
 * Channel interface.
 */

import type { OutboundMessage } from "../types/message.js";

/**
 * Interface for chat channel implementations.
 */
export interface IChannel {
  /**
   * Channel name identifier.
   */
  readonly name: string;

  /**
   * Whether the channel is currently running.
   */
  readonly isRunning: boolean;

  /**
   * Start the channel and begin listening for messages.
   */
  start(): Promise<void>;

  /**
   * Stop the channel and clean up resources.
   */
  stop(): Promise<void>;

  /**
   * Send a message through this channel.
   */
  send(msg: OutboundMessage): Promise<void>;

  /**
   * Check if a sender is allowed to use this bot.
   */
  isAllowed(senderId: string): boolean;
}
