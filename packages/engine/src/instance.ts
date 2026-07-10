import type { PokemonInstance, IV, StatusKind } from '@pokemon-online/shared';
import { GROWTH_MIN, GROWTH_MAX, IV_MAX, ACTIVE_SKILL_MAX, MAX_LEVEL } from '@pokemon-online/shared';
import { getSpecies, expForLevel, levelForExp, SKILL_MAP } from '@pokemon-online/config';
import { rand, type RNG, mulberry32 } from './rng.ts';
import { computeStats, maxHp } from './stats.ts';

export function genUid(): string {
  return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

export function rollIv(rng: RNG = Math.random): IV {
  return {
    hp: Math.floor(rng() * (IV_MAX + 1)),
    atk: Math.floor(rng() * (IV_MAX + 1)),
    def: Math.floor(rng() * (IV_MAX + 1)),
    spd: Math.floor(rng() * (IV_MAX + 1)),
  };
}

/** Growth ceiling by rarity - rarer species can grow stronger (受种族上限限制). */
function growthCeiling(rarity: string): number {
  switch (rarity) {
    case 'legendary':
    case 'mythical': return GROWTH_MAX;          // 1.2
    case 'rare': return 1.15;
    case 'uncommon': return 1.1;
    default: return 1.05;
  }
}

export function rollGrowth(rarity: string, rng: RNG = Math.random): number {
  const ceil = growthCeiling(rarity);
  return Math.round(rand.float(GROWTH_MIN, ceil) * 100) / 100;
}

/** Active skills a species has learned at or below `level` (up to ACTIVE_SKILL_MAX). */
export function activeSkillsForLevel(speciesId: number, level: number): string[] {
  const species = getSpecies(speciesId);
  const learned = species.learnset.filter((e) => e.level <= level).sort((a, b) => b.level - a.level);
  const skills: string[] = [];
  for (const e of learned) {
    if (skills.length >= ACTIVE_SKILL_MAX) break;
    if (!skills.includes(e.skill)) skills.push(e.skill);
  }
  if (skills.length === 0) skills.push('tackle');
  return skills;
}

/** Create a wild Pokemon instance (used for encounters; origin set on capture). */
export function createWildInstance(
  speciesId: number,
  level: number,
  opts: { mapId?: string; rng?: RNG } = {},
): PokemonInstance {
  const species = getSpecies(speciesId);
  const rng = opts.rng ?? Math.random;
  const iv = rollIv(rng);
  const growth = rollGrowth(species.rarity, rng);
  // personality random from all personalities
  const personalityIds = ['brave', 'timid', 'cunning', 'stubborn', 'cautious', 'reckless', 'wise', 'cool', 'naughty', 'relaxed'];
  const personality = personalityIds[Math.floor(rng() * personalityIds.length)];
  const ability = species.abilities[0] ?? 'keen-eye';
  const activeSkills = activeSkillsForLevel(speciesId, level);
  // 1-2 starting passives from the species pool
  const passiveSkills: string[] = [];
  if (species.passivePool.length) {
    passiveSkills.push(species.passivePool[Math.floor(rng() * species.passivePool.length)]);
    if (rng() < 0.3 && species.passivePool.length > 1) {
      let second = species.passivePool[Math.floor(rng() * species.passivePool.length)];
      if (second === passiveSkills[0]) second = species.passivePool[(species.passivePool.indexOf(second) + 1) % species.passivePool.length];
      if (!passiveSkills.includes(second)) passiveSkills.push(second);
    }
  }
  const inst: PokemonInstance = {
    uid: genUid(),
    speciesId,
    level,
    exp: expForLevel(species.growthRate, level),
    iv,
    growth,
    personality,
    ability,
    activeSkills,
    passiveSkills,
    currentHp: 0,
    status: null,
    friendship: 50,
    origin: 'gift',
    caughtAt: 0,
    caughtMapId: opts.mapId,
  };
  inst.currentHp = maxHp(inst);
  return inst;
}

/** Finalize a wild instance as a caught Pokemon. */
export function toCaught(inst: PokemonInstance, mapId?: string): PokemonInstance {
  return { ...inst, origin: 'caught', caughtAt: Date.now(), caughtMapId: mapId ?? inst.caughtMapId };
}

export interface LevelUpResult {
  leveledUp: boolean;
  fromLevel: number;
  toLevel: number;
  learnedSkills: string[];
  evolutionsAvailable: number[]; // species ids the instance can evolve into
}

/**
 * Apply EXP. Levels up repeatedly, auto-learning new moves (replacing the
 * weakest if the move set is full) and flagging available evolutions. The UI
 * decides whether to trigger evolution (e.g. Eevee branch choice).
 */
export function applyExp(instance: PokemonInstance, amount: number): LevelUpResult {
  const result: LevelUpResult = { leveledUp: false, fromLevel: instance.level, toLevel: instance.level, learnedSkills: [], evolutionsAvailable: [] };
  if (instance.level >= MAX_LEVEL) {
    instance.exp = expForLevel(getSpecies(instance.speciesId).growthRate, MAX_LEVEL);
    return result;
  }
  instance.exp += amount;
  const species = getSpecies(instance.speciesId);
  let newLevel = levelForExp(species.growthRate, instance.exp);
  if (newLevel > instance.level) {
    result.leveledUp = true;
    const hpRatio = instance.currentHp / Math.max(1, maxHp(instance));
    for (let lvl = instance.level + 1; lvl <= newLevel; lvl++) {
      // learn new skills at this level
      const newlyLearned = species.learnset.filter((e) => e.level === lvl);
      for (const entry of newlyLearned) {
        if (!instance.activeSkills.includes(entry.skill)) {
          if (instance.activeSkills.length < ACTIVE_SKILL_MAX) {
            instance.activeSkills.push(entry.skill);
            result.learnedSkills.push(entry.skill);
          } else {
            // replace weakest power skill (keep tackle as a fallback anchor only if all are weak)
            let weakestIdx = 0;
            let weakestPower = Infinity;
            instance.activeSkills.forEach((s, i) => {
              const p = SKILL_MAP[s]?.power ?? 0;
              if (p < weakestPower) { weakestPower = p; weakestIdx = i; }
            });
            instance.activeSkills[weakestIdx] = entry.skill;
            result.learnedSkills.push(entry.skill);
          }
        }
      }
    }
    instance.level = newLevel;
    result.toLevel = newLevel;
    // recompute HP keeping ratio
    const newMax = maxHp(instance);
    instance.currentHp = Math.max(1, Math.round(newMax * hpRatio));
    // friendship grows with leveling
    instance.friendship = Math.min(255, instance.friendship + 2);
    // check evolutions
    result.evolutionsAvailable = getAvailableEvolutions(instance);
  }
  return result;
}

export function getAvailableEvolutions(instance: PokemonInstance): number[] {
  const species = getSpecies(instance.speciesId);
  if (!species.evolution) return [];
  return species.evolution.filter((e) => e.level !== undefined && instance.level >= e.level).map((e) => e.to);
}

/** Evolve an instance into a new species (keeps level/iv/growth/personality). */
export function evolve(instance: PokemonInstance, toSpeciesId: number): void {
  const oldMax = maxHp(instance);
  const hpRatio = instance.currentHp / Math.max(1, oldMax);
  instance.speciesId = toSpeciesId;
  const newSpecies = getSpecies(toSpeciesId);
  // keep ability if still valid for new species, otherwise use new default
  if (!newSpecies.abilities.includes(instance.ability)) {
    instance.ability = newSpecies.abilities[0] ?? instance.ability;
  }
  // ensure active skills still valid; add new learnable up to cap
  const learnable = activeSkillsForLevel(toSpeciesId, instance.level);
  for (const s of learnable) {
    if (instance.activeSkills.length >= ACTIVE_SKILL_MAX) break;
    if (!instance.activeSkills.includes(s)) instance.activeSkills.push(s);
  }
  const newMax = maxHp(instance);
  instance.currentHp = Math.max(1, Math.round(newMax * hpRatio));
  instance.friendship = Math.min(255, instance.friendship + 5);
}

export function heal(instance: PokemonInstance, amount?: number): void {
  const m = maxHp(instance);
  if (amount === undefined) {
    instance.currentHp = m;
    instance.status = null;
  } else {
    instance.currentHp = Math.min(m, instance.currentHp + amount);
  }
}

export function revive(instance: PokemonInstance, ratio = 0.5): void {
  const m = maxHp(instance);
  instance.currentHp = Math.max(instance.currentHp, Math.round(m * ratio));
  instance.status = null;
}

export function cureStatus(instance: PokemonInstance, status?: StatusKind | 'all'): void {
  if (!status || status === 'all') instance.status = null;
  else if (instance.status === status) instance.status = null;
}

/** Snapshot current HP/status back into the persistent instance after battle. */
export function syncFromCombatant(instance: PokemonInstance, c: { currentHp: number; status: string | null }): void {
  instance.currentHp = Math.max(0, Math.round(c.currentHp));
  instance.status = (c.status as StatusKind | null) ?? null;
  if (instance.currentHp === 0) instance.status = null;
}

// re-export for convenience
export { computeStats, maxHp, mulberry32 };
