#!/usr/bin/env node
/**
 * Friendly postinstall check. Prints next-step hints. Never fails (postinstall
 * is wrapped in `|| true`). Run manually any time: `node scripts/check-env.mjs`.
 */
import { execSync } from 'node:child_process';

const ver = process.versions.node;
const major = parseInt(ver.split('.')[0], 10);

console.log('\n  Pokemon Online - environment check');
console.log('  -----------------------------------');
console.log(`  Node.js : ${ver} ${major >= 18 ? '✓' : '✗ (需要 >= 18)'}`);

function have(cmd) {
  try { execSync(`${cmd} --version`, { stdio: 'ignore' }); return true; } catch { return false; }
}

const wrangler = have('npx --no-install wrangler') || have('wrangler');
console.log(`  wrangler : ${wrangler ? '✓' : '— (将在 npm install 后可用)'}`);

console.log('\n  下一步:');
console.log('    1. npm run db:apply        # 初始化本地 D1 数据库');
console.log('    2. npm run assets:download # 下载宝可梦素材（首次）');
console.log('    3. npm run dev             # 启动本地开发（前端+后端）');
console.log('    4. npm run deploy          # 部署到 Cloudflare');
console.log('');
