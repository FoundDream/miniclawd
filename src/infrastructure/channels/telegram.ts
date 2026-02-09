/**
 * Telegram channel implementation using grammy.
 */

import { Bot, Context } from "grammy";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import type { OutboundMessage } from "../../core/types/message.js";
import type { TelegramConfig } from "../../core/types/config.js";
import { MessageBus } from "../queue/message-bus.js";
import { BaseChannel } from "./base.js";
import logger from "../../utils/logger.js";

/**
 * Convert markdown to Telegram-safe HTML.
 */
function markdownToTelegramHtml(text: string): string {
  if (!text) return "";

  // 1. Extract and protect code blocks
  const codeBlocks: string[] = [];
  const saveCodeBlock = (_: string, code: string) => {
    codeBlocks.push(code);
    return `\x00CB${codeBlocks.length - 1}\x00`;
  };
  text = text.replace(/```[\w]*\n?([\s\S]*?)```/g, saveCodeBlock);

  // 2. Extract and protect inline code
  const inlineCodes: string[] = [];
  const saveInlineCode = (_: string, code: string) => {
    inlineCodes.push(code);
    return `\x00IC${inlineCodes.length - 1}\x00`;
  };
  text = text.replace(/`([^`]+)`/g, saveInlineCode);

  // 3. Headers - remove markdown formatting
  text = text.replace(/^#{1,6}\s+(.+)$/gm, "$1");

  // 4. Blockquotes - remove > prefix
  text = text.replace(/^>\s*(.*)$/gm, "$1");

  // 5. Escape HTML special characters
  text = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // 6. Links [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // 7. Bold **text** or __text__
  text = text.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  text = text.replace(/__(.+?)__/g, "<b>$1</b>");

  // 8. Italic _text_ (avoid inside words)
  text = text.replace(/(?<![a-zA-Z0-9])_([^_]+)_(?![a-zA-Z0-9])/g, "<i>$1</i>");

  // 9. Strikethrough ~~text~~
  text = text.replace(/~~(.+?)~~/g, "<s>$1</s>");

  // 10. Bullet lists
  text = text.replace(/^[-*]\s+/gm, "- ");

  // 11. Restore inline code
  for (let i = 0; i < inlineCodes.length; i++) {
    const escaped = inlineCodes[i]
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    text = text.replace(`\x00IC${i}\x00`, `<code>${escaped}</code>`);
  }

  // 12. Restore code blocks
  for (let i = 0; i < codeBlocks.length; i++) {
    const escaped = codeBlocks[i]
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    text = text.replace(`\x00CB${i}\x00`, `<pre><code>${escaped}</code></pre>`);
  }

  return text;
}

/**
 * Telegram channel using grammy (long polling).
 */
export class TelegramChannel extends BaseChannel {
  readonly name = "telegram";
  private bot: Bot | null = null;
  private groqApiKey: string;
  private chatIds: Map<string, number> = new Map();

  constructor(
    config: TelegramConfig,
    bus: MessageBus,
    groqApiKey: string = "",
  ) {
    super(config, bus);
    this.groqApiKey = groqApiKey;
  }

  private get telegramConfig(): TelegramConfig {
    return this.config as TelegramConfig;
  }

  async start(): Promise<void> {
    if (!this.telegramConfig.token) {
      logger.error("Telegram bot token not configured");
      return;
    }

    this._running = true;
    this.bot = new Bot(this.telegramConfig.token);

    // Handle /start command
    this.bot.command("start", async (ctx) => {
      const user = ctx.from;
      if (user) {
        await ctx.reply(
          `Hi ${user.first_name}! I'm miniclawd.\n\nSend me a message and I'll respond!`,
        );
      }
    });

    // Handle text messages
    this.bot.on("message:text", async (ctx) => {
      await this.onMessage(ctx);
    });

    // Handle photos
    this.bot.on("message:photo", async (ctx) => {
      await this.onMessage(ctx);
    });

    // Handle voice messages
    this.bot.on("message:voice", async (ctx) => {
      await this.onMessage(ctx);
    });

    // Handle audio
    this.bot.on("message:audio", async (ctx) => {
      await this.onMessage(ctx);
    });

    // Handle documents
    this.bot.on("message:document", async (ctx) => {
      await this.onMessage(ctx);
    });

    logger.info("Starting Telegram bot (polling mode)...");

    // Get bot info
    const botInfo = await this.bot.api.getMe();
    logger.info({ username: botInfo.username }, "Telegram bot connected");

    // Start polling (non-blocking)
    this.bot.start({
      drop_pending_updates: true,
      onStart: () => {
        logger.info("Telegram polling started");
      },
    });

    // Keep running
    while (this._running) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  async stop(): Promise<void> {
    this._running = false;
    if (this.bot) {
      logger.info("Stopping Telegram bot...");
      await this.bot.stop();
      this.bot = null;
    }
  }

  async send(msg: OutboundMessage): Promise<void> {
    if (!this.bot) {
      logger.warn("Telegram bot not running");
      return;
    }

    try {
      const chatId = parseInt(msg.chatId, 10);
      if (isNaN(chatId)) {
        logger.error({ chatId: msg.chatId }, "Invalid chat_id");
        return;
      }

      // Convert markdown to Telegram HTML
      const htmlContent = markdownToTelegramHtml(msg.content);

      try {
        await this.bot.api.sendMessage(chatId, htmlContent, {
          parse_mode: "HTML",
        });
      } catch (error) {
        // Fallback to plain text if HTML parsing fails
        logger.warn({ error }, "HTML parse failed, falling back to plain text");
        await this.bot.api.sendMessage(chatId, msg.content);
      }
    } catch (error) {
      logger.error({ error }, "Error sending Telegram message");
    }
  }

  private async onMessage(ctx: Context): Promise<void> {
    const message = ctx.message;
    const user = ctx.from;

    if (!message || !user) return;

    const chatId = message.chat.id;

    // Use stable numeric ID, but keep username for allowlist compatibility
    let senderId = String(user.id);
    if (user.username) {
      senderId = `${senderId}|${user.username}`;
    }

    // Store chat_id for replies
    this.chatIds.set(senderId, chatId);

    // Build content from text and/or media
    const contentParts: string[] = [];
    const mediaPaths: string[] = [];

    // Text content
    if (message.text) {
      contentParts.push(message.text);
    }
    if (message.caption) {
      contentParts.push(message.caption);
    }

    // Handle media files
    let mediaFile: { file_id: string; mime_type?: string } | null = null;
    let mediaType: string | null = null;

    if (message.photo && message.photo.length > 0) {
      mediaFile = message.photo[message.photo.length - 1]; // Largest photo
      mediaType = "image";
    } else if (message.voice) {
      mediaFile = message.voice;
      mediaType = "voice";
    } else if (message.audio) {
      mediaFile = message.audio;
      mediaType = "audio";
    } else if (message.document) {
      mediaFile = message.document;
      mediaType = "file";
    }

    // Download media if present
    if (mediaFile && this.bot) {
      try {
        const file = await this.bot.api.getFile(mediaFile.file_id);
        const ext = this.getExtension(mediaType!, mediaFile.mime_type);

        // Save to ~/.miniclawd/media/
        const mediaDir = join(process.env.HOME || "", ".miniclawd", "media");
        if (!existsSync(mediaDir)) {
          mkdirSync(mediaDir, { recursive: true });
        }

        const filePath = join(
          mediaDir,
          `${mediaFile.file_id.slice(0, 16)}${ext}`,
        );

        // Download the file
        const fileUrl = `https://api.telegram.org/file/bot${this.telegramConfig.token}/${file.file_path}`;
        const response = await fetch(fileUrl);
        const buffer = await response.arrayBuffer();
        writeFileSync(filePath, Buffer.from(buffer));

        mediaPaths.push(filePath);

        // Handle voice/audio transcription (if Groq key available)
        if (
          (mediaType === "voice" || mediaType === "audio") &&
          this.groqApiKey
        ) {
          // TODO: Implement transcription with Groq
          contentParts.push(`[${mediaType}: ${filePath}]`);
        } else {
          contentParts.push(`[${mediaType}: ${filePath}]`);
        }

        logger.debug({ mediaType, filePath }, "Downloaded media");
      } catch (error) {
        logger.error({ error }, "Failed to download media");
        contentParts.push(`[${mediaType}: download failed]`);
      }
    }

    const content =
      contentParts.length > 0 ? contentParts.join("\n") : "[empty message]";

    logger.debug(
      { senderId, content: content.slice(0, 50) },
      "Telegram message received",
    );

    // Forward to the message bus
    await this.handleMessage(senderId, String(chatId), content, mediaPaths, {
      messageId: message.message_id,
      userId: user.id,
      username: user.username,
      firstName: user.first_name,
      isGroup: message.chat.type !== "private",
    });
  }

  private getExtension(mediaType: string, mimeType?: string): string {
    if (mimeType) {
      const extMap: Record<string, string> = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/gif": ".gif",
        "audio/ogg": ".ogg",
        "audio/mpeg": ".mp3",
        "audio/mp4": ".m4a",
      };
      if (extMap[mimeType]) {
        return extMap[mimeType];
      }
    }

    const typeMap: Record<string, string> = {
      image: ".jpg",
      voice: ".ogg",
      audio: ".mp3",
      file: "",
    };
    return typeMap[mediaType] || "";
  }
}
