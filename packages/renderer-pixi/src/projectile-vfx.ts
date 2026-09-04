import type { TypeName } from '@pokemon-online/shared';
import { Graphics } from 'pixi.js';
import type { BattleEffectPool } from './BattleEffectPool.ts';
import type { BattleStagePoint } from './battle-stage-layout.ts';
import { elementalVfxShapeFor } from './elemental-vfx.ts';

export function spawnProjectile(
  runtime: BattleEffectPool,
  from: BattleStagePoint,
  to: BattleStagePoint,
  color: number,
  intensity: number,
  variant = 'default',
  element?: TypeName,
): void {
  // A shadow needs to occlude the bright stage, not add light to it.
  const graphic = new Graphics({ blendMode: variant === 'shadow-orb' ? 'normal' : 'add' });
  const duration = variant === 'fire-glyph' ? 0.48 : variant === 'flame-stream' ? 0.38 : variant === 'bind' || variant === 'snare' ? 0.34 : 0.26 + (1 - intensity) * 0.1;
  const shape = elementalVfxShapeFor(element);
  runtime.add(graphic, duration, (progress) => {
    const x = from.x + (to.x - from.x) * progress;
    const y = from.y + (to.y - from.y) * progress;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const nx = dx / length;
    const ny = dy / length;
    const px = -ny;
    const py = nx;
    graphic.clear();
    if (variant === 'arc-bolt') {
      const head = Math.min(1, progress * 1.22);
      const tail = Math.max(0, head - 0.46);
      const phase = Math.floor(progress * 18);
      const segments = 11;
      let previous: BattleStagePoint | null = null;
      for (let segment = 0; segment <= segments; segment++) {
        const t = tail + (head - tail) * segment / segments;
        const taper = Math.sin(segment / segments * Math.PI);
        const noise = Math.sin(segment * 13.17 + phase * 2.19) * 0.64 + Math.sin(segment * 4.91 + phase * 5.03) * 0.36;
        const jitter = segment === 0 || segment === segments ? 0 : noise * (15 + intensity * 11) * taper;
        const axial = segment === 0 || segment === segments ? 0 : Math.sin(segment * 7.71 + phase * 1.37) * 3.5 * taper;
        const next = { x: from.x + dx * t + nx * axial + px * jitter, y: from.y + dy * t + ny * axial + py * jitter };
        if (previous) {
          graphic.moveTo(previous.x, previous.y).lineTo(next.x, next.y).stroke({ color: 0x76cfff, alpha: 0.20, width: 17 + intensity * 8 })
            .moveTo(previous.x, previous.y).lineTo(next.x, next.y).stroke({ color: 0xffe76b, alpha: 0.94, width: 7 + intensity * 3 })
            .moveTo(previous.x, previous.y).lineTo(next.x, next.y).stroke({ color: 0xffffff, alpha: 0.98, width: 2.2 });
          if ((segment === 3 || segment === 6 || segment === 9) && head > t) {
            const side = segment % 2 ? -1 : 1;
            const branchLength = 22 + intensity * 18;
            const branchX = next.x - nx * 9 + px * branchLength * side;
            const branchY = next.y - ny * 9 + py * branchLength * side;
            graphic.moveTo(next.x, next.y).lineTo(next.x + px * branchLength * side * 0.38, next.y + py * branchLength * side * 0.38).lineTo(branchX, branchY)
              .stroke({ color: 0x7dcfff, alpha: 0.24, width: 9 })
              .moveTo(next.x, next.y).lineTo(next.x + px * branchLength * side * 0.38, next.y + py * branchLength * side * 0.38).lineTo(branchX, branchY)
              .stroke({ color: 0xdffcff, alpha: 0.84, width: 2.8 });
          }
        }
        previous = next;
      }
      const headX = from.x + dx * head;
      const headY = from.y + dy * head;
      graphic.circle(headX, headY, 13 + intensity * 8).fill({ color: 0xeaffff, alpha: 0.32 })
        .circle(headX, headY, 5 + intensity * 3).fill({ color: 0xffffff, alpha: 0.94 });
    } else if (variant === 'flame-bolt') {
      const flameLength = 30 + intensity * 18;
      const flameWidth = 10 + intensity * 7;
      graphic.poly([x - nx * 12, y - ny * 12, x + px * flameWidth, y + py * flameWidth, x + nx * flameLength, y + ny * flameLength, x - px * flameWidth, y - py * flameWidth]).fill({ color, alpha: 0.86 })
        .poly([x - nx * 5, y - ny * 5, x + px * flameWidth * 0.38, y + py * flameWidth * 0.38, x + nx * (flameLength - 8), y + ny * (flameLength - 8), x - px * flameWidth * 0.38, y - py * flameWidth * 0.38]).fill({ color: 0xfff1a9, alpha: 0.96 });
      for (let ember = 0; ember < 4; ember++) graphic.circle(x - nx * (12 + ember * 9) + px * Math.sin(progress * 14 + ember) * 5, y - ny * (12 + ember * 9) + py * Math.sin(progress * 14 + ember) * 5, 3 + intensity * 2).fill({ color: ember % 2 ? color : 0xffcb69, alpha: 0.66 });
    } else if (variant === 'water-shot') {
      graphic.ellipse(x, y, 14 + intensity * 8, 9 + intensity * 5).fill({ color, alpha: 0.82 }).ellipse(x + nx * 5, y + ny * 5, 8 + intensity * 4, 5 + intensity * 2).fill({ color: 0xe0faff, alpha: 0.92 });
      for (let arc = -1; arc <= 1; arc++) graphic.moveTo(x - nx * 18 + px * arc * 8, y - ny * 18 + py * arc * 8).lineTo(x + nx * 13 + px * arc * 5, y + ny * 13 + py * arc * 5).stroke({ color: 0xc7f4ff, alpha: 0.64, width: 2 });
    } else if (variant === 'spark-bolt') {
      let previous = { x: x - nx * 18, y: y - ny * 18 };
      for (let segment = 1; segment <= 5; segment++) { const next = { x: x - nx * 18 + nx * segment * 10 + px * (segment % 2 ? 8 : -8), y: y - ny * 18 + ny * segment * 10 + py * (segment % 2 ? 8 : -8) }; graphic.moveTo(previous.x, previous.y).lineTo(next.x, next.y).stroke({ color, alpha: 0.92, width: 4 + intensity * 2 }).moveTo(previous.x, previous.y).lineTo(next.x, next.y).stroke({ color: 0xffffff, alpha: 0.94, width: 1.5 }); previous = next; }
    } else if (variant === 'leaf-shot') {
      for (let leaf = 0; leaf < 3; leaf++) { const angle = progress * 13 + leaf * Math.PI * 2 / 3; graphic.ellipse(x + Math.cos(angle) * 10, y + Math.sin(angle) * 7, 12 + intensity * 4, 5).fill({ color, alpha: 0.84 }); }
    } else if (variant === 'shadow-orb') {
      const radius = (16 + intensity * 10) * (1 + Math.sin(progress * 18) * 0.06);
      for (let wisp = 4; wisp >= 1; wisp--) {
        const distance = Math.min(length * progress, wisp * radius * 0.65);
        const sway = Math.sin(progress * 16 - wisp * 1.4) * radius * 0.22;
        graphic.circle(x - nx * distance + px * sway, y - ny * distance + py * sway, radius * (1 - wisp * 0.15))
          .fill({ color, alpha: 0.38 - wisp * 0.055 });
      }
      graphic.circle(x, y, radius * 1.18).fill({ color, alpha: 0.22 })
        .circle(x, y, radius).fill({ color: 0x382050, alpha: 0.96 })
        .circle(x, y, radius * 0.72).fill({ color: 0x190d2c, alpha: 0.96 })
        .circle(x, y, radius).stroke({ color, alpha: 0.92, width: 2.5 });
      for (let arc = 0; arc < 3; arc++) {
        const angle = progress * 10 + arc * Math.PI * 2 / 3;
        const orbit = radius * (1.13 + arc * 0.08);
        graphic.moveTo(x + Math.cos(angle) * orbit, y + Math.sin(angle) * orbit)
          .arc(x, y, orbit, angle, angle + 1.05)
          .stroke({ color, alpha: 0.76 - arc * 0.12, width: 2 });
      }
    } else if (variant === 'stone-shot') {
      graphic.poly([x + nx * 16, y + ny * 16, x + px * 14, y + py * 14, x - nx * 14, y - ny * 14, x - px * 14, y - py * 14]).fill({ color, alpha: 0.9 });
    } else if (variant === 'wind-cutter') {
      for (const side of [-1, 1]) graphic.moveTo(x - nx * 18 + px * side * 9, y - ny * 18 + py * side * 9).lineTo(x + nx * 21, y + ny * 21).stroke({ color, alpha: 0.82, width: 4 + intensity * 2 });
    } else if (variant === 'fairy-spark' || variant === 'neutral-star') {
      graphic.star(x, y, variant === 'fairy-spark' ? 5 : 4, 14 + intensity * 8, 5 + intensity * 3).fill({ color: variant === 'fairy-spark' ? 0xffeff9 : color, alpha: 0.9 });
    } else if (shape === 'flame' && variant === 'flame-stream') {
      const streamLength = 78 + intensity * 38;
      const streamWidth = 16 + intensity * 13;
      const tail = { x: from.x + dx * Math.max(0, progress - 0.36), y: from.y + dy * Math.max(0, progress - 0.36) };
      for (let lane = -2; lane <= 2; lane++) {
        const offset = lane * streamWidth * 0.26 + Math.sin(progress * 22 + lane) * 4;
        graphic.moveTo(tail.x + px * offset, tail.y + py * offset).lineTo(x + nx * streamLength + px * offset * 0.34, y + ny * streamLength + py * offset * 0.34)
          .stroke({ color: lane === 0 ? 0xfff3bc : lane % 2 ? 0xffbc4e : color, alpha: (1 - Math.abs(lane) * 0.12) * 0.82, width: streamWidth * (lane === 0 ? 0.54 : 0.38) });
      }
      for (let ember = 0; ember < 9; ember++) {
        const trail = (ember / 9 + progress * 1.8) % 1;
        const sway = Math.sin(progress * 26 + ember * 1.9) * streamWidth * 0.54;
        graphic.circle(x - nx * trail * streamLength + px * sway, y - ny * trail * streamLength + py * sway, 3 + intensity * 3).fill({ color: ember % 3 ? color : 0xffef9b, alpha: 0.72 });
      }
    } else if (shape === 'flame' && variant === 'fire-glyph') {
      const scale = 1.1 + intensity * 0.52;
      const glyphX = x + nx * 10;
      const glyphY = y + ny * 10;
      const arm = 24 * scale;
      const stroke = 8 * scale;
      const glyphAlpha = 0.92 - progress * 0.18;
      graphic.moveTo(glyphX - arm, glyphY - arm).lineTo(glyphX + arm, glyphY - arm).stroke({ color, alpha: glyphAlpha, width: stroke })
        .moveTo(glyphX, glyphY - arm).lineTo(glyphX, glyphY + arm).stroke({ color, alpha: glyphAlpha, width: stroke })
        .moveTo(glyphX - arm * 0.78, glyphY).lineTo(glyphX + arm * 0.78, glyphY).stroke({ color, alpha: glyphAlpha, width: stroke })
        .moveTo(glyphX - arm, glyphY + arm).lineTo(glyphX + arm, glyphY + arm).stroke({ color: 0xffd162, alpha: glyphAlpha, width: stroke });
      graphic.circle(glyphX, glyphY, 10 + intensity * 8).fill({ color: 0xfff4bc, alpha: 0.94 });
      for (let ember = 0; ember < 8; ember++) {
        const angle = ember / 8 * Math.PI * 2 + progress * 7;
        graphic.circle(glyphX + Math.cos(angle) * arm * 0.9, glyphY + Math.sin(angle) * arm * 0.58, 3 + intensity * 2).fill({ color: ember % 2 ? color : 0xfff0a7, alpha: 0.72 });
      }
    } else if (shape === 'generic') {
      // Fallback only: never paint a generic light disc over an explicit motif.
      graphic.moveTo(from.x, from.y).lineTo(x, y).stroke({ color, alpha: (1 - progress) * 0.46, width: 6 * intensity })
        .circle(x, y, 8 + intensity * 10).fill({ color, alpha: 0.9 });
    } else drawElementalProjectile(graphic, shape, { x, y }, { nx, ny, px, py }, color, intensity, progress);
    if (variant === 'psychic-bolt' && shape !== 'psychic-orbit') {
      const orbit = 11 + intensity * 7;
      for (let index = 0; index < 3; index++) {
        const angle = progress * 18 + index * Math.PI * 2 / 3;
        graphic.circle(x + Math.cos(angle) * orbit, y + Math.sin(angle) * orbit * 0.58, 3 + intensity * 2).fill({ color: 0xffffff, alpha: (1 - progress) * 0.8 });
      }
    } else if (variant === 'elemental-bolt' && shape === 'generic') {
      graphic.star(x, y, 4, 10 + intensity * 7, 3 + intensity * 2).fill({ color: 0xffffff, alpha: (1 - progress) * 0.72 });
    }
    if (variant === 'chain') graphic.moveTo(x, y).lineTo(x + Math.sin(progress * 19) * 18, y + Math.cos(progress * 13) * 12).stroke({ color: 0xffffff, alpha: (1 - progress) * 0.75, width: 2 });
    if (variant === 'bind' || variant === 'snare') {
      const twists = variant === 'bind' ? 3 : 2;
      for (let index = 0; index < twists; index++) {
        const phase = progress * 18 + index * Math.PI / twists;
        graphic.circle(x + Math.cos(phase) * (12 + intensity * 9), y + Math.sin(phase * 1.4) * (8 + intensity * 5), 2.5 + intensity * 2).fill({ color: 0xffffff, alpha: (1 - progress) * 0.58 });
      }
    }
  });
}

