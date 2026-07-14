import type { AssetKey, BattleCue, BattleRenderInput, BattleRenderSnapshot, BattleRenderer, QualityProfile, SceneTransitionRequest } from '@pokemon-online/renderer';
import { Application, Container, Graphics } from 'pixi.js';
import { elementColor, planBattleCue, type BattleStageVfxPlan } from './battle-plan.ts';

const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;

interface Point { x: number; y: number; }
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
        const alpha = peakAlpha * Math.sin(progress * Math.PI);
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
    const sky = new Graphics().rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT).fill({ color: this.biomeId === 'water' ? '#173a57' : '#173550' });
    const groundColor = this.biomeId === 'water' ? 0x225c72 : 0x376b46;
    const ground = new Graphics().rect(0, 250, DESIGN_WIDTH, DESIGN_HEIGHT - 250).fill({ color: groundColor });
    const horizon = new Graphics().ellipse(640, 310, 650, 220).fill({ color: this.biomeId === 'water' ? '#3c8390' : '#6f9f62', alpha: 0.35 });
    this.environment.addChild(sky, horizon, ground);
    const density = this.quality === 'cinematic' ? 70 : this.quality === 'standard' ? 38 : 16;
    for (let index = 0; index < density; index++) {
      const x = (index * 97) % DESIGN_WIDTH;
      const y = 350 + ((index * 53) % 320);
      const blade = new Graphics().moveTo(x, y).lineTo(x + 3, y - 12 - index % 8).stroke({ color: 0x9ccd6f, alpha: 0.38, width: 2 });
      this.environment.addChild(blade);
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
    if (points.length) {
      const focus = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
      this.cameraTargetOffset = { x: (DESIGN_WIDTH / 2 - focus.x) * 0.22, y: (DESIGN_HEIGHT / 2 - focus.y) * 0.16 };
    }
    this.cameraTargetScale = Math.max(1, Math.min(1.14, zoom));
    this.cameraShake = Math.max(this.cameraShake, shake * 12);
  }

  private spawnPlan(plan: BattleStageVfxPlan): void {
    const actor = plan.actorId ? this.positions.get(plan.actorId) : undefined;
    const target = plan.targetIds.map((id) => this.positions.get(id)).find((point): point is Point => !!point) ?? actor ?? { x: DESIGN_WIDTH / 2, y: DESIGN_HEIGHT / 2 };
    const color = elementColor(plan.element);
    if (plan.primitive === 'projectile' && actor) {
      this.spawnProjectile(actor, target, color, plan.intensity);
    } else if (plan.primitive === 'beam' && actor) {
      this.spawnBeam(actor, target, color, plan.intensity);
    } else if (plan.primitive === 'burst') {
      this.spawnBurst(target, color, plan.intensity);
    } else if (plan.primitive === 'ring') {
      this.spawnRing(target, color, plan.intensity);
    } else if (plan.primitive === 'environment') {
      this.spawnEnvironmentReaction(target, plan.reaction);
    } else {
      this.spawnImpact(target, color, plan.intensity);
    }
  }

  private spawnProjectile(from: Point, to: Point, color: number, intensity: number): void {
    const graphic = new Graphics({ blendMode: 'add' });
    const duration = 0.26 + (1 - intensity) * 0.1;
    this.addEffect(graphic, duration, (progress) => {
      const x = from.x + (to.x - from.x) * progress;
      const y = from.y + (to.y - from.y) * progress;
      graphic.clear().moveTo(from.x, from.y).lineTo(x, y).stroke({ color, alpha: (1 - progress) * 0.46, width: 6 * intensity })
        .circle(x, y, 8 + intensity * 10).fill({ color, alpha: 0.9 });
    });
  }

  private spawnImpact(at: Point, color: number, intensity: number): void {
    const graphic = new Graphics({ blendMode: 'add' });
    this.addEffect(graphic, 0.28, (progress) => {
      const radius = 12 + progress * (34 + intensity * 28);
      graphic.clear().circle(at.x, at.y, radius).stroke({ color, alpha: (1 - progress) * 0.8, width: 5 * (1 - progress) + 1 })
        .star(at.x, at.y, 6, radius * 0.72, radius * 0.28).fill({ color, alpha: (1 - progress) * 0.36 });
    });
  }

  private spawnBeam(from: Point, to: Point, color: number, intensity: number): void {
    const graphic = new Graphics({ blendMode: 'add' });
    this.addEffect(graphic, 0.34, (progress) => {
      const alpha = Math.sin(Math.PI * progress) * 0.8;
      graphic.clear().moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ color, alpha, width: 8 + intensity * 13 })
        .moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ color: 0xffffff, alpha: alpha * 0.75, width: 2 });
    });
  }

  private spawnBurst(at: Point, color: number, intensity: number): void {
    const graphic = new Graphics({ blendMode: 'add' });
    const particleCount = this.quality === 'cinematic' ? 14 : this.quality === 'standard' ? 9 : 5;
    this.addEffect(graphic, 0.34, (progress) => {
      graphic.clear();
      for (let index = 0; index < particleCount; index++) {
        const angle = index / particleCount * Math.PI * 2;
        const radius = progress * (30 + intensity * 55) * (0.65 + (index % 3) * 0.16);
        graphic.circle(at.x + Math.cos(angle) * radius, at.y + Math.sin(angle) * radius * 0.55, 4 + intensity * 4).fill({ color, alpha: (1 - progress) * 0.76 });
      }
    });
  }

  private spawnRing(at: Point, color: number, intensity: number): void {
    const graphic = new Graphics({ blendMode: 'add' });
    this.addEffect(graphic, 0.38, (progress) => {
      const radius = 15 + progress * (48 + intensity * 38);
      graphic.clear().circle(at.x, at.y, radius).stroke({ color, alpha: (1 - progress) * 0.65, width: 2 + intensity * 3 });
    });
  }

  private spawnEnvironmentReaction(at: Point, reaction?: string): void {
    if (reaction !== 'scorch' && reaction !== 'spark') return;
    const graphic = new Graphics({ blendMode: 'add' });
    const color = reaction === 'scorch' ? 0xff8a4c : 0xffea68;
    this.addEffect(graphic, 0.54, (progress) => {
      graphic.clear().ellipse(at.x, at.y + 24, 36 + progress * 18, 10 + progress * 4).fill({ color, alpha: (1 - progress) * 0.24 });
    });
  }

  private addEffect(graphic: Graphics, duration: number, update: (progress: number) => void): void {
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
