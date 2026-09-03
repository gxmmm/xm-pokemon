import { Graphics } from 'pixi.js';
import type { BattleEffectPool } from './BattleEffectPool.ts';
import { BATTLE_DESIGN_HEIGHT, BATTLE_DESIGN_WIDTH, type BattleStagePoint } from './battle-stage-layout.ts';

/** A vertical, target-owned discharge. Lightning appears in a few stepped
 * silhouettes instead of travelling smoothly, which keeps it reading as an
 * instantaneous atmospheric strike rather than a yellow projectile. */
export function spawnSkyStrike(runtime: BattleEffectPool, at: BattleStagePoint, intensity: number): void {
  const shade = new Graphics();
  const graphic = new Graphics({ blendMode: 'add' });
  const duration = runtime.isReduceFlickerEnabled ? 0.56 : 0.48;
  runtime.add(shade, duration, (progress) => {
    const reduced = runtime.isReduceFlickerEnabled;
    const rise = Math.min(1, progress / 0.16);
    const fall = progress < 0.42 ? 1 : Math.max(0, (1 - progress) / 0.58);
    shade.clear().rect(0, 0, BATTLE_DESIGN_WIDTH, BATTLE_DESIGN_HEIGHT).fill({ color: 0x06121d, alpha: rise * fall * (reduced ? 0.055 : 0.14) });
  });
  runtime.add(graphic, duration, (progress) => {
    const reduced = runtime.isReduceFlickerEnabled;
    const strikeStart = 0.16;
    const strikeEnd = reduced ? 0.62 : 0.56;
    const strikeProgress = Math.max(0, Math.min(1, (progress - strikeStart) / (strikeEnd - strikeStart)));
    const strikeAlpha = progress < strikeStart || progress > strikeEnd ? 0 : Math.sin(strikeProgress * Math.PI) * (reduced ? 0.62 : 1);
    const afterAlpha = progress < 0.34 ? 0 : (1 - progress) * 0.86;
    const top = Math.max(-50, at.y - (360 + intensity * 120));
    const phase = Math.floor(strikeProgress * (reduced ? 3 : 6));
    graphic.clear();

    const warningAlpha = progress < strikeStart ? (1 - progress / strikeStart) * 0.46 : 0;
    if (warningAlpha > 0) {
      graphic.moveTo(at.x, top).lineTo(at.x, at.y + 10).stroke({ color: 0xb9eaff, alpha: warningAlpha, width: 2 })
        .ellipse(at.x, at.y + 24, 30 + progress * 28, 9 + progress * 4).stroke({ color: 0xffe66b, alpha: warningAlpha * 0.82, width: 3 });
    }

    if (strikeAlpha > 0) {
      if (!reduced) graphic.rect(0, 0, BATTLE_DESIGN_WIDTH, BATTLE_DESIGN_HEIGHT).fill({ color: 0xdaf6ff, alpha: strikeAlpha * 0.075 });
      const segments = 10;
      let previous = { x: at.x + Math.sin(phase * 1.7) * 22, y: top };
      for (let segment = 1; segment <= segments; segment++) {
        const t = segment / segments;
        const spread = Math.sin(t * Math.PI) * (30 + intensity * 20);
        const jitter = segment === segments ? 0 : Math.sin(segment * 11.71 + phase * 2.83) * spread;
        const next = { x: at.x + jitter, y: top + (at.y - top) * t };
        graphic.moveTo(previous.x, previous.y).lineTo(next.x, next.y).stroke({ color: 0x65bfff, alpha: strikeAlpha * 0.26, width: 28 + intensity * 11 })
          .moveTo(previous.x, previous.y).lineTo(next.x, next.y).stroke({ color: 0xffe96a, alpha: strikeAlpha * 0.96, width: 11 + intensity * 4 })
          .moveTo(previous.x, previous.y).lineTo(next.x, next.y).stroke({ color: 0xffffff, alpha: strikeAlpha, width: 3.2 });
        if (segment === 3 || segment === 5 || segment === 7) {
          const side = segment % 2 ? -1 : 1;
          const branch = 36 + intensity * 30 + segment * 4;
          const elbow = { x: next.x + side * branch * 0.42, y: next.y + branch * 0.25 };
          const end = { x: next.x + side * branch, y: next.y + branch * 0.58 };
          graphic.moveTo(next.x, next.y).lineTo(elbow.x, elbow.y).lineTo(end.x, end.y).stroke({ color: 0x8dd8ff, alpha: strikeAlpha * 0.28, width: 12 + intensity * 4 })
            .moveTo(next.x, next.y).lineTo(elbow.x, elbow.y).lineTo(end.x, end.y).stroke({ color: 0xfff28a, alpha: strikeAlpha * 0.78, width: 4 + intensity * 2 })
            .moveTo(next.x, next.y).lineTo(elbow.x, elbow.y).lineTo(end.x, end.y).stroke({ color: 0xffffff, alpha: strikeAlpha * 0.86, width: 1.6 });
        }
        previous = next;
      }
    }

    if (afterAlpha > 0) {
      const radius = 34 + progress * (78 + intensity * 44);
      graphic.ellipse(at.x, at.y + 26, radius, radius * 0.23).stroke({ color: 0x9ee7ff, alpha: afterAlpha * 0.42, width: 5 })
        .ellipse(at.x, at.y + 24, radius * 0.58, radius * 0.14).stroke({ color: 0xffea72, alpha: afterAlpha * 0.72, width: 3 });
      const sparkCount = runtime.quality === 'cinematic' ? 9 : runtime.quality === 'standard' ? 6 : 4;
      for (let spark = 0; spark < sparkCount; spark++) {
        const angle = spark / sparkCount * Math.PI * 2 + spark * 0.37;
        const distance = 22 + progress * (70 + (spark % 3) * 18);
        const sx = at.x + Math.cos(angle) * distance;
        const sy = at.y + 16 + Math.sin(angle) * distance * 0.34 - progress * (12 + spark % 2 * 14);
        graphic.moveTo(at.x + Math.cos(angle) * 16, at.y + 16).lineTo(sx, sy).stroke({ color: spark % 2 ? 0xffffff : 0xffe76b, alpha: afterAlpha * 0.72, width: 2.5 + intensity });
      }
    }
  });
}

