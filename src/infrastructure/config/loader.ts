/**
 * Configuration loading utilities.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { ConfigSchema } from "./schema.js";
import type { Config } from "../../core/types/config.js";

/**
 * Get the default configuration file path.
 */
export function getConfigPath(): string {
  return join(process.env.HOME || "", ".miniclawd", "config.json");
}

/**
 * Get the miniclawd data directory.
 */
export function getDataDir(): string {
  const dir = join(process.env.HOME || "", ".miniclawd");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Convert camelCase to snake_case.
 */
function camelToSnake(name: string): string {
  return name.replace(/([A-Z])/g, (match, p1, offset) =>
    offset > 0 ? `_${p1.toLowerCase()}` : p1.toLowerCase(),
  );
}

/**
 * Convert snake_case to camelCase.
 */
function snakeToCamel(name: string): string {
  return name.replace(/_([a-z])/g, (_, p1) => p1.toUpperCase());
}

/**
 * Recursively convert object keys from camelCase to snake_case.
 */
function convertToCamel(data: unknown): unknown {
  if (Array.isArray(data)) {
    return data.map(convertToCamel);
  }
  if (data !== null && typeof data === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      result[snakeToCamel(key)] = convertToCamel(value);
    }
    return result;
  }
  return data;
}

/**
 * Recursively convert object keys from snake_case to camelCase.
 */
function convertToSnake(data: unknown): unknown {
  if (Array.isArray(data)) {
    return data.map(convertToSnake);
  }
  if (data !== null && typeof data === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      result[camelToSnake(key)] = convertToSnake(value);
    }
    return result;
  }
  return data;
}

/**
 * Load configuration from file or create default.
 */
export function loadConfig(configPath?: string): Config {
  const path = configPath || getConfigPath();

  if (existsSync(path)) {
    try {
      const content = readFileSync(path, "utf-8");
      const data = JSON.parse(content);
      const camelData = convertToCamel(data);
      return ConfigSchema.parse(camelData);
    } catch (error) {
      console.warn(`Warning: Failed to load config from ${path}: ${error}`);
      console.warn("Using default configuration.");
    }
  }

  return ConfigSchema.parse({});
}

/**
 * Save configuration to file.
 */
export function saveConfig(config: Config, configPath?: string): void {
  const path = configPath || getConfigPath();
  const dir = join(path, "..");

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Convert to snake_case for storage
  const snakeData = convertToSnake(config);
  writeFileSync(path, JSON.stringify(snakeData, null, 2));
}

/**
 * Apply environment variable overrides.
 * Environment variables are prefixed with MINICLAWD_ and use double underscore for nesting.
 * Example: MINICLAWD_PROVIDERS__ANTHROPIC__API_KEY
 */
export function applyEnvOverrides(config: Config): Config {
  const prefix = "MINICLAWD_";

  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith(prefix) && value) {
      const path = key
        .slice(prefix.length)
        .toLowerCase()
        .split("__")
        .map(snakeToCamel);

      setNestedValue(config as unknown as Record<string, unknown>, path, value);
    }
  }

  return config;
}

/**
 * Set a nested value in an object using a path array.
 */
function setNestedValue(
  obj: Record<string, unknown>,
  path: string[],
  value: string,
): void {
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (typeof current[key] !== "object" || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  const lastKey = path[path.length - 1];
  // Try to parse as number or boolean
  if (value === "true") {
    current[lastKey] = true;
  } else if (value === "false") {
    current[lastKey] = false;
  } else if (/^\d+$/.test(value)) {
    current[lastKey] = parseInt(value, 10);
  } else if (/^\d+\.\d+$/.test(value)) {
    current[lastKey] = parseFloat(value);
  } else {
    current[lastKey] = value;
  }
}
