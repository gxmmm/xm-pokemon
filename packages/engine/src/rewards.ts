import type { PokemonInstance } from '@pokemon-online/shared';
import { getSpecies } from '@pokemon-online/config';
import { PVP_TEAM_SIZE } from '@pokemon-online/shared';

/**
 * EXP reward for defeating a wild/opponent Pokemon. Classic-style formula
 * scaled to feel rewarding without being a grind. PVE gives full yield; PVP
 * spars give a smaller yield (PVP is for fun, not farming).
 */
export function defeatExpYield(defeated: PokemonInstance, mode: 'pve' | 'pvp'): number {
  const species = getSpecies(defeated.speciesId);
  const base = (species.expYield * defeated.level) / 7;
  const mult = mode === 'pvp' ? 0.4 : 1;
  return Math.max(1, Math.floor(base * mult));
}

/** Split EXP across the player's surviving party (all participants get some). */
export function distributeExp(party: PokemonInstance[], total: number): Map<string, number> {
  const map = new Map<string, number>();
  if (!party.length) return map;
  const per = Math.floor(total / party.length);
  let remainder = total - per * party.length;
  for (const p of party) {
    let amt = per;
    if (remainder > 0) { amt += 1; remainder--; }
    map.set(p.uid, amt);
  }
  return map;
}

void PVP_TEAM_SIZE;
