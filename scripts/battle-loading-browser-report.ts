import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { chromium, type Browser } from 'playwright-core';

// Run npm run build first: exercise the same production bundle shipped to Workers.
const BASE = 'http://127.0.0.1:41782';
const OUTPUT = resolve('doc/visual-baselines/battle-loading');
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--config', 'apps/web/vite.config.ts', '--host', '127.0.0.1', '--port', '41782', '--strictPort'], { stdio: 'pipe', windowsHide: true });
let serverLog = '';
server.stdout.on('data', (data) => { serverLog += data; });
server.stderr.on('data', (data) => { serverLog += data; });
let browser: Browser | undefined;
let releaseBackground = () => {};
let releaseSprites = () => {};
try {
  await mkdir(OUTPUT, { recursive: true });
  let ready = false;
  for (let attempt = 0; attempt < 150; attempt++) {
    assert(server.exitCode === null, serverLog);
    try { ready = (await fetch(BASE)).ok; } catch { /* preview startup */ }
    if (ready) break;
    await new Promise((done) => setTimeout(done, 200));
  }
  assert(ready, serverLog);
  browser = await chromium.launch({ executablePath: process.env.PO_VISUAL_BROWSER ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, args: ['--use-angle=swiftshader', '--use-gl=angle'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
  await page.addInitScript(() => localStorage.setItem('po_token', 'isolated-battle-loading'));
  let save: unknown = null;
  await page.route(`${BASE}/api/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const ok = (data: unknown) => route.fulfill({ json: { ok: true, data } });
    if (path === '/api/me') return ok({ playerId: 'isolated', username: '加载验收', createdAt: 0 });
    if (path === '/api/save') {
      if (route.request().method() === 'PUT') { save = route.request().postDataJSON().save; return ok({ savedAt: Date.now() }); }
      return ok({ save });
    }
    return route.fulfill({ status: 500, json: { ok: false, error: 'Unexpected isolated API' } });
  });
  await page.goto(`${BASE}/new?renderer-observation=1`);
  await page.locator('.starter').nth(1).click();
  await page.getByRole('button', { name: /就决定是你了/ }).click();
  await page.waitForURL('**/world');
  await page.waitForFunction(() => (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.has('battle'));
  console.log('loading: isolated world ready');
  const backgroundGate = new Promise<void>((done) => { releaseBackground = done; });
  const spriteGate = new Promise<void>((done) => { releaseSprites = done; });
  let backgroundRequested = false;
  // Hold all art, then release actor images while the backdrop remains pending.
  await page.route(/\/(?:sprites|battle\/environments)\//, async (route) => {
    if (route.request().url().includes('/battle/environments/')) {
      backgroundRequested = true;
      await backgroundGate;
    } else await spriteGate;
    await route.continue();
  });
  await page.evaluate(async () => {
    // Production Vue retains its app globals. Only this fresh, mocked session is used.
    const globals = (document.querySelector('#app') as any).__vue_app__.config.globalProperties;
    const game = globals.$pinia._s.get('game');
    const battle = globals.$pinia._s.get('battle');
    const enemies = [18, 6, 16].map((speciesId, index) => ({ ...JSON.parse(JSON.stringify(game.rosterInstances[0])), uid: `loading-enemy-${index}`, speciesId, level: 7 }));
    assertStarted(battle.startWild(enemies, 'illusion-tower-1'));
    await globals.$router.push('/battle');
    function assertStarted(started: boolean) { if (!started) throw new Error('No battle created'); }
  });
  const viewport = page.locator('.pixi-battle-viewport');
  await viewport.locator('canvas').waitFor();
  console.log('loading: battle canvas mounted');
  for (let attempt = 0; attempt < 100 && !backgroundRequested; attempt++) await page.waitForTimeout(50);
  assert(backgroundRequested, 'background request not intercepted: ' + JSON.stringify({ errors, body: await page.locator('body').innerText() }));
  const diagnostics = () => page.evaluate(() => {
    function find(vnode: any): any {
      if (!vnode) return null;
      const exposed = vnode.component?.exposed;
      if (exposed?.getDiagnostics) {
        const result = exposed.getDiagnostics();
        if ('combatantCount' in result) return result;
      }
      const subtree = find(vnode.component?.subTree);
      if (subtree) return subtree;
      for (const child of Array.isArray(vnode.children) ? vnode.children : []) {
        const result = find(child);
        if (result) return result;
      }
      return null;
    }
    const result = find((document.querySelector('#app') as any)._vnode);
    if (!result) throw new Error('Missing exposed battle diagnostics');
    return result;
  });
  assert.equal((await diagnostics()).combatantCount, 4, 'pending assets must not prevent actor creation');
  console.log('loading: four actors exist with art pending');
  await page.waitForTimeout(1000);
  assert.equal(await page.evaluate(() => (window as any).__PO_RENDERER_OBSERVATION__?.().stageMounts.battle ?? 0), 0, 'test must still be waiting for art');
  assert((await diagnostics()).drawCallTotal > 0);
  await viewport.screenshot({ path: resolve(OUTPUT, 'all-art-pending.png') });
  releaseSprites();
  await page.waitForTimeout(1500);
  assert.equal((await diagnostics()).combatantCount, 4);
  assert.equal(await page.locator('.gpu-unavailable').count(), 0);
  await viewport.screenshot({ path: resolve(OUTPUT, 'background-pending.png') });
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  releaseBackground();
  await page.waitForFunction(() => (window as any).__PO_RENDERER_OBSERVATION__?.().stageMounts.battle === 1);
  assert.equal((await diagnostics()).combatantCount, 4, 'late background replaced actors');
  await viewport.screenshot({ path: resolve(OUTPUT, 'loaded.png') });
  await page.evaluate(() => (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$router.push('/world'));
  await page.waitForURL('**/world');
  await page.waitForTimeout(500);
  assert.equal(await page.locator('.pixi-battle-viewport').count(), 0);
  assert.deepEqual(errors, []);
  await writeFile(resolve(OUTPUT, 'report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), passed: true,
    checks: ['all-art-pending-actors', 'background-pending-render', 'late-background-preserves-count', 'exit-clean'], errors }, null, 2));
  console.log('✓ 发布产物：图片等待中已有4名角色，背景延迟不阻挡战斗，迟到背景保持角色，退出正常');
} finally {
  releaseBackground();
  releaseSprites();
  await browser?.close();
  server.kill();
}