/** A source-to-target electrical connection. Each link redraws in discrete
 * phases and branches around its destination, so multi-target skills read as
 * electricity jumping between bodies rather than an area explosion. */
export function spawnChainLightning(runtime: BattleEffectPool, from: BattleStagePoint, targets: readonly BattleStagePoint[], intensity: number): void {
  const graphic = new Graphics({ blendMode: 'add' });
  const duration = 0.46;
  runtime.add(graphic, duration, (progress) => {
    const alpha = Math.sin(Math.PI * Math.min(1, progress * 1.16)) * (runtime.isReduceFlickerEnabled ? 0.66 : 0.96);
    const phase = Math.floor(progress * (runtime.isReduceFlickerEnabled ? 4 : 9));
    const points = [from, ...targets];
    graphic.clear();
    for (let link = 0; link < points.length - 1; link++) {
      const start = points[link]!;
      const end = points[link + 1]!;
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const px = -dy / length;
      const py = dx / length;
      const segments = 9;
      let previous = start;
      for (let segment = 1; segment <= segments; segment++) {
        const t = segment / segments;
        const taper = Math.sin(t * Math.PI);
        const noise = Math.sin(segment * 12.9898 + phase * 2.41 + link * 4.1) * 0.62
          + Math.sin(segment * 4.231 + phase * 5.17 + link * 1.3) * 0.38;
        const jitter = segment === segments ? 0 : noise * (20 + intensity * 14) * taper;
        const axial = segment === segments ? 0 : Math.sin(segment * 7.13 + phase * 1.71) * 4 * taper;
        const next = { x: start.x + dx * t + dx / length * axial + px * jitter, y: start.y + dy * t + dy / length * axial + py * jitter };
        graphic.moveTo(previous.x, previous.y).lineTo(next.x, next.y).stroke({ color: 0x65c7ff, alpha: alpha * 0.24, width: 21 + intensity * 8 })
          .moveTo(previous.x, previous.y).lineTo(next.x, next.y).stroke({ color: 0xffe56b, alpha, width: 7 + intensity * 3 })
          .moveTo(previous.x, previous.y).lineTo(next.x, next.y).stroke({ color: 0xffffff, alpha, width: 2.2 });
        if (segment === 3 || segment === 5 || segment === 7) {
          const side = segment % 2 ? -1 : 1;
          const branch = 24 + intensity * 17 + segment * 2;
          const bx = next.x + px * side * branch - dx / length * 8;
          const by = next.y + py * side * branch - dy / length * 8;
          graphic.moveTo(next.x, next.y).lineTo(next.x + px * side * branch * 0.42, next.y + py * side * branch * 0.42).lineTo(bx, by)
            .stroke({ color: 0x8edcff, alpha: alpha * 0.22, width: 8 })
            .moveTo(next.x, next.y).lineTo(next.x + px * side * branch * 0.42, next.y + py * side * branch * 0.42).lineTo(bx, by)
            .stroke({ color: 0xdffcff, alpha: alpha * 0.82, width: 2.4 });
        }
        previous = next;
      }
      graphic.circle(end.x, end.y, 18 + intensity * 8).stroke({ color: 0x8fddff, alpha: alpha * 0.54, width: 5 })
        .circle(end.x, end.y, 7 + intensity * 4).fill({ color: 0xffffff, alpha: alpha * 0.58 });
    }
  });
}
