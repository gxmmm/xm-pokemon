import { DEFAULT_VISUAL_RUNTIME_SETTINGS, type AssetKey, type BattleCue, type BattleRenderInput, type BattleRenderSnapshot, type BattleRenderer, type QualityProfile, type SceneTransitionRequest, type VisualRuntimeSettings } from '@pokemon-online/renderer';
import { BATTLE_ASSET_BY_ID, battleEnvironmentFor, resolveBattleArtPresentation, type BattleEnvironmentSpec } from '@pokemon-online/config';
import { Application, Container, Graphics } from 'pixi.js';
import { elementColor, planBattleCue, type BattleStageVfxPlan } from './battle-plan.ts';
import { BattleArtAssetLoader } from './BattleArtAssets.ts';
import { battleContactPoint, projectBattleGroundPoint } from './battle-ground.ts';
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
  private positions = new Map<string, Point>();
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
    this.contactGraphics.clear();
    this.contactPositions.clear();
    this.contactCooldowns.clear();
    this.pressureCooldowns.clear();
    this.battleArtAssets.clear();
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
    this.drawEnvironment();
    const entries = input.combatants.map((combatant) => resolveBattleArtPresentation({ speciesId: combatant.speciesId, side: combatant.side, facing: combatant.facing }).asset);
    await this.battleArtAssets.preload(entries);
    this.applyBattleSnapshot({ time: 0, combatants: input.combatants });
  }

  applyBattleSnapshot(snapshot: BattleRenderSnapshot): void {
    const active = new Set(snapshot.combatants.map((combatant) => combatant.uid));
    for (const [uid, view] of this.views) {
      if (!active.has(uid)) {
        view.destroy();
        this.views.delete(uid);
        this.positions.delete(uid);
        this.contactPositions.delete(uid);
        this.contactCooldowns.delete(uid);
        this.pressureCooldowns.delete(uid);
        const contact = this.contactGraphics.get(uid);
        contact?.destroy();
        this.contactGraphics.delete(uid);
      }
    }
    for (const combatant of snapshot.combatants) {
      const point = this.project(combatant.pixel.x, combatant.pixel.y);
      this.positions.set(combatant.uid, point);
      let view = this.views.get(combatant.uid);
      if (!view) {
        view = new CombatantView(combatant, this.battleArtAssets);
        this.views.set(combatant.uid, view);
        this.combatants.addChild(view);
      } else {
        view.refresh(combatant);
      }
      // Render position always follows the delayed snapshot smoothly. Engine
      // castProgress remains the only authoritative movement lock; CombatantView
      // adds its action offsets locally, avoiding a catch-up teleport after a
      // visual prepare, cast, or recovery pose finishes.
      view.position.set(point.x, point.y);
      this.updateTerrainContact(combatant.uid, combatant.speciesId, point);
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
    this.drawBackdropGrammar(spec);
    this.drawHorizonGrammar(spec);
    this.drawPerspectiveGround(spec);
    this.drawAmbientGrammar(spec);
    this.drawForegroundGrammar(spec);
  }

  private detailDensity(): number {
    return this.quality === 'cinematic' ? 1 : this.quality === 'standard' ? 0.62 : 0.30;
  }

  private drawBackdropGrammar(spec: BattleEnvironmentSpec): void {
    const { horizon, groundDetail, accent } = spec.palette;
    const graphic = new Graphics();
    if (spec.backdrop === 'forest-canopy') {
      for (let index = -3; index < 17; index++) {
        const x = index * 104 - 46;
        const height = 32 + (index * 29) % 34;
        // Canopy is deliberately contained above the horizon. Trees are distant
        // scenery, never obstacles in the unit's navigable battle plane.
        graphic.ellipse(x + 58, 236 - height * 0.18, 78 + index % 3 * 20, height).fill({ color: horizon, alpha: 0.82 });
        graphic.rect(x + 54, 244 - height * 0.10, 10, 42).fill({ color: groundDetail, alpha: 0.20 });
      }
    } else if (spec.backdrop === 'cave-pillars') {
      for (let index = 0; index < 9; index++) {
        const x = index * 164 - 28;
        const top = 106 + (index % 3) * 31;
        graphic.poly([x, 290, x + 28, top, x + 68, 290]).fill({ color: horizon, alpha: 0.88 });
        graphic.poly([x + 78, 290, x + 108, 155 + (index % 2) * 38, x + 146, 290]).fill({ color: groundDetail, alpha: 0.30 });
      }
    } else if (spec.backdrop === 'tide-cliffs') {
      for (let index = 0; index < 8; index++) {
        const x = index * 182 - 45;
        const h = 36 + (index * 19) % 70;
        graphic.poly([x, 291, x + 50, 291 - h, x + 132, 291]).fill({ color: horizon, alpha: 0.74 });
      }
      graphic.moveTo(0, 290).lineTo(DESIGN_WIDTH, 290).stroke({ color: accent, alpha: 0.32, width: 3 });
    } else if (spec.backdrop === 'dragon-rift') {
      for (let index = 0; index < 12; index++) {
        const x = index * 115 - 35;
        const h = 44 + (index * 17) % 85;
        graphic.poly([x, 294, x + 24, 294 - h, x + 49, 294]).fill({ color: horizon, alpha: 0.76 });
        graphic.moveTo(x + 24, 294 - h).lineTo(x + 30, 294 - h * 0.42).stroke({ color: accent, alpha: 0.34, width: 2 });
      }
    } else {
      graphic.rect(0, 180, DESIGN_WIDTH, 112).fill({ color: horizon, alpha: 0.62 });
      for (let index = 0; index < 9; index++) {
        const x = 72 + index * 145;
        graphic.rect(x, 176 + index % 2 * 20, 7, 116 - index % 3 * 17).fill({ color: groundDetail, alpha: 0.42 });
        graphic.poly([x - 28, 204, x + 3, 184, x + 31, 204]).fill({ color: accent, alpha: 0.18 });
      }
    }
    this.farBackdrop.addChild(graphic);
  }

  private drawHorizonGrammar(spec: BattleEnvironmentSpec): void {
    const { horizon, mote } = spec.palette;
    const o = spec.overscan;
    const graphic = new Graphics();
    graphic.ellipse(DESIGN_WIDTH / 2, 300, 660 + o, 82 + o * 0.16).fill({ color: horizon, alpha: 0.38 });
    for (let index = 0; index < 7; index++) {
      const y = 275 + index * 8;
      graphic.moveTo(-o, y).lineTo(DESIGN_WIDTH + o, y).stroke({ color: mote, alpha: 0.035 + index * 0.012, width: 1 });
    }
    this.horizonLayer.addChild(graphic);
  }

  private drawPerspectiveGround(spec: BattleEnvironmentSpec): void {
    const { groundDetail, accent } = spec.palette;
    const o = spec.overscan;
    const ground = new Graphics();
    const topY = 294;
    ground.poly([-o, topY, DESIGN_WIDTH + o, topY, DESIGN_WIDTH + o, DESIGN_HEIGHT + o, -o, DESIGN_HEIGHT + o]).fill({ color: spec.palette.ground });
    // Successive bands widen toward camera, replacing the former uniform rectangle.
    for (let index = 0; index < 7; index++) {
      const t = (index + 1) / 7;
      const y = topY + (DESIGN_HEIGHT - topY) * t * t;
      const inset = 170 * (1 - t);
      ground.moveTo(inset, y).lineTo(DESIGN_WIDTH - inset, y).stroke({ color: groundDetail, alpha: 0.10 + t * 0.11, width: 1 + t * 1.5 });
    }
    for (let index = 0; index < 6; index++) {
      const x = 235 + index * 162;
      ground.moveTo(DESIGN_WIDTH / 2 + (x - DESIGN_WIDTH / 2) * 0.22, topY).lineTo(x, DESIGN_HEIGHT).stroke({ color: accent, alpha: 0.08, width: 1 });
    }
    this.groundLayer.addChild(ground);

    const count = spec.groundPattern === 'grass-lanes'
      ? Math.max(62, Math.round(96 * spec.density * this.detailDensity()))
      : Math.max(12, Math.round(42 * spec.density * this.detailDensity()));
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
      graphic.poly([0, DESIGN_HEIGHT, 0, 560, 106, 600, 164, DESIGN_HEIGHT]).fill({ color: groundDetail, alpha: 0.34 });
      graphic.poly([DESIGN_WIDTH, DESIGN_HEIGHT, DESIGN_WIDTH, 548, DESIGN_WIDTH - 120, 604, DESIGN_WIDTH - 175, DESIGN_HEIGHT]).fill({ color: groundDetail, alpha: 0.34 });
    } else if (spec.foregroundFrame === 'spray') {
      for (let index = 0; index < 14; index++) graphic.ellipse(index * 102, 694 - index % 3 * 7, 42, 8).stroke({ color: mote, alpha: 0.18, width: 2 });
    } else if (spec.foregroundFrame === 'crystal-veils') {
      for (const x of [0, 78, 1115, 1202]) graphic.poly([x, DESIGN_HEIGHT, x + 22, 572, x + 62, DESIGN_HEIGHT]).fill({ color: accent, alpha: 0.22 });
    } else {
      for (let index = 0; index < 6; index++) {
        const x = 74 + index * 220;
        graphic.rect(x, 612 + index % 2 * 12, 8, 108).fill({ color: groundDetail, alpha: 0.28 });
        graphic.poly([x - 26, 622, x + 4, 595, x + 34, 622]).fill({ color: accent, alpha: 0.14 });
      }
    }
    this.foreground.addChild(graphic);
  }

  private project(pixelX: number, pixelY: number): Point {
    return projectBattleGroundPoint(pixelX, pixelY);
  }

  private aimCamera(ids: readonly string[], zoom: number, shake: number): void {
    // Spectator framing: ordinary exchanges remain stable, while a configured
    // track/impact/finisher cue may gently center the participating pair. The
    // bounded offset keeps a 3v3 board legible instead of turning every skill
    // into a disorienting close-up.
    const intensity = this.cameraIntensityFactor();
    const decisiveZoom = Math.max(1, Math.min(1.08, zoom));
    const points = ids.map((id) => this.positions.get(id)).filter((point): point is Point => !!point);
    const center = points.length
      ? { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length }
      : { x: DESIGN_WIDTH / 2, y: DESIGN_HEIGHT / 2 };
    const rawOffset = {
      x: Math.max(-42, Math.min(42, (DESIGN_WIDTH / 2 - center.x) * 0.18)),
      y: Math.max(-24, Math.min(24, (DESIGN_HEIGHT * 0.52 - center.y) * 0.14)),
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
    const target = actor ? battleContactPoint(targetRoot, actor) : { x: targetRoot.x, y: targetRoot.y - 56 };
    const color = elementColor(plan.element);
    if (plan.primitive === 'projectile' && actor) {
      this.spawnProjectile(actor, target, color, plan.intensity, plan.variant);
    } else if (plan.primitive === 'dive' && actor) {
      this.spawnDive(actor, target, color, plan.intensity);
    } else if (plan.primitive === 'beam' && actor) {
      this.spawnBeam(actor, target, color, plan.intensity, plan.variant);
    } else if (plan.primitive === 'burst') {
      this.spawnBurst(target, color, plan.intensity, plan.variant, plan.particleBudget);
    } else if (plan.primitive === 'ring') {
      this.spawnRing(target, color, plan.intensity, plan.variant);
    } else if (plan.primitive === 'environment') {
      if (plan.actorId || plan.targetIds.length > 0) this.spawnEnvironmentReaction(target, plan.reaction);
    } else {
      this.spawnImpact(target, color, plan.intensity, plan.variant);
    }
  }

  private spawnProjectile(from: Point, to: Point, color: number, intensity: number, variant = 'default'): void {
    const graphic = new Graphics({ blendMode: 'add' });
    const duration = variant === 'bind' || variant === 'snare' ? 0.34 : 0.26 + (1 - intensity) * 0.1;
    this.addEffect(graphic, duration, (progress) => {
      const x = from.x + (to.x - from.x) * progress;
      const y = from.y + (to.y - from.y) * progress;
      graphic.clear().moveTo(from.x, from.y).lineTo(x, y).stroke({ color, alpha: (1 - progress) * 0.46, width: 6 * intensity })
        .circle(x, y, 8 + intensity * 10).fill({ color, alpha: 0.9 });
      if (variant === 'psychic-bolt') {
        const orbit = 11 + intensity * 7;
        for (let index = 0; index < 3; index++) {
          const angle = progress * 18 + index * Math.PI * 2 / 3;
          graphic.circle(x + Math.cos(angle) * orbit, y + Math.sin(angle) * orbit * 0.58, 3 + intensity * 2).fill({ color: 0xffffff, alpha: (1 - progress) * 0.8 });
        }
      } else if (variant === 'elemental-bolt') {
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

  private spawnBeam(from: Point, to: Point, color: number, intensity: number, variant = 'default'): void {
    const graphic = new Graphics({ blendMode: 'add' });
    this.addEffect(graphic, 0.34, (progress) => {
      const alpha = Math.sin(Math.PI * progress) * 0.8;
      graphic.clear().moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ color, alpha, width: 8 + intensity * 13 })
        .moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ color: 0xffffff, alpha: alpha * 0.75, width: 2 });
      if (variant === 'meteor') graphic.circle(to.x, to.y, 16 + progress * 12).stroke({ color, alpha: alpha * 0.45, width: 2 });
    });
  }

  private spawnBurst(at: Point, color: number, intensity: number, variant = 'default', particleBudget?: number): void {
    const graphic = new Graphics({ blendMode: 'add' });
    const qualityCap = this.quality === 'cinematic' ? 18 : this.quality === 'standard' ? 11 : 6;
    const particleCount = Math.min(particleBudget ?? qualityCap, qualityCap);
    this.addEffect(graphic, 0.34, (progress) => {
      graphic.clear();
      for (let index = 0; index < particleCount; index++) {
        const angle = index / particleCount * Math.PI * 2;
        const radius = progress * (30 + intensity * 55) * (0.65 + (index % 3) * 0.16);
        graphic.circle(at.x + Math.cos(angle) * radius, at.y + Math.sin(angle) * radius * (variant === 'surge' ? 0.82 : 0.55), 4 + intensity * 4).fill({ color, alpha: (1 - progress) * 0.76 });
      }
    });
  }

  private spawnRing(at: Point, color: number, intensity: number, variant = 'default'): void {
    const graphic = new Graphics({ blendMode: 'add' });
    const duration = variant === 'bind' || variant === 'snare' ? 0.56 : variant === 'dive' ? 0.72 : 0.38;
    this.addEffect(graphic, duration, (progress) => {
      const radius = 15 + progress * (48 + intensity * 38);
      graphic.clear().circle(at.x, at.y, radius).stroke({ color, alpha: (1 - progress) * 0.65, width: 2 + intensity * 3 });
      if (variant === 'hymn' || variant === 'chant') graphic.star(at.x, at.y, 5, radius * 0.66, radius * 0.34).stroke({ color: 0xffffff, alpha: (1 - progress) * 0.4, width: 1.5 });
      if (variant === 'crown') graphic.star(at.x, at.y, 7, radius * 0.86, radius * 0.4).stroke({ color: 0xffffff, alpha: (1 - progress) * 0.5, width: 2 });
      if (variant === 'bind' || variant === 'snare') {
        const coils = variant === 'bind' ? 3 : 2;
        for (let index = 0; index < coils; index++) {
          const angle = progress * Math.PI * 3 + index * Math.PI * 2 / coils;
          const coilRadius = radius * (0.46 + index * 0.12);
          graphic.ellipse(at.x + Math.cos(angle) * coilRadius * 0.32, at.y - 5 + Math.sin(angle) * coilRadius * 0.16, coilRadius * 0.78, coilRadius * 0.28).stroke({ color, alpha: (1 - progress) * 0.68, width: 2.2 });
        }
      }
      if (variant === 'dive') {
        // Windup halo: three rising flame tongues plus a bright compressed core.
        // It stays local to the caster and intentionally lasts longer than the
        // 0.5s gameplay windup so the viewer can actually register the charge.
        const core = 15 + intensity * 13 + Math.sin(progress * Math.PI * 5) * 3;
        graphic.circle(at.x, at.y - 8, core).fill({ color, alpha: 0.24 + Math.sin(progress * Math.PI) * 0.18 })
          .circle(at.x, at.y - 8, core * 0.52).fill({ color: 0xffefab, alpha: 0.55 });
        for (let index = 0; index < 3; index++) {
          const angle = progress * 7 + index * Math.PI * 2 / 3;
          const orbit = 20 + intensity * 12;
          const x = at.x + Math.cos(angle) * orbit;
          const y = at.y - 12 + Math.sin(angle) * orbit * 0.46 - progress * 18;
          graphic.moveTo(x, y + 10).lineTo(x + Math.cos(angle) * 6, y - 12 - intensity * 8).lineTo(x - Math.sin(angle) * 5, y + 4).fill({ color: index === 0 ? 0xfff0ae : color, alpha: 0.88 });
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
