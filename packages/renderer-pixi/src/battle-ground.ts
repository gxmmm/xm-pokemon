import { BATTLE_GRID } from '@pokemon-online/shared';

export interface BattleGroundPoint { x: number; y: number; }

/** Maps logical grid coordinates to bottom-center/feet anchors on the visible
 * 2.5D ground plane. This is renderer presentation only: simulation remains in
 * unprojected grid cells. */
export function projectBattleGroundPoint(gridX: number, gridY: number): BattleGroundPoint {
  const nx = (gridX + 0.5) / BATTLE_GRID.cols;
  const depth = Math.max(0, Math.min(1, (gridY + 0.5) / BATTLE_GRID.rows));
  const y = 342 + depth * 282;
  const width = 570 + depth * 460;
  return { x: 640 + (nx - 0.5) * width, y };
}

/** A body-center/impact point offset from a unit's foot anchor toward an
 * attacker-facing side. Melee impact flashes should not spawn in target center. */
export function battleContactPoint(target: BattleGroundPoint, actor: BattleGroundPoint): BattleGroundPoint {
  const dx = actor.x - target.x;
  const side = Math.abs(dx) < 0.001 ? 0 : Math.sign(dx);
  return { x: target.x + side * 22, y: target.y - 30 };
}
