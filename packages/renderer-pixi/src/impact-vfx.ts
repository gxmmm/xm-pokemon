import type { TypeName } from '@pokemon-online/shared';
import { Graphics } from 'pixi.js';
import type { BattleEffectPool } from './BattleEffectPool.ts';
import type { BattleStagePoint } from './battle-stage-layout.ts';
import { elementalVfxShapeFor } from './elemental-vfx.ts';

export function spawnImpact(runtime: BattleEffectPool, at: BattleStagePoint, color: number, intensity: number, variant = 'default'): void {
  const graphic = new Graphics({ blendMode: 'add' });
  const duration = variant === 'dive' ? 0.48 : 0.28;
  runtime.add(graphic, duration, (progress) => {
    const radius = 12 + progress * (34 + intensity * 28);
    graphic.clear().circle(at.x, at.y, radius).stroke({ color, alpha: (1 - progress) * 0.8, width: 5 * (1 - progress) + 1 })
      .star(at.x, at.y, variant === 'cross' ? 4 : 6, radius * 0.72, radius * 0.28).fill({ color, alpha: (1 - progress) * 0.36 });
    // Normal-attack motifs are supplied by static config through the cue. This
    // generic primitive only interprets a vocabulary; it never knows a species.
    const alpha = (1 - progress) * 0.92;
    if (variant === 'fist') {
      graphic.circle(at.x - radius * 0.2, at.y, radius * 0.42).fill({ color, alpha })
        .circle(at.x + radius * 0.22, at.y - radius * 0.14, radius * 0.28).fill({ color: 0xffffff, alpha: alpha * 0.58 });
    } else if (variant === 'claw') {
      for (let index = -1; index <= 1; index++) {
        const offset = index * radius * 0.22;
        graphic.moveTo(at.x - radius * 0.56, at.y + offset + radius * 0.42).lineTo(at.x + radius * 0.54, at.y + offset - radius * 0.42)
          .stroke({ color: index === 0 ? 0xffffff : color, alpha, width: 3 + intensity * 2 });
      }
    } else if (variant === 'bite') {
      for (const direction of [-1, 1]) {
        graphic.poly([at.x + direction * radius * 0.58, at.y - radius * 0.42, at.x + direction * radius * 0.18, at.y, at.x + direction * radius * 0.58, at.y + radius * 0.42]).fill({ color, alpha });
      }
    } else if (variant === 'horn' || variant === 'tail') {
      graphic.moveTo(at.x - radius * 0.7, at.y + radius * 0.3).lineTo(at.x + radius * 0.7, at.y - radius * 0.3).stroke({ color: 0xffffff, alpha, width: 5 + intensity * 3 });
    } else if (variant === 'body-slam') {
      graphic.ellipse(at.x, at.y, radius * 0.85, radius * 0.46).fill({ color, alpha: alpha * 0.58 });
    } else if (variant === 'wing-slap') {
      for (const side of [-1, 1]) graphic.moveTo(at.x - radius * 0.62, at.y + side * radius * 0.28).lineTo(at.x + radius * 0.62, at.y - side * radius * 0.28).stroke({ color: side > 0 ? 0xffffff : color, alpha, width: 5 + intensity * 3 });
    } else if (variant === 'beak-peck' || variant === 'tusk-gore') {
      const prongs = variant === 'tusk-gore' ? [-1, 1] : [0];
      for (const prong of prongs) graphic.poly([at.x - radius * 0.68, at.y + prong * radius * 0.22, at.x + radius * 0.70, at.y + prong * radius * 0.12, at.x - radius * 0.18, at.y + prong * radius * 0.48]).fill({ color: prong === 0 ? 0xffffff : color, alpha });
    } else if (variant === 'pincer-snap') {
      for (const side of [-1, 1]) graphic.moveTo(at.x - radius * 0.54, at.y + side * radius * 0.54).lineTo(at.x + radius * 0.50, at.y + side * radius * 0.12).lineTo(at.x + radius * 0.17, at.y).stroke({ color: side > 0 ? 0xffffff : color, alpha, width: 5 + intensity * 3 });
    } else if (variant === 'whip-lash') {
      graphic.moveTo(at.x - radius * 0.72, at.y + radius * 0.34).lineTo(at.x - radius * 0.12, at.y - radius * 0.48).lineTo(at.x + radius * 0.70, at.y + radius * 0.10).stroke({ color, alpha, width: 5 + intensity * 3 });
    } else if (variant === 'kick') {
      graphic.moveTo(at.x - radius * 0.62, at.y + radius * 0.46).lineTo(at.x + radius * 0.62, at.y - radius * 0.30).stroke({ color: 0xffffff, alpha, width: 7 + intensity * 3 });
    } else if (variant === 'shell-bash') {
      graphic.arc(at.x, at.y, radius * 0.68, Math.PI * 0.15, Math.PI * 1.85).stroke({ color, alpha, width: 7 + intensity * 3 }).circle(at.x, at.y, radius * 0.30).fill({ color: 0xffffff, alpha: alpha * 0.46 });
    }
    if (variant === 'fire-glyph') {
      const glyph = radius * (0.72 + progress * 0.42);
      const line = Math.max(4, 7 + intensity * 4 - progress * 3);
      graphic.moveTo(at.x - glyph, at.y - glyph).lineTo(at.x + glyph, at.y - glyph).stroke({ color, alpha: alpha * 0.84, width: line })
        .moveTo(at.x, at.y - glyph).lineTo(at.x, at.y + glyph).stroke({ color: 0xffe08a, alpha, width: line })
        .moveTo(at.x - glyph * 0.8, at.y).lineTo(at.x + glyph * 0.8, at.y).stroke({ color, alpha, width: line })
        .moveTo(at.x - glyph, at.y + glyph).lineTo(at.x + glyph, at.y + glyph).stroke({ color: 0xffbc4b, alpha: alpha * 0.82, width: line });
      graphic.circle(at.x, at.y, glyph * 0.43).fill({ color: 0xfff2b1, alpha: alpha * 0.82 });
      for (let index = 0; index < 10; index++) {
        const angle = index / 10 * Math.PI * 2 + progress * 4;
        const distance = glyph * (0.68 + progress * 0.46);
        graphic.moveTo(at.x + Math.cos(angle) * glyph * 0.18, at.y + Math.sin(angle) * glyph * 0.14)
          .lineTo(at.x + Math.cos(angle) * distance, at.y + Math.sin(angle) * distance * 0.62)
          .stroke({ color: index % 2 ? color : 0xffe69c, alpha: alpha * 0.86, width: 2 + intensity * 2 });
      }
    }
    if (variant === 'dive') {
      // Independent impact burst: the release trail is drawn by spawnDive;
      // this target-local phase must read as a fireball detonation on its own.
      const blast = 26 + progress * (46 + intensity * 36);
      graphic.circle(at.x, at.y, blast * (0.55 + progress * 0.25)).fill({ color, alpha: (1 - progress) * 0.30 })
        .circle(at.x, at.y, blast * 0.38).fill({ color: 0xffefae, alpha: (1 - progress) * 0.76 });
      for (let index = 0; index < 9; index++) {
        const angle = index / 9 * Math.PI * 2 + progress * 1.4;
        const distance = blast * (0.46 + progress * (0.42 + (index % 2) * 0.12));
        const x = at.x + Math.cos(angle) * distance;
        const y = at.y + Math.sin(angle) * distance * 0.65;
        graphic.moveTo(at.x + Math.cos(angle) * blast * 0.18, at.y + Math.sin(angle) * blast * 0.12)
          .lineTo(x, y).stroke({ color: index % 2 ? 0xffbd4b : 0xff6a32, alpha: (1 - progress) * 0.90, width: 3 + intensity * 3 })
          .circle(x, y, 3 + intensity * 3).fill({ color: 0xffe7a0, alpha: (1 - progress) * 0.84 });
      }
    }
  });
}

