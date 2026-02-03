/**
 * Context builder for assembling agent prompts.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { CoreMessage } from "ai";
import { MemoryStore } from "../infrastructure/storage/memory-store.js";
import { SkillsLoader } from "./skills-loader.js";
import { expandUser } from "../utils/paths.js";

const BOOTSTRAP_FILES = ["AGENTS.md", "SOUL.md", "USER.md", "TOOLS.md", "IDENTITY.md"];

/**
 * Builds the context (system prompt + messages) for the agent.
 */
export class ContextBuilder {
  private workspace: string;
  private memory: MemoryStore;
  private skills: SkillsLoader;

  constructor(workspace: string) {
    this.workspace = expandUser(workspace);
    this.memory = new MemoryStore(this.workspace);
    this.skills = new SkillsLoader(this.workspace);
  }

  /**
   * Build the system prompt from bootstrap files, memory, and skills.
   */
  async buildSystemPrompt(skillNames?: string[]): Promise<string> {
    const parts: string[] = [];

    // Core identity
    parts.push(this.getIdentity());

    // Bootstrap files
    const bootstrap = this.loadBootstrapFiles();
    if (bootstrap) {
      parts.push(bootstrap);
    }

    // Memory context
    const memory = await this.memory.getMemoryContext();
    if (memory) {
      parts.push(`# Memory\n\n${memory}`);
    }

    // Skills - progressive loading
    // 1. Always-loaded skills: include full content
    const alwaysSkills = this.skills.getAlwaysSkills();
    if (alwaysSkills.length > 0) {
      const alwaysContent = this.skills.loadSkillsForContext(alwaysSkills);
      if (alwaysContent) {
        parts.push(`# Active Skills\n\n${alwaysContent}`);
      }
    }

    // 2. Available skills: only show summary (agent uses read_file to load)
    const skillsSummary = this.skills.buildSkillsSummary();
    if (skillsSummary) {
      parts.push(`# Skills

The following skills extend your capabilities. To use a skill, read its SKILL.md file using the read_file tool.
Skills with available="false" need dependencies installed first - you can try installing them with apt/brew.

${skillsSummary}`);
    }

    return parts.join("\n\n---\n\n");
  }

  /**
   * Get the core identity section.
   */
  private getIdentity(): string {
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const timeStr = now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });

    return `# miniclawd

You are miniclawd, a helpful AI assistant. You have access to tools that allow you to:
- Read, write, and edit files
- Execute shell commands
- Search the web and fetch web pages
- Send messages to users on chat channels
- Spawn subagents for complex background tasks

## Current Time
${dateStr} ${timeStr}

## Workspace
Your workspace is at: ${this.workspace}
- Memory files: ${this.workspace}/memory/MEMORY.md
- Daily notes: ${this.workspace}/memory/YYYY-MM-DD.md
- Custom skills: ${this.workspace}/skills/{skill-name}/SKILL.md

IMPORTANT: When responding to direct questions or conversations, reply directly with your text response.
Only use the 'message' tool when you need to send a message to a specific chat channel (like Telegram).
For normal conversation, just respond with text - do not call the message tool.

Always be helpful, accurate, and concise. When using tools, explain what you're doing.
When remembering something, write to ${this.workspace}/memory/MEMORY.md`;
  }

  /**
   * Load all bootstrap files from workspace.
   */
  private loadBootstrapFiles(): string {
    const parts: string[] = [];

    for (const filename of BOOTSTRAP_FILES) {
      const filePath = join(this.workspace, filename);
      if (existsSync(filePath)) {
        const content = readFileSync(filePath, "utf-8");
        parts.push(`## ${filename}\n\n${content}`);
      }
    }

    return parts.length > 0 ? parts.join("\n\n") : "";
  }

  /**
   * Build the complete message list for an LLM call.
   */
  async buildMessages(
    history: Array<{ role: string; content: string }>,
    currentMessage: string,
    skillNames?: string[],
    media?: string[]
  ): Promise<CoreMessage[]> {
    const messages: CoreMessage[] = [];

    // System prompt
    const systemPrompt = await this.buildSystemPrompt(skillNames);
    messages.push({ role: "system", content: systemPrompt });

    // History (convert to CoreMessage format)
    for (const msg of history) {
      if (msg.role === "user") {
        messages.push({ role: "user", content: msg.content });
      } else if (msg.role === "assistant") {
        messages.push({ role: "assistant", content: msg.content });
      }
    }

    // Current message (with optional image attachments)
    const userContent = this.buildUserContent(currentMessage, media);
    messages.push({ role: "user", content: userContent });

    return messages;
  }

  /**
   * Build user message content with optional base64-encoded images.
   */
  private buildUserContent(text: string, media?: string[]): string {
    // For now, just return text - image handling would need proper CoreMessage part types
    if (!media || media.length === 0) {
      return text;
    }

    // Append file paths as text mentions for now
    const mediaMentions = media.map((p) => `[attached: ${p}]`).join("\n");
    return `${text}\n\n${mediaMentions}`;
  }

  /**
   * Add a tool result to the message list.
   */
  addToolResult(
    messages: CoreMessage[],
    toolCallId: string,
    toolName: string,
    result: string
  ): CoreMessage[] {
    messages.push({
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId,
          toolName,
          result,
        },
      ],
    } as CoreMessage);
    return messages;
  }

  /**
   * Add an assistant message to the message list.
   */
  addAssistantMessage(
    messages: CoreMessage[],
    content: string | null,
    toolCalls?: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>
  ): CoreMessage[] {
    const parts: Array<{ type: string; text?: string; toolCallId?: string; toolName?: string; args?: unknown }> = [];

    if (content) {
      parts.push({ type: "text", text: content });
    }

    if (toolCalls) {
      for (const tc of toolCalls) {
        parts.push({
          type: "tool-call",
          toolCallId: tc.id,
          toolName: tc.function.name,
          args: JSON.parse(tc.function.arguments),
        });
      }
    }

    if (parts.length > 0) {
      messages.push({
        role: "assistant",
        content: parts.length === 1 && parts[0].type === "text" ? (parts[0].text || "") : parts,
      } as CoreMessage);
    } else {
      messages.push({ role: "assistant", content: "" });
    }

    return messages;
  }
}
