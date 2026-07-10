#!/usr/bin/env bash
# Deploy Pokemon Online to Cloudflare (Workers + D1 + static assets).
#
# Prerequisites:
#   - Logged in to Cloudflare:  npx wrangler login
#   - npm install has been run
#
# What this does:
#   1. Creates the D1 database (if missing) and writes its id into wrangler.toml
#   2. Applies the schema to the remote database
#   3. Builds the Vue SPA into apps/web/dist
#   4. Deploys the Worker (serves SPA + /api/* + D1)
set -e
cd "$(dirname "$0")/.."

if ! npx wrangler whoami >/dev/null 2>&1; then
  echo "==> 未登录 Cloudflare，正在打开登录..."
  npx wrangler login
fi

# 1. Ensure D1 database exists
DB_ID=$(node -e "
const fs=require('fs');
const t=fs.readFileSync('wrangler.toml','utf8');
const m=t.match(/database_id\\s*=\\s*\"([^\"]+)\"/);
console.log(m&&m[1]&&!m[1].includes('REPLACE')?m[1]:'');
")

if [ -z "$DB_ID" ]; then
  echo "==> 创建 D1 数据库 pokemon-online ..."
  OUT=$(npx wrangler d1 create pokemon-online)
  echo "$OUT"
  NEW_ID=$(echo "$OUT" | grep -oE 'database_id = "[^"]+"' | head -1 | sed 's/database_id = "//;s/"//')
  if [ -z "$NEW_ID" ]; then
    echo "!! 无法解析 database_id，请手动将输出中的 id 填入 wrangler.toml 后重跑。"
    exit 1
  fi
  # Windows-safe sed replacement (works in Git Bash)
  if [[ "$OSTYPE" == "msys" || "$OS" == "Windows_NT" ]]; then
    node -e "const fs=require('fs');let t=fs.readFileSync('wrangler.toml','utf8');t=t.replace(/database_id\\s*=\\s*\"[^\"]*\"/,'database_id = \"$NEW_ID\"');fs.writeFileSync('wrangler.toml',t);"
  else
    sed -i.bak -E "s/database_id\\s*=\\s*\"[^\"]*\"/database_id = \"$NEW_ID\"/" wrangler.toml && rm -f wrangler.toml.bak
  fi
  DB_ID="$NEW_ID"
  echo "==> 已写入 database_id = $DB_ID"
else
  echo "==> D1 database_id 已存在: $DB_ID"
fi

# 2. Apply schema to remote D1
echo "==> 应用数据库 schema 到远程 D1 ..."
npx wrangler d1 execute pokemon-online --remote --file=database/schema.sql

# 3. Build SPA
echo "==> 构建前端 (vite build) ..."
npm run build:web

# 4. Deploy Worker
echo "==> 部署 Worker ..."
npx wrangler deploy

echo ""
echo "✅ 部署完成！游戏地址见 wrangler 输出的 *.workers.dev URL（或你的自定义域名）。"
echo "   提示：如需设置密码加密胡椒，运行 npx wrangler secret put AUTH_PEPPER"
