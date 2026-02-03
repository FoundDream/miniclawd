/**
 * Base class for agent tools.
 */

import { z } from "zod";
import type { CoreTool } from "ai";
import type { ITool } from "../core/types/tool.js";

/**
 * Abstract base class for agent tools.
 *
 * Tools are capabilities that the agent can use to interact with
 * the environment, such as reading files, executing commands, etc.
 */
export abstract class Tool implements ITool {
  /**
   * Tool name used in function calls.
   */
  abstract readonly name: string;

  /**
   * Description of what the tool does.
   */
  abstract readonly description: string;

  /**
   * Zod schema for tool parameters.
   */
  abstract readonly parameters: z.ZodObject<z.ZodRawShape>;

  /**
   * Execute the tool with given parameters.
   */
  abstract execute(params: Record<string, unknown>): Promise<string>;

  /**
   * Convert tool to Vercel AI SDK CoreTool format.
   */
  toCoreTool(): CoreTool {
    return {
      description: this.description,
      parameters: this.parameters,
      execute: async (params) => {
        return this.execute(params);
      },
    };
  }

  /**
   * Convert tool to OpenAI function schema format.
   */
  toSchema(): {
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  } {
    return {
      type: "function",
      function: {
        name: this.name,
        description: this.description,
        parameters: zodToJsonSchema(this.parameters),
      },
    };
  }
}

/**
 * Convert a Zod schema to JSON Schema format.
 */
function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const result: Record<string, unknown> = {
    type: "object",
    properties: {},
    required: [] as string[],
  };

  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const zodValue = value as z.ZodTypeAny;
      properties[key] = zodFieldToJsonSchema(zodValue);

      // Check if the field is required (not optional)
      if (!(zodValue instanceof z.ZodOptional)) {
        required.push(key);
      }
    }

    result.properties = properties;
    result.required = required;
  }

  return result;
}

/**
 * Convert a Zod field to JSON Schema format.
 */
function zodFieldToJsonSchema(field: z.ZodTypeAny): Record<string, unknown> {
  // Handle optional
  if (field instanceof z.ZodOptional) {
    return zodFieldToJsonSchema(field.unwrap());
  }

  // Handle default
  if (field instanceof z.ZodDefault) {
    const inner = zodFieldToJsonSchema(field._def.innerType);
    inner.default = field._def.defaultValue();
    return inner;
  }

  // Handle string
  if (field instanceof z.ZodString) {
    const result: Record<string, unknown> = { type: "string" };
    if (field.description) {
      result.description = field.description;
    }
    return result;
  }

  // Handle number
  if (field instanceof z.ZodNumber) {
    const result: Record<string, unknown> = { type: "number" };
    if (field.description) {
      result.description = field.description;
    }
    return result;
  }

  // Handle boolean
  if (field instanceof z.ZodBoolean) {
    const result: Record<string, unknown> = { type: "boolean" };
    if (field.description) {
      result.description = field.description;
    }
    return result;
  }

  // Handle enum
  if (field instanceof z.ZodEnum) {
    return {
      type: "string",
      enum: field._def.values,
    };
  }

  // Handle array
  if (field instanceof z.ZodArray) {
    return {
      type: "array",
      items: zodFieldToJsonSchema(field.element),
    };
  }

  // Default
  return { type: "string" };
}
