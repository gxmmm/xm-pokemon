import { DEFAULT_VISUAL_RUNTIME_SETTINGS, type AssetKey, type BattleCue, type BattleRenderInput, type BattleRenderSnapshot, type BattleRenderer, type QualityProfile, type SceneTransitionRequest, type VisualRuntimeSettings } from '@pokemon-online/renderer';
import { BATTLE_ASSET_BY_ID, battleEnvironmentFor, resolveBattleArtPresentation, type BattleEnvironmentSpec } from '@pokemon-online/config';
import { Application, Container, Graphics } from 'pixi.js';
import { elementColor, planBattleCue, type BattleStageVfxPlan } from './battle-plan.ts';
import { BattleArtAssetLoader } from './BattleArtAssets.ts';
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
  private combatants = new Container();
  private effects = new Container();
  private overlay = new Container();
  private views = new Map<string, CombatantView>();
  private readonly battleArtAssets = new BattleArtAssetLoader();
  private positions = new Map<string, Point>();
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
      environmentChildCount: this.environment.children.length,
      effectChildCount: this.effects.children.length,
      totalChildCount: this.environment.children.length + this.combatants.children.length + this.effects.children.length + this.overlay.children.length,
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
    }
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
    this.root.addChild(this.environment, this.combatants, this.effects, this.overlay);
    this.transitionLayer = new Graphics();
    this.overlay.addChild(this.transitionLayer);
    this.drawEnvironment();
  }

  private drawEnvironment(): void {
    this.environment.removeChildren().forEach((child) => child.destroy());
    const spec = battleEnvironmentFor(this.biomeId);
    const palette = spec.palette;
    const sky = new Graphics().rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT).fill({ color: palette.sky });
    const horizon = new Graphics().ellipse(640, 310, 650, 220).fill({ color: palette.horizon, alpha: 0.48 });
    const ground = new Graphics().rect(0, 250, DESIGN_WIDTH, DESIGN_HEIGHT - 250).fill({ color: palette.ground });
    this.environment.addChild(sky, horizon, ground);
    this.drawTerrainGrammar(spec);
    this.drawAmbientGrammar(spec);
  }

  private drawTerrainGrammar(spec: BattleEnvironmentSpec): void {
    const { groundDetail, accent } = spec.palette;
    const density = this.quality === 'cinematic' ? 1 : this.quality === 'standard' ? 0.62 : 0.3;
    const count = Math.max(6, Math.round(52 * spec.density * density));
    for (let index = 0; index < count; index++) {
      const x = (index * 97) % DESIGN_WIDTH;
      const y = 340 + ((index * 53) % 340);
      const graphic = new Graphics();
      if (spec.terrain === 'grass') {
        graphic.moveTo(x, y).lineTo(x + 3, y - 12 - index % 8).stroke({ color: groundDetail, alpha: 0.42, width: 2 });
      } else if (spec.terrain === 'stone') {
        const size = 6 + index % 8;
        graphic.poly([x - size, y + size * 0.5, x - size * 0.45, y - size, x + size * 0.65, y - size * 0.5, x + size, y + size * 0.55]).fill({ color: groundDetail, alpha: 0.34 });
      } else if (spec.terrain === 'water') {
        const width = 24 + index % 4 * 9;
        graphic.moveTo(x, y).lineTo(x + width, y).stroke({ color: groundDetail, alpha: 0.36, width: 2 + index % 2 });
      } else if (spec.terrain === 'rune') {
        const radius = 7 + index % 7;
        graphic.circle(x, y, radius).stroke({ color: accent, alpha: 0.22, width: 1.5 }).moveTo(x - radius, y).lineTo(x + radius, y).stroke({ color: groundDetail, alpha: 0.18, width: 1 });
      } else {
        graphic.rect(x, y, 14 + index % 4 * 5, 3).fill({ color: groundDetail, alpha: 0.23 });
      }
      this.environment.addChild(graphic);
    }
  }

  private drawAmbientGrammar(spec: BattleEnvironmentSpec): void {
    const density = this.quality === 'cinematic' ? 1 : this.quality === 'standard' ? 0.62 : 0.32;
    const count = Math.max(4, Math.round(30 * spec.density * density));
    for (let index = 0; index < count; index++) {
      const x = (index * 131 + 47) % DESIGN_WIDTH;
      const y = 105 + ((index * 71) % 260);
      const graphic = new Graphics({ blendMode: spec.ambience === 'dust' ? 'normal' : 'add' });
      if (spec.ambience === 'dust') graphic.ellipse(x, y, 4 + index % 3 * 2, 2).fill({ color: spec.palette.mote, alpha: 0.2 });
      else if (spec.ambience === 'spray') graphic.circle(x, y, 2 + index % 2).fill({ color: spec.palette.mote, alpha: 0.56 }).moveTo(x, y + 3).lineTo(x - 3, y + 10).stroke({ color: spec.palette.mote, alpha: 0.24, width: 1 });
      else if (spec.ambience === 'rune') graphic.star(x, y, 4, 4 + index % 4, 1.5).fill({ color: spec.palette.mote, alpha: 0.38 });
      else if (spec.ambience === 'sparks') graphic.rect(x, y, 2, 6 + index % 5).fill({ color: spec.palette.mote, alpha: 0.34 });
      else graphic.circle(x, y, 1.5 + index % 2).fill({ color: spec.palette.mote, alpha: 0.55 });
      this.environment.addChild(graphic);
    }
  }

  private project(pixelX: number, pixelY: number): Point {
    return { x: 175 + pixelX * 47, y: 185 + pixelY * 31 };
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
    const target = plan.targetIds.map((id) => this.positions.get(id)).find((point): point is Point => !!point) ?? actor ?? { x: DESIGN_WIDTH / 2, y: DESIGN_HEIGHT / 2 };
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
      this.spawnEnvironmentReaction(target, plan.reaction);
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
    this.cameraScale += (this.cameraTargetScale - this.cameraScale) * Math.min(1, dt * 8);
    this.cameraOffset.x += (this.cameraTargetOffset.x - this.cameraOffset.x) * Math.min(1, dt * 7);
    this.cameraOffset.y += (this.cameraTargetOffset.y - this.cameraOffset.y) * Math.min(1, dt * 7);
    this.cameraShake = Math.max(0, this.cameraShake - dt * 30);
    const shakeX = this.cameraShake ? Math.sin(performance.now() * 0.05) * this.cameraShake : 0;
    const shakeY = this.cameraShake ? Math.cos(performance.now() * 0.07) * this.cameraShake * 0.5 : 0;
    for (const layer of [this.environment, this.combatants, this.effects]) {
      layer.scale.set(this.cameraScale);
      layer.position.set(this.cameraOffset.x + shakeX, this.cameraOffset.y + shakeY);
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
