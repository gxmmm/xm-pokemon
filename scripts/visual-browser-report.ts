import { chromium, type Browser, type Page } from 'playwright-core';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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
const MAP_IDS = ['pallet', 'route1', 'illusion-tower-1', 'illusion-tower-2', 'illusion-tower-3', 'illusion-tower-4', 'illusion-tower-5', 'viridian-forest', 'route3', 'mt-moon', 'rock-tunnel', 'sea-route', 'dragon-den', 'deep-space'] as const;
const QUALITIES = ['cinematic', 'standard', 'compatibility'] as const;

type MatrixEntry = { mapId: typeof MAP_IDS[number]; quality: typeof QUALITIES[number]; file: string; sha256: string; diagnostics: Record<string, unknown> };

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
  return spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'apps/web/vite.config.ts', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'pipe',
    windowsHide: true,
  });
}

async function stopServer(server: ChildProcess): Promise<void> {
  if (server.exitCode !== null) return;
  server.kill();
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (server.exitCode === null) server.kill('SIGKILL');
}

async function capture(page: Page, mapId: typeof MAP_IDS[number], quality: typeof QUALITIES[number]): Promise<MatrixEntry> {
  const query = new URLSearchParams({ 'visual-regression': '1', 'visual-scene': mapId, 'visual-quality': quality });
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') pageErrors.push(message.text()); });
  await page.goto(`${BASE_URL}/world-stage-sandbox?${query}`, { waitUntil: 'networkidle' });
  try {
    await page.waitForFunction(() => document.documentElement.dataset.visualRegressionReady === 'true');
  } catch (error) {
    throw new Error(`${mapId}/${quality}: sandbox did not become ready; url=${page.url()}; errors=${pageErrors.join(' | ') || 'none'}; body=${(await page.locator('body').innerText()).slice(0, 300)}`);
  }
  const diagnostics = await page.evaluate(() => window.__WORLD_STAGE_DIAGNOSTICS__?.());
  assert(diagnostics, `${mapId}/${quality}: missing WorldStage diagnostics`);
  assert(diagnostics.sceneId && diagnostics.quality === quality && diagnostics.motionEnabled === false, `${mapId}/${quality}: unstable WorldStage visual-regression state`);
  const viewport = page.getByTestId('world-stage-viewport');
  await viewport.screenshot({ path: resolve(ARTIFACT_DIR, `${mapId}-${quality}.actual.png`), animations: 'disabled' });
  const content = await readFile(resolve(ARTIFACT_DIR, `${mapId}-${quality}.actual.png`));
  return { mapId, quality, file: `${mapId}-${quality}.png`, sha256: createHash('sha256').update(content).digest('hex'), diagnostics: diagnostics as Record<string, unknown> };
}

async function worldDiagnostics(page: Page): Promise<Record<string, unknown>> {
  const diagnostics = await page.evaluate(() => window.__WORLD_STAGE_DIAGNOSTICS__?.());
  assert(diagnostics, 'missing WorldStage diagnostics');
  return diagnostics as Record<string, unknown>;
}

async function assertSingleWorldCanvas(page: Page, label: string): Promise<void> {
  assert(await page.locator('[data-testid="world-stage-viewport"] canvas').count() === 1, `${label}: expected exactly one WorldStage canvas`);
}

async function lifecycleObservation(page: Page, expectedEntries: readonly MatrixEntry[]): Promise<Record<string, unknown>> {
  const cdp = await page.context().newCDPSession(page);
  const heapUsed = async (): Promise<number> => {
    await cdp.send('HeapProfiler.collectGarbage');
    const metrics = await cdp.send('Performance.getMetrics') as { metrics: Array<{ name: string; value: number }> };
    return metrics.metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value ?? 0;
  };
  const sceneIdFor = (mapId: typeof MAP_IDS[number]) => expectedEntries.find((entry) => entry.mapId === mapId && entry.quality === 'cinematic')?.diagnostics.sceneId;
  const baseQuery = new URLSearchParams({ 'visual-regression': '1', 'visual-scene': 'viridian-forest', 'visual-quality': 'cinematic' });
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
      await assertSingleWorldCanvas(page, `cycle ${cycle}/${mapId}`);
      switchChecks.push({ cycle, mapId, diagnostics });
    }
    // Navigate through the separate BattleStage sandbox so the WorldStage unmount
    // lifecycle is exercised, then return to a fresh WorldStage instance.
    await page.goto(`${BASE_URL}/battle-stage-sandbox?visual-regression=1`, { waitUntil: 'networkidle' });
    await page.getByText('Pixi BattleStage 垂直切片').waitFor();
    await page.goto(`${BASE_URL}/world-stage-sandbox?${baseQuery}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.visualRegressionReady === 'true');
    await assertSingleWorldCanvas(page, `world-battle-world ${cycle}`);
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

async function main(): Promise<void> {
  assert(existsSync(CHROME_PATH), `Chrome executable not found: ${CHROME_PATH}. Set PO_VISUAL_BROWSER to override.`);
  await mkdir(BASELINE_DIR, { recursive: true });
  await rm(ARTIFACT_DIR, { recursive: true, force: true });
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const server = startServer();
  let browser: Browser | undefined;
  try {
    await waitForServer(server);
    browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true, args: ['--use-angle=swiftshader', '--use-gl=angle', '--disable-gpu-vsync'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const entries: MatrixEntry[] = [];
    for (const mapId of MAP_IDS) for (const quality of QUALITIES) entries.push(await capture(page, mapId, quality));
    const manifest = { version: 1, viewport: '1280x800', browser: 'Chrome + SwiftShader', entries };
    if (UPDATE || !existsSync(MANIFEST_PATH)) {
      for (const entry of entries) {
        const source = resolve(ARTIFACT_DIR, `${entry.mapId}-${entry.quality}.actual.png`);
        await writeFile(resolve(BASELINE_DIR, entry.file), await readFile(source));
      }
      await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
      console.log(`✓ wrote ${entries.length} reviewed visual baseline candidates (${UPDATE ? 'update' : 'initial'})`);
      return;
    }
    const expected = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as { entries: MatrixEntry[] };
    const failures: string[] = [];
    for (const entry of entries) {
      const baseline = expected.entries.find((candidate) => candidate.mapId === entry.mapId && candidate.quality === entry.quality);
      if (!baseline || baseline.sha256 !== entry.sha256) failures.push(`${entry.mapId}/${entry.quality}`);
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
