import { BATTLE_GRID, type BattleWorldPosition } from '@pokemon-online/shared';
import type { BattleCameraSpec } from '@pokemon-online/config';

export interface BattleGroundPoint { x: number; y: number; }
export interface BattleGroundProjection extends BattleGroundPoint { depth: number; scale: number; }

/** Compatibility boundary between the current integer-cell simulator and the
 * continuous battle world consumed by presentation. No screen geometry leaks
 * back through this adapter. */
export function battleWorldPositionFromGrid(gridX: number, gridY: number, z = 0): BattleWorldPosition {
  return {
    x: gridX + 0.5 - BATTLE_GRID.cols / 2,
    y: gridY + 0.5 - BATTLE_GRID.rows / 2,
    z,
  };
}

/** Pinhole projection for the configurable 2.5D spectator camera. */
export function projectBattleWorldPoint(position: BattleWorldPosition, camera: BattleCameraSpec): BattleGroundProjection {
  const pitch = camera.pitchDegrees * Math.PI / 180;
  const distance = camera.height / Math.max(0.12, Math.tan(pitch));
  const cameraPosition = { x: camera.target.x, y: camera.target.y + distance, z: camera.target.z + camera.height };
  const relative = {
    x: position.x - cameraPosition.x,
    y: position.y - cameraPosition.y,
    z: position.z - cameraPosition.z,
  };
  // Camera basis for a level horizon: right is world +x; view-up combines
  // ground depth and elevation according to the configured pitch.
  const depth = Math.max(1, -relative.y * Math.cos(pitch) - relative.z * Math.sin(pitch));
  const cameraUp = -relative.y * Math.sin(pitch) + relative.z * Math.cos(pitch);
  const perspective = camera.focalLength / depth;
  const targetDistance = Math.hypot(distance, camera.height);
  const targetPerspective = camera.focalLength / targetDistance;
  return {
    x: camera.principal.x + relative.x * perspective,
    y: camera.principal.y - cameraUp * perspective,
    depth,
    scale: Math.max(0.76, Math.min(1.16, perspective / targetPerspective)),
  };
}

/** Maps logical grid coordinates to bottom-center/feet anchors on the visible
 * 2.5D ground plane. This is renderer presentation only: simulation remains in
 * unprojected grid cells. */
export function projectBattleGroundPoint(gridX: number, gridY: number, camera: BattleCameraSpec): BattleGroundProjection {
  return projectBattleWorldPoint(battleWorldPositionFromGrid(gridX, gridY), camera);
}

/** A body-center/impact point offset from a unit's foot anchor toward an
 * attacker-facing side. Melee impact flashes should not spawn in target center. */
export function battleContactPoint(target: BattleGroundPoint, actor: BattleGroundPoint): BattleGroundPoint {
  const dx = actor.x - target.x;
  const side = Math.abs(dx) < 0.001 ? 0 : Math.sign(dx);
  return { x: target.x + side * 22, y: target.y - 30 };
}
