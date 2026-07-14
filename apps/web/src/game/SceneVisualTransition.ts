import type { QualityProfile } from '@pokemon-online/renderer';

/** SPA-local handoff between route-owned renderer bridges. It transports only
 * visual intent; battle facts, map state, and save data remain in their stores. */
export interface WorldBattleVisualTransition {
  mapId: string;
  quality: QualityProfile;
}

let pendingBattleEntry: WorldBattleVisualTransition | null = null;
let pendingWorldReturn: WorldBattleVisualTransition | null = null;

export function requestBattleVisualTransition(transition: WorldBattleVisualTransition): void {
  pendingBattleEntry = transition;
}
export function consumeBattleVisualTransition(): WorldBattleVisualTransition | null {
  const transition = pendingBattleEntry;
  pendingBattleEntry = null;
  return transition;
}
export function requestWorldReturnVisualTransition(transition: WorldBattleVisualTransition): void {
  pendingWorldReturn = transition;
}
export function consumeWorldReturnVisualTransition(): WorldBattleVisualTransition | null {
  const transition = pendingWorldReturn;
  pendingWorldReturn = null;
  return transition;
}
