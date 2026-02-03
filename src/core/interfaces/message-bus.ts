/**
 * Message bus interface.
 */

import type { InboundMessage, OutboundMessage } from "../types/message.js";

/**
 * Callback for outbound message handling.
 */
export type OutboundCallback = (msg: OutboundMessage) => Promise<void>;

/**
 * Interface for message bus.
 */
export interface IMessageBus {
  /**
   * Publish a message from a channel to the agent.
   */
  publishInbound(msg: InboundMessage): Promise<void>;

  /**
   * Consume the next inbound message (blocks until available).
   */
  consumeInbound(): Promise<InboundMessage>;

  /**
   * Consume the next inbound message with timeout.
   */
  consumeInboundWithTimeout(timeoutMs: number): Promise<InboundMessage | null>;

  /**
   * Publish a response from the agent to channels.
   */
  publishOutbound(msg: OutboundMessage): Promise<void>;

  /**
   * Consume the next outbound message (blocks until available).
   */
  consumeOutbound(): Promise<OutboundMessage>;

  /**
   * Consume the next outbound message with timeout.
   */
  consumeOutboundWithTimeout(timeoutMs: number): Promise<OutboundMessage | null>;

  /**
   * Subscribe to outbound messages for a specific channel.
   */
  subscribeOutbound(channel: string, callback: OutboundCallback): void;

  /**
   * Dispatch outbound messages to subscribed channels.
   */
  dispatchOutbound(): Promise<void>;

  /**
   * Stop the dispatcher loop.
   */
  stop(): void;

  /**
   * Number of pending inbound messages.
   */
  readonly inboundSize: number;

  /**
   * Number of pending outbound messages.
   */
  readonly outboundSize: number;
}
