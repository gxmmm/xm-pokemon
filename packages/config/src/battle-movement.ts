/** Engine-owned moving-center clearance in grid cells, not sprite dimensions.
 * Below diagonal corner clearance (sqrt(0.5)) to retain adjacent-cell melee. */
export const BATTLE_MOVEMENT = {
  pathClearance: 0.5,
  /** Allied destination centers stay apart; opponents may still meet in melee.
   * Custom starting formations are preserved and may separate incrementally. */
  allyDestinationClearance: 2,
} as const;
