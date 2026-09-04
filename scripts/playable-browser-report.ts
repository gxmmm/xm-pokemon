import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { chromium, type Browser, type Locator } from 'playwright-core';
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
  const assertInside = async (locator: Locator) => {
    const r = await locator.boundingBox();
    const vp = page.viewportSize()!;
    assert(r && r.x >= -1 && r.y >= -1 && r.x + r.width <= vp.width + 1 && r.y + r.height <= vp.height + 1, `outside viewport: ${JSON.stringify(r)}`);
  };
  const inspectLayout = async (label: string) => {
    const info = await page.evaluate(() => {
      const stage = document.querySelector<HTMLElement>('.app-stage')!;
      const main = document.querySelector<HTMLElement>('main')!;
      const smallText = [...main.querySelectorAll<HTMLElement>('.tiny, button, .sect, .apt-val, .apt-label, .stat-card, .apt-chip, .type-badge, .team-tag, .ord')]
        .filter((el) => el.getClientRects().length && parseFloat(getComputedStyle(el).fontSize) < 12)
        .map((el) => ({ text:el.textContent?.slice(0,30), font:getComputedStyle(el).fontSize }));
      return { stageWidth: stage.getBoundingClientRect().width, layoutWidth: stage.offsetWidth, scrollWidth: main.scrollWidth, clientWidth: main.clientWidth, smallText };
    });
    assert(Math.abs(info.stageWidth - page.viewportSize()!.width) < 1, `${label}: stage width ${JSON.stringify(info)}`);
    assert(info.scrollWidth <= info.clientWidth + 1, `${label}: horizontal overflow ${JSON.stringify(info)}`);
    if (page.viewportSize()!.width === 390) {
      assert.equal(info.layoutWidth, 390, `${label}: must reflow, not shrink`);
      assert.deepEqual(info.smallText, [], `${label}: small text`);
    }
  };
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
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const paused = (await read()).time;
  await page.waitForTimeout(350);
  assert.equal((await read()).time, paused, 'pause freezes simulation time');
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.waitForTimeout(350);
  assert((await read()).time! > paused!, 'resume advances simulation');
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const beforeSkip = performance.now();
  await page.getByRole('button', { name: '跳过', exact: true }).click();
  await page.locator('.modal-backdrop').waitFor({ timeout: 3000 });
  assert(performance.now() - beforeSkip < 3000, 'paused skip must finish promptly');
  await page.screenshot({ path: resolve(OUTPUT, 'desktop-result.png') });
  await page.getByRole('button', { name: /^(返回|全部放生)$/ }).click();
  await page.waitForURL('**/world');
  checks.push('3x设置生效、1/2/3切换、暂停恢复、暂停跳过3秒内结算');
  checks.push('1/2/3x实测引擎每帧时间倍率（遵守50ms帧上限）：' + speedDeltas.map((n) => n.toFixed(2)).join('/'));

  for (const action of ['capture', 'release', 'loss'] as const) {
    console.log('playable: ' + action);
    await prepare(action === 'loss' ? 'loss' : 'win', 2);
    const before = await read();
    await page.getByRole('button', { name: '2x', exact: true }).waitFor();
    await page.getByRole('button', { name: '跳过', exact: true }).click();
    await page.locator('.modal-backdrop').waitFor({ timeout: 3000 });
    const finished = await read();
    assert.equal(finished.winner, action === 'loss' ? 'enemy' : 'player');
    await page.locator('.result-log summary').click();
    const choice = action === 'capture' ? page.getByRole('button', { name: '捕捉', exact: true }).first()
      : page.getByRole('button', { name: action === 'loss' ? '返回' : '全部放生', exact: true });
    await choice.dblclick();
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
  await page.getByRole('button', { name: '全部放生', exact: true }).click();
  await page.waitForURL('**/world');
  assert.equal((await read()).stats.battles, beforeNatural.stats.battles + 1);
  checks.push('不点击跳过的自然战斗正常演出、结算并返回');
  console.log('playable: narrow layout and expanded result actions');
  await page.setViewportSize({ width:390, height:844 });
  for (const action of ['capture', 'release', 'loss'] as const) {
    await prepare(action === 'loss' ? 'loss' : 'win', 1);
    await page.getByRole('button', { name:'暂停', exact:true }).click();
    await inspectLayout('narrow battle');
    for (const button of await page.locator('.arena-controls button').all()) {
      await assertInside(button);
      assert((await button.boundingBox())!.height >= 40);
    }
    const nameFont = await page.locator('.mc-head .ell').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    assert(nameFont >= 12);
    if (action === 'capture') await page.screenshot({ path:resolve(OUTPUT,'narrow-battle.png') });
    await page.getByRole('button', { name:'跳过', exact:true }).click();
    await page.locator('.battle-result').waitFor();
    await page.locator('.result-log summary').click();
    await assertInside(page.locator('.battle-result'));
    assert(await page.locator('.damage-report').evaluate((el) => el.hasAttribute('open')));
    if (action !== 'loss') {
      assert.equal(await page.getByRole('button', { name:'捕捉', exact:true }).count(),3);
      for (const choice of await page.getByRole('button', { name:'捕捉', exact:true }).all()) {
        await choice.scrollIntoViewIfNeeded();
        await assertInside(choice);
      }
    }
    const choice = page.getByRole('button', { name:action === 'loss' ? '返回' : action === 'capture' ? '捕捉' : '全部放生', exact:true }).last();
    await choice.scrollIntoViewIfNeeded();
    await assertInside(choice);
    if (action === 'release') await page.screenshot({ path:resolve(OUTPUT,'narrow-result-actions.png') });
    await choice.click();
    await page.waitForURL('**/world');
  }
  checks.push('390×844战斗按钮40px、姓名12px，战报及日志展开，3个捕捉选项/全部放生/失败返回真实点击可达');
  const uid = await page.evaluate(() => window.__PLAYABLE_FIXTURE__.prepareCollection());
  const visit = async (path: string) => {
    await page.evaluate((p) => window.__PLAYABLE_FIXTURE__.visit(p),path);
    await page.waitForTimeout(450);
    assert.equal(await page.locator('main').evaluate((el) => el.scrollTop), 0, 'new page opens at top');
  };
  for (const path of ['/world','/team','/breed',`/pokemon/${uid}`,'/pokedex','/settings']) {
    console.log('playable: layout ' + path);
    await visit(path);
    if (path === '/team' || path === '/breed') await page.locator('.roster-cell').last().click();
    if (path === '/pokedex') await page.locator('.dex-cell').first().click();
    await inspectLayout(path);
    await page.screenshot({ path:resolve(OUTPUT,`narrow-${path.startsWith('/pokemon/') ? 'detail' : path.slice(1)}.png`) });
  }
  await page.getByRole('button', { name:'手动保存到云端', exact:true }).click();
  await assertInside(page.getByRole('button', { name:'退出登录', exact:true }));
  await page.getByRole('button', { name:'菜单', exact:true }).click();
  await page.locator('.drawer-tile').filter({ hasText:'队伍' }).click();
  await page.waitForURL('**/team');
  await visit(`/pokemon/${uid}`);
  for (const size of [{width:390,height:844},{width:1440,height:900},{width:390,height:844}]) {
    await page.setViewportSize(size);
    const trigger = page.locator('.detail-skills .tip-wrap').last();
    await trigger.scrollIntoViewIfNeeded();
    await page.mouse.move(0,0);
    await trigger.click();
    await page.getByRole('tooltip').waitFor();
    await assertInside(page.getByRole('tooltip'));
    const t = (await trigger.boundingBox())!, b = (await page.getByRole('tooltip').boundingBox())!;
    assert(Math.min(Math.abs(t.y + t.height - b.y), Math.abs(b.y + b.height - t.y)) < 16, 'tooltip stays near trigger');
    await page.locator('main').evaluate((el) => { el.scrollTop -= 20; });
    await assertInside(page.getByRole('tooltip'));
    await trigger.click();
  }
  await page.getByRole('button', { name:'进化为 妙蛙草', exact:true }).click();
  await assertInside(page.locator('.confirm-modal'));
  await page.getByRole('button', { name:'取消', exact:true }).click();
  await page.getByRole('button', { name:'进化为 妙蛙草', exact:true }).click();
  await page.getByRole('button', { name:'确定', exact:true }).click();
  await page.getByRole('button', { name:'进化为 妙蛙花', exact:true }).waitFor();
  checks.push('队伍/炼妖/详情/图鉴/设置无横向溢出；24被动详情、菜单、保存和进化确认可操作；窄屏/1440桌面缩放/滚动后技能说明未裁切');
  assert.deepEqual(errors, []);
  await writeFile(resolve(OUTPUT, 'report.json'), JSON.stringify({ passed: true, checks, pageErrors: errors, renderer: 'SwiftShader functional acceptance' }, null, 2));
  console.log('✓ playable battle acceptance:', checks.join('；'));
} finally {
  await browser?.close();
  server.kill();
}
