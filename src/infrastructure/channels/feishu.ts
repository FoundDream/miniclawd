/**
 * Feishu (Lark) channel implementation.
 */

import * as lark from "@larksuiteoapi/node-sdk";
import type { OutboundMessage } from "../../core/types/message.js";
import type { FeishuConfig } from "../../core/types/config.js";
import { MessageBus } from "../queue/message-bus.js";
import { BaseChannel } from "./base.js";
import logger from "../../utils/logger.js";

/**
 * Feishu channel using @larksuiteoapi/node-sdk.
 */
export class FeishuChannel extends BaseChannel {
  readonly name = "feishu";
  private client: lark.Client | null = null;
  private wsClient: lark.WSClient | null = null;

  constructor(config: FeishuConfig, bus: MessageBus) {
    super(config, bus);
  }

  private get feishuConfig(): FeishuConfig {
    return this.config as FeishuConfig;
  }

  async start(): Promise<void> {
    if (!this.feishuConfig.appId || !this.feishuConfig.appSecret) {
      logger.error("Feishu app ID and secret not configured");
      return;
    }

    this._running = true;

    // Create Lark client
    this.client = new lark.Client({
      appId: this.feishuConfig.appId,
      appSecret: this.feishuConfig.appSecret,
      disableTokenCache: false,
    });

    // Create WebSocket client for event subscription
    this.wsClient = new lark.WSClient({
      appId: this.feishuConfig.appId,
      appSecret: this.feishuConfig.appSecret,
      loggerLevel: lark.LoggerLevel.error,
    });

    // Handle message events
    const eventDispatcher = new lark.EventDispatcher({
      encryptKey: this.feishuConfig.encryptKey,
      verificationToken: this.feishuConfig.verificationToken,
    });

    eventDispatcher.register({
      "im.message.receive_v1": async (data: any) => {
        await this.onMessage(data);
      },
    });

    logger.info("Starting Feishu bot (WebSocket mode)...");

    try {
      // Start WebSocket connection
      await this.wsClient.start({
        eventDispatcher,
      });
      logger.info("Feishu bot connected");
    } catch (error) {
      logger.error({ error }, "Failed to start Feishu WebSocket");
      this._running = false;
      return;
    }

    // Keep running
    while (this._running) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  async stop(): Promise<void> {
    this._running = false;
    logger.info("Stopping Feishu bot...");

    // Note: The lark SDK doesn't have a clean shutdown method for WSClient
    this.wsClient = null;
    this.client = null;
  }

  async send(msg: OutboundMessage): Promise<void> {
    if (!this.client) {
      logger.warn("Feishu client not running");
      return;
    }

    try {
      // Determine if it's a chat_id or open_id
      const receiveIdType = msg.chatId.startsWith("oc_")
        ? "chat_id"
        : "open_id";

      await this.client.im.message.create({
        params: {
          receive_id_type: receiveIdType,
        },
        data: {
          receive_id: msg.chatId,
          msg_type: "text",
          content: JSON.stringify({ text: msg.content }),
        },
      });
    } catch (error) {
      logger.error({ error }, "Error sending Feishu message");
    }
  }

  private async onMessage(data: any): Promise<void> {
    try {
      const event = data;
      const message = event.message;
      const sender = event.sender;

      if (!message || !sender) return;

      // Skip bot's own messages
      if (sender.sender_type === "app") return;

      const senderId =
        sender.sender_id?.open_id || sender.sender_id?.user_id || "unknown";
      const chatId = message.chat_id || senderId;

      // Check if sender is allowed
      if (!this.isAllowed(senderId)) {
        logger.debug({ senderId }, "Feishu message from unauthorized sender");
        return;
      }

      // Parse message content
      let content = "";
      const contentParts: string[] = [];
      const mediaPaths: string[] = [];

      if (message.message_type === "text") {
        try {
          const textContent = JSON.parse(message.content);
          content = textContent.text || "";
        } catch {
          content = message.content || "";
        }
      } else if (message.message_type === "image") {
        contentParts.push("[image]");
        // TODO: Download and process image
      } else if (message.message_type === "file") {
        contentParts.push("[file]");
        // TODO: Download and process file
      } else if (message.message_type === "audio") {
        contentParts.push("[audio]");
        // TODO: Download and process audio
      } else {
        content = `[Unsupported message type: ${message.message_type}]`;
      }

      if (contentParts.length > 0) {
        content = contentParts.join("\n") + (content ? "\n" + content : "");
      }

      if (!content) {
        content = "[empty message]";
      }

      logger.debug(
        { senderId, content: content.slice(0, 50) },
        "Feishu message received",
      );

      // Forward to the message bus
      await this.handleMessage(senderId, chatId, content, mediaPaths, {
        messageId: message.message_id,
        chatType: message.chat_type,
        messageType: message.message_type,
      });
    } catch (error) {
      logger.error({ error }, "Error processing Feishu message");
    }
  }
}
