import type { BattleCue, BattleRenderInput, BattleRenderSnapshot, BattleRenderer, GameRenderer, SceneTransitionRequest, WorldCue, WorldRenderInput, WorldRenderer, WorldRenderSnapshot } from '@pokemon-online/renderer';
import type { AssetKey, QualityProfile, RendererCapabilities } from '@pokemon-online/renderer';
import { AlphaFilter, Application, Container, Graphics, RenderTexture, Sprite } from 'pixi.js';

export interface PixiSpikeReport {
  renderer: 'pixi-v8';
  quality: QualityProfile;
  layers: readonly string[];
  usesRenderTexture: boolean;
  additiveParticles: boolean;
  destroyed: boolean;
}

export const PIXI_SPIKE_LAYER_ORDER = [
  'distant', 'ambient-back', 'terrain', 'scenery', 'entities', 'occlusion', 'foreground', 'post',
] as const;

/** Isolated Stage-1 GPU spike.
 *
 * It owns no game rules, Pinia state, Vue component, map data, or battle
 * decisions. Its purpose is to validate Pixi v8 lifecycle, fixed design-space
 * scaling, layer ordering, additive particles, RenderTexture, resize, and
 * teardown before a production stage is introduced.
 */
export class PixiRendererSpike implements GameRenderer, WorldRenderer, BattleRenderer {
  private app: Application | null = null;
  private root: Container | null = null;
  private layers = new Map<string, Container>();
  private renderTexture: RenderTexture | null = null;
  private quality: QualityProfile;
  private resizeObserver: ResizeObserver | null = null;
  private mountedContainer: HTMLElement | null = null;
  private settled = true;
  private transitionLayer: Graphics | null = null;

  constructor(private readonly capabilities: Pick<RendererCapabilities, 'quality'> = { quality: 'standard' }) {
    this.quality = capabilities.quality;
  }

  async mount(container: HTMLElement): Promise<void> {
    this.unmount();
    this.mountedContainer = container;
    const app = new Application();
    await app.init({
      width: 1280,
      height: 720,
      background: '#111827',
      antialias: false,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      preference: 'webgl',
    });
    app.canvas.style.display = 'block';
    app.canvas.style.width = '100%';
    app.canvas.style.height = '100%';
    app.canvas.style.imageRendering = 'pixelated';
    container.replaceChildren(app.canvas);
    this.app = app;
    this.installStage();
    this.resizeToContainer();
    this.resizeObserver = new ResizeObserver(() => this.resizeToContainer());
    this.resizeObserver.observe(container);
  }

  unmount(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.renderTexture?.destroy(true);
    this.renderTexture = null;
    this.app?.destroy(true, { children: true, texture: true, textureSource: true });
    this.app = null;
    this.root = null;
    this.layers.clear();
    this.transitionLayer = null;
    this.mountedContainer?.replaceChildren();
    this.mountedContainer = null;
    this.settled = true;
  }

  setQuality(profile: QualityProfile): void {
    this.quality = profile;
    const particleLayer = this.layers.get('foreground');
    if (particleLayer) particleLayer.visible = profile !== 'compatibility';
  }

  async preload(_keys: readonly AssetKey[]): Promise<void> {
    // Deliberately no assets in the spike: the RenderTexture probe proves the
    // GPU path without coupling this task to a production asset pipeline.
  }

  async transition(request: SceneTransitionRequest): Promise<void> {
    if (!this.transitionLayer || !this.app) return;
    this.settled = false;
    this.transitionLayer.clear().rect(0, 0, 1280, 720).fill({ color: request.color ?? '#000000', alpha: 0.55 });
    await new Promise<void>((resolve) => window.setTimeout(resolve, request.durationMs ?? 180));
    this.transitionLayer.clear();
    this.settled = true;
  }

  async enterWorld(input: WorldRenderInput): Promise<void> {
    this.drawLabel(`WORLD SPIKE · ${input.sceneId} · ${input.biomeId}`, '#c9f4e6');
  }

  applyWorldSnapshot(snapshot: WorldRenderSnapshot): void {
    const entities = this.layers.get('entities');
    if (!entities) return;
    entities.removeChildren().forEach((child) => child.destroy());
    snapshot.entities.forEach((entity, index) => {
      const marker = new Graphics().circle(0, 0, 12).fill({ color: entity.kind === 'player' ? '#f8dc7d' : '#8dd6f8' });
      marker.position.set(320 + entity.position.x * 24, 440 + entity.position.y * 24 + index * 2);
      entities.addChild(marker);
    });
  }

  async playWorldCues(_cues: readonly WorldCue[]): Promise<void> {}

  async enterBattle(input: BattleRenderInput): Promise<void> {
    this.drawLabel(`BATTLE SPIKE · ${input.biomeId} · ${input.combatants.length} combatants`, '#ffd88c');
  }

