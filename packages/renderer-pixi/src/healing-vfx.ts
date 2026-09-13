import { PixelGraphics as Graphics } from './PixelGraphics.ts';
import type { BattleEffectPool } from './BattleEffectPool.ts';
import type { BattleStagePoint } from './battle-stage-layout.ts';
import { BATTLE_HEALING_VISUAL } from '@pokemon-online/config';

/** 回复碎光由真实治疗结果触发，保留角色轮廓。 */
export function spawnHealing(runtime: BattleEffectPool, target: BattleStagePoint, intensity: number): void {
  const spec = BATTLE_HEALING_VISUAL;
  const graphic = new Graphics();
  graphic.position.set(target.x, target.y);
  runtime.add(graphic, spec.durationMs / 1000, progress => {
    graphic.clear();
    const alpha = Math.min(1, progress / .12, (1 - progress) / .3);
    for (let i = 0; i < spec.count; i++) {
      const x = (i % 3 - 1) * spec.spread + (i % 2 ? 3 : -3);
      const y = 15 - Math.floor(i / 3) * 15 - progress * spec.rise;
      const size = 3 + (i % 2);
      graphic.rect(x - size - 1, y - 2, size * 2 + 4, 4).fill({ color: spec.outline, alpha });
      graphic.rect(x - 1, y - size - 1, 4, size * 2 + 4).fill({ color: spec.outline, alpha });
      graphic.rect(x - size, y - 1, size * 2 + 2, 2).fill({ color: spec.color, alpha: alpha * (.65 + intensity * .25) });
      graphic.rect(x, y - size, 2, size * 2 + 2).fill({ color: spec.color, alpha });
    }
  });
}
