/** 队伍协作只调整决策价值，不提供额外伤害、瞬移或隐藏治疗。 */
export const BATTLE_COOPERATION = {
  healSearchExtra: 3,
  healReservationWindow: .5,
  healMinimumMissingRatio: .03,
  healUrgencyWeight: 100,
  healEfficiencyWeight: 75,
  healPressureWeight: 24,
  healTravelPenalty: 18,
  guardReachExtra: 2,
  guardThreatDistance: 3.5,
  guardTargetBonus: 18,
  controlTargetBonus: 5,
  controlDamageBonus: .3,
  controlSafetyMargin: .15,
} as const;
