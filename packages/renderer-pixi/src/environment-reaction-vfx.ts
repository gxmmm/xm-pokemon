import type { BattleEnvironmentSpec } from '@pokemon-online/config';
import { Graphics } from 'pixi.js';
import type { BattleEffectPool } from './BattleEffectPool.ts';
import type { BattleStagePoint } from './battle-stage-layout.ts';

type EnvironmentReaction = BattleEnvironmentSpec['reactions'][number];

const REACTION_COLORS: Readonly<Record<EnvironmentReaction, number>> = {
  scorch: 0xff8a4c,
  spark: 0xffea68,
  frost: 0xb7edff,
  splash: 0x72d9ff,
  spore: 0xb8ef80,
  debris: 0xc4a16d,
  'rune-pulse': 0xc093ff,
};

export function spawnEnvironmentReaction(runtime: BattleEffectPool, spec: BattleEnvironmentSpec, at: BattleStagePoint, reaction?: string): boolean {
  if (!reaction || !spec.reactions.includes(reaction as EnvironmentReaction)) return false;
  const resolvedReaction = reaction as EnvironmentReaction;
  const color = REACTION_COLORS[resolvedReaction];
  const graphic = new Graphics({ blendMode: 'add' });
  runtime.add(graphic, 0.54, (progress) => {
    graphic.clear();
    if (resolvedReaction === 'splash') graphic.circle(at.x, at.y + 16 - progress * 14, 12 + progress * 28).stroke({ color, alpha: (1 - progress) * 0.62, width: 3 });
    else if (resolvedReaction === 'debris') for (let index = 0; index < 5; index++) graphic.rect(at.x + (index - 2) * 10, at.y + 18 - progress * (18 + index % 2 * 12), 5, 5).fill({ color, alpha: (1 - progress) * 0.64 });
    else if (resolvedReaction === 'rune-pulse') graphic.star(at.x, at.y, 6, 16 + progress * 34, 8 + progress * 15).stroke({ color, alpha: (1 - progress) * 0.58, width: 2 });
    else graphic.ellipse(at.x, at.y + 24, 36 + progress * 18, 10 + progress * 4).fill({ color, alpha: (1 - progress) * 0.24 });
  }, 'ground');
  return true;
}
