import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Page } from 'playwright-core';
declare global { interface Window { __SPACING_FIXTURE__: Awaited<ReturnType<typeof import('./battle-spacing-browser-fixture.ts').createBattleSpacingFixture>>; } }

export async function checkBattleSpacing(page: Page, root: string) {
  const output = resolve(root, 'spacing-final'); await mkdir(output, { recursive: true });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.evaluate(async (url) => { window.__SPACING_FIXTURE__ = await (await import(/* @vite-ignore */ url)).createBattleSpacingFixture(); },
    `/@fs/${resolve('scripts/battle-spacing-browser-fixture.ts').replaceAll('\\', '/')}`);
  const samples: unknown[] = [];
  const baseline = new Map<number, unknown>();
  try {
    const cases = [{ width: 1366, height: 768, before: true }, { width: 1366, height: 768, before: false },
      { width: 1440, height: 900, before: false }, { width: 1920, height: 1080, before: false }];
    for (const size of cases) for (const tick of [0, 11, 60]) {
      await page.setViewportSize({ width: size.width, height: size.height });
      const facts = await page.evaluate(({ tick, before }) => window.__SPACING_FIXTURE__.show(tick, before), { tick, before: size.before });
      if (size.before) baseline.set(tick, facts); else assert.deepEqual(facts, baseline.get(tick), 'camera changes cannot alter authoritative positions or events');
      await page.waitForFunction(() => window.__SPACING_FIXTURE__.read().bodies.every((body) => body.ready));
      await page.clock.runFor(400);
      const state = await page.evaluate(() => window.__SPACING_FIXTURE__.read());
      assert.equal(state.combatantCount, 6);
      if (!size.before) for (const body of state.bodies) {
        assert(body.bodyHeight <= 92.01 && body.bodyWidth <= 100.01, 'opaque bodies respect the common budget');
        assert(!body.small || Math.abs(body.sizeRatio - 1) < 1e-9, 'small bodies retain their authored size');
        assert(body.x >= 0 && body.y >= 0 && body.x + body.width <= size.width && body.y + body.height <= size.height,
          'sampled bodies and their status decorations remain inside the viewport');
      }
      await page.screenshot({ path: resolve(output, `${size.before ? 'before' : 'after'}-${size.width}-tick-${tick}.png`) });
      samples.push({ ...size, tick, ...state });
    }
    await writeFile(resolve(output, 'report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), passed: true, samples }, null, 2));
  } finally { await page.evaluate(() => window.__SPACING_FIXTURE__.destroy()); }
}
