# Agent 首次配置流程

供能操作用户本机文件和终端的 Agent 执行。用户版入口见 [各 Agent 配置指令](docs/AGENT_GUIDE.md)。目标是让用户在自己的电脑打开日记、连接自己的心力球，并在授权后完成首次同步和整理。

## 1. 定位本地项目

读取 `AGENTS.md`。已有本项目时复用用户选择的目录，检查 `git status` 和现有 `data/`，保留其文件。首次下载时，在用户指定位置或当前工作区创建独立的 `heartball-diary` 子目录；优先使用公开仓库 `https://github.com/HBaopiqi/heartball-diary.git`，没有 Git 时可下载 GitHub 官方 ZIP 并完整解压。

若当前环境是云端沙箱、只读问答或无法访问用户电脑，说明可执行范围，将 [QUICKSTART.md](docs/QUICKSTART.md) 的本机步骤交给用户，不把云端启动成功描述为已在用户电脑安装。

下载后将后续命令的工作目录切到实际包含 `package.json` 和 `AGENTS.md` 的项目根目录。项目级技能应在这个目录的 Agent 会话中发现；若编辑器仍打开父目录，指导用户打开实际项目文件夹；CLI 必要时从该目录重新进入会话。不要只在父目录刷新技能后就宣称安装已生效。

## 2. 检查环境并安装依赖

要求 Node.js >= 22 和 npm。执行 `node --version`、`node scripts/doctor.mjs --json`；缺少 Node 时使用 [Node.js 官方安装说明](https://nodejs.org/en/download)，遵守本机软件安装权限，安装后重新检查。

在项目根目录运行 `node scripts/setup.mjs` 或 `npm run setup`。脚本使用锁文件安装项目依赖，已有合格依赖时跳过；不要重复发起并行安装。失败时保留具体报错，按 [故障排查](docs/TROUBLESHOOTING.md) 处理。不要擅自全局切换 registry、代理或关闭证书检查。

## 3. 让当前 Agent 找到技能

两项规范技能均在 `.agents/skills/`：`heartball-setup` 用于首次配置，`heartball-sync` 用于每日整理。

| 当前工具 | 项目内配置方式 |
| --- | --- |
| Codex / Cursor | 直接读取现有 `.agents/skills`，首次请求明确读取所需 `SKILL.md` |
| Claude Code | `node scripts/install-agent-skills.mjs --agent claude` |
| TRAE | `node scripts/install-agent-skills.mjs --agent trae`；复制到原生项目技能目录 |
| Qoder | `node scripts/install-agent-skills.mjs --agent qoder` |
| 其他本地 Agent | 显式读取两个完整 `SKILL.md` 及其引用文件；按当前工具的官方规则安装项目技能 |

配置脚本只处理本仓库的两个技能，不改变全局配置。若目标已有不同内容，先保留并检查差异；不要直接覆盖用户自己的版本。按工具需要刷新技能或重新打开项目，并检查实际是否可见；无法检查时如实报告。

## 4. 启动并确认可访问

先检查选定端口：已有服务也可能来自另一份项目，须确认对应的用户目录与资料库再复用；不关闭不明进程。端口冲突时选择空闲端口，通过 `PORT` 仅配置本次启动，并记录真实地址。

使用 `npm start`，或通过当前 Agent 的受支持长期终端运行 `node server/index.mjs`。默认只监听本机 `127.0.0.1`。不要在用户未要求时改成公网监听或安装开机自启。

访问实际地址的 `/api/health`，核对响应；工具可用时打开首页核对空资料库及“档案”入口。告诉用户需要保持哪个启动窗口运行，如何再次启动和停止。只有健康检查成功才报告“服务已启动”。

## 5. 连接用户账号

从 `GET /api/profiles` 确认目标资料库，存在多份而用户未选定时先澄清。使用默认资料库或按用户明确选择创建；不把公开虚构示例导入成本人记录。

按 [MCP 接入说明](docs/MCP.md) 引导用户在网页连接。Agent 可通过本机 API 获取授权链接：先 `GET /api/session` 取 `csrfToken`，对 `POST /api/mcp/connect?profile=ID` 发送 `{}`，使用本机服务 Origin 和 `X-CSRF-Token` 请求头。需要修改地址时 `PUT /api/settings?profile=ID`，正文为 `{"mcp":{"endpoint":"用户确认的地址"}}`。

只打开返回的 HTTP(S) 授权地址，登录与确认授权由本人完成；不索要密码，不复制其他 Agent 或其他资料库的令牌。等待用户完成后重新检查连接。跨站回调或授权失败时重试新链接，不宣称已接通。

## 6. 首次同步与交付

账号连通后，按 [.agents/skills/heartball-sync/SKILL.md](.agents/skills/heartball-sync/SKILL.md) 完成原文同步、全文阅读、独立整理与导入；第一次默认最近 7 个自然日，用户指定其他范围时按其要求查询。读取范围不完整或材料过长时保留进度与待整理状态。

最终给用户一份简短交接：本地访问地址、项目与实际数据目录、启动/停止方法、账号连接与同步/整理的真实状态，以及“以后说什么”。建议下次指令为：

> 更新心力球，整理新增内容并更新我的日记。

区分“环境已配置”“已启动”“已授权”“原文已同步”“回顾已整理”，只报告实际达到的阶段。分享排错信息时移除私人原文、凭据和账号信息。
