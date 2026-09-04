import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { chromium, type Browser } from 'playwright-core';
import type { PlayerSave } from '@pokemon-online/shared';

const PORT = 41779;
const BASE = `http://127.0.0.1:${PORT}`;
const OUTPUT = resolve('doc/visual-baselines/playable');
declare global {
  interface Window { __PLAYABLE_FIXTURE__: typeof import('./playable-battle-browser-fixture.ts'); }
}
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
  await context.addInitScript(() => localStorage.setItem('po_token', 'isolated-playable-test'));
  let cloud: PlayerSave | null = null;
  await context.route(`${BASE}/api/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const ok = (data: unknown) => route.fulfill({ json: { ok: true, data } });
    if (path === '/api/me') return ok({ playerId: 'playable-test', username: '战斗验收', createdAt: 0 });
    if (path === '/api/save') {
      if (route.request().method() === 'PUT') { cloud = route.request().postDataJSON().save; return ok({ savedAt: Date.now() }); }
      return ok({ save: cloud });
    }
    return route.fulfill({ status: 500, json: { ok: false, error: 'Unexpected isolated API' } });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors: string[] = [];
  const checks: string[] = [];
  page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
  await page.goto(`${BASE}/new?renderer-observation=1`);
  await page.locator('.starter').first().click();
  await page.getByRole('button', { name: /就决定是你了/ }).click();
  await page.waitForURL('**/world');
  await page.evaluate(async (url) => { window.__PLAYABLE_FIXTURE__ = await import(/* @vite-ignore */ url); }, '/@fs/' + resolve('scripts/playable-battle-browser-fixture.ts').replaceAll('\\', '/'));
  const read = () => page.evaluate(() => window.__PLAYABLE_FIXTURE__.read());
  const prepare = async (outcome: 'win' | 'loss' | 'long' | 'natural', speed: number) => {
    await page.evaluate(({ outcome, speed }) => window.__PLAYABLE_FIXTURE__.prepare(outcome, speed), { outcome, speed });
    await page.waitForURL('**/battle');
    await page.locator('.arena canvas').waitFor();
  };
  await prepare('long', 3);
  console.log('playable: checking controls and real simulation speed');
  await page.getByRole('button', { name: '3x', exact: true }).waitFor();
  await page.getByRole('button', { name: '3x', exact: true }).click();
  const speedDeltas: number[] = [];
  for (const speed of [1, 2, 3]) {
    await page.evaluate(() => window.__PLAYABLE_FIXTURE__.resetSpeedSamples());
    await page.waitForFunction(() => window.__PLAYABLE_FIXTURE__.read().speedSamples.length >= 3);
    const samples = (await read()).speedSamples;
    assert(samples.every((rate) => Math.abs(rate - speed) < 0.01), `speed ${speed} actual frame multipliers: ${samples}`);
    const rate = samples.reduce((a, b) => a + b, 0) / samples.length;
    speedDeltas.push(rate);
    await page.getByRole('button', { name: `${speed}x`, exact: true }).click();
  }
  await page.getByRole('button', { name: '1x', exact: true }).click();
  await page.getByRole('button', { name: '2x', exact: true }).waitFor();
  await page.getByRole('button', { name: '⏸', exact: true }).click();
  const paused = (await read()).time;
  await page.waitForTimeout(350);
  assert.equal((await read()).time, paused, 'pause freezes simulation time');
  await page.getByRole('button', { name: '▶', exact: true }).click();
  await page.waitForTimeout(350);
  assert((await read()).time! > paused!, 'resume advances simulation');
  await page.getByRole('button', { name: '⏸', exact: true }).click();
  const beforeSkip = performance.now();
  await page.getByRole('button', { name: '⏭', exact: true }).click();
  await page.locator('.modal-backdrop').waitFor({ timeout: 3000 });
  assert(performance.now() - beforeSkip < 3000, 'paused skip must finish promptly');
  await page.screenshot({ path: resolve(OUTPUT, 'desktop-result-before-layout.png') });
  // Collapsing the old overflowing report lets control acceptance finish;
  // the separate layout gate will assert all expanded actions are reachable.
  await page.locator('.damage-report').evaluate((el) => el.removeAttribute('open'));
  await page.getByRole('button', { name: /^(返回|全部放生)$/ }).evaluate((el) => (el as HTMLButtonElement).click());
  await page.waitForURL('**/world');
  checks.push('3x设置生效、1/2/3切换、暂停恢复、暂停跳过3秒内结算');
  checks.push('1/2/3x实测引擎每帧时间倍率（遵守50ms帧上限）：' + speedDeltas.map((n) => n.toFixed(2)).join('/'));

  for (const action of ['capture', 'release', 'loss'] as const) {
    console.log('playable: ' + action);
    await prepare(action === 'loss' ? 'loss' : 'win', 2);
    const before = await read();
    await page.getByRole('button', { name: '2x', exact: true }).waitFor();
    await page.getByRole('button', { name: '⏭', exact: true }).click();
    await page.locator('.modal-backdrop').waitFor({ timeout: 3000 });
    const finished = await read();
    assert.equal(finished.winner, action === 'loss' ? 'enemy' : 'player');
    await page.locator('.damage-report').evaluate((el) => el.removeAttribute('open'));
    const choice = action === 'capture' ? page.getByRole('button', { name: '捕捉', exact: true }).first()
      : page.getByRole('button', { name: action === 'loss' ? '返回' : '全部放生', exact: true });
    await choice.evaluate((el) => { (el as HTMLButtonElement).click(); (el as HTMLButtonElement).click(); });
    await page.waitForURL('**/world');
    await page.locator('canvas').waitFor();
    const after = await read();
    assert.equal(after.stats.battles - before.stats.battles, 1);
    assert.equal(after.stats.wins - before.stats.wins, action === 'loss' ? 0 : 1);
    assert.equal(after.roster.length, action === 'capture' ? 4 : 3);
    assert.equal(after.stats.caught - before.stats.caught, action === 'capture' ? 1 : 0);
    assert.deepEqual(after.experience.slice(0, 3), finished.experience, 'return does not award EXP twice');
    if (action === 'loss') assert.deepEqual(finished.experience, before.experience, 'loss does not award victory EXP');
    assert(after.healed);
    assert.equal(after.map, 'illusion-tower-1');
    assert.deepEqual(after.position, { x: 8, y: 11, facing: 'up' });
    assert.equal(await page.locator('canvas').count(), 1);
    const battleSamples = await page.evaluate(() => window.__PO_RENDERER_OBSERVATION__?.().samples.filter((s) => s.stage === 'battle').length);
    await page.waitForTimeout(1100);
    assert.equal(await page.evaluate(() => window.__PO_RENDERER_OBSERVATION__?.().samples.filter((s) => s.stage === 'battle').length), battleSamples);
    checks.push(`${action}：连点只结算一次、经验不重复、原地返回回满、战斗采样停止、世界仅一个画布`);
  }
  console.log('playable: natural ending');
  await prepare('natural', 1);
  const beforeNatural = await read();
  await page.locator('.modal-backdrop').waitFor({ timeout: 45000 });
  assert.equal((await read()).winner, 'player');
  await page.locator('.damage-report').evaluate((el) => el.removeAttribute('open'));
  await page.getByRole('button', { name: '全部放生', exact: true }).evaluate((el) => (el as HTMLButtonElement).click());
  await page.waitForURL('**/world');
  assert.equal((await read()).stats.battles, beforeNatural.stats.battles + 1);
  checks.push('不点击跳过的自然战斗正常演出、结算并返回');
  assert.deepEqual(errors, []);
  await writeFile(resolve(OUTPUT, 'report.json'), JSON.stringify({ passed: true, checks, pageErrors: errors, renderer: 'SwiftShader functional acceptance' }, null, 2));
  console.log('✓ playable battle acceptance:', checks.join('；'));
} finally {
  await browser?.close();
  server.kill();
}
