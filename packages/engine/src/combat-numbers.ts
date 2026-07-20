/**
 * Authoritative integer policy for combat-facing amounts. HP, damage, healing,
 * shields, absorbs, and battle recap totals must never retain fractions.
 *
 * A positive effective amount always resolves to at least one point. Zero stays
 * zero for intentional no-effect outcomes such as immunity, a full HP bar, or a
 * fully absorbed hit.
 */
export function roundCombatAmount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(1, Math.round(value));
}

/** Clamp an already-derived amount to the remaining positive capacity while
 * retaining integer combat values. */
export function clampCombatAmount(value: number, capacity: number): number {
  const room = Math.max(0, Math.floor(capacity));
  if (room === 0) return 0;
  return Math.min(roundCombatAmount(value), room);
}
