/** Engine-owned moving-center clearance in grid cells, not sprite dimensions.
 * 经过路径与最终停靠使用不同间距，避免绕行通道被停靠体积封死。 */
export const BATTLE_MOVEMENT = {
  pathClearance: 0.5,
  enemyDestinationClearance: 2,
  meleeReach: 2.5,
  rangedHold: 4.5,
  retreatCooldown: 1.4,
  targetCommitment: 1.2,
  formationHold: 0.9,
  /** Allied destination centers stay apart; opponents may still meet in melee.
   * Custom starting formations are preserved and may separate incrementally. */
  allyDestinationClearance: 3,
} as const;
