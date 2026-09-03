import { DEFAULT_VISUAL_RUNTIME_SETTINGS, type AssetKey, type BattleCue, type BattleRenderInput, type BattleRenderSnapshot, type BattleRenderer, type SceneTransitionRequest, type VisualRuntimeSettings } from '@pokemon-online/renderer';
import { BATTLE_ASSET_BY_ID, battleEnvironmentFor, resolveBattleArtPresentation } from '@pokemon-online/config';
import { Application, Container, Graphics, type Texture } from 'pixi.js';
import { elementColor, planBattleCue, type BattleStageVfxPlan } from './battle-plan.ts';
import { smoothBattlePresentationAxis } from './battle-motion.ts';
import { BattleArtAssetLoader } from './BattleArtAssets.ts';
import { BattleEnvironmentView } from './BattleEnvironmentView.ts';
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

interface DelayedBattleCue { cue: BattleCue; remaining: number; }

/** Minimal Stage-3 Pixi battle runtime. It consumes renderer contracts only;
 * engine simulation, Vue HUD, and BattleDirector stay outside this package. */
export class BattleStage implements BattleRenderer {
  private app: Application | null = null;
  private root: Container | null = null;
  private readonly environmentView = new BattleEnvironmentView();
  private combatants = new Container();
  private readonly effectPool = new BattleEffectPool();
  private readonly terrainContacts = new TerrainContactEffects(this.effectPool, this.environmentView.terrainOcclusion);
  private overlay = new Container();
  private views = new Map<string, CombatantView>();
  private readonly battleArtAssets = new BattleArtAssetLoader();
  private environmentBackgroundTexture: Texture | null = null;
  private positions = new Map<string, Point>();
  private targetPositions = new Map<string, Point>();
  private positionVelocities = new Map<string, Point>();
  private groundPositions = new Map<string, Point>();
  private targetGroundPositions = new Map<string, Point>();
  private groundPositionVelocities = new Map<string, Point>();
  private visualScales = new Map<string, number>();
  private targetScales = new Map<string, number>();
  private groundScales = new Map<string, number>();
  private targetGroundScales = new Map<string, number>();
  private terrainContactPlans = new Map<string, TerrainContactPlan>();
  private delayedCues: DelayedBattleCue[] = [];
  private resizeObserver: ResizeObserver | null = null;
  private mountedContainer: HTMLElement | null = null;
  private biomeId = 'grass';
  private cameraScale = 1;
  private cameraOffset: Point = { x: 0, y: 0 };
  private cameraTargetScale = 1;
  private cameraTargetOffset: Point = { x: 0, y: 0 };
  private cameraShake = 0;
  private hitStopSeconds = 0;
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
    this.delayedCues = [];
    this.views.clear();
    this.positions.clear();
    this.targetPositions.clear();
    this.positionVelocities.clear();
    this.groundPositions.clear();
    this.targetGroundPositions.clear();
    this.groundPositionVelocities.clear();
    this.visualScales.clear();
    this.targetScales.clear();
    this.groundScales.clear();
    this.targetGroundScales.clear();
    this.terrainContactPlans.clear();
    this.terrainContacts.clear();
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
    if (this.visualSettings.cameraIntensity === 'off') {
      this.cameraTargetScale = 1;
      this.cameraTargetOffset = { x: 0, y: 0 };
      this.cameraShake = 0;
    }
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
        this.positions.delete(uid);
        this.targetPositions.delete(uid);
        this.positionVelocities.delete(uid);
        this.groundPositions.delete(uid);
        this.targetGroundPositions.delete(uid);
        this.groundPositionVelocities.delete(uid);
        this.visualScales.delete(uid);
        this.targetScales.delete(uid);
        this.groundScales.delete(uid);
        this.targetGroundScales.delete(uid);
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
      this.targetPositions.set(visualCombatant.uid, point);
      this.targetGroundPositions.set(visualCombatant.uid, groundPoint);
      this.targetScales.set(visualCombatant.uid, projection.scale);
      this.targetGroundScales.set(visualCombatant.uid, groundProjection.scale);
      const profile = resolveBattleArtPresentation({ speciesId: combatant.speciesId, side: combatant.side, facing: combatant.facing }).profile;
      const contactPlan = terrainContactPlan(spec.contactVisual, profile.locomotionMode);
      this.terrainContactPlans.set(visualCombatant.uid, contactPlan);
      if (hasContinuousWorldPosition) {
        this.positions.set(visualCombatant.uid, { ...point });
        this.positionVelocities.set(visualCombatant.uid, { x: 0, y: 0 });
        this.groundPositions.set(visualCombatant.uid, { ...groundPoint });
        this.groundPositionVelocities.set(visualCombatant.uid, { x: 0, y: 0 });
        this.visualScales.set(visualCombatant.uid, projection.scale);
        this.groundScales.set(visualCombatant.uid, groundProjection.scale);
      }
      let view = this.views.get(visualCombatant.uid);
      if (!view) {
        view = new CombatantView(visualCombatant, this.battleArtAssets);
        this.views.set(combatant.uid, view);
        this.combatants.addChild(view);
        this.positions.set(visualCombatant.uid, point);
        this.positionVelocities.set(visualCombatant.uid, { x: 0, y: 0 });
        this.groundPositions.set(visualCombatant.uid, groundPoint);
        this.groundPositionVelocities.set(visualCombatant.uid, { x: 0, y: 0 });
        this.visualScales.set(visualCombatant.uid, projection.scale);
        this.groundScales.set(visualCombatant.uid, groundProjection.scale);
      } else {
        view.refresh(visualCombatant);
      }
      // Presentation-owned world positions are already continuously
      // interpolated, so they bypass the legacy pixel spring. Engine
      // castProgress remains the only authoritative movement lock;
      // CombatantView adds action offsets locally.
      const visiblePoint = this.positions.get(visualCombatant.uid) ?? point;
      const visibleGroundPoint = this.groundPositions.get(visualCombatant.uid) ?? groundPoint;
      const visibleScale = this.visualScales.get(visualCombatant.uid) ?? projection.scale;
      view.position.set(visiblePoint.x, visiblePoint.y);
      view.scale.set(visibleScale);
      view.zIndex = visibleGroundPoint.y;
      this.updateViewGrounding(view, visiblePoint, visibleGroundPoint, visibleScale, this.groundScales.get(visualCombatant.uid) ?? groundProjection.scale, contactPlan);
      this.terrainContacts.update(combatant.uid, visibleGroundPoint, contactPlan, spec);
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
      if (cue.type === 'camera') {
        this.aimCamera(cue.plan.focusIds, cue.plan.zoom ?? 1, cue.plan.shake ?? 0);
      } else if (cue.type === 'animation' && (cue.delayMs ?? 0) > 0) {
        this.delayedCues.push({ cue, remaining: (cue.delayMs ?? 0) / 1000 });
      } else if (cue.type === 'animation') {
        this.playAnimationCue(cue);
      } else if (cue.type === 'hit-stop') {
        this.hitStopSeconds = Math.max(this.hitStopSeconds, cue.milliseconds / 1000);
      } else if (cue.type === 'vfx' && (cue.delayMs ?? 0) > 0) {
        this.delayedCues.push({ cue, remaining: (cue.delayMs ?? 0) / 1000 });
      } else if (cue.type === 'vfx' || cue.type === 'environment') {
        for (const plan of planBattleCue(cue)) this.spawnPlan(plan);
      }
    }
  }

  isSettled(): boolean {
    return this.effectPool.activeCount === 0 && this.delayedCues.length === 0 && this.hitStopSeconds <= 0.001 && [...this.views.values()].every((view) => view.isSettled());
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
  private aimCamera(ids: readonly string[], zoom: number, shake: number): void {
    // Spectator framing: ordinary exchanges remain stable, while a configured
    // track/impact/finisher cue may gently center the participating pair. The
    // bounded offset keeps a 3v3 board legible instead of turning every skill
    // into a disorienting close-up.
    const intensity = this.cameraIntensityFactor();
    const camera = battleEnvironmentFor(this.biomeId).camera;
    const decisiveZoom = Math.max(camera.framing.minZoom, Math.min(camera.framing.maxZoom, zoom));
    const points = ids.map((id) => this.positions.get(id)).filter((point): point is Point => !!point);
    const center = points.length
      ? { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length }
      : { x: DESIGN_WIDTH / 2, y: DESIGN_HEIGHT / 2 };
    const rawOffset = {
      x: Math.max(-camera.framing.maxPanX, Math.min(camera.framing.maxPanX, (DESIGN_WIDTH / 2 - center.x) * 0.18)),
      y: Math.max(-camera.framing.maxPanY, Math.min(camera.framing.maxPanY, (DESIGN_HEIGHT * camera.framing.focusY - center.y) * 0.14)),
    };
    this.cameraTargetOffset = { x: rawOffset.x * intensity, y: rawOffset.y * intensity };
    this.cameraTargetScale = 1 + (decisiveZoom - 1) * intensity;
    this.cameraShake = Math.max(this.cameraShake, Math.min(2.5, shake * 2.5) * intensity);
  }

  private cameraIntensityFactor(): number {
    return this.visualSettings.cameraIntensity === 'full' ? 1 : this.visualSettings.cameraIntensity === 'reduced' ? 0.45 : 0;
  }

  private playAnimationCue(cue: Extract<BattleCue, { type: 'animation' }>): void {
    const target = cue.targetIds?.map((id) => this.positions.get(id)).find((point): point is Point => !!point);
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
    const actor = plan.actorId ? this.positions.get(plan.actorId) : undefined;
    const targetRoot = plan.targetIds.map((id) => this.positions.get(id)).find((point): point is Point => !!point) ?? actor ?? { x: DESIGN_WIDTH / 2, y: DESIGN_HEIGHT * 0.58 };
    const target = actor ? battleContactPoint(targetRoot, actor) : { x: targetRoot.x, y: targetRoot.y - 30 };
    const color = elementColor(plan.element);
    if (plan.primitive === 'projectile' && actor) {
      spawnProjectile(this.effectPool, actor, target, color, plan.intensity, plan.variant, plan.element);
    } else if (plan.primitive === 'sky-strike') {
      spawnSkyStrike(this.effectPool, target, plan.intensity);
    } else if (plan.primitive === 'chain') {
      const chainTargets = plan.targetIds.map((id) => this.positions.get(id)).filter((point): point is Point => !!point);
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

  private update(dt: number): void {
    const clock = this.hitStopSeconds > 0 ? 0 : dt;
    this.hitStopSeconds = Math.max(0, this.hitStopSeconds - dt);
    this.terrainContacts.tick(dt);
    // A critically damped presentation spring retains velocity across target
    // changes. Diagonal and redirected steps therefore bend naturally instead
    // of restarting as isolated cell-to-cell lerps. Engine occupancy remains
    // authoritative and all VFX/camera anchors use the same visible position.
    const positionBlend = 1 - Math.exp(-dt * 12);
    for (const [uid, target] of this.targetPositions) {
      const visible = this.positions.get(uid) ?? { ...target };
      const velocity = this.positionVelocities.get(uid) ?? { x: 0, y: 0 };
      const horizontal = smoothBattlePresentationAxis(visible.x, target.x, velocity.x, 0.11, dt);
      const vertical = smoothBattlePresentationAxis(visible.y, target.y, velocity.y, 0.13, dt);
      visible.x = horizontal.value;
      visible.y = vertical.value;
      velocity.x = horizontal.velocity;
      velocity.y = vertical.velocity;
      this.positions.set(uid, visible);
      this.positionVelocities.set(uid, velocity);
      const groundTarget = this.targetGroundPositions.get(uid) ?? target;
      const visibleGround = this.groundPositions.get(uid) ?? { ...groundTarget };
      const groundVelocity = this.groundPositionVelocities.get(uid) ?? { x: 0, y: 0 };
      const groundHorizontal = smoothBattlePresentationAxis(visibleGround.x, groundTarget.x, groundVelocity.x, 0.11, dt);
      const groundVertical = smoothBattlePresentationAxis(visibleGround.y, groundTarget.y, groundVelocity.y, 0.13, dt);
      visibleGround.x = groundHorizontal.value;
      visibleGround.y = groundVertical.value;
      groundVelocity.x = groundHorizontal.velocity;
      groundVelocity.y = groundVertical.velocity;
      this.groundPositions.set(uid, visibleGround);
      this.groundPositionVelocities.set(uid, groundVelocity);
      const targetScale = this.targetScales.get(uid) ?? 1;
      const visibleScale = (this.visualScales.get(uid) ?? targetScale) + (targetScale - (this.visualScales.get(uid) ?? targetScale)) * positionBlend;
      this.visualScales.set(uid, visibleScale);
      const targetGroundScale = this.targetGroundScales.get(uid) ?? targetScale;
      const visibleGroundScale = (this.groundScales.get(uid) ?? targetGroundScale) + (targetGroundScale - (this.groundScales.get(uid) ?? targetGroundScale)) * positionBlend;
      this.groundScales.set(uid, visibleGroundScale);
      const view = this.views.get(uid);
      if (view) {
        view.position.set(visible.x, visible.y);
        view.scale.set(visibleScale);
        view.zIndex = visibleGround.y;
        const plan = this.terrainContactPlans.get(uid);
        if (plan) this.updateViewGrounding(view, visible, visibleGround, visibleScale, visibleGroundScale, plan);
      }
    }
    this.cameraScale += (this.cameraTargetScale - this.cameraScale) * Math.min(1, dt * 8);
    this.cameraOffset.x += (this.cameraTargetOffset.x - this.cameraOffset.x) * Math.min(1, dt * 7);
    this.cameraOffset.y += (this.cameraTargetOffset.y - this.cameraOffset.y) * Math.min(1, dt * 7);
    this.cameraShake = Math.max(0, this.cameraShake - dt * 30);
    const shakeX = this.cameraShake ? Math.sin(performance.now() * 0.05) * this.cameraShake : 0;
    const shakeY = this.cameraShake ? Math.cos(performance.now() * 0.07) * this.cameraShake * 0.5 : 0;
    const spec = battleEnvironmentFor(this.biomeId);
    const layers: ReadonlyArray<{ layer: Container; factor: number; shake: boolean }> = [
      { layer: this.environmentView.background, factor: 0, shake: false },
      { layer: this.environmentView.farBackdrop, factor: spec.parallax.far, shake: false },
      { layer: this.environmentView.horizonLayer, factor: spec.parallax.horizon, shake: false },
      { layer: this.environmentView.groundLayer, factor: spec.parallax.ground, shake: true },
      { layer: this.combatants, factor: 1, shake: true },
      { layer: this.environmentView.terrainOcclusion, factor: 1, shake: true },
      { layer: this.environmentView.foreground, factor: spec.parallax.foreground, shake: false },
      { layer: this.effectPool.container, factor: 1, shake: true },
    ];
    for (const { layer, factor, shake } of layers) {
      const scale = 1 + (this.cameraScale - 1) * factor;
      layer.scale.set(scale);
      layer.position.set(this.cameraOffset.x * factor + (shake ? shakeX : 0), this.cameraOffset.y * factor + (shake ? shakeY : 0));
    }
    if (!clock) return;
    for (const view of this.views.values()) view.update(clock);
    const due = this.delayedCues.filter((entry) => (entry.remaining -= clock) <= 0);
    this.delayedCues = this.delayedCues.filter((entry) => entry.remaining > 0);
    for (const entry of due) {
      if (entry.cue.type === 'animation') this.playAnimationCue(entry.cue);
      else for (const plan of planBattleCue(entry.cue)) this.spawnPlan(plan);
    }
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
