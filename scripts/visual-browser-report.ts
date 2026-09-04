import { MAPS } from '@pokemon-online/config';
import { chromium, type Browser, type Page } from 'playwright-core';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const PORT = 41773;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const BASELINE_DIR = resolve(ROOT, 'doc/visual-baselines');
const ARTIFACT_DIR = resolve(BASELINE_DIR, 'artifacts');
const MANIFEST_PATH = resolve(BASELINE_DIR, 'manifest.json');
const CHROME_PATH = process.env.PO_VISUAL_BROWSER ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const UPDATE = process.argv.includes('--update');
const MAP_IDS = MAPS.map((map) => map.id);

type MatrixEntry = { mapId: typeof MAP_IDS[number]; file: string; sha256: string; diagnostics: Record<string, unknown> };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function waitForServer(server: ChildProcess): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    if (server.exitCode !== null) throw new Error(`Vite visual server exited early (${server.exitCode})`);
    try {
      const response = await fetch(`${BASE_URL}/world-stage-sandbox`);
      if (response.ok) return;
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Timed out waiting for Vite visual server');
}

function startServer(): ChildProcess {
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--config', 'apps/web/vite.config.ts', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'pipe',
    windowsHide: true,
  });
  server.stdout?.on('data', (chunk) => process.stdout.write(chunk));
  server.stderr?.on('data', (chunk) => process.stderr.write(chunk));
  return server;
}

async function stopServer(server: ChildProcess): Promise<void> {
  if (server.exitCode !== null) return;
  server.kill();
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (server.exitCode === null) server.kill('SIGKILL');
}

async function capture(page: Page, mapId: typeof MAP_IDS[number]): Promise<MatrixEntry> {
  const query = new URLSearchParams({ 'visual-regression': '1', 'visual-scene': mapId });
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') pageErrors.push(message.text()); });
  await page.goto(`${BASE_URL}/world-stage-sandbox?${query}`, { waitUntil: 'networkidle' });
  try {
    await page.waitForFunction(() => document.documentElement.dataset.visualRegressionReady === 'true');
  } catch (error) {
    throw new Error(`${mapId}: sandbox did not become ready; url=${page.url()}; errors=${pageErrors.join(' | ') || 'none'}; body=${(await page.locator('body').innerText()).slice(0, 300)}`);
  }
  assert(pageErrors.length === 0, mapId + ': ' + pageErrors.join(' | '));
  const diagnostics = await page.evaluate(() => window.__WORLD_STAGE_DIAGNOSTICS__?.());
  assert(diagnostics, `${mapId}: missing WorldStage diagnostics`);
  assert(diagnostics.sceneId && diagnostics.motionEnabled === false, `${mapId}: unstable WorldStage visual-regression state`);
  const viewport = page.getByTestId('world-stage-viewport');
  await viewport.screenshot({ path: resolve(ARTIFACT_DIR, `${mapId}.actual.png`), animations: 'disabled' });
  const content = await readFile(resolve(ARTIFACT_DIR, `${mapId}.actual.png`));
  return { mapId, file: `${mapId}.png`, sha256: createHash('sha256').update(content).digest('hex'), diagnostics: diagnostics as Record<string, unknown> };
}

async function worldDiagnostics(page: Page): Promise<Record<string, unknown>> {
  const diagnostics = await page.evaluate(() => window.__WORLD_STAGE_DIAGNOSTICS__?.());
  assert(diagnostics, 'missing WorldStage diagnostics');
  return diagnostics as Record<string, unknown>;
}

async function assertSingleWorldSurface(page: Page, label: string): Promise<void> {
  assert(await page.locator('[data-testid="world-stage-viewport"] canvas').count() === 1, `${label}: expected exactly one WorldStage canvas`);
}

