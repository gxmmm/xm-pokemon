import type { BattleCombatant, Skill } from '@pokemon-online/shared';
import { distCells, rangeInCells } from './grid.ts';

export type AimPoint = { x: number; y: number };
/** 同一覆盖查询用于 AI 收益评估和释放时逐目标结算，禁止全场兜底。 */
export function skillCovers(skill: Skill, source: AimPoint, aim: AimPoint, point: AimPoint): boolean {
  const space = skill.space;
  const reach = rangeInCells(skill);
  if (!space || space.shape === 'single') return distCells(source, point) <= reach;
  if (space.shape === 'burst') return distCells(source, aim) <= reach && distCells(aim, point) <= (space.radius ?? 3);
  if (space.shape === 'radial') return distCells(source, point) <= (space.radius ?? reach);
  const dx = aim.x - source.x, dy = aim.y - source.y, length = Math.hypot(dx, dy);
  if (length < .001) return false;
  const px = point.x - source.x, py = point.y - source.y;
  const forward = (px * dx + py * dy) / length;
  const lateral = Math.abs(px * dy - py * dx) / length;
  const width = space.width ?? 1;
  return forward >= 0 && forward <= reach && lateral <= (space.shape === 'cone' ? .5 + width * forward / reach : width);
}
export function skillVictims(skill: Skill, caster: BattleCombatant, target: BattleCombatant | undefined, enemies: BattleCombatant[], aim = target?.pixel): BattleCombatant[] {
  if (!aim) return [];
  return enemies.filter(enemy => enemy.alive && (skill.targetMode === 'all-enemies' || enemy.uid === target?.uid) && skillCovers(skill, caster.pixel, aim, enemy.pixel));
}
