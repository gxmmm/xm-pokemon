import { Container } from 'pixi.js';
import { SKILL_MAP, battleEnvironmentFor } from '@pokemon-online/config';
import type { BattleRenderSnapshot } from '@pokemon-online/renderer';
import { PixelGraphics } from './PixelGraphics.ts';
import { battleWorldPositionFromGrid, projectBattleWorldPoint } from './battle-ground.ts';
import { elementColor } from './battle-plan.ts';

/** 仅投影引擎锁定的范围；随快照清除，控制打断不会留下计时残影。 */
export class BattleCastZones {
  readonly container = new Container();
  private zones = new Map<string, { graphic: PixelGraphics; key: string }>();
  update(snapshot: BattleRenderSnapshot, biome: string): void {
    const active = new Set<string>();
    for (const actor of snapshot.combatants) {
      if (!actor.alive || !actor.castProgress || !actor.castAim) continue;
      const skill = SKILL_MAP[actor.castProgress.skillId], space = skill?.space;
      if (!space || space.shape === 'single') continue;
      active.add(actor.uid);
      const origin = actor.position, aim = actor.castAim;
      const key = JSON.stringify([biome, skill.id, origin, aim]);
      let entry = this.zones.get(actor.uid);
      if (entry?.key !== key) {
        entry?.graphic.destroy();
        const graphic = new PixelGraphics();
        const points: { x: number; y: number }[] = [];
        if (space.shape === 'burst' || space.shape === 'radial') {
          const center = space.shape === 'radial' ? origin : aim;
          for (let i = 0; i < 24; i++) {
            const angle = i * Math.PI / 12;
            points.push({ x: center.x + Math.cos(angle) * (space.radius ?? 3), y: center.y + Math.sin(angle) * (space.radius ?? 3) });
          }
        } else {
          const dx = aim.x - origin.x, dy = aim.y - origin.y, d = Math.max(.001, Math.hypot(dx, dy));
          const nx = dx / d, ny = dy / d;
          const start = space.shape === 'cone' ? .5 : space.width ?? 1;
          const end = space.shape === 'cone' ? .5 + (space.width ?? 1) : start;
          points.push({ x: origin.x - ny * start, y: origin.y + nx * start },
            { x: origin.x + nx * space.reach - ny * end, y: origin.y + ny * space.reach + nx * end },
            { x: origin.x + nx * space.reach + ny * end, y: origin.y + ny * space.reach - nx * end },
            { x: origin.x + ny * start, y: origin.y - nx * start });
        }
        const camera = battleEnvironmentFor(biome).camera;
        const screen = points.map(point => projectBattleWorldPoint(battleWorldPositionFromGrid(point.x, point.y), camera));
        const polygon: number[] = [];
        for (let i = 0; i < screen.length; i++) {
          const start = screen[i]!, end = screen[(i + 1) % screen.length]!;
          const steps = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / 12));
          for (let j = 0; j < steps; j++) {
            const x = Math.round((start.x + (end.x - start.x) * j / steps) / 4) * 4;
            const y = Math.round((start.y + (end.y - start.y) * j / steps) / 4) * 4;
            const nextX = Math.round((start.x + (end.x - start.x) * (j + 1) / steps) / 4) * 4;
            polygon.push(x, y, nextX, y);
          }
        }
        graphic.poly(polygon).fill({ color: elementColor(skill.type), alpha: .16 }).stroke({ color: elementColor(skill.type), width: 2, alpha: .45 });
        this.container.addChild(graphic); entry = { graphic, key }; this.zones.set(actor.uid, entry);
      }
      entry.graphic.alpha = .6 + .4 * (1 - actor.castProgress.remaining / Math.max(.01, skill.castTime ?? .35));
    }
    for (const [uid, entry] of this.zones) if (!active.has(uid)) { entry.graphic.destroy(); this.zones.delete(uid); }
  }
  clear(): void { for (const entry of this.zones.values()) entry.graphic.destroy(); this.zones.clear(); }
}
