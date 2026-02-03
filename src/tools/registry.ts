/**
 * Tool registry for dynamic tool management.
 */

import type { CoreTool } from "ai";
import type { Tool } from "./base.js";
import logger from "../utils/logger.js";

/**
 * Registry for agent tools.
 *
 * Allows dynamic registration and execution of tools.
 */
export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  /**
   * Register a tool.
   */
  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Unregister a tool by name.
   */
  unregister(name: string): void {
    this.tools.delete(name);
  }

  /**
   * Get a tool by name.
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool is registered.
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get all tool definitions as CoreTool record for AI SDK.
   */
  getDefinitions(): Record<string, CoreTool> {
    const definitions: Record<string, CoreTool> = {};
    for (const [name, tool] of this.tools) {
      definitions[name] = tool.toCoreTool();
    }
    return definitions;
  }

  /**
   * Get all tool definitions in OpenAI format.
   */
  getOpenAIDefinitions(): Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }> {
    return Array.from(this.tools.values()).map((tool) => tool.toSchema());
  }

  /**
   * Execute a tool by name with given parameters.
   */
  async execute(name: string, params: Record<string, unknown>): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      return `Error: Tool '${name}' not found`;
    }

    try {
      return await tool.execute(params);
    } catch (error) {
      logger.error({ error, tool: name, params }, "Error executing tool");
      return `Error executing ${name}: ${error}`;
    }
  }

  /**
   * Get list of registered tool names.
   */
  get toolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get number of registered tools.
   */
  get size(): number {
    return this.tools.size;
  }
}
