# 选你的 Agent，复制一句话

[返回首页](../README.md) · [手动上手](QUICKSTART.md) · [账号接入](MCP.md)

下面的指令是本项目提供的配置提示词。选择你已经在用的工具即可，不需要为了本项目购买或注册全部工具。

## 先选对会话

使用能够读写**你这台电脑**上的项目文件并运行终端命令的本地 Agent。先在工具里打开你想放置项目的文件夹，再粘贴对应指令；已下载项目时直接打开项目目录。

纯聊天、只读问答或云端任务可以生成建议和整理文件，但是否能安装到你的电脑取决于它实际拥有的本地工具。远程机器上的 `127.0.0.1` 也指向远程机器。只有文件上传能力时，使用[上传原文包的整理方式](QUICKSTART.md#生成第一份每日回顾)。

Agent 下载完项目后，请让工具打开实际包含 `package.json` 和 `AGENTS.md` 的 `heartball-diary` 文件夹，再检查技能是否出现。若下载到了当前文件夹的子目录，父目录与项目目录不是同一个位置；CLI 用户从实际项目目录重新进入 Agent 会话。

## 国内常见工具

### TRAE

在 TRAE 中打开本地文件夹，进入 **Agent** 会话，发送：

```text
请用当前 TRAE 的本地 Agent 能力，在独立目录部署 https://github.com/HBaopiqi/heartball-diary；先读仓库 AGENTS.md 和 AGENT-SETUP.md，运行项目安装检查，并用 node scripts/install-agent-skills.mjs --agent trae 配好两个项目技能，验证网页后引导我本人完成心力球授权和首次同步整理，每次只告诉我当前需要操作的一步。
```

脚本将两个完整技能放入当前项目的 `.trae/skills/`。重新打开项目或刷新技能后检查列表中是否出现 `heartball-setup`、`heartball-sync`。

如果你更希望直接使用 `.agents/skills/`，TRAE 的“设置 → 技能与命令 → 导入设置”提供对应目录开关；“设置 → 规则 → 导入设置”提供 AGENTS.md 导入开关。两种技能路径选一种即可，避免重复导入。[官方 Skills 说明](https://docs.trae.cn/ide_skills)、[规则说明](https://docs.trae.cn/ide_rules)

日后发送：

```text
用 heartball-sync 技能更新我的心力球日记，完成原文同步、全天整理和网站导入。
```

### Qoder

在 Qoder IDE 打开本地项目并使用 Agent，或在目标目录启动 Qoder CLI 的 `qoder` 会话，发送：

```text
请在本机配置 https://github.com/HBaopiqi/heartball-diary，先读仓库 AGENTS.md 和 AGENT-SETUP.md，运行安装与环境检查，用 node scripts/install-agent-skills.mjs --agent qoder 安装当前项目技能并确认可见，启动网页后引导我亲自授权心力球，完成首次同步整理并交代下次启动和更新方法。
```

脚本复制到 `.qoder/skills/`。CLI 从项目根目录进入 `qoder` 后，可用 `/skills reload` 刷新，再用 `/heartball-setup` 或 `/heartball-sync` 调用；IDE 按当前版本的技能入口检查。[官方任务说明](https://docs.qoder.com/cli/run-tasks)、[Skills 说明](https://docs.qoder.com/cli/Skills)、[IDE 规则](https://docs.qoder.com/user-guide/rules)

## 其他常见工具

### Codex

在 Codex 本地项目中发送；CLI 用户可以先在目标目录运行 `codex`：

```text
请在本机部署 https://github.com/HBaopiqi/heartball-diary，先读 AGENTS.md 和 AGENT-SETUP.md，使用仓库 .agents/skills 中的 heartball-setup 完成环境检查、安装、启动和页面验证，再引导我本人授权心力球，继续用 heartball-sync 完成首次同步整理，给我访问地址和以后一句话更新的方法。
```

Codex 可读取项目 `AGENTS.md` 和 `.agents/skills/`。已经打开项目时，也可明确发送 `$heartball-setup` 或 `$heartball-sync`，并说明目标资料库。[官方项目指令说明](https://learn.chatgpt.com/docs/agent-configuration/agents-md)、[Skills 说明](https://learn.chatgpt.com/docs/build-skills)

### Claude Code

在 Claude Code 的本地会话发送；CLI 用户先进入目标目录再运行 `claude`：

```text
请在本机安装并启动 https://github.com/HBaopiqi/heartball-diary，先读仓库 CLAUDE.md、AGENTS.md 和 AGENT-SETUP.md，用 node scripts/install-agent-skills.mjs --agent claude 将完整技能安装到当前项目，完成环境和页面检查后，引导我亲自完成心力球账号授权，再按 heartball-sync 整理并导入首次日记，保留已有资料与配置。
```

本项目的 `CLAUDE.md` 引用共同项目约定。配置脚本复制完整技能到 `.claude/skills/`，随后在新会话或刷新后的技能列表中检查；可使用 `/heartball-setup`、`/heartball-sync`。[官方 Skills 说明](https://code.claude.com/docs/en/skills)、[项目指令说明](https://code.claude.com/docs/en/memory)

### Cursor

打开本地文件夹，在 **Agent** 会话中发送：

```text
请用 Cursor Agent 在本机部署 https://github.com/HBaopiqi/heartball-diary，读取仓库 AGENTS.md 和 AGENT-SETUP.md，使用现有 .agents/skills 完成安装、启动与检查，确认两个心力日记技能可见，然后引导我本人授权心力球并完成首次同步整理，最后给出本地访问地址及以后更新日记的指令。
```

Cursor 支持本仓库的 `AGENTS.md` 与 `.agents/skills/`。在 Agent 输入框输入 `/` 可查找技能；如果当前版本没有显示它，明确让 Agent 读取相应 `SKILL.md` 继续执行。[官方 Agent 说明](https://cursor.com/docs/agent/overview)、[规则](https://cursor.com/docs/rules)、[Skills](https://cursor.com/docs/skills)

## English prompt

Use this in a **local agent session with filesystem and terminal access**:

```text
Set up https://github.com/HBaopiqi/heartball-diary on my computer: read AGENTS.md and AGENT-SETUP.md, install the project skills for this agent, check Node and dependencies, start and verify the local website, then guide me through signing in to my own Heartball account and authorizing access; after authorization, sync and curate the first diary using heartball-sync, preserve existing data, and give me the local URL, data location, and a one-line prompt for future updates.
```

Future updates:

```text
Use heartball-sync in this project to sync my Heartball records, read the full transcripts for affected dates, update my daily reviews, import them into the correct local profile, and verify the result.
```

The website currently uses Chinese labels. See the [English quick start](../README.en.md) for the relevant buttons. Agent availability, account requirements and regional access depend on the tools and services you use.

## 已有项目，只想配好 Skill

在**项目根目录**运行一条对应命令，或让 Agent 执行：

| 工具 | 命令 |
| --- | --- |
| Codex | `node scripts/install-agent-skills.mjs --agent codex` |
| Cursor | `node scripts/install-agent-skills.mjs --agent cursor` |
| Claude Code | `node scripts/install-agent-skills.mjs --agent claude` |
| TRAE | `node scripts/install-agent-skills.mjs --agent trae` |
| Qoder | `node scripts/install-agent-skills.mjs --agent qoder` |

Codex、Cursor 使用现有目录，无需复制；其他命令只安装本项目的两个技能。相同内容重复执行不会覆盖成别的版本；检测到用户修改过的目标文件会停止并提示。升级项目后再次运行时，如果存在差异，让 Agent 比较并保留自己的修改，再选择如何更新。

Skill 是给助手的工作说明。是否自动调用取决于工具和当前上下文；首次显式说出技能名最清楚。账号授权和系统权限按实际提示完成，不需要关闭工具的审批机制。

## 怎样判断 Agent 真正做完了

让它给出：能打开的**本机网址**、实际数据目录、启动/停止方法、账号是否连通、取回多少原文、哪些日期已完成整理。若仍在等授权，应报告“服务已启动，等待授权”；若仅取得原文，应报告“原文已同步，待整理”。

以上工具入口依据官方文档核对于 2026-11-12，菜单与技能刷新方式可能随版本调整；这些提示词不代表已逐个登录所有工具和心力球账号完成端到端验收。
