import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import type { Page } from 'playwright-core';

/** Actual production BattleStage, driven by isolated presentation DTOs. */
export async function checkNaturalBattle(page: Page, output: string) {
  await page.evaluate(async (url) => {
    const fixture = await import(/* @vite-ignore */ url);
    window.__READABILITY_FIXTURE__ = await fixture.createBattleReadabilityFixture();
  }, `/@fs/${resolve('scripts/battle-readability-browser-fixture.ts').replaceAll('\\', '/')}`);
  const read = () => page.evaluate(() => window.__READABILITY_FIXTURE__.read());
  const samples: unknown[] = [];
  try {
    await page.clock.runFor(300);
    {
      await page.evaluate(() => window.__READABILITY_FIXTURE__.play());
      let previous = 0;
      for (const at of [80, 160, 320]) {
        await page.clock.runFor(at - previous); previous = at;
        const sample = await read();
        assert.equal(sample.activeEffectCount, 27);
        assert.equal(sample.motions['unit-5']!.statusVisual, 'sleep');
        await page.screenshot({ path: resolve(output, `natural-spread-standard-${at}.png`) });
        samples.push({ at, effects: sample.activeEffectCount });
      }
      await page.clock.runFor(1200);
      assert.equal((await read()).effectChildCount, 0);
    }
    await page.evaluate(() => window.__READABILITY_FIXTURE__.play(true));
    await page.clock.runFor(160);
    assert.equal((await read()).activeEffectCount, 27);
    await page.screenshot({ path: resolve(output, 'natural-spread-electric.png') });
    await page.clock.runFor(1200);
    for (const state of ['burn', 'move', 'clear', 'faint'] as const) {
      await page.evaluate((state) => window.__READABILITY_FIXTURE__.bodyState(state), state);
      await page.clock.runFor(300);
      const sample = await read();
      const burning = state === 'burn' || state === 'move';
      assert(Object.values(sample.motions).every((model) => model.statusVisual === (burning ? 'burn' : 'none')));
      for (const foot of sample.feet) {
        assert(foot.ownedByActor, 'terrain is sorted inside its actor, not above every actor');
        if (foot.children) {
          assert(sample.motions[foot.uid]!.locomotionMode === 'grounded');
          assert(foot.bounds.minY >= foot.y - foot.height - 0.01 && foot.bounds.maxY <= foot.y + 1.01, 'grass stays in the local foot band');
          assert(foot.bounds.width <= foot.width + 0.01, 'grass respects body width');
        }
      }
      assert.equal(sample.feet.filter((foot) => foot.children).length, state === 'faint' ? 0 : 4, 'flight/hover/dead actors have no grass');
      await page.screenshot({ path: resolve(output, `natural-body-${state}.png`) });
      samples.push({ state, feet: sample.feet, motions: sample.motions });
    }
    for (const biome of ['water', 'cave'] as const) {
      await page.evaluate((biome) => window.__READABILITY_FIXTURE__.bodyState('clear', biome), biome);
      await page.clock.runFor(300);
      const sample = await read();
      assert(sample.feet.every((foot) => foot.children === 0), 'scene change clears grass contacts');
      await page.screenshot({ path: resolve(output, `natural-contact-${biome}.png`) });
    }
    for (const stun of [false, true, 'combined'] as const) {
      await page.evaluate((stun) => window.__READABILITY_FIXTURE__.statusGallery(stun), stun);
      let previous = 0;
      for (const at of [80, 300, 650]) {
        await page.clock.runFor(at - previous); previous = at;
        await page.screenshot({ path: resolve(output, `natural-status-${stun === 'combined' ? 'combined' : stun ? 'stun' : 'gallery'}-${at}.png`) });
      }
      const sample = await read();
      const expected = stun === true ? Array(6).fill('stun') : ['burn', 'poison', 'paralyze', 'freeze', 'sleep', 'confuse'];
      assert.deepEqual(Object.values(sample.motions).map((model) => model.statusVisual), expected);
      if (stun) assert.deepEqual(sample.headIndicators, Array(6).fill('stun'));
      await page.screenshot({ path: resolve(output, `natural-status-${stun === 'combined' ? 'combined' : stun ? 'stun' : 'gallery'}.png`) });
      samples.push({ gallery: stun ? 'stun' : 'all', statuses: expected });
    }
    return samples;
  } finally { await page.evaluate(() => window.__READABILITY_FIXTURE__.destroy()); }
}
