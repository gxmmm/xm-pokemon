import { DEFAULT_VISUAL_RUNTIME_SETTINGS, type AssetKey, type BattleCue, type BattleRenderInput, type BattleRenderSnapshot, type BattleRenderer, type SceneTransitionRequest, type VisualRuntimeSettings } from '@pokemon-online/renderer';
import { BATTLE_ASSET_BY_ID, battleEnvironmentFor, resolveBattleArtPresentation } from '@pokemon-online/config';
import { Application, Container, Graphics, type Texture } from 'pixi.js';
import { elementColor, planBattleCue, type BattleStageVfxPlan } from './battle-plan.ts';
import { BattleArtAssetLoader } from './BattleArtAssets.ts';
import { BattleCameraController } from './BattleCameraController.ts';
import { BattleCueScheduler } from './BattleCueScheduler.ts';
import { BattleEnvironmentView } from './BattleEnvironmentView.ts';
import { BattlePositionTracker } from './BattlePositionTracker.ts';
import { battleContactPoint, battleWorldPositionFromGrid, projectBattleWorldPoint } from './battle-ground.ts';
import { terrainContactPlan, type TerrainContactPlan } from './terrain-contact-plan.ts';
import { CombatantView } from './CombatantView.ts';
import { BattleEffectPool } from './BattleEffectPool.ts';
import { BATTLE_DESIGN_HEIGHT as DESIGN_HEIGHT, BATTLE_DESIGN_WIDTH as DESIGN_WIDTH, type BattleStagePoint as Point } from './battle-stage-layout.ts';
import { spawnBeam } from './beam-vfx.ts';
import { DrawCallObserver } from './draw-call-observer.ts';
import { spawnEnvironmentReaction } from './environment-reaction-vfx.ts';
import { spawnBurst, spawnDive, spawnImpact } from './impact-vfx.ts';
import { spawnChainLightning, spawnSkyStrike } from './lightning-vfx.ts';
import { spawnProjectile } from './projectile-vfx.ts';
import { spawnRing } from './ring-vfx.ts';
import { TerrainContactEffects } from './TerrainContactEffects.ts';

export interface BattleStageDiagnostics {
  biomeId: string;
  combatantCount: number;
  activeEffectCount: number;
  environmentChildCount: number;
  effectChildCount: number;
  totalChildCount: number;
  canvasCount: number;
  canvasPixels: number;
  drawCallTotal: number;
  drawCallsSinceLastSample: number;
}

/** Minimal Stage-3 Pixi battle runtime. It consumes renderer contracts only;
 * engine simulation, Vue HUD, and BattleDirector stay outside this package. */
export class BattleStage implements BattleRenderer {
  private app: Application | null = null;
  private root: Container | null = null;
  private readonly camera = new BattleCameraController();
  private readonly cueScheduler = new BattleCueScheduler();
  private readonly environmentView = new BattleEnvironmentView();
  private combatants = new Container();
  private readonly effectPool = new BattleEffectPool();
  private readonly terrainContacts = new TerrainContactEffects(this.effectPool, this.environmentView.terrainOcclusion);
  private overlay = new Container();
  private views = new Map<string, CombatantView>();
  private readonly battleArtAssets = new BattleArtAssetLoader();
  private readonly positionTracker = new BattlePositionTracker();
  private environmentBackgroundTexture: Texture | null = null;
  private terrainContactPlans = new Map<string, TerrainContactPlan>();
  private resizeObserver: ResizeObserver | null = null;
  private mountedContainer: HTMLElement | null = null;
  private biomeId = 'grass';
  private transitionLayer: Graphics | null = null;
  private drawCallObserver: DrawCallObserver | null = null;
  private visualSettings: VisualRuntimeSettings = { ...DEFAULT_VISUAL_RUNTIME_SETTINGS };

  async mount(container: HTMLElement): Promise<void> {
    this.unmount();
    this.mountedContainer = container;
    const app = new Application();
    await app.init({
      width: DESIGN_WIDTH,
      height: DESIGN_HEIGHT,
      background: '#10213a',
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      preference: 'webgl',
    });
    app.canvas.style.cssText = 'display:block;width:100%;height:100%;';
    container.replaceChildren(app.canvas);
    this.app = app;
    this.drawCallObserver = new DrawCallObserver((app.renderer as unknown as { gl?: WebGLRenderingContext }).gl ?? null);
    this.installStage();
    this.resizeToContainer();
    this.resizeObserver = new ResizeObserver(() => this.resizeToContainer());
    this.resizeObserver.observe(container);
    app.ticker.add((ticker) => this.update(Math.min(0.05, ticker.deltaTime / 60)));
  }

