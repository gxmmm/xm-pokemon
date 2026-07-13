import type { BattleCombatant, BattleEvent } from '@pokemon-online/shared';

/**
 * A short-delayed, immutable view of combat. The simulator continues at full
 * speed; the renderer plays this timeline slightly behind it so the battle
 * director can prepare framing before a high-impact event reaches the screen.
 */
export interface BattlePresentation {
  time: number;
  combatants: BattleCombatant[];
  events: BattleEvent[];
}

export interface BattleSnapshot {
  time: number;
  combatants: BattleCombatant[];
}

function cloneCombatant(c: BattleCombatant): BattleCombatant {
  return {
    ...c,
    types: [...c.types],
    activeSkills: [...c.activeSkills],
    passiveSkills: [...c.passiveSkills],
    position: { ...c.position },
    pixel: { ...c.pixel },
    cooldowns: { ...c.cooldowns },
    statStages: { ...c.statStages },
    buffs: c.buffs.map((b) => ({ ...b })),
    castProgress: c.castProgress ? { ...c.castProgress } : null,
  };
}

export function snapshotBattle(time: number, combatants: BattleCombatant[]): BattleSnapshot {
  return { time, combatants: combatants.map(cloneCombatant) };
}

/** Interpolates only the continuous visual fields. HP/status/casts remain
 * event-stepped, which keeps a damage event and its impact VFX aligned. */
export function interpolateBattle(a: BattleSnapshot, b: BattleSnapshot, time: number): BattleCombatant[] {
  if (b.time <= a.time) return b.combatants.map(cloneCombatant);
  const k = Math.max(0, Math.min(1, (time - a.time) / (b.time - a.time)));
  const afterByUid = new Map(b.combatants.map((c) => [c.uid, c]));
  return a.combatants.map((before) => {
    const after = afterByUid.get(before.uid);
    if (!after) return cloneCombatant(before);
    // Discrete state must never leak in from the future snapshot: otherwise HP
    // can visibly drop a frame before its delayed damage event/VFX is shown.
    // Continuous position alone is interpolated between the two samples.
    const c = cloneCombatant(k >= 0.9999 ? after : before);
    c.pixel = {
      x: before.pixel.x + (after.pixel.x - before.pixel.x) * k,
      y: before.pixel.y + (after.pixel.y - before.pixel.y) * k,
    };
    return c;
  });
}