/** Generic source-to-target plunge used by any melee recipe with the `dive`
 * motif. The layered taper and staggered embers deliberately read as flame
 * rather than a flat rectangular beam. */
export function spawnDive(runtime: BattleEffectPool, from: BattleStagePoint, to: BattleStagePoint, color: number, intensity: number): void {
  const graphic = new Graphics({ blendMode: 'add' });
  const duration = 0.38;
  runtime.add(graphic, duration, (progress) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const px = -dy / length;
    const py = dx / length;
    const headT = Math.min(1, progress * 1.22);
    const tailT = Math.max(0, headT - 0.36);
    const head = { x: from.x + dx * headT, y: from.y + dy * headT };
    const tail = { x: from.x + dx * tailT, y: from.y + dy * tailT };
    const headWidth = 10 + intensity * 9;
    const tailWidth = 3 + intensity * 4;
    const flare = Math.sin(progress * Math.PI) * (5 + intensity * 5);
    graphic.clear()
      .poly([
        tail.x + px * tailWidth, tail.y + py * tailWidth,
        head.x + px * (headWidth + flare), head.y + py * (headWidth + flare),
        head.x - px * (headWidth + flare), head.y - py * (headWidth + flare),
        tail.x - px * tailWidth, tail.y - py * tailWidth,
      ]).fill({ color, alpha: 0.46 })
      .poly([
        tail.x + px * Math.max(1, tailWidth * 0.38), tail.y + py * Math.max(1, tailWidth * 0.38),
        head.x + px * (headWidth * 0.36), head.y + py * (headWidth * 0.36),
        head.x - px * (headWidth * 0.36), head.y - py * (headWidth * 0.36),
        tail.x - px * Math.max(1, tailWidth * 0.38), tail.y - py * Math.max(1, tailWidth * 0.38),
      ]).fill({ color: 0xfff1ae, alpha: 0.88 });
    const emberCount = 5;
    for (let index = 0; index < emberCount; index++) {
      const t = Math.max(0, headT - index / (emberCount + 1) * 0.42);
      const sway = Math.sin(progress * 18 + index * 2.3) * (5 + intensity * 4);
      const x = from.x + dx * t + px * sway;
      const y = from.y + dy * t + py * sway;
      graphic.circle(x, y, Math.max(2, 5 + intensity * 3 - index * 0.35)).fill({ color: index % 2 ? color : 0xffea9a, alpha: 0.80 - index * 0.055 });
    }
    graphic.circle(head.x, head.y, 10 + intensity * 10).fill({ color: 0xfff0b1, alpha: 0.94 })
      .circle(head.x, head.y, 17 + intensity * 14).stroke({ color, alpha: 0.68, width: 3 + intensity * 2 });
  });
}