async function lifecycleObservation(page: Page, expectedEntries: readonly MatrixEntry[]): Promise<Record<string, unknown>> {
  const cdp = await page.context().newCDPSession(page);
  const heapUsed = async (): Promise<number> => {
    await cdp.send('HeapProfiler.collectGarbage');
    const { usedSize } = await cdp.send('Runtime.getHeapUsage');
    assert(Number.isFinite(usedSize) && usedSize > 0, 'Chrome did not return a valid heap measurement');
    return usedSize;
  };
  const sceneIdFor = (mapId: typeof MAP_IDS[number]) => expectedEntries.find((entry) => entry.mapId === mapId)?.diagnostics.sceneId;
  const baseQuery = new URLSearchParams({ 'visual-regression': '1', 'visual-scene': 'pallet' });
  await page.goto(`${BASE_URL}/world-stage-sandbox?${baseQuery}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.documentElement.dataset.visualRegressionReady === 'true');
  const beforeHeap = await heapUsed();
  const switchChecks: Array<Record<string, unknown>> = [];
  for (let cycle = 0; cycle < 3; cycle++) {
    for (const mapId of MAP_IDS) {
      await page.locator('select').nth(0).selectOption(mapId);
      await page.waitForFunction((sceneId) => window.__WORLD_STAGE_DIAGNOSTICS__?.().sceneId === sceneId, sceneIdFor(mapId));
      const diagnostics = await worldDiagnostics(page);
      assert(diagnostics.motionEnabled === false && diagnostics.preloadKeyCount === 1, `cycle ${cycle}/${mapId}: scene-local visual mode drifted`);
      await assertSingleWorldSurface(page, `cycle ${cycle}/${mapId}`);
      switchChecks.push({ cycle, mapId, diagnostics });
    }
    // Navigate through the separate BattleStage sandbox so the WorldStage unmount
    // lifecycle is exercised, then return to a fresh WorldStage instance.
    await page.goto(`${BASE_URL}/battle-stage-sandbox?visual-regression=1`, { waitUntil: 'networkidle' });
    await page.getByText('Pixi BattleStage 垂直切片').waitFor();
    await page.goto(`${BASE_URL}/world-stage-sandbox?${baseQuery}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.visualRegressionReady === 'true');
    await assertSingleWorldSurface(page, `world-battle-world ${cycle}`);
  }
  const afterHeap = await heapUsed();
  const deltaBytes = afterHeap - beforeHeap;
  // This is intentionally a broad environmental threshold. Exact heap values
  // vary by Chrome/GPU driver; structural canvas/diagnostic checks above are the
  // hard regression gate while this catches sustained runaway allocations.
  assert(deltaBytes < 32 * 1024 * 1024, `World → battle → World heap growth exceeded 32 MiB (${deltaBytes})`);
  await cdp.detach();
  return { cycles: 3, sceneSwitches: switchChecks.length, beforeHeap, afterHeap, deltaBytes };
}


/** Exercises production routes against memory-only API responses, never a Worker or player database. */
async function playableWorldObservation(browser: Browser): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  let saved: import('@pokemon-online/shared').PlayerSave | null = null;
  const errors: string[] = [];
  try {
    await context.addInitScript(() => {
      localStorage.setItem('po_token', 'world-regression-only');
      sessionStorage.setItem('pokemon-online.renderer-observation.v1', '1');
    });
    await context.route(BASE_URL + '/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      let data: unknown;
      if (path === '/api/me') data = { playerId: 'world-regression', username: 'world-regression', createdAt: 0 };
      else if (path === '/api/save') {
        if (route.request().method() === 'PUT') {
          saved = route.request().postDataJSON().save;
          data = { savedAt: Date.now() };
        } else data = { save: saved };
      } else {
        errors.push('Unexpected API call: ' + path);
        await route.fulfill({ status: 500, json: { ok: false, error: 'Unexpected test API' } });
        return;
      }
      await route.fulfill({ json: { ok: true, data } });
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    const pending = new Set<string>();
    page.on('request', (request) => pending.add(request.url()));
    page.on('requestfinished', (request) => pending.delete(request.url()));
    page.on('requestfailed', (request) => pending.delete(request.url()));
    console.log('world flow: opening new game');
    await page.goto(BASE_URL + '/new?renderer-observation=1');
    await page.locator('.starter').first().click();
    await page.getByRole('button', { name: /就决定是你了/ }).click();
    const at = async (mapId: string, x: number, y: number): Promise<void> => {
      await page.waitForFunction(({ mapId, x, y }) => {
        const state = window.__PO_WORLD_BEHAVIOR_DIAGNOSTICS__?.();
        return state?.mapId === mapId && state.position.x === x && state.position.y === y && !state.moving && !state.transitioning;
      }, { mapId, x, y }).catch(() => { throw new Error('Expected ' + mapId + ' at ' + x + ',' + y + '; url=' + page.url() + '; errors=' + errors.join(' | ')); });
      await page.locator('.transition-overlay').waitFor({ state: 'hidden' });
      console.log('world flow: ' + mapId + ' ' + x + ',' + y);
    };
    console.log('world flow: entered town');
    await at('pallet', 8, 6);
    assert(saved && !('story' in saved), 'fresh saves must not contain story state');
    await page.getByRole('button', { name: '🗺 地图' }).click();
    assert(await page.locator('.region-map svg g').count() === 2, 'region map contains only town and tower');
    await page.keyboard.press('ArrowLeft');
    await at('pallet', 8, 6); // The map overlay must block movement.
    await page.getByRole('button', { name: '✕', exact: true }).click();
    await page.keyboard.press('ArrowLeft'); await at('pallet', 7, 6);
    await page.keyboard.press('ArrowUp'); await at('pallet', 7, 5);
    await page.keyboard.press('ArrowUp'); await at('illusion-tower-1', 8, 12);
    await page.keyboard.press('ArrowDown'); await at('pallet', 7, 5);
    await page.keyboard.press('ArrowUp'); await at('illusion-tower-1', 8, 12);
    // Suppress random encounters only for this navigation step, then force a single low-level encounter until navigation completes.
    await page.evaluate(() => { Math.random = () => 0.99; });
    await page.keyboard.press('ArrowUp'); await at('illusion-tower-1', 8, 11);
    await page.evaluate(() => { Math.random = () => crypto.getRandomValues(new Uint32Array(1))[0]! / 0x100000000 * 0.1; });
    await page.keyboard.press('ArrowDown');
    await page.waitForURL('**/battle').catch(async () => {
      const state = await Promise.race([page.evaluate(() => ({ world: window.__PO_WORLD_BEHAVIOR_DIAGNOSTICS__?.(), random: Math.random() })), new Promise((resolve) => setTimeout(() => resolve('unresponsive'), 3000))]);
      throw new Error('Battle navigation failed: ' + JSON.stringify({ state, pending: [...pending] }) + '; ' + errors.join(' | '));
    });
    await page.evaluate(() => { Math.random = () => crypto.getRandomValues(new Uint32Array(1))[0]! / 0x100000000; });
    await page.locator('.arena canvas').waitFor();
    console.log('world flow: battle entered');
    await page.getByRole('button', { name: '1x', exact: true }).click();
    await page.getByRole('button', { name: '2x', exact: true }).click();
    await page.getByRole('button', { name: '跳过', exact: true }).click();
    await page.getByRole('button', { name: /^(返回|全部放生)$/ }).click({ timeout: 150_000 });
    await at('illusion-tower-1', 8, 12);
    assert(await page.locator('canvas').count() === 1, 'world-battle-world leaves one canvas');
    await page.waitForTimeout(500); // Let the presentation-only return crossfade finish before capture.
    await page.screenshot({ path: resolve(ARTIFACT_DIR, 'playable-return.png') });
    await page.keyboard.press('ArrowDown'); await at('pallet', 7, 5);
    assert(errors.length === 0, 'playable runtime errors: ' + errors.join(' | '));
    console.log('✓ isolated new game → town ↔ tower → battle → tower → town');
  } finally { await context.close(); }
}

