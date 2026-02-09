/**
 * AI SDK provider wrapper for multi-provider support.
 */

import { generateText, type CoreTool, type CoreMessage } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import type { Config } from "../../core/types/config.js";
import type { LLMResponse } from "../../core/types/llm.js";
import type { ToolCallRequest } from "../../core/types/tool.js";
import type { ILLMProvider } from "../../core/interfaces/llm-provider.js";
import logger from "../../utils/logger.js";

/**
 * AI provider options.
 */
export interface AIProviderOptions {
  config: Config;
  defaultModel?: string;
}

/**
 * AI provider that wraps Vercel AI SDK.
 */
export class AIProvider implements ILLMProvider {
  private config: Config;
  private defaultModel: string;

  constructor(options: AIProviderOptions) {
    this.config = options.config;
    this.defaultModel =
      options.defaultModel || options.config.agents.defaults.model;
  }

  /**
   * Send a chat completion request.
   */
  async chat(
    messages: CoreMessage[],
    tools?: Record<string, CoreTool>,
    model?: string,
    maxTokens?: number,
    temperature?: number,
  ): Promise<LLMResponse> {
    const modelId = model || this.defaultModel;
    const resolvedMaxTokens =
      maxTokens || this.config.agents.defaults.maxTokens;
    const resolvedTemperature =
      temperature ?? this.config.agents.defaults.temperature;

    try {
      const provider = this.getProvider(modelId);

      const result = await generateText({
        model: provider,
        messages,
        tools: tools || {},
        maxTokens: resolvedMaxTokens,
        temperature: resolvedTemperature,
      });

      // Parse tool calls
      const toolCalls: ToolCallRequest[] = [];
      for (const step of result.steps) {
        if (step.toolCalls) {
          for (const tc of step.toolCalls) {
            toolCalls.push({
              id: tc.toolCallId,
              name: tc.toolName,
              arguments: tc.args as Record<string, unknown>,
            });
          }
        }
      }

      return {
        content: result.text || null,
        toolCalls,
        finishReason: result.finishReason,
        usage: {
          promptTokens: result.usage?.promptTokens || 0,
          completionTokens: result.usage?.completionTokens || 0,
        },
      };
    } catch (error) {
      logger.error({ error, model: modelId }, "Error calling LLM");
      return {
        content: `Error calling LLM: ${error}`,
        toolCalls: [],
        finishReason: "error",
        usage: { promptTokens: 0, completionTokens: 0 },
      };
    }
  }

  /**
   * Get the appropriate provider based on model ID.
   */
  private getProvider(modelId: string) {
    // Parse model ID (format: provider/model or just model)
    const [providerName, ...modelParts] = modelId.includes("/")
      ? modelId.split("/")
      : ["anthropic", modelId];
    const modelName = modelParts.join("/");

    switch (providerName.toLowerCase()) {
      case "anthropic": {
        const anthropic = createAnthropic({
          apiKey:
            this.config.providers.anthropic.apiKey ||
            process.env.ANTHROPIC_API_KEY,
        });
        return anthropic(modelName || "claude-sonnet-4-20250514");
      }

      case "openai": {
        const openai = createOpenAI({
          apiKey:
            this.config.providers.openai.apiKey || process.env.OPENAI_API_KEY,
        });
        return openai(modelName || "gpt-4o");
      }

      case "openrouter": {
        const openrouter = createOpenAI({
          apiKey:
            this.config.providers.openrouter.apiKey ||
            process.env.OPENROUTER_API_KEY,
          baseURL:
            this.config.providers.openrouter.apiBase ||
            "https://openrouter.ai/api/v1",
        });
        return openrouter(modelName);
      }

      case "google":
      case "gemini": {
        const google = createGoogleGenerativeAI({
          apiKey:
            this.config.providers.google.apiKey || process.env.GOOGLE_API_KEY,
        });
        return google(modelName || "gemini-2.0-flash");
      }

      case "bedrock": {
        const bedrock = createAmazonBedrock({
          region:
            this.config.providers.bedrock.region || process.env.AWS_REGION,
          accessKeyId:
            this.config.providers.bedrock.accessKeyId ||
            process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey:
            this.config.providers.bedrock.secretAccessKey ||
            process.env.AWS_SECRET_ACCESS_KEY,
          sessionToken:
            this.config.providers.bedrock.sessionToken ||
            process.env.AWS_SESSION_TOKEN,
        });
        return bedrock(
          modelName || "anthropic.claude-3-5-sonnet-20241022-v2:0",
        );
      }

      case "groq": {
        const groq = createOpenAI({
          apiKey: this.config.providers.groq.apiKey || process.env.GROQ_API_KEY,
          baseURL: "https://api.groq.com/openai/v1",
        });
        return groq(modelName || "llama-3.3-70b-versatile");
      }

      default: {
        // Default to Anthropic
        const anthropic = createAnthropic({
          apiKey:
            this.config.providers.anthropic.apiKey ||
            process.env.ANTHROPIC_API_KEY,
        });
        return anthropic(modelId);
      }
    }
  }

  /**
   * Get the default model.
   */
  getDefaultModel(): string {
    return this.defaultModel;
  }

  /**
   * Check if response has tool calls.
   */
  static hasToolCalls(response: LLMResponse): boolean {
    return response.toolCalls.length > 0;
  }
}
