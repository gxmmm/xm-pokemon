import { DEFAULT_VISUAL_RUNTIME_SETTINGS, type AssetKey, type BattleCue, type BattleRenderInput, type BattleRenderSnapshot, type BattleRenderer, type QualityProfile, type SceneTransitionRequest, type VisualRuntimeSettings } from '@pokemon-online/renderer';
import { battleEnvironmentFor, type BattleEnvironmentSpec } from '@pokemon-online/config';
import { Application, Container, Graphics } from 'pixi.js';
import { elementColor, planBattleCue, type BattleStageVfxPlan } from './battle-plan.ts';
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

/** Minimal Stage-3 Pixi battle runtime. It consumes renderer contracts only;
 * engine simulation, Vue HUD, and BattleDirector stay outside this package. */
export class BattleStage implements BattleRenderer {
  private app: Application | null = null;
  private root: Container | null = null;
  private environment = new Container();
  private combatants = new Container();
  private effects = new Container();
  private overlay = new Container();
  private views = new Map<string, Graphics>();
  private positions = new Map<string, Point>();
  private activeEffects: TimedEffect[] = [];
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
    this.views.clear();
    this.positions.clear();
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

  async preload(_keys: readonly AssetKey[]): Promise<void> {}

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
        view = this.createCombatantView(combatant.side === 'player');
        this.views.set(combatant.uid, view);
        this.combatants.addChild(view);
      }
      view.position.set(point.x, point.y);
      view.alpha = combatant.alive ? 1 : 0.25;
      view.scale.set(combatant.alive ? 1 : 0.72);
    }
  }

  async playBattleCues(cues: readonly BattleCue[]): Promise<void> {
    for (const cue of cues) {
      if (cue.type === 'camera') {
        this.aimCamera(cue.plan.focusIds, cue.plan.zoom ?? 1, cue.plan.shake ?? 0);
      } else if (cue.type === 'hit-stop') {
        this.hitStopSeconds = Math.max(this.hitStopSeconds, cue.milliseconds / 1000);
      } else if (cue.type === 'vfx' || cue.type === 'environment') {
        for (const plan of planBattleCue(cue)) this.spawnPlan(plan);
      }
    }
  }

  isSettled(): boolean {
    return this.activeEffects.length === 0 && this.hitStopSeconds <= 0.001;
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

  private createCombatantView(player: boolean): Graphics {
    const color = player ? 0x69d4e7 : 0xf28577;
    return new Graphics()
      .ellipse(0, 18, 43, 15).fill({ color: 0x07101a, alpha: 0.3 })
      .circle(0, -8, 25).fill({ color, alpha: 0.95 })
      .circle(-8, -16, 8).fill({ color: 0xffffff, alpha: 0.35 })
      .rect(-26, 26, 52, 6).fill({ color: 0x172331, alpha: 0.9 })
      .rect(-25, 27, 50, 4).fill({ color: player ? 0x7ee6ac : 0xffaa83 });
  }

  private project(pixelX: number, pixelY: number): Point {
    return { x: 175 + pixelX * 47, y: 185 + pixelY * 31 };
  }

  private aimCamera(ids: readonly string[], zoom: number, shake: number): void {
    const points = ids.map((id) => this.positions.get(id)).filter((point): point is Point => !!point);
    const focus = points.length
      ? points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 })
      : { x: DESIGN_WIDTH / 2, y: DESIGN_HEIGHT / 2 };
    const intensity = this.cameraIntensityFactor();
    this.cameraTargetOffset = {
      x: (DESIGN_WIDTH / 2 - focus.x) * 0.22 * intensity,
      y: (DESIGN_HEIGHT / 2 - focus.y) * 0.16 * intensity,
    };
    this.cameraTargetScale = 1 + (Math.max(1, Math.min(1.14, zoom)) - 1) * intensity;
    this.cameraShake = Math.max(this.cameraShake, shake * 12 * intensity);
  }

  private cameraIntensityFactor(): number {
    return this.visualSettings.cameraIntensity === 'full' ? 1 : this.visualSettings.cameraIntensity === 'reduced' ? 0.45 : 0;
  }

  private spawnPlan(plan: BattleStageVfxPlan): void {
    const actor = plan.actorId ? this.positions.get(plan.actorId) : undefined;
    const target = plan.targetIds.map((id) => this.positions.get(id)).find((point): point is Point => !!point) ?? actor ?? { x: DESIGN_WIDTH / 2, y: DESIGN_HEIGHT / 2 };
    const color = elementColor(plan.element);
    if (plan.primitive === 'projectile' && actor) {
      this.spawnProjectile(actor, target, color, plan.intensity, plan.variant);
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
    const duration = 0.26 + (1 - intensity) * 0.1;
    this.addEffect(graphic, duration, (progress) => {
      const x = from.x + (to.x - from.x) * progress;
      const y = from.y + (to.y - from.y) * progress;
      graphic.clear().moveTo(from.x, from.y).lineTo(x, y).stroke({ color, alpha: (1 - progress) * 0.46, width: 6 * intensity })
        .circle(x, y, 8 + intensity * 10).fill({ color, alpha: 0.9 });
      if (variant === 'chain') graphic.moveTo(x, y).lineTo(x + Math.sin(progress * 19) * 18, y + Math.cos(progress * 13) * 12).stroke({ color: 0xffffff, alpha: (1 - progress) * 0.75, width: 2 });
    });
  }

  private spawnImpact(at: Point, color: number, intensity: number, variant = 'default'): void {
    const graphic = new Graphics({ blendMode: 'add' });
    this.addEffect(graphic, 0.28, (progress) => {
      const radius = 12 + progress * (34 + intensity * 28);
      graphic.clear().circle(at.x, at.y, radius).stroke({ color, alpha: (1 - progress) * 0.8, width: 5 * (1 - progress) + 1 })
        .star(at.x, at.y, variant === 'cross' ? 4 : 6, radius * 0.72, radius * 0.28).fill({ color, alpha: (1 - progress) * 0.36 });
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
    this.addEffect(graphic, 0.38, (progress) => {
      const radius = 15 + progress * (48 + intensity * 38);
      graphic.clear().circle(at.x, at.y, radius).stroke({ color, alpha: (1 - progress) * 0.65, width: 2 + intensity * 3 });
      if (variant === 'hymn' || variant === 'chant') graphic.star(at.x, at.y, 5, radius * 0.66, radius * 0.34).stroke({ color: 0xffffff, alpha: (1 - progress) * 0.4, width: 1.5 });
      if (variant === 'crown') graphic.star(at.x, at.y, 7, radius * 0.86, radius * 0.4).stroke({ color: 0xffffff, alpha: (1 - progress) * 0.5, width: 2 });
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
    const scale = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
    this.root.scale.set(scale);
    this.root.position.set((width - DESIGN_WIDTH * scale) / 2, (height - DESIGN_HEIGHT * scale) / 2);
  }
}
