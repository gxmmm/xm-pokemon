import { DEFAULT_VISUAL_RUNTIME_SETTINGS, type AssetKey, type BattleCue, type BattleRenderInput, type BattleRenderSnapshot, type BattleRenderer, type SceneTransitionRequest, type VisualRuntimeSettings } from '@pokemon-online/renderer';
import { BATTLE_ASSET_BY_ID, battleEnvironmentFor, resolveBattleArtPresentation, type BattleEnvironmentSpec } from '@pokemon-online/config';
import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { elementColor, planBattleCue, type BattleStageVfxPlan } from './battle-plan.ts';
import { smoothBattlePresentationAxis } from './battle-motion.ts';
import { BattleArtAssetLoader } from './BattleArtAssets.ts';
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
  private environment = new Container();
  private readonly farBackdrop = new Container();
  private readonly horizonLayer = new Container();
  private readonly groundLayer = new Container();
  private readonly terrainOcclusion = new Container();
  private readonly foreground = new Container();
  private combatants = new Container();
  private readonly effectPool = new BattleEffectPool();
  private readonly terrainContacts = new TerrainContactEffects(this.effectPool, this.terrainOcclusion);
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
      environmentChildCount: this.environment.children.length + this.farBackdrop.children.length + this.horizonLayer.children.length + this.groundLayer.children.length + this.terrainOcclusion.children.length + this.foreground.children.length,
      effectChildCount: this.effectPool.container.children.length,
      totalChildCount: this.environment.children.length + this.farBackdrop.children.length + this.horizonLayer.children.length + this.groundLayer.children.length + this.combatants.children.length + this.terrainOcclusion.children.length + this.foreground.children.length + this.effectPool.container.children.length + this.overlay.children.length,
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
    this.root.addChild(this.environment, this.farBackdrop, this.horizonLayer, this.groundLayer, this.combatants, this.terrainOcclusion, this.foreground, this.effectPool.container, this.overlay);
    this.transitionLayer = new Graphics();
    this.overlay.addChild(this.transitionLayer);
    this.drawEnvironment();
  }

  private clearEnvironmentLayers(): void {
    this.terrainContacts.clear();
    for (const layer of [this.environment, this.farBackdrop, this.horizonLayer, this.groundLayer, this.terrainOcclusion, this.foreground]) {
      layer.removeChildren().forEach((child) => child.destroy());
    }
  }

  /** A renderer-only 2.5D stage grammar. Environment config selects semantic
   * forms; this code owns only reusable Pixi primitives and never battle rules. */
  private drawEnvironment(): void {
    this.clearEnvironmentLayers();
    const spec = battleEnvironmentFor(this.biomeId);
    const { palette } = spec;
    const o = spec.overscan;
    // Every camera-reactive layer has a configuration-owned safety margin, so
    // bounded pan/zoom never reveals the renderer's unpainted design edge.
    this.environment.addChild(new Graphics().rect(-o, -o, DESIGN_WIDTH + o * 2, DESIGN_HEIGHT + o * 2).fill({ color: palette.sky }));
    const formalBackground = this.environmentBackgroundTexture && spec.art
      ? this.drawFormalEnvironmentBackground(this.environmentBackgroundTexture, spec)
      : false;
    if (!formalBackground) {
      this.drawBackdropGrammar(spec);
      this.drawHorizonGrammar(spec);
    }
    this.drawPerspectiveGround(spec, !formalBackground);
    this.drawAmbientGrammar(spec);
    this.drawForegroundGrammar(spec);
  }

  private drawFormalEnvironmentBackground(texture: Texture, spec: BattleEnvironmentSpec): boolean {
    if (texture.width <= 0 || texture.height <= 0 || !spec.art) return false;
    const sprite = new Sprite(texture);
    const scale = Math.max(DESIGN_WIDTH / texture.width, DESIGN_HEIGHT / texture.height);
    sprite.scale.set(scale);
    sprite.position.set((DESIGN_WIDTH - texture.width * scale) / 2, (DESIGN_HEIGHT - texture.height * scale) / 2);
    this.environment.addChild(sprite);
    this.environment.addChild(new Graphics().rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT).fill({ color: spec.palette.sky, alpha: spec.art.toneAlpha }));
    return true;
  }

  private detailDensity(): number {
    return 0.62;
  }

  private drawBackdropGrammar(spec: BattleEnvironmentSpec): void {
    const { horizon, groundDetail, accent } = spec.palette;
    const graphic = new Graphics();
    const light = spec.atmosphere.keyLight;
    graphic.circle(light.x, light.y, light.radius).fill({ color: accent, alpha: light.alpha * 0.55 });
    graphic.circle(light.x, light.y, light.radius * 0.56).fill({ color: spec.palette.mote, alpha: light.alpha * 0.72 });
    graphic.circle(light.x, light.y, light.radius * 0.24).fill({ color: accent, alpha: light.alpha * 0.82 });
    if (spec.backdrop === 'forest-canopy') {
      // Forest benchmark: broad atmospheric silhouettes establish depth first;
      // smaller trunks and canopy clusters then break the repeated-oval look.
      graphic.poly([-80, 292, 150, 194, 318, 270, 480, 176, 690, 285, 870, 205, 1080, 278, 1360, 184, 1360, 306, -80, 306])
        .fill({ color: horizon, alpha: 0.34 });
      for (let index = -2; index < 14; index++) {
        const x = index * 112 - 34;
        const trunkHeight = 70 + (index * 37 + 90) % 74;
        const crownY = 251 - trunkHeight * 0.42;
        graphic.rect(x + 50, crownY + 18, 12 + index % 3 * 3, 292 - crownY).fill({ color: groundDetail, alpha: 0.16 });
        graphic.ellipse(x + 42, crownY, 72 + index % 4 * 15, 28 + index % 3 * 9).fill({ color: horizon, alpha: 0.72 });
        graphic.ellipse(x + 88, crownY - 13, 58 + index % 3 * 13, 25 + index % 2 * 8).fill({ color: groundDetail, alpha: 0.18 });
      }
      graphic.moveTo(-120, 286).bezierCurveTo(250, 255, 448, 304, 700, 274).bezierCurveTo(930, 248, 1120, 282, 1400, 258)
        .stroke({ color: spec.palette.mote, alpha: 0.09, width: 3 });
    } else if (spec.backdrop === 'cave-pillars') {
      graphic.poly([-120, -40, 1400, -40, 1400, 68, 1250, 48, 1128, 116, 980, 70, 820, 132, 670, 82, 520, 126, 360, 64, 186, 118, -120, 62])
        .fill({ color: horizon, alpha: 0.76 });
      for (let index = 0; index < 8; index++) {
        const x = index * 184 - 42;
        const shoulder = 146 + (index % 3) * 28;
        graphic.poly([x, 298, x + 28, shoulder, x + 54, 112 + index % 2 * 34, x + 82, shoulder + 12, x + 116, 298])
          .fill({ color: index % 2 ? horizon : groundDetail, alpha: index % 2 ? 0.80 : 0.36 });
        graphic.moveTo(x + 54, 126).lineTo(x + 54, 266).stroke({ color: accent, alpha: 0.08, width: 3 });
      }
      graphic.ellipse(1035, 246, 172, 54).fill({ color: accent, alpha: 0.055 });
      graphic.moveTo(-80, 282).bezierCurveTo(260, 252, 430, 300, 710, 270).bezierCurveTo(930, 244, 1130, 284, 1380, 250)
        .stroke({ color: spec.palette.mote, alpha: 0.07, width: 2 });
    } else if (spec.backdrop === 'tide-cliffs') {
      graphic.moveTo(-80, 248).bezierCurveTo(250, 224, 460, 268, 710, 236).bezierCurveTo(930, 208, 1130, 252, 1380, 220)
        .lineTo(1380, 302).lineTo(-80, 302).closePath().fill({ color: horizon, alpha: 0.34 });
      for (let index = 0; index < 7; index++) {
        const x = index * 214 - 62;
        const h = 42 + (index * 29) % 76;
        graphic.poly([x, 293, x + 24, 278 - h * 0.35, x + 62, 291 - h, x + 106, 282 - h * 0.42, x + 168, 293])
          .fill({ color: horizon, alpha: 0.72 });
        graphic.poly([x + 38, 291 - h * 0.42, x + 62, 291 - h, x + 76, 290 - h * 0.48])
          .fill({ color: groundDetail, alpha: 0.24 });
      }
      graphic.moveTo(-80, 289).bezierCurveTo(280, 282, 510, 300, 760, 287).bezierCurveTo(980, 276, 1160, 296, 1380, 284)
        .stroke({ color: accent, alpha: 0.28, width: 3 });
      graphic.moveTo(850, 174).lineTo(1010, 292).stroke({ color: spec.palette.mote, alpha: 0.055, width: 44 });
    } else if (spec.backdrop === 'dragon-rift') {
      graphic.poly([566, 294, 606, 210, 620, 78, 647, 146, 676, 52, 694, 214, 728, 294])
        .fill({ color: accent, alpha: 0.095 });
      graphic.moveTo(653, 40).bezierCurveTo(618, 102, 690, 146, 642, 214).bezierCurveTo(622, 244, 664, 266, 650, 298)
        .stroke({ color: spec.palette.mote, alpha: 0.34, width: 5 });
      for (let index = 0; index < 11; index++) {
        const x = index * 126 - 38;
        const h = 54 + (index * 23) % 112;
        graphic.poly([x, 296, x + 18, 284 - h * 0.34, x + 38, 294 - h, x + 60, 279 - h * 0.38, x + 92, 296])
          .fill({ color: horizon, alpha: 0.78 });
        graphic.moveTo(x + 38, 294 - h).lineTo(x + 48, 284 - h * 0.38).stroke({ color: accent, alpha: 0.28, width: 2 });
      }
    } else {
      graphic.ellipse(DESIGN_WIDTH / 2, 306, 790, 190).fill({ color: horizon, alpha: 0.58 });
      graphic.ellipse(DESIGN_WIDTH / 2, 286, 666, 105).fill({ color: spec.palette.sky, alpha: 0.92 });
      graphic.rect(-80, 228, 1440, 72).fill({ color: horizon, alpha: 0.52 });
      for (let index = 0; index < 11; index++) {
        const x = index * 126 - 22;
        graphic.roundRect(x, 242, 72, 58, 30).fill({ color: spec.palette.sky, alpha: 0.56 });
        graphic.rect(x + 33, 178 + index % 2 * 14, 7, 122 - index % 3 * 12).fill({ color: groundDetail, alpha: 0.34 });
        graphic.poly([x + 8, 205, x + 36, 182, x + 64, 205]).fill({ color: accent, alpha: 0.15 });
      }
    }
    this.farBackdrop.addChild(graphic);
  }

  private drawHorizonGrammar(spec: BattleEnvironmentSpec): void {
    const { horizon, mote } = spec.palette;
    const o = spec.overscan;
    const graphic = new Graphics();
    graphic.ellipse(DESIGN_WIDTH / 2, 300, 660 + o, 82 + o * 0.16).fill({ color: horizon, alpha: 0.38 });
    graphic.ellipse(DESIGN_WIDTH / 2, 294, 610 + o, 42 + o * 0.08).fill({ color: mote, alpha: spec.atmosphere.horizonHaze });
    if (spec.backdrop === 'forest-canopy') {
      graphic.ellipse(DESIGN_WIDTH / 2, 304, 590, 42).fill({ color: mote, alpha: 0.055 });
      graphic.ellipse(DESIGN_WIDTH / 2, 316, 510, 25).fill({ color: spec.palette.sky, alpha: 0.16 });
    }
    graphic.ellipse(DESIGN_WIDTH / 2, 306, 520 + o, 24).fill({ color: spec.palette.sky, alpha: spec.atmosphere.horizonHaze * 0.42 });
    this.horizonLayer.addChild(graphic);
  }

  private drawPerspectiveGround(spec: BattleEnvironmentSpec, paintBase = true): void {
    const { groundDetail, accent } = spec.palette;
    const o = spec.overscan;
    const ground = new Graphics();
    const topY = 294;
    if (paintBase) {
      ground.poly([-o, topY, DESIGN_WIDTH + o, topY, DESIGN_WIDTH + o, DESIGN_HEIGHT + o, -o, DESIGN_HEIGHT + o]).fill({ color: spec.palette.ground });
      ground.ellipse(DESIGN_WIDTH / 2, DESIGN_HEIGHT + 54, 820 + o, 176).fill({ color: spec.palette.sky, alpha: spec.atmosphere.groundShade });
    }
    // Broad irregular value shapes communicate depth without drawing a board.
    // The old evenly-spaced horizontal/radial strokes read as tactical cells
    // even though they were presentation-only.
    if (paintBase && spec.groundPattern === 'grass-lanes') {
      ground.ellipse(356, 430, 360, 72).fill({ color: groundDetail, alpha: 0.035 });
      ground.ellipse(930, 520, 510, 118).fill({ color: spec.palette.sky, alpha: 0.055 });
      ground.ellipse(566, 665, 680, 126).fill({ color: accent, alpha: 0.025 });
      ground.moveTo(-80, 482).bezierCurveTo(250, 444, 430, 520, 720, 484).bezierCurveTo(980, 452, 1130, 520, 1380, 474)
        .stroke({ color: groundDetail, alpha: 0.065, width: 7 });
    } else if (paintBase && spec.groundPattern === 'shallow-ripples') {
      for (let index = 0; index < 5; index++) {
        const t = (index + 1) / 6;
        ground.ellipse(DESIGN_WIDTH / 2, topY + 72 + t * t * 330, 340 + t * 420, 18 + t * 16)
          .stroke({ color: groundDetail, alpha: 0.05 + t * 0.06, width: 1.5 });
      }
    } else if (paintBase && spec.groundPattern === 'stone-terraces') {
      for (let index = 0; index < 4; index++) {
        const y = topY + 84 + index * 104;
        ground.moveTo(-o, y + index % 2 * 17).bezierCurveTo(310, y - 12, 770, y + 24, DESIGN_WIDTH + o, y - 5)
          .stroke({ color: groundDetail, alpha: 0.08 + index * 0.025, width: 2 + index * 0.5 });
      }
    } else if (paintBase && spec.groundPattern === 'rune-rings') {
      ground.ellipse(DESIGN_WIDTH / 2, 520, 480, 128).stroke({ color: accent, alpha: 0.065, width: 2 });
      ground.ellipse(DESIGN_WIDTH / 2, 520, 250, 68).stroke({ color: groundDetail, alpha: 0.08, width: 1 });
    } else if (paintBase) {
      // Arena paving remains architectural, but uses staggered seams rather
      // than a navigation-grid projection.
      for (let index = 0; index < 5; index++) {
        const y = topY + 70 + index * 86;
        ground.moveTo(-o, y).lineTo(DESIGN_WIDTH + o, y + (index % 2 ? 10 : -8)).stroke({ color: groundDetail, alpha: 0.08, width: 2 });
      }
    }
    this.groundLayer.addChild(ground);

    const detailDensity = paintBase ? 1 : (spec.art?.detailDensity ?? 0);
    const count = spec.groundPattern === 'grass-lanes'
      ? Math.round(96 * spec.density * this.detailDensity() * detailDensity)
      : Math.round(42 * spec.density * this.detailDensity() * detailDensity);
    for (let index = 0; index < count; index++) {
      const depth = ((index * 37) % 100) / 100;
      const y = topY + 42 + depth * depth * (DESIGN_HEIGHT - topY - 54);
      const spread = 130 + depth * 570;
      const x = DESIGN_WIDTH / 2 + (((index * 97) % 100) / 100 - 0.5) * 2 * spread;
      const size = 1.5 + depth * 9;
      const detail = new Graphics();
      if (spec.groundPattern === 'grass-lanes') {
        const bladeAlpha = 0.22 + depth * 0.30;
        for (let blade = -1; blade <= 1; blade++) {
          const baseX = x + blade * size * 0.55;
          detail.moveTo(baseX, y).lineTo(baseX + blade * size * 0.18, y - size * (1.45 + (blade + 1) * 0.28))
            .stroke({ color: blade === 0 ? accent : groundDetail, alpha: bladeAlpha, width: Math.max(1, size * 0.20) });
        }
      } else if (spec.groundPattern === 'stone-terraces') {
        detail.poly([x - size, y + size * 0.4, x - size * 0.32, y - size, x + size, y - size * 0.3, x + size * 0.62, y + size * 0.55]).fill({ color: groundDetail, alpha: 0.14 + depth * 0.20 });
      } else if (spec.groundPattern === 'shallow-ripples') {
        detail.ellipse(x, y, size * 2.6, Math.max(1, size * 0.42)).stroke({ color: groundDetail, alpha: 0.18 + depth * 0.18, width: 1 });
      } else if (spec.groundPattern === 'rune-rings') {
        detail.circle(x, y, size * 1.35).stroke({ color: index % 3 ? groundDetail : accent, alpha: 0.12 + depth * 0.18, width: 1 });
      } else {
        detail.rect(x - size, y - size * 0.28, size * 2, Math.max(1, size * 0.48)).fill({ color: groundDetail, alpha: 0.16 + depth * 0.18 });
      }
      this.groundLayer.addChild(detail);
    }
  }

  private drawAmbientGrammar(spec: BattleEnvironmentSpec): void {
    const count = Math.max(4, Math.round(22 * spec.density * this.detailDensity()));
    for (let index = 0; index < count; index++) {
      const x = (index * 131 + 47) % DESIGN_WIDTH;
      const y = 108 + ((index * 71) % 224);
      const graphic = new Graphics({ blendMode: spec.ambience === 'dust' ? 'normal' : 'add' });
      if (spec.ambience === 'dust') graphic.ellipse(x, y, 4 + index % 3 * 2, 2).fill({ color: spec.palette.mote, alpha: 0.2 });
      else if (spec.ambience === 'spray') graphic.circle(x, y, 2 + index % 2).fill({ color: spec.palette.mote, alpha: 0.56 }).moveTo(x, y + 3).lineTo(x - 3, y + 10).stroke({ color: spec.palette.mote, alpha: 0.24, width: 1 });
      else if (spec.ambience === 'rune') graphic.star(x, y, 4, 4 + index % 4, 1.5).fill({ color: spec.palette.mote, alpha: 0.38 });
      else if (spec.ambience === 'sparks') graphic.rect(x, y, 2, 6 + index % 5).fill({ color: spec.palette.mote, alpha: 0.34 });
      else graphic.circle(x, y, 1.5 + index % 2).fill({ color: spec.palette.mote, alpha: 0.55 });
      this.horizonLayer.addChild(graphic);
    }
  }

  private drawForegroundGrammar(spec: BattleEnvironmentSpec): void {
    const { groundDetail, accent, mote } = spec.palette;
    const graphic = new Graphics();
    if (spec.foregroundFrame === 'ferns') {
      for (let index = 0; index < 18; index++) {
        const x = index * 78 - 22;
        const h = 20 + (index % 5) * 8;
        graphic.moveTo(x, DESIGN_HEIGHT).lineTo(x + 10, DESIGN_HEIGHT - h).stroke({ color: groundDetail, alpha: 0.42, width: 3 });
        graphic.moveTo(x + 9, DESIGN_HEIGHT - h * 0.6).lineTo(x + 26, DESIGN_HEIGHT - h * 0.82).stroke({ color: accent, alpha: 0.25, width: 2 });
      }
    } else if (spec.foregroundFrame === 'rock-ledge') {
      graphic.poly([0, DESIGN_HEIGHT, 0, 548, 42, 566, 92, 542, 134, 606, 192, DESIGN_HEIGHT]).fill({ color: groundDetail, alpha: 0.38 });
      graphic.poly([DESIGN_WIDTH, DESIGN_HEIGHT, DESIGN_WIDTH, 532, DESIGN_WIDTH - 42, 570, DESIGN_WIDTH - 96, 548, DESIGN_WIDTH - 142, 610, DESIGN_WIDTH - 196, DESIGN_HEIGHT]).fill({ color: groundDetail, alpha: 0.38 });
      graphic.moveTo(18, 570).lineTo(92, 542).lineTo(148, 616).stroke({ color: accent, alpha: 0.12, width: 3 });
      graphic.moveTo(DESIGN_WIDTH - 18, 554).lineTo(DESIGN_WIDTH - 96, 548).lineTo(DESIGN_WIDTH - 154, 620).stroke({ color: accent, alpha: 0.12, width: 3 });
    } else if (spec.foregroundFrame === 'spray') {
      for (let index = 0; index < 14; index++) {
        const x = index * 102 - 18;
        const y = 694 - index % 3 * 7;
        graphic.ellipse(x, y, 42, 8).stroke({ color: mote, alpha: 0.20, width: 2 });
        if (index % 3 === 0) graphic.moveTo(x, y - 5).bezierCurveTo(x - 12, y - 28, x + 16, y - 34, x + 26, y - 11).stroke({ color: mote, alpha: 0.11, width: 2 });
      }
    } else if (spec.foregroundFrame === 'crystal-veils') {
      for (const [index, x] of [0, 68, 1122, 1200].entries()) {
        const tipY = 548 + index % 2 * 34;
        graphic.poly([x, DESIGN_HEIGHT, x + 22, tipY, x + 62, DESIGN_HEIGHT]).fill({ color: accent, alpha: 0.24 });
        graphic.poly([x + 22, tipY, x + 34, DESIGN_HEIGHT, x + 48, DESIGN_HEIGHT]).fill({ color: mote, alpha: 0.09 });
      }
    } else {
      for (let index = 0; index < 6; index++) {
        const x = 74 + index * 220;
        graphic.poly([x - 42, DESIGN_HEIGHT, x - 12, 606 + index % 2 * 12, x + 18, DESIGN_HEIGHT]).fill({ color: groundDetail, alpha: 0.18 });
        graphic.rect(x, 606 + index % 2 * 12, 8, 114).fill({ color: groundDetail, alpha: 0.30 });
        graphic.poly([x - 26, 622, x + 4, 590, x + 34, 622]).fill({ color: accent, alpha: 0.16 });
      }
    }
    this.foreground.addChild(graphic);
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
      { layer: this.environment, factor: 0, shake: false },
      { layer: this.farBackdrop, factor: spec.parallax.far, shake: false },
      { layer: this.horizonLayer, factor: spec.parallax.horizon, shake: false },
      { layer: this.groundLayer, factor: spec.parallax.ground, shake: true },
      { layer: this.combatants, factor: 1, shake: true },
      { layer: this.terrainOcclusion, factor: 1, shake: true },
      { layer: this.foreground, factor: spec.parallax.foreground, shake: false },
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
