import type { TypeName } from '@pokemon-online/shared';

export type ElementalVfxShape = 'flame' | 'lightning' | 'psychic-orbit' | 'water-wave' | 'ice-shard' | 'leaf' | 'generic';

/** Concrete silhouettes interpreted by the GPU VFX renderer. This maps only
 * element vocabulary to visual grammar; skills continue to choose delivery,
 * timing, anchors, and intensity through their existing recipes. */
export function elementalVfxShapeFor(element?: TypeName): ElementalVfxShape {
  if (element === 'fire') return 'flame';
  if (element === 'electric') return 'lightning';
  if (element === 'psychic') return 'psychic-orbit';
  if (element === 'water') return 'water-wave';
  if (element === 'ice') return 'ice-shard';
  if (element === 'grass' || element === 'bug') return 'leaf';
  return 'generic';
}
