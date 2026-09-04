/** Engine-owned moving-center clearance in grid cells, not sprite dimensions.
 * Below diagonal corner clearance (sqrt(0.5)) to retain adjacent-cell melee. */
export const BATTLE_MOVEMENT = { pathClearance: 0.5 } as const;
