/**
 * Skills loader for agent capabilities.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import matter from "gray-matter";
import { execSync } from "child_process";

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Default builtin skills directory (relative to this file)
const BUILTIN_SKILLS_DIR = join(__dirname, "..", "..", "skills");

/**
 * Skill info.
 */
export interface SkillInfo {
  name: string;
  path: string;
  source: "workspace" | "builtin";
}

/**
 * Skill metadata from frontmatter.
 */
export interface SkillMetadata {
  name?: string;
  description?: string;
  homepage?: string;
  always?: boolean;
  metadata?: string;
  [key: string]: unknown;
}

/**
 * Parsed nanobot metadata.
 */
interface NanobotMetadata {
  emoji?: string;
  always?: boolean;
  requires?: {
    bins?: string[];
    env?: string[];
  };
  install?: Array<{
    id: string;
    kind: string;
    formula?: string;
    package?: string;
    bins: string[];
    label: string;
  }>;
}

/**
 * Loader for agent skills.
 *
 * Skills are markdown files (SKILL.md) that teach the agent how to use
 * specific tools or perform certain tasks.
 */
export class SkillsLoader {
  private workspace: string;
  private workspaceSkills: string;
  private builtinSkills: string;

  constructor(workspace: string, builtinSkillsDir?: string) {
    this.workspace = workspace;
    this.workspaceSkills = join(workspace, "skills");
    this.builtinSkills = builtinSkillsDir || BUILTIN_SKILLS_DIR;
  }

  /**
   * List all available skills.
   */
  listSkills(filterUnavailable: boolean = true): SkillInfo[] {
    const skills: SkillInfo[] = [];

    // Workspace skills (highest priority)
    if (existsSync(this.workspaceSkills)) {
      for (const name of readdirSync(this.workspaceSkills)) {
        const skillDir = join(this.workspaceSkills, name);
        if (statSync(skillDir).isDirectory()) {
          const skillFile = join(skillDir, "SKILL.md");
          if (existsSync(skillFile)) {
            skills.push({ name, path: skillFile, source: "workspace" });
          }
        }
      }
    }

    // Built-in skills
    if (existsSync(this.builtinSkills)) {
      for (const name of readdirSync(this.builtinSkills)) {
        const skillDir = join(this.builtinSkills, name);
        if (statSync(skillDir).isDirectory()) {
          const skillFile = join(skillDir, "SKILL.md");
          if (existsSync(skillFile) && !skills.some((s) => s.name === name)) {
            skills.push({ name, path: skillFile, source: "builtin" });
          }
        }
      }
    }

    // Filter by requirements
    if (filterUnavailable) {
      return skills.filter((s) => this.checkRequirements(this.getSkillMeta(s.name)));
    }

    return skills;
  }

  /**
   * Load a skill by name.
   */
  loadSkill(name: string): string | null {
    // Check workspace first
    const workspaceSkill = join(this.workspaceSkills, name, "SKILL.md");
    if (existsSync(workspaceSkill)) {
      return readFileSync(workspaceSkill, "utf-8");
    }

    // Check built-in
    const builtinSkill = join(this.builtinSkills, name, "SKILL.md");
    if (existsSync(builtinSkill)) {
      return readFileSync(builtinSkill, "utf-8");
    }

    return null;
  }

  /**
   * Load specific skills for inclusion in agent context.
   */
  loadSkillsForContext(skillNames: string[]): string {
    const parts: string[] = [];

    for (const name of skillNames) {
      const content = this.loadSkill(name);
      if (content) {
        const stripped = this.stripFrontmatter(content);
        parts.push(`### Skill: ${name}\n\n${stripped}`);
      }
    }

    return parts.length > 0 ? parts.join("\n\n---\n\n") : "";
  }

  /**
   * Build a summary of all skills (name, description, path, availability).
   */
  buildSkillsSummary(): string {
    const allSkills = this.listSkills(false);
    if (allSkills.length === 0) {
      return "";
    }

    const escapeXml = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const lines = ["<skills>"];

    for (const skill of allSkills) {
      const name = escapeXml(skill.name);
      const path = skill.path;
      const desc = escapeXml(this.getSkillDescription(skill.name));
      const skillMeta = this.getSkillMeta(skill.name);
      const available = this.checkRequirements(skillMeta);

      lines.push(`  <skill available="${available}">`);
      lines.push(`    <name>${name}</name>`);
      lines.push(`    <description>${desc}</description>`);
      lines.push(`    <location>${path}</location>`);

      // Show missing requirements for unavailable skills
      if (!available) {
        const missing = this.getMissingRequirements(skillMeta);
        if (missing) {
          lines.push(`    <requires>${escapeXml(missing)}</requires>`);
        }
      }

      lines.push(`  </skill>`);
    }

    lines.push("</skills>");
    return lines.join("\n");
  }

  /**
   * Get skills marked as always=true that meet requirements.
   */
  getAlwaysSkills(): string[] {
    const result: string[] = [];

    for (const skill of this.listSkills(true)) {
      const metadata = this.getSkillMetadata(skill.name);
      const skillMeta = this.parseNanobotMetadata(metadata?.metadata || "");

      if (skillMeta.always || metadata?.always) {
        result.push(skill.name);
      }
    }

    return result;
  }

  /**
   * Get metadata from a skill's frontmatter.
   */
  getSkillMetadata(name: string): SkillMetadata | null {
    const content = this.loadSkill(name);
    if (!content) {
      return null;
    }

    try {
      const { data } = matter(content);
      return data as SkillMetadata;
    } catch {
      return null;
    }
  }

  /**
   * Get nanobot metadata for a skill.
   */
  private getSkillMeta(name: string): NanobotMetadata {
    const metadata = this.getSkillMetadata(name);
    return this.parseNanobotMetadata(metadata?.metadata || "");
  }

  /**
   * Parse nanobot metadata JSON from frontmatter.
   */
  private parseNanobotMetadata(raw: string): NanobotMetadata {
    try {
      const data = JSON.parse(raw);
      return data.nanobot || {};
    } catch {
      return {};
    }
  }

  /**
   * Check if skill requirements are met.
   */
  private checkRequirements(skillMeta: NanobotMetadata): boolean {
    const requires = skillMeta.requires || {};

    // Check binary requirements
    for (const bin of requires.bins || []) {
      if (!this.which(bin)) {
        return false;
      }
    }

    // Check env requirements
    for (const env of requires.env || []) {
      if (!process.env[env]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get a description of missing requirements.
   */
  private getMissingRequirements(skillMeta: NanobotMetadata): string {
    const missing: string[] = [];
    const requires = skillMeta.requires || {};

    for (const bin of requires.bins || []) {
      if (!this.which(bin)) {
        missing.push(`CLI: ${bin}`);
      }
    }

    for (const env of requires.env || []) {
      if (!process.env[env]) {
        missing.push(`ENV: ${env}`);
      }
    }

    return missing.join(", ");
  }

  /**
   * Get the description of a skill from its frontmatter.
   */
  private getSkillDescription(name: string): string {
    const metadata = this.getSkillMetadata(name);
    if (metadata?.description) {
      return metadata.description;
    }
    return name; // Fallback to skill name
  }

  /**
   * Remove YAML frontmatter from markdown content.
   */
  private stripFrontmatter(content: string): string {
    try {
      const { content: body } = matter(content);
      return body.trim();
    } catch {
      return content;
    }
  }

  /**
   * Check if a command exists.
   */
  private which(command: string): boolean {
    try {
      execSync(`which ${command}`, { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }
}
