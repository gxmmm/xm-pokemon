import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Page } from 'playwright-core';
declare global { interface Window { __TEMPO_FIXTURE__: Awaited<ReturnType<typeof import('./battle-tempo-browser-fixture.ts').createBattleTempoFixture>>; } }
export async function checkBattleTempo(page: Page, root: string) {
  const output = resolve(root, 'tempo'); await mkdir(output, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(async url => { window.__TEMPO_FIXTURE__ = await (await import(/* @vite-ignore */ url)).createBattleTempoFixture(); }, `/@fs/${resolve('scripts/battle-tempo-browser-fixture.ts').replaceAll('\\', '/')}`);
  const reports = [];
  try {
    for (const [id, skill] of [[6, 'flamethrower'], [68, 'close-combat'], [25, 'thunderbolt'], [65, 'psybeam'], [113, 'renewal-chant']] as const) {
      await page.evaluate(({ id, skill }) => window.__TEMPO_FIXTURE__.start(id, skill), { id, skill });
      let maxQueued = 0;
      for (let tick = 1; tick <= 120; tick++) {
        await page.evaluate(() => window.__TEMPO_FIXTURE__.step()); await page.clock.runFor(50);
        const state = await page.evaluate(() => window.__TEMPO_FIXTURE__.read());
        maxQueued = Math.max(maxQueued, state.actor.queuedMotionCount);
        assert(state.actor.queuedMotionCount <= 3, '完整动作之间不积压旧动画');
        assert(!state.hud.skills.some(s => s.id === '__normal__'));
        assert(state.hud.skills.some(s => s.basic && s.name.startsWith('基础·')));
        if ([6, 18, 54, 100].includes(tick)) await page.screenshot({ path: resolve(output, `${id}-${tick}.png`) });
      }
      const result = await page.evaluate(() => window.__TEMPO_FIXTURE__.read());
      assert(result.events.length >= 2, '连续释放基础或战术招式');
      reports.push({ id, maxQueued, events: result.events, hud: result.hud.skills });
    }
    await writeFile(resolve(output, 'report.json'), JSON.stringify({ passed: true, reports }, null, 2));
  } finally { await page.evaluate(() => window.__TEMPO_FIXTURE__.destroy()); }
}
