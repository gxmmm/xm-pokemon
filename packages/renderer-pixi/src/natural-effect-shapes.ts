import { BATTLE_BODY_EFFECTS } from '@pokemon-online/config';
import type { Graphics } from 'pixi.js';
import type { ElementalVfxShape } from './elemental-vfx.ts';

/** Fixed, irregular sites: a cloud of local details, never a circular orbit. */
export function moteSite(index: number): { x: number; y: number } {
  return { x: Math.sin(index * 12.9898 + 1.2) * 0.88, y: Math.sin(index * 7.233 + 3.1) * 0.82 };
}

export function drawElementMotes(graphic: Graphics, shape: ElementalVfxShape, x: number, y: number,
  progress: number, color: number, count: number = BATTLE_BODY_EFFECTS.moteCount, width = 45, height = 28): void {
  const alpha = Math.sin(Math.min(1, progress * 4) * Math.PI / 2) * (1 - progress) * 0.85;
  for (let index = 0; index < count; index++) {
    const site = moteSite(index);
    const px = x + site.x * width * (0.65 + progress * 0.35);
    const py = y + site.y * height - progress * (5 + index % 3 * 4);
    const size = 3 + index % 3;
    if (shape === 'flame') {
      graphic.moveTo(px - size, py + size).quadraticCurveTo(px - size * 0.7, py - size, px + 1, py - size * 3)
        .quadraticCurveTo(px + size * 1.4, py, px + size, py + size).closePath().fill({ color: index % 2 ? color : 0xffaf45, alpha });
    } else if (shape === 'water-wave') {
      graphic.moveTo(px, py - size * 2).quadraticCurveTo(px + size * 1.5, py + size, px, py + size)
        .quadraticCurveTo(px - size, py, px, py - size * 2).fill({ color, alpha });
    } else if (shape === 'lightning') {
      graphic.moveTo(px - size, py - size * 2).lineTo(px + size, py).lineTo(px - size, py + size).lineTo(px + size, py + size * 2)
        .stroke({ color, alpha, width: 1.6 });
    } else if (shape === 'leaf') {
      graphic.moveTo(px - size, py + size).quadraticCurveTo(px - size, py - size * 2, px + size * 2, py - size)
        .quadraticCurveTo(px + size, py + size, px - size, py + size).fill({ color, alpha });
    } else {
      graphic.poly([px, py - size * 1.7, px + size, py, px, py + size, px - size * 0.6, py]).fill({ color, alpha });
    }
  }
}

/** Body-local fire uses independent lifetimes at several anatomical heights. */
export function drawBodyFlames(graphic: Graphics, seconds: number, width: number, height: number,
  color: number = BATTLE_BODY_EFFECTS.palette.fire, highlight: number = BATTLE_BODY_EFFECTS.palette.fireTip, displayScale = 1): void {
  BATTLE_BODY_EFFECTS.flameAnchors.forEach(([ax, ay], index) => {
    const life = (seconds * 0.65 + index * 0.173) % 1;
    const pixel = Math.max(0.8, Math.min(1.3, height / 65), BATTLE_BODY_EFFECTS.minimumScreenPixel.flame / Math.max(0.2, displayScale));
    const x = Math.round(ax * width / pixel) * pixel;
    const y = Math.round((ay * height - life * 2) / pixel) * pixel;
    const alpha = Math.sin(life * Math.PI) * 0.86;
    const tip = (3 + Math.floor(life * 3)) * pixel;
    // Small stepped silhouettes echo sprite pixels; no triangle, body wash or orbit.
    graphic.rect(x - 2 * pixel, y - 2 * pixel, 4 * pixel, 3 * pixel).fill({ color: BATTLE_BODY_EFFECTS.palette.ember, alpha: alpha * 0.75 })
      .rect(x - pixel, y - tip, 3 * pixel, tip).fill({ color, alpha })
      .rect(x, y - tip - 2 * pixel, pixel, 2 * pixel).fill({ color, alpha })
      .rect(x, y - tip - pixel, pixel, tip * 0.65).fill({ color: highlight, alpha: alpha * 0.88 });
  });
}