async function main(): Promise<void> {
  assert(existsSync(CHROME_PATH), `Chrome executable not found: ${CHROME_PATH}. Set PO_VISUAL_BROWSER to override.`);
  await mkdir(BASELINE_DIR, { recursive: true });
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const server = startServer();
  let browser: Browser | undefined;
  try {
    await waitForServer(server);
    browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true, args: ['--use-angle=swiftshader', '--use-gl=angle', '--disable-gpu-vsync'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await playableWorldObservation(browser);
    const entries: MatrixEntry[] = [];
    for (const mapId of MAP_IDS) entries.push(await capture(page, mapId));
    const manifest = { version: 2, viewport: '1280x800', browser: 'Chrome + SwiftShader', entries };
    if (UPDATE || !existsSync(MANIFEST_PATH)) {
      for (const entry of entries) {
        const source = resolve(ARTIFACT_DIR, `${entry.mapId}.actual.png`);
        await writeFile(resolve(BASELINE_DIR, entry.file), await readFile(source));
      }
      await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
      console.log(`✓ wrote ${entries.length} reviewed visual baseline candidates (${UPDATE ? 'update' : 'initial'})`);
    }
    const expected = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as { entries: MatrixEntry[] };
    const failures: string[] = [];
    for (const entry of entries) {
      const baseline = expected.entries.find((candidate) => candidate.mapId === entry.mapId);
      if (!baseline || baseline.sha256 !== entry.sha256) failures.push(entry.mapId);
    }
    if (failures.length) throw new Error(`browser visual baseline mismatch: ${failures.join(', ')}. Review artifacts and rerun with --update for intentional changes.`);
    const lifecycle = await lifecycleObservation(page, expected.entries);
    await writeFile(resolve(ARTIFACT_DIR, 'runtime-observation.json'), `${JSON.stringify(lifecycle, null, 2)}
`);
    console.log(`✓ browser visual baseline matrix: ${entries.length} screenshots`);
    console.log(`✓ WorldStage lifecycle observation: ${lifecycle.sceneSwitches} scene switches, heap delta ${lifecycle.deltaBytes} bytes`);
  } finally {
    await browser?.close();
    await stopServer(server);
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
