/**
 * Event factory functions for the message bus.
 */

import type { InboundMessage, OutboundMessage } from "../../core/types/message.js";

/**
 * Create an inbound message with defaults.
 */
export function createInboundMessage(
  partial: Partial<InboundMessage> & Pick<InboundMessage, "channel" | "senderId" | "chatId" | "content">
): InboundMessage {
  return {
    timestamp: new Date(),
    media: [],
    metadata: {},
    ...partial,
  };
}

/**
 * Create an outbound message with defaults.
 */
export function createOutboundMessage(
  partial: Partial<OutboundMessage> & Pick<OutboundMessage, "channel" | "chatId" | "content">
): OutboundMessage {
  return {
    media: [],
    metadata: {},
    ...partial,
  };
}

/**
 * Get session key from inbound message.
 */
export function getSessionKey(msg: InboundMessage): string {
  return `${msg.channel}:${msg.chatId}`;
}
