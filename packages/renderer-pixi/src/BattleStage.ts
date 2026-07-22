import { DEFAULT_VISUAL_RUNTIME_SETTINGS, type AssetKey, type BattleCue, type BattleRenderInput, type BattleRenderSnapshot, type BattleRenderer, type QualityProfile, type SceneTransitionRequest, type VisualRuntimeSettings } from '@pokemon-online/renderer';
import { BATTLE_ASSET_BY_ID, battleEnvironmentFor, resolveBattleArtPresentation, type BattleEnvironmentSpec } from '@pokemon-online/config';
import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { elementColor, planBattleCue, type BattleStageVfxPlan } from './battle-plan.ts';
import { smoothBattlePresentationAxis } from './battle-motion.ts';
import { BattleArtAssetLoader } from './BattleArtAssets.ts';
import { battleContactPoint, battleWorldPositionFromGrid, projectBattleWorldPoint } from './battle-ground.ts';
import { elementalVfxShapeFor } from './elemental-vfx.ts';
import { movementPressurePlan, terrainContactPlan } from './terrain-contact-plan.ts';
import { CombatantView } from './CombatantView.ts';
import { DrawCallObserver } from './draw-call-observer.ts';

const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;

interface Point { x: number; y: number; }

export interface BattleStageDiagnostics {
  quality: QualityProfile;
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

interface TimedEffect { graphic: Graphics; elapsed: number; duration: number; update(progress: number): void; }
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
  private effects = new Container();
  private overlay = new Container();
  private views = new Map<string, CombatantView>();
  private readonly battleArtAssets = new BattleArtAssetLoader();
  private environmentBackgroundTexture: Texture | null = null;
  private positions = new Map<string, Point>();
  private targetPositions = new Map<string, Point>();
  private positionVelocities = new Map<string, Point>();
  private visualScales = new Map<string, number>();
  private targetScales = new Map<string, number>();
  private contactGraphics = new Map<string, Graphics>();
  private contactPositions = new Map<string, Point>();
  private contactCooldowns = new Map<string, number>();
  private pressureCooldowns = new Map<string, number>();
  private activeEffects: TimedEffect[] = [];
  private delayedCues: DelayedBattleCue[] = [];
  private resizeObserver: ResizeObserver | null = null;
  private mountedContainer: HTMLElement | null = null;
  private quality: QualityProfile;
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

  constructor(initialQuality: QualityProfile = 'standard') {
    this.quality = initialQuality;
  }

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
    this.activeEffects.forEach((effect) => effect.graphic.destroy());
    this.activeEffects = [];
    this.delayedCues = [];
    this.views.clear();
    this.positions.clear();
    this.targetPositions.clear();
    this.positionVelocities.clear();
    this.visualScales.clear();
    this.targetScales.clear();
    this.contactGraphics.clear();
    this.contactPositions.clear();
    this.contactCooldowns.clear();
    this.pressureCooldowns.clear();
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

  setQuality(profile: QualityProfile): void {
    this.quality = profile;
    this.drawEnvironment();
  }

