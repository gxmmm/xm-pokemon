import type { BattleCombatant } from '@pokemon-online/shared';
import type { BattleCameraSpec } from '@pokemon-online/config';
import { projectBattleGroundPoint } from './battle-ground.ts';

/** 显示朝向使用同一斜视角投影；不改引擎位置、目标或命中。 */
export function battleDisplayFacing(actor: BattleCombatant, combatants: readonly BattleCombatant[], camera: BattleCameraSpec): 1 | -1 {
  const target = combatants.find(unit => unit.uid === (actor.castSupportUid ?? actor.currentTargetUid));
  const aim = actor.castProgress || (actor.actionLockRemaining ?? 0) > 0 ? actor.actionAim ?? actor.castAim ?? target?.pixel : target?.pixel;
  if (!aim) return actor.facing;
  const from = projectBattleGroundPoint(actor.pixel.x, actor.pixel.y, camera);
  const to = projectBattleGroundPoint(aim.x, aim.y, camera);
  const dx = to.x - from.x, dy = to.y - from.y;
  if (Math.abs(dx) > .5) return dx > 0 ? 1 : -1;
  if (Math.abs(dy) > .5) return dy < 0 ? 1 : -1;
  return actor.facing;
}