  applyBattleSnapshot(snapshot: BattleRenderSnapshot): void {
    const entities = this.layers.get('entities');
    if (!entities) return;
    entities.removeChildren().forEach((child) => child.destroy());
    snapshot.combatants.forEach((combatant) => {
      const marker = new Graphics()
        .ellipse(0, 0, 31, 13).fill({ color: combatant.side === 'player' ? '#70d9e9' : '#f28e89', alpha: 0.28 })
        .circle(0, -14, 16).fill({ color: combatant.side === 'player' ? '#51c4dd' : '#dd6868' });
      marker.position.set(150 + combatant.pixel.x * 48, 180 + combatant.pixel.y * 31);
      entities.addChild(marker);
    });
  }

  async playBattleCues(cues: readonly BattleCue[]): Promise<void> {
    const foreground = this.layers.get('foreground');
    if (!foreground) return;
    for (const cue of cues) {
      if (cue.type !== 'vfx') continue;
      const spark = new Graphics({ blendMode: 'add' }).star(0, 0, 5, 18).fill({ color: cue.recipe.element === 'fire' ? '#ff9e62' : '#a7e8ff', alpha: Math.min(1, cue.intensity) });
      spark.position.set(640, 360);
      foreground.addChild(spark);
      window.setTimeout(() => spark.destroy(), 180);
    }
  }

  isSettled(): boolean { return this.settled; }

  report(): PixiSpikeReport {
    return {
      renderer: 'pixi-v8', quality: this.quality, layers: PIXI_SPIKE_LAYER_ORDER,
      usesRenderTexture: !!this.renderTexture, additiveParticles: !!this.layers.get('foreground'), destroyed: !this.app,
    };
  }

  private installStage(): void {
    if (!this.app) return;
    const root = new Container();
    this.root = root;
    this.app.stage.addChild(root);
    for (const layerId of PIXI_SPIKE_LAYER_ORDER) {
      const layer = new Container();
      this.layers.set(layerId, layer);
      root.addChild(layer);
    }
    const distant = this.layers.get('distant')!;
    distant.addChild(new Graphics().rect(0, 0, 1280, 720).fill({ color: '#17233d' }));
    const terrain = this.layers.get('terrain')!;
    terrain.addChild(new Graphics().rect(0, 420, 1280, 300).fill({ color: '#29464b' }));
    const scenery = this.layers.get('scenery')!;
    scenery.addChild(new Graphics().circle(980, 250, 115).fill({ color: '#496875', alpha: 0.7 }));
    this.renderTexture = RenderTexture.create({ width: 128, height: 128, resolution: 1 });
    const source = new Graphics().circle(64, 64, 48).fill({ color: '#7ce8dc', alpha: 0.55 });
    this.app.renderer.render({ container: source, target: this.renderTexture, clear: true });
    source.destroy();
    const echo = new Sprite(this.renderTexture);
    echo.position.set(92, 74);
    echo.alpha = 0.65;
    this.layers.get('ambient-back')!.addChild(echo);
    const particles = this.layers.get('foreground')!;
    // Filter probe: production use stays quality-gated; this verifies the Pixi
    // post-process API without enabling full-screen effects in gameplay.
    if (this.quality === 'cinematic') {
      particles.filters = [new AlphaFilter({ alpha: 0.96 })];
    }
    for (let index = 0; index < 20; index++) {
      const particle = new Graphics({ blendMode: 'add' }).circle(0, 0, index % 3 + 1).fill({ color: '#b8f4ff', alpha: 0.6 });
      particle.position.set((index * 71) % 1280, 90 + (index * 47) % 410);
      particles.addChild(particle);
    }
    this.transitionLayer = new Graphics();
    this.layers.get('post')!.addChild(this.transitionLayer);
    this.drawLabel('PIXI v8 GPU RENDERER SPIKE', '#ffffff');
  }

  private drawLabel(label: string, color: string): void {
    const post = this.layers.get('post');
    if (!post) return;
    const previous = post.removeChildren().filter((child) => child !== this.transitionLayer);
    previous.forEach((child) => child.destroy());
    const badge = new Graphics().roundRect(32, 30, Math.min(700, 24 + label.length * 10), 38, 8).fill({ color, alpha: 0.14 }).stroke({ color, alpha: 0.7, width: 1 });
    post.addChild(badge);
    if (this.transitionLayer) post.addChild(this.transitionLayer);
  }

  private resizeToContainer(): void {
    if (!this.app || !this.root || !this.mountedContainer) return;
    const width = Math.max(1, this.mountedContainer.clientWidth);
    const height = Math.max(1, this.mountedContainer.clientHeight);
    this.app.renderer.resize(width, height);
    const scale = Math.min(width / 1280, height / 720);
    this.root.scale.set(scale);
    this.root.position.set((width - 1280 * scale) / 2, (height - 720 * scale) / 2);
  }
}

