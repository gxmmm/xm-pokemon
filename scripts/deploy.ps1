# PowerShell deploy script for Windows users (equivalent to scripts/deploy.sh).
# Usage:  pwsh ./scripts/deploy.ps1   (or run in PowerShell)
$ErrorActionPreference = "Stop"
Set-Location -Path (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))

if (-not (& npx wrangler whoami 2>$null)) {
  Write-Host "==> 未登录 Cloudflare，正在登录..." -ForegroundColor Yellow
  npx wrangler login
}

$toml = Get-Content wrangler.toml -Raw
if ($toml -match 'database_id\s*=\s*"([^"]+)" -and $Matches[1] -notmatch 'REPLACE') {
  $dbId = $Matches[1]
  Write-Host "==> D1 database_id 已存在: $dbId"
} else {
  Write-Host "==> 创建 D1 数据库 pokemon-online ..." -ForegroundColor Yellow
  $out = (& npx wrangler d1 create pokemon-online) -join "`n"
  Write-Host $out
  if ($out -match 'database_id = "([^"]+)"') {
    $dbId = $Matches[1]
    $toml = $toml -replace 'database_id\s*=\s*"[^"]*"', "database_id = `"$dbId`""
    Set-Content -Path wrangler.toml -Value $toml -NoNewline
    Write-Host "==> 已写入 database_id = $dbId"
  } else {
    throw "无法解析 database_id，请手动填入 wrangler.toml 后重跑。"
  }
}

Write-Host "==> 应用数据库 schema 到远程 D1 ..." -ForegroundColor Yellow
npx wrangler d1 execute pokemon-online --remote --file=database/schema.sql

Write-Host "==> 构建前端 (vite build) ..." -ForegroundColor Yellow
npm run build:web

Write-Host "==> 部署 Worker ..." -ForegroundColor Yellow
npx wrangler deploy

Write-Host "`n✅ 部署完成！" -ForegroundColor Green
