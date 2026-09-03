import { battleWorldPositionFromGrid, type BattleCombatant, type BattleEvent, type BattleWorldPosition } from '@pokemon-online/shared';

export type BattlePresentationCombatantInput = BattleCombatant & { worldPosition?: BattleWorldPosition };
export type BattlePresentationCombatant = BattleCombatant & { worldPosition: BattleWorldPosition };

/** A short-delayed immutable battle view. The simulator may continue while a
 * renderer consumes an earlier snapshot for readable impact framing. */
export interface BattlePresentation {
  time: number;
  combatants: BattlePresentationCombatant[];
  events: BattleEvent[];
}

export interface BattleSnapshot {
  time: number;
  combatants: BattlePresentationCombatant[];
}

function cloneCombatant(combatant: BattlePresentationCombatantInput): BattlePresentationCombatant {
  return {
    ...combatant,
    types: [...combatant.types],
    activeSkills: [...combatant.activeSkills],
    passiveSkills: [...combatant.passiveSkills],
    position: { ...combatant.position },
    pixel: { ...combatant.pixel },
    worldPosition: combatant.worldPosition
      ? { ...combatant.worldPosition }
      : battleWorldPositionFromGrid(combatant.pixel.x, combatant.pixel.y),
    cooldowns: { ...combatant.cooldowns },
    statStages: { ...combatant.statStages },
    buffs: combatant.buffs.map((buff) => ({ ...buff })),
    castProgress: combatant.castProgress ? { ...combatant.castProgress } : null,
  };
}

export function snapshotBattle(time: number, combatants: readonly BattlePresentationCombatantInput[]): BattleSnapshot {
  return { time, combatants: combatants.map(cloneCombatant) };
}

/** Interpolates continuous visual fields only. Discrete battle facts remain at
 * the earlier snapshot until their event is due, preventing future HP/status
 * state from leaking in before its matching visual cue. */
export function interpolateBattle(a: BattleSnapshot, b: BattleSnapshot, time: number): BattlePresentationCombatant[] {
  if (b.time <= a.time) return b.combatants.map(cloneCombatant);
  const progress = Math.max(0, Math.min(1, (time - a.time) / (b.time - a.time)));
  const afterByUid = new Map(b.combatants.map((combatant) => [combatant.uid, combatant]));
  return a.combatants.map((before) => {
    const after = afterByUid.get(before.uid);
    if (!after) return cloneCombatant(before);
    const interpolated = cloneCombatant(progress >= 0.9999 ? after : before);
    interpolated.pixel = {
      x: before.pixel.x + (after.pixel.x - before.pixel.x) * progress,
      y: before.pixel.y + (after.pixel.y - before.pixel.y) * progress,
    };
    interpolated.worldPosition = {
      x: before.worldPosition.x + (after.worldPosition.x - before.worldPosition.x) * progress,
      y: before.worldPosition.y + (after.worldPosition.y - before.worldPosition.y) * progress,
      z: before.worldPosition.z + (after.worldPosition.z - before.worldPosition.z) * progress,
    };
    return interpolated;
  });
}
