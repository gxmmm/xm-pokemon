/** 仅影响 AI 选择，不改变伤害、动作时间或命中事实。 */
export const BATTLE_DECISION = {
  abilityReadyHorizon: 2,
  immuneTargetPenalty: 40,
  targetAbilityWeight: 12,
  motionHorizon: .45,
  movingCoverageFloor: .35,
  riskCoverageAllowance: .35,
  overkillValue: .12,
  windupCost: .35,
  interruptMargin: .1,
  finishTimeFloor: .25,
  shieldDangerRatio: .35,
  existingShieldValue: .1,
  immediateActionRatio: .8,
  aimSwitchRatio: 1.2,
  controlReservationChance: .65,
} as const;
