import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import type { RendererObservationReport } from '../apps/web/src/visuals/runtime-observation.ts';

const PORT = 41775;
const BASE = `http://127.0.0.1:${PORT}`;
const OUTPUT = resolve('doc/visual-baselines/battle');
const BIOMES = ['grass', 'cave', 'water', 'dragon', 'arena'] as const;
declare global {
  interface Window {
    __BATTLE_BROWSER_TASKS__: () => { frames: number; observers: number };
  }
}

async function report(page: Page): Promise<RendererObservationReport> {
  const value = await page.evaluate(() => window.__PO_RENDERER_OBSERVATION__?.());
  assert(value, 'missing renderer observation');
  return value;
}

async function heap(page: Page): Promise<number> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('HeapProfiler.collectGarbage');
    const { usedSize } = await cdp.send('Runtime.getHeapUsage');
    assert(Number.isFinite(usedSize) && usedSize > 0, 'missing browser heap measurement');
    return usedSize;
  } finally { await cdp.detach(); }
}

async function waitForBattle(page: Page, mounts: number, biome: string): Promise<void> {
  await page.waitForFunction(({ mounts, biome }) => {
    const report = window.__PO_RENDERER_OBSERVATION__?.();
    const last = report?.samples.at(-1)?.diagnostics;
    return report && report.stageMounts.battle >= mounts && last?.biomeId === biome
      && last.canvasCount === 1 && Number(last.drawCallTotal) > 0;
  }, { mounts, biome });
}

async function selectTeams(page: Page): Promise<void> {
  for (const id of ['006', '025', '094']) await page.locator('.species-choice').filter({ hasText: `#${id}` }).click();
  await page.locator('.enemy-panel').click();
  for (const id of ['003', '009', '143']) await page.locator('.species-choice').filter({ hasText: `#${id}` }).click();
}

