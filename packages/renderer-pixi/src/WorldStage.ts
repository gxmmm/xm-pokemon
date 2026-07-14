import type { AssetKey, QualityProfile, SceneTransitionRequest, WorldCue, WorldRenderInput, WorldRenderer, WorldRenderSnapshot } from '@pokemon-online/renderer';
import { Application, Container, Graphics } from 'pixi.js';
import { CharacterView, type CharacterAppearance, type CharacterBehavior } from './CharacterView.ts';

interface Landmark {
  id: string;
  kind: 'lighthouse' | 'building' | 'dock' | 'tree-cluster' | 'roof' | 'fog-bank';
  x: number;
  y: number;
  width?: number;
  height?: number;
  depth: 'scenery' | 'occlusion' | 'foreground';
}
interface SceneCharacter {
  id: string;
  appearance: CharacterAppearance;
  behavior: CharacterBehavior;
  x?: number;
  y?: number;
}

export interface WorldStageSceneSpec {
  id: string;
  mapId: string;
  biome: string;
  ambience: { preset: string; density: number };
  landmarks?: readonly Landmark[];
  characters?: readonly SceneCharacter[];
}

interface DriftingMist {
  graphic: Graphics;
  baseX: number;
  baseY: number;
  phase: number;
  speed: number;
}

const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;
const TILE_WIDTH = 64;
const TILE_HEIGHT = 40;

/** Config-driven GPU world sample. It renders static scene-pack information and
 * renderer DTO snapshots only; movement/collision/story/encounters remain in
 * the existing WorldView + game runtime. */
export class WorldStage implements WorldRenderer {
  private app: Application | null = null;
  private root: Container | null = null;
  private readonly terrain = new Container();
  private readonly scenery = new Container();
  private readonly entities = new Container();
  private readonly occlusion = new Container();
  private readonly foreground = new Container();
  private readonly overlay = new Container();
  private transitionGraphic: Graphics | null = null;
  private readonly characterViews = new Map<string, CharacterView>();
  private readonly objectViews = new Map<string, Graphics>();
  private readonly driftingMist: DriftingMist[] = [];
  private host: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private quality: QualityProfile;
  private activeBiome = 'mist-harbor';
  private activeScene: WorldStageSceneSpec | null = null;
  private elapsed = 0;

  constructor(quality: QualityProfile = 'standard') {
    this.quality = quality;
  }

  async mount(host: HTMLElement): Promise<void> {
    this.unmount();
    this.host = host;
    const app = new Application();
    await app.init({
      width: DESIGN_WIDTH,
      height: DESIGN_HEIGHT,
      background: '#8db6c4',
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      preference: 'webgl',
    });
    app.canvas.style.cssText = 'display:block;width:100%;height:100%;';
    host.replaceChildren(app.canvas);
    this.app = app;
    this.root = new Container();
    app.stage.addChild(this.root);
    this.root.addChild(this.terrain, this.scenery, this.entities, this.occlusion, this.foreground, this.overlay);
    this.transitionGraphic = new Graphics();
    this.overlay.addChild(this.transitionGraphic);
    app.ticker.add((ticker) => this.update(Math.min(0.05, ticker.deltaTime / 60)));
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
  }

  unmount(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.driftingMist.length = 0;
    this.characterViews.clear();
    this.objectViews.clear();
    this.app?.destroy(true, { children: true, texture: true, textureSource: true });
    this.app = null;
    this.root = null;
    this.transitionGraphic = null;
    this.host?.replaceChildren();
    this.host = null;
  }

  setQuality(quality: QualityProfile): void {
    if (this.quality === quality) return;
    this.quality = quality;
    // Rebuild only static/environment layers. Entity views remain alive, so a
    // quality switch is visible immediately and never changes world facts.
    this.drawScene();
  }

  async preload(_keys: readonly AssetKey[]): Promise<void> {}

  async transition(request: SceneTransitionRequest): Promise<void> {
    await this.animateTransitionOverlay(
      request.color ?? '#0b2430',
      request.kind === 'biome-crossfade' ? 0.82 : 0.68,
      request.durationMs ?? 260,
    );
  }

