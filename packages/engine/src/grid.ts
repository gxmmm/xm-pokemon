/**
 * Grid battle helpers. The arena is a BATTLE_GRID (cols x rows) of cells.
 * Combatants occupy integer cells and step cell-by-cell; distance is measured
 * in cell units.
 *
 * Skill `rangeTiles` in config was tuned against the legacy 720-wide continuous
 * arena. We convert it to cells so the existing config keeps working unchanged
 * (frozen: ranges come from config, not hardcoded here). Melee moves always
 * reach an adjacent cell (incl. diagonal), so melee range is 1.5 cells
 * (diagonal adjacency = sqrt(2) ~= 1.41 < 1.5).
 */
import type { Skill } from '@pokemon-online/shared';
import { ARENA, BATTLE_GRID } from '@pokemon-online/shared';

/** Effective range of a skill in grid-cell units. */
export function rangeInCells(skill: Pick<Skill, 'range' | 'rangeTiles'>): number {
  if (skill.range === 'melee') return MELEE_RANGE_CELLS;
  // Scale ranged range down from the legacy 720-wide arena conversion. The raw
  // factor (1.0) gave 8-13 cells on the 20-col grid -- over half the arena --
  // which made ranged poke oppressive vs melee (a ranged fighter hit from
  // across the map while a melee one chased 10+ cells). Factor 0.6 -> ~5-8
  // cells, so ranged fighters must engage closer and melee can close the gap.
  const cells = Math.round((skill.rangeTiles / ARENA.width) * BATTLE_GRID.cols * 0.6);
  return Math.max(3, Math.min(cells, BATTLE_GRID.cols - 1));
}

/** Euclidean distance in cell units between two cell coordinates. */
export function distCells(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Is a cell inside the playable oval arena? The arena is the ellipse inscribed
 * in the grid rectangle (semi-axes cols/2, rows/2), shrunk slightly (0.9) so
 * combatants keep a margin from the wall. Cells outside the ellipse are
 * "stands" - non-playable. This gives the top-down colosseum look (oval field
 * with stadium outside) while keeping movement grid-based.
 */
export function isCellInArena(gx: number, gy: number): boolean {
  const nx = (gx + 0.5 - BATTLE_GRID.cols / 2) / (BATTLE_GRID.cols / 2);
  const ny = (gy + 0.5 - BATTLE_GRID.rows / 2) / (BATTLE_GRID.rows / 2);
  return nx * nx + ny * ny <= 0.9;
}

/** Default 3-slot formation on the player's starting (left) side: spread
 *  vertically around the mid row at ~20% width. Used for new saves and as the
 *  engine fallback when a save has no/invalid formation. */
export function defaultFormation(): { x: number; y: number }[] {
  const cols = BATTLE_GRID.cols;
  const rows = BATTLE_GRID.rows;
  const gx = Math.floor(cols * 0.2);
  const mid = Math.round(rows / 2);
  const clampRow = (y: number) => Math.max(1, Math.min(rows - 2, y));
  return [
    { x: gx, y: clampRow(mid - 2) },
    { x: gx, y: clampRow(mid) },
    { x: gx, y: clampRow(mid + 2) },
  ];
}

/** Player's starting area columns (left side) where formation placement is allowed. */
export const FORMATION_START_COLS = Math.ceil(BATTLE_GRID.cols * 0.35);

/** Melee reach: adjacent including diagonal. Normal attack (melee) uses this. */
export const MELEE_RANGE_CELLS = 1.5;
/** Where a melee/normal-attack fighter wants to stand (orthogonal-adjacent). */
export const MELEE_DESIRED_CELLS = 1.0;
/** Movement "stop band" buffer. A combatant stops stepping once within
 *  desiredRange + MOVE_BUFFER. MUST satisfy (desired + buffer) <= attack range
 *  for melee, else a fighter stops just out of reach and never attacks
 *  (the grid version of the old stall bug). Melee: 1.0 + 0.5 = 1.5 == range. */
export const MOVE_BUFFER = 0.5;
