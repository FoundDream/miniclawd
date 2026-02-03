/**
 * Config infrastructure exports.
 */

export {
  ConfigSchema,
  FeishuConfigSchema,
  TelegramConfigSchema,
  ChannelsConfigSchema,
  AgentDefaultsSchema,
  AgentsConfigSchema,
  ProviderConfigSchema,
  BedrockConfigSchema,
  ProvidersConfigSchema,
  GatewayConfigSchema,
  WebSearchConfigSchema,
  WebToolsConfigSchema,
  ToolsConfigSchema,
  getWorkspacePath,
  getApiKey,
  getApiBase,
} from "./schema.js";

export {
  loadConfig,
  saveConfig,
  getConfigPath,
  getDataDir,
  applyEnvOverrides,
} from "./loader.js";
