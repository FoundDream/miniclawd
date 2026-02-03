# 🦞 miniclawd

一个轻量级的个人 AI 助手，支持多渠道接入。  
使用 TypeScript + Bun 构建，**仅 ~5700 行代码**。

![miniclawd](./assets/miniclawd.png)

[English](./README.md)

> 灵感来源于 [openclawd](https://github.com/openclawd/openclawd) 和 [nanobot](https://github.com/HKUDS/nanobot)。

## 特性

- **多 LLM 支持** — Anthropic、OpenAI、Google、OpenRouter、Groq、AWS Bedrock
- **多渠道接入** — Telegram、飞书
- **内置工具** — 文件读写、Shell 执行、网页抓取
- **技能系统** — 通过 Markdown 扩展能力
- **持久记忆** — 长期记忆 + 每日笔记
- **定时任务** — Cron 调度 + 心跳检查
- **子代理** — 后台任务派生

## 截图

| 股票查询                     | Product Hunt                 |
| ---------------------------- | ---------------------------- |
| ![case1](./assets/case1.png) | ![case2](./assets/case2.png) |

## 安装

**通过 npm：**

```bash
npm install -g miniclawd@latest
# 或: pnpm add -g miniclawd@latest
```

**从源码安装：**

```bash
git clone https://github.com/FoundDream/miniclawd.git
cd miniclawd
bun install && bun run build && bun link
```

## 快速开始

```bash
# 1. 初始化
miniclawd onboard

# 2. 添加 API Key 到 ~/.miniclawd/config.json
# 3. 开始对话
miniclawd agent -m "你好！"
```

## 命令

| 命令                       | 说明                      |
| -------------------------- | ------------------------- |
| `miniclawd onboard`        | 初始化配置和工作区        |
| `miniclawd agent`          | 交互式对话                |
| `miniclawd agent -m "..."` | 单条消息模式              |
| `miniclawd gateway`        | 启动网关（Telegram/飞书） |
| `miniclawd status`         | 查看系统状态              |
| `miniclawd cron list`      | 列出定时任务              |

## 配置

配置文件：`~/.miniclawd/config.json`

### 提供商

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

### 模型

格式：`provider/model`

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

1. 通过 [@BotFather](https://t.me/BotFather) 创建机器人 → `/newbot`
2. 复制 Token，添加到配置：

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

### 飞书

1. 在 [飞书开放平台](https://open.feishu.cn/) 创建应用
2. 启用 WebSocket 模式，添加 `im.message.receive_v1` 事件
3. 添加权限：`im:message`、`im:message:send_as_bot`

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

配置完成后启动：`miniclawd gateway`

## 目录结构

```
~/.miniclawd/
├── config.json        # 配置文件
├── sessions/          # 会话存储 (JSONL)
├── media/             # 下载的媒体文件
├── cron/jobs.json     # 定时任务
└── workspace/
    ├── AGENTS.md      # Agent 指令
    ├── SOUL.md        # Agent 人设
    ├── USER.md        # 用户信息
    ├── HEARTBEAT.md   # 心跳任务
    ├── memory/        # 长期记忆
    └── skills/        # 自定义技能
```

```
src/
├── core/           # 类型和接口定义
├── application/    # 业务逻辑（Agent Loop、上下文、调度器）
├── infrastructure/ # LLM、存储、渠道、队列
├── tools/          # Agent 工具（fs、exec、web、message、spawn）
├── cli/            # 命令行界面
└── utils/          # 日志、路径工具
```

## 开发

```bash
bun run typecheck   # 类型检查
bun run dev -- ...  # 开发模式
bun run build       # 构建
```

## License

MIT
