import { DEFAULT_VISUAL_RUNTIME_SETTINGS, type AssetKey, type BattleCue, type BattleRenderInput, type BattleRenderSnapshot, type BattleRenderer, type SceneTransitionRequest, type VisualRuntimeSettings } from '@pokemon-online/renderer';
import { BATTLE_ASSET_BY_ID, battleEnvironmentFor, resolveBattleArtPresentation } from '@pokemon-online/config';
import { Application, Container, Graphics, type Texture } from 'pixi.js';
import { planBattleCue } from './battle-plan.ts';
import { BattleArtAssetLoader } from './BattleArtAssets.ts';
import { BattleCameraController } from './BattleCameraController.ts';
import { BattleCombatantLayer } from './BattleCombatantLayer.ts';
import { BattleCueScheduler } from './BattleCueScheduler.ts';
import { BattleEnvironmentView } from './BattleEnvironmentView.ts';
import { BattleEffectPool } from './BattleEffectPool.ts';
import { BATTLE_DESIGN_HEIGHT as DESIGN_HEIGHT, BATTLE_DESIGN_WIDTH as DESIGN_WIDTH, type BattleStagePoint as Point } from './battle-stage-layout.ts';
import { BattleVfxExecutor } from './BattleVfxExecutor.ts';
import { DrawCallObserver } from './draw-call-observer.ts';
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
  private readonly effectPool = new BattleEffectPool();
  private readonly terrainContacts = new TerrainContactEffects(this.effectPool, this.environmentView.terrainOcclusion);
  private readonly battleArtAssets = new BattleArtAssetLoader();
  private readonly combatants = new BattleCombatantLayer(this.battleArtAssets, this.terrainContacts);
  private readonly vfx = new BattleVfxExecutor(this.effectPool,
    (uid) => this.combatants.getPosition(uid),
    (uid, anchor) => this.combatants.getAnchorPosition(uid, anchor));
  private overlay = new Container();
  private environmentBackgroundTexture: Texture | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private mountedContainer: HTMLElement | null = null;
  private biomeId = 'grass';
  private transitionLayer: Graphics | null = null;
  private drawCallObserver: DrawCallObserver | null = null;
  private visualSettings: VisualRuntimeSettings = { ...DEFAULT_VISUAL_RUNTIME_SETTINGS };
  private lifecycleVersion = 0;
  private battleVersion = 0;
  private cancelTransition: (() => void) | null = null;

  async mount(container: HTMLElement): Promise<void> {
    this.unmount();
    const version = this.lifecycleVersion;
    this.mountedContainer = container;
    const app = new Application();
    try {
      await app.init({
        width: DESIGN_WIDTH,
        height: DESIGN_HEIGHT,
        background: '#10213a',
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        preference: 'webgl',
      });
      if (version !== this.lifecycleVersion) {
        this.disposeApplication(app);
        return;
      }
      app.canvas.style.cssText = 'display:block;width:100%;height:100%;';
      container.replaceChildren(app.canvas);
      this.app = app;
      this.drawCallObserver = new DrawCallObserver((app.renderer as unknown as { gl?: WebGLRenderingContext }).gl ?? null);
      this.installStage();
      this.resizeToContainer();
      this.resizeObserver = new ResizeObserver(() => this.resizeToContainer());
      this.resizeObserver.observe(container);
      app.ticker.add((ticker) => this.update(Math.min(0.05, ticker.deltaTime / 60)));
    } catch (error) {
      const current = version === this.lifecycleVersion;
      if (this.app === app) this.unmount();
      else this.disposeApplication(app);
      if (current) {
        this.mountedContainer = null;
        throw error;
      }
    }
  }

  unmount(): void {
    this.lifecycleVersion++;
    this.battleVersion++;
    this.cancelTransition?.();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.effectPool.clear();
    this.cueScheduler.clear();
    this.combatants.clear();
    this.camera.reset();
    this.environmentView.clear();
    this.overlay.removeChildren().forEach((child) => child.destroy());
    this.battleArtAssets.clear();
    this.environmentBackgroundTexture = null;
    this.drawCallObserver?.destroy();
    this.drawCallObserver = null;
    // These empty containers belong to the stage instance, not one Application.
    // Detach them before recursive application disposal so remount can reuse them.
    this.root?.removeChildren();
    if (this.app) this.disposeApplication(this.app);
    this.app = null;
    this.root = null;
    this.transitionLayer = null;
    this.mountedContainer?.replaceChildren();
    this.mountedContainer = null;
  }

  private disposeApplication(app: Application): void {
    // init() can fail before a renderer exists. Shared asset textures must not
    // be destroyed here: Pixi Assets may reuse them in the next mounted stage.
    if (app.renderer) app.destroy(true, { children: true });
    else app.stage?.destroy({ children: true });
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
      combatantCount: this.combatants.size,
      activeEffectCount: this.effectPool.activeCount,
      environmentChildCount: this.environmentView.childCount,
      effectChildCount: this.effectPool.container.children.length,
      totalChildCount: this.environmentView.childCount + this.combatants.container.children.length + this.effectPool.container.children.length + this.overlay.children.length,
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
    this.cancelTransition?.();
    const overlay = this.transitionLayer;
    if (!overlay) return;
    const startedAt = performance.now();
    await new Promise<void>((resolve) => {
      let frame = 0;
      let finished = false;
      const finish = (): void => {
        if (finished) return;
        finished = true;
        cancelAnimationFrame(frame);
        if (!overlay.destroyed) overlay.clear();
        if (this.cancelTransition === finish) this.cancelTransition = null;
        resolve();
      };
      this.cancelTransition = finish;
      const draw = (now: number): void => {
        if (finished) return;
        const progress = Math.min(1, (now - startedAt) / Math.max(1, durationMs));
        const alpha = Math.min(this.visualSettings.reduceFlicker ? 0.32 : peakAlpha, peakAlpha) * Math.sin(progress * Math.PI);
        overlay.clear().rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT).fill({ color, alpha });
        if (progress < 1) frame = requestAnimationFrame(draw);
        else finish();
      };
      frame = requestAnimationFrame(draw);
    });
  }

  async enterBattle(input: BattleRenderInput): Promise<void> {
    if (!this.app) return;
    const lifecycle = this.lifecycleVersion;
    const battle = ++this.battleVersion;
    const entries = input.combatants.map((combatant) => resolveBattleArtPresentation({ speciesId: combatant.speciesId, side: combatant.side, facing: combatant.facing }).asset);
    const spec = battleEnvironmentFor(input.biomeId);
    const environmentEntry = spec.art ? BATTLE_ASSET_BY_ID[spec.art.backgroundAssetId] : undefined;
    const [environmentTexture] = await Promise.all([
      environmentEntry ? this.battleArtAssets.load(environmentEntry) : Promise.resolve(null),
      this.battleArtAssets.preload(entries),
    ]);
    if (!this.app || lifecycle !== this.lifecycleVersion || battle !== this.battleVersion) return;
    this.effectPool.clear();
    this.cueScheduler.clear();
    this.combatants.clear();
    this.camera.reset();
    this.biomeId = input.biomeId;
    this.environmentBackgroundTexture = environmentTexture;
    this.drawEnvironment();
    this.applyBattleSnapshot({ time: 0, combatants: input.combatants });
  }

  applyBattleSnapshot(snapshot: BattleRenderSnapshot): void {
    if (!this.app) return;
    this.combatants.applySnapshot(snapshot, this.biomeId);
  }

  async playBattleCues(cues: readonly BattleCue[]): Promise<void> {
    if (!this.app) return;
    for (const cue of cues) {
      const ready = this.cueScheduler.accept(cue);
      if (ready) this.playReadyCue(ready);
    }
  }

  isSettled(): boolean {
    return this.effectPool.activeCount === 0 && this.cueScheduler.isSettled && this.combatants.isSettled();
  }

  private installStage(): void {
    if (!this.app) return;
    this.root = new Container();
    this.app.stage.addChild(this.root);
    this.root.addChild(
      this.environmentView.background,
      this.environmentView.farBackdrop,
      this.environmentView.horizonLayer,
      this.environmentView.groundLayer,
      this.combatants.container,
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
    const points = ids.map((id) => this.combatants.getPosition(id)).filter((point): point is Point => !!point);
    this.camera.focus(points, battleEnvironmentFor(this.biomeId).camera, zoom, shake);
  }

  private playAnimationCue(cue: Extract<BattleCue, { type: 'animation' }>): void {
    this.combatants.playAnimation(cue);
  }

  private playReadyCue(cue: BattleCue): void {
    if (cue.type === 'camera') {
      this.focusCamera(cue.plan.focusIds, cue.plan.zoom ?? 1, cue.plan.shake ?? 0);
    } else if (cue.type === 'animation') {
      this.playAnimationCue(cue);
    } else if (cue.type === 'vfx' || cue.type === 'environment') {
      this.vfx.spawnPlans(planBattleCue(cue), battleEnvironmentFor(this.biomeId));
    }
  }

  private update(dt: number): void {
    const { clockSeconds: clock, due } = this.cueScheduler.advance(dt);
    this.terrainContacts.tick(dt);
    this.combatants.update(dt, clock);
    const spec = battleEnvironmentFor(this.biomeId);
    this.camera.update(dt, [
      { layer: this.environmentView.background, factor: 0, shake: false },
      { layer: this.environmentView.farBackdrop, factor: spec.parallax.far, shake: false },
      { layer: this.environmentView.horizonLayer, factor: spec.parallax.horizon, shake: false },
      { layer: this.environmentView.groundLayer, factor: spec.parallax.ground, shake: true },
      { layer: this.combatants.container, factor: 1, shake: true },
      { layer: this.environmentView.terrainOcclusion, factor: 1, shake: true },
      { layer: this.environmentView.foreground, factor: spec.parallax.foreground, shake: false },
      { layer: this.effectPool.container, factor: 1, shake: true },
    ]);
    if (!clock) return;
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