  unmount(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.effectPool.clear();
    this.cueScheduler.clear();
    this.views.clear();
    this.positionTracker.clear();
    this.terrainContactPlans.clear();
    this.terrainContacts.clear();
    this.camera.reset();
    this.environmentView.clear();
    this.battleArtAssets.clear();
    this.environmentBackgroundTexture = null;
    this.drawCallObserver?.destroy();
    this.drawCallObserver = null;
    this.app?.destroy(true, { children: true, texture: true, textureSource: true });
    this.app = null;
    this.root = null;
    this.transitionLayer = null;
    this.mountedContainer?.replaceChildren();
    this.mountedContainer = null;
  }

  setVisualSettings(settings?: VisualRuntimeSettings): void {
    this.visualSettings = { ...DEFAULT_VISUAL_RUNTIME_SETTINGS, ...settings };
    this.effectPool.setReduceFlicker(this.visualSettings.reduceFlicker);
    this.camera.setIntensity(this.visualSettings.cameraIntensity);
  }

  getDiagnostics(): BattleStageDiagnostics {
    const canvas = this.app?.canvas;
    const drawCalls = this.drawCallObserver?.read() ?? { total: 0, sinceLastRead: 0 };
    return {
      biomeId: this.biomeId,
      combatantCount: this.views.size,
      activeEffectCount: this.effectPool.activeCount,
      environmentChildCount: this.environmentView.childCount,
      effectChildCount: this.effectPool.container.children.length,
      totalChildCount: this.environmentView.childCount + this.combatants.children.length + this.effectPool.container.children.length + this.overlay.children.length,
      canvasCount: canvas ? 1 : 0,
      canvasPixels: canvas ? canvas.width * canvas.height : 0,
      drawCallTotal: drawCalls.total,
      drawCallsSinceLastSample: drawCalls.sinceLastRead,
    };
  }

  async preload(keys: readonly AssetKey[]): Promise<void> {
    const entries = keys
      .map((key) => BATTLE_ASSET_BY_ID[String(key)])
      .filter((entry): entry is NonNullable<typeof entry> => !!entry);
    await this.battleArtAssets.preload(entries);
  }

  async transition(request: SceneTransitionRequest): Promise<void> {
    await this.animateTransitionOverlay(
      request.color ?? '#08101d',
      request.kind === 'biome-crossfade' ? 0.82 : 0.68,
      request.durationMs ?? 260,
    );
  }

