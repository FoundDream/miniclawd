/**
 * Spawn tool for creating background subagents.
 */

import { z } from "zod";
import { Tool } from "./base.js";

/**
 * Interface for subagent manager.
 */
export interface ISubagentManager {
  spawn(options: {
    task: string;
    label?: string;
    originChannel: string;
    originChatId: string;
  }): Promise<string>;
}

/**
 * Tool to spawn a subagent for background task execution.
 *
 * The subagent runs asynchronously and announces its result back
 * to the main agent when complete.
 */
export class SpawnTool extends Tool {
  readonly name = "spawn";
  readonly description =
    "Spawn a subagent to handle a task in the background. " +
    "Use this for complex or time-consuming tasks that can run independently. " +
    "The subagent will complete the task and report back when done.";
  readonly parameters = z.object({
    task: z.string().describe("The task for the subagent to complete"),
    label: z
      .string()
      .optional()
      .describe("Optional short label for the task (for display)"),
  });

  private manager: ISubagentManager;
  private originChannel: string = "cli";
  private originChatId: string = "direct";

  constructor(manager: ISubagentManager) {
    super();
    this.manager = manager;
  }

  /**
   * Set the origin context for subagent announcements.
   */
  setContext(channel: string, chatId: string): void {
    this.originChannel = channel;
    this.originChatId = chatId;
  }

  async execute(params: { task: string; label?: string }): Promise<string> {
    return this.manager.spawn({
      task: params.task,
      label: params.label,
      originChannel: this.originChannel,
      originChatId: this.originChatId,
    });
  }
}
