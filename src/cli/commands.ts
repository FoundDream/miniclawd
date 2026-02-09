/**
 * CLI commands for miniclawd.
 */

import { Command } from "commander";
import { existsSync, writeFileSync } from "fs";
import { join } from "path";
import {
  loadConfig,
  saveConfig,
  getConfigPath,
  getDataDir,
  ConfigSchema,
  getWorkspacePath,
} from "../infrastructure/config/index.js";
import { ensureDir } from "../utils/paths.js";
import { MessageBus } from "../infrastructure/queue/message-bus.js";
import { AgentLoop } from "../application/agent-loop.js";
import { ChannelManager } from "../infrastructure/channels/manager.js";
import { Scheduler } from "../application/scheduler.js";
import type { Schedule, ScheduledJob } from "../core/types/scheduler.js";
import logger from "../utils/logger.js";

const VERSION = "0.1.0";
const LOGO = "miniclawd";

/**
 * Create workspace template files.
 */
function createWorkspaceTemplates(workspace: string): void {
  const templates: Record<string, string> = {
    "AGENTS.md": `# Agent Instructions

You are a helpful AI assistant. Be concise, accurate, and friendly.

## Guidelines

- Always explain what you're doing before taking actions
- Ask for clarification when the request is ambiguous
- Use tools to help accomplish tasks
- Remember important information in your memory files
`,
    "SOUL.md": `# Soul

I am miniclawd, a lightweight AI assistant.

## Personality

- Helpful and friendly
- Concise and to the point
- Curious and eager to learn

## Values

- Accuracy over speed
- User privacy and safety
- Transparency in actions
`,
    "USER.md": `# User

Information about the user goes here.

## Preferences

- Communication style: (casual/formal)
- Timezone: (your timezone)
- Language: (your preferred language)
`,
  };

  for (const [filename, content] of Object.entries(templates)) {
    const filePath = join(workspace, filename);
    if (!existsSync(filePath)) {
      writeFileSync(filePath, content);
      console.log(`  Created ${filename}`);
    }
  }

  // Create memory directory and MEMORY.md
  const memoryDir = ensureDir(join(workspace, "memory"));
  const memoryFile = join(memoryDir, "MEMORY.md");
  if (!existsSync(memoryFile)) {
    writeFileSync(
      memoryFile,
      `# Long-term Memory

This file stores important information that should persist across sessions.

## User Information

(Important facts about the user)

## Preferences

(User preferences learned over time)

## Important Notes

(Things to remember)
`,
    );
    console.log("  Created memory/MEMORY.md");
  }
}

