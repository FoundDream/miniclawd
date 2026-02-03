/**
 * Base channel interface for chat platforms.
 */

import type { InboundMessage, OutboundMessage } from "../../core/types/message.js";
import type { IChannel } from "../../core/interfaces/channel.js";
import { createInboundMessage } from "../queue/events.js";
import { MessageBus } from "../queue/message-bus.js";

/**
 * Abstract base class for chat channel implementations.
 *
 * Each channel (Telegram, Feishu, etc.) should implement this interface
 * to integrate with the miniclawd message bus.
 */
export abstract class BaseChannel implements IChannel {
  /**
   * Channel name identifier.
   */
  abstract readonly name: string;

  protected config: unknown;
  protected bus: MessageBus;
  protected _running = false;

  constructor(config: unknown, bus: MessageBus) {
    this.config = config;
    this.bus = bus;
  }

  /**
   * Start the channel and begin listening for messages.
   */
  abstract start(): Promise<void>;

  /**
   * Stop the channel and clean up resources.
   */
  abstract stop(): Promise<void>;

  /**
   * Send a message through this channel.
   */
  abstract send(msg: OutboundMessage): Promise<void>;

  /**
   * Check if a sender is allowed to use this bot.
   */
  isAllowed(senderId: string): boolean {
    const config = this.config as { allowFrom?: string[] };
    const allowList = config.allowFrom || [];

    // If no allow list, allow everyone
    if (allowList.length === 0) {
      return true;
    }

    const senderStr = String(senderId);
    if (allowList.includes(senderStr)) {
      return true;
    }

    // Check parts separated by |
    if (senderStr.includes("|")) {
      for (const part of senderStr.split("|")) {
        if (part && allowList.includes(part)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Handle an incoming message from the chat platform.
   */
  protected async handleMessage(
    senderId: string,
    chatId: string,
    content: string,
    media?: string[],
    metadata?: Record<string, unknown>
  ): Promise<void> {
    if (!this.isAllowed(senderId)) {
      return;
    }

    const msg = createInboundMessage({
      channel: this.name,
      senderId: String(senderId),
      chatId: String(chatId),
      content,
      media: media || [],
      metadata: metadata || {},
    });

    await this.bus.publishInbound(msg);
  }

  /**
   * Check if the channel is running.
   */
  get isRunning(): boolean {
    return this._running;
  }
}
