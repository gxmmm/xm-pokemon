import { BATTLE_SKILL_DETAILS } from '@pokemon-online/config';
import type { Graphics } from 'pixi.js';

/** Tapered water and trailing droplets in the actual flight basis. */
export function drawWaterShot(graphic: Graphics, x: number, y: number, nx: number, ny: number,
  color: number, intensity: number, progress: number): void {
  const spec = BATTLE_SKILL_DETAILS.water;
  const px = -ny, py = nx;
  const length = spec.length * (0.7 + intensity * 0.3), width = spec.width * (0.7 + intensity * 0.3);
  const point = (along: number, across: number) => ({ x: x + nx * along + px * across, y: y + ny * along + py * across });
  const nose = point(5, 0), upper = point(-8, -width), tail = point(-length, 0), lower = point(-8, width);
  graphic.moveTo(nose.x, nose.y).quadraticCurveTo(upper.x, upper.y, tail.x, tail.y)
    .quadraticCurveTo(lower.x, lower.y, nose.x, nose.y).fill({ color, alpha: 0.88 });
  const shine = point(-8, -width * 0.32), end = point(-length * 0.7, -width * 0.10);
  graphic.moveTo(shine.x, shine.y).lineTo(end.x, end.y).stroke({ color: spec.highlight, alpha: 0.8, width: 2 });
  for (let i = 0; i < spec.trailCount; i++) {
    const droplet = point(-length - i * 8, Math.sin(progress * 13 + i * 2.1) * width * 0.6);
    graphic.moveTo(droplet.x, droplet.y).lineTo(droplet.x - nx * (5 - i), droplet.y - ny * (5 - i))
      .stroke({ color, alpha: 0.62 - i * 0.12, width: 3 - i * 0.6 });
  }
}
