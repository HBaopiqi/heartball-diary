@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto missing_node
node scripts\setup.mjs --start
if errorlevel 1 goto failed
pause
exit /b 0
:missing_node
echo 请先安装 Node.js 22 或更新的 LTS 版本，然后重新打开此脚本。
echo https://nodejs.org/en/download
:failed
echo 启动未完成。请查看上方提示及 docs\TROUBLESHOOTING.md。
pause
exit /b 1
