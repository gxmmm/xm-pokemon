import type { BattleEnvironmentSpec } from '@pokemon-online/config';
import { Graphics, type Container } from 'pixi.js';
import type { BattleEffectPool } from './BattleEffectPool.ts';
import type { BattleStagePoint } from './battle-stage-layout.ts';
import { parseHexColor } from './pixi-color.ts';
import { movementPressurePlan, type MovementPressurePlan, type TerrainContactPlan } from './terrain-contact-plan.ts';

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

  update(uid: string, point: BattleStagePoint, plan: TerrainContactPlan, spec: BattleEnvironmentSpec): void {
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
    if (plan.occludesFeet) {
      const graphic = existing ?? new Graphics();
      if (!existing) {
        this.contactGraphics.set(uid, graphic);
        this.occlusionLayer.addChild(graphic);
      }
      this.drawFootOcclusion(graphic, point, spec, groundedStep ? 3 : 0);
    } else if (existing) {
      existing.destroy();
      this.contactGraphics.delete(uid);
    }

    const cooldown = this.contactCooldowns.get(uid) ?? 0;
    if (groundedStep && cooldown <= 0) {
      this.spawnTerrainContact(point, plan.particleKind, plan.particleBudget, spec);
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

  private drawFootOcclusion(graphic: Graphics, point: BattleStagePoint, spec: BattleEnvironmentSpec, sway: number): void {
    const { groundDetail, accent } = spec.palette;
    graphic.clear();
    // Small local clumps live above characters, never a global overlay. Their
    // baseline follows each projected unit root, preserving combat readability.
    for (let index = 0; index < 5; index++) {
      const x = point.x + (index - 2) * 9;
      const h = 9 + (index % 3) * 3 + (index === 2 ? sway : 0);
      graphic.moveTo(x - 3, point.y + 18).lineTo(x + (index - 2) * 1.4, point.y + 18 - h).lineTo(x + 4, point.y + 18)
        .fill({ color: index % 2 ? groundDetail : accent, alpha: 0.46 });
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
    });
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
        graphic.ellipse(at.x, at.y + 19, 13 + progress * 24, 3 + progress * 5).stroke({ color, alpha: (1 - progress) * 0.58, width: 2 });
        return;
      }
      for (let index = 0; index < budget; index++) {
        const direction = index - (budget - 1) / 2;
        const x = at.x + direction * 9 + progress * direction * 10;
        const y = at.y + 19 - progress * (12 + (index % 2) * 7);
        if (kind === 'runes') graphic.star(x, y, 4, 3.5, 1.4).fill({ color, alpha: (1 - progress) * 0.6 });
        else graphic.rect(x - 2, y - 2, 4, 4 + index % 2 * 2).fill({ color, alpha: (1 - progress) * 0.60 });
      }
    });
  }
}