function drawElementalProjectile(
  graphic: Graphics,
  shape: ReturnType<typeof elementalVfxShapeFor>,
  at: BattleStagePoint,
  basis: { nx: number; ny: number; px: number; py: number },
  color: number,
  intensity: number,
  progress: number,
): void {
  const { nx, ny, px, py } = basis;
  if (shape === 'flame') {
    const length = 26 + intensity * 20;
    const width = 9 + intensity * 8;
    const tip = { x: at.x + nx * length, y: at.y + ny * length };
    const left = { x: at.x + px * width, y: at.y + py * width };
    const right = { x: at.x - px * width, y: at.y - py * width };
    graphic.poly([at.x - nx * 10, at.y - ny * 10, left.x, left.y, tip.x, tip.y, right.x, right.y]).fill({ color, alpha: 0.82 })
      .poly([at.x - nx * 4, at.y - ny * 4, at.x + px * width * 0.42, at.y + py * width * 0.42, tip.x - nx * 8, tip.y - ny * 8, at.x - px * width * 0.42, at.y - py * width * 0.42]).fill({ color: 0xffefad, alpha: 0.94 });
    for (let index = 0; index < 3; index++) {
      const trail = 10 + index * 9 + progress * 13;
      graphic.circle(at.x - nx * trail + px * Math.sin(progress * 14 + index) * 5, at.y - ny * trail + py * Math.sin(progress * 14 + index) * 5, 3 + intensity * 2 - index * 0.45).fill({ color: index === 0 ? 0xffdb75 : color, alpha: 0.62 - index * 0.12 });
    }
  } else if (shape === 'lightning') {
    const length = 32 + intensity * 22;
    const segments = 5;
    let previous = { x: at.x - nx * 10, y: at.y - ny * 10 };
    for (let index = 1; index <= segments; index++) {
      const travel = length * index / segments;
      const zig = (index % 2 ? 1 : -1) * (6 + intensity * 5);
      const next = { x: at.x + nx * travel + px * zig, y: at.y + ny * travel + py * zig };
      graphic.moveTo(previous.x, previous.y).lineTo(next.x, next.y).stroke({ color: 0xffe96a, alpha: 0.92, width: 4 + intensity * 2 })
        .moveTo(previous.x, previous.y).lineTo(next.x, next.y).stroke({ color: 0xffffff, alpha: 0.88, width: 1.4 });
      if (index === 3) graphic.moveTo(next.x, next.y).lineTo(next.x + px * 13 - nx * 5, next.y + py * 13 - ny * 5).stroke({ color, alpha: 0.68, width: 2 });
      previous = next;
    }
  } else if (shape === 'psychic-orbit') {
    const orbit = 15 + intensity * 9;
    for (let ring = 0; ring < 3; ring++) {
      const angle = progress * 16 + ring * Math.PI * 2 / 3;
      const cx = at.x + Math.cos(angle) * orbit;
      const cy = at.y + Math.sin(angle) * orbit * 0.52;
      graphic.ellipse(cx, cy, 10 + ring * 2, 4 + ring).stroke({ color, alpha: 0.78 - ring * 0.14, width: 2 })
        .circle(cx, cy, 2.5 + intensity * 1.5).fill({ color: ring === 0 ? 0xffffff : color, alpha: 0.88 });
    }
    graphic.ellipse(at.x, at.y, 12 + intensity * 5, 7 + intensity * 3).stroke({ color: 0xffffff, alpha: 0.72, width: 2 });
  } else if (shape === 'water-wave') {
    graphic.moveTo(at.x - nx * 18 - px * 8, at.y - ny * 18 - py * 8).lineTo(at.x + nx * 20 + px * 10, at.y + ny * 20 + py * 10).stroke({ color, alpha: 0.78, width: 7 + intensity * 5 })
      .moveTo(at.x - nx * 16 + px * 8, at.y - ny * 16 + py * 8).lineTo(at.x + nx * 22 - px * 8, at.y + ny * 22 - py * 8).stroke({ color: 0xd7fbff, alpha: 0.78, width: 2.5 });
  } else if (shape === 'ice-shard') {
    graphic.poly([at.x + nx * 22, at.y + ny * 22, at.x - nx * 10 + px * 10, at.y - ny * 10 + py * 10, at.x - nx * 10 - px * 10, at.y - ny * 10 - py * 10]).fill({ color, alpha: 0.88 });
  } else if (shape === 'leaf') {
    for (let index = 0; index < 3; index++) {
      const a = progress * 12 + index * Math.PI * 2 / 3;
      graphic.ellipse(at.x + Math.cos(a) * 12, at.y + Math.sin(a) * 8, 9, 4).fill({ color, alpha: 0.74 });
    }
  }
}
