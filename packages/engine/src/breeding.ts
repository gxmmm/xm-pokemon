import type { PokemonInstance } from '@pokemon-online/shared';
import { PASSIVE_SKILL_MAX } from '@pokemon-online/shared';
import { getSpecies } from '@pokemon-online/config';
import { rand } from './rng.ts';
import { rollIv, rollGrowth, activeSkillsForLevel, genUid, maxHp, createWildInstance } from './instance.ts';

/**
 * 炼妖 (Breeding) - 梦幻西游-style. Per frozen design:
 *  - Two parents produce ONE offspring; parents are consumed.
 *  - Offspring species is randomly the mother's or father's species (NO fusion).
 *  - IV (资质) and growth (成长) are re-rolled, capped by the offspring species.
 *  - Passive skills are randomly inherited, with a 梦幻式 multi-skill cap and a
 *    small chance to gain a new passive from the offspring's pool.
 *  - Active skills come from the offspring species' learnset.
 *  - Ability is inherited from a parent, with a very low chance to mutate into
 *    another of the offspring species' abilities.
 *  - Personality replaces 梦幻's five-element; inherited from a random parent.
 *
 * Lineage (家谱) is recorded so each instance retains its growth history.
 */

export interface BreedResult {
  offspring: PokemonInstance;
  consumedUids: [string, string];
  speciesId: number;
  mutatedAbility: boolean;
  newPassive?: string;
  info: string[];
}

export function breed(parentA: PokemonInstance, parentB: PokemonInstance): BreedResult {
  const info: string[] = [];
  // 1. species: random parent species (no fusion)
  const useA = rand.chance(0.5);
  const speciesId = useA ? parentA.speciesId : parentB.speciesId;
  const species = getSpecies(speciesId);
  info.push(`后代种族：${species.name}`);

  // 2. level - bred offspring start young; training is the long-term goal
  const level = 5;

  // 3. IV re-rolled (capped by IV_MAX inherently)
  const iv = rollIv();

  // 4. growth re-rolled within species rarity ceiling
  const growth = rollGrowth(species.rarity);

  // 5. personality inherited from a random parent
  const personality = rand.chance(0.5) ? parentA.personality : parentB.personality;

  // 6. ability inherited from a parent, ~2% mutation chance
  let ability = rand.chance(0.5) ? parentA.ability : parentB.ability;
  let mutatedAbility = false;
  if (species.abilities.length > 1 && rand.chance(0.02)) {
    const pool = species.abilities.filter((a) => a !== ability);
    if (pool.length) {
      ability = rand.pick(pool);
      mutatedAbility = true;
      info.push(`✨ 特性变异为：${ability}`);
    }
  }
  // ensure ability valid for offspring species
  if (!species.abilities.includes(ability)) {
    ability = species.abilities[0] ?? ability;
  }

  // 7. active skills from offspring species learnset
  const activeSkills = activeSkillsForLevel(speciesId, level);

  // 8. passive skills: random inheritance + small chance of a new one
  const parentPassives = [...new Set([...parentA.passiveSkills, ...parentB.passiveSkills])];
  const passiveSkills: string[] = [];
  for (const p of rand.shuffle(parentPassives)) {
    if (passiveSkills.length >= PASSIVE_SKILL_MAX) break;
    if (rand.chance(0.45)) passiveSkills.push(p);
  }
  // ensure at least one passive if any source exists
  if (passiveSkills.length === 0 && parentPassives.length) passiveSkills.push(rand.pick(parentPassives));
  let newPassive: string | undefined;
  if (passiveSkills.length < PASSIVE_SKILL_MAX && species.passivePool.length && rand.chance(0.15)) {
    const candidates = species.passivePool.filter((p) => !passiveSkills.includes(p));
    if (candidates.length) {
      newPassive = rand.pick(candidates);
      passiveSkills.push(newPassive);
      info.push(`✨ 领悟新被动：${newPassive}`);
    }
  }

  const offspring: PokemonInstance = {
    uid: genUid(),
    speciesId,
    level,
    exp: 0,
    iv,
    growth,
    personality,
    ability,
    activeSkills,
    passiveSkills,
    currentHp: 0,
    status: null,
    friendship: 70,
    origin: 'bred',
    lineage: {
      parentA: parentA.uid,
      parentB: parentB.uid,
      speciesA: parentA.speciesId,
      speciesB: parentB.speciesId,
      at: Date.now(),
    },
    caughtAt: Date.now(),
  };
  offspring.currentHp = maxHp(offspring);
  info.unshift(`两只宝可梦炼妖成功！`);

  return {
    offspring,
    consumedUids: [parentA.uid, parentB.uid],
    speciesId,
    mutatedAbility,
    newPassive,
    info,
  };
}

/**
 * Generate a starter Pokemon instance for a new player. Quality slightly above
 * average so the first companion feels good without being overpowered.
 */
export function createStarter(speciesId: number): PokemonInstance {
  const inst = createWildInstance(speciesId, 5);
  inst.origin = 'gift';
  inst.friendship = 80;
  // slightly better IVs for a starter
  inst.iv = { hp: 20, atk: 20, def: 20, spd: 20 };
  inst.currentHp = maxHp(inst);
  return inst;
}
