import type { BattleEnvironmentSpec } from '@pokemon-online/config';
import { BATTLE_FOOT_CONTACT } from '@pokemon-online/config';
import { Graphics, type Container } from 'pixi.js';
import type { BattleEffectPool } from './BattleEffectPool.ts';
import type { BattleStagePoint } from './battle-stage-layout.ts';
import { parseHexColor } from './pixi-color.ts';
import { movementPressurePlan, type MovementPressurePlan, type TerrainContactPlan } from './terrain-contact-plan.ts';
import { drawElementMotes } from './natural-effect-shapes.ts';

export interface TerrainFootprint {
  container: Container;
  x: number; y: number; width: number; height: number; scale: number; grounded: boolean;
}

/** Owns per-combatant terrain-contact state and its transient Pixi graphics. */
export class TerrainContactEffects {
  private readonly contactGraphics = new Map<string, Graphics>();
  private readonly contactPositions = new Map<string, BattleStagePoint>();
  private readonly contactCooldowns = new Map<string, number>();
  private readonly pressureCooldowns = new Map<string, number>();

  constructor(
    private readonly effectPool: BattleEffectPool,
    private readonly occlusionLayer: Container,
  ) {}

  update(uid: string, point: BattleStagePoint, plan: TerrainContactPlan, spec: BattleEnvironmentSpec, footprint?: TerrainFootprint): void {
    const previous = this.contactPositions.get(uid);
    this.contactPositions.set(uid, point);
    const travel = previous ? Math.hypot(point.x - previous.x, point.y - previous.y) : 0;
    const groundedStep = travel > 1.4;
    const pressure = movementPressurePlan();
    const moved = travel > pressure.minTravelPixels;
    if (moved && (this.pressureCooldowns.get(uid) ?? 0) <= 0 && previous) {
      this.spawnMovementPressure(point, { x: point.x - previous.x, y: point.y - previous.y }, pressure);
      this.pressureCooldowns.set(uid, pressure.intervalSeconds);
    }

    const existing = this.contactGraphics.get(uid);
    if (plan.occludesFeet && (footprint?.grounded ?? true)) {
      const graphic = existing ?? new Graphics();
      if (!existing) {
        this.contactGraphics.set(uid, graphic);
        (footprint?.container ?? this.occlusionLayer).addChild(graphic);
      }
      this.drawFootOcclusion(graphic, footprint ?? { ...point, width: 48, height: 7 }, spec);
    } else if (existing) {
      existing.destroy();
      this.contactGraphics.delete(uid);
    }

    const cooldown = this.contactCooldowns.get(uid) ?? 0;
    if (groundedStep && cooldown <= 0 && (footprint?.grounded ?? true)) {
      const at = footprint ? { x: point.x + footprint.x * footprint.scale, y: point.y + footprint.y * footprint.scale } : point;
      this.spawnTerrainContact(at, plan.particleKind, plan.particleBudget, spec);
      this.contactCooldowns.set(uid, 0.10);
    }
  }

  tick(dt: number): void {
    for (const cooldowns of [this.contactCooldowns, this.pressureCooldowns]) {
      for (const [uid, remaining] of cooldowns) {
        const next = Math.max(0, remaining - dt);
        if (next === 0) cooldowns.delete(uid);
        else cooldowns.set(uid, next);
      }
    }
  }

  remove(uid: string): void {
    this.contactPositions.delete(uid);
    this.contactCooldowns.delete(uid);
    this.pressureCooldowns.delete(uid);
    const graphic = this.contactGraphics.get(uid);
    graphic?.destroy();
    this.contactGraphics.delete(uid);
  }

  clear(): void {
    for (const graphic of this.contactGraphics.values()) graphic.destroy();
    this.contactGraphics.clear();
    this.contactPositions.clear();
    this.contactCooldowns.clear();
    this.pressureCooldowns.clear();
  }

  private drawFootOcclusion(graphic: Graphics, foot: Pick<TerrainFootprint, 'x' | 'y' | 'width' | 'height'>, spec: BattleEnvironmentSpec): void {
    const { groundDetail, ground } = spec.palette;
    graphic.clear();
    // Narrow irregular blades, in actor-local units. Parent depth/scale handles
    // perspective; there is no full-screen layer or movement-dependent height pop.
    for (let index = 0; index < BATTLE_FOOT_CONTACT.bladeCount; index++) {
      const site = (index + 0.5) / BATTLE_FOOT_CONTACT.bladeCount - 0.5;
      const x = foot.x + site * foot.width;
      const h = foot.height * (0.55 + (index * 7 % 5) * 0.11);
      const half = foot.width * 0.025;
      graphic.moveTo(x - half, foot.y + 1).quadraticCurveTo(x + half, foot.y - h * 0.45, x + (index % 2 ? -1 : 1) * half * 2, foot.y - h)
        .lineTo(x + half, foot.y + 1).fill({ color: index % 2 ? groundDetail : ground, alpha: BATTLE_FOOT_CONTACT.opacity });
    }
  }

  private spawnMovementPressure(at: BattleStagePoint, velocity: BattleStagePoint, plan: MovementPressurePlan): void {
    const length = Math.hypot(velocity.x, velocity.y);
    if (length < 0.001) return;
    const direction = { x: velocity.x / length, y: velocity.y / length };
    const normal = { x: -direction.y, y: direction.x };
    const graphic = new Graphics({ blendMode: 'add' });
    this.effectPool.add(graphic, plan.durationSeconds, (progress) => {
      const alpha = (1 - progress) * 0.30;
      graphic.clear();
      for (let index = 0; index < plan.lineCount; index++) {
        const side = (index - (plan.lineCount - 1) / 2) * 8;
        const lead = 28 + index * 9 + progress * 16;
        const start = { x: at.x + direction.x * lead + normal.x * side, y: at.y + direction.y * lead + normal.y * side };
        const end = { x: start.x - direction.x * (15 + index * 4), y: start.y - direction.y * (15 + index * 4) };
        graphic.moveTo(start.x, start.y).lineTo(end.x, end.y).stroke({ color: 0xdff7ff, alpha: alpha * (1 - index * 0.14), width: 1.5 + (index % 2) * 0.5 });
      }
    }, 'ground');
  }

  private spawnTerrainContact(at: BattleStagePoint, kind: TerrainContactPlan['particleKind'], budget: number, spec: BattleEnvironmentSpec): void {
    if (kind === 'none' || budget <= 0) return;
    const graphic = new Graphics({ blendMode: kind === 'dust' ? 'normal' : 'add' });
    const color = kind === 'ripples'
      ? parseHexColor(spec.palette.mote)
      : kind === 'runes'
        ? parseHexColor(spec.palette.accent)
        : parseHexColor(spec.palette.groundDetail);
    this.effectPool.add(graphic, kind === 'ripples' ? 0.34 : 0.24, (progress) => {
      graphic.clear();
      if (kind === 'ripples') {
        drawElementMotes(graphic, 'water-wave', at.x, at.y, progress, color, budget + 2, 15, 3);
        return;
      }
      for (let index = 0; index < budget; index++) {
        const direction = index - (budget - 1) / 2;
        const x = at.x + direction * 9 + progress * direction * 10;
        const y = at.y - progress * (12 + (index % 2) * 7);
        if (kind === 'runes') graphic.star(x, y, 4, 3.5, 1.4).fill({ color, alpha: (1 - progress) * 0.6 });
        else graphic.rect(x - 2, y - 2, 4, 4 + index % 2 * 2).fill({ color, alpha: (1 - progress) * 0.60 });
      }
    }, 'ground');
  }
}
