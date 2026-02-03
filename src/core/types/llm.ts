/**
 * LLM-related types.
 */

import type { ToolCallRequest } from "./tool.js";

/**
 * LLM response structure.
 */
export interface LLMResponse {
  content: string | null;
  toolCalls: ToolCallRequest[];
  finishReason: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
}
