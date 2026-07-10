import type { Stats, StatKey, IV, PokemonInstance, BattleCombatant } from '@pokemon-online/shared';
import { getSpecies, PASSIVE_MAP, ABILITY_MAP } from '@pokemon-online/config';

/**
 * Stat calculation. Unified 4-stat system (HP/Atk/Def/Spd).
 *
 * Final stat = ((2*base + iv) * level / 100 + 5) * growth * passiveMult * abilityMult
 * HP          = ((2*base + iv) * level / 100 + level + 10) * growth * mults
 *
 * `growth` (0.8..1.2) is the per-instance 成长 multiplier, capped by species
 * rarity during breeding/catching. Passives and abilities apply multiplicative
 * bonuses; battle stat stages apply separately at combat time.
 */

export function baseStat(speciesId: number, iv: IV, growth: number, level: number, key: StatKey): number {
  const species = getSpecies(speciesId);
  const base = species.base[key];
  if (key === 'hp') {
    const v = Math.floor(((2 * base + iv.hp) * level) / 100) + level + 10;
    return Math.max(1, Math.floor(v * growth));
  }
  const v = Math.floor(((2 * base + iv[key]) * level) / 100) + 5;
  return Math.max(1, Math.floor(v * growth));
}

/** Passive multipliers aggregated for a stat (and type boosts handled in damage). */
function passiveStatMult(passives: string[], key: StatKey): number {
  let mult = 1;
  for (const id of passives) {
    const p = PASSIVE_MAP[id];
    if (!p) continue;
    const e = p.effect;
    if (e.kind === 'stat' && e.stat === key && e.mult) mult *= e.mult;
  }
  return mult;
}

/** Compute the full persistent stats for an instance (no battle stages). */
export function computeStats(instance: Pick<PokemonInstance, 'speciesId' | 'iv' | 'growth' | 'level' | 'passiveSkills' | 'ability'>): Stats {
  const keys: StatKey[] = ['hp', 'atk', 'def', 'spd'];
  const out = { hp: 0, atk: 0, def: 0, spd: 0 } as Stats;
  for (const k of keys) {
    let v = baseStat(instance.speciesId, instance.iv, instance.growth, instance.level, k);
    v = Math.floor(v * passiveStatMult(instance.passiveSkills, k));
    out[k] = v;
  }
  // ability stat mults (huge-power, guts w/ status, marvel-scale w/ status handled in battle)
  const ab = ABILITY_MAP[instance.ability];
  if (ab?.effect.kind === 'statBoost' && ab.effect.stat && ab.effect.mult) {
    if (out[ab.effect.stat]) out[ab.effect.stat] = Math.floor(out[ab.effect.stat]! * ab.effect.mult);
  }
  return out;
}

export function maxHp(instance: Pick<PokemonInstance, 'speciesId' | 'iv' | 'growth' | 'level' | 'passiveSkills' | 'ability'>): number {
  return computeStats(instance).hp;
}

/** Battle stat-stage multiplier: stage -6..6 -> 0.25..4 (gen-style: 2/2..). */
export function stageMult(stage: number): number {
  if (stage >= 0) return (2 + stage) / 2;
  return 2 / (2 - stage);
}

/** Effective in-battle stat for a combatant (applies stages + status + ability). */
export function effectiveStat(c: BattleCombatant, key: StatKey): number {
  let v = c.stats[key];
  if (key !== 'hp') {
    const stage = c.statStages[key as 'atk' | 'def' | 'spd'] ?? 0;
    v = Math.floor(v * stageMult(stage));
  }
  // status effects
  if (c.status === 'burn' && key === 'atk') v = Math.floor(v * 0.5);
  if (c.status === 'paralyze' && key === 'spd') v = Math.floor(v * 0.5);
  // ability: guts (atk up when statused), marvel-scale (def up when statused)
  const ab = ABILITY_MAP[c.ability];
  if (ab && c.status) {
    if (ab.effect.kind === 'statBoost' && ab.effect.stat === key && ab.effect.mult) {
      if (c.ability === 'guts' && key === 'atk') v = Math.floor(v * ab.effect.mult);
      if (c.ability === 'marvel-scale' && key === 'def') v = Math.floor(v * ab.effect.mult);
    }
  }
  return v;
}
