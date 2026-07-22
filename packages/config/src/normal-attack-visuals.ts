import type { NormalAttackDelivery, NormalAttackVisualStyle, TypeName } from '@pokemon-online/shared';
import { SPECIES_LIST } from './pokemon.ts';

export type { NormalAttackVisualStyle } from '@pokemon-online/shared';

export interface NormalAttackVisualProfile {
  style: NormalAttackVisualStyle;
  /** Visual tint carried by the event; it never alters normal-attack gameplay. */
  element: TypeName;
}

const STYLE_BY_SPECIES_ID: Readonly<Partial<Record<number, NormalAttackVisualStyle>>> = {
  // Hand-led humanoids.
  56: 'fist', 57: 'fist', 62: 'fist', 66: 'fist', 67: 'fist', 68: 'fist', 106: 'kick', 107: 'fist',
  // Clawed predators, arthropods, and dragons.
  5: 'claw', 6: 'claw', 15: 'pincer-snap', 28: 'claw', 47: 'pincer-snap', 53: 'claw', 99: 'pincer-snap', 123: 'pincer-snap', 127: 'pincer-snap', 141: 'claw', 149: 'claw',
  // Distinct physical silhouettes.
  12: 'wing-slap', 16: 'beak-peck', 17: 'beak-peck', 18: 'wing-slap', 20: 'bite', 21: 'beak-peck', 22: 'wing-slap', 24: 'bite', 34: 'horn', 76: 'body-slam', 95: 'tail', 112: 'horn', 119: 'horn', 128: 'body-slam', 130: 'bite', 131: 'shell-bash', 143: 'body-slam',
  // Tendrils, vines, and long flexible appendages.
  69: 'whip-lash', 70: 'whip-lash', 71: 'whip-lash', 72: 'whip-lash', 73: 'whip-lash', 114: 'whip-lash',
};

const PROJECTILE_STYLE_BY_TYPE: Readonly<Record<TypeName, NormalAttackVisualStyle>> = {
  normal: 'neutral-star', fire: 'flame-bolt', water: 'water-shot', grass: 'leaf-shot', electric: 'spark-bolt', ice: 'ice-shard',
  fighting: 'neutral-star', poison: 'shadow-orb', ground: 'stone-shot', flying: 'wind-cutter', psychic: 'psychic-bolt', bug: 'leaf-shot',
  rock: 'stone-shot', ghost: 'shadow-orb', dragon: 'wind-cutter', dark: 'shadow-orb', steel: 'stone-shot', fairy: 'fairy-spark',
};

function primaryTypeFor(speciesId: number): TypeName {
  return SPECIES_LIST.find((species) => species.id === speciesId)?.types[0] ?? 'normal';
}

/** Pure config resolver for model-owned basic-attack presentation. The delivery
 * remains an engine fact; this resolver selects only a serializable motif and
 * tint for renderer-neutral DTO propagation. */
export function normalAttackVisualProfileFor(speciesId: number, delivery: NormalAttackDelivery): NormalAttackVisualProfile {
  const element = primaryTypeFor(speciesId);
  if (delivery === 'ranged') return { style: PROJECTILE_STYLE_BY_TYPE[element], element };
  return { style: STYLE_BY_SPECIES_ID[speciesId] ?? 'claw', element };
}

/** Compatibility resolver for existing callers that only require the motif. */
export function normalAttackVisualStyleFor(speciesId: number, delivery: NormalAttackDelivery): NormalAttackVisualStyle {
  return normalAttackVisualProfileFor(speciesId, delivery).style;
}
