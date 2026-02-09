/**
 * Agent loop: the core processing engine.
 */

import type { CoreMessage } from "ai";
import { MessageBus } from "../infrastructure/queue/message-bus.js";
import type { InboundMessage, OutboundMessage } from "../core/types/message.js";
import {
  createOutboundMessage,
  getSessionKey,
} from "../infrastructure/queue/events.js";
import { AIProvider } from "../infrastructure/llm/ai-sdk-provider.js";
import { ContextBuilder } from "./context-builder.js";
import { ToolRegistry } from "../tools/registry.js";
import {
  ReadFileTool,
  WriteFileTool,
  EditFileTool,
  ListDirTool,
} from "../tools/fs.js";
import { ExecTool } from "../tools/exec.js";
import { WebSearchTool, WebFetchTool } from "../tools/web.js";
import { MessageTool } from "../tools/message.js";
import { SpawnTool } from "../tools/spawn.js";
import { SubagentManager } from "./subagent.js";
import {
  SessionManager,
  addMessage,
  getHistory,
} from "../infrastructure/storage/session-store.js";
import type { Config } from "../core/types/config.js";
import { getWorkspacePath } from "../infrastructure/config/schema.js";
import logger from "../utils/logger.js";

/**
 * The agent loop is the core processing engine.
 *
 * It:
 * 1. Receives messages from the bus
 * 2. Builds context with history, memory, skills
 * 3. Calls the LLM
 * 4. Executes tool calls
 * 5. Sends responses back
 */
export class AgentLoop {
  private bus: MessageBus;
  private provider: AIProvider;
  private workspace: string;
  private model: string;
  private maxIterations: number;
  private braveApiKey: string | undefined;

  private context: ContextBuilder;
  private sessions: SessionManager;
  private tools: ToolRegistry;
  private subagents: SubagentManager;

  private _running = false;

  constructor(options: {
    bus: MessageBus;
    config: Config;
    model?: string;
    maxIterations?: number;
    braveApiKey?: string;
  }) {
    this.bus = options.bus;
    this.provider = new AIProvider({
      config: options.config,
      defaultModel: options.model,
    });
    this.workspace = getWorkspacePath(options.config);
    this.model = options.model || options.config.agents.defaults.model;
    this.maxIterations =
      options.maxIterations || options.config.agents.defaults.maxToolIterations;
    this.braveApiKey =
      options.braveApiKey ||
      options.config.tools.web.search.apiKey ||
      undefined;

    this.context = new ContextBuilder(this.workspace);
    this.sessions = new SessionManager(this.workspace);
    this.tools = new ToolRegistry();
    this.subagents = new SubagentManager({
      config: options.config,
      bus: this.bus,
      workspace: this.workspace,
      model: this.model,
      braveApiKey: this.braveApiKey,
    });

    this.registerDefaultTools();
  }

  /**
   * Register the default set of tools.
   */
  private registerDefaultTools(): void {
    // File tools
    this.tools.register(new ReadFileTool());
    this.tools.register(new WriteFileTool());
    this.tools.register(new EditFileTool());
    this.tools.register(new ListDirTool());

    // Shell tool
    this.tools.register(new ExecTool({ workingDir: this.workspace }));

    // Web tools
    this.tools.register(new WebSearchTool({ apiKey: this.braveApiKey }));
    this.tools.register(new WebFetchTool());

    // Message tool
    const messageTool = new MessageTool({
      sendCallback: (msg) => this.bus.publishOutbound(msg),
    });
    this.tools.register(messageTool);

    // Spawn tool (for subagents)
    const spawnTool = new SpawnTool(this.subagents);
    this.tools.register(spawnTool);
  }

  /**
   * Run the agent loop, processing messages from the bus.
   */
  async run(): Promise<void> {
    this._running = true;
    logger.info("Agent loop started");

    while (this._running) {
      // Wait for next message with timeout
      const msg = await this.bus.consumeInboundWithTimeout(1000);
      if (!msg) continue;

      // Process it
      try {
        const response = await this.processMessage(msg);
        if (response) {
          await this.bus.publishOutbound(response);
        }
      } catch (error) {
        logger.error({ error }, "Error processing message");
        // Send error response
        await this.bus.publishOutbound(
          createOutboundMessage({
            channel: msg.channel,
            chatId: msg.chatId,
            content: `Sorry, I encountered an error: ${error}`,
          }),
        );
      }
    }
  }

  /**
   * Stop the agent loop.
   */
  stop(): void {
    this._running = false;
    logger.info("Agent loop stopping");
  }

