# 🦞 miniclawd

A lightweight personal AI assistant with multi-channel support.  
Built with TypeScript + Bun in **~5700 lines of code**.

![miniclawd](./assets/miniclawd.png)

[中文文档](./README.zh-CN.md)

> Inspired by [openclawd](https://github.com/openclawd/openclawd) and [nanobot](https://github.com/HKUDS/nanobot).

## Features

- **Multi-LLM Support** — Anthropic, OpenAI, Google, OpenRouter, Groq, AWS Bedrock
- **Multi-Channel** — Telegram, Feishu (Lark)
- **Built-in Tools** — File I/O, shell execution, web fetch
- **Skills System** — Extend capabilities via Markdown
- **Persistent Memory** — Long-term memory + daily notes
- **Scheduling** — Cron jobs + heartbeat checks
- **Subagents** — Background task spawning

## Screenshots

| Stock                        | Product Hunt                 |
| ---------------------------- | ---------------------------- |
| ![case1](./assets/case1.png) | ![case2](./assets/case2.png) |

## Installation

**Via npm:**

```bash
npm install -g miniclawd@latest
# or: pnpm add -g miniclawd@latest
```

**From source:**

```bash
git clone https://github.com/FoundDream/miniclawd.git
cd miniclawd
bun install && bun run build && bun link
```

## Quick Start

```bash
# 1. Initialize
miniclawd onboard

# 2. Add API key to ~/.miniclawd/config.json
# 3. Chat
miniclawd agent -m "Hello!"
```

## Commands

| Command                    | Description                     |
| -------------------------- | ------------------------------- |
| `miniclawd onboard`        | Initialize config and workspace |
| `miniclawd agent`          | Interactive chat                |
| `miniclawd agent -m "..."` | Single message mode             |
| `miniclawd gateway`        | Start gateway (Telegram/Feishu) |
| `miniclawd status`         | Show system status              |
| `miniclawd cron list`      | List scheduled jobs             |

## Configuration

Config file: `~/.miniclawd/config.json`

### Providers

```json
{
  "providers": {
    "anthropic": { "api_key": "sk-ant-..." },
    "openai": { "api_key": "sk-..." },
    "openrouter": { "api_key": "sk-or-..." },
    "google": { "api_key": "..." },
    "groq": { "api_key": "gsk_..." },
    "bedrock": { "region": "us-east-1" }
  }
}
```

### Model

Format: `provider/model`

```json
{
  "agents": {
    "defaults": {
      "model": "anthropic/claude-sonnet-4-20250514"
    }
  }
}
```

### Telegram

1. Create bot via [@BotFather](https://t.me/BotFather) → `/newbot`
2. Copy token, add to config:

```json
{
  "channels": {
    "telegram": {
      "enabled": true,
      "token": "123456789:ABCdef...",
      "allow_from": []
    }
  }
}
```

### Feishu

1. Create app at [Feishu Open Platform](https://open.feishu.cn/)
2. Enable WebSocket mode, add `im.message.receive_v1` event
3. Add permissions: `im:message`, `im:message:send_as_bot`

```json
{
  "channels": {
    "feishu": {
      "enabled": true,
      "app_id": "cli_xxx",
      "app_secret": "xxx",
      "allow_from": []
    }
  }
}
```

Then start: `miniclawd gateway`

## Directory Structure

```
~/.miniclawd/
├── config.json        # Configuration
├── sessions/          # Session storage (JSONL)
├── media/             # Downloaded media
├── cron/jobs.json     # Scheduled jobs
└── workspace/
    ├── AGENTS.md      # Agent instructions
    ├── SOUL.md        # Agent personality
    ├── USER.md        # User info
    ├── HEARTBEAT.md   # Heartbeat tasks
    ├── memory/        # Long-term memory
    └── skills/        # Custom skills
```

## Development

```bash
bun run typecheck   # Type check
bun run dev -- ...  # Dev mode
bun run build       # Build
```

## License

MIT
