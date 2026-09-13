import type { BattleCombatant, Skill } from '@pokemon-online/shared';
import { ABILITY_MAP, typeMultiplier, BATTLE_DECISION as D } from '@pokemon-online/config';
import { controlRemaining } from './cooperation.ts';
import { distCells } from './grid.ts';
import { skillCovers } from './skill-space.ts';

/** 只观察已开始的这一格移动，不读取对方计划，也不预测下一步或随机避让。 */
export function releaseReliability(caster: BattleCombatant, target: BattleCombatant, victim: BattleCombatant, skill: Skill, _now: number, risk: number): number {
  const wait = Math.min(D.motionHorizon, skill.castTime ?? 0);
  if (wait <= 0 || distCells(victim.pixel, victim.position) < .05) return 1;
  // 控制阻止下一步，但引擎仍完成已经开始的脚点缓动。
  const k = 1 - Math.exp(-wait * 9);
  const point = { x: victim.pixel.x + (victim.position.x - victim.pixel.x) * k, y: victim.pixel.y + (victim.position.y - victim.pixel.y) * k };
  return skillCovers(skill, caster.pixel, target.pixel, point) ? 1 : D.movingCoverageFloor + risk * D.riskCoverageAllowance;
}

export function usefulDamage(damage: number, hp: number): number {
  return Math.min(damage, hp) + Math.max(0, damage - hp) * D.overkillValue;
}

export function interruptChance(skill: Skill): number {
  return Math.min(1, Math.max(0, skill.effect?.chance ?? 1)) * (skill.accuracy === 0 ? 1 : skill.accuracy / 100);
}

/** 已站稳、动作可衔接，且本招实际前摇赶得上，才算一次打断机会。 */
export function canInterruptCast(caster: BattleCombatant, target: BattleCombatant, skill: Skill, now: number): boolean {
  const effect = skill.effect;
  if (!effect || (effect.kind !== 'stun' && !(effect.kind === 'status' && (effect.status === 'sleep' || effect.status === 'freeze')))) return false;
  if (effect.chance === 0 || effect.kind === 'status' && target.status) return false;
  const ability = ABILITY_MAP[target.ability]?.effect;
  if (effect.kind === 'stun' && ability?.kind === 'flinchImmunity') return false;
  if (skill.power > 0 && (typeMultiplier(skill.type, target.types) === 0 || ability?.kind === 'typeImmunity' && ability.type === skill.type)) return false;
  const remaining = target.castProgress?.remaining ?? 0;
  const wait = Math.max(0, caster.actionReadyRemaining ?? 0, caster.actionLockRemaining ?? 0, caster.cooldowns[skill.id] ?? 0) + (skill.castTime ?? 0);
  return remaining > wait + D.interruptMargin && controlRemaining(caster, now) <= 0
    && distCells(caster.pixel, caster.position) <= .05
    && skillCovers(skill, caster.pixel, target.pixel, target.pixel);
}
