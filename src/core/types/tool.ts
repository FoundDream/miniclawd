/**
 * Tool types and interfaces.
 */

import type { z } from "zod";

/**
 * Tool call request from the LLM.
 */
export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Tool definition interface.
 */
export interface ITool {
  /** Tool name used in function calls */
  readonly name: string;
  /** Description of what the tool does */
  readonly description: string;
  /** Zod schema for tool parameters */
  readonly parameters: z.ZodObject<z.ZodRawShape>;
  /** Execute the tool with given parameters */
  execute(params: Record<string, unknown>): Promise<string>;
}

/**
 * Tool execution result.
 */
export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}
