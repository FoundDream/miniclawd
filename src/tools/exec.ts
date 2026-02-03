/**
 * Shell execution tool.
 */

import { z } from "zod";
import { spawn } from "child_process";
import { Tool } from "./base.js";
import { expandUser } from "../utils/paths.js";

/**
 * Tool to execute shell commands.
 */
export class ExecTool extends Tool {
  readonly name = "exec";
  readonly description = "Execute a shell command and return its output. Use with caution.";
  readonly parameters = z.object({
    command: z.string().describe("The shell command to execute"),
    working_dir: z.string().optional().describe("Optional working directory for the command"),
  });

  private timeout: number;
  private defaultWorkingDir: string | undefined;

  constructor(options?: { timeout?: number; workingDir?: string }) {
    super();
    this.timeout = options?.timeout || 60000; // 60 seconds default
    this.defaultWorkingDir = options?.workingDir;
  }

  async execute(params: { command: string; working_dir?: string }): Promise<string> {
    const cwd = params.working_dir
      ? expandUser(params.working_dir)
      : this.defaultWorkingDir || process.cwd();

    return new Promise((resolve) => {
      const startTime = Date.now();
      const outputParts: string[] = [];
      const stderrParts: string[] = [];

      const child = spawn(params.command, {
        shell: true,
        cwd,
        env: process.env,
      });

      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        resolve(`Error: Command timed out after ${this.timeout / 1000} seconds`);
      }, this.timeout);

      child.stdout?.on("data", (data) => {
        outputParts.push(data.toString());
      });

      child.stderr?.on("data", (data) => {
        stderrParts.push(data.toString());
      });

      child.on("close", (code) => {
        clearTimeout(timeout);

        const result: string[] = [];

        if (outputParts.length > 0) {
          result.push(outputParts.join(""));
        }

        if (stderrParts.length > 0) {
          const stderr = stderrParts.join("").trim();
          if (stderr) {
            result.push(`STDERR:\n${stderr}`);
          }
        }

        if (code !== 0) {
          result.push(`\nExit code: ${code}`);
        }

        let output = result.length > 0 ? result.join("\n") : "(no output)";

        // Truncate very long output
        const maxLen = 10000;
        if (output.length > maxLen) {
          output = output.slice(0, maxLen) + `\n... (truncated, ${output.length - maxLen} more chars)`;
        }

        resolve(output);
      });

      child.on("error", (error) => {
        clearTimeout(timeout);
        resolve(`Error executing command: ${error.message}`);
      });
    });
  }
}
