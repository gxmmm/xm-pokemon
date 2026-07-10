#!/usr/bin/env bash
# One-command local setup: install deps, init local D1, download sprites.
# Works in Git Bash on Windows, macOS, and Linux.
set -e
cd "$(dirname "$0")/.."

echo "==> 1/3 安装依赖 (npm install)"
npm install

echo "==> 2/3 初始化本地 D1 数据库 (wrangler d1 execute --local)"
npx wrangler d1 execute pokemon-online --local --file=database/schema.sql || {
  echo "!! 本地 D1 执行失败。首次运行 wrangler dev 时会自动创建本地 D1，重试本命令即可。"
}

echo "==> 3/3 下载宝可梦素材"
node scripts/download-sprites.mjs

echo ""
echo "✅ 本地环境就绪。运行 'npm run dev' 开始开发。"
