import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { chromium, type Browser } from 'playwright-core';

// Run npm run build first: exercise the same production bundle shipped to Workers.
const BASE = 'http://127.0.0.1:41782';
const OUTPUT = resolve('doc/visual-baselines/battle-loading');
const visualOnly = process.argv.includes('--visual-only');
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--config', 'apps/web/vite.config.ts', '--host', '127.0.0.1', '--port', '41782', '--strictPort'], { stdio: 'pipe', windowsHide: true });
let serverLog = '';
server.stdout.on('data', (data) => { serverLog += data; });
server.stderr.on('data', (data) => { serverLog += data; });
let browser: Browser | undefined;
try {
  await mkdir(OUTPUT, { recursive: true });
  let ready = false;
  for (let attempt = 0; attempt < 150; attempt++) {
    assert(server.exitCode === null, serverLog);
    try { ready = (await fetch(BASE)).ok; } catch { /* 等待预览 */ }
    if (ready) break;
    await new Promise(done => setTimeout(done, 200));
  }
  assert(ready, serverLog);
  browser = await chromium.launch({ executablePath: process.env.PO_VISUAL_BROWSER ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, args: ['--use-angle=swiftshader', '--use-gl=angle'] });
  const reports: unknown[] = [];
  for (const kind of ['fast', 'slow', 'late', 'timeout', 'failure', 'pvp-timeout'] as const) {
    if (visualOnly && kind !== 'fast') continue;
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    let release = () => {};
    try {
      let save: unknown = null;
      await page.addInitScript(() => localStorage.setItem('po_token', 'isolated-battle-entry'));
      await page.route(`${BASE}/api/**`, async route => {
        const path = new URL(route.request().url()).pathname;
        const ok = (data: unknown) => route.fulfill({ json: { ok: true, data } });
        if (path === '/api/friends') return ok({ friends: [] });
        if (path === '/api/me') return ok({ playerId: 'isolated', username: '入口验收', createdAt: 0 });
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
      await page.locator('.pixi-world-viewport canvas').waitFor();
      await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
      await page.waitForFunction(() => (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.has('battle'));
      const origin = kind === 'pvp-timeout' ? '/pvp' : '/world';
      if (origin === '/pvp') await page.evaluate(async () => {
        const globals = (document.querySelector('#app') as any).__vue_app__.config.globalProperties;
        const game = globals.$pinia._s.get('game');
        game.save.pvpTeam = [game.rosterInstances[0].uid];
        await globals.$router.push('/pvp');
      });
      await page.clock.install({ time: new Date('2026-09-11T00:00:00Z') });
      await page.clock.pauseAt(new Date('2026-09-11T00:01:00Z'));
      const read = () => page.evaluate(() => {
        const stores = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s;
        const battle = stores.get('battle');
        return { now: performance.now(), time: battle.sim?.state.time ?? null, phase: battle.phase, ready: battle.assetsReady,
          save: JSON.stringify(stores.get('game').save), path: location.pathname };
      });
      const before = await read();
      let requested = false;
      const gate = new Promise<void>(done => { release = done; });
      await page.route(/\/sprites\/pmd-v1\/.*\.(png|json)$/, async route => {
        requested = true;
        if (kind === 'failure') {
          // 未显示方向也必须就绪，不能把 Promise 完成当成素材成功。
          if (route.request().url().endsWith('/0018/back.json')) return route.fulfill({ status: 404, body: 'missing' });
        } else await gate;
        await route.continue();
      });
      await page.evaluate(async (pvp) => {
        const globals = (document.querySelector('#app') as any).__vue_app__.config.globalProperties;
        const game = globals.$pinia._s.get('game');
        const battle = globals.$pinia._s.get('battle');
        const enemies = [18, 6, 16].map((speciesId, i) => ({ ...JSON.parse(JSON.stringify(game.rosterInstances[0])), uid: `entry-enemy-${i}`, speciesId, level: 7 }));
        if (!(pvp ? battle.startPvp(enemies, '入口验收') : battle.startWild(enemies, 'illusion-tower-1'))) throw new Error('No battle created');
      }, kind === 'pvp-timeout');
      await page.clock.runFor(80);
      if (kind === 'fast') await page.screenshot({ path: resolve(OUTPUT, 'fast-impact.png') });
      await page.clock.runFor(220);
      await page.evaluate(async () => (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$router.push('/battle'));
      await page.locator('.battle-entry').waitFor();
      assert.equal((await read()).save, before.save, '进入等待不能写入发现记录或其他存档字段');
      for (let attempt = 0; attempt < 100 && !requested; attempt++) {
        await page.clock.runFor(20); await page.waitForTimeout(50);
      }
      assert(requested);
      assert.equal((await read()).time, 0, '等待时战斗模拟完全停止');
      assert.equal(await page.locator('.battle-toolbar').count(), 0, '过场无跳过、倍速和暂停操作');
      assert(await page.locator('main').evaluate(element => element.hasAttribute('inert')));
      await page.keyboard.press('Space');
      await page.keyboard.press('Escape');
      await page.keyboard.press('ArrowRight');
      assert.equal((await read()).time, 0);
      assert.equal((await read()).save, before.save);
      await page.screenshot({ path: resolve(OUTPUT, `${kind}-transition.png`), animations: 'disabled' });
      if (kind === 'fast' || kind === 'slow' || kind === 'late') {
        if (kind === 'slow') await page.clock.runFor(Math.max(0, 2000 - ((await read()).now - before.now)));
        if (kind === 'late') await page.clock.runFor(Math.max(0, 9900 - ((await read()).now - before.now)));
        release();
        await page.waitForFunction(() => (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('battle').assetsReady, undefined, { polling: 50 });
        const prepared = await read();
        assert.equal(prepared.phase, 'loading'); assert.equal(prepared.time, 0);
        const revealAt = Math.max(500, prepared.now - before.now);
        await page.clock.runFor(Math.max(0, revealAt - (prepared.now - before.now)));
        assert.equal(await page.locator('.battle-entry').getAttribute('data-stage'), 'reveal');
        const duration = Math.min(500, 10000 - revealAt);
        await page.clock.runFor(Math.floor(duration / 2));
        assert.equal((await read()).time, 0, '局部展开期间不推进战斗');
        assert.equal((await read()).save, before.save, '展开未结束不写发现记录');
        assert(await page.locator('.side-panel').first().evaluate(element => getComputedStyle(element).visibility === 'hidden'));
        await page.screenshot({ path: resolve(OUTPUT, `${kind}-reveal.png`), animations: 'disabled' });
        await page.clock.runFor(Math.ceil(duration / 2) + 1);
        assert.equal((await read()).phase, 'fighting');
        await page.clock.runFor(100);
        assert((await read()).time! > 0, '就绪后才开始模拟');
        assert.equal(await page.locator('.battle-entry').count(), 0);
        await page.screenshot({ path: resolve(OUTPUT, `${kind}-started.png`), animations: 'disabled' });
      } else {
        await page.clock.runFor(Math.max(0, 9999 - ((await read()).now - before.now)));
        assert.equal((await read()).time, 0);
        await page.clock.runFor(2);
        await page.waitForURL(`**${origin}`);
        await page.clock.runFor(300);
        const cancelled = await read();
        assert.equal(cancelled.time, null);
        assert.equal(cancelled.save, before.save, '超时不得产生奖励、图鉴、治疗、捕获、战绩或位置变化');
        assert(await page.getByText('网络异常，战斗资源未能加载，已返回原场景。', { exact: true }).count());
        release(); await page.waitForTimeout(200); await page.clock.runFor(300);
        assert.equal((await read()).path, origin, '迟到资源不能重新进入战斗');
        assert.equal(await page.locator('.pixi-battle-viewport').count(), 0);
        await page.screenshot({ path: resolve(OUTPUT, `${kind}-returned.png`), animations: 'disabled' });
      }
      assert.deepEqual(errors, []);
      reports.push({ kind, passed: true });
      console.log(`✓ 战斗过场 ${kind}`);
    } finally { release(); await page.close(); }
  }
  await writeFile(resolve(OUTPUT, visualOnly ? 'visual-report.json' : 'report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), passed: true, reports }, null, 2));
} finally {
  await browser?.close();
  server.kill();
}
