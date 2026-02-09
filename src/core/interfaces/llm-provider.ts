/**
 * LLM Provider interface.
 */

import type { CoreMessage, CoreTool } from "ai";
import type { LLMResponse } from "../types/llm.js";

/**
 * Interface for LLM providers.
 */
export interface ILLMProvider {
  /**
   * Send a chat completion request.
   */
  chat(
    messages: CoreMessage[],
    tools?: Record<string, CoreTool>,
    model?: string,
    maxTokens?: number,
    temperature?: number,
  ): Promise<LLMResponse>;

  /**
   * Get the default model.
   */
  getDefaultModel(): string;
}
