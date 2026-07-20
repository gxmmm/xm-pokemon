import type { NormalAttackDelivery, NormalAttackVisualStyle } from '@pokemon-online/shared';
import { SPECIES_LIST } from './pokemon.ts';

export type { NormalAttackVisualStyle } from '@pokemon-online/shared';

const STYLE_BY_SPECIES_ID: Readonly<Partial<Record<number, NormalAttackVisualStyle>>> = {
  // Fighters / hand-led humanoids.
  56: 'fist', 57: 'fist', 62: 'fist', 66: 'fist', 67: 'fist', 68: 'fist', 106: 'fist', 107: 'fist',
  // Clawed predators, arthropods, and dragons.
  5: 'claw', 6: 'claw', 15: 'claw', 28: 'claw', 47: 'claw', 53: 'claw', 99: 'claw', 123: 'claw', 127: 'claw', 141: 'claw', 149: 'claw',
  // Distinct physical silhouettes that should not read as a generic punch.
  20: 'bite', 24: 'bite', 34: 'horn', 76: 'body-slam', 95: 'tail', 112: 'horn', 119: 'horn', 128: 'body-slam', 130: 'bite', 143: 'body-slam',
};

const PSYCHIC_SPECIES_IDS = new Set(
  SPECIES_LIST.filter((species) => species.types.includes('psychic')).map((species) => species.id),
);

/** Ranged normal attacks are non-contact. Psychic models receive a distinct
 * psychic bolt; other ranged models use the element-tinted generic bolt.
 * Contact styles are explicitly curated where silhouette matters and otherwise
 * use a stable claw-like strike so every species remains readable. */
export function normalAttackVisualStyleFor(speciesId: number, delivery: NormalAttackDelivery): NormalAttackVisualStyle {
  if (delivery === 'ranged') return PSYCHIC_SPECIES_IDS.has(speciesId) ? 'psychic-bolt' : 'elemental-bolt';
  return STYLE_BY_SPECIES_ID[speciesId] ?? 'claw';
}
