import type { Stats, StatKey, IV, PokemonInstance, BattleCombatant } from '@pokemon-online/shared';
import { HP_MULTIPLIER } from '@pokemon-online/shared';
import { getSpecies, PASSIVE_MAP, ABILITY_MAP } from '@pokemon-online/config';

/**
 * Stat calculation. Unified 4-stat system (HP/Atk/Def/Spd).
 *
 * Base stats establish the level-1 panel only; they are intentionally NOT
 * multiplied by level. Level growth is driven primarily by IV (资质), making
 * breeding quality matter more as a Pokemon is trained.
 *
 * Other      = (base * 0.10 + iv * level * 0.055 + 5) * growth * multipliers
 * HP         = (base * 0.15 + iv * level * 0.070 + level + 10) * growth * HP_MULTIPLIER * multipliers
 *
 * `growth` (0.8..1.2) is the per-instance 成长 multiplier, capped by species
 * rarity during breeding/catching. Passives and abilities apply multiplicative
 * bonuses; battle stat stages apply separately at combat time.
 */

const BASE_INITIAL_SHARE = 0.10;
const HP_BASE_INITIAL_SHARE = 0.15;
const IV_LEVEL_SCALE = 0.055;
const HP_IV_LEVEL_SCALE = 0.070;

/**
 * Persistent stat before passive/ability multipliers. Species base establishes
 * only the initial panel; increasing level adds IV-led growth instead of
 * re-scaling the base stat every level.
 */
export function baseStat(speciesId: number, iv: IV, growth: number, level: number, key: StatKey): number {
  const species = getSpecies(speciesId);
  const base = species.base[key];
  if (key === 'hp') {
    const v = base * HP_BASE_INITIAL_SHARE + iv.hp * level * HP_IV_LEVEL_SCALE + level + 10;
    // HP ×HP_MULTIPLIER (redesign): inflate HP so fights last longer. Passives/
    // abilities apply on top, so tank passives scale with the bigger pool too.
    return Math.max(1, Math.floor(v * growth * HP_MULTIPLIER));
  }
  const v = base * BASE_INITIAL_SHARE + iv[key] * level * IV_LEVEL_SCALE + 5;
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

/** Breakdown of how a stat is calculated, for display (hover tooltips). */
export interface StatBreakdown {
  key: StatKey;
  base: number;       // species base stat
  iv: number;         // aptitude (资质) for this stat
  level: number;
  growth: number;
  passiveMult: number;// aggregated passive stat multiplier (1 if none)
  abilityMult: number;// ability stat multiplier (1 if none applies)
  raw: number;        // after base+iv+level+growth, before passive/ability
  final: number;      // the value computeStats would produce
}

/** Per-stat calculation breakdown (mirrors computeStats, step by step). */
export function statBreakdown(instance: Pick<PokemonInstance, 'speciesId' | 'iv' | 'growth' | 'level' | 'passiveSkills' | 'ability'>, key: StatKey): StatBreakdown {
  const species = getSpecies(instance.speciesId);
  const base = species.base[key];
  const iv = instance.iv[key];
  const passiveMult = passiveStatMult(instance.passiveSkills, key);
  const raw = baseStat(instance.speciesId, instance.iv, instance.growth, instance.level, key);
  const afterPassive = Math.floor(raw * passiveMult);
  const ab = ABILITY_MAP[instance.ability];
  const abilityApplies = !!(ab?.effect.kind === 'statBoost' && ab.effect.stat === key && ab.effect.mult);
  const abilityMult = abilityApplies ? ab!.effect.mult! : 1;
  const final = abilityApplies ? Math.floor(afterPassive * abilityMult) : afterPassive;
  return { key, base, iv, level: instance.level, growth: instance.growth, passiveMult, abilityMult, raw, final };
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
