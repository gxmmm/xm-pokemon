import type { TypeName } from '@pokemon-online/shared';
import { Graphics } from 'pixi.js';
import { BATTLE_EFFECT_COMPOSITION, type BattleEffectLayer } from '@pokemon-online/config';
import type { BattleEffectPool } from './BattleEffectPool.ts';
import type { BattleStagePoint } from './battle-stage-layout.ts';
import { elementalVfxShapeFor } from './elemental-vfx.ts';
import { drawElementMotes } from './natural-effect-shapes.ts';

/** Legacy ring cues keep their timing, but now draw local elemental details. */
export function spawnRing(runtime: BattleEffectPool, at: BattleStagePoint, color: number, intensity: number, variant = 'default', element?: TypeName, layer: BattleEffectLayer = 'front'): void {
  const graphic = new Graphics({ blendMode: 'normal' });
  graphic.position.set(at.x, at.y);
  if (layer === 'ground') graphic.scale.y = BATTLE_EFFECT_COMPOSITION.groundRingScaleY;
  const shape = elementalVfxShapeFor(element);
  const duration = variant === 'bind' || variant === 'snare' ? 0.64 : variant === 'dive' ? 0.80 : 0.48 + intensity * 0.16;
  runtime.add(graphic, duration, (progress) => {
    graphic.clear();
    drawElementMotes(graphic, shape, 0, 0, progress, color, variant === 'cross' ? 2 : 9,
      variant === 'cross' ? 12 : 24 + intensity * 22, variant === 'cross' ? 6 : 20);
    if (variant === 'bind' || variant === 'snare') {
      for (const side of [-1, 1]) graphic.moveTo(side * 26, 12).quadraticCurveTo(side * 8, -8, side * 23, -24)
        .stroke({ color, alpha: (1 - progress) * 0.7, width: 2.4 });
    }
  }, layer);
}