  /**
   * Process a single inbound message.
   */
  async processMessage(msg: InboundMessage): Promise<OutboundMessage | null> {
    // Handle system messages (subagent announces)
    if (msg.channel === "system") {
      return this.processSystemMessage(msg);
    }

    logger.info(
      { channel: msg.channel, sender: msg.senderId },
      "Processing message",
    );

    // Get or create session
    const sessionKey = getSessionKey(msg);
    const session = this.sessions.getOrCreate(sessionKey);

    // Update tool contexts
    const messageTool = this.tools.get("message") as MessageTool | undefined;
    if (messageTool) {
      messageTool.setContext(msg.channel, msg.chatId);
    }

    const spawnTool = this.tools.get("spawn") as SpawnTool | undefined;
    if (spawnTool) {
      spawnTool.setContext(msg.channel, msg.chatId);
    }

    // Build initial messages
    const history = getHistory(session);
    const messages = await this.context.buildMessages(
      history,
      msg.content,
      undefined,
      msg.media,
    );

    // Agent loop
    let iteration = 0;
    let finalContent: string | null = null;

    while (iteration < this.maxIterations) {
      iteration++;

      // Call LLM
      const response = await this.provider.chat(
        messages,
        this.tools.getDefinitions(),
        this.model,
      );

      // Handle tool calls
      if (AIProvider.hasToolCalls(response)) {
        // Add assistant message with tool calls
        const toolCallParts = response.toolCalls.map((tc) => ({
          type: "tool-call" as const,
          toolCallId: tc.id,
          toolName: tc.name,
          args: tc.arguments,
        }));

        messages.push({
          role: "assistant",
          content: [
            ...(response.content
              ? [{ type: "text" as const, text: response.content }]
              : []),
            ...toolCallParts,
          ],
        });

        // Execute tools
        for (const toolCall of response.toolCalls) {
          logger.debug(
            { tool: toolCall.name, args: toolCall.arguments },
            "Executing tool",
          );
          const result = await this.tools.execute(
            toolCall.name,
            toolCall.arguments,
          );

          messages.push({
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId: toolCall.id,
                toolName: toolCall.name,
                result,
              },
            ],
          } as CoreMessage);
        }
      } else {
        // No tool calls, we're done
        finalContent = response.content;
        break;
      }
    }

    if (finalContent === null) {
      finalContent = "I've completed processing but have no response to give.";
    }

    // Save to session
    addMessage(session, "user", msg.content);
    addMessage(session, "assistant", finalContent);
    this.sessions.save(session);

    return createOutboundMessage({
      channel: msg.channel,
      chatId: msg.chatId,
      content: finalContent,
    });
  }

  /**
   * Process a system message (e.g., subagent announce).
   */
  private async processSystemMessage(
    msg: InboundMessage,
  ): Promise<OutboundMessage | null> {
    logger.info({ sender: msg.senderId }, "Processing system message");

    // Parse origin from chat_id (format: "channel:chat_id")
    let originChannel = "cli";
    let originChatId = msg.chatId;

    if (msg.chatId.includes(":")) {
      const parts = msg.chatId.split(":", 2);
      originChannel = parts[0];
      originChatId = parts[1];
    }

    // Use the origin session for context
    const sessionKey = `${originChannel}:${originChatId}`;
    const session = this.sessions.getOrCreate(sessionKey);

    // Update tool contexts
    const messageTool = this.tools.get("message") as MessageTool | undefined;
    if (messageTool) {
      messageTool.setContext(originChannel, originChatId);
    }

    const spawnTool = this.tools.get("spawn") as SpawnTool | undefined;
    if (spawnTool) {
      spawnTool.setContext(originChannel, originChatId);
    }

    // Build messages with the announce content
    const history = getHistory(session);
    const messages = await this.context.buildMessages(history, msg.content);

    // Agent loop (limited for announce handling)
    let iteration = 0;
    let finalContent: string | null = null;

    while (iteration < this.maxIterations) {
      iteration++;

      const response = await this.provider.chat(
        messages,
        this.tools.getDefinitions(),
        this.model,
      );

      if (AIProvider.hasToolCalls(response)) {
        const toolCallParts = response.toolCalls.map((tc) => ({
          type: "tool-call" as const,
          toolCallId: tc.id,
          toolName: tc.name,
          args: tc.arguments,
        }));

        messages.push({
          role: "assistant",
          content: [
            ...(response.content
              ? [{ type: "text" as const, text: response.content }]
              : []),
            ...toolCallParts,
          ],
        });

        for (const toolCall of response.toolCalls) {
          logger.debug({ tool: toolCall.name }, "Executing tool");
          const result = await this.tools.execute(
            toolCall.name,
            toolCall.arguments,
          );

          messages.push({
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId: toolCall.id,
                toolName: toolCall.name,
                result,
              },
            ],
          } as CoreMessage);
        }
      } else {
        finalContent = response.content;
        break;
      }
    }

    if (finalContent === null) {
      finalContent = "Background task completed.";
    }

    // Save to session (mark as system message in history)
    addMessage(session, "user", `[System: ${msg.senderId}] ${msg.content}`);
    addMessage(session, "assistant", finalContent);
    this.sessions.save(session);

    return createOutboundMessage({
      channel: originChannel,
      chatId: originChatId,
      content: finalContent,
    });
  }

  /**
   * Process a message directly (for CLI usage).
   */
  async processDirect(
    content: string,
    sessionKey: string = "cli:direct",
  ): Promise<string> {
    const msg: InboundMessage = {
      channel: "cli",
      senderId: "user",
      chatId: "direct",
      content,
      timestamp: new Date(),
      media: [],
      metadata: {},
    };

    const response = await this.processMessage(msg);
    return response?.content || "";
  }
}
