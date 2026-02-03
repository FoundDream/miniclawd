/**
 * Async message queue for decoupled channel-agent communication.
 */

import type { InboundMessage, OutboundMessage } from "../../core/types/message.js";
import type { IMessageBus, OutboundCallback } from "../../core/interfaces/message-bus.js";
import logger from "../../utils/logger.js";

/**
 * Simple async queue implementation.
 */
class AsyncQueue<T> {
  private queue: T[] = [];
  private resolvers: ((value: T) => void)[] = [];

  async push(item: T): Promise<void> {
    const resolver = this.resolvers.shift();
    if (resolver) {
      resolver(item);
    } else {
      this.queue.push(item);
    }
  }

  async pop(): Promise<T> {
    const item = this.queue.shift();
    if (item !== undefined) {
      return item;
    }
    return new Promise((resolve) => {
      this.resolvers.push(resolve);
    });
  }

  async popWithTimeout(timeoutMs: number): Promise<T | null> {
    const item = this.queue.shift();
    if (item !== undefined) {
      return item;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        const index = this.resolvers.indexOf(wrappedResolve);
        if (index !== -1) {
          this.resolvers.splice(index, 1);
        }
        resolve(null);
      }, timeoutMs);

      const wrappedResolve = (value: T) => {
        clearTimeout(timeout);
        resolve(value);
      };

      this.resolvers.push(wrappedResolve);
    });
  }

  get size(): number {
    return this.queue.length;
  }
}

/**
 * Message bus that decouples chat channels from the agent core.
 *
 * Channels push messages to the inbound queue, and the agent processes
 * them and pushes responses to the outbound queue.
 */
export class MessageBus implements IMessageBus {
  private inbound = new AsyncQueue<InboundMessage>();
  private outbound = new AsyncQueue<OutboundMessage>();
  private outboundSubscribers: Map<string, OutboundCallback[]> = new Map();
  private _running = false;

  /**
   * Publish a message from a channel to the agent.
   */
  async publishInbound(msg: InboundMessage): Promise<void> {
    await this.inbound.push(msg);
  }

  /**
   * Consume the next inbound message (blocks until available).
   */
  async consumeInbound(): Promise<InboundMessage> {
    return this.inbound.pop();
  }

  /**
   * Consume the next inbound message with timeout.
   */
  async consumeInboundWithTimeout(timeoutMs: number): Promise<InboundMessage | null> {
    return this.inbound.popWithTimeout(timeoutMs);
  }

  /**
   * Publish a response from the agent to channels.
   */
  async publishOutbound(msg: OutboundMessage): Promise<void> {
    await this.outbound.push(msg);
  }

  /**
   * Consume the next outbound message (blocks until available).
   */
  async consumeOutbound(): Promise<OutboundMessage> {
    return this.outbound.pop();
  }

  /**
   * Consume the next outbound message with timeout.
   */
  async consumeOutboundWithTimeout(timeoutMs: number): Promise<OutboundMessage | null> {
    return this.outbound.popWithTimeout(timeoutMs);
  }

  /**
   * Subscribe to outbound messages for a specific channel.
   */
  subscribeOutbound(channel: string, callback: OutboundCallback): void {
    const subscribers = this.outboundSubscribers.get(channel) || [];
    subscribers.push(callback);
    this.outboundSubscribers.set(channel, subscribers);
  }

  /**
   * Dispatch outbound messages to subscribed channels.
   * Run this as a background task.
   */
  async dispatchOutbound(): Promise<void> {
    this._running = true;

    while (this._running) {
      const msg = await this.consumeOutboundWithTimeout(1000);
      if (!msg) continue;

      const subscribers = this.outboundSubscribers.get(msg.channel) || [];
      for (const callback of subscribers) {
        try {
          await callback(msg);
        } catch (error) {
          logger.error({ error, channel: msg.channel }, "Error dispatching to channel");
        }
      }
    }
  }

  /**
   * Stop the dispatcher loop.
   */
  stop(): void {
    this._running = false;
  }

  /**
   * Number of pending inbound messages.
   */
  get inboundSize(): number {
    return this.inbound.size;
  }

  /**
   * Number of pending outbound messages.
   */
  get outboundSize(): number {
    return this.outbound.size;
  }
}
