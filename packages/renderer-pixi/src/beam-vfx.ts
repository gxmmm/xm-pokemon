import type { TypeName } from '@pokemon-online/shared';
import { Graphics } from 'pixi.js';
import type { BattleEffectPool } from './BattleEffectPool.ts';
import type { BattleStagePoint } from './battle-stage-layout.ts';
import { elementalVfxShapeFor } from './elemental-vfx.ts';
import { spawnFlameStream } from './flame-stream-vfx.ts';

export function spawnBeam(runtime: BattleEffectPool, from: BattleStagePoint, to: BattleStagePoint, color: number, intensity: number, variant = 'default', element?: TypeName, resolveSource?: () => BattleStagePoint | undefined): void {
  const shape = elementalVfxShapeFor(element);
  if (shape === 'flame' && variant === 'flame-stream') {
    spawnFlameStream(runtime, from, to, color, intensity, resolveSource);
    return;
  }
  const graphic = new Graphics({ blendMode: 'add' });
  const duration = 0.38 + intensity * 0.18;
  runtime.add(graphic, duration, (progress) => {
    const source = resolveSource ? resolveSource() : from;
    graphic.visible = !!source;
    if (!source) return;
    from = source;
    const alpha = Math.sin(Math.PI * progress) * 0.92;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const nx = dx / length;
    const ny = dy / length;
    const px = -ny;
    const py = nx;
    const width = 10 + intensity * 22;
    graphic.clear();
    if (shape === 'flame') {
      for (let lane = -1; lane <= 1; lane++) {
        const offset = lane * width * 0.28;
        graphic.moveTo(from.x + px * offset, from.y + py * offset).lineTo(to.x + px * offset, to.y + py * offset).stroke({ color: lane === 0 ? 0xffefad : color, alpha: alpha * (lane === 0 ? 0.92 : 0.56), width: lane === 0 ? width * 0.46 : width * 0.38 });
      }
      for (let ember = 0; ember < 7; ember++) {
        const t = (ember / 6 + progress * 0.42) % 1;
        const sway = Math.sin(progress * 18 + ember * 2.2) * width * 0.34;
        graphic.circle(from.x + dx * t + px * sway, from.y + dy * t + py * sway, 3 + intensity * 4).fill({ color: ember % 2 ? color : 0xffd56e, alpha: alpha * 0.78 });
      }
    } else if (shape === 'lightning') {
      const segments = 9;
      let previous = from;
      for (let index = 1; index <= segments; index++) {
        const t = index / segments;
        const zig = index === segments ? 0 : (index % 2 ? 1 : -1) * width * (0.42 + Math.sin(progress * 15 + index) * 0.16);
        const next = { x: from.x + dx * t + px * zig, y: from.y + dy * t + py * zig };
        graphic.moveTo(previous.x, previous.y).lineTo(next.x, next.y).stroke({ color: 0xffe96a, alpha, width: width * 0.42 })
          .moveTo(previous.x, previous.y).lineTo(next.x, next.y).stroke({ color: 0xffffff, alpha, width: 2.5 });
        if (index === 3 || index === 6) graphic.moveTo(next.x, next.y).lineTo(next.x + px * width * 1.1 - nx * 12, next.y + py * width * 1.1 - ny * 12).stroke({ color, alpha: alpha * 0.72, width: 3 });
        previous = next;
      }
    } else if (shape === 'psychic-orbit') {
      graphic.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ color, alpha: alpha * 0.48, width: width * 0.42 });
      for (let ring = 0; ring < 6; ring++) {
        const t = ring / 5;
        const phase = progress * 10 + ring * 1.7;
        const cx = from.x + dx * t + px * Math.sin(phase) * width * 0.46;
        const cy = from.y + dy * t + py * Math.sin(phase) * width * 0.46;
        graphic.ellipse(cx, cy, width * 0.70, width * 0.28).stroke({ color: ring % 2 ? color : 0xffffff, alpha: alpha * 0.75, width: 2.4 });
      }
    } else {
      graphic.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ color, alpha, width })
        .moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ color: 0xffffff, alpha: alpha * 0.75, width: 2 });
    }
    if (variant === 'meteor') graphic.circle(to.x, to.y, 22 + progress * (22 + intensity * 18)).stroke({ color, alpha: alpha * 0.48, width: 3 });
  });
}
