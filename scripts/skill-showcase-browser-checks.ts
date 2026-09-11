import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Page } from 'playwright-core';
declare global { interface Window { __SKILL_SHOWCASE__: Awaited<ReturnType<typeof import('./skill-showcase-browser-fixture.ts').createSkillShowcaseFixture>>; } }

export async function checkSkillShowcases(page: Page, root: string, baseline: boolean) {
  const output = resolve(root, baseline ? 'skills-before' : 'skills-after'); await mkdir(output, { recursive: true });
  await page.evaluate(async (url) => { window.__SKILL_SHOWCASE__ = await (await import(/* @vite-ignore */ url)).createSkillShowcaseFixture(); },
    `/@fs/${resolve('scripts/skill-showcase-browser-fixture.ts').replaceAll('\\', '/')}`);
  const samples: unknown[] = [];
  try {
    for (let index = 0; index < (baseline ? 6 : 10); index++) for (const mode of baseline ? ['forward'] : ['forward', 'reverse']) {
      const reverse = mode === 'reverse';
      const timing = await page.evaluate(({ index, reverse }) => window.__SKILL_SHOWCASE__.play(index, reverse), { index, reverse });
      let previous = 0;
      const phases = baseline ? [['flight', Math.max(timing.releaseMs + 60, timing.contactMs - 50)]] as const
        : [['flight', Math.max(timing.releaseMs + 60, timing.contactMs - 50)], ['contact', timing.contactMs + 80]] as const;
      for (const [phase, at] of phases) {
        await page.clock.runFor(Math.max(1, at - previous)); previous = at;
        const state = await page.evaluate(() => window.__SKILL_SHOWCASE__.read());
        assert.equal(state.combatantCount, 2); assert(state.activeEffectCount > 0);
        assert(state.bodyScaleRatios.every((ratio) => ratio > 0.6), 'both bodies stay visible while turning or blending actions');
        await page.screenshot({ path: resolve(output, `${timing.id}-${mode}-${phase}.png`) });
        samples.push({ ...timing, reverse, phase, effects: state.activeEffectCount, bodyScaleRatios: state.bodyScaleRatios });
      }
      await page.clock.runFor(2200);
      const state = await page.evaluate(() => window.__SKILL_SHOWCASE__.read());
      assert(state.settled && state.activeEffectCount === 0, 'skill actions and feedback must finish');
    }
    await writeFile(resolve(output, 'report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), passed: true, samples }, null, 2));
    if (!baseline) {
      const cards = await Promise.all(['flamethrower', 'water-gun', 'thunderbolt', 'shadow-ball', 'hyper-beam', 'karate-chop'].map(async (id) => ({
        id, image: `data:image/png;base64,${(await readFile(resolve(output, `${id}-forward-flight.png`))).toString('base64')}`,
      })));
      await page.setViewportSize({ width: 940, height: 900 });
      await page.evaluate((cards) => {
        const preview = document.createElement('section'); preview.id = 'skill-preview';
        Object.assign(preview.style, { position: 'fixed', inset: '0', zIndex: '10000', padding: '20px', background: '#10201d', color: '#ecf5ed', font: '16px sans-serif' });
        const title = document.createElement('h2'); title.textContent = '六类技能样板 · 实际战斗画面局部'; preview.append(title);
        const grid = document.createElement('div'); Object.assign(grid.style, { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' });
        const names = ['喷射火焰', '水枪', '十万伏特', '暗影球', '破坏光线', '空手劈'];
        cards.forEach((card, i) => {
          const tile = document.createElement('div'); const name = document.createElement('div'); name.textContent = names[i]!; name.style.padding = '8px';
          const frame = document.createElement('div'); Object.assign(frame.style, { width: '438px', height: '224px', overflow: 'hidden', position: 'relative' });
          const img = document.createElement('img'); img.src = card.image;
          Object.assign(img.style, { position: 'absolute', left: '-370px', top: '-400px', width: '1280px', height: '900px', maxWidth: 'none' });
          frame.append(img); tile.append(name, frame); grid.append(tile);
        });
        preview.append(grid); document.body.append(preview);
      }, cards);
      await page.locator('#skill-preview img').evaluateAll((images) => Promise.all(images.map((img) => (img as HTMLImageElement).decode())));
      await page.screenshot({ path: resolve(output, 'six-skills-preview.png') });
      await page.evaluate(() => document.querySelector('#skill-preview')?.remove());
    }
  } finally { await page.evaluate(() => window.__SKILL_SHOWCASE__.destroy()); }
  return samples;
}
