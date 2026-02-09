/**
 * Message tool for sending messages to users.
 */

import { z } from "zod";
import { Tool } from "./base.js";
import type { OutboundMessage } from "../core/types/message.js";

type SendCallback = (msg: OutboundMessage) => Promise<void>;

/**
 * Create an outbound message with defaults.
 */
function createOutboundMessage(
  partial: Partial<OutboundMessage> &
    Pick<OutboundMessage, "channel" | "chatId" | "content">,
): OutboundMessage {
  return {
    media: [],
    metadata: {},
    ...partial,
  };
}

/**
 * Tool to send messages to users on chat channels.
 */
export class MessageTool extends Tool {
  readonly name = "message";
  readonly description =
    "Send a message to the user. Use this when you want to communicate something.";
  readonly parameters = z.object({
    content: z.string().describe("The message content to send"),
    channel: z
      .string()
      .optional()
      .describe("Optional: target channel (telegram, feishu, etc.)"),
    chat_id: z.string().optional().describe("Optional: target chat/user ID"),
  });

  private sendCallback: SendCallback | null = null;
  private defaultChannel: string = "";
  private defaultChatId: string = "";

  constructor(options?: {
    sendCallback?: SendCallback;
    defaultChannel?: string;
    defaultChatId?: string;
  }) {
    super();
    this.sendCallback = options?.sendCallback || null;
    this.defaultChannel = options?.defaultChannel || "";
    this.defaultChatId = options?.defaultChatId || "";
  }

  /**
   * Set the current message context.
   */
  setContext(channel: string, chatId: string): void {
    this.defaultChannel = channel;
    this.defaultChatId = chatId;
  }

  /**
   * Set the callback for sending messages.
   */
  setSendCallback(callback: SendCallback): void {
    this.sendCallback = callback;
  }

  async execute(params: {
    content: string;
    channel?: string;
    chat_id?: string;
  }): Promise<string> {
    const channel = params.channel || this.defaultChannel;
    const chatId = params.chat_id || this.defaultChatId;

    if (!channel || !chatId) {
      return "Error: No target channel/chat specified";
    }

    if (!this.sendCallback) {
      return "Error: Message sending not configured";
    }

    const msg = createOutboundMessage({
      channel,
      chatId,
      content: params.content,
    });

    try {
      await this.sendCallback(msg);
      return `Message sent to ${channel}:${chatId}`;
    } catch (error) {
      return `Error sending message: ${error}`;
    }
  }
}