export function spawnBurst(runtime: BattleEffectPool, at: BattleStagePoint, color: number, intensity: number, variant = 'default', particleBudget?: number, element?: TypeName): void {
  const graphic = new Graphics({ blendMode: 'add' });
  const particleCap = 16;
  const particleCount = Math.min(Math.max(particleBudget ?? particleCap, 9), particleCap);
  const shape = elementalVfxShapeFor(element);
  const duration = 0.46 + intensity * 0.22;
  runtime.add(graphic, duration, (progress) => {
    const blast = 46 + intensity * 78;
    const alpha = (1 - progress) * 0.92;
    graphic.clear();
    if (shape === 'flame') {
      graphic.circle(at.x, at.y, blast * (0.22 + progress * 0.48)).fill({ color, alpha: alpha * 0.28 })
        .circle(at.x, at.y, blast * (0.13 + progress * 0.25)).fill({ color: 0xffefad, alpha: alpha * 0.84 });
      for (let flame = 0; flame < 10; flame++) {
        const angle = flame / 10 * Math.PI * 2 + progress * 0.8;
        const rise = blast * (0.34 + progress * 0.5);
        const bx = at.x + Math.cos(angle) * rise;
        const by = at.y + Math.sin(angle) * rise * 0.58;
        graphic.poly([bx - 7, by + 12, bx + Math.cos(angle) * 14, by - 20 - intensity * 18, bx + 8, by + 12]).fill({ color: flame % 2 ? color : 0xffc95d, alpha: alpha * 0.86 });
      }
    } else if (shape === 'lightning') {
      for (let bolt = 0; bolt < 5; bolt++) {
        const angle = bolt / 5 * Math.PI * 2 + progress * 0.28;
        const end = { x: at.x + Math.cos(angle) * blast * 0.72, y: at.y + Math.sin(angle) * blast * 0.44 };
        let previous = { x: at.x, y: at.y - 72 - bolt * 6 };
        for (let segment = 1; segment <= 5; segment++) {
          const t = segment / 5;
          const nx = previous.x + (end.x - previous.x) * t + Math.sin(segment * 3.2 + bolt) * 12;
          const ny = previous.y + (end.y - previous.y) * t;
          graphic.moveTo(previous.x, previous.y).lineTo(nx, ny).stroke({ color: 0xffe96a, alpha, width: 5 + intensity * 3 })
            .moveTo(previous.x, previous.y).lineTo(nx, ny).stroke({ color: 0xffffff, alpha, width: 1.8 });
          previous = { x: nx, y: ny };
        }
      }
      graphic.circle(at.x, at.y, blast * 0.28).stroke({ color: 0xfff4a5, alpha: alpha * 0.76, width: 4 });
    } else if (shape === 'psychic-orbit') {
      for (let ring = 0; ring < 5; ring++) {
        const radius = blast * (0.20 + ring * 0.13 + progress * 0.17);
        const rotation = progress * 8 + ring * 0.64;
        const cx = at.x + Math.cos(rotation) * ring * 8;
        const cy = at.y + Math.sin(rotation) * ring * 5;
        graphic.ellipse(cx, cy, radius, radius * 0.38).stroke({ color: ring % 2 ? color : 0xffffff, alpha: alpha * (0.80 - ring * 0.09), width: 3 });
      }
      for (let rune = 0; rune < 7; rune++) {
        const angle = rune / 7 * Math.PI * 2 - progress * 5;
        graphic.circle(at.x + Math.cos(angle) * blast * 0.52, at.y + Math.sin(angle) * blast * 0.28, 5 + intensity * 3).fill({ color, alpha: alpha * 0.82 });
      }
    } else {
      for (let index = 0; index < particleCount; index++) {
        const angle = index / particleCount * Math.PI * 2;
        const radius = progress * blast * (0.65 + (index % 3) * 0.16);
        graphic.circle(at.x + Math.cos(angle) * radius, at.y + Math.sin(angle) * radius * (variant === 'surge' ? 0.82 : 0.55), 4 + intensity * 5).fill({ color, alpha: alpha * 0.82 });
      }
    }
  });
}
