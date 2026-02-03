/**
 * Memory storage implementation.
 */

import { existsSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";
import { ensureDir, todayDate } from "../../utils/paths.js";
import type { IMemoryStore } from "../../core/interfaces/storage.js";

/**
 * Memory store for the agent.
 *
 * Supports daily notes (memory/YYYY-MM-DD.md) and long-term memory (MEMORY.md).
 */
export class MemoryStore implements IMemoryStore {
  private memoryDir: string;
  private memoryFile: string;

  constructor(workspace: string) {
    this.memoryDir = ensureDir(join(workspace, "memory"));
    this.memoryFile = join(this.memoryDir, "MEMORY.md");
  }

  /**
   * Get path to today's memory file.
   */
  getTodayFile(): string {
    return join(this.memoryDir, `${todayDate()}.md`);
  }

  /**
   * Read today's memory notes.
   */
  async readToday(): Promise<string> {
    const todayFile = this.getTodayFile();
    if (existsSync(todayFile)) {
      return readFileSync(todayFile, "utf-8");
    }
    return "";
  }

  /**
   * Append content to today's memory notes.
   */
  async appendToday(content: string): Promise<void> {
    const todayFile = this.getTodayFile();
    let newContent: string;

    if (existsSync(todayFile)) {
      const existing = readFileSync(todayFile, "utf-8");
      newContent = existing + "\n" + content;
    } else {
      // Add header for new day
      const header = `# ${todayDate()}\n\n`;
      newContent = header + content;
    }

    writeFileSync(todayFile, newContent, "utf-8");
  }

  /**
   * Read long-term memory (MEMORY.md).
   */
  async readLongTerm(): Promise<string> {
    if (existsSync(this.memoryFile)) {
      return readFileSync(this.memoryFile, "utf-8");
    }
    return "";
  }

  /**
   * Write to long-term memory (MEMORY.md).
   */
  async writeLongTerm(content: string): Promise<void> {
    writeFileSync(this.memoryFile, content, "utf-8");
  }

  /**
   * Get memories from the last N days.
   */
  async getRecentMemories(days: number = 7): Promise<string[]> {
    const memories: string[] = [];
    const today = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];
      const filePath = join(this.memoryDir, `${dateStr}.md`);

      if (existsSync(filePath)) {
        const content = readFileSync(filePath, "utf-8");
        memories.push(content);
      }
    }

    return memories;
  }

  /**
   * List all memory files sorted by date (newest first).
   */
  listMemoryFiles(): string[] {
    if (!existsSync(this.memoryDir)) {
      return [];
    }

    const files = readdirSync(this.memoryDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort()
      .reverse();

    return files.map((f) => join(this.memoryDir, f));
  }

  /**
   * Get memory context for the agent.
   */
  async getMemoryContext(): Promise<string> {
    const parts: string[] = [];

    // Long-term memory
    const longTerm = await this.readLongTerm();
    if (longTerm) {
      parts.push("## Long-term Memory\n" + longTerm);
    }

    // Today's notes
    const today = await this.readToday();
    if (today) {
      parts.push("## Today's Notes\n" + today);
    }

    return parts.length > 0 ? parts.join("\n\n") : "";
  }
}
