/**
 * Subagent manager for background task execution.
 */

import { randomUUID } from "crypto";
import type { CoreMessage } from "ai";
import { AIProvider } from "../infrastructure/llm/ai-sdk-provider.js";
import { ToolRegistry } from "../tools/registry.js";
import { ReadFileTool, WriteFileTool, ListDirTool } from "../tools/fs.js";
import { ExecTool } from "../tools/exec.js";
import { WebSearchTool, WebFetchTool } from "../tools/web.js";
import { MessageBus } from "../infrastructure/queue/message-bus.js";
import { createInboundMessage } from "../infrastructure/queue/events.js";
import type { Config } from "../core/types/config.js";
import type { ISubagentManager } from "../tools/spawn.js";
import logger from "../utils/logger.js";

export interface SpawnOptions {
  task: string;
  label?: string;
  originChannel?: string;
  originChatId?: string;
}

/**
 * Manages background subagent execution.
 *
 * Subagents are lightweight agent instances that run in the background
 * to handle specific tasks. They share the same LLM provider but have
 * isolated context and a focused system prompt.
 */
export class SubagentManager implements ISubagentManager {
  private provider: AIProvider;
  private workspace: string;
  private bus: MessageBus;
  private model: string;
  private braveApiKey: string | undefined;
  private runningTasks: Map<string, AbortController> = new Map();

  constructor(options: {
    config: Config;
    bus: MessageBus;
    workspace: string;
    model?: string;
    braveApiKey?: string;
  }) {
    this.provider = new AIProvider({
      config: options.config,
      defaultModel: options.model,
    });
    this.workspace = options.workspace;
    this.bus = options.bus;
    this.model = options.model || options.config.agents.defaults.model;
    this.braveApiKey = options.braveApiKey;
  }

  /**
   * Spawn a subagent to execute a task in the background.
   */
  async spawn(options: SpawnOptions): Promise<string> {
    const taskId = randomUUID().slice(0, 8);
    const displayLabel =
      options.label ||
      options.task.slice(0, 30) + (options.task.length > 30 ? "..." : "");

    const origin = {
      channel: options.originChannel || "cli",
      chatId: options.originChatId || "direct",
    };

    const abortController = new AbortController();
    this.runningTasks.set(taskId, abortController);

    // Run in background
    this.runSubagent(taskId, options.task, displayLabel, origin)
      .catch((error) => {
        logger.error({ error, taskId }, "Subagent failed");
      })
      .finally(() => {
        this.runningTasks.delete(taskId);
      });

    logger.info({ taskId, label: displayLabel }, "Spawned subagent");
    return `Subagent [${displayLabel}] started (id: ${taskId}). I'll notify you when it completes.`;
  }

  /**
   * Execute the subagent task and announce the result.
   */
  private async runSubagent(
    taskId: string,
    task: string,
    label: string,
    origin: { channel: string; chatId: string },
  ): Promise<void> {
    logger.info({ taskId, label }, "Subagent starting task");

    try {
      // Build subagent tools (no message tool, no spawn tool)
      const tools = new ToolRegistry();
      tools.register(new ReadFileTool());
      tools.register(new WriteFileTool());
      tools.register(new ListDirTool());
      tools.register(new ExecTool({ workingDir: this.workspace }));
      tools.register(new WebSearchTool({ apiKey: this.braveApiKey }));
      tools.register(new WebFetchTool());

      // Build messages with subagent-specific prompt
      const systemPrompt = this.buildSubagentPrompt(task);
      const messages: CoreMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: task },
      ];

      // Run agent loop (limited iterations)
      const maxIterations = 15;
      let iteration = 0;
      let finalResult: string | null = null;

      while (iteration < maxIterations) {
        iteration++;

        const response = await this.provider.chat(
          messages,
          tools.getDefinitions(),
          this.model,
        );

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
              { taskId, tool: toolCall.name },
              "Subagent executing tool",
            );
            const result = await tools.execute(
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
          finalResult = response.content;
          break;
        }
      }

      if (finalResult === null) {
        finalResult = "Task completed but no final response was generated.";
      }

      logger.info({ taskId }, "Subagent completed successfully");
      await this.announceResult(taskId, label, task, finalResult, origin, "ok");
    } catch (error) {
      const errorMsg = `Error: ${error}`;
      logger.error({ taskId, error }, "Subagent failed");
      await this.announceResult(taskId, label, task, errorMsg, origin, "error");
    }
  }

  /**
   * Announce the subagent result to the main agent via the message bus.
   */
  private async announceResult(
    taskId: string,
    label: string,
    task: string,
    result: string,
    origin: { channel: string; chatId: string },
    status: "ok" | "error",
  ): Promise<void> {
    const statusText = status === "ok" ? "completed successfully" : "failed";

    const announceContent = `[Subagent '${label}' ${statusText}]

Task: ${task}

Result:
${result}

Summarize this naturally for the user. Keep it brief (1-2 sentences). Do not mention technical details like "subagent" or task IDs.`;

    // Inject as system message to trigger main agent
    const msg = createInboundMessage({
      channel: "system",
      senderId: "subagent",
      chatId: `${origin.channel}:${origin.chatId}`,
      content: announceContent,
    });

    await this.bus.publishInbound(msg);
    logger.debug({ taskId, origin }, "Subagent announced result");
  }

  /**
   * Build a focused system prompt for the subagent.
   */
  private buildSubagentPrompt(task: string): string {
    return `# Subagent

You are a subagent spawned by the main agent to complete a specific task.

## Your Task
${task}

## Rules
1. Stay focused - complete only the assigned task, nothing else
2. Your final response will be reported back to the main agent
3. Do not initiate conversations or take on side tasks
4. Be concise but informative in your findings

## What You Can Do
- Read and write files in the workspace
- Execute shell commands
- Search the web and fetch web pages
- Complete the task thoroughly

## What You Cannot Do
- Send messages directly to users (no message tool available)
- Spawn other subagents
- Access the main agent's conversation history

## Workspace
Your workspace is at: ${this.workspace}

When you have completed the task, provide a clear summary of your findings or actions.`;
  }

  /**
   * Return the number of currently running subagents.
   */
  getRunningCount(): number {
    return this.runningTasks.size;
  }
}
