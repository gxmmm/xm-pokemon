import type { BattleArtLocomotionMode, BattleTerrainContactVisual } from '@pokemon-online/config';

export interface MovementPressurePlan {
  intervalSeconds: number;
  minTravelPixels: number;
  lineCount: number;
  durationSeconds: number;
}

/** Bounded environmental speed accents: short grouped air lines, never a
 * continuous trail. */
export function movementPressurePlan(quality: 'cinematic' | 'standard' | 'compatibility' = 'standard'): MovementPressurePlan {
  return { intervalSeconds: 0.20, minTravelPixels: 0.55, lineCount: quality === 'cinematic' ? 4 : quality === 'standard' ? 3 : 2, durationSeconds: 0.18 };
}
export interface TerrainContactPlan {
  occludesFeet: boolean;
  particleKind: 'grass' | 'mud' | 'dust' | 'ripples' | 'runes' | 'none';
  particleBudget: number;
  shadowAlphaMultiplier: number;
  shadowScaleMultiplier: number;
}

/** Pure visual policy joining resolved environment and model configuration.
 * It deliberately carries no species IDs, grid rules, collision, or gameplay
 * effects: flight/hover are visual presentation choices only. */
export function terrainContactPlan(
  contactVisual: BattleTerrainContactVisual,
  locomotionMode: BattleArtLocomotionMode,
  quality: 'cinematic' | 'standard' | 'compatibility' = 'standard',
): TerrainContactPlan {
  const airborne = locomotionMode === 'hover' || locomotionMode === 'flight';
  if (airborne) {
    return { occludesFeet: false, particleKind: 'none', particleBudget: 0, shadowAlphaMultiplier: locomotionMode === 'flight' ? 0.52 : 0.68, shadowScaleMultiplier: locomotionMode === 'flight' ? 0.76 : 0.86 };
  }
  const particleBudget = quality === 'cinematic' ? 4 : quality === 'standard' ? 3 : 1;
  if (contactVisual === 'grass-clumps') return { occludesFeet: true, particleKind: 'grass', particleBudget, shadowAlphaMultiplier: 1, shadowScaleMultiplier: 1 };
  if (contactVisual === 'ripples') return { occludesFeet: false, particleKind: 'ripples', particleBudget: Math.max(1, particleBudget - 1), shadowAlphaMultiplier: 0.78, shadowScaleMultiplier: 1.08 };
  if (contactVisual === 'rune-sparks') return { occludesFeet: false, particleKind: 'runes', particleBudget: Math.max(1, particleBudget - 1), shadowAlphaMultiplier: 1, shadowScaleMultiplier: 1 };
  if (contactVisual === 'dust') return { occludesFeet: false, particleKind: 'dust', particleBudget, shadowAlphaMultiplier: 1, shadowScaleMultiplier: 1 };
  return { occludesFeet: false, particleKind: 'none', particleBudget: 0, shadowAlphaMultiplier: 1, shadowScaleMultiplier: 1 };
}
