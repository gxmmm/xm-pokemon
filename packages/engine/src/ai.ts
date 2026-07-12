import type { BattleCombatant, BattleState, Skill } from '@pokemon-online/shared';
import { PERSONALITY_MAP, SKILL_MAP, NORMAL_ATTACK, getSpecies, typeMultiplier } from '@pokemon-online/config';
import type { RNG } from './rng.ts';
import { effectiveStat } from './stats.ts';
import { rangeInCells, distCells, MELEE_DESIRED_CELLS } from './grid.ts';

export interface AiPlan {
  targetUid: string;
  /** Desired engagement distance in grid-cell units. */
  desiredRangeCells: number;
  preferredSkillId: string | null; // null => use normal attack / reposition
}

function dist(a: BattleCombatant, b: BattleCombatant): number {
  return distCells(a.position, b.position);
}

/** Deterministic expected damage (no crit/random) for AI scoring. */
function expectedDamage(attacker: BattleCombatant, defender: BattleCombatant, skill: Skill): number {
  const t = skill.type;
  let eff = typeMultiplier(t, defender.types);
  if (eff === 0) return 0;
  if (defender.ability === 'thick-fat' && (t === 'fire' || t === 'ice')) eff *= 0.5;
  // immunity abilities -> 0
  const dab = defender.ability;
  if ((dab === 'water-absorb' && t === 'water') || (dab === 'volt-absorb' && t === 'electric') ||
      (dab === 'flash-fire' && t === 'fire') || (dab === 'levitate' && t === 'ground') ||
      (dab === 'lightning-rod' && t === 'electric')) return 0;
  const levelFactor = Math.floor((2 * attacker.level) / 5) + 2;
  const atk = effectiveStat(attacker, 'atk');
  const def = Math.max(1, effectiveStat(defender, 'def'));
  let dmg = (levelFactor * skill.power * atk) / def / 50 + 2;
  if (attacker.types?.includes(t)) dmg *= 1.5;
  return dmg * eff;
}

function isUtility(skill: Skill): boolean {
  return skill.category === 'status' || skill.power === 0;
}

/**
 * Decide a combatant's plan: target, desired engagement range, and preferred
 * skill. Driven by personality (aggression, range preference, risk tolerance,
 * target priority, skill bias, defensive threshold) - NOT by raw stats, so the
 * same species can fight very differently.
 */
