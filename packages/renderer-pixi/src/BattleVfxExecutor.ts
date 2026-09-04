import type { BattleArtAnchorId, BattleEnvironmentSpec } from '@pokemon-online/config';
import { elementColor, type BattleStageVfxPlan } from './battle-plan.ts';
import { battleContactPoint } from './battle-ground.ts';
import type { BattleEffectPool } from './BattleEffectPool.ts';
import { BATTLE_DESIGN_HEIGHT, BATTLE_DESIGN_WIDTH, type BattleStagePoint as Point } from './battle-stage-layout.ts';
import { spawnBeam } from './beam-vfx.ts';
import { spawnEnvironmentReaction } from './environment-reaction-vfx.ts';
import { spawnBurst, spawnDive, spawnImpact } from './impact-vfx.ts';
import { spawnChainLightning, spawnSkyStrike } from './lightning-vfx.ts';
import { spawnProjectile } from './projectile-vfx.ts';
import { spawnRing } from './ring-vfx.ts';

type PositionResolver = (uid: string) => Point | undefined;

/** Resolves presentation anchors and dispatches already-planned Pixi VFX primitives. */
export class BattleVfxExecutor {
  constructor(
    private readonly effects: BattleEffectPool,
    private readonly resolvePosition: PositionResolver,
    private readonly resolveAnchor?: (uid: string, anchor: BattleArtAnchorId) => Point | undefined,
  ) {}

  spawnPlans(plans: readonly BattleStageVfxPlan[], environment: BattleEnvironmentSpec): number {
    let spawned = 0;
    for (const plan of plans) {
      // Explicit targets never fall back to a different actor or screen center.
      // Chain is one connected path; other primitives address each unique victim.
      const targetIds = [...new Set(plan.targetIds)].filter((uid) => !!this.resolvePosition(uid));
      if (plan.targetIds.length && !targetIds.length) continue;
      const resolved = plan.primitive === 'chain' || !targetIds.length
        ? [{ ...plan, targetIds }] : targetIds.map((uid) => ({ ...plan, targetIds: [uid] }));
      for (const targetPlan of resolved) if (this.spawnPlan(targetPlan, environment)) spawned++;
    }
    return spawned;
  }

  private spawnPlan(plan: BattleStageVfxPlan, environment: BattleEnvironmentSpec): boolean {
    const actor = plan.actorId ? this.resolvePosition(plan.actorId) : undefined;
    const targets = plan.targetIds.map(this.resolvePosition).filter((point): point is Point => !!point);
    const targetRoot = targets[0] ?? actor ?? { x: BATTLE_DESIGN_WIDTH / 2, y: BATTLE_DESIGN_HEIGHT * 0.58 };
    const target = actor ? battleContactPoint(targetRoot, actor) : { x: targetRoot.x, y: targetRoot.y - 30 };
    const color = elementColor(plan.element);
    const resolveSource = () => plan.actorId && plan.actorAnchor && this.resolveAnchor
      ? this.resolveAnchor(plan.actorId, plan.actorAnchor) : plan.actorId ? this.resolvePosition(plan.actorId) : undefined;

    switch (plan.primitive) {
      case 'projectile': {
        const source = resolveSource();
        if (!actor || !source) return false;
        spawnProjectile(this.effects, { ...source }, target, color, plan.intensity, plan.variant, plan.element);
        return true;
      }
      case 'sky-strike':
        spawnSkyStrike(this.effects, target, plan.intensity);
        return true;
      case 'chain':
        spawnChainLightning(this.effects, actor ?? target, targets.length > 0 ? targets : [target], plan.intensity);
        return true;
      case 'dive':
        if (!actor) return false;
        spawnDive(this.effects, actor, target, color, plan.intensity);
        return true;
      case 'beam': {
        const source = resolveSource();
        if (!actor || !source) return false;
        spawnBeam(this.effects, source, target, color, plan.intensity, plan.variant, plan.element, resolveSource);
        return true;
      }
      case 'burst':
        spawnBurst(this.effects, target, color, plan.intensity, plan.variant, plan.particleBudget, plan.element, plan.opacity);
        return true;
      case 'ring':
        spawnRing(this.effects, plan.layer === 'ground' ? targetRoot : target, color, plan.intensity, plan.variant, plan.element, plan.layer);
        return true;
      case 'environment':
        if (!plan.actorId && plan.targetIds.length === 0) return false;
        return spawnEnvironmentReaction(this.effects, environment, target, plan.reaction);
      case 'impact':
        spawnImpact(this.effects, target, color, plan.intensity, plan.variant);
        return true;
    }
  }
}
