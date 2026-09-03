import type { TypeName } from '@pokemon-online/shared';
import { Graphics } from 'pixi.js';
import type { BattleEffectPool } from './BattleEffectPool.ts';
import type { BattleStagePoint } from './battle-stage-layout.ts';
import { elementalVfxShapeFor } from './elemental-vfx.ts';

export function spawnRing(runtime: BattleEffectPool, at: BattleStagePoint, color: number, intensity: number, variant = 'default', element?: TypeName): void {
  const graphic = new Graphics({ blendMode: 'add' });
  const shape = elementalVfxShapeFor(element);
  const duration = variant === 'bind' || variant === 'snare' ? 0.64 : variant === 'dive' ? 0.80 : 0.48 + intensity * 0.16;
  runtime.add(graphic, duration, (progress) => {
    const radius = 22 + progress * (62 + intensity * 58);
    const alpha = (1 - progress) * 0.86;
    graphic.clear().circle(at.x, at.y, radius).stroke({ color, alpha: alpha * 0.68, width: 3 + intensity * 4 });
    if (shape === 'flame') {
      for (let flame = 0; flame < 7; flame++) {
        const angle = flame / 7 * Math.PI * 2 + progress * 1.8;
        const distance = radius * 0.58;
        const x = at.x + Math.cos(angle) * distance;
        const y = at.y + Math.sin(angle) * distance * 0.58;
        graphic.poly([x - 6, y + 12, x + Math.cos(angle) * 12, y - 18 - intensity * 15, x + 7, y + 12]).fill({ color: flame % 2 ? color : 0xffe383, alpha: alpha * 0.88 });
      }
      graphic.circle(at.x, at.y, radius * 0.35).fill({ color: 0xffb353, alpha: alpha * 0.36 }).circle(at.x, at.y, radius * 0.17).fill({ color: 0xfff4b5, alpha: alpha * 0.86 });
    } else if (shape === 'lightning') {
      for (let bolt = 0; bolt < 4; bolt++) {
        const angle = bolt / 4 * Math.PI * 2 + progress * 0.45;
        const end = { x: at.x + Math.cos(angle) * radius, y: at.y + Math.sin(angle) * radius * 0.62 };
        const middle = { x: at.x + Math.cos(angle + 0.6) * radius * 0.46, y: at.y + Math.sin(angle + 0.6) * radius * 0.30 };
        graphic.moveTo(at.x, at.y).lineTo(middle.x, middle.y).lineTo(end.x, end.y).stroke({ color: 0xffe96a, alpha, width: 4 + intensity * 3 })
          .moveTo(at.x, at.y).lineTo(middle.x, middle.y).lineTo(end.x, end.y).stroke({ color: 0xffffff, alpha, width: 1.6 });
      }
      graphic.circle(at.x, at.y, radius * 0.18).fill({ color: 0xfff4a5, alpha: alpha * 0.78 });
    } else if (shape === 'psychic-orbit') {
      for (let ring = 0; ring < 4; ring++) {
        const orbit = radius * (0.34 + ring * 0.14);
        const phase = progress * 9 + ring * 0.8;
        graphic.ellipse(at.x + Math.cos(phase) * ring * 6, at.y + Math.sin(phase) * ring * 4, orbit, orbit * 0.36).stroke({ color: ring % 2 ? color : 0xffffff, alpha: alpha * (0.88 - ring * 0.13), width: 2.8 });
      }
      graphic.ellipse(at.x, at.y, radius * 0.24, radius * 0.12).fill({ color, alpha: alpha * 0.52 });
    }
    if (variant === 'hymn' || variant === 'chant') graphic.star(at.x, at.y, 5, radius * 0.66, radius * 0.34).stroke({ color: 0xffffff, alpha: alpha * 0.46, width: 1.8 });
    if (variant === 'crown') graphic.star(at.x, at.y, 7, radius * 0.86, radius * 0.4).stroke({ color: 0xffffff, alpha: alpha * 0.56, width: 2.4 });
    if (variant === 'bind' || variant === 'snare') {
      const coils = variant === 'bind' ? 3 : 2;
      for (let index = 0; index < coils; index++) {
        const angle = progress * Math.PI * 3 + index * Math.PI * 2 / coils;
        const coilRadius = radius * (0.46 + index * 0.12);
        graphic.ellipse(at.x + Math.cos(angle) * coilRadius * 0.32, at.y - 5 + Math.sin(angle) * coilRadius * 0.16, coilRadius * 0.78, coilRadius * 0.28).stroke({ color, alpha: alpha * 0.78, width: 2.6 });
      }
    }
    if (variant === 'dive') {
      const core = 18 + intensity * 16 + Math.sin(progress * Math.PI * 5) * 4;
      graphic.circle(at.x, at.y - 8, core).fill({ color, alpha: 0.30 + Math.sin(progress * Math.PI) * 0.20 })
        .circle(at.x, at.y - 8, core * 0.52).fill({ color: 0xffefab, alpha: 0.62 });
      for (let index = 0; index < 4; index++) {
        const angle = progress * 7 + index * Math.PI * 2 / 4;
        const orbit = 24 + intensity * 15;
        const x = at.x + Math.cos(angle) * orbit;
        const y = at.y - 12 + Math.sin(angle) * orbit * 0.46 - progress * 20;
        graphic.moveTo(x, y + 12).lineTo(x + Math.cos(angle) * 7, y - 15 - intensity * 9).lineTo(x - Math.sin(angle) * 6, y + 5).fill({ color: index === 0 ? 0xfff0ae : color, alpha: 0.90 });
      }
    }
  });
}
