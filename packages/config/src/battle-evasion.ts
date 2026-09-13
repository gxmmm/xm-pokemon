/** 避让只改变真实移动，不能授予无敌或取消已经开始的动作。 */
export const BATTLE_EVASION = {
  reactionMin: .09,
  reactionRisk: .1,
  retryInterval: 1.4,
  safetyTime: .06,
  predictionTick: .025,
  chanceBase: .2,
  chanceCaution: .45,
  chanceWounded: .25,
  chanceMax: .85,
  maxSteps: 2,
  minimumRangedDistance: 3,
} as const;
