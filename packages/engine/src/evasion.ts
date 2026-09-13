import type { BattleCombatant, BattleState, Skill } from '@pokemon-online/shared';
import { ABILITY_MAP, BATTLE_EVASION as E, PERSONALITY_MAP, SKILL_MAP, typeMultiplier } from '@pokemon-online/config';
import { distCells, rangeInCells } from './grid.ts';
import { skillCovers, type AimPoint } from './skill-space.ts';
import type { RNG } from './rng.ts';

type Cast = NonNullable<BattleCombatant['castProgress']>;
type Threat = { caster: BattleCombatant; cast: Cast; skill: Skill; aim: AimPoint };
type Observation = { cast: Cast; seen: number; tried: boolean };
type Escape = { caster: BattleCombatant; cast: Cast; path: AimPoint[] };

/** 每个单位独立观察公开蓄力，一次施法最多评估一次避让。 */
export class BattleEvasion {
  private observations = new Map<string, Map<string, Observation>>();
  private nextAttempt = new Map<string, number>();
  private escapes = new Map<string, Escape>();

  step(c: BattleCombatant, state: BattleState, delay: number, canStep: (unit: BattleCombatant, cell: AimPoint) => boolean, rng: RNG): boolean {
    const threats: Threat[] = state.combatants.flatMap(caster => {
      const cast = caster.castProgress;
      const skill = cast && SKILL_MAP[cast.skillId];
      const ability = ABILITY_MAP[c.ability];
      if (!caster.alive || caster.side === c.side || !cast || !skill?.space || skill.space.shape === 'single' || !skill.power || !caster.castAim
        || typeMultiplier(skill.type, c.types) === 0 || ability?.effect.kind === 'typeImmunity' && ability.effect.type === skill.type) return [];
      return [{ caster, cast, skill, aim: caster.castAim }];
    });
    let seen = this.observations.get(c.uid);
    if (!seen) this.observations.set(c.uid, seen = new Map());
    for (const [uid, observation] of seen) if (!threats.some(t => t.caster.uid === uid && t.cast === observation.cast)) seen.delete(uid);
    for (const t of threats) if (seen.get(t.caster.uid)?.cast !== t.cast) seen.set(t.caster.uid, { cast: t.cast, seen: state.time, tried: false });
    const escape = this.escapes.get(c.uid);
    if (escape) {
      if (!escape.caster.alive || escape.caster.castProgress !== escape.cast) this.escapes.delete(c.uid);
      else {
        // 新范围或更早释放的另一招会中止旧路线，不在此处无限重规划。
        const remainingRoute = [c.position, ...escape.path];
        if (threats.some(t => skillCovers(t.skill, t.caster.pixel, t.aim, predictPosition(c.pixel, remainingRoute, delay, Math.max(0, t.cast.remaining - E.safetyTime), c.moveCd ?? 0)))) {
          this.escapes.delete(c.uid); return false;
        }
        if (escape.path.length && (c.moveCd ?? 0) <= 0) {
          const cell = escape.path[0]!;
          if (!canStep(c, cell) || threats.some(t => t.cast !== escape.cast && !skillCovers(t.skill, t.caster.pixel, t.aim, c.pixel) && pathEnters(t, c.pixel, cell))) { this.escapes.delete(c.uid); return false; }
          c.position = { ...cell }; c.moveCd = delay; escape.path.shift();
        }
        return true; // 不在同一次蓄力结束前被普通走位拉回危险区域。
      }
    }
    if (c.castProgress || (c.actionLockRemaining ?? 0) > 0 || (c.moveCd ?? 0) > 0 || distCells(c.pixel, c.position) > .05) return false;
    const personality = PERSONALITY_MAP[c.personality] ?? PERSONALITY_MAP.cool!;
    for (const t of threats) {
      const observation = seen.get(t.caster.uid)!;
      if (observation.tried || state.time - observation.seen < E.reactionMin + personality.riskTolerance * E.reactionRisk) continue;
      if (!skillCovers(t.skill, t.caster.pixel, t.aim, c.pixel)) continue;
      observation.tried = true;
      if (state.time < (this.nextAttempt.get(c.uid) ?? 0)) continue;
      this.nextAttempt.set(c.uid, state.time + E.retryInterval);
      const chance = Math.min(E.chanceMax, E.chanceBase + (1 - personality.riskTolerance) * E.chanceCaution + (1 - c.currentHp / c.maxHp) * E.chanceWounded);
      if (rng() >= chance) continue;
      const time = t.cast.remaining - E.safetyTime;
      if (time <= 0) continue;
      const paths: AimPoint[][] = [];
      const visit = (from: AimPoint, path: AimPoint[]) => {
        if (path.length >= E.maxSteps) return;
        for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
          if (!dx && !dy) continue;
          const cell = { x: from.x + dx, y: from.y + dy };
          if (distCells(cell, c.position) < .1 || path.some(p => p.x === cell.x && p.y === cell.y)) continue;
          const unit = path.length ? { ...c, position: from, pixel: from } : c;
          if (!canStep(unit, cell)) continue;
          if (c.rangedRole && state.combatants.some(enemy => enemy.alive && enemy.side !== c.side
            && distCells(cell, enemy.pixel) < Math.min(E.minimumRangedDistance, distCells(c.pixel, enemy.pixel)))) continue;
          // 已知的另一片危险区不能成为逃生路径。
          if (threats.some(other => other !== t && !skillCovers(other.skill, other.caster.pixel, other.aim, c.pixel)
            && pathEnters(other, from, cell))) continue;
          const route = [...path, cell];
          if (route.length * delay <= time && threats.every(other => !skillCovers(other.skill, other.caster.pixel, other.aim, cell)
            && !skillCovers(other.skill, other.caster.pixel, other.aim, predictPosition(c.pixel, route, delay, Math.max(0, other.cast.remaining - E.safetyTime))))) paths.push(route);
          else visit(cell, route);
        }
      };
      visit(c.position, []);
      const target = state.combatants.find(unit => unit.uid === c.currentTargetUid);
      const desired = c.plan?.desiredRangeCells ?? c.engagementRangeCells ?? 2.5;
      const score = (path: AimPoint[]) => path.length * 3 + (target ? Math.abs(distCells(path[path.length - 1]!, target.pixel) - desired) : 0);
      paths.sort((a, b) => score(a) - score(b));
      const path = paths[0];
      if (!path) continue;
      const [first, ...rest] = path;
      c.position = { ...first! }; c.moveCd = delay;
      this.escapes.set(c.uid, { caster: t.caster, cast: t.cast, path: rest });
      return true;
    }
    return false;
  }
}

