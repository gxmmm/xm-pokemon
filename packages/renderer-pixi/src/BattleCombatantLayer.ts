import { battleEnvironmentFor, resolveBattleArtPresentation, type BattleArtAnchorId } from '@pokemon-online/config';
import type { BattleCue, BattleRenderSnapshot } from '@pokemon-online/renderer';
import { Container } from 'pixi.js';
import { BattleArtAssetLoader } from './BattleArtAssets.ts';
import { battleWorldPositionFromGrid, projectBattleWorldPoint } from './battle-ground.ts';
import { BattlePositionTracker, type BattlePositionFrame } from './BattlePositionTracker.ts';
import { type BattleStagePoint as Point } from './battle-stage-layout.ts';
import { CombatantView } from './CombatantView.ts';
import { terrainContactPlan, type TerrainContactPlan } from './terrain-contact-plan.ts';
import { TerrainContactEffects } from './TerrainContactEffects.ts';

export interface BattleCombatantLayerDiagnostics {
  viewCount: number;
  positionCount: number;
  terrainPlanCount: number;
  childCount: number;
}

/** Owns the complete Pixi view lifecycle and projected position state for battle actors. */
export class BattleCombatantLayer {
  readonly container = new Container();
  private readonly views = new Map<string, CombatantView>();
  private readonly positions = new BattlePositionTracker();
  private readonly terrainPlans = new Map<string, TerrainContactPlan>();

  constructor(
    private readonly assets: BattleArtAssetLoader,
    private readonly terrainContacts: TerrainContactEffects,
  ) {
    this.container.sortableChildren = true;
  }

  get size(): number {
    return this.views.size;
  }

  applySnapshot(snapshot: BattleRenderSnapshot, biomeId: string): void {
    const active = new Set(snapshot.combatants.map((combatant) => combatant.uid));
    for (const uid of this.views.keys()) {
      if (!active.has(uid)) this.remove(uid);
    }

    const environment = battleEnvironmentFor(biomeId);
    for (const combatant of snapshot.combatants) {
      const visualCombatant = { ...combatant, stunActive: (combatant.flinchUntil ?? 0) > snapshot.time };
      const hasContinuousWorldPosition = visualCombatant.worldPosition !== undefined;
      const worldPosition = visualCombatant.worldPosition ?? battleWorldPositionFromGrid(visualCombatant.pixel.x, visualCombatant.pixel.y);
      const projection = projectBattleWorldPoint(worldPosition, environment.camera);
      const groundProjection = projectBattleWorldPoint({ ...worldPosition, z: 0 }, environment.camera);
      const plan = terrainContactPlan(
        environment.contactVisual,
        resolveBattleArtPresentation({ speciesId: combatant.speciesId, side: combatant.side, facing: combatant.facing }).profile.locomotionMode,
      );
      this.terrainPlans.set(combatant.uid, plan);

      let view = this.views.get(combatant.uid);
      const isNewView = !view;
      if (!view) {
        view = new CombatantView(visualCombatant, this.assets);
        this.views.set(combatant.uid, view);
        this.container.addChild(view);
      } else {
        view.refresh(visualCombatant);
      }

      const frame = this.positions.setTarget(combatant.uid, {
        point: { x: projection.x, y: projection.y },
        groundPoint: { x: groundProjection.x, y: groundProjection.y },
        scale: projection.scale,
        groundScale: groundProjection.scale,
      }, hasContinuousWorldPosition || isNewView);
      this.applyFrame(view, frame, plan);
      this.terrainContacts.update(combatant.uid, frame.groundPoint, plan, environment);
    }
  }

  update(positionDeltaSeconds: number, animationDeltaSeconds: number): void {
    for (const frame of this.positions.update(positionDeltaSeconds)) {
      const view = this.views.get(frame.uid);
      const plan = this.terrainPlans.get(frame.uid);
      if (view && plan) this.applyFrame(view, frame, plan);
    }
    if (animationDeltaSeconds > 0) {
      for (const view of this.views.values()) view.update(animationDeltaSeconds);
    }
  }

  getAnchorPosition(uid: string, anchor: BattleArtAnchorId): Point | undefined {
    return this.views.get(uid)?.getAnchorPosition(anchor);
  }

  getPosition(uid: string): Point | undefined {
    return this.positions.getPosition(uid);
  }

  playAnimation(cue: Extract<BattleCue, { type: 'animation' }>): void {
    const target = cue.targetIds?.map((id) => this.getPosition(id)).find((point): point is Point => !!point);
    this.views.get(cue.subjectId)?.playAnimation(
      cue.animation,
      cue.schedule,
      cue.durationMs,
      cue.actorChoreography,
      target,
      cue.element,
    );
  }

  isSettled(): boolean {
    return [...this.views.values()].every((view) => view.isSettled());
  }

  clear(): void {
    for (const uid of [...this.views.keys()]) this.remove(uid);
    this.positions.clear();
    this.terrainPlans.clear();
  }

  getDiagnostics(): BattleCombatantLayerDiagnostics {
    return {
      viewCount: this.views.size,
      positionCount: this.positions.size,
      terrainPlanCount: this.terrainPlans.size,
      childCount: this.container.children.length,
    };
  }

  private remove(uid: string): void {
    this.views.get(uid)?.destroy({ children: true });
    this.views.delete(uid);
    this.positions.remove(uid);
    this.terrainPlans.delete(uid);
    this.terrainContacts.remove(uid);
  }

  private applyFrame(view: CombatantView, frame: BattlePositionFrame, plan: TerrainContactPlan): void {
    view.position.set(frame.point.x, frame.point.y);
    view.scale.set(frame.scale);
    view.zIndex = frame.groundPoint.y;
    const safeScale = Math.max(0.001, frame.scale);
    view.setGrounding(
      { x: (frame.groundPoint.x - frame.point.x) / safeScale, y: (frame.groundPoint.y - frame.point.y) / safeScale },
      Math.max(0, frame.groundPoint.y - frame.point.y),
      plan.shadowAlphaMultiplier,
      plan.shadowScaleMultiplier * frame.groundScale / safeScale,
    );
  }
}
