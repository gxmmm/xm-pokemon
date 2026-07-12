import type { PokemonInstance, IV } from '@pokemon-online/shared';
import { PASSIVE_SKILL_MAX, GROWTH_MIN } from '@pokemon-online/shared';
import { getSpecies } from '@pokemon-online/config';
import { rand } from './rng.ts';
import { activeSkillsForLevel, genUid, maxHp, createWildInstance, growthCeiling } from './instance.ts';

/**
 * 炼妖 (Breeding) - 梦幻西游-style. Per frozen design:
 *  - Two parents produce ONE offspring; parents are consumed.
 *  - Offspring species is randomly the mother's or father's species (NO fusion).
 *  - IV (资质) = (parentA.iv + parentB.iv)/2 per stat * random(0.8..1.2), min 1,
 *    NOT capped. The species model has a rarity ceiling for wild/caught, but a
 *    bred offspring is uncapped - breeding is how stats climb past the ceiling.
 *  - Growth (成长) fluctuates around the parents' average (±small random),
 *    capped by the offspring species' rarity ceiling and the 1.3 hard cap.
 *  - Passive skills (梦幻式): offspring's intrinsic passives are retained 100%;
 *    the rest of the parents' union rolls at 主宠 65% / 副宠 35%, up to
 *    PASSIVE_SKILL_MAX (24) slots - breeding is how a pokemon accumulates a wide
 *    passive kit across generations (wild is pool-limited to ~5).
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
  info: string[];
}

/** Roll a bred offspring's IV: each stat = average of the parents' IVs for that
 *  stat, multiplied by a discrete multiplier picked from {0.8,0.9,1.0,1.1,1.2}
 *  (expected 80/90/100/110/120%), rounded, min 1, NOT capped by the species
 *  ceiling (or 31) - breeding is how a stat exceeds the ceiling.
 *  (No rarity floor here - per design the floor is wild-only; breeding uses the
 *  pure formula so stat quality depends on the parents you raise.) */
function rollBreedIv(a: IV, b: IV): IV {
  const out = { hp: 0, atk: 0, def: 0, spd: 0 } as IV;
  (Object.keys(out) as (keyof IV)[]).forEach((k) => {
    const avg = (a[k] + b[k]) / 2;
    out[k] = Math.max(1, Math.round(avg * rand.pick([0.8, 0.9, 1.0, 1.1, 1.2])));
  });
  return out;
}

/** Bred growth = parents' average × a discrete multiplier picked from
 *  {0.9,1.0,1.1} (expected 90/100/110%), clamped to the offspring species' rarity
 *  ceiling and the 1.3 hard cap. Can approach but never exceed. */
function rollBreedGrowth(parentA: PokemonInstance, parentB: PokemonInstance, ceiling: number): number {
  const base = (parentA.growth + parentB.growth) / 2;
  const g = base * rand.pick([0.9, 1.0, 1.1]);
  return Math.max(GROWTH_MIN, Math.min(ceiling, Math.round(g * 100) / 100));
}

export function breed(parentA: PokemonInstance, parentB: PokemonInstance): BreedResult {
  const info: string[] = [];
  // 1. species: 主宠 65% / 副宠 35% (no fusion). parentA is the 主宠 (main).
  const useA = rand.chance(0.65);
  const speciesId = useA ? parentA.speciesId : parentB.speciesId;
  const species = getSpecies(speciesId);
  info.push(`后代种族：${species.name}（${useA ? '主宠' : '副宠'}血脉）`);

  // 2. level - bred offspring start young; training is the long-term goal
  const level = 5;

  // 3. IV inherited from parents' average +/- fluctuation (pure formula, NOT capped)
  const iv = rollBreedIv(parentA.iv, parentB.iv);

  // 4. growth fluctuates around the parents' average, capped by species ceiling
  const growth = rollBreedGrowth(parentA, parentB, growthCeiling(species.rarity));

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

  // 8. passive skills: offspring's intrinsic passives are retained 100% (天生必带);
  //    the rest of the parents' union rolls at 主宠 65% / 副宠 35%.
  const intrinsicSet = new Set(species.intrinsicPassives ?? []);
  const aSet = new Set(parentA.passiveSkills);
  const parentPassives = [...new Set([...parentA.passiveSkills, ...parentB.passiveSkills])];
  const passiveSkills: string[] = [...species.intrinsicPassives];
  for (const p of rand.shuffle(parentPassives)) {
    if (passiveSkills.length >= PASSIVE_SKILL_MAX) break;
    if (intrinsicSet.has(p)) continue; // already added as intrinsic (100%)
    if (rand.chance(aSet.has(p) ? 0.65 : 0.35)) passiveSkills.push(p);
  }
  // ensure at least one passive if any source exists
  if (passiveSkills.length === 0 && parentPassives.length) passiveSkills.push(rand.pick(parentPassives));

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
