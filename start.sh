#!/usr/bin/env bash
set -e
cd -- "$(dirname -- "$0")"
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' '请先安装 Node.js 22 或更新 LTS：https://nodejs.org/en/download' >&2
  exit 1
fi
exec node scripts/setup.mjs --start
