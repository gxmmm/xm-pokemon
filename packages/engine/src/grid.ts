/**
 * Grid battle helpers. The arena is a BATTLE_GRID (cols x rows) of cells.
 * Combatants occupy integer cells and step cell-by-cell; distance is measured
 * in cell units.
 *
 * 技能优先声明 space.reach 格数；未声明的远程值统一换算。
 * 近战共享 2.5 格接敌范围，实际脚点与预约落点由引擎管理。
 */
import { BATTLE_MOVEMENT } from '@pokemon-online/config';
import type { Skill } from '@pokemon-online/shared';
import { ARENA, BATTLE_GRID } from '@pokemon-online/shared';

/** Effective range of a skill in grid-cell units. */
export function rangeInCells(skill: Pick<Skill, 'range' | 'rangeTiles' | 'space'>): number {
  if (skill.space?.reach) return skill.space.reach;
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

type GridPoint = { x: number; y: number };

/** Shortest legal approach to an attack band, returning only the next cell.
 * A bounded grid search can go behind a blocker; greedy sidesteps can oscillate
 * forever once allied destination spacing closes the direct lane. */
export function findGridApproachStep(from: GridPoint, target: GridPoint, range: number, lane: number,
  canTravel: (from: GridPoint, to: GridPoint) => boolean): GridPoint | undefined {
  const queue: { cell: GridPoint; first?: GridPoint }[] = [{ cell: from }];
  const visited = new Set([`${from.x},${from.y}`]);
  for (let index = 0; index < queue.length; index++) {
    const { cell, first } = queue[index]!;
    if (distCells(cell, target) <= range) return first;
    const neighbors: GridPoint[] = [];
    for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
      if (dx !== 0 || dy !== 0) neighbors.push({ x: cell.x + dx, y: cell.y + dy });
    }
    neighbors.sort((a, b) => distCells(a, target) - distCells(b, target) || lane * (b.y - a.y) || a.x - b.x);
    for (const next of neighbors) {
      const key = `${next.x},${next.y}`;
      if (visited.has(key) || !isCellInArena(next.x, next.y) || !canTravel(cell, next)) continue;
      visited.add(key);
      queue.push({ cell: next, first: first ?? next });
    }
  }
  return undefined;
}

/** Minimum distance between two remaining travel segments, regardless of each
 * actor's progress. Covers crossing diagonals, followers and cast-position snaps. */
export function travelPathDistance(a: GridPoint, b: GridPoint, c: GridPoint, d: GridPoint): number {
  const cross = (p: GridPoint, q: GridPoint, r: GridPoint) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return 0;
  return Math.min(pointPathDistance(a, c, d), pointPathDistance(b, c, d), pointPathDistance(c, a, b), pointPathDistance(d, a, b));
}

function pointPathDistance(point: GridPoint, from: GridPoint, to: GridPoint): number {
  const dx = to.x - from.x, dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared));
  return Math.hypot(point.x - from.x - t * dx, point.y - from.y - t * dy);
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

/** 近战接敌范围；基础攻击共用，避免挤入同一落点。 */
export const MELEE_RANGE_CELLS = BATTLE_MOVEMENT.meleeReach;
/** 近战停靠距离。 */
export const MELEE_DESIRED_CELLS = BATTLE_MOVEMENT.meleeReach - 0.5;
/** Movement "stop band" buffer. A combatant stops stepping once within
 *  desiredRange + MOVE_BUFFER. MUST satisfy (desired + buffer) <= attack range
 *  for melee, else a fighter stops just out of reach and never attacks
 *  (the grid version of the old stall bug). Melee: 2.0 + 0.5 = 2.5 == range. */
export const MOVE_BUFFER = 0.5;