async function main(): Promise<void> {
  await mkdir(OUTPUT, { recursive: true });
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'apps/web/vite.config.ts', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', windowsHide: true });
  let serverLog = '';
  server.stdout.on('data', (chunk) => { serverLog = (serverLog + chunk).slice(-4000); });
  server.stderr.on('data', (chunk) => { serverLog = (serverLog + chunk).slice(-4000); });
  let browser: Browser | undefined;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 150; attempt++) {
      assert(server.exitCode === null, `Vite exited: ${serverLog}`);
      try { ready = (await fetch(BASE)).ok; } catch { /* local server is still starting */ }
      if (ready) break;
      await new Promise((done) => setTimeout(done, 200));
    }
    assert(ready, `Vite startup timed out: ${serverLog}`);
    browser = await chromium.launch({ executablePath: process.env.PO_VISUAL_BROWSER ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, args: ['--use-angle=swiftshader', '--use-gl=angle', '--disable-gpu-vsync'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(() => {
      // Count pending work without changing callbacks or renderer state.
      const frames = new Set<number>();
      const observers = new Set<ResizeObserver>();
      const request = window.requestAnimationFrame.bind(window);
      const cancel = window.cancelAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) => {
        const id = request((now) => { frames.delete(id); callback(now); });
        frames.add(id);
        return id;
      };
      window.cancelAnimationFrame = (id) => { frames.delete(id); cancel(id); };
      const NativeObserver = window.ResizeObserver;
      window.ResizeObserver = class extends NativeObserver {
        override observe(target: Element, options?: ResizeObserverOptions) { observers.add(this); super.observe(target, options); }
        override disconnect() { observers.delete(this); super.disconnect(); }
      };
      window.__BATTLE_BROWSER_TASKS__ = () => ({ frames: frames.size, observers: observers.size });
    });

    await page.goto(`${BASE}/battle-sandbox?renderer-observation=1`, { waitUntil: 'networkidle' });
    await selectTeams(page);
    const idleTasks = await page.evaluate(() => window.__BATTLE_BROWSER_TASKS__());
    // Keep the initial background load pending until the component is removed.
    let release!: () => void;
    let intercepted = false;
    const gate = new Promise<void>((done) => { release = done; });
    await page.route('**/battle/environments/grass-clearing-v1.png', async (route) => {
      intercepted = true;
      await gate;
      await route.continue();
    });
    await page.locator('.start-button').click();
    for (let attempt = 0; attempt < 100 && !intercepted; attempt++) await page.waitForTimeout(100);
    assert(intercepted, 'slow-load case did not intercept the real background request');
    await page.getByRole('button', { name: '返回选队', exact: true }).click();
    release();
    await page.waitForLoadState('networkidle');
    await page.unroute('**/battle/environments/grass-clearing-v1.png');
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('canvas').count(), 0, 'late loading reattached a canvas');
    assert.equal(await page.evaluate(() => window.__PO_RENDERER_OBSERVATION__?.().stageMounts.battle ?? 0), 0, 'removed viewport emitted ready');
    assert.deepEqual(await page.evaluate(() => window.__BATTLE_BROWSER_TASKS__()), idleTasks, 'abandoned mount left browser tasks');
    console.log('✓ actual browser: exit during background loading');

    const heaps: number[] = [];
    for (let cycle = 0; cycle < 6; cycle++) {
      const biome = BIOMES[cycle % BIOMES.length]!;
      await page.locator('.setup-footer select').selectOption(biome);
      await page.locator('.start-button').click();
      await waitForBattle(page, cycle + 1, biome);
      await page.waitForTimeout(5000);
      if (cycle === 0) {
        await page.getByRole('button', { name: '暂停', exact: true }).click();
        await page.locator('.sandbox-battle').screenshot({ path: resolve(OUTPUT, 'battle-desktop.png') });
        await page.setViewportSize({ width: 390, height: 844 });
        const narrow = await page.locator('.app-stage').evaluate((element) => ({ width: element.getBoundingClientRect().width, transform: getComputedStyle(element).transform }));
        assert.equal(narrow.transform, 'none', 'responsive sandbox was scaled twice');
        assert.equal(narrow.width, 390, 'responsive sandbox did not fill the viewport');
        assert(await page.locator('.arena').evaluate((element) => element.getBoundingClientRect().height >= 400), 'narrow battlefield became a miniature');
        await page.locator('.sandbox-battle').screenshot({ path: resolve(OUTPUT, 'battle-narrow.png') });
        await page.setViewportSize({ width: 1280, height: 900 });
      }
      const active = (await report(page)).samples.at(-1)!.diagnostics;
      assert.equal(active.combatantCount, 6, '3v3 combatants missing');
      assert.equal(await page.locator('canvas').count(), 1);
      // Restart without unmounting the viewport, then exit through the real UI.
      await page.getByRole('button', { name: '使用同一选择重新随机', exact: true }).click();
      await page.waitForTimeout(1500);
      await page.getByRole('button', { name: '返回选队', exact: true }).click();
      const countAfterExit = (await report(page)).samples.length;
      await page.waitForTimeout(1200);
      assert.equal((await report(page)).samples.length, countAfterExit, 'observation timer survived unmount');
      assert.equal(await page.locator('canvas').count(), 0);
      assert.deepEqual(await page.evaluate(() => window.__BATTLE_BROWSER_TASKS__()), idleTasks, 'unmounted battle left frames or observers');
      heaps.push(await heap(page));
      console.log(`✓ actual browser: 3v3 mount/restart/exit ${cycle + 1}/6 (${biome})`);
    }
    const lifecycle = await report(page);
    const heapDelta = heaps.at(-1)! - heaps[1]!; // Warm up shared assets before comparing.
    assert(heapDelta < 32 * 1024 * 1024, `post-warmup heap growth exceeded 32 MiB: ${heapDelta}`);

    await page.goto(`${BASE}/battle-stage-sandbox?visual-regression=1&renderer-observation=1`, { waitUntil: 'networkidle' });
    await waitForBattle(page, 1, 'grass');
    for (let cycle = 0; cycle < 3; cycle++) {
      for (const biome of BIOMES) await page.locator('.controls select').nth(1).selectOption(biome);
      await waitForBattle(page, 1, 'arena');
      assert.equal((await report(page)).samples.at(-1)!.diagnostics.combatantCount, 4);
    }
    await page.getByRole('button', { name: '开始', exact: true }).click();
    for (let interval = 0; interval < 6; interval++) {
      await page.waitForTimeout(10000);
      console.log(`  sustained battle observation: ${(interval + 1) * 10}s`);
    }
    const sustained = await report(page);
    assert(sustained.samples.length >= 50, 'sustained renderer observation stopped early');
    assert(sustained.samples.every((sample) => sample.diagnostics.canvasCount === 1), 'sustained run duplicated its canvas');
    assert.equal(errors.length, 0, `browser errors: ${errors.join('\n')}`);
    await page.screenshot({ path: resolve(OUTPUT, 'battle-sustained.png') });
    await writeFile(resolve(OUTPUT, 'report.json'), JSON.stringify({ browser: 'Chrome / SwiftShader (not native GPU performance)', cycles: 6, rapidBiomeChanges: 15, sustainedSeconds: 60, heaps, heapDelta, errors, lifecycle, sustained }, null, 2));
    console.log(`✓ battle browser acceptance: heap delta ${heapDelta} bytes; no leftover frames/observers; no console errors`);
  } finally {
    await browser?.close();
    if (server.exitCode === null) server.kill();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