  private async animateTransitionOverlay(color: string, peakAlpha: number, durationMs: number): Promise<void> {
    const overlay = this.transitionLayer;
    if (!overlay) return;
    const startedAt = performance.now();
    await new Promise<void>((resolve) => {
      const draw = (now: number): void => {
        const progress = Math.min(1, (now - startedAt) / Math.max(1, durationMs));
        const alpha = Math.min(this.visualSettings.reduceFlicker ? 0.32 : peakAlpha, peakAlpha) * Math.sin(progress * Math.PI);
        overlay.clear().rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT).fill({ color, alpha });
        if (progress < 1) requestAnimationFrame(draw);
        else { overlay.clear(); resolve(); }
      };
      requestAnimationFrame(draw);
    });
  }

  async enterBattle(input: BattleRenderInput): Promise<void> {
    this.biomeId = input.biomeId;
    const entries = input.combatants.map((combatant) => resolveBattleArtPresentation({ speciesId: combatant.speciesId, side: combatant.side, facing: combatant.facing }).asset);
    const spec = battleEnvironmentFor(input.biomeId);
    const environmentEntry = spec.art ? BATTLE_ASSET_BY_ID[spec.art.backgroundAssetId] : undefined;
    const [environmentTexture] = await Promise.all([
      environmentEntry ? this.battleArtAssets.load(environmentEntry) : Promise.resolve(null),
      this.battleArtAssets.preload(entries),
    ]);
    this.environmentBackgroundTexture = environmentTexture;
    this.drawEnvironment();
    this.applyBattleSnapshot({ time: 0, combatants: input.combatants });
  }

  applyBattleSnapshot(snapshot: BattleRenderSnapshot): void {
    const active = new Set(snapshot.combatants.map((combatant) => combatant.uid));
    for (const [uid, view] of this.views) {
      if (!active.has(uid)) {
        view.destroy();
        this.views.delete(uid);
        this.positionTracker.remove(uid);
        this.terrainContactPlans.delete(uid);
        this.terrainContacts.remove(uid);
      }
    }
    for (const combatant of snapshot.combatants) {
      const visualCombatant = { ...combatant, stunActive: (combatant.flinchUntil ?? 0) > snapshot.time };
      const spec = battleEnvironmentFor(this.biomeId);
      const hasContinuousWorldPosition = visualCombatant.worldPosition !== undefined;
      const worldPosition = visualCombatant.worldPosition ?? battleWorldPositionFromGrid(visualCombatant.pixel.x, visualCombatant.pixel.y);
      const projection = projectBattleWorldPoint(worldPosition, spec.camera);
      const groundProjection = projectBattleWorldPoint({ ...worldPosition, z: 0 }, spec.camera);
      const point = { x: projection.x, y: projection.y };
      const groundPoint = { x: groundProjection.x, y: groundProjection.y };
      const profile = resolveBattleArtPresentation({ speciesId: combatant.speciesId, side: combatant.side, facing: combatant.facing }).profile;
      const contactPlan = terrainContactPlan(spec.contactVisual, profile.locomotionMode);
      this.terrainContactPlans.set(visualCombatant.uid, contactPlan);
      let view = this.views.get(visualCombatant.uid);
      const isNewView = !view;
      if (!view) {
        view = new CombatantView(visualCombatant, this.battleArtAssets);
        this.views.set(combatant.uid, view);
        this.combatants.addChild(view);
      } else {
        view.refresh(visualCombatant);
      }
      // Presentation-owned world positions are already continuously
      // interpolated, so they bypass the legacy pixel spring. Engine
      // castProgress remains the only authoritative movement lock;
      // CombatantView adds action offsets locally.
      const frame = this.positionTracker.setTarget(visualCombatant.uid, {
        point,
        groundPoint,
        scale: projection.scale,
        groundScale: groundProjection.scale,
      }, hasContinuousWorldPosition || isNewView);
      view.position.set(frame.point.x, frame.point.y);
      view.scale.set(frame.scale);
      view.zIndex = frame.groundPoint.y;
      this.updateViewGrounding(view, frame.point, frame.groundPoint, frame.scale, frame.groundScale, contactPlan);
      this.terrainContacts.update(combatant.uid, frame.groundPoint, contactPlan, spec);
    }
  }

  private updateViewGrounding(view: CombatantView, point: Point, groundPoint: Point, scale: number, groundScale: number, plan: TerrainContactPlan): void {
    const safeScale = Math.max(0.001, scale);
    view.setGrounding(
      { x: (groundPoint.x - point.x) / safeScale, y: (groundPoint.y - point.y) / safeScale },
      Math.max(0, groundPoint.y - point.y),
      plan.shadowAlphaMultiplier,
      plan.shadowScaleMultiplier * groundScale / safeScale,
    );
  }

  async playBattleCues(cues: readonly BattleCue[]): Promise<void> {
    for (const cue of cues) {
      const ready = this.cueScheduler.accept(cue);
      if (ready) this.playReadyCue(ready);
    }
  }

  isSettled(): boolean {
    return this.effectPool.activeCount === 0 && this.cueScheduler.isSettled && [...this.views.values()].every((view) => view.isSettled());
  }

  private installStage(): void {
    if (!this.app) return;
    this.root = new Container();
    this.app.stage.addChild(this.root);
    this.combatants.sortableChildren = true;
    this.root.addChild(
      this.environmentView.background,
      this.environmentView.farBackdrop,
      this.environmentView.horizonLayer,
      this.environmentView.groundLayer,
      this.combatants,
      this.environmentView.terrainOcclusion,
      this.environmentView.foreground,
      this.effectPool.container,
      this.overlay,
    );
    this.transitionLayer = new Graphics();
    this.overlay.addChild(this.transitionLayer);
    this.drawEnvironment();
  }

  private drawEnvironment(): void {
    this.terrainContacts.clear();
    this.environmentView.draw(battleEnvironmentFor(this.biomeId), this.environmentBackgroundTexture);
  }

  private focusCamera(ids: readonly string[], zoom: number, shake: number): void {
    const points = ids.map((id) => this.positionTracker.getPosition(id)).filter((point): point is Point => !!point);
    this.camera.focus(points, battleEnvironmentFor(this.biomeId).camera, zoom, shake);
  }

  private playAnimationCue(cue: Extract<BattleCue, { type: 'animation' }>): void {
    const target = cue.targetIds?.map((id) => this.positionTracker.getPosition(id)).find((point): point is Point => !!point);
    this.views.get(cue.subjectId)?.playAnimation(
      cue.animation,
      cue.schedule,
      cue.durationMs,
      cue.actorChoreography,
      target,
      cue.element,
    );
  }

  private spawnPlan(plan: BattleStageVfxPlan): void {
    const actor = plan.actorId ? this.positionTracker.getPosition(plan.actorId) : undefined;
    const targetRoot = plan.targetIds.map((id) => this.positionTracker.getPosition(id)).find((point): point is Point => !!point) ?? actor ?? { x: DESIGN_WIDTH / 2, y: DESIGN_HEIGHT * 0.58 };
    const target = actor ? battleContactPoint(targetRoot, actor) : { x: targetRoot.x, y: targetRoot.y - 30 };
    const color = elementColor(plan.element);
    if (plan.primitive === 'projectile' && actor) {
      spawnProjectile(this.effectPool, actor, target, color, plan.intensity, plan.variant, plan.element);
    } else if (plan.primitive === 'sky-strike') {
      spawnSkyStrike(this.effectPool, target, plan.intensity);
    } else if (plan.primitive === 'chain') {
      const chainTargets = plan.targetIds.map((id) => this.positionTracker.getPosition(id)).filter((point): point is Point => !!point);
      spawnChainLightning(this.effectPool, actor ?? target, chainTargets.length > 0 ? chainTargets : [target], plan.intensity);
    } else if (plan.primitive === 'dive' && actor) {
      spawnDive(this.effectPool, actor, target, color, plan.intensity);
    } else if (plan.primitive === 'beam' && actor) {
      spawnBeam(this.effectPool, actor, target, color, plan.intensity, plan.variant, plan.element);
    } else if (plan.primitive === 'burst') {
      spawnBurst(this.effectPool, target, color, plan.intensity, plan.variant, plan.particleBudget, plan.element);
    } else if (plan.primitive === 'ring') {
      spawnRing(this.effectPool, target, color, plan.intensity, plan.variant, plan.element);
    } else if (plan.primitive === 'environment') {
      if (plan.actorId || plan.targetIds.length > 0) spawnEnvironmentReaction(this.effectPool, battleEnvironmentFor(this.biomeId), target, plan.reaction);
    } else {
      spawnImpact(this.effectPool, target, color, plan.intensity, plan.variant);
    }
  }

  private playReadyCue(cue: BattleCue): void {
    if (cue.type === 'camera') {
      this.focusCamera(cue.plan.focusIds, cue.plan.zoom ?? 1, cue.plan.shake ?? 0);
    } else if (cue.type === 'animation') {
      this.playAnimationCue(cue);
    } else if (cue.type === 'vfx' || cue.type === 'environment') {
      for (const plan of planBattleCue(cue)) this.spawnPlan(plan);
    }
  }

  private update(dt: number): void {
    const { clockSeconds: clock, due } = this.cueScheduler.advance(dt);
    this.terrainContacts.tick(dt);
    // One coherent state record keeps projected body/ground anchors,
    // velocities, and scales synchronized throughout redirected movement.
    for (const frame of this.positionTracker.update(dt)) {
      const view = this.views.get(frame.uid);
      if (!view) continue;
      view.position.set(frame.point.x, frame.point.y);
      view.scale.set(frame.scale);
      view.zIndex = frame.groundPoint.y;
      const plan = this.terrainContactPlans.get(frame.uid);
      if (plan) this.updateViewGrounding(view, frame.point, frame.groundPoint, frame.scale, frame.groundScale, plan);
    }
    const spec = battleEnvironmentFor(this.biomeId);
    this.camera.update(dt, [
      { layer: this.environmentView.background, factor: 0, shake: false },
      { layer: this.environmentView.farBackdrop, factor: spec.parallax.far, shake: false },
      { layer: this.environmentView.horizonLayer, factor: spec.parallax.horizon, shake: false },
      { layer: this.environmentView.groundLayer, factor: spec.parallax.ground, shake: true },
      { layer: this.combatants, factor: 1, shake: true },
      { layer: this.environmentView.terrainOcclusion, factor: 1, shake: true },
      { layer: this.environmentView.foreground, factor: spec.parallax.foreground, shake: false },
      { layer: this.effectPool.container, factor: 1, shake: true },
    ]);
    if (!clock) return;
    for (const view of this.views.values()) view.update(clock);
    for (const cue of due) this.playReadyCue(cue);
    this.effectPool.update(clock);
  }

  private resizeToContainer(): void {
    if (!this.app || !this.root || !this.mountedContainer) return;
    const width = Math.max(1, this.mountedContainer.clientWidth);
    const height = Math.max(1, this.mountedContainer.clientHeight);
    this.app.renderer.resize(width, height);
    // Cover the viewport rather than letterboxing the battlefield. The outer
    // edges are deliberately cropped on unusually narrow/tall hosts so the
    // arena reads as a full combat scene instead of a floating small canvas.
    const scale = Math.max(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
    this.root.scale.set(scale);
    this.root.position.set((width - DESIGN_WIDTH * scale) / 2, (height - DESIGN_HEIGHT * scale) / 2);
  }
}
