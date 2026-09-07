import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import type { Page } from 'playwright-core';

/** Check actual game routes, including their GPU canvas and floating controls. */
export async function checkFullWindowScene(page: Page, output: string, scene: 'world' | 'battle'): Promise<void> {
  const selector = scene === 'world' ? '.pixi-world-viewport' : '.pixi-battle-viewport';
  await page.locator(`${selector} canvas`).waitFor();
  for (const size of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(size);
    await page.waitForFunction((selector) => {
      const canvas = document.querySelector<HTMLCanvasElement>(`${selector} canvas`);
      const ratio = Math.min(window.devicePixelRatio, 2);
      return canvas && canvas.width === Math.round(innerWidth * ratio) && canvas.height === Math.round(innerHeight * ratio);
    }, selector);
    const bounds = await page.evaluate(({ selector, scene }) => {
      return ['.app-stage', 'main', `.${scene}`, selector, `${selector} canvas`].map((query) => {
        const element = document.querySelector<HTMLElement>(query)!;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return { query, x: rect.x, y: rect.y, width: rect.width, height: rect.height,
          border: style.borderTopWidth, radius: style.borderTopLeftRadius };
      });
    }, { selector, scene });
    for (const rect of bounds) {
      assert(Math.abs(rect.x) < 1 && Math.abs(rect.y) < 1 && Math.abs(rect.width - size.width) < 1 && Math.abs(rect.height - size.height) < 1,
        `${scene} must reach all four window edges: ${JSON.stringify(rect)}`);
      assert.equal(rect.border, '0px'); assert.equal(rect.radius, '0px');
    }
    assert.equal(await page.locator('canvas').count(), 1);
    await page.screenshot({ path: resolve(output, `full-window-${scene}-${size.width}.png`) });
  }
  if (scene === 'world') {
    await page.getByRole('button', { name: '🗺 地图', exact: true }).click();
    await page.locator('.map-overlay').waitFor();
    await page.locator('.map-overlay').getByRole('button', { name: '✕', exact: true }).click();
    await page.locator('.map-overlay').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: '💊 治疗', exact: true }).click();
    const before = await page.evaluate(() => window.__PO_WORLD_BEHAVIOR_DIAGNOSTICS__!().position);
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction((before) => {
      const state = window.__PO_WORLD_BEHAVIOR_DIAGNOSTICS__!();
      return !state.moving && state.position.x === before.x - 1;
    }, before);
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction((before) => {
      const state = window.__PO_WORLD_BEHAVIOR_DIAGNOSTICS__!();
      return !state.moving && state.position.x === before.x;
    }, before);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}
