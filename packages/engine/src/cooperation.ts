import type { BattleCombatant, BattleState, Skill } from '@pokemon-online/shared';
import { BATTLE_COOPERATION as C, SKILL_MAP } from '@pokemon-online/config';
import { effectiveStat } from './stats.ts';
import { distCells, rangeInCells } from './grid.ts';

export function controlRemaining(unit: BattleCombatant, now: number): number {
  return Math.max(0, unit.status === 'sleep' || unit.status === 'freeze' ? unit.statusTimer : 0, (unit.flinchUntil ?? 0) - now);
}
function pressureOn(patient: BattleCombatant, state: BattleState): number {
  return state.combatants.filter(enemy => enemy.alive && enemy.side !== patient.side && enemy.currentTargetUid === patient.uid
    && controlRemaining(enemy, state.time) <= .1 && distCells(enemy.pixel, patient.pixel) <= (enemy.engagementRangeCells ?? 2.5) + 1).length;
}
function incomingHealing(caster: BattleCombatant, patient: BattleCombatant, state: BattleState): number {
  return state.combatants.reduce((sum, ally) => {
    if (!ally.alive || ally.side !== caster.side || ally.uid === caster.uid || controlRemaining(ally, state.time) > 0) return sum;
    const casting = ally.castProgress;
    if (!casting) return sum;
    const skillId = casting.skillId;
    const targetUid = ally.castSupportUid;
    const skill = skillId ? SKILL_MAP[skillId] : undefined;
    if (!skill || skill.effect?.kind !== 'heal' || skill.effect.target !== 'ally' || targetUid !== patient.uid) return sum;
    const wait = casting.remaining;
    if (wait > C.healReservationWindow || distCells(ally.pixel, patient.pixel) > rangeInCells(skill)
      || distCells(ally.pixel, ally.position) > .05) return sum;
    return sum + effectiveStat(ally, 'atk') * (skill.effect.healingPower ?? 100) / 100;
  }, 0);
}
/** 按预计有效治疗、危险程度和移动成本选人，已有可兑现治疗不重复计算缺血。 */
export function selectHealingTarget(caster: BattleCombatant, skill: Skill, state: BattleState): { patient: BattleCombatant; score: number } | undefined {
  const amount = Math.max(1, effectiveStat(caster, 'atk') * (skill.effect?.healingPower ?? 100) / 100);
  let best: { patient: BattleCombatant; score: number } | undefined;
  for (const patient of state.combatants) {
    if (!patient.alive || patient.side !== caster.side) continue;
    const travel = Math.max(0, distCells(caster.pixel, patient.pixel) - rangeInCells(skill));
    const missing = Math.max(0, patient.maxHp - patient.currentHp - incomingHealing(caster, patient, state));
    if (travel > C.healSearchExtra || missing < patient.maxHp * C.healMinimumMissingRatio) continue;
    const score = 25 + missing / patient.maxHp * C.healUrgencyWeight + Math.min(1, missing / amount) * C.healEfficiencyWeight
      + Math.min(2, pressureOn(patient, state)) * C.healPressureWeight - travel * C.healTravelPenalty;
    if (!best || score > best.score) best = { patient, score };
  }
  return best;
}
/** 前排只反制身边确实正在威胁后排的敌人，不跨场追赶。 */
export function nearbyBacklineThreat(caster: BattleCombatant, state: BattleState): BattleCombatant | undefined {
  if (caster.rangedRole) return undefined;
  return state.combatants.filter(enemy => {
    if (!enemy.alive || enemy.side === caster.side || controlRemaining(enemy, state.time) > .5) return false;
    const patient = state.combatants.find(ally => ally.alive && ally.side === caster.side && ally.rangedRole && ally.uid === enemy.currentTargetUid);
    return patient && distCells(enemy.pixel, patient.pixel) <= C.guardThreatDistance
      && distCells(caster.pixel, enemy.pixel) <= (caster.engagementRangeCells ?? 2.5) + C.guardReachExtra;
  }).sort((a, b) => distCells(caster.pixel, a.pixel) - distCells(caster.pixel, b.pixel))[0];
}

/** 只奖励已经站稳且来得及释放的进攻，不用逻辑落点预测命中。 */
export function canUseControlWindow(caster: BattleCombatant, target: BattleCombatant, skill: Skill, now: number): boolean {
  const wait = Math.max(0, caster.actionReadyRemaining ?? 0, caster.cooldowns[skill.id] ?? 0) + (skill.castTime ?? 0);
  return skill.power > 0 && distCells(caster.pixel, caster.position) <= .05
    && distCells(caster.pixel, target.pixel) <= rangeInCells(skill)
    && controlRemaining(target, now) > wait + C.controlSafetyMargin;
}
