import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { chromium, type Browser } from 'playwright-core';
import type { PlayerSave } from '@pokemon-online/shared';

const PORT = 41777;
const BASE = `http://127.0.0.1:${PORT}`;
const OUTPUT = resolve('doc/visual-baselines/progress');
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'apps/web/vite.config.ts', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', windowsHide: true });
let browser: Browser | undefined;
let serverLog = '';
server.stdout?.on('data', (data) => { serverLog += data; });
server.stderr?.on('data', (data) => { serverLog += data; });
try {
  await mkdir(OUTPUT, { recursive: true });
  let ready = false;
  for (let i = 0; i < 150; i++) {
    if (server.exitCode !== null) throw new Error(serverLog);
    try { if ((await fetch(BASE)).ok) { ready = true; break; } } catch { /* startup */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert(ready, 'Vite startup timed out: ' + serverLog);
  browser = await chromium.launch({ executablePath: process.env.PO_VISUAL_BROWSER ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, args: ['--use-angle=swiftshader', '--use-gl=angle'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors: string[] = [];
  const checks: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let cloud: PlayerSave | null = null;
  let failRead = false;
  let failWrite = true;
  let failMe = false;
  let writeGate: Promise<void> | null = null;
  let writeEntered: (() => void) | undefined;
  const puts: PlayerSave[] = [];
  // All API calls stay in this browser context; no Worker or real account is used.
  await context.route(`${BASE}/api/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const ok = (data: unknown) => route.fulfill({ json: { ok: true, data } });
    const fail = () => route.fulfill({ status: 500, json: { ok: false, error: '验收：网络暂时不可用' } });
    if (path === '/api/login' || path === '/api/register') return ok({ token: 'isolated-progress-test', playerId: 'test', username: '验收玩家' });
    if (path === '/api/me') {
      if (failMe) return route.abort('failed');
      return ok({ playerId: 'test', username: '验收玩家', createdAt: 0 });
    }
    if (path === '/api/save' && route.request().method() === 'GET') return failRead ? fail() : ok({ save: cloud });
    if (path === '/api/save' && route.request().method() === 'PUT') {
      const snapshot = route.request().postDataJSON().save as PlayerSave;
      puts.push(snapshot);
      if (writeGate) {
        const gate = writeGate;
        writeGate = null;
        writeEntered?.();
        await gate;
      }
      if (failWrite) return fail();
      cloud = snapshot;
      return ok({ savedAt: Date.now() });
    }
    throw new Error('Unexpected API request: ' + path);
  });

  await page.goto(`${BASE}/login`);
  await page.getByPlaceholder('用户名（2-20位）').fill('验收玩家');
  await page.getByPlaceholder('密码（至少4位）').fill('test-password');
  await page.getByRole('button', { name: '登录', exact: true }).last().click();
  await page.waitForURL('**/new');
  await page.locator('.starter').first().click();
  await page.getByRole('button', { name: /就决定是你了/ }).click();
  await page.getByRole('alert').filter({ hasText: '伙伴已保留' }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/new');
  assert.equal(cloud, null);
  const uid = puts[0].roster[0];
  await page.screenshot({ path: resolve(OUTPUT, 'starter-save-failed.png') });
  failWrite = false;
  await page.getByRole('button', { name: '重试保存，开始冒险' }).click();
  await page.waitForURL('**/world');
  assert.equal(puts.at(-1)!.roster[0], uid);
  checks.push('无存档新建；首次保存失败保留伙伴；重试同一UID成功');

  // Direct route loading must fetch the save before deciding whether it exists.
  failRead = true;
  const beforeReads = puts.length;
  for (const path of ['/world', '/new']) {
    await page.goto(BASE + path);
    await page.waitForURL('**/load-error');
    await page.getByRole('heading', { name: '暂时无法读取进度' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: '选择你的初始伙伴' }).count(), 0);
  }
  assert.equal(puts.length, beforeReads);
  await page.screenshot({ path: resolve(OUTPUT, 'load-failed.png') });
  failRead = false;
  await page.getByRole('button', { name: '重新读取' }).click();
  await page.waitForURL('**/world');
  checks.push('直接进入/world和/new读取失败不会新建；重试恢复云端进度');

  failMe = true;
  await page.goto(`${BASE}/settings`);
  await page.waitForURL('**/load-error');
  assert.equal(await page.evaluate(() => localStorage.getItem('po_token')), 'isolated-progress-test');
  failMe = false;
  await page.getByRole('button', { name: '重新读取' }).click();
  await page.waitForURL('**/world');
  checks.push('认证请求断网保留令牌，重试可恢复');

  await page.goto(`${BASE}/settings`);
  failWrite = true;
  await page.getByRole('button', { name: '手动保存到云端' }).click();
  await page.locator('.save-error').waitFor();
  assert.equal(await page.locator('.toast.success').count(), 0);
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await page.getByRole('button', { name: '确定', exact: true }).click();
  await page.getByText('保存失败，已保留当前进度。请重试后再退出。', { exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/settings');
  assert.equal(await page.evaluate(() => localStorage.getItem('po_token')), 'isolated-progress-test');
  await page.screenshot({ path: resolve(OUTPUT, 'save-failed.png') });
  failWrite = false;
  await page.getByRole('button', { name: '重试保存', exact: true }).click();
  await page.locator('.save-error').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '手动保存到云端' }).click();
  await page.getByText('已手动保存到云端', { exact: true }).waitFor();
  checks.push('手动保存失败不报成功；退出失败保留会话；重试清除错误并更新保存状态');

  // Change a setting then immediately exit: the debounce must be flushed once.
  const beforeExit = puts.length;
  await page.getByRole('button', { name: '2x', exact: true }).click();
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await page.getByRole('button', { name: '确定', exact: true }).click();
  await page.waitForURL('**/login');
  await page.waitForTimeout(1400);
  assert.equal(puts.length, beforeExit + 1);
  assert.equal(puts.at(-1)!.settings.battleSpeed, 2);
  assert.equal(await page.evaluate(() => localStorage.getItem('po_token')), null);
  checks.push('待保存设置退出前写入一次；退出后无延迟补写');

  failRead = true;
  await page.getByPlaceholder('用户名（2-20位）').fill('验收玩家');
  await page.getByPlaceholder('密码（至少4位）').fill('test-password');
  await page.getByRole('button', { name: '登录', exact: true }).last().click();
  await page.waitForURL('**/load-error');
  failRead = false;
  await page.getByRole('button', { name: '重新读取' }).click();
  await page.waitForURL('**/world');
  await page.goto(`${BASE}/settings`);
  assert(await page.getByRole('button', { name: '2x', exact: true }).evaluate((el) => el.classList.contains('gold')));
  checks.push('重新登录读取失败可重试；退出前设置从云端恢复');

  let releaseWrite!: () => void;
  const started = new Promise<void>((resolve) => { writeEntered = resolve; });
  writeGate = new Promise<void>((resolve) => { releaseWrite = resolve; });
  const beforeSlowExit = puts.length;
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await page.getByRole('button', { name: '确定', exact: true }).click();
  await started;
  await page.getByRole('button', { name: '3x', exact: true }).click();
  releaseWrite();
  await page.waitForURL('**/login');
  await page.waitForTimeout(1400);
  assert.equal(puts.length, beforeSlowExit + 2);
  assert.equal(puts.at(-1)!.settings.battleSpeed, 3);
  checks.push('退出期间慢请求挂起时修改设置，最新快照补写成功后才退出');
  assert.deepEqual(errors, []);
  await writeFile(resolve(OUTPUT, 'report.json'), JSON.stringify({ passed: true, checks, pageErrors: errors }, null, 2));
  console.log('✓ progress browser acceptance:', checks.join('；'));
} finally {
  await browser?.close();
  server.kill();
}
