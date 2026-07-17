import type { BattleCue } from '@pokemon-online/renderer';
import type { TypeName } from '@pokemon-online/shared';
import type { SkillRecipeVariant } from '@pokemon-online/config';

export type BattleStagePrimitive = 'projectile' | 'dive' | 'impact' | 'beam' | 'burst' | 'ring' | 'environment';

export interface BattleStageVfxPlan {
  primitive: BattleStagePrimitive;
  element?: TypeName;
  intensity: number;
  actorId?: string;
  targetIds: readonly string[];
  reaction?: string;
  variant?: SkillRecipeVariant;
  particleBudget?: number;
}

/** Pure cue-to-primitive policy. The Pixi implementation only draws this plan;
 * it never reinterprets combat facts, computes outcomes, or reads a BattleSim. */
export function planBattleCue(cue: BattleCue): readonly BattleStageVfxPlan[] {
  if (cue.type === 'environment') {
    return [{ primitive: 'environment', intensity: 0.7, targetIds: [], reaction: cue.reaction }];
  }
  if (cue.type !== 'vfx') return [];

  const delivery = cue.recipe.delivery;
  const targetIds = cue.anchors.targetIds ?? [];
  const base: Omit<BattleStageVfxPlan, 'primitive'> = {
    element: cue.recipe.element,
    intensity: Math.max(0.15, Math.min(1, cue.intensity)),
    actorId: cue.anchors.actorId,
    targetIds,
    variant: cue.recipe.variant as SkillRecipeVariant | undefined,
    particleBudget: cue.recipe.particleBudget,
  };
  if (delivery === 'projectile') return [{ ...base, primitive: 'projectile' }];
  // A configured dive is a source-to-target fire/energy plunge, not a generic
  // rectangular melee flash at the target. The renderer still receives only a
  // recipe variant and generic anchors; it never sees a skill ID.
  if (delivery === 'melee' && base.variant === 'dive') return [{ ...base, primitive: 'dive' }];
  if (delivery === 'beam') return [{ ...base, primitive: 'beam' }];
  if (delivery === 'area') return [{ ...base, primitive: 'burst' }, { ...base, primitive: 'ring' }];
  if (cue.recipe.id.startsWith('impact:') || cue.recipe.id === 'faint') return [{ ...base, primitive: 'impact' }];
  if (delivery === 'melee') return [{ ...base, primitive: 'impact' }, { ...base, primitive: 'ring' }];
  return [{ ...base, primitive: 'ring' }];
}

export function elementColor(element?: TypeName): number {
  const colors: Partial<Record<TypeName, number>> = {
    fire: 0xff824e,
    grass: 0x86dc78,
    water: 0x69c8ff,
    electric: 0xffdf58,
    ice: 0xb7edff,
    rock: 0xc4a16d,
    ground: 0xca8b52,
    dragon: 0xae8dff,
    psychic: 0xfb8bd1,
    ghost: 0xa98ae7,
    poison: 0xc787e8,
    bug: 0xb5d45f,
    fighting: 0xee7e64,
    flying: 0x9ebcf6,
    dark: 0x7b7692,
    steel: 0xa7b5c6,
    fairy: 0xf5a8d0,
    normal: 0xe5e7eb,
  };
  return colors[element ?? 'normal'] ?? 0xe5e7eb;
}
