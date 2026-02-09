/**
 * Configuration schema using Zod.
 */

import { z } from "zod";
import type { Config } from "../../core/types/config.js";

export const FeishuConfigSchema = z.object({
  enabled: z.boolean().default(false),
  appId: z.string().default(""),
  appSecret: z.string().default(""),
  encryptKey: z.string().optional(),
  verificationToken: z.string().optional(),
  allowFrom: z.array(z.string()).default([]),
});

export const TelegramConfigSchema = z.object({
  enabled: z.boolean().default(false),
  token: z.string().default(""),
  allowFrom: z.array(z.string()).default([]),
});

export const ChannelsConfigSchema = z.object({
  telegram: TelegramConfigSchema.default({}),
  feishu: FeishuConfigSchema.default({}),
});

export const AgentDefaultsSchema = z.object({
  workspace: z.string().default("~/.miniclawd/workspace"),
  model: z.string().default("anthropic/claude-sonnet-4"),
  maxTokens: z.number().default(8192),
  temperature: z.number().default(0.7),
  maxToolIterations: z.number().default(20),
});

export const AgentsConfigSchema = z.object({
  defaults: AgentDefaultsSchema.default({}),
});

export const ProviderConfigSchema = z.object({
  apiKey: z.string().default(""),
  apiBase: z.string().optional(),
});

export const BedrockConfigSchema = z.object({
  region: z.string().default("us-east-1"),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
  sessionToken: z.string().optional(),
});

export const ProvidersConfigSchema = z.object({
  anthropic: ProviderConfigSchema.default({}),
  openai: ProviderConfigSchema.default({}),
  openrouter: ProviderConfigSchema.default({}),
  groq: ProviderConfigSchema.default({}),
  google: ProviderConfigSchema.default({}),
  bedrock: BedrockConfigSchema.default({}),
});

export const GatewayConfigSchema = z.object({
  host: z.string().default("0.0.0.0"),
  port: z.number().default(18790),
});

export const WebSearchConfigSchema = z.object({
  apiKey: z.string().default(""),
  maxResults: z.number().default(5),
});

export const WebToolsConfigSchema = z.object({
  search: WebSearchConfigSchema.default({}),
});

export const ToolsConfigSchema = z.object({
  web: WebToolsConfigSchema.default({}),
});

export const ConfigSchema = z.object({
  agents: AgentsConfigSchema.default({}),
  channels: ChannelsConfigSchema.default({}),
  providers: ProvidersConfigSchema.default({}),
  gateway: GatewayConfigSchema.default({}),
  tools: ToolsConfigSchema.default({}),
});

/**
 * Get expanded workspace path from config.
 */
export function getWorkspacePath(config: Config): string {
  const workspace = config.agents.defaults.workspace;
  return workspace.replace(/^~/, process.env.HOME || "");
}

/**
 * Get API key in priority order: OpenRouter > Anthropic > OpenAI > Google > Groq.
 */
export function getApiKey(config: Config): string | undefined {
  return (
    config.providers.openrouter.apiKey ||
    config.providers.anthropic.apiKey ||
    config.providers.openai.apiKey ||
    config.providers.google.apiKey ||
    config.providers.groq.apiKey ||
    undefined
  );
}

/**
 * Get API base URL if using OpenRouter.
 */
export function getApiBase(config: Config): string | undefined {
  if (config.providers.openrouter.apiKey) {
    return (
      config.providers.openrouter.apiBase || "https://openrouter.ai/api/v1"
    );
  }
  return undefined;
}
