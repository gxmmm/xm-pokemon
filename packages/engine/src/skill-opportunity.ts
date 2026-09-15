import type { BattleCombatant, BattleState, Skill } from '@pokemon-online/shared';
import { ABILITY_MAP, typeMultiplier, BATTLE_DECISION as D } from '@pokemon-online/config';
import { controlRemaining } from './cooperation.ts';
import { distCells } from './grid.ts';
import { skillCovers, skillVictims } from './skill-space.ts';
import { SKILL_MAP } from '@pokemon-online/config';
import { skillHitChance, secondaryEffectChance } from './combat-modifiers.ts';

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

export function interruptChance(skill: Skill, caster: BattleCombatant, target: BattleCombatant): number {
  const effect = skill.effect;
  if (!effect || (effect.kind !== 'stun' && !(effect.kind === 'status' && ['sleep', 'freeze'].includes(effect.status ?? '')))) return 0;
  const ability = ABILITY_MAP[target.ability]?.effect;
  if (effect.kind === 'stun' && ability?.kind === 'flinchImmunity' || effect.kind === 'status' && target.status) return 0;
  if (skill.power > 0 && (typeMultiplier(skill.type, target.types) === 0 || ability?.kind === 'typeImmunity' && ability.type === skill.type)) return 0;
  return skillHitChance(caster, target, skill) * (skill.power > 0 ? secondaryEffectChance(caster, skill) : 1);
}

/** 仅认可队友正在释放、覆盖有效且成功率足够的控制；中断后自然失效。 */
export function incomingControl(caster: BattleCombatant, target: BattleCombatant, state: BattleState): number {
  return state.combatants.reduce((remaining, ally) => {
    if (!ally.alive || ally.uid === caster.uid || ally.side !== caster.side || !ally.castProgress || controlRemaining(ally, state.time) > 0) return remaining;
    const skill = SKILL_MAP[ally.castProgress.skillId];
    if (!skill || interruptChance(skill, ally, target) < D.controlReservationChance) return remaining;
    if (target.castProgress && ally.castProgress.remaining + D.interruptMargin >= target.castProgress.remaining) return remaining;
    const primary = state.combatants.find(unit => unit.uid === ally.currentTargetUid);
    if (!skillVictims(skill, ally, primary, [target], ally.castAim).length) return remaining;
    return Math.max(remaining, ally.castProgress.remaining + (skill.effect?.duration ?? 2));
  }, 0);
}

/** 已站稳、动作可衔接，且本招实际前摇赶得上，才算一次打断机会。 */
export function canInterruptCast(caster: BattleCombatant, target: BattleCombatant, skill: Skill, now: number): boolean {
  const effect = skill.effect;
  if (!effect || (effect.kind !== 'stun' && !(effect.kind === 'status' && (effect.status === 'sleep' || effect.status === 'freeze')))) return false;
  if (interruptChance(skill, caster, target) <= 0) return false;
  const ability = ABILITY_MAP[target.ability]?.effect;
  if (effect.kind === 'stun' && ability?.kind === 'flinchImmunity') return false;
  if (skill.power > 0 && (typeMultiplier(skill.type, target.types) === 0 || ability?.kind === 'typeImmunity' && ability.type === skill.type)) return false;
  const remaining = target.castProgress?.remaining ?? 0;
  const wait = Math.max(0, caster.actionReadyRemaining ?? 0, caster.actionLockRemaining ?? 0, caster.cooldowns[skill.id] ?? 0) + (skill.castTime ?? 0);
  return remaining > wait + D.interruptMargin && controlRemaining(caster, now) <= 0
    && distCells(caster.pixel, caster.position) <= .05
    && skillCovers(skill, caster.pixel, target.pixel, target.pixel);
}