  setVisualSettings(settings?: VisualRuntimeSettings): void {
    this.visualSettings = { ...DEFAULT_VISUAL_RUNTIME_SETTINGS, ...settings };
    for (const effect of this.activeEffects) effect.graphic.alpha = this.visualSettings.reduceFlicker ? 0.46 : 1;
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
      quality: this.quality,
      biomeId: this.biomeId,
      combatantCount: this.views.size,
      activeEffectCount: this.activeEffects.length,
      environmentChildCount: this.environment.children.length + this.farBackdrop.children.length + this.horizonLayer.children.length + this.groundLayer.children.length + this.terrainOcclusion.children.length + this.foreground.children.length,
      effectChildCount: this.effects.children.length,
      totalChildCount: this.environment.children.length + this.farBackdrop.children.length + this.horizonLayer.children.length + this.groundLayer.children.length + this.combatants.children.length + this.terrainOcclusion.children.length + this.foreground.children.length + this.effects.children.length + this.overlay.children.length,
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
        this.visualScales.delete(uid);
        this.targetScales.delete(uid);
        this.contactPositions.delete(uid);
        this.contactCooldowns.delete(uid);
        this.pressureCooldowns.delete(uid);
        const contact = this.contactGraphics.get(uid);
        contact?.destroy();
        this.contactGraphics.delete(uid);
      }
    }
    for (const combatant of snapshot.combatants) {
      const visualCombatant = { ...combatant, stunActive: (combatant.flinchUntil ?? 0) > snapshot.time };
      const projection = projectBattleWorldPoint(
        visualCombatant.worldPosition ?? battleWorldPositionFromGrid(visualCombatant.pixel.x, visualCombatant.pixel.y),
        battleEnvironmentFor(this.biomeId).camera,
      );
      const point = { x: projection.x, y: projection.y };
      this.targetPositions.set(visualCombatant.uid, point);
      this.targetScales.set(visualCombatant.uid, projection.scale);
      let view = this.views.get(visualCombatant.uid);
      if (!view) {
        view = new CombatantView(visualCombatant, this.battleArtAssets);
        this.views.set(combatant.uid, view);
        this.combatants.addChild(view);
        this.positions.set(visualCombatant.uid, point);
        this.positionVelocities.set(visualCombatant.uid, { x: 0, y: 0 });
        this.visualScales.set(visualCombatant.uid, projection.scale);
      } else {
        view.refresh(visualCombatant);
      }
      // Render position always follows the delayed snapshot smoothly. Engine
      // castProgress remains the only authoritative movement lock; CombatantView
      // adds its action offsets locally, avoiding a catch-up teleport after a
      // visual prepare, cast, or recovery pose finishes.
      const visiblePoint = this.positions.get(visualCombatant.uid) ?? point;
      view.position.set(visiblePoint.x, visiblePoint.y);
      view.scale.set(this.visualScales.get(visualCombatant.uid) ?? projection.scale);
      view.zIndex = visiblePoint.y;
      this.updateTerrainContact(combatant.uid, combatant.speciesId, visiblePoint);
    }
  }

  private updateTerrainContact(uid: string, speciesId: number, point: Point): void {
    const spec = battleEnvironmentFor(this.biomeId);
    const profile = resolveBattleArtPresentation({ speciesId, side: 'player' }).profile;
    const plan = terrainContactPlan(spec.contactVisual, profile.locomotionMode, this.quality);
    const previous = this.contactPositions.get(uid);
    this.contactPositions.set(uid, point);
    const travel = previous ? Math.hypot(point.x - previous.x, point.y - previous.y) : 0;
    const pressure = movementPressurePlan(this.quality);
    const moved = travel > pressure.minTravelPixels;
    if (moved && (this.pressureCooldowns.get(uid) ?? 0) <= 0 && previous) {
      this.spawnMovementPressure(point, { x: point.x - previous.x, y: point.y - previous.y });
      this.pressureCooldowns.set(uid, pressure.intervalSeconds);
    }
    const existing = this.contactGraphics.get(uid);
    if (!plan.occludesFeet) {
      existing?.clear();
      return;
    }
    const graphic = existing ?? new Graphics();
    if (!existing) {
      this.contactGraphics.set(uid, graphic);
      this.terrainOcclusion.addChild(graphic);
    }
    const groundedStep = travel > 1.4;
    this.drawFootOcclusion(graphic, point, spec, groundedStep ? 3 : 0);
    const cooldown = this.contactCooldowns.get(uid) ?? 0;
    if (groundedStep && cooldown <= 0) {
      this.spawnTerrainContact(point, plan.particleKind, plan.particleBudget, spec);
      this.contactCooldowns.set(uid, 0.10);
    }
  }

  private drawFootOcclusion(graphic: Graphics, point: Point, spec: BattleEnvironmentSpec, sway: number): void {
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

  private spawnMovementPressure(at: Point, velocity: Point): void {
    const length = Math.hypot(velocity.x, velocity.y);
    if (length < 0.001) return;
    const direction = { x: velocity.x / length, y: velocity.y / length };
    const normal = { x: -direction.y, y: direction.x };
    const plan = movementPressurePlan(this.quality);
    const graphic = new Graphics({ blendMode: 'add' });
    this.addEffect(graphic, plan.durationSeconds, (progress) => {
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

  private spawnTerrainContact(at: Point, kind: 'grass' | 'mud' | 'dust' | 'ripples' | 'runes' | 'none', budget: number, spec: BattleEnvironmentSpec): void {
    if (kind === 'none' || budget <= 0) return;
    const graphic = new Graphics({ blendMode: kind === 'dust' ? 'normal' : 'add' });
    const color = kind === 'grass' ? colorNumber(spec.palette.groundDetail) : kind === 'ripples' ? colorNumber(spec.palette.mote) : kind === 'runes' ? colorNumber(spec.palette.accent) : colorNumber(spec.palette.groundDetail);
    this.addEffect(graphic, kind === 'ripples' ? 0.34 : 0.24, (progress) => {
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
    return this.activeEffects.length === 0 && this.delayedCues.length === 0 && this.hitStopSeconds <= 0.001 && [...this.views.values()].every((view) => view.isSettled());
  }

  private installStage(): void {
    if (!this.app) return;
    this.root = new Container();
    this.app.stage.addChild(this.root);
    this.combatants.sortableChildren = true;
    this.root.addChild(this.environment, this.farBackdrop, this.horizonLayer, this.groundLayer, this.combatants, this.terrainOcclusion, this.foreground, this.effects, this.overlay);
    this.transitionLayer = new Graphics();
    this.overlay.addChild(this.transitionLayer);
    this.drawEnvironment();
  }

  private clearEnvironmentLayers(): void {
    for (const layer of [this.environment, this.farBackdrop, this.horizonLayer, this.groundLayer, this.terrainOcclusion, this.foreground]) {
      layer.removeChildren().forEach((child) => child.destroy());
    }
    this.contactGraphics.clear();
    // A biome redraw invalidates prior terrain contact state. The next snapshot
    // must establish fresh feet positions and particle cadence for this stage.
    this.contactPositions.clear();
    this.contactCooldowns.clear();
    this.pressureCooldowns.clear();
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
    return this.quality === 'cinematic' ? 1 : this.quality === 'standard' ? 0.62 : 0.30;
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
      this.spawnProjectile(actor, target, color, plan.intensity, plan.variant, plan.element);
    } else if (plan.primitive === 'sky-strike') {
      this.spawnSkyStrike(target, plan.intensity);
    } else if (plan.primitive === 'chain') {
      const chainTargets = plan.targetIds.map((id) => this.positions.get(id)).filter((point): point is Point => !!point);
      this.spawnChainLightning(actor ?? target, chainTargets.length > 0 ? chainTargets : [target], plan.intensity);
    } else if (plan.primitive === 'dive' && actor) {
      this.spawnDive(actor, target, color, plan.intensity);
    } else if (plan.primitive === 'beam' && actor) {
      this.spawnBeam(actor, target, color, plan.intensity, plan.variant, plan.element);
    } else if (plan.primitive === 'burst') {
      this.spawnBurst(target, color, plan.intensity, plan.variant, plan.particleBudget, plan.element);
    } else if (plan.primitive === 'ring') {
      this.spawnRing(target, color, plan.intensity, plan.variant, plan.element);
    } else if (plan.primitive === 'environment') {
      if (plan.actorId || plan.targetIds.length > 0) this.spawnEnvironmentReaction(target, plan.reaction);
    } else {
      this.spawnImpact(target, color, plan.intensity, plan.variant);
    }
  }

  /** A vertical, target-owned discharge. Lightning appears in a few stepped
   * silhouettes instead of travelling smoothly, which keeps it reading as an
   * instantaneous atmospheric strike rather than a yellow projectile. */
  private spawnSkyStrike(at: Point, intensity: number): void {
    const shade = new Graphics();
    const graphic = new Graphics({ blendMode: 'add' });
    const duration = this.visualSettings.reduceFlicker ? 0.56 : 0.48;
    this.addEffect(shade, duration, (progress) => {
      const reduced = this.visualSettings.reduceFlicker;
      const rise = Math.min(1, progress / 0.16);
      const fall = progress < 0.42 ? 1 : Math.max(0, (1 - progress) / 0.58);
      shade.clear().rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT).fill({ color: 0x06121d, alpha: rise * fall * (reduced ? 0.055 : 0.14) });
    });
    this.addEffect(graphic, duration, (progress) => {
      const reduced = this.visualSettings.reduceFlicker;
      const strikeStart = 0.16;
      const strikeEnd = reduced ? 0.62 : 0.56;
      const strikeProgress = Math.max(0, Math.min(1, (progress - strikeStart) / (strikeEnd - strikeStart)));
      const strikeAlpha = progress < strikeStart || progress > strikeEnd ? 0 : Math.sin(strikeProgress * Math.PI) * (reduced ? 0.62 : 1);
      const afterAlpha = progress < 0.34 ? 0 : (1 - progress) * 0.86;
      const top = Math.max(-50, at.y - (360 + intensity * 120));
      const phase = Math.floor(strikeProgress * (reduced ? 3 : 6));
      graphic.clear();

      const warningAlpha = progress < strikeStart ? (1 - progress / strikeStart) * 0.46 : 0;
      if (warningAlpha > 0) {
        graphic.moveTo(at.x, top).lineTo(at.x, at.y + 10).stroke({ color: 0xb9eaff, alpha: warningAlpha, width: 2 })
          .ellipse(at.x, at.y + 24, 30 + progress * 28, 9 + progress * 4).stroke({ color: 0xffe66b, alpha: warningAlpha * 0.82, width: 3 });
      }

      if (strikeAlpha > 0) {
        if (!reduced) graphic.rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT).fill({ color: 0xdaf6ff, alpha: strikeAlpha * 0.075 });
        const segments = 10;
        let previous = { x: at.x + Math.sin(phase * 1.7) * 22, y: top };
        for (let segment = 1; segment <= segments; segment++) {
          const t = segment / segments;
          const spread = Math.sin(t * Math.PI) * (30 + intensity * 20);
          const jitter = segment === segments ? 0 : Math.sin(segment * 11.71 + phase * 2.83) * spread;
          const next = { x: at.x + jitter, y: top + (at.y - top) * t };
          graphic.moveTo(previous.x, previous.y).lineTo(next.x, next.y).stroke({ color: 0x65bfff, alpha: strikeAlpha * 0.26, width: 28 + intensity * 11 })
            .moveTo(previous.x, previous.y).lineTo(next.x, next.y).stroke({ color: 0xffe96a, alpha: strikeAlpha * 0.96, width: 11 + intensity * 4 })
            .moveTo(previous.x, previous.y).lineTo(next.x, next.y).stroke({ color: 0xffffff, alpha: strikeAlpha, width: 3.2 });
          if (segment === 3 || segment === 5 || segment === 7) {
            const side = segment % 2 ? -1 : 1;
            const branch = 36 + intensity * 30 + segment * 4;
            const elbow = { x: next.x + side * branch * 0.42, y: next.y + branch * 0.25 };
            const end = { x: next.x + side * branch, y: next.y + branch * 0.58 };
            graphic.moveTo(next.x, next.y).lineTo(elbow.x, elbow.y).lineTo(end.x, end.y).stroke({ color: 0x8dd8ff, alpha: strikeAlpha * 0.28, width: 12 + intensity * 4 })
              .moveTo(next.x, next.y).lineTo(elbow.x, elbow.y).lineTo(end.x, end.y).stroke({ color: 0xfff28a, alpha: strikeAlpha * 0.78, width: 4 + intensity * 2 })
              .moveTo(next.x, next.y).lineTo(elbow.x, elbow.y).lineTo(end.x, end.y).stroke({ color: 0xffffff, alpha: strikeAlpha * 0.86, width: 1.6 });
          }
          previous = next;
        }
      }

      if (afterAlpha > 0) {
        const radius = 34 + progress * (78 + intensity * 44);
        graphic.ellipse(at.x, at.y + 26, radius, radius * 0.23).stroke({ color: 0x9ee7ff, alpha: afterAlpha * 0.42, width: 5 })
          .ellipse(at.x, at.y + 24, radius * 0.58, radius * 0.14).stroke({ color: 0xffea72, alpha: afterAlpha * 0.72, width: 3 });
        const sparkCount = this.quality === 'cinematic' ? 9 : this.quality === 'standard' ? 6 : 4;
        for (let spark = 0; spark < sparkCount; spark++) {
          const angle = spark / sparkCount * Math.PI * 2 + spark * 0.37;
          const distance = 22 + progress * (70 + (spark % 3) * 18);
          const sx = at.x + Math.cos(angle) * distance;
          const sy = at.y + 16 + Math.sin(angle) * distance * 0.34 - progress * (12 + spark % 2 * 14);
          graphic.moveTo(at.x + Math.cos(angle) * 16, at.y + 16).lineTo(sx, sy).stroke({ color: spark % 2 ? 0xffffff : 0xffe76b, alpha: afterAlpha * 0.72, width: 2.5 + intensity });
        }
      }
    });
  }

  /** A source-to-target electrical connection. Each link redraws in discrete
   * phases and branches around its destination, so multi-target skills read as
   * electricity jumping between bodies rather than an area explosion. */
  private spawnChainLightning(from: Point, targets: readonly Point[], intensity: number): void {
    const graphic = new Graphics({ blendMode: 'add' });
    const duration = 0.46;
    this.addEffect(graphic, duration, (progress) => {
      const alpha = Math.sin(Math.PI * Math.min(1, progress * 1.16)) * (this.visualSettings.reduceFlicker ? 0.66 : 0.96);
      const phase = Math.floor(progress * (this.visualSettings.reduceFlicker ? 4 : 9));
      const points = [from, ...targets];
      graphic.clear();
      for (let link = 0; link < points.length - 1; link++) {
        const start = points[link]!;
        const end = points[link + 1]!;
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.max(1, Math.hypot(dx, dy));
        const px = -dy / length;
        const py = dx / length;
        const segments = 9;
        let previous = start;
        for (let segment = 1; segment <= segments; segment++) {
          const t = segment / segments;
          const taper = Math.sin(t * Math.PI);
          const noise = Math.sin(segment * 12.9898 + phase * 2.41 + link * 4.1) * 0.62
            + Math.sin(segment * 4.231 + phase * 5.17 + link * 1.3) * 0.38;
          const jitter = segment === segments ? 0 : noise * (20 + intensity * 14) * taper;
          const axial = segment === segments ? 0 : Math.sin(segment * 7.13 + phase * 1.71) * 4 * taper;
          const next = { x: start.x + dx * t + dx / length * axial + px * jitter, y: start.y + dy * t + dy / length * axial + py * jitter };
          graphic.moveTo(previous.x, previous.y).lineTo(next.x, next.y).stroke({ color: 0x65c7ff, alpha: alpha * 0.24, width: 21 + intensity * 8 })
            .moveTo(previous.x, previous.y).lineTo(next.x, next.y).stroke({ color: 0xffe56b, alpha, width: 7 + intensity * 3 })
            .moveTo(previous.x, previous.y).lineTo(next.x, next.y).stroke({ color: 0xffffff, alpha, width: 2.2 });
          if (segment === 3 || segment === 5 || segment === 7) {
            const side = segment % 2 ? -1 : 1;
            const branch = 24 + intensity * 17 + segment * 2;
            const bx = next.x + px * side * branch - dx / length * 8;
            const by = next.y + py * side * branch - dy / length * 8;
            graphic.moveTo(next.x, next.y).lineTo(next.x + px * side * branch * 0.42, next.y + py * side * branch * 0.42).lineTo(bx, by)
              .stroke({ color: 0x8edcff, alpha: alpha * 0.22, width: 8 })
              .moveTo(next.x, next.y).lineTo(next.x + px * side * branch * 0.42, next.y + py * side * branch * 0.42).lineTo(bx, by)
              .stroke({ color: 0xdffcff, alpha: alpha * 0.82, width: 2.4 });
          }
          previous = next;
        }
        graphic.circle(end.x, end.y, 18 + intensity * 8).stroke({ color: 0x8fddff, alpha: alpha * 0.54, width: 5 })
          .circle(end.x, end.y, 7 + intensity * 4).fill({ color: 0xffffff, alpha: alpha * 0.58 });
      }
    });
  }

  private spawnProjectile(from: Point, to: Point, color: number, intensity: number, variant = 'default', element?: import('@pokemon-online/shared').TypeName): void {
    const graphic = new Graphics({ blendMode: 'add' });
    const duration = variant === 'fire-glyph' ? 0.48 : variant === 'flame-stream' ? 0.38 : variant === 'bind' || variant === 'snare' ? 0.34 : 0.26 + (1 - intensity) * 0.1;
    const shape = elementalVfxShapeFor(element);
    this.addEffect(graphic, duration, (progress) => {
      const x = from.x + (to.x - from.x) * progress;
      const y = from.y + (to.y - from.y) * progress;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const nx = dx / length;
      const ny = dy / length;
      const px = -ny;
      const py = nx;
      graphic.clear();
      if (variant === 'arc-bolt') {
        const head = Math.min(1, progress * 1.22);
        const tail = Math.max(0, head - 0.46);
        const phase = Math.floor(progress * 18);
        const segments = 11;
        let previous: Point | null = null;
        for (let segment = 0; segment <= segments; segment++) {
          const t = tail + (head - tail) * segment / segments;
          const taper = Math.sin(segment / segments * Math.PI);
          const noise = Math.sin(segment * 13.17 + phase * 2.19) * 0.64 + Math.sin(segment * 4.91 + phase * 5.03) * 0.36;
          const jitter = segment === 0 || segment === segments ? 0 : noise * (15 + intensity * 11) * taper;
          const axial = segment === 0 || segment === segments ? 0 : Math.sin(segment * 7.71 + phase * 1.37) * 3.5 * taper;
          const next = { x: from.x + dx * t + nx * axial + px * jitter, y: from.y + dy * t + ny * axial + py * jitter };
          if (previous) {
            graphic.moveTo(previous.x, previous.y).lineTo(next.x, next.y).stroke({ color: 0x76cfff, alpha: 0.20, width: 17 + intensity * 8 })
              .moveTo(previous.x, previous.y).lineTo(next.x, next.y).stroke({ color: 0xffe76b, alpha: 0.94, width: 7 + intensity * 3 })
              .moveTo(previous.x, previous.y).lineTo(next.x, next.y).stroke({ color: 0xffffff, alpha: 0.98, width: 2.2 });
            if ((segment === 3 || segment === 6 || segment === 9) && head > t) {
              const side = segment % 2 ? -1 : 1;
              const branchLength = 22 + intensity * 18;
              const branchX = next.x - nx * 9 + px * branchLength * side;
              const branchY = next.y - ny * 9 + py * branchLength * side;
              graphic.moveTo(next.x, next.y).lineTo(next.x + px * branchLength * side * 0.38, next.y + py * branchLength * side * 0.38).lineTo(branchX, branchY)
                .stroke({ color: 0x7dcfff, alpha: 0.24, width: 9 })
                .moveTo(next.x, next.y).lineTo(next.x + px * branchLength * side * 0.38, next.y + py * branchLength * side * 0.38).lineTo(branchX, branchY)
                .stroke({ color: 0xdffcff, alpha: 0.84, width: 2.8 });
            }
          }
          previous = next;
        }
        const headX = from.x + dx * head;
        const headY = from.y + dy * head;
        graphic.circle(headX, headY, 13 + intensity * 8).fill({ color: 0xeaffff, alpha: 0.32 })
          .circle(headX, headY, 5 + intensity * 3).fill({ color: 0xffffff, alpha: 0.94 });
      } else if (variant === 'flame-bolt') {
        const flameLength = 30 + intensity * 18;
        const flameWidth = 10 + intensity * 7;
        graphic.poly([x - nx * 12, y - ny * 12, x + px * flameWidth, y + py * flameWidth, x + nx * flameLength, y + ny * flameLength, x - px * flameWidth, y - py * flameWidth]).fill({ color, alpha: 0.86 })
          .poly([x - nx * 5, y - ny * 5, x + px * flameWidth * 0.38, y + py * flameWidth * 0.38, x + nx * (flameLength - 8), y + ny * (flameLength - 8), x - px * flameWidth * 0.38, y - py * flameWidth * 0.38]).fill({ color: 0xfff1a9, alpha: 0.96 });
        for (let ember = 0; ember < 4; ember++) graphic.circle(x - nx * (12 + ember * 9) + px * Math.sin(progress * 14 + ember) * 5, y - ny * (12 + ember * 9) + py * Math.sin(progress * 14 + ember) * 5, 3 + intensity * 2).fill({ color: ember % 2 ? color : 0xffcb69, alpha: 0.66 });
      } else if (variant === 'water-shot') {
        graphic.ellipse(x, y, 14 + intensity * 8, 9 + intensity * 5).fill({ color, alpha: 0.82 }).ellipse(x + nx * 5, y + ny * 5, 8 + intensity * 4, 5 + intensity * 2).fill({ color: 0xe0faff, alpha: 0.92 });
        for (let arc = -1; arc <= 1; arc++) graphic.moveTo(x - nx * 18 + px * arc * 8, y - ny * 18 + py * arc * 8).lineTo(x + nx * 13 + px * arc * 5, y + ny * 13 + py * arc * 5).stroke({ color: 0xc7f4ff, alpha: 0.64, width: 2 });
      } else if (variant === 'spark-bolt') {
        let previous = { x: x - nx * 18, y: y - ny * 18 };
        for (let segment = 1; segment <= 5; segment++) { const next = { x: x - nx * 18 + nx * segment * 10 + px * (segment % 2 ? 8 : -8), y: y - ny * 18 + ny * segment * 10 + py * (segment % 2 ? 8 : -8) }; graphic.moveTo(previous.x, previous.y).lineTo(next.x, next.y).stroke({ color, alpha: 0.92, width: 4 + intensity * 2 }).moveTo(previous.x, previous.y).lineTo(next.x, next.y).stroke({ color: 0xffffff, alpha: 0.94, width: 1.5 }); previous = next; }
      } else if (variant === 'leaf-shot') {
        for (let leaf = 0; leaf < 3; leaf++) { const angle = progress * 13 + leaf * Math.PI * 2 / 3; graphic.ellipse(x + Math.cos(angle) * 10, y + Math.sin(angle) * 7, 12 + intensity * 4, 5).fill({ color, alpha: 0.84 }); }
      } else if (variant === 'shadow-orb') {
        for (let ring = 0; ring < 3; ring++) graphic.ellipse(x + Math.cos(progress * 12 + ring * 2.1) * (8 + ring * 4), y + Math.sin(progress * 12 + ring * 2.1) * (6 + ring * 3), 12 + intensity * 4, 5 + ring).stroke({ color, alpha: 0.78 - ring * 0.14, width: 2 });
        graphic.circle(x, y, 9 + intensity * 6).fill({ color: 0x2d174a, alpha: 0.88 });
      } else if (variant === 'stone-shot') {
        graphic.poly([x + nx * 16, y + ny * 16, x + px * 14, y + py * 14, x - nx * 14, y - ny * 14, x - px * 14, y - py * 14]).fill({ color, alpha: 0.9 });
      } else if (variant === 'wind-cutter') {
        for (const side of [-1, 1]) graphic.moveTo(x - nx * 18 + px * side * 9, y - ny * 18 + py * side * 9).lineTo(x + nx * 21, y + ny * 21).stroke({ color, alpha: 0.82, width: 4 + intensity * 2 });
      } else if (variant === 'fairy-spark' || variant === 'neutral-star') {
        graphic.star(x, y, variant === 'fairy-spark' ? 5 : 4, 14 + intensity * 8, 5 + intensity * 3).fill({ color: variant === 'fairy-spark' ? 0xffeff9 : color, alpha: 0.9 });
      } else if (shape === 'flame' && variant === 'flame-stream') {
        const streamLength = 78 + intensity * 38;
        const streamWidth = 16 + intensity * 13;
        const tail = { x: from.x + dx * Math.max(0, progress - 0.36), y: from.y + dy * Math.max(0, progress - 0.36) };
        for (let lane = -2; lane <= 2; lane++) {
          const offset = lane * streamWidth * 0.26 + Math.sin(progress * 22 + lane) * 4;
          graphic.moveTo(tail.x + px * offset, tail.y + py * offset).lineTo(x + nx * streamLength + px * offset * 0.34, y + ny * streamLength + py * offset * 0.34)
            .stroke({ color: lane === 0 ? 0xfff3bc : lane % 2 ? 0xffbc4e : color, alpha: (1 - Math.abs(lane) * 0.12) * 0.82, width: streamWidth * (lane === 0 ? 0.54 : 0.38) });
        }
        for (let ember = 0; ember < 9; ember++) {
          const trail = (ember / 9 + progress * 1.8) % 1;
          const sway = Math.sin(progress * 26 + ember * 1.9) * streamWidth * 0.54;
          graphic.circle(x - nx * trail * streamLength + px * sway, y - ny * trail * streamLength + py * sway, 3 + intensity * 3).fill({ color: ember % 3 ? color : 0xffef9b, alpha: 0.72 });
        }
      } else if (shape === 'flame' && variant === 'fire-glyph') {
        const scale = 1.1 + intensity * 0.52;
        const glyphX = x + nx * 10;
        const glyphY = y + ny * 10;
        const arm = 24 * scale;
        const stroke = 8 * scale;
        const glyphAlpha = 0.92 - progress * 0.18;
        graphic.moveTo(glyphX - arm, glyphY - arm).lineTo(glyphX + arm, glyphY - arm).stroke({ color, alpha: glyphAlpha, width: stroke })
          .moveTo(glyphX, glyphY - arm).lineTo(glyphX, glyphY + arm).stroke({ color, alpha: glyphAlpha, width: stroke })
          .moveTo(glyphX - arm * 0.78, glyphY).lineTo(glyphX + arm * 0.78, glyphY).stroke({ color, alpha: glyphAlpha, width: stroke })
          .moveTo(glyphX - arm, glyphY + arm).lineTo(glyphX + arm, glyphY + arm).stroke({ color: 0xffd162, alpha: glyphAlpha, width: stroke });
        graphic.circle(glyphX, glyphY, 10 + intensity * 8).fill({ color: 0xfff4bc, alpha: 0.94 });
        for (let ember = 0; ember < 8; ember++) {
          const angle = ember / 8 * Math.PI * 2 + progress * 7;
          graphic.circle(glyphX + Math.cos(angle) * arm * 0.9, glyphY + Math.sin(angle) * arm * 0.58, 3 + intensity * 2).fill({ color: ember % 2 ? color : 0xfff0a7, alpha: 0.72 });
        }
      } else this.drawElementalProjectile(graphic, shape, { x, y }, { nx, ny, px, py }, color, intensity, progress);
      if (shape === 'generic') graphic.moveTo(from.x, from.y).lineTo(x, y).stroke({ color, alpha: (1 - progress) * 0.46, width: 6 * intensity })
        .circle(x, y, 8 + intensity * 10).fill({ color, alpha: 0.9 });
      if (variant === 'psychic-bolt' && shape !== 'psychic-orbit') {
        const orbit = 11 + intensity * 7;
        for (let index = 0; index < 3; index++) {
          const angle = progress * 18 + index * Math.PI * 2 / 3;
          graphic.circle(x + Math.cos(angle) * orbit, y + Math.sin(angle) * orbit * 0.58, 3 + intensity * 2).fill({ color: 0xffffff, alpha: (1 - progress) * 0.8 });
        }
      } else if (variant === 'elemental-bolt' && shape === 'generic') {
        graphic.star(x, y, 4, 10 + intensity * 7, 3 + intensity * 2).fill({ color: 0xffffff, alpha: (1 - progress) * 0.72 });
      }
      if (variant === 'chain') graphic.moveTo(x, y).lineTo(x + Math.sin(progress * 19) * 18, y + Math.cos(progress * 13) * 12).stroke({ color: 0xffffff, alpha: (1 - progress) * 0.75, width: 2 });
      if (variant === 'bind' || variant === 'snare') {
        const twists = variant === 'bind' ? 3 : 2;
        for (let index = 0; index < twists; index++) {
          const phase = progress * 18 + index * Math.PI / twists;
          graphic.circle(x + Math.cos(phase) * (12 + intensity * 9), y + Math.sin(phase * 1.4) * (8 + intensity * 5), 2.5 + intensity * 2).fill({ color: 0xffffff, alpha: (1 - progress) * 0.58 });
        }
      }
    });
  }

  private drawElementalProjectile(
    graphic: Graphics,
    shape: ReturnType<typeof elementalVfxShapeFor>,
    at: Point,
    basis: { nx: number; ny: number; px: number; py: number },
    color: number,
    intensity: number,
    progress: number,
  ): void {
    const { nx, ny, px, py } = basis;
    if (shape === 'flame') {
      const length = 26 + intensity * 20;
      const width = 9 + intensity * 8;
      const tip = { x: at.x + nx * length, y: at.y + ny * length };
      const left = { x: at.x + px * width, y: at.y + py * width };
      const right = { x: at.x - px * width, y: at.y - py * width };
      graphic.poly([at.x - nx * 10, at.y - ny * 10, left.x, left.y, tip.x, tip.y, right.x, right.y]).fill({ color, alpha: 0.82 })
        .poly([at.x - nx * 4, at.y - ny * 4, at.x + px * width * 0.42, at.y + py * width * 0.42, tip.x - nx * 8, tip.y - ny * 8, at.x - px * width * 0.42, at.y - py * width * 0.42]).fill({ color: 0xffefad, alpha: 0.94 });
      for (let index = 0; index < 3; index++) {
        const trail = 10 + index * 9 + progress * 13;
        graphic.circle(at.x - nx * trail + px * Math.sin(progress * 14 + index) * 5, at.y - ny * trail + py * Math.sin(progress * 14 + index) * 5, 3 + intensity * 2 - index * 0.45).fill({ color: index === 0 ? 0xffdb75 : color, alpha: 0.62 - index * 0.12 });
      }
    } else if (shape === 'lightning') {
      const length = 32 + intensity * 22;
      const segments = 5;
      let previous = { x: at.x - nx * 10, y: at.y - ny * 10 };
      for (let index = 1; index <= segments; index++) {
        const travel = length * index / segments;
        const zig = (index % 2 ? 1 : -1) * (6 + intensity * 5);
        const next = { x: at.x + nx * travel + px * zig, y: at.y + ny * travel + py * zig };
        graphic.moveTo(previous.x, previous.y).lineTo(next.x, next.y).stroke({ color: 0xffe96a, alpha: 0.92, width: 4 + intensity * 2 })
          .moveTo(previous.x, previous.y).lineTo(next.x, next.y).stroke({ color: 0xffffff, alpha: 0.88, width: 1.4 });
        if (index === 3) graphic.moveTo(next.x, next.y).lineTo(next.x + px * 13 - nx * 5, next.y + py * 13 - ny * 5).stroke({ color, alpha: 0.68, width: 2 });
        previous = next;
      }
    } else if (shape === 'psychic-orbit') {
      const orbit = 15 + intensity * 9;
      for (let ring = 0; ring < 3; ring++) {
        const angle = progress * 16 + ring * Math.PI * 2 / 3;
        const cx = at.x + Math.cos(angle) * orbit;
        const cy = at.y + Math.sin(angle) * orbit * 0.52;
        graphic.ellipse(cx, cy, 10 + ring * 2, 4 + ring).stroke({ color, alpha: 0.78 - ring * 0.14, width: 2 })
          .circle(cx, cy, 2.5 + intensity * 1.5).fill({ color: ring === 0 ? 0xffffff : color, alpha: 0.88 });
      }
      graphic.ellipse(at.x, at.y, 12 + intensity * 5, 7 + intensity * 3).stroke({ color: 0xffffff, alpha: 0.72, width: 2 });
    } else if (shape === 'water-wave') {
      graphic.moveTo(at.x - nx * 18 - px * 8, at.y - ny * 18 - py * 8).lineTo(at.x + nx * 20 + px * 10, at.y + ny * 20 + py * 10).stroke({ color, alpha: 0.78, width: 7 + intensity * 5 })
        .moveTo(at.x - nx * 16 + px * 8, at.y - ny * 16 + py * 8).lineTo(at.x + nx * 22 - px * 8, at.y + ny * 22 - py * 8).stroke({ color: 0xd7fbff, alpha: 0.78, width: 2.5 });
    } else if (shape === 'ice-shard') {
      graphic.poly([at.x + nx * 22, at.y + ny * 22, at.x - nx * 10 + px * 10, at.y - ny * 10 + py * 10, at.x - nx * 10 - px * 10, at.y - ny * 10 - py * 10]).fill({ color, alpha: 0.88 });
    } else if (shape === 'leaf') {
      for (let index = 0; index < 3; index++) {
        const a = progress * 12 + index * Math.PI * 2 / 3;
        graphic.ellipse(at.x + Math.cos(a) * 12, at.y + Math.sin(a) * 8, 9, 4).fill({ color, alpha: 0.74 });
      }
    }
  }

  private spawnImpact(at: Point, color: number, intensity: number, variant = 'default'): void {
    const graphic = new Graphics({ blendMode: 'add' });
    const duration = variant === 'dive' ? 0.48 : 0.28;
    this.addEffect(graphic, duration, (progress) => {
      const radius = 12 + progress * (34 + intensity * 28);
      graphic.clear().circle(at.x, at.y, radius).stroke({ color, alpha: (1 - progress) * 0.8, width: 5 * (1 - progress) + 1 })
        .star(at.x, at.y, variant === 'cross' ? 4 : 6, radius * 0.72, radius * 0.28).fill({ color, alpha: (1 - progress) * 0.36 });
      // Normal-attack motifs are supplied by static config through the cue. This
      // generic primitive only interprets a vocabulary; it never knows a species.
      const alpha = (1 - progress) * 0.92;
      if (variant === 'fist') {
        graphic.circle(at.x - radius * 0.2, at.y, radius * 0.42).fill({ color, alpha })
          .circle(at.x + radius * 0.22, at.y - radius * 0.14, radius * 0.28).fill({ color: 0xffffff, alpha: alpha * 0.58 });
      } else if (variant === 'claw') {
        for (let index = -1; index <= 1; index++) {
          const offset = index * radius * 0.22;
          graphic.moveTo(at.x - radius * 0.56, at.y + offset + radius * 0.42).lineTo(at.x + radius * 0.54, at.y + offset - radius * 0.42)
            .stroke({ color: index === 0 ? 0xffffff : color, alpha, width: 3 + intensity * 2 });
        }
      } else if (variant === 'bite') {
        for (const direction of [-1, 1]) {
          graphic.poly([at.x + direction * radius * 0.58, at.y - radius * 0.42, at.x + direction * radius * 0.18, at.y, at.x + direction * radius * 0.58, at.y + radius * 0.42]).fill({ color, alpha });
        }
      } else if (variant === 'horn' || variant === 'tail') {
        graphic.moveTo(at.x - radius * 0.7, at.y + radius * 0.3).lineTo(at.x + radius * 0.7, at.y - radius * 0.3).stroke({ color: 0xffffff, alpha, width: 5 + intensity * 3 });
      } else if (variant === 'body-slam') {
        graphic.ellipse(at.x, at.y, radius * 0.85, radius * 0.46).fill({ color, alpha: alpha * 0.58 });
      } else if (variant === 'wing-slap') {
        for (const side of [-1, 1]) graphic.moveTo(at.x - radius * 0.62, at.y + side * radius * 0.28).lineTo(at.x + radius * 0.62, at.y - side * radius * 0.28).stroke({ color: side > 0 ? 0xffffff : color, alpha, width: 5 + intensity * 3 });
      } else if (variant === 'beak-peck' || variant === 'tusk-gore') {
        const prongs = variant === 'tusk-gore' ? [-1, 1] : [0];
        for (const prong of prongs) graphic.poly([at.x - radius * 0.68, at.y + prong * radius * 0.22, at.x + radius * 0.70, at.y + prong * radius * 0.12, at.x - radius * 0.18, at.y + prong * radius * 0.48]).fill({ color: prong === 0 ? 0xffffff : color, alpha });
      } else if (variant === 'pincer-snap') {
        for (const side of [-1, 1]) graphic.moveTo(at.x - radius * 0.54, at.y + side * radius * 0.54).lineTo(at.x + radius * 0.50, at.y + side * radius * 0.12).lineTo(at.x + radius * 0.17, at.y).stroke({ color: side > 0 ? 0xffffff : color, alpha, width: 5 + intensity * 3 });
      } else if (variant === 'whip-lash') {
        graphic.moveTo(at.x - radius * 0.72, at.y + radius * 0.34).lineTo(at.x - radius * 0.12, at.y - radius * 0.48).lineTo(at.x + radius * 0.70, at.y + radius * 0.10).stroke({ color, alpha, width: 5 + intensity * 3 });
      } else if (variant === 'kick') {
        graphic.moveTo(at.x - radius * 0.62, at.y + radius * 0.46).lineTo(at.x + radius * 0.62, at.y - radius * 0.30).stroke({ color: 0xffffff, alpha, width: 7 + intensity * 3 });
      } else if (variant === 'shell-bash') {
        graphic.arc(at.x, at.y, radius * 0.68, Math.PI * 0.15, Math.PI * 1.85).stroke({ color, alpha, width: 7 + intensity * 3 }).circle(at.x, at.y, radius * 0.30).fill({ color: 0xffffff, alpha: alpha * 0.46 });
      }
      if (variant === 'fire-glyph') {
        const glyph = radius * (0.72 + progress * 0.42);
        const line = Math.max(4, 7 + intensity * 4 - progress * 3);
        graphic.moveTo(at.x - glyph, at.y - glyph).lineTo(at.x + glyph, at.y - glyph).stroke({ color, alpha: alpha * 0.84, width: line })
          .moveTo(at.x, at.y - glyph).lineTo(at.x, at.y + glyph).stroke({ color: 0xffe08a, alpha, width: line })
          .moveTo(at.x - glyph * 0.8, at.y).lineTo(at.x + glyph * 0.8, at.y).stroke({ color, alpha, width: line })
          .moveTo(at.x - glyph, at.y + glyph).lineTo(at.x + glyph, at.y + glyph).stroke({ color: 0xffbc4b, alpha: alpha * 0.82, width: line });
        graphic.circle(at.x, at.y, glyph * 0.43).fill({ color: 0xfff2b1, alpha: alpha * 0.82 });
        for (let index = 0; index < 10; index++) {
          const angle = index / 10 * Math.PI * 2 + progress * 4;
          const distance = glyph * (0.68 + progress * 0.46);
          graphic.moveTo(at.x + Math.cos(angle) * glyph * 0.18, at.y + Math.sin(angle) * glyph * 0.14)
            .lineTo(at.x + Math.cos(angle) * distance, at.y + Math.sin(angle) * distance * 0.62)
            .stroke({ color: index % 2 ? color : 0xffe69c, alpha: alpha * 0.86, width: 2 + intensity * 2 });
        }
      }
      if (variant === 'dive') {
        // Independent impact burst: the release trail is drawn by spawnDive;
        // this target-local phase must read as a fireball detonation on its own.
        const blast = 26 + progress * (46 + intensity * 36);
        graphic.circle(at.x, at.y, blast * (0.55 + progress * 0.25)).fill({ color, alpha: (1 - progress) * 0.30 })
          .circle(at.x, at.y, blast * 0.38).fill({ color: 0xffefae, alpha: (1 - progress) * 0.76 });
        for (let index = 0; index < 9; index++) {
          const angle = index / 9 * Math.PI * 2 + progress * 1.4;
          const distance = blast * (0.46 + progress * (0.42 + (index % 2) * 0.12));
          const x = at.x + Math.cos(angle) * distance;
          const y = at.y + Math.sin(angle) * distance * 0.65;
          graphic.moveTo(at.x + Math.cos(angle) * blast * 0.18, at.y + Math.sin(angle) * blast * 0.12)
            .lineTo(x, y).stroke({ color: index % 2 ? 0xffbd4b : 0xff6a32, alpha: (1 - progress) * 0.90, width: 3 + intensity * 3 })
            .circle(x, y, 3 + intensity * 3).fill({ color: 0xffe7a0, alpha: (1 - progress) * 0.84 });
        }
      }
    });
  }

  /** Generic source-to-target plunge used by any melee recipe with the `dive`
   * motif. The layered taper and staggered embers deliberately read as flame
   * rather than a flat rectangular beam. */
  private spawnDive(from: Point, to: Point, color: number, intensity: number): void {
    const graphic = new Graphics({ blendMode: 'add' });
    const duration = 0.38;
    this.addEffect(graphic, duration, (progress) => {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const nx = dx / length;
      const ny = dy / length;
      const px = -ny;
      const py = nx;
      const headT = Math.min(1, progress * 1.22);
      const tailT = Math.max(0, headT - 0.36);
      const head = { x: from.x + dx * headT, y: from.y + dy * headT };
      const tail = { x: from.x + dx * tailT, y: from.y + dy * tailT };
      const headWidth = 10 + intensity * 9;
      const tailWidth = 3 + intensity * 4;
      const flare = Math.sin(progress * Math.PI) * (5 + intensity * 5);
      graphic.clear()
        .poly([
          tail.x + px * tailWidth, tail.y + py * tailWidth,
          head.x + px * (headWidth + flare), head.y + py * (headWidth + flare),
          head.x - px * (headWidth + flare), head.y - py * (headWidth + flare),
          tail.x - px * tailWidth, tail.y - py * tailWidth,
        ]).fill({ color, alpha: 0.46 })
        .poly([
          tail.x + px * Math.max(1, tailWidth * 0.38), tail.y + py * Math.max(1, tailWidth * 0.38),
          head.x + px * (headWidth * 0.36), head.y + py * (headWidth * 0.36),
          head.x - px * (headWidth * 0.36), head.y - py * (headWidth * 0.36),
          tail.x - px * Math.max(1, tailWidth * 0.38), tail.y - py * Math.max(1, tailWidth * 0.38),
        ]).fill({ color: 0xfff1ae, alpha: 0.88 });
      const emberCount = this.quality === 'cinematic' ? 8 : this.quality === 'standard' ? 5 : 3;
      for (let index = 0; index < emberCount; index++) {
        const t = Math.max(0, headT - index / (emberCount + 1) * 0.42);
        const sway = Math.sin(progress * 18 + index * 2.3) * (5 + intensity * 4);
        const x = from.x + dx * t + px * sway;
        const y = from.y + dy * t + py * sway;
        graphic.circle(x, y, Math.max(2, 5 + intensity * 3 - index * 0.35)).fill({ color: index % 2 ? color : 0xffea9a, alpha: 0.80 - index * 0.055 });
      }
      graphic.circle(head.x, head.y, 10 + intensity * 10).fill({ color: 0xfff0b1, alpha: 0.94 })
        .circle(head.x, head.y, 17 + intensity * 14).stroke({ color, alpha: 0.68, width: 3 + intensity * 2 });
    });
  }

  private spawnBeam(from: Point, to: Point, color: number, intensity: number, variant = 'default', element?: import('@pokemon-online/shared').TypeName): void {
    const graphic = new Graphics({ blendMode: 'add' });
    const shape = elementalVfxShapeFor(element);
    const duration = 0.38 + intensity * 0.18;
    this.addEffect(graphic, duration, (progress) => {
      const alpha = Math.sin(Math.PI * progress) * 0.92;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const nx = dx / length;
      const ny = dy / length;
      const px = -ny;
      const py = nx;
      const width = 10 + intensity * 22;
      graphic.clear();
      if (shape === 'flame' && variant === 'flame-stream') {
        const streamWidth = 18 + intensity * 24;
        const tongueCount = this.quality === 'cinematic' ? 7 : this.quality === 'standard' ? 5 : 3;
        for (let lane = -2; lane <= 2; lane++) {
          const offset = lane * streamWidth * 0.28 + Math.sin(progress * 24 + lane * 2.1) * streamWidth * 0.10;
          graphic.moveTo(from.x + px * offset, from.y + py * offset).lineTo(to.x + px * offset * 0.34, to.y + py * offset * 0.34)
            .stroke({ color: lane === 0 ? 0xfff4bd : lane % 2 ? 0xffc14f : color, alpha: alpha * (lane === 0 ? 0.96 : 0.58), width: streamWidth * (lane === 0 ? 0.48 : 0.34) });
        }
        for (let tongue = 0; tongue < tongueCount; tongue++) {
          const t = (tongue / tongueCount + progress * 0.50) % 1;
          const sway = Math.sin(progress * 22 + tongue * 1.7) * streamWidth * 0.62;
          const cx = from.x + dx * t + px * sway;
          const cy = from.y + dy * t + py * sway;
          graphic.poly([cx - px * 5, cy - py * 5, cx + nx * (18 + intensity * 13), cy + ny * (18 + intensity * 13), cx + px * 5, cy + py * 5]).fill({ color: tongue % 3 ? color : 0xffef9d, alpha: alpha * 0.82 });
        }
      } else if (shape === 'flame') {
        for (let lane = -1; lane <= 1; lane++) {
          const offset = lane * width * 0.28;
          graphic.moveTo(from.x + px * offset, from.y + py * offset).lineTo(to.x + px * offset, to.y + py * offset).stroke({ color: lane === 0 ? 0xffefad : color, alpha: alpha * (lane === 0 ? 0.92 : 0.56), width: lane === 0 ? width * 0.46 : width * 0.38 });
        }
        for (let ember = 0; ember < 7; ember++) {
          const t = (ember / 6 + progress * 0.42) % 1;
          const sway = Math.sin(progress * 18 + ember * 2.2) * width * 0.34;
          graphic.circle(from.x + dx * t + px * sway, from.y + dy * t + py * sway, 3 + intensity * 4).fill({ color: ember % 2 ? color : 0xffd56e, alpha: alpha * 0.78 });
        }
      } else if (shape === 'lightning') {
        const segments = 9;
        let previous = from;
        for (let index = 1; index <= segments; index++) {
          const t = index / segments;
          const zig = index === segments ? 0 : (index % 2 ? 1 : -1) * width * (0.42 + Math.sin(progress * 15 + index) * 0.16);
          const next = { x: from.x + dx * t + px * zig, y: from.y + dy * t + py * zig };
          graphic.moveTo(previous.x, previous.y).lineTo(next.x, next.y).stroke({ color: 0xffe96a, alpha, width: width * 0.42 })
            .moveTo(previous.x, previous.y).lineTo(next.x, next.y).stroke({ color: 0xffffff, alpha, width: 2.5 });
          if (index === 3 || index === 6) graphic.moveTo(next.x, next.y).lineTo(next.x + px * width * 1.1 - nx * 12, next.y + py * width * 1.1 - ny * 12).stroke({ color, alpha: alpha * 0.72, width: 3 });
          previous = next;
        }
      } else if (shape === 'psychic-orbit') {
        graphic.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ color, alpha: alpha * 0.48, width: width * 0.42 });
        for (let ring = 0; ring < 6; ring++) {
          const t = ring / 5;
          const phase = progress * 10 + ring * 1.7;
          const cx = from.x + dx * t + px * Math.sin(phase) * width * 0.46;
          const cy = from.y + dy * t + py * Math.sin(phase) * width * 0.46;
          graphic.ellipse(cx, cy, width * 0.70, width * 0.28).stroke({ color: ring % 2 ? color : 0xffffff, alpha: alpha * 0.75, width: 2.4 });
        }
      } else {
        graphic.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ color, alpha, width })
          .moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ color: 0xffffff, alpha: alpha * 0.75, width: 2 });
      }
      if (variant === 'meteor') graphic.circle(to.x, to.y, 22 + progress * (22 + intensity * 18)).stroke({ color, alpha: alpha * 0.48, width: 3 });
    });
  }

  private spawnBurst(at: Point, color: number, intensity: number, variant = 'default', particleBudget?: number, element?: import('@pokemon-online/shared').TypeName): void {
    const graphic = new Graphics({ blendMode: 'add' });
    const qualityCap = this.quality === 'cinematic' ? 24 : this.quality === 'standard' ? 16 : 9;
    const particleCount = Math.min(Math.max(particleBudget ?? qualityCap, 9), qualityCap);
    const shape = elementalVfxShapeFor(element);
    const duration = 0.46 + intensity * 0.22;
    this.addEffect(graphic, duration, (progress) => {
      const blast = 46 + intensity * 78;
      const alpha = (1 - progress) * 0.92;
      graphic.clear();
      if (shape === 'flame') {
        graphic.circle(at.x, at.y, blast * (0.22 + progress * 0.48)).fill({ color, alpha: alpha * 0.28 })
          .circle(at.x, at.y, blast * (0.13 + progress * 0.25)).fill({ color: 0xffefad, alpha: alpha * 0.84 });
        for (let flame = 0; flame < 10; flame++) {
          const angle = flame / 10 * Math.PI * 2 + progress * 0.8;
          const rise = blast * (0.34 + progress * 0.5);
          const bx = at.x + Math.cos(angle) * rise;
          const by = at.y + Math.sin(angle) * rise * 0.58;
          graphic.poly([bx - 7, by + 12, bx + Math.cos(angle) * 14, by - 20 - intensity * 18, bx + 8, by + 12]).fill({ color: flame % 2 ? color : 0xffc95d, alpha: alpha * 0.86 });
        }
      } else if (shape === 'lightning') {
        for (let bolt = 0; bolt < 5; bolt++) {
          const angle = bolt / 5 * Math.PI * 2 + progress * 0.28;
          const end = { x: at.x + Math.cos(angle) * blast * 0.72, y: at.y + Math.sin(angle) * blast * 0.44 };
          let previous = { x: at.x, y: at.y - 72 - bolt * 6 };
          for (let segment = 1; segment <= 5; segment++) {
            const t = segment / 5;
            const nx = previous.x + (end.x - previous.x) * t + Math.sin(segment * 3.2 + bolt) * 12;
            const ny = previous.y + (end.y - previous.y) * t;
            graphic.moveTo(previous.x, previous.y).lineTo(nx, ny).stroke({ color: 0xffe96a, alpha, width: 5 + intensity * 3 })
              .moveTo(previous.x, previous.y).lineTo(nx, ny).stroke({ color: 0xffffff, alpha, width: 1.8 });
            previous = { x: nx, y: ny };
          }
        }
        graphic.circle(at.x, at.y, blast * 0.28).stroke({ color: 0xfff4a5, alpha: alpha * 0.76, width: 4 });
      } else if (shape === 'psychic-orbit') {
        for (let ring = 0; ring < 5; ring++) {
          const radius = blast * (0.20 + ring * 0.13 + progress * 0.17);
          const rotation = progress * 8 + ring * 0.64;
          const cx = at.x + Math.cos(rotation) * ring * 8;
          const cy = at.y + Math.sin(rotation) * ring * 5;
          graphic.ellipse(cx, cy, radius, radius * 0.38).stroke({ color: ring % 2 ? color : 0xffffff, alpha: alpha * (0.80 - ring * 0.09), width: 3 });
        }
        for (let rune = 0; rune < 7; rune++) {
          const angle = rune / 7 * Math.PI * 2 - progress * 5;
          graphic.circle(at.x + Math.cos(angle) * blast * 0.52, at.y + Math.sin(angle) * blast * 0.28, 5 + intensity * 3).fill({ color, alpha: alpha * 0.82 });
        }
      } else {
        for (let index = 0; index < particleCount; index++) {
          const angle = index / particleCount * Math.PI * 2;
          const radius = progress * blast * (0.65 + (index % 3) * 0.16);
          graphic.circle(at.x + Math.cos(angle) * radius, at.y + Math.sin(angle) * radius * (variant === 'surge' ? 0.82 : 0.55), 4 + intensity * 5).fill({ color, alpha: alpha * 0.82 });
        }
      }
    });
  }

  private spawnRing(at: Point, color: number, intensity: number, variant = 'default', element?: import('@pokemon-online/shared').TypeName): void {
    const graphic = new Graphics({ blendMode: 'add' });
    const shape = elementalVfxShapeFor(element);
    const duration = variant === 'bind' || variant === 'snare' ? 0.64 : variant === 'dive' ? 0.80 : 0.48 + intensity * 0.16;
    this.addEffect(graphic, duration, (progress) => {
      const radius = 22 + progress * (62 + intensity * 58);
      const alpha = (1 - progress) * 0.86;
      graphic.clear().circle(at.x, at.y, radius).stroke({ color, alpha: alpha * 0.68, width: 3 + intensity * 4 });
      if (shape === 'flame') {
        for (let flame = 0; flame < 7; flame++) {
          const angle = flame / 7 * Math.PI * 2 + progress * 1.8;
          const distance = radius * 0.58;
          const x = at.x + Math.cos(angle) * distance;
          const y = at.y + Math.sin(angle) * distance * 0.58;
          graphic.poly([x - 6, y + 12, x + Math.cos(angle) * 12, y - 18 - intensity * 15, x + 7, y + 12]).fill({ color: flame % 2 ? color : 0xffe383, alpha: alpha * 0.88 });
        }
        graphic.circle(at.x, at.y, radius * 0.35).fill({ color: 0xffb353, alpha: alpha * 0.36 }).circle(at.x, at.y, radius * 0.17).fill({ color: 0xfff4b5, alpha: alpha * 0.86 });
      } else if (shape === 'lightning') {
        for (let bolt = 0; bolt < 4; bolt++) {
          const angle = bolt / 4 * Math.PI * 2 + progress * 0.45;
          const end = { x: at.x + Math.cos(angle) * radius, y: at.y + Math.sin(angle) * radius * 0.62 };
          const middle = { x: at.x + Math.cos(angle + 0.6) * radius * 0.46, y: at.y + Math.sin(angle + 0.6) * radius * 0.30 };
          graphic.moveTo(at.x, at.y).lineTo(middle.x, middle.y).lineTo(end.x, end.y).stroke({ color: 0xffe96a, alpha, width: 4 + intensity * 3 })
            .moveTo(at.x, at.y).lineTo(middle.x, middle.y).lineTo(end.x, end.y).stroke({ color: 0xffffff, alpha, width: 1.6 });
        }
        graphic.circle(at.x, at.y, radius * 0.18).fill({ color: 0xfff4a5, alpha: alpha * 0.78 });
      } else if (shape === 'psychic-orbit') {
        for (let ring = 0; ring < 4; ring++) {
          const orbit = radius * (0.34 + ring * 0.14);
          const phase = progress * 9 + ring * 0.8;
          graphic.ellipse(at.x + Math.cos(phase) * ring * 6, at.y + Math.sin(phase) * ring * 4, orbit, orbit * 0.36).stroke({ color: ring % 2 ? color : 0xffffff, alpha: alpha * (0.88 - ring * 0.13), width: 2.8 });
        }
        graphic.ellipse(at.x, at.y, radius * 0.24, radius * 0.12).fill({ color, alpha: alpha * 0.52 });
      }
      if (variant === 'hymn' || variant === 'chant') graphic.star(at.x, at.y, 5, radius * 0.66, radius * 0.34).stroke({ color: 0xffffff, alpha: alpha * 0.46, width: 1.8 });
      if (variant === 'crown') graphic.star(at.x, at.y, 7, radius * 0.86, radius * 0.4).stroke({ color: 0xffffff, alpha: alpha * 0.56, width: 2.4 });
      if (variant === 'bind' || variant === 'snare') {
        const coils = variant === 'bind' ? 3 : 2;
        for (let index = 0; index < coils; index++) {
          const angle = progress * Math.PI * 3 + index * Math.PI * 2 / coils;
          const coilRadius = radius * (0.46 + index * 0.12);
          graphic.ellipse(at.x + Math.cos(angle) * coilRadius * 0.32, at.y - 5 + Math.sin(angle) * coilRadius * 0.16, coilRadius * 0.78, coilRadius * 0.28).stroke({ color, alpha: alpha * 0.78, width: 2.6 });
        }
      }
      if (variant === 'dive') {
        const core = 18 + intensity * 16 + Math.sin(progress * Math.PI * 5) * 4;
        graphic.circle(at.x, at.y - 8, core).fill({ color, alpha: 0.30 + Math.sin(progress * Math.PI) * 0.20 })
          .circle(at.x, at.y - 8, core * 0.52).fill({ color: 0xffefab, alpha: 0.62 });
        for (let index = 0; index < 4; index++) {
          const angle = progress * 7 + index * Math.PI * 2 / 4;
          const orbit = 24 + intensity * 15;
          const x = at.x + Math.cos(angle) * orbit;
          const y = at.y - 12 + Math.sin(angle) * orbit * 0.46 - progress * 20;
          graphic.moveTo(x, y + 12).lineTo(x + Math.cos(angle) * 7, y - 15 - intensity * 9).lineTo(x - Math.sin(angle) * 6, y + 5).fill({ color: index === 0 ? 0xfff0ae : color, alpha: 0.90 });
        }
      }
    });
  }

  private spawnEnvironmentReaction(at: Point, reaction?: string): void {
    const spec = battleEnvironmentFor(this.biomeId);
    if (!reaction || !spec.reactions.includes(reaction as typeof spec.reactions[number])) return;
    const colors: Record<string, number> = { scorch: 0xff8a4c, spark: 0xffea68, frost: 0xb7edff, splash: 0x72d9ff, spore: 0xb8ef80, debris: 0xc4a16d, 'rune-pulse': 0xc093ff };
    const color = colors[reaction] ?? 0xffffff;
    const graphic = new Graphics({ blendMode: 'add' });
    this.addEffect(graphic, 0.54, (progress) => {
      graphic.clear();
      if (reaction === 'splash') graphic.circle(at.x, at.y + 16 - progress * 14, 12 + progress * 28).stroke({ color, alpha: (1 - progress) * 0.62, width: 3 });
      else if (reaction === 'debris') for (let index = 0; index < 5; index++) graphic.rect(at.x + (index - 2) * 10, at.y + 18 - progress * (18 + index % 2 * 12), 5, 5).fill({ color, alpha: (1 - progress) * 0.64 });
      else if (reaction === 'rune-pulse') graphic.star(at.x, at.y, 6, 16 + progress * 34, 8 + progress * 15).stroke({ color, alpha: (1 - progress) * 0.58, width: 2 });
      else graphic.ellipse(at.x, at.y + 24, 36 + progress * 18, 10 + progress * 4).fill({ color, alpha: (1 - progress) * 0.24 });
    });
  }

  private addEffect(graphic: Graphics, duration: number, update: (progress: number) => void): void {
    graphic.alpha = this.visualSettings.reduceFlicker ? 0.46 : 1;
    this.effects.addChild(graphic);
    this.activeEffects.push({ graphic, elapsed: 0, duration, update });
  }

  private update(dt: number): void {
    const clock = this.hitStopSeconds > 0 ? 0 : dt;
    this.hitStopSeconds = Math.max(0, this.hitStopSeconds - dt);
    for (const cooldowns of [this.contactCooldowns, this.pressureCooldowns]) {
      for (const [uid, remaining] of cooldowns) {
        const next = Math.max(0, remaining - dt);
        if (next === 0) cooldowns.delete(uid);
        else cooldowns.set(uid, next);
      }
    }
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
      const targetScale = this.targetScales.get(uid) ?? 1;
      const visibleScale = (this.visualScales.get(uid) ?? targetScale) + (targetScale - (this.visualScales.get(uid) ?? targetScale)) * positionBlend;
      this.visualScales.set(uid, visibleScale);
      const view = this.views.get(uid);
      if (view) {
        view.position.set(visible.x, visible.y);
        view.scale.set(visibleScale);
        view.zIndex = visible.y;
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
      { layer: this.effects, factor: 1, shake: true },
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
    this.activeEffects = this.activeEffects.filter((effect) => {
      effect.elapsed += clock;
      effect.update(Math.min(1, effect.elapsed / effect.duration));
      if (effect.elapsed < effect.duration) return true;
      effect.graphic.destroy();
      return false;
    });
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

function colorNumber(value: string): number {
  const parsed = Number.parseInt(value.replace('#', ''), 16);
  return Number.isFinite(parsed) ? parsed : 0xffffff;
}
