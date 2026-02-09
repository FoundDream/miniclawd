/**
 * Channel manager for coordinating chat channels.
 */

import { MessageBus } from "../queue/message-bus.js";
import type { Config } from "../../core/types/config.js";
import { BaseChannel } from "./base.js";
import { TelegramChannel } from "./telegram.js";
import { FeishuChannel } from "./feishu.js";
import logger from "../../utils/logger.js";

/**
 * Manages chat channels and coordinates message routing.
 */
export class ChannelManager {
  private config: Config;
  private bus: MessageBus;
  private channels: Map<string, BaseChannel> = new Map();
  private dispatchTask: Promise<void> | null = null;
  private dispatchRunning = false;

  constructor(config: Config, bus: MessageBus) {
    this.config = config;
    this.bus = bus;
    this.initChannels();
  }

  /**
   * Initialize channels based on config.
   */
  private initChannels(): void {
    // Telegram channel
    if (this.config.channels.telegram.enabled) {
      try {
        const channel = new TelegramChannel(
          this.config.channels.telegram,
          this.bus,
          this.config.providers.groq.apiKey,
        );
        this.channels.set("telegram", channel);
        logger.info("Telegram channel enabled");
      } catch (error) {
        logger.warn({ error }, "Telegram channel not available");
      }
    }

    // Feishu channel
    if (this.config.channels.feishu.enabled) {
      try {
        const channel = new FeishuChannel(
          this.config.channels.feishu,
          this.bus,
        );
        this.channels.set("feishu", channel);
        logger.info("Feishu channel enabled");
      } catch (error) {
        logger.warn({ error }, "Feishu channel not available");
      }
    }
  }

  /**
   * Start all channels and the outbound dispatcher.
   */
  async startAll(): Promise<void> {
    if (this.channels.size === 0) {
      logger.warn("No channels enabled");
      return;
    }

    // Start outbound dispatcher
    this.dispatchRunning = true;
    this.dispatchTask = this.dispatchOutbound();

    // Start all channels concurrently
    const tasks: Promise<void>[] = [];
    for (const [name, channel] of this.channels) {
      logger.info({ channel: name }, "Starting channel...");
      tasks.push(channel.start());
    }

    // Wait for all to complete (they should run forever)
    await Promise.all(tasks);
  }

  /**
   * Stop all channels and the dispatcher.
   */
  async stopAll(): Promise<void> {
    logger.info("Stopping all channels...");

    // Stop dispatcher
    this.dispatchRunning = false;

    // Stop all channels
    for (const [name, channel] of this.channels) {
      try {
        await channel.stop();
        logger.info({ channel: name }, "Stopped channel");
      } catch (error) {
        logger.error({ error, channel: name }, "Error stopping channel");
      }
    }
  }

  /**
   * Dispatch outbound messages to the appropriate channel.
   */
  private async dispatchOutbound(): Promise<void> {
    logger.info("Outbound dispatcher started");

    while (this.dispatchRunning) {
      const msg = await this.bus.consumeOutboundWithTimeout(1000);
      if (!msg) continue;

      const channel = this.channels.get(msg.channel);
      if (channel) {
        try {
          await channel.send(msg);
        } catch (error) {
          logger.error(
            { error, channel: msg.channel },
            "Error sending to channel",
          );
        }
      } else {
        logger.warn({ channel: msg.channel }, "Unknown channel");
      }
    }
  }

  /**
   * Get a channel by name.
   */
  getChannel(name: string): BaseChannel | undefined {
    return this.channels.get(name);
  }

  /**
   * Get status of all channels.
   */
  getStatus(): Record<string, { enabled: boolean; running: boolean }> {
    const status: Record<string, { enabled: boolean; running: boolean }> = {};

    for (const [name, channel] of this.channels) {
      status[name] = {
        enabled: true,
        running: channel.isRunning,
      };
    }

    return status;
  }

  /**
   * Get list of enabled channel names.
   */
  get enabledChannels(): string[] {
    return Array.from(this.channels.keys());
  }
}
