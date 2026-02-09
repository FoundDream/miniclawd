/**
 * File system tools: read, write, edit, list directory.
 */

import { z } from "zod";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "fs";
import { dirname, join } from "path";
import { Tool } from "./base.js";
import { expandUser } from "../utils/paths.js";

/**
 * Tool to read file contents.
 */
export class ReadFileTool extends Tool {
  readonly name = "read_file";
  readonly description = "Read the contents of a file at the given path.";
  readonly parameters = z.object({
    path: z.string().describe("The file path to read"),
  });

  async execute(params: { path: string }): Promise<string> {
    try {
      const filePath = expandUser(params.path);

      if (!existsSync(filePath)) {
        return `Error: File not found: ${params.path}`;
      }

      const stats = statSync(filePath);
      if (!stats.isFile()) {
        return `Error: Not a file: ${params.path}`;
      }

      const content = readFileSync(filePath, "utf-8");
      return content;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EACCES") {
        return `Error: Permission denied: ${params.path}`;
      }
      return `Error reading file: ${error}`;
    }
  }
}

/**
 * Tool to write content to a file.
 */
export class WriteFileTool extends Tool {
  readonly name = "write_file";
  readonly description =
    "Write content to a file at the given path. Creates parent directories if needed.";
  readonly parameters = z.object({
    path: z.string().describe("The file path to write to"),
    content: z.string().describe("The content to write"),
  });

  async execute(params: { path: string; content: string }): Promise<string> {
    try {
      const filePath = expandUser(params.path);
      const dir = dirname(filePath);

      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(filePath, params.content, "utf-8");
      return `Successfully wrote ${params.content.length} bytes to ${params.path}`;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EACCES") {
        return `Error: Permission denied: ${params.path}`;
      }
      return `Error writing file: ${error}`;
    }
  }
}

/**
 * Tool to edit a file by replacing text.
 */
export class EditFileTool extends Tool {
  readonly name = "edit_file";
  readonly description =
    "Edit a file by replacing old_text with new_text. The old_text must exist exactly in the file.";
  readonly parameters = z.object({
    path: z.string().describe("The file path to edit"),
    old_text: z.string().describe("The exact text to find and replace"),
    new_text: z.string().describe("The text to replace with"),
  });

  async execute(params: {
    path: string;
    old_text: string;
    new_text: string;
  }): Promise<string> {
    try {
      const filePath = expandUser(params.path);

      if (!existsSync(filePath)) {
        return `Error: File not found: ${params.path}`;
      }

      let content = readFileSync(filePath, "utf-8");

      if (!content.includes(params.old_text)) {
        return `Error: old_text not found in file. Make sure it matches exactly.`;
      }

      // Count occurrences
      const count = content.split(params.old_text).length - 1;
      if (count > 1) {
        return `Warning: old_text appears ${count} times. Please provide more context to make it unique.`;
      }

      content = content.replace(params.old_text, params.new_text);
      writeFileSync(filePath, content, "utf-8");

      return `Successfully edited ${params.path}`;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EACCES") {
        return `Error: Permission denied: ${params.path}`;
      }
      return `Error editing file: ${error}`;
    }
  }
}

/**
 * Tool to list directory contents.
 */
export class ListDirTool extends Tool {
  readonly name = "list_dir";
  readonly description = "List the contents of a directory.";
  readonly parameters = z.object({
    path: z.string().describe("The directory path to list"),
  });

  async execute(params: { path: string }): Promise<string> {
    try {
      const dirPath = expandUser(params.path);

      if (!existsSync(dirPath)) {
        return `Error: Directory not found: ${params.path}`;
      }

      const stats = statSync(dirPath);
      if (!stats.isDirectory()) {
        return `Error: Not a directory: ${params.path}`;
      }

      const items = readdirSync(dirPath);
      if (items.length === 0) {
        return `Directory ${params.path} is empty`;
      }

      const result: string[] = [];
      for (const item of items.sort()) {
        const itemPath = join(dirPath, item);
        const itemStats = statSync(itemPath);
        const prefix = itemStats.isDirectory() ? "[DIR] " : "      ";
        result.push(`${prefix}${item}`);
      }

      return result.join("\n");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EACCES") {
        return `Error: Permission denied: ${params.path}`;
      }
      return `Error listing directory: ${error}`;
    }
  }
}