/**
 * Create the CLI program.
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name("miniclawd")
    .description(`${LOGO} - Personal AI Assistant`)
    .version(VERSION, "-v, --version");

  // ========== Onboard ==========
  program
    .command("onboard")
    .description("Initialize miniclawd configuration and workspace")
    .action(async () => {
      const configPath = getConfigPath();

      if (existsSync(configPath)) {
        console.log(`Config already exists at ${configPath}`);
        const readline = await import("readline");
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const answer = await new Promise<string>((resolve) => {
          rl.question("Overwrite? (y/N) ", resolve);
        });
        rl.close();

        if (answer.toLowerCase() !== "y") {
          process.exit(0);
        }
      }

      // Create default config
      const config = ConfigSchema.parse({});
      saveConfig(config);
      console.log(`Created config at ${configPath}`);

      // Create workspace
      const workspace = getWorkspacePath(config);
      ensureDir(workspace);
      console.log(`Created workspace at ${workspace}`);

      // Create default bootstrap files
      createWorkspaceTemplates(workspace);

      console.log(`\n${LOGO} is ready!`);
      console.log("\nNext steps:");
      console.log("  1. Add your API key to ~/.miniclawd/config.json");
      console.log("     Get one at: https://console.anthropic.com/");
      console.log('  2. Chat: miniclawd agent -m "Hello!"');
    });

  // ========== Gateway ==========
  program
    .command("gateway")
    .description("Start the miniclawd gateway")
    .option("-p, --port <port>", "Gateway port", "18790")
    .option("-V, --verbose", "Verbose output")
    .action(async (options) => {
      if (options.verbose) {
        process.env.LOG_LEVEL = "debug";
      }

      console.log(`${LOGO} Starting gateway on port ${options.port}...`);

      const config = loadConfig();
      const workspace = getWorkspacePath(config);

      // Check for API key
      const hasApiKey =
        config.providers.anthropic.apiKey ||
        config.providers.openai.apiKey ||
        config.providers.openrouter.apiKey ||
        config.providers.google.apiKey ||
        process.env.ANTHROPIC_API_KEY ||
        process.env.OPENAI_API_KEY ||
        process.env.OPENROUTER_API_KEY ||
        process.env.GOOGLE_API_KEY;

      if (!hasApiKey) {
        console.error("Error: No API key configured.");
        console.error(
          "Set one in ~/.miniclawd/config.json under providers.anthropic.apiKey",
        );
        process.exit(1);
      }

      // Create components
      const bus = new MessageBus();

      const agent = new AgentLoop({
        bus,
        config,
        model: config.agents.defaults.model,
        maxIterations: config.agents.defaults.maxToolIterations,
        braveApiKey: config.tools.web.search.apiKey || undefined,
      });

      // Create unified scheduler (cron + heartbeat)
      const schedulerStorePath = join(getDataDir(), "cron", "jobs.json");
      const scheduler = new Scheduler({
        storePath: schedulerStorePath,
        workspace,
        onJob: async (job: ScheduledJob) => {
          const response = await agent.processDirect(
            job.payload.message,
            `scheduler:${job.id}`,
          );
          if (job.payload.deliver && job.payload.to) {
            await bus.publishOutbound({
              channel: job.payload.channel || "telegram",
              chatId: job.payload.to,
              content: response || "",
              media: [],
              metadata: {},
            });
          }
        },
        heartbeatEnabled: true,
        heartbeatIntervalMs: 30 * 60 * 1000, // 30 minutes
      });

      // Create channel manager
      const channels = new ChannelManager(config, bus);

      if (channels.enabledChannels.length > 0) {
        console.log(`Channels enabled: ${channels.enabledChannels.join(", ")}`);
      } else {
        console.log("Warning: No channels enabled");
      }

      const schedulerStatus = scheduler.status();
      if (schedulerStatus.jobCount > 0) {
        console.log(`Scheduler: ${schedulerStatus.jobCount} scheduled jobs`);
      }

      console.log("Heartbeat: every 30m");

      // Handle shutdown
      const shutdown = async () => {
        console.log("\nShutting down...");
        scheduler.stop();
        agent.stop();
        await channels.stopAll();
        process.exit(0);
      };

      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);

      // Start everything
      await scheduler.start();
      await Promise.all([agent.run(), channels.startAll()]);
    });

  // ========== Agent ==========
  program
    .command("agent")
    .description("Interact with the agent directly")
    .option("-m, --message <message>", "Message to send to the agent")
    .option("-s, --session <id>", "Session ID", "cli:default")
    .action(async (options) => {
      const config = loadConfig();

      // Check for API key
      const hasApiKey =
        config.providers.anthropic.apiKey ||
        config.providers.openai.apiKey ||
        config.providers.openrouter.apiKey ||
        config.providers.google.apiKey ||
        process.env.ANTHROPIC_API_KEY ||
        process.env.OPENAI_API_KEY ||
        process.env.OPENROUTER_API_KEY ||
        process.env.GOOGLE_API_KEY;

      if (!hasApiKey) {
        console.error("Error: No API key configured.");
        process.exit(1);
      }

      const bus = new MessageBus();
      const agent = new AgentLoop({
        bus,
        config,
        braveApiKey: config.tools.web.search.apiKey || undefined,
      });

      if (options.message) {
        // Single message mode
        const response = await agent.processDirect(
          options.message,
          options.session,
        );
        console.log(`\n${LOGO}: ${response}`);
      } else {
        // Interactive mode
        console.log(`${LOGO} Interactive mode (Ctrl+C to exit)\n`);

        const readline = await import("readline");
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const askQuestion = () => {
          rl.question("You: ", async (input) => {
            if (!input.trim()) {
              askQuestion();
              return;
            }

            try {
              const response = await agent.processDirect(
                input,
                options.session,
              );
              console.log(`\n${LOGO}: ${response}\n`);
            } catch (error) {
              console.error(`Error: ${error}`);
            }

            askQuestion();
          });
        };

        rl.on("close", () => {
          console.log("\nGoodbye!");
          process.exit(0);
        });

        askQuestion();
      }
    });

  // ========== Channels ==========
  const channelsCmd = program
    .command("channels")
    .description("Manage channels");

  channelsCmd
    .command("status")
    .description("Show channel status")
    .action(() => {
      const config = loadConfig();

      console.log("\nChannel Status\n");
      console.log(
        "Channel".padEnd(15) + "Enabled".padEnd(10) + "Configuration",
      );
      console.log("-".repeat(50));

      // Telegram
      const tg = config.channels.telegram;
      const tgConfig = tg.token
        ? `token: ${tg.token.slice(0, 10)}...`
        : "not configured";
      console.log(
        "Telegram".padEnd(15) +
          (tg.enabled ? "Yes" : "No").padEnd(10) +
          tgConfig,
      );

      // Feishu
      const fs = config.channels.feishu;
      const fsConfig = fs.appId
        ? `appId: ${fs.appId.slice(0, 10)}...`
        : "not configured";
      console.log(
        "Feishu".padEnd(15) + (fs.enabled ? "Yes" : "No").padEnd(10) + fsConfig,
      );
    });

  // ========== Cron ==========
  const cronCmd = program.command("cron").description("Manage scheduled tasks");

  cronCmd
    .command("list")
    .description("List scheduled jobs")
    .option("-a, --all", "Include disabled jobs")
    .action((options) => {
      const storePath = join(getDataDir(), "cron", "jobs.json");
      const workspace = getWorkspacePath(loadConfig());
      const scheduler = new Scheduler({ storePath, workspace });
      const jobs = scheduler.listJobs();

      if (jobs.length === 0) {
        console.log("No scheduled jobs.");
        return;
      }

      console.log("\nScheduled Jobs\n");
      console.log(
        "ID".padEnd(10) +
          "Name".padEnd(20) +
          "Schedule".padEnd(20) +
          "Status".padEnd(10) +
          "Next Run",
      );
      console.log("-".repeat(80));

      for (const job of jobs) {
        let sched: string;
        if (job.schedule.kind === "every") {
          sched = `every ${(job.schedule.everyMs || 0) / 1000}s`;
        } else if (job.schedule.kind === "cron") {
          sched = job.schedule.expr || "";
        } else {
          sched = "one-time";
        }

        let nextRun = "";
        if (job.state.nextRunAtMs) {
          nextRun = new Date(job.state.nextRunAtMs).toLocaleString();
        }

        const status = job.enabled ? "enabled" : "disabled";

        console.log(
          job.id.padEnd(10) +
            job.name.slice(0, 18).padEnd(20) +
            sched.slice(0, 18).padEnd(20) +
            status.padEnd(10) +
            nextRun,
        );
      }
    });

  cronCmd
    .command("add")
    .description("Add a scheduled job")
    .requiredOption("-n, --name <name>", "Job name")
    .requiredOption("-m, --message <message>", "Message for agent")
    .option("-e, --every <seconds>", "Run every N seconds")
    .option("-c, --cron <expr>", "Cron expression")
    .option("--at <time>", "Run once at time (ISO format)")
    .option("-d, --deliver", "Deliver response to channel")
    .option("--to <recipient>", "Recipient for delivery")
    .option("--channel <channel>", "Channel for delivery")
    .action((options) => {
      let schedule: Schedule;

      if (options.every) {
        schedule = { kind: "every", everyMs: parseInt(options.every) * 1000 };
      } else if (options.cron) {
        schedule = { kind: "cron", expr: options.cron };
      } else if (options.at) {
        const dt = new Date(options.at);
        schedule = { kind: "at", atMs: dt.getTime() };
      } else {
        console.error("Error: Must specify --every, --cron, or --at");
        process.exit(1);
      }

      const storePath = join(getDataDir(), "cron", "jobs.json");
      const workspace = getWorkspacePath(loadConfig());
      const scheduler = new Scheduler({ storePath, workspace });

      const job = scheduler.addJob({
        name: options.name,
        schedule,
        payload: {
          kind: "agent_turn",
          message: options.message,
          deliver: options.deliver || false,
          channel: options.channel,
          to: options.to,
        },
      });

      console.log(`Added job '${job.name}' (${job.id})`);
    });

  cronCmd
    .command("remove <jobId>")
    .description("Remove a scheduled job")
    .action((jobId) => {
      const storePath = join(getDataDir(), "cron", "jobs.json");
      const workspace = getWorkspacePath(loadConfig());
      const scheduler = new Scheduler({ storePath, workspace });

      if (scheduler.removeJob(jobId)) {
        console.log(`Removed job ${jobId}`);
      } else {
        console.error(`Job ${jobId} not found`);
      }
    });

  cronCmd
    .command("enable <jobId>")
    .description("Enable or disable a job")
    .option("--disable", "Disable instead of enable")
    .action((jobId, options) => {
      const storePath = join(getDataDir(), "cron", "jobs.json");
      const workspace = getWorkspacePath(loadConfig());
      const scheduler = new Scheduler({ storePath, workspace });

      if (scheduler.enableJob(jobId, !options.disable)) {
        const status = options.disable ? "disabled" : "enabled";
        console.log(`Job ${jobId} ${status}`);
      } else {
        console.error(`Job ${jobId} not found`);
      }
    });

  cronCmd
    .command("run <jobId>")
    .description("Manually run a job")
    .action(async (jobId) => {
      const storePath = join(getDataDir(), "cron", "jobs.json");
      const workspace = getWorkspacePath(loadConfig());
      const scheduler = new Scheduler({ storePath, workspace });

      try {
        await scheduler.runJob(jobId);
        console.log("Job executed");
      } catch (error) {
        console.error(`Failed to run job ${jobId}: ${error}`);
      }
    });

  // ========== Status ==========
  program
    .command("status")
    .description("Show miniclawd status")
    .action(() => {
      const configPath = getConfigPath();
      const config = loadConfig();
      const workspace = getWorkspacePath(config);

      console.log(`\n${LOGO} Status\n`);

      console.log(
        `Config: ${configPath} ${existsSync(configPath) ? "[OK]" : "[NOT FOUND]"}`,
      );
      console.log(
        `Workspace: ${workspace} ${existsSync(workspace) ? "[OK]" : "[NOT FOUND]"}`,
      );

      if (existsSync(configPath)) {
        console.log(`Model: ${config.agents.defaults.model}`);

        // Check API keys
        const hasAnthopic =
          !!config.providers.anthropic.apiKey ||
          !!process.env.ANTHROPIC_API_KEY;
        const hasOpenai =
          !!config.providers.openai.apiKey || !!process.env.OPENAI_API_KEY;
        const hasOpenrouter =
          !!config.providers.openrouter.apiKey ||
          !!process.env.OPENROUTER_API_KEY;
        const hasGoogle =
          !!config.providers.google.apiKey || !!process.env.GOOGLE_API_KEY;

        console.log(`Anthropic API: ${hasAnthopic ? "[OK]" : "not set"}`);
        console.log(`OpenAI API: ${hasOpenai ? "[OK]" : "not set"}`);
        console.log(`OpenRouter API: ${hasOpenrouter ? "[OK]" : "not set"}`);
        console.log(`Google API: ${hasGoogle ? "[OK]" : "not set"}`);
      }
    });

  return program;
}
