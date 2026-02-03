/**
 * Configuration types (pure TypeScript, no Zod).
 */

export interface FeishuConfig {
  enabled: boolean;
  appId: string;
  appSecret: string;
  encryptKey?: string;
  verificationToken?: string;
  allowFrom: string[];
}

export interface TelegramConfig {
  enabled: boolean;
  token: string;
  allowFrom: string[];
}

export interface ChannelsConfig {
  telegram: TelegramConfig;
  feishu: FeishuConfig;
}

export interface AgentDefaults {
  workspace: string;
  model: string;
  maxTokens: number;
  temperature: number;
  maxToolIterations: number;
}

export interface AgentsConfig {
  defaults: AgentDefaults;
}

export interface ProviderConfig {
  apiKey: string;
  apiBase?: string;
}

export interface BedrockConfig {
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
}

export interface ProvidersConfig {
  anthropic: ProviderConfig;
  openai: ProviderConfig;
  openrouter: ProviderConfig;
  groq: ProviderConfig;
  google: ProviderConfig;
  bedrock: BedrockConfig;
}

export interface GatewayConfig {
  host: string;
  port: number;
}

export interface WebSearchConfig {
  apiKey: string;
  maxResults: number;
}

export interface WebToolsConfig {
  search: WebSearchConfig;
}

export interface ToolsConfig {
  web: WebToolsConfig;
}

export interface Config {
  agents: AgentsConfig;
  channels: ChannelsConfig;
  providers: ProvidersConfig;
  gateway: GatewayConfig;
  tools: ToolsConfig;
}
