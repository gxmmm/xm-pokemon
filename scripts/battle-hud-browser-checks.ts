import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import type { Page } from 'playwright-core';

export async function checkBattleHud(page: Page, output: string): Promise<void> {
  await page.evaluate(() => window.__PLAYABLE_FIXTURE__.prepare('long', 1, true));
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.evaluate(() => window.__PLAYABLE_FIXTURE__.pinHud());
  await page.waitForFunction(() => document.querySelector('.mc-action')?.textContent?.includes('50%'));
  const cards = page.locator('.mon-card');
  assert.equal(await cards.count(), 6);
  assert.match(await cards.nth(0).innerText(), /濒危[\s\S]*施放 · 破坏光线[\s\S]*50%/);
  assert.match(await cards.nth(1).innerText(), /暂时无法行动[\s\S]*眩晕 2.5秒[\s\S]*灼伤 4.0秒/);
  assert.match(await cards.nth(4).innerText(), /自动战斗[\s\S]*麻痹/);
  assert.equal(await cards.nth(5).locator('.ready, .mc-status, .mc-action.active').count(), 0);
  assert.match(await cards.nth(0).locator('.mc-skill').filter({hasText:'大字爆炎'}).innerText(), /大字爆炎[\s\S]*4.2秒/);
  assert.match(await cards.nth(0).locator('.mc-skill').first().innerText(), /火花/);
  assert.equal(await cards.nth(0).locator('.mc-skill').count(),5);
  assert((await cards.nth(0).locator('.mc-head .ell').getAttribute('title'))!.includes('超长昵称'));
  for (const [width, height] of [[1366, 768], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width: width!, height: height! });
    await page.waitForTimeout(250);
    const geometry = await cards.evaluateAll((nodes) => nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, height: box.height, overflow: node.scrollHeight > node.clientHeight, skillFont: parseFloat(getComputedStyle(node.querySelector('.mc-skill')!).fontSize) };
    }));
    assert(geometry.every((b) => b.x >= 0 && b.y >= 0 && b.right <= width! && b.bottom <= height! && !b.overflow && b.skillFont >= 12), JSON.stringify(geometry));
    assert(geometry[3]!.x - geometry[0]!.right >= width! * 0.5, 'keep at least half the screen open between HUD panels');
    assert.equal(await page.locator('canvas').count(), 1);
    await page.screenshot({ timeout: 60000, path: resolve(output, `hud-${width}x${height}.png`) });
  }
  const paused = await cards.allTextContents();
  await page.waitForTimeout(450);
  assert.deepEqual(await cards.allTextContents(), paused, 'paused presentation freezes HP, statuses, casts and cooldowns');
  await page.evaluate(() => window.__PLAYABLE_FIXTURE__.interruptHud());
  await page.waitForFunction(() => document.querySelector('.mc-action')?.textContent?.includes('施法被打断'));
  assert.equal(await cards.nth(0).locator('.mc-action.active').count(), 0);
  await page.screenshot({ timeout: 60000, path: resolve(output, 'hud-interrupt.png') });
  await page.waitForFunction(() => document.querySelector('.mc-action')?.textContent?.trim() === '自动战斗');
  const before = await cards.evaluateAll((nodes) => nodes.map((n) => ({ top: n.getBoundingClientRect().top, height: n.getBoundingClientRect().height })));
  await page.evaluate(() => window.__PLAYABLE_FIXTURE__.pinHud(true));
  await page.waitForFunction(() => !document.querySelector('.mc-status, .mon-card.critical, .mon-card.fainted, .mon-card.casting'));
  assert.deepEqual(await cards.evaluateAll((nodes) => nodes.map((n) => ({ top: n.getBoundingClientRect().top, height: n.getBoundingClientRect().height }))), before, 'state changes do not move cards');
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.waitForFunction(() => window.__PLAYABLE_FIXTURE__.read().time! > 0.1);
  await page.evaluate(() => window.__PLAYABLE_FIXTURE__.visit('/world'));
}