  private async animateTransitionOverlay(color: string, peakAlpha: number, durationMs: number): Promise<void> {
    const overlay = this.transitionGraphic;
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

  async enterWorld(input: WorldRenderInput): Promise<void> {
    this.activeBiome = input.biomeId;
    this.activeScene = null;
    this.drawScene();
  }

  async enterScene(input: WorldRenderInput, scene: WorldStageSceneSpec): Promise<void> {
    this.activeBiome = input.biomeId;
    this.activeScene = scene;
    this.drawScene();
  }

  applyWorldSnapshot(snapshot: WorldRenderSnapshot): void {
    const dynamicIds = new Set(snapshot.entities.map((entity) => entity.id));
    const staticCharacters = (this.activeScene?.characters ?? [])
      .filter((character) => character.x !== undefined && character.y !== undefined && !dynamicIds.has(character.id))
      .map((character) => ({ id: character.id, kind: 'npc' as const, position: { x: character.x!, y: character.y! } }));
    const entities = [...snapshot.entities, ...staticCharacters];
    const characterIds = new Set(entities.filter((entity) => entity.kind !== 'object').map((entity) => entity.id));
    const objectIds = new Set(entities.filter((entity) => entity.kind === 'object').map((entity) => entity.id));

    for (const [id, view] of this.characterViews) {
      if (!characterIds.has(id)) { view.destroy(); this.characterViews.delete(id); }
    }
    for (const [id, view] of this.objectViews) {
      if (!objectIds.has(id)) { view.destroy(); this.objectViews.delete(id); }
    }

    for (const entity of entities) {
      const point = { x: 160 + entity.position.x * TILE_WIDTH, y: 110 + entity.position.y * TILE_HEIGHT };
      if (entity.kind === 'object') {
        let view = this.objectViews.get(entity.id);
        if (!view) {
          const objectView = new Graphics()
            .poly([0, -18, 11, 0, 0, 18, -11, 0]).fill({ color: 0x8ee4df, alpha: 0.82 })
            .circle(0, 0, 4).fill({ color: 0xeafaf4 });
          view = objectView;
          this.objectViews.set(entity.id, objectView);
          this.entities.addChild(objectView);
        }
        view.position.set(point.x, point.y);
        continue;
      }
      const character = this.characterSpecFor(entity.id, entity.kind);
      let view = this.characterViews.get(entity.id);
      if (!view) {
        view = new CharacterView(character.appearance, character.behavior);
        this.characterViews.set(entity.id, view);
        this.entities.addChild(view.container);
      } else {
        view.setStyle(character.appearance, character.behavior);
      }
      view.setWorldPosition(point.x, point.y);
    }
  }

  async playWorldCues(_cues: readonly WorldCue[]): Promise<void> {}

  private drawScene(): void {
    for (const layer of [this.terrain, this.scenery, this.occlusion, this.foreground]) {
      layer.removeChildren().forEach((child) => child.destroy());
    }
    this.driftingMist.length = 0;
    this.drawBase();
    if (this.activeScene) this.drawLandmarks(this.activeScene);
    this.drawAmbientMist(this.activeScene?.ambience.density ?? 0.3);
  }

  private drawBase(): void {
    const harbor = this.activeBiome === 'mist-harbor';
    this.terrain.addChild(
      new Graphics().rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT).fill({ color: harbor ? 0x8cb6c4 : 0x557b61 }),
      new Graphics().rect(0, 410, DESIGN_WIDTH, 310).fill({ color: harbor ? 0x5f8079 : 0x496b4e }),
    );
  }

  private drawLandmarks(scene: WorldStageSceneSpec): void {
    for (const mark of scene.landmarks ?? []) {
      const layer = mark.depth === 'scenery' ? this.scenery : mark.depth === 'occlusion' ? this.occlusion : this.foreground;
      const x = 160 + mark.x * TILE_WIDTH;
      const y = 105 + mark.y * TILE_HEIGHT;
      const width = (mark.width ?? 1) * TILE_WIDTH;
      const height = (mark.height ?? 1) * TILE_HEIGHT;
      const graphic = new Graphics();
      if (mark.kind === 'lighthouse') {
        graphic.rect(x, y - height * 0.6, width, height * 1.6).fill({ color: 0xe8e1c6 })
          .rect(x - 8, y - height * 0.72, width + 16, 16).fill({ color: 0x375b6a })
          .circle(x + width / 2, y - height * 0.72, 15).fill({ color: 0xffdd81, alpha: 0.8 });
      } else if (mark.kind === 'building' || mark.kind === 'roof') {
        graphic.rect(x, y, width, height).fill({ color: mark.kind === 'roof' ? 0x34535f : 0xd3b283 })
          .poly([x - 12, y, x + width / 2, y - height * 0.45, x + width + 12, y]).fill({ color: 0x385d68 });
      } else if (mark.kind === 'dock') {
        graphic.rect(x, y, width, height).fill({ color: 0x8f6947 });
      } else if (mark.kind === 'fog-bank') {
        graphic.ellipse(x + width / 2, y + height / 2, width * 0.75, height * 0.7).fill({ color: 0xe6f8f2, alpha: 0.38 });
      }
      layer.addChild(graphic);
    }
  }

  private drawAmbientMist(density: number): void {
    const qualityCount = this.quality === 'cinematic' ? 26 : this.quality === 'standard' ? 14 : 6;
    const count = Math.max(2, Math.round(qualityCount * Math.max(0.2, density / 0.42)));
    for (let index = 0; index < count; index++) {
      const baseX = (index * 101) % (DESIGN_WIDTH + 120) - 60;
      const baseY = 120 + (index * 53) % 560;
      const graphic = new Graphics().ellipse(baseX, baseY, 35 + index % 3 * 9, 9 + index % 2 * 3)
        .fill({ color: 0xe6f8f2, alpha: this.quality === 'compatibility' ? 0.13 : 0.18 });
      this.foreground.addChild(graphic);
      this.driftingMist.push({ graphic, baseX, baseY, phase: index * 0.71, speed: 0.18 + (index % 4) * 0.035 });
    }
  }

  private update(dt: number): void {
    this.elapsed += dt;
    for (const mist of this.driftingMist) {
      mist.graphic.x = Math.sin(this.elapsed * mist.speed + mist.phase) * 32;
      mist.graphic.y = Math.cos(this.elapsed * mist.speed * 0.7 + mist.phase) * 5;
    }
    for (const view of this.characterViews.values()) view.update(dt);
  }

  private characterSpecFor(id: string, kind: 'player' | 'npc' | 'wild'): { appearance: CharacterAppearance; behavior: CharacterBehavior } {
    const configured = this.activeScene?.characters?.find((character) => character.id === id);
    if (configured) return configured;
    if (kind === 'player') return { appearance: 'hero', behavior: 'idle' };
    return { appearance: kind === 'wild' ? 'fisher' : 'villager', behavior: 'idle' };
  }

  private resize(): void {
    if (!this.app || !this.root || !this.host) return;
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.app.renderer.resize(width, height);
    const scale = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
    this.root.scale.set(scale);
    this.root.position.set((width - DESIGN_WIDTH * scale) / 2, (height - DESIGN_HEIGHT * scale) / 2);
  }
}
