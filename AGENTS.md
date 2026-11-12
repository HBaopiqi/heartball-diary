# 心力日记项目

这是可公开分发的程序仓库。真实记录、账号授权、密钥和导出资料存放在运行时数据目录，不能提交到版本控制。

用户要求首次安装、配置、接入或检查启动时，读取 `.agents/skills/heartball-setup/SKILL.md` 和 `AGENT-SETUP.md`，按本机实际能力完成配置；账号登录由本人完成，交付时区分已配置、已授权、已同步和已整理。

用户要求同步或整理自己的心力球日记时，读取 `.agents/skills/heartball-sync/SKILL.md`。以完整原始转写独立归纳，区分同步成功与整理完成。用户只要求开发程序时，不查询或改写任何人的日记。

前端位于 `public/`，本地服务位于 `server/`。`public/data.js` 与 `public/data.json` 是明确标记的虚构示例。修改示例可运行 `node scripts/create-demo.mjs`。

修改后运行与变更相关的测试；界面变更检查桌面、窄屏、弹窗关闭后状态恢复、档案隔离和 PDF 导出。MCP 外部服务授权、模拟服务测试和真实账号验证分别报告。
