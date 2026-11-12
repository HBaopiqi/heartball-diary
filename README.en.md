# Heartball Diary

[简体中文](README.md) · [Agent-specific setup prompts](docs/AGENT_GUIDE.md)

A locally hosted diary for Heartball recordings and quick voice notes: daily reviews, timelines, source transcripts, topic progress, bookmarks, separate local profiles, and PDF reports. This is an independent community project, not an official OPPO product. The repository contains fictional demo data only.

## Let your local agent set it up

Use a local Codex, Claude Code, Cursor, TRAE, Qoder, or another agent session with access to your computer's files and terminal. Paste:

```text
Set up https://github.com/HBaopiqi/heartball-diary on my computer: read AGENTS.md and AGENT-SETUP.md, install the project skills for this agent, check Node and dependencies, start and verify the local website, then guide me through signing in to my own Heartball account and authorizing access; after authorization, sync and curate the first diary using heartball-sync, preserve existing data, and give me the local URL, data location, and a one-line prompt for future updates.
```

You complete account sign-in and system permission prompts yourself. A cloud-only or chat-only session does not automatically have access to your computer. The included instructions are primarily Chinese; ask your agent to explain each step in your preferred language.

## Start it yourself

1. Install a current [Node.js LTS](https://nodejs.org/en/download) release, version **22 or newer**.
2. [Download the repository ZIP](https://github.com/HBaopiqi/heartball-diary/archive/refs/heads/main.zip) and extract it completely.
3. On Windows, double-click `start.cmd`. On macOS or Linux, run `bash start.sh` from the extracted project directory.
4. Open the URL printed in the terminal, normally `http://127.0.0.1:3210`. Keep that terminal running.

Alternatively:

```sh
git clone https://github.com/HBaopiqi/heartball-diary.git
cd heartball-diary
npm run setup
npm start
```

The setup command installs missing project dependencies. Run `npm run doctor` for environment and port checks. You can open `public/index.html` directly to explore fictional examples offline; MCP connections require the local server.

## Connect your own Heartball account

The website currently has Chinese labels:

| Button or label | Meaning |
| --- | --- |
| 档案 | Profiles, at the top right |
| 连接心力球 | Heartball connection settings |
| MCP 服务地址 | MCP service endpoint |
| 保存设置 | Save settings |
| 连接 / 授权 | Connect / authorize |
| 打开心力球授权页面 | Open the account authorization page |
| 同步原始记录 | Sync original records |
| 载入最新记录 | Load the latest records |
| 下载原文整理包 | Download a review packet |
| 导入已整理的资料 | Import a curated dataset |
| 导出日报 | Export a PDF daily report |

The server creates an empty default profile. In its connection settings, confirm the prefilled endpoint or replace it with the address provided for your account. Complete the browser sign-in and authorization yourself, then sync. See the [connection guide](docs/MCP.md) for the currently configured endpoint and its limitations. Account support and network availability depend on the service provider and your region.

The local website is the MCP client. Your agent can use its local API to obtain a review packet; configuring the same MCP separately in every agent is usually unnecessary. First sync covers the most recent seven calendar days in Beijing time. Later syncs merge by source ID and recheck overlapping dates.

## Turn recordings into daily reviews

Syncing saves the original records. Curation is a separate step performed by your chosen agent using the project's `heartball-sync` skill. The website itself does not call a model API or require a model API key.

For later updates, open this project in your local agent and say:

```text
Use heartball-sync to sync my Heartball records, read the full transcripts for affected dates, update daily reviews and progress, import them into the correct local profile, and verify the result.
```

Codex and Cursor can use the existing `.agents/skills` directory. For Claude Code, TRAE, or Qoder, use `node scripts/install-agent-skills.mjs --agent claude`, `--agent trae`, or `--agent qoder` respectively. These commands install only the two project skills and preserve differing existing copies. See [tool-specific instructions and official references](docs/AGENT_GUIDE.md).

An agent with only file-upload support can curate an exported review packet using the included [skill](.agents/skills/heartball-sync/SKILL.md) and [dataset schema](.agents/skills/heartball-sync/references/dataset-schema.md). Import its complete JSON into the same profile afterward. Only share transcripts with an assistant you intend to use for that data.

## Your data and backups

Server data lives in `data/` by default, or in the directory selected by `HEARTBALL_DATA_DIR`. It is excluded from Git. Stop the server before backing up the whole directory; this backup includes local credentials and should remain private. Export a complete JSON dataset from each profile to migrate reviews and bookmarks. Bookmarks are otherwise stored in the browser.

The server binds to loopback only. Profiles organize your records; they are not a multi-user access-control system. PDF reports use high-resolution rendered pages, so the text is not selectable. Query end time and the actual returned recording range are reported separately.

Use `Ctrl+C` in the startup terminal to stop the service. Start it again with the same script when needed. Back up before upgrading. For a Git checkout, use `git pull --ff-only`, `npm ci`, then restart; preserve any local code changes.

## Development and support

Run `npm test`. Frontend files are in `public/`, the local server in `server/`, and the reusable skills in `.agents/skills/`.

Read the [troubleshooting guide](docs/TROUBLESHOOTING.md), or [open an issue](https://github.com/HBaopiqi/heartball-diary/issues) with your OS, Node version, steps, and a redacted error. Do not upload private transcripts or credentials.

Code is licensed under [MIT](LICENSE). Third-party dependencies retain their own licenses. Product names belong to their respective owners.
