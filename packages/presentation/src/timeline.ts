import type { BattleCombatant, BattleEvent } from '@pokemon-online/shared';

/** A short-delayed immutable battle view. The simulator may continue while a
 * renderer consumes an earlier snapshot for readable impact framing. */
export interface BattlePresentation {
  time: number;
  combatants: BattleCombatant[];
  events: BattleEvent[];
}

export interface BattleSnapshot {
  time: number;
  combatants: BattleCombatant[];
}

function cloneCombatant(combatant: BattleCombatant): BattleCombatant {
  return {
    ...combatant,
    types: [...combatant.types],
    activeSkills: [...combatant.activeSkills],
    passiveSkills: [...combatant.passiveSkills],
    position: { ...combatant.position },
    pixel: { ...combatant.pixel },
    cooldowns: { ...combatant.cooldowns },
    statStages: { ...combatant.statStages },
    buffs: combatant.buffs.map((buff) => ({ ...buff })),
    castProgress: combatant.castProgress ? { ...combatant.castProgress } : null,
  };
}

export function snapshotBattle(time: number, combatants: readonly BattleCombatant[]): BattleSnapshot {
  return { time, combatants: combatants.map(cloneCombatant) };
}

/** Interpolates continuous visual fields only. Discrete battle facts remain at
 * the earlier snapshot until their event is due, preventing future HP/status
 * state from leaking in before its matching visual cue. */
export function interpolateBattle(a: BattleSnapshot, b: BattleSnapshot, time: number): BattleCombatant[] {
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
    return interpolated;
  });
}