export function decide(c: BattleCombatant, state: BattleState, rng: RNG): AiPlan | null {
  const enemies = state.combatants.filter((x) => x.side !== c.side && x.alive);
  if (enemies.length === 0) return null;
  const p = PERSONALITY_MAP[c.personality] ?? PERSONALITY_MAP['cool']!;

  // ── target selection ──
  let target = enemies[0]!;
  const cur = c.currentTargetUid ? state.combatants.find((x) => x.uid === c.currentTargetUid && x.alive) : null;
  if (p.targetPriority === 'random') {
    target = enemies[Math.floor(rng() * enemies.length)]!;
  } else if (p.targetPriority === 'nearest') {
    target = enemies.reduce((best, e) => (dist(c, e) < dist(c, best) ? e : best));
  } else if (p.targetPriority === 'weakest') {
    target = enemies.reduce((best, e) => (e.currentHp / e.maxHp < best.currentHp / best.maxHp ? e : best));
  } else if (p.targetPriority === 'threat') {
    target = enemies.reduce((best, e) => (effectiveStat(e, 'atk') * (e.currentHp / e.maxHp) > effectiveStat(best, 'atk') * (best.currentHp / best.maxHp) ? e : best));
  }
  // stubborn: stick with current target if alive
  if (c.currentTargetUid && cur && p.targetPriority === 'threat') target = cur;

  const lowHp = c.currentHp / c.maxHp < p.defensiveThreshold;

  // ── skill scoring ──
  const candidates: { skill: Skill; score: number }[] = [];
  const offCd = c.activeSkills.filter((id) => (c.cooldowns[id] ?? 0) <= 0).map((id) => SKILL_MAP[id]).filter(Boolean);

  for (const skill of offCd) {
    let score: number;
    if (isUtility(skill)) {
      score = 30; // baseline utility
      const e = skill.effect;
      if (e?.kind === 'heal' && e.target === 'self') {
        score = lowHp ? 120 * (1 - c.currentHp / c.maxHp) : 10;
      } else if (e?.kind === 'shield' && e.target === 'self') {
        score = lowHp ? 70 : 15;
      } else if (e?.kind === 'buff' && e.target === 'self') {
        const alreadyBuffed = c.statStages[e.stat as 'atk' | 'def' | 'spd'] >= 2;
        score = alreadyBuffed ? 5 : 45;
      } else if (e?.kind === 'status' && e.target === 'enemy') {
        // debuffing the enemy: more valuable if target healthy & AI utility-biased
        score = target.status ? 5 : 50;
      } else if (e?.kind === 'debuff' && e.target === 'enemy') {
        score = 40;
      } else if (e?.kind === 'dot' && e.target === 'enemy') {
        score = target.status ? 10 : 55;
      } else {
        score = 25;
      }
      // utility bias boosts non-damage moves
      if (p.skillBias === 'utility') score *= 1.6;
      else if (p.skillBias === 'power') score *= 0.5;
    } else {
      const ed = expectedDamage(c, target, skill);
      score = ed;
      // skill bias
      if (p.skillBias === 'power') score *= 1.3;
      else if (p.skillBias === 'speed') score *= skill.cooldown <= 2 ? 1.3 : 0.8;
      else if (p.skillBias === 'utility') score *= 0.85;
      // risk tolerance: low risk slightly hoards high-cd skills (prefers cheaper
      // moves / normal attack) but the factor is small enough that a ready skill
      // still beats the normal attack -- otherwise cautious personalities would
      // never cast and fights degrade to normal-attack-only.
      const cdPenalty = skill.cooldown * (1 - p.riskTolerance) * 2;
      score -= cdPenalty;
      // aggression boosts damage scoring vs alternatives
      score *= 0.5 + p.aggression * 0.7;
    }
    candidates.push({ skill, score });
  }

  // normal attack baseline
  const normalScore = expectedDamage(c, target, NORMAL_ATTACK) * (0.5 + p.aggression * 0.7);

  let preferredSkillId: string | null = null;
  let preferredSkill: Skill | null = null;
  let bestScore = normalScore;
  for (const cand of candidates) {
    if (cand.score > bestScore) {
      bestScore = cand.score;
      preferredSkillId = cand.skill.id;
      preferredSkill = cand.skill;
    }
  }

  // ── desired range (in grid cells) ── align with the chosen action so movement
  // supports it. A Pokemon only kites to ranged distance if it actually has a
  // ranged skill; otherwise (e.g. a melee-only tank) it must close in to melee.
  // Melee desiredRange is kept at 1.0 cell so the stop band (1.0 + MOVE_BUFFER =
  // 1.5) exactly equals the melee attack reach (1.5) - the fighter always lands
  // hits instead of stalling just out of range (grid version of the old bug).
  const rangedSkills = c.activeSkills.map((id) => SKILL_MAP[id]).filter((s) => s?.range === 'ranged');
  const hasRangedSkill = rangedSkills.length > 0;
  const maxRangedRangeCells = hasRangedSkill ? Math.max(...rangedSkills.map((s) => rangeInCells(s!))) : 0;
  let desiredRangeCells: number;
  const enemyTargetSkill = preferredSkill && preferredSkill.power > 0
    ? preferredSkill
    : preferredSkill && preferredSkill.effect?.target === 'enemy' ? preferredSkill : null;
  if (enemyTargetSkill) {
    desiredRangeCells = enemyTargetSkill.range === 'melee'
      ? MELEE_DESIRED_CELLS
      : Math.min(maxRangedRangeCells, rangeInCells(enemyTargetSkill) * 0.7);
  } else if ((lowHp || p.rangePreference === 'ranged') && hasRangedSkill) {
    desiredRangeCells = Math.min(maxRangedRangeCells * 0.7, maxRangedRangeCells); // kite within longest ranged skill
  } else {
    desiredRangeCells = MELEE_DESIRED_CELLS; // close in for normal attack / melee skills
  }

  // ── advantaged press (breaks infinite kiting) ──
  // A kiter that is clearly winning must stop running and CLOSE IN, otherwise a
  // disadvantaged melee chases forever and a symmetric ranged pair orbits at max
  // range forever. The disadvantaged side keeps kiting (runs); the advantaged
  // side approaches, so the fight resolves. Target low -> commit to melee to
  // finish; big HP lead (but target still healthy) -> press to ~half range so
  // the kiter engages closer without suicidally diving a healthy melee.
  const targetHpRatio = target.currentHp / target.maxHp;
  const myHpRatio = c.currentHp / c.maxHp;
  const pressing = targetHpRatio < 0.4 || (myHpRatio - targetHpRatio) > 0.2 || (p.aggression > 0.7 && myHpRatio > targetHpRatio + 0.05);
  if (pressing && hasRangedSkill && desiredRangeCells >= 3) {
    desiredRangeCells = targetHpRatio < 0.4 ? MELEE_DESIRED_CELLS : Math.max(MELEE_DESIRED_CELLS, Math.round(maxRangedRangeCells * 0.5));
  }

  return { targetUid: target.uid, desiredRangeCells, preferredSkillId };
}

// extend combatant type usage at runtime (currentTargetUid stored on the object)
declare module '@pokemon-online/shared' {
  interface BattleCombatant {
    currentTargetUid?: string;
    nextDecisionAt?: number;
    flashFireBoost?: boolean;
    speedBoostTimer?: number;
    plan?: AiPlan | null;
    dotAccumulator?: number;
    flinchUntil?: number;
    /** Grid-step movement cooldown (seconds until next cell step). */
    moveCd?: number;
    /** Strafe direction (+1/-1) and step counter for circling behavior. */
    strafeDir?: number;
    strafeCount?: number;
    /** Normal-attack reach in cells (ranged-type pokemon attack from range). */
    normalRangeCells?: number;
    /** Whether this combatant's normal attack is ranged (no contact). */
    normalIsRanged?: boolean;
  }
}

void getSpecies;
