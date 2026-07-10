import type { BattleCombatant, BattleState, Skill } from '@pokemon-online/shared';
import { PERSONALITY_MAP, SKILL_MAP, NORMAL_ATTACK, getSpecies, typeMultiplier } from '@pokemon-online/config';
import type { RNG } from './rng.ts';
import { effectiveStat } from './stats.ts';

export interface AiPlan {
  targetUid: string;
  desiredRange: number;
  preferredSkillId: string | null; // null => use normal attack / reposition
}

function dist(a: BattleCombatant, b: BattleCombatant): number {
  return Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
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
      // risk tolerance: low risk hoards high-cd skills
      const cdPenalty = skill.cooldown * (1 - p.riskTolerance) * 8;
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

  // ── desired range ── align with the chosen action so movement supports it.
  // A Pokemon only kites to ranged distance if it actually has a ranged skill;
  // otherwise (e.g. a melee-only tank) it must close in to melee to attack.
  // Melee desiredRange is kept well under the normal-attack range (70) so the
  // combatant actually lands hits instead of stalling just out of range.
  const rangedSkills = c.activeSkills.map((id) => SKILL_MAP[id]).filter((s) => s?.range === 'ranged');
  const hasRangedSkill = rangedSkills.length > 0;
  const maxRangedRange = hasRangedSkill ? Math.max(...rangedSkills.map((s) => s!.rangeTiles)) : 0;
  let desiredRange: number;
  const enemyTargetSkill = preferredSkill && preferredSkill.power > 0
    ? preferredSkill
    : preferredSkill && preferredSkill.effect?.target === 'enemy' ? preferredSkill : null;
  if (enemyTargetSkill) {
    desiredRange = enemyTargetSkill.range === 'melee'
      ? Math.min(50, enemyTargetSkill.rangeTiles * 0.8)
      : Math.min(280, enemyTargetSkill.rangeTiles * 0.8);
  } else if ((lowHp || p.rangePreference === 'ranged') && hasRangedSkill) {
    desiredRange = Math.min(260, maxRangedRange * 0.8); // kite within longest ranged skill
  } else {
    desiredRange = 48; // close in for normal attack / melee skills
  }

  return { targetUid: target.uid, desiredRange, preferredSkillId };
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
  }
}

void getSpecies;