/** 与引擎相同的连续脚点缓动，保守扣掉安全余量后判断能否离开。 */
function predictPosition(start: AimPoint, path: AimPoint[], delay: number, duration: number, firstSwitch = delay): AimPoint {
  const point = { ...start };
  for (let time = 0; time < duration; time += E.predictionTick) {
    const target = path[Math.min(path.length - 1, time < firstSwitch ? 0 : 1 + Math.floor((time - firstSwitch) / delay))]!;
    const k = 1 - Math.exp(-Math.min(E.predictionTick, duration - time) * 9);
    point.x += (target.x - point.x) * k; point.y += (target.y - point.y) * k;
  }
  return point;
}

function pathEnters(threat: Threat, from: AimPoint, to: AimPoint): boolean {
  const { skill, caster, aim } = threat, space = skill.space!;
  if (space.shape === 'burst' || space.shape === 'radial') {
    const center = space.shape === 'burst' ? aim : caster.pixel;
    const dx = to.x - from.x, dy = to.y - from.y;
    const t = Math.max(0, Math.min(1, ((center.x - from.x) * dx + (center.y - from.y) * dy) / (dx * dx + dy * dy || 1)));
    return skillCovers(skill, caster.pixel, aim, { x: from.x + dx * t, y: from.y + dy * t });
  }
  // 直线与扇形均为凸区域：裁剪完整线段，避免固定采样漏过窄范围。
  const dx = aim.x - caster.pixel.x, dy = aim.y - caster.pixel.y, length = Math.hypot(dx, dy);
  if (length < .001) return false;
  const project = (p: AimPoint) => ({ x: ((p.x - caster.pixel.x) * dx + (p.y - caster.pixel.y) * dy) / length, y: ((p.x - caster.pixel.x) * dy - (p.y - caster.pixel.y) * dx) / length });
  const a = project(from), b = project(to), reach = rangeInCells(skill), width = space.width ?? 1;
  const slope = space.shape === 'cone' ? width / reach : 0, base = space.shape === 'cone' ? .5 : width;
  let low = 0, high = 1;
  for (const [start, end] of [[-a.x, -b.x], [a.x - reach, b.x - reach], [a.y - slope * a.x - base, b.y - slope * b.x - base], [-a.y - slope * a.x - base, -b.y - slope * b.x - base]]) {
    if (start! > 0 && end! > 0) return false;
    if (start! <= 0 && end! <= 0) continue;
    const crossing = start! / (start! - end!);
    if (start! > 0) low = Math.max(low, crossing); else high = Math.min(high, crossing);
  }
  return low <= high;
}
