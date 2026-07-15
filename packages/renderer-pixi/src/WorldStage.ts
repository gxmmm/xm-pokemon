import { DEFAULT_VISUAL_RUNTIME_SETTINGS, type AssetKey, type QualityProfile, type SceneTransitionRequest, type VisualRuntimeSettings, type WorldCue, type WorldRenderInput, type WorldRenderer, type WorldRenderSnapshot } from '@pokemon-online/renderer';
import { Application, Container, Graphics } from 'pixi.js';
import { CharacterView, type CharacterAppearance, type CharacterBehavior } from './CharacterView.ts';
import { DrawCallObserver } from './draw-call-observer.ts';

interface ScenePalette {
  backdrop: string;
  ground: string;
  path: string;
  shadow: string;
  accent: string;
  fog: string;
}
interface Landmark {
  id: string;
  kind: 'lighthouse' | 'building' | 'dock' | 'tree-cluster' | 'tree-wall' | 'canopy' | 'root-cluster' | 'boulder' | 'path' | 'grass-patch' | 'roof' | 'fog-bank' | 'observatory-dome' | 'meteor-spire' | 'star-chart' | 'crystal-cluster' | 'rift-mist' | 'gravity-platform' | 'rift-arch' | 'void-debris' | 'tide-cavern-wall' | 'crystal-tide-pool' | 'anchor-dais' | 'cave-veil' | 'spore-ring' | 'ridge-wall' | 'stone-terrace' | 'starfall-scar' | 'ridge-overhang' | 'canyon-wall' | 'mineral-vein' | 'rock-shelf' | 'cave-shadow' | 'reef-islet' | 'tide-channel' | 'shipwreck' | 'tide-cave-mouth';
  x: number;
  y: number;
  width?: number;
  height?: number;
  depth: 'terrain' | 'scenery' | 'occlusion' | 'foreground';
}
type SceneObjectKind = 'default' | 'signal-spore' | 'anomaly-core' | 'gravity-node' | 'ruin-terminal' | 'rift-core' | 'legend-echo' | 'tide-anchor' | 'rift-gate' | 'star-scar' | 'tide-gauge' | 'ship-log';
interface SceneObjectVisual {
  id: string;
  kind: SceneObjectKind;
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
  palette: ScenePalette;
  landmarks?: readonly Landmark[];
  characters?: readonly SceneCharacter[];
  objectVisuals?: readonly SceneObjectVisual[];
  resources?: { preloadKeys: readonly string[]; ambientParticleLimit: number; entityLimit: number };
}

export interface WorldStageDiagnostics {
  sceneId: string | null;
  quality: QualityProfile;
  preloadKeyCount: number;
  ambientParticleCount: number;
  entityCount: number;
  staticChildCount: number;
  totalChildCount: number;
  canvasCount: number;
  canvasPixels: number;
  drawCallTotal: number;
  drawCallsSinceLastSample: number;
  motionEnabled: boolean;
}

interface AmbientParticle {
  graphic: Graphics;
  baseX: number;
  baseY: number;
  phase: number;
  speed: number;
  drift: number;
}

const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;
const TILE_WIDTH = 64;
const TILE_HEIGHT = 40;
const FALLBACK_PALETTE: ScenePalette = {
  backdrop: '#8cb6c4', ground: '#5f8079', path: '#76968d', shadow: '#31575c', accent: '#f1cd83', fog: '#e6f8f2',
};

function color(hex: string): number { return Number.parseInt(hex.replace('#', ''), 16); }

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
  private readonly objectVisualKinds = new Map<string, SceneObjectKind>();
  private readonly ambientParticles: AmbientParticle[] = [];
  /** Asset keys retained only for the currently entered Scene Pack. Current world
   * packs are procedural, so this tracks the explicit zero-external-asset boundary. */
  private readonly scenePreloadKeys = new Set<AssetKey>();
  private host: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private quality: QualityProfile;
  private activeBiome = 'mist-harbor';
  private activeScene: WorldStageSceneSpec | null = null;
  private elapsed = 0;
  private motionEnabled = true;
  private visualSettings: VisualRuntimeSettings = { ...DEFAULT_VISUAL_RUNTIME_SETTINGS };
  private drawCallObserver: DrawCallObserver | null = null;

  constructor(quality: QualityProfile = 'standard') { this.quality = quality; }

  async mount(host: HTMLElement): Promise<void> {
    this.unmount();
    this.host = host;
    const app = new Application();
    await app.init({
      width: DESIGN_WIDTH,
      height: DESIGN_HEIGHT,
      background: FALLBACK_PALETTE.backdrop,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      preference: 'webgl',
    });
    app.canvas.style.cssText = 'display:block;width:100%;height:100%;';
    host.replaceChildren(app.canvas);
    this.app = app;
    this.drawCallObserver = new DrawCallObserver((app.renderer as unknown as { gl?: WebGLRenderingContext }).gl ?? null);
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
    this.ambientParticles.length = 0;
    this.scenePreloadKeys.clear();
    this.characterViews.clear();
    this.objectViews.clear();
    this.objectVisualKinds.clear();
    this.drawCallObserver?.destroy();
    this.drawCallObserver = null;
    this.app?.destroy(true, { children: true, texture: true, textureSource: true });
    this.app = null;
    this.root = null;
    this.transitionGraphic = null;
    this.host?.replaceChildren();
    this.host = null;
  }

  setMotionEnabled(enabled: boolean): void { this.motionEnabled = enabled; }

  setVisualSettings(settings?: VisualRuntimeSettings): void {
    this.visualSettings = { ...DEFAULT_VISUAL_RUNTIME_SETTINGS, ...settings };
    if (this.visualSettings.reduceFlicker) {
      for (const particle of this.ambientParticles) particle.graphic.position.set(0, 0);
    }
  }

  getDiagnostics(): WorldStageDiagnostics {
    const drawCalls = this.drawCallObserver?.read() ?? { total: 0, sinceLastRead: 0 };
    return {
      sceneId: this.activeScene?.id ?? null,
      quality: this.quality,
      preloadKeyCount: this.scenePreloadKeys.size,
      ambientParticleCount: this.ambientParticles.length,
      entityCount: this.characterViews.size + this.objectViews.size,
      staticChildCount: this.terrain.children.length + this.scenery.children.length + this.occlusion.children.length + this.foreground.children.length,
      totalChildCount: this.terrain.children.length + this.scenery.children.length + this.entities.children.length + this.occlusion.children.length + this.foreground.children.length + this.overlay.children.length,
      canvasCount: this.app?.canvas ? 1 : 0,
      canvasPixels: this.app?.canvas ? this.app.canvas.width * this.app.canvas.height : 0,
      drawCallTotal: drawCalls.total,
      drawCallsSinceLastSample: drawCalls.sinceLastRead,
      motionEnabled: this.motionEnabled,
    };
  }

  setQuality(quality: QualityProfile): void {
    if (this.quality === quality) return;
    this.quality = quality;
    // Rebuild static/environment layers only. Entity snapshots remain intact,
    // so renderer quality never changes authoritative world facts.
    this.drawScene();
  }

  async preload(keys: readonly AssetKey[]): Promise<void> {
    for (const key of keys) this.scenePreloadKeys.add(key);
  }

  async transition(request: SceneTransitionRequest): Promise<void> {
    await this.animateTransitionOverlay(request.color ?? '#0b2430', request.kind === 'biome-crossfade' ? 0.82 : 0.68, request.durationMs ?? 260);
  }

  private async animateTransitionOverlay(fill: string, peakAlpha: number, durationMs: number): Promise<void> {
    const overlay = this.transitionGraphic;
    if (!overlay) return;
    const startedAt = performance.now();
    await new Promise<void>((resolve) => {
      const draw = (now: number): void => {
        const progress = Math.min(1, (now - startedAt) / Math.max(1, durationMs));
        overlay.clear().rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT).fill({ color: fill, alpha: Math.min(this.visualSettings.reduceFlicker ? 0.32 : peakAlpha, peakAlpha) * Math.sin(progress * Math.PI) });
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
    // Scene-local only: switching packs discards prior preload ownership rather
    // than retaining assets for every world map.
    this.scenePreloadKeys.clear();
    await this.preload((scene.resources?.preloadKeys ?? []).map((key) => key as AssetKey));
    this.drawScene();
  }

  applyWorldSnapshot(snapshot: WorldRenderSnapshot): void {
    const dynamicIds = new Set(snapshot.entities.map((entity) => entity.id));
    const staticCharacters = (this.activeScene?.characters ?? [])
      .filter((character) => character.x !== undefined && character.y !== undefined && !dynamicIds.has(character.id))
      .map((character) => ({ id: character.id, kind: 'npc' as const, position: { x: character.x!, y: character.y! } }));
    // Visual budgeting may cap DTOs but cannot alter authoritative world state.
    // Input ordering places the player first, then authoritative NPC/object DTOs.
    const entityLimit = this.activeScene?.resources?.entityLimit ?? Number.POSITIVE_INFINITY;
    const entities = [...snapshot.entities, ...staticCharacters].slice(0, entityLimit);
    const characterIds = new Set(entities.filter((entity) => entity.kind !== 'object').map((entity) => entity.id));
    const objectIds = new Set(entities.filter((entity) => entity.kind === 'object').map((entity) => entity.id));

    for (const [id, view] of this.characterViews) if (!characterIds.has(id)) { view.destroy(); this.characterViews.delete(id); }
    for (const [id, view] of this.objectViews) if (!objectIds.has(id)) { view.destroy(); this.objectViews.delete(id); this.objectVisualKinds.delete(id); }

    for (const entity of entities) {
      const point = { x: 160 + entity.position.x * TILE_WIDTH, y: 110 + entity.position.y * TILE_HEIGHT };
      if (entity.kind === 'object') {
        let view = this.objectViews.get(entity.id);
        const objectKind = this.objectVisualFor(entity.id);
        if (!view) {
          view = new Graphics();
          this.objectViews.set(entity.id, view);
          this.entities.addChild(view);
        }
        if (this.objectVisualKinds.get(entity.id) !== objectKind) {
          this.drawObjectVisual(view, objectKind);
          this.objectVisualKinds.set(entity.id, objectKind);
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
      } else view.setStyle(character.appearance, character.behavior);
      view.setWorldPosition(point.x, point.y);
    }
  }

  async playWorldCues(_cues: readonly WorldCue[]): Promise<void> {}

  private drawScene(): void {
    for (const layer of [this.terrain, this.scenery, this.occlusion, this.foreground]) layer.removeChildren().forEach((child) => child.destroy());
    this.ambientParticles.length = 0;
    const palette = this.activeScene?.palette ?? FALLBACK_PALETTE;
    this.drawBase(palette);
    if (this.activeScene) this.drawLandmarks(this.activeScene, palette);
    this.drawAmbience(this.activeScene?.ambience ?? { preset: 'mist', density: 0.3 }, palette);
  }

  private drawBase(palette: ScenePalette): void {
    this.terrain.addChild(
      new Graphics().rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT).fill({ color: palette.backdrop }),
      new Graphics().rect(0, 410, DESIGN_WIDTH, 310).fill({ color: palette.ground }),
      new Graphics().rect(0, 408, DESIGN_WIDTH, 8).fill({ color: palette.shadow, alpha: 0.18 }),
    );
  }

  private drawLandmarks(scene: WorldStageSceneSpec, palette: ScenePalette): void {
    for (const mark of scene.landmarks ?? []) {
      const layer = mark.depth === 'terrain' ? this.terrain : mark.depth === 'scenery' ? this.scenery : mark.depth === 'occlusion' ? this.occlusion : this.foreground;
      const x = 160 + mark.x * TILE_WIDTH;
      const y = 105 + mark.y * TILE_HEIGHT;
      const width = (mark.width ?? 1) * TILE_WIDTH;
      const height = (mark.height ?? 1) * TILE_HEIGHT;
      const graphic = new Graphics();
      this.drawLandmark(graphic, mark.kind, x, y, width, height, palette);
      layer.addChild(graphic);
    }
  }

  private drawLandmark(graphic: Graphics, kind: Landmark['kind'], x: number, y: number, width: number, height: number, palette: ScenePalette): void {
    switch (kind) {
      case 'lighthouse':
        graphic.rect(x, y - height * 0.6, width, height * 1.6).fill({ color: 0xe8e1c6 }).rect(x - 8, y - height * 0.72, width + 16, 16).fill({ color: 0x375b6a }).circle(x + width / 2, y - height * 0.72, 15).fill({ color: 0xffdd81, alpha: 0.8 });
        break;
      case 'building':
      case 'roof':
        graphic.rect(x, y, width, height).fill({ color: kind === 'roof' ? 0x34535f : 0xd3b283 }).poly([x - 12, y, x + width / 2, y - height * 0.45, x + width + 12, y]).fill({ color: 0x385d68 });
        break;
      case 'dock': graphic.rect(x, y, width, height).fill({ color: 0x8f6947 }); break;
      case 'tree-wall': this.drawTreeWall(graphic, x, y, width, height, palette); break;
      case 'tree-cluster': this.drawTreeCluster(graphic, x, y, width, height, palette); break;
      case 'canopy': this.drawCanopy(graphic, x, y, width, height, palette); break;
      case 'root-cluster': this.drawRootCluster(graphic, x, y, width, height, palette); break;
      case 'boulder': this.drawBoulders(graphic, x, y, width, height, palette); break;
      case 'path': this.drawPath(graphic, x, y, width, height, palette); break;
      case 'grass-patch': this.drawGrassPatch(graphic, x, y, width, height, palette); break;
      case 'fog-bank': graphic.ellipse(x + width / 2, y + height / 2, width * 0.75, height * 0.7).fill({ color: palette.fog, alpha: 0.28 }); break;
      case 'observatory-dome': this.drawObservatoryDome(graphic, x, y, width, height, palette); break;
      case 'meteor-spire': this.drawMeteorSpires(graphic, x, y, width, height, palette); break;
      case 'star-chart': this.drawStarChart(graphic, x, y, width, height, palette); break;
      case 'crystal-cluster': this.drawCrystalCluster(graphic, x, y, width, height, palette); break;
      case 'rift-mist': this.drawRiftMist(graphic, x, y, width, height, palette); break;
      case 'gravity-platform': this.drawGravityPlatform(graphic, x, y, width, height, palette); break;
      case 'rift-arch': this.drawRiftArch(graphic, x, y, width, height, palette); break;
      case 'void-debris': this.drawVoidDebris(graphic, x, y, width, height, palette); break;
      case 'tide-cavern-wall': this.drawTideCavernWall(graphic, x, y, width, height, palette); break;
      case 'crystal-tide-pool': this.drawCrystalTidePool(graphic, x, y, width, height, palette); break;
      case 'anchor-dais': this.drawAnchorDais(graphic, x, y, width, height, palette); break;
      case 'cave-veil': this.drawCaveVeil(graphic, x, y, width, height, palette); break;
      case 'spore-ring': this.drawSporeRing(graphic, x, y, width, height, palette); break;
      case 'ridge-wall': this.drawRidgeWall(graphic, x, y, width, height, palette); break;
      case 'stone-terrace': this.drawStoneTerrace(graphic, x, y, width, height, palette); break;
      case 'starfall-scar': this.drawStarfallScar(graphic, x, y, width, height, palette); break;
      case 'ridge-overhang': this.drawRidgeOverhang(graphic, x, y, width, height, palette); break;
      case 'canyon-wall': this.drawCanyonWall(graphic, x, y, width, height, palette); break;
      case 'mineral-vein': this.drawMineralVein(graphic, x, y, width, height, palette); break;
      case 'rock-shelf': this.drawRockShelf(graphic, x, y, width, height, palette); break;
      case 'cave-shadow': this.drawCaveShadow(graphic, x, y, width, height, palette); break;
      case 'reef-islet': this.drawReefIslet(graphic, x, y, width, height, palette); break;
      case 'tide-channel': this.drawTideChannel(graphic, x, y, width, height, palette); break;
      case 'shipwreck': this.drawShipwreck(graphic, x, y, width, height, palette); break;
      case 'tide-cave-mouth': this.drawTideCaveMouth(graphic, x, y, width, height, palette); break;
    }
  }

  private drawTreeWall(graphic: Graphics, x: number, y: number, width: number, height: number, palette: ScenePalette): void {
    graphic.rect(x, y, width, height).fill({ color: palette.shadow, alpha: 0.78 });
    const trees = Math.max(3, Math.round(width / 54));
    for (let index = 0; index < trees; index++) {
      const tx = x + (index + 0.5) * width / trees;
      const crown = 25 + (index % 3) * 8;
      graphic.rect(tx - 6, y + height * 0.48, 12, height * 0.6).fill({ color: 0x24463a })
        .circle(tx, y + height * 0.44, crown).fill({ color: 0x2f614b, alpha: 0.96 })
        .circle(tx - crown * 0.45, y + height * 0.5, crown * 0.66).fill({ color: 0x376d50, alpha: 0.88 });
    }
  }

  private drawTreeCluster(graphic: Graphics, x: number, y: number, width: number, height: number, palette: ScenePalette): void {
    const trees = Math.max(2, Math.round(width / 70));
    for (let index = 0; index < trees; index++) {
      const progress = trees === 1 ? 0.5 : index / (trees - 1);
      const tx = x + width * (0.13 + progress * 0.74);
      const trunkWidth = 17 + (index % 2) * 5;
      const crown = Math.min(height * 0.38, 42 + (index % 3) * 8);
      const baseY = y + height * (0.7 + (index % 2) * 0.08);
      graphic.rect(tx - trunkWidth / 2, baseY - height * 0.42, trunkWidth, height * 0.54).fill({ color: 0x4b3c2d })
        .rect(tx - trunkWidth / 2 + 4, baseY - height * 0.42, 4, height * 0.5).fill({ color: palette.accent, alpha: 0.25 })
        .circle(tx, baseY - height * 0.48, crown).fill({ color: 0x204b3a })
        .circle(tx - crown * 0.46, baseY - height * 0.43, crown * 0.72).fill({ color: 0x2e6749 })
        .circle(tx + crown * 0.43, baseY - height * 0.4, crown * 0.66).fill({ color: 0x285b42 });
    }
  }

  private drawCanopy(graphic: Graphics, x: number, y: number, width: number, height: number, palette: ScenePalette): void {
    graphic.rect(x, y, width, height * 0.5).fill({ color: palette.shadow, alpha: 0.66 });
    const leaves = Math.max(3, Math.round(width / 48));
    for (let index = 0; index < leaves; index++) {
      const cx = x + (index + 0.5) * width / leaves;
      const cy = y + height * (0.32 + (index % 2) * 0.15);
      const radius = Math.max(20, Math.min(width / leaves, height) * 0.48);
      graphic.circle(cx, cy, radius).fill({ color: 0x17372f, alpha: 0.94 })
        .circle(cx - radius * 0.52, cy + radius * 0.22, radius * 0.68).fill({ color: 0x214a38, alpha: 0.94 });
    }
  }

  private drawRootCluster(graphic: Graphics, x: number, y: number, width: number, height: number, palette: ScenePalette): void {
    graphic.ellipse(x + width / 2, y + height * 0.78, width * 0.54, height * 0.22).fill({ color: palette.shadow, alpha: 0.44 });
    for (let index = 0; index < 4; index++) {
      const startX = x + width * (0.15 + index * 0.23);
      graphic.moveTo(startX, y + height * 0.25).lineTo(startX + width * 0.13, y + height * 0.8).lineTo(startX + width * 0.3, y + height).stroke({ color: 0x554030, width: 7 - index % 2 * 2, alpha: 0.92 });
    }
  }

  private drawBoulders(graphic: Graphics, x: number, y: number, width: number, height: number, palette: ScenePalette): void {
    const count = Math.max(2, Math.round(width / 54));
    for (let index = 0; index < count; index++) {
      const bx = x + width * (0.2 + index / count * 0.65);
      const by = y + height * (0.55 + index % 2 * 0.18);
      const radius = Math.min(width / count * 0.32, height * 0.35);
      graphic.poly([bx - radius, by + radius * 0.6, bx - radius * 0.66, by - radius * 0.45, bx + radius * 0.25, by - radius, bx + radius, by - radius * 0.15, bx + radius * 0.65, by + radius * 0.65]).fill({ color: 0x536b62 })
        .poly([bx - radius * 0.66, by - radius * 0.45, bx + radius * 0.25, by - radius, bx + radius, by - radius * 0.15, bx + radius * 0.12, by + radius * 0.05]).fill({ color: palette.accent, alpha: 0.22 });
    }
  }

  private drawObservatoryDome(graphic: Graphics, x: number, y: number, width: number, height: number, palette: ScenePalette): void {
    const cx = x + width / 2;
    const baseY = y + height;
    const radiusX = width * 0.46;
    const radiusY = height * 0.82;
    graphic.rect(x + width * 0.12, y + height * 0.52, width * 0.76, height * 0.48).fill({ color: 0x48536d, alpha: 0.96 })
      .ellipse(cx, y + height * 0.56, radiusX, radiusY).fill({ color: 0x222c48, alpha: 0.96 })
      .ellipse(cx, y + height * 0.49, radiusX * 0.79, radiusY * 0.74).fill({ color: palette.backdrop, alpha: 0.82 })
      .arc(cx, y + height * 0.55, radiusX * 0.95, Math.PI, 0).stroke({ color: palette.accent, alpha: 0.64, width: 4 })
      .moveTo(cx, y + height * 0.04).lineTo(cx, baseY).stroke({ color: palette.accent, alpha: 0.34, width: 2 });
    for (let index = 0; index < 7; index++) {
      const angle = Math.PI + index / 6 * Math.PI;
      const sx = cx + Math.cos(angle) * radiusX * 0.62;
      const sy = y + height * 0.55 + Math.sin(angle) * radiusY * 0.58;
      graphic.circle(sx, sy, 2.5 + index % 2).fill({ color: palette.accent, alpha: 0.72 });
    }
  }

  private drawMeteorSpires(graphic: Graphics, x: number, y: number, width: number, height: number, palette: ScenePalette): void {
    const count = Math.max(2, Math.round(width / 58));
    for (let index = 0; index < count; index++) {
      const left = x + width * (index / count);
      const right = x + width * ((index + 0.82) / count);
      const peakX = left + (right - left) * 0.56;
      const peakY = y + height * (index % 2 ? 0.12 : 0.02);
      const baseY = y + height;
      graphic.poly([left, baseY, peakX, peakY, right, baseY, peakX + 9, baseY]).fill({ color: 0x2d344d })
        .poly([peakX, peakY, right, baseY, peakX + 9, baseY]).fill({ color: palette.accent, alpha: 0.2 })
        .moveTo(peakX, peakY).lineTo(peakX - 5, baseY).stroke({ color: palette.fog, alpha: 0.24, width: 2 });
    }
  }

  private drawStarChart(graphic: Graphics, x: number, y: number, width: number, height: number, palette: ScenePalette): void {
    const cx = x + width / 2;
    const cy = y + height / 2;
    const radius = Math.min(width, height) * 0.38;
    graphic.ellipse(cx, cy, width * 0.48, height * 0.4).fill({ color: 0x2b3856, alpha: 0.72 })
      .circle(cx, cy, radius).stroke({ color: palette.accent, alpha: 0.46, width: 2 })
      .circle(cx, cy, radius * 0.55).stroke({ color: palette.fog, alpha: 0.34, width: 1 });
    const stars = 6;
    for (let index = 0; index < stars; index++) {
      const angle = -Math.PI / 2 + index / stars * Math.PI * 2;
      const sx = cx + Math.cos(angle) * radius * (0.55 + index % 2 * 0.24);
      const sy = cy + Math.sin(angle) * radius * (0.55 + index % 2 * 0.24);
      graphic.circle(sx, sy, 3).fill({ color: palette.accent, alpha: 0.88 })
        .moveTo(cx, cy).lineTo(sx, sy).stroke({ color: palette.fog, alpha: 0.2, width: 1 });
    }
  }

  private drawCrystalCluster(graphic: Graphics, x: number, y: number, width: number, height: number, palette: ScenePalette): void {
    const count = Math.max(3, Math.round(width / 28));
    for (let index = 0; index < count; index++) {
      const cx = x + width * (0.12 + index / count * 0.76);
      const baseY = y + height * (0.78 + index % 2 * 0.1);
      const crystalHeight = height * (0.38 + index % 3 * 0.13);
      const crystalWidth = 8 + index % 3 * 3;
      graphic.poly([cx - crystalWidth, baseY, cx, baseY - crystalHeight, cx + crystalWidth, baseY, cx, baseY + 5]).fill({ color: 0x7386ae, alpha: 0.84 })
        .poly([cx, baseY - crystalHeight, cx + crystalWidth, baseY, cx, baseY]).fill({ color: palette.accent, alpha: 0.48 });
    }
  }

  private drawRiftMist(graphic: Graphics, x: number, y: number, width: number, height: number, palette: ScenePalette): void {
    const bands = Math.max(2, Math.round(width / 140));
    for (let index = 0; index < bands; index++) {
      const cx = x + width * (0.12 + index / bands * 0.76);
      const cy = y + height * (0.35 + index % 2 * 0.24);
      graphic.ellipse(cx, cy, width / bands * 0.72, height * 0.32).fill({ color: palette.fog, alpha: 0.13 + index % 2 * 0.04 })
        .circle(cx + 10, cy - 6, 2).fill({ color: palette.accent, alpha: 0.55 });
    }
  }

  private drawGravityPlatform(graphic: Graphics, x: number, y: number, width: number, height: number, palette: ScenePalette): void {
    const top = y + height * 0.28;
    const bottom = y + height * 0.78;
    graphic.poly([x, top, x + width * 0.82, y, x + width, top, x + width * 0.74, bottom, x + width * 0.15, y + height, x, bottom])
      .fill({ color: 0x423362, alpha: 0.94 })
      .poly([x, top, x + width * 0.82, y, x + width, top, x + width * 0.68, top + height * 0.16, x + width * 0.12, top + height * 0.23])
      .fill({ color: palette.path, alpha: 0.8 })
      .moveTo(x + width * 0.16, top + height * 0.2).lineTo(x + width * 0.72, top + height * 0.1).stroke({ color: palette.accent, alpha: 0.4, width: 2 });
    graphic.ellipse(x + width * 0.48, y + height * 1.08, width * 0.48, height * 0.15).fill({ color: palette.shadow, alpha: 0.34 });
  }

  private drawRiftArch(graphic: Graphics, x: number, y: number, width: number, height: number, palette: ScenePalette): void {
    const cx = x + width / 2;
    const radius = width * 0.34;
    graphic.arc(cx, y + height * 0.58, radius, Math.PI, 0).stroke({ color: 0x5e4b83, alpha: 0.96, width: Math.max(8, width * 0.11) })
      .arc(cx, y + height * 0.58, radius * 0.69, Math.PI, 0).stroke({ color: palette.accent, alpha: 0.42, width: 2 })
      .rect(x + width * 0.14, y + height * 0.58, width * 0.16, height * 0.34).fill({ color: 0x443361, alpha: 0.94 })
      .rect(x + width * 0.7, y + height * 0.58, width * 0.16, height * 0.34).fill({ color: 0x443361, alpha: 0.94 });
    for (let index = 0; index < 5; index++) graphic.circle(cx + Math.cos(index * 1.26) * radius * 0.82, y + height * 0.55 + Math.sin(index * 1.26) * radius * 0.42, 2.5).fill({ color: palette.fog, alpha: 0.72 });
  }

  private drawVoidDebris(graphic: Graphics, x: number, y: number, width: number, height: number, palette: ScenePalette): void {
    const pieces = Math.max(5, Math.round(width / 95));
    for (let index = 0; index < pieces; index++) {
      const cx = x + width * (0.08 + (index * 0.173) % 0.84);
      const cy = y + height * (0.12 + (index * 0.291) % 0.72);
      const size = 9 + (index % 4) * 5;
      graphic.poly([cx, cy - size, cx + size * 0.78, cy - size * 0.22, cx + size * 0.42, cy + size, cx - size * 0.72, cy + size * 0.45, cx - size, cy - size * 0.3])
        .fill({ color: index % 2 ? 0x514070 : 0x38294f, alpha: 0.72 })
        .moveTo(cx, cy - size).lineTo(cx + size * 0.42, cy + size).stroke({ color: palette.accent, alpha: 0.24, width: 1 });
    }
  }

  private drawTideCavernWall(graphic: Graphics, x: number, y: number, width: number, height: number, palette: ScenePalette): void {
    graphic.rect(x, y, width, height).fill({ color: 0x183f50, alpha: 0.94 });
    const ribs = Math.max(3, Math.round(width / 72));
    for (let index = 0; index < ribs; index++) {
      const rx = x + width * ((index + 0.5) / ribs);
      const crest = 16 + index % 3 * 8;
      graphic.poly([rx - width / ribs * 0.56, y + height, rx - crest, y + height * 0.18, rx + crest, y + height * 0.12, rx + width / ribs * 0.52, y + height])
        .fill({ color: index % 2 ? 0x24586a : 0x1b4b5d, alpha: 0.96 })
        .moveTo(rx - crest * 0.45, y + height * 0.25).lineTo(rx + crest * 0.3, y + height * 0.82).stroke({ color: palette.accent, alpha: 0.18, width: 2 });
    }
    graphic.ellipse(x + width * 0.52, y + height * 0.96, width * 0.42, height * 0.1).fill({ color: palette.shadow, alpha: 0.34 });
  }

  private drawCrystalTidePool(graphic: Graphics, x: number, y: number, width: number, height: number, palette: ScenePalette): void {
    const cx = x + width / 2;
    const cy = y + height / 2;
    graphic.ellipse(cx, cy, width * 0.48, height * 0.4).fill({ color: 0x123e58, alpha: 0.9 })
      .ellipse(cx, cy - height * 0.05, width * 0.37, height * 0.25).fill({ color: 0x3fa9c4, alpha: 0.52 })
      .ellipse(cx, cy - height * 0.08, width * 0.22, height * 0.12).fill({ color: palette.fog, alpha: 0.22 });
    for (let index = 0; index < 5; index++) {
      const px = x + width * (0.16 + index * 0.17);
      const py = y + height * (0.55 + (index % 2) * 0.12);
      graphic.poly([px, py, px + 7, py - 16, px + 13, py, px + 7, py + 8]).fill({ color: palette.accent, alpha: 0.42 + index % 2 * 0.16 });
    }
  }

  private drawAnchorDais(graphic: Graphics, x: number, y: number, width: number, height: number, palette: ScenePalette): void {
    const cx = x + width / 2;
    const cy = y + height * 0.58;
    graphic.ellipse(cx, cy, width * 0.48, height * 0.32).fill({ color: 0x31576a, alpha: 0.96 })
      .ellipse(cx, cy - height * 0.08, width * 0.34, height * 0.2).fill({ color: 0x547d8e, alpha: 0.88 })
      .circle(cx, cy - height * 0.1, Math.min(width, height) * 0.18).stroke({ color: palette.accent, alpha: 0.64, width: 3 });
    for (let index = 0; index < 4; index++) {
      const angle = -Math.PI / 2 + index * Math.PI / 2;
      graphic.circle(cx + Math.cos(angle) * width * 0.24, cy - height * 0.08 + Math.sin(angle) * height * 0.12, 3).fill({ color: palette.fog, alpha: 0.72 });
    }
  }

  private drawCaveVeil(graphic: Graphics, x: number, y: number, width: number, height: number, palette: ScenePalette): void {
    const bands = Math.max(3, Math.round(width / 120));
    for (let index = 0; index < bands; index++) {
      const cx = x + width * (0.1 + index / bands * 0.8);
      const cy = y + height * (0.36 + index % 2 * 0.22);
      graphic.ellipse(cx, cy, width / bands * 0.66, height * 0.34).fill({ color: palette.fog, alpha: 0.11 + index % 2 * 0.04 })
        .ellipse(cx, cy + height * 0.1, width / bands * 0.4, height * 0.12).fill({ color: 0x3fa9c4, alpha: 0.1 });
    }
  }

  private drawRidgeWall(graphic: Graphics, x: number, y: number, width: number, height: number, palette: ScenePalette): void {
    graphic.rect(x, y, width, height).fill({ color: 0x4b584d, alpha: 0.92 });
    const faces = Math.max(3, Math.round(width / 68));
    for (let index = 0; index < faces; index++) {
      const left = x + width * index / faces;
      const right = x + width * (index + 1) / faces;
      const crest = y + height * (0.1 + index % 3 * 0.09);
      graphic.poly([left, y + height, left + (right - left) * 0.18, crest, right - (right - left) * 0.12, y + height * 0.18, right, y + height])
        .fill({ color: index % 2 ? 0x64705a : 0x55624e, alpha: 0.96 })
        .moveTo(left + (right - left) * 0.22, crest + 5).lineTo(right - (right - left) * 0.2, y + height * 0.88).stroke({ color: palette.fog, alpha: 0.14, width: 1.5 });
    }
  }

  private drawStoneTerrace(graphic: Graphics, x: number, y: number, width: number, height: number, palette: ScenePalette): void {
    const rows = Math.max(2, Math.round(height / 34));
    for (let row = 0; row < rows; row++) {
      const top = y + height * row / rows;
      const bottom = y + height * (row + 1) / rows;
      graphic.poly([x, top + 7, x + width * 0.84, top, x + width, top + 8, x + width * 0.9, bottom, x + width * 0.1, bottom, x, bottom - 8])
        .fill({ color: row % 2 ? 0x7c775f : 0x8e8769, alpha: 0.93 })
        .moveTo(x + width * 0.1, bottom - 4).lineTo(x + width * 0.88, bottom - 8).stroke({ color: palette.shadow, alpha: 0.42, width: 2 });
    }
  }

  private drawStarfallScar(graphic: Graphics, x: number, y: number, width: number, height: number, palette: ScenePalette): void {
    const cx = x + width / 2;
    const cy = y + height * 0.58;
    graphic.ellipse(cx, cy, width * 0.46, height * 0.28).fill({ color: palette.shadow, alpha: 0.42 })
      .ellipse(cx, cy - height * 0.05, width * 0.3, height * 0.16).fill({ color: 0x71634d, alpha: 0.78 })
      .moveTo(cx - width * 0.34, cy + height * 0.18).lineTo(cx + width * 0.36, cy - height * 0.24).stroke({ color: palette.accent, alpha: 0.84, width: 2.5 });
    for (let index = 0; index < 3; index++) graphic.circle(cx + (index - 1) * width * 0.14, cy - height * (0.12 + index % 2 * 0.12), 3 + index).fill({ color: palette.fog, alpha: 0.68 });
  }

  private drawRidgeOverhang(graphic: Graphics, x: number, y: number, width: number, height: number, palette: ScenePalette): void {
    graphic.poly([x, y, x + width, y, x + width * 0.88, y + height * 0.72, x + width * 0.54, y + height, x + width * 0.18, y + height * 0.82])
      .fill({ color: 0x3e4c42, alpha: 0.92 })
      .poly([x + width * 0.12, y + height * 0.06, x + width * 0.86, y + height * 0.08, x + width * 0.72, y + height * 0.35, x + width * 0.26, y + height * 0.46])
      .fill({ color: palette.shadow, alpha: 0.44 });
    for (let index = 0; index < 4; index++) graphic.circle(x + width * (0.18 + index * 0.2), y + height * (0.3 + index % 2 * 0.18), 3).fill({ color: palette.accent, alpha: 0.26 });
  }

  private drawCanyonWall(graphic: Graphics, x: number, y: number, width: number, height: number, palette: ScenePalette): void {
    graphic.rect(x, y, width, height).fill({ color: 0x44332f, alpha: 0.96 });
    const faces = Math.max(3, Math.round(width / 68));
    for (let index = 0; index < faces; index++) {
      const left = x + width * index / faces;
      const right = x + width * (index + 1) / faces;
      const ridgeY = y + height * (0.08 + index % 3 * 0.09);
      graphic.poly([left, y + height, left + (right - left) * 0.2, ridgeY, right - (right - left) * 0.1, y + height * 0.18, right, y + height])
        .fill({ color: index % 2 ? 0x68463b : 0x583b35, alpha: 0.98 })
        .moveTo(left + (right - left) * 0.3, ridgeY + 6).lineTo(right - (right - left) * 0.18, y + height * 0.9).stroke({ color: palette.fog, alpha: 0.16, width: 1.5 });
    }
  }

  private drawMineralVein(graphic: Graphics, x: number, y: number, width: number, height: number, palette: ScenePalette): void {
    graphic.poly([x, y + height * 0.16, x + width * 0.84, y, x + width, y + height * 0.28, x + width * 0.78, y + height, x + width * 0.1, y + height, x, y + height * 0.72])
      .fill({ color: 0x5d443c, alpha: 0.92 });
    const veins = Math.max(3, Math.round(width / 45));
    for (let index = 0; index < veins; index++) {
      const vx = x + width * (0.12 + index / veins * 0.78);
      graphic.moveTo(vx - 8, y + height * 0.82).lineTo(vx + 9, y + height * 0.15).stroke({ color: index % 2 ? palette.accent : palette.fog, alpha: 0.48, width: 2 })
        .circle(vx + 5, y + height * (0.36 + index % 2 * 0.2), 3).fill({ color: palette.accent, alpha: 0.66 });
    }
  }

  private drawRockShelf(graphic: Graphics, x: number, y: number, width: number, height: number, palette: ScenePalette): void {
    const top = y + height * 0.24;
    const bottom = y + height * 0.78;
    graphic.poly([x, top, x + width * 0.8, y, x + width, top, x + width * 0.72, bottom, x + width * 0.16, y + height, x, bottom])
      .fill({ color: 0x695049, alpha: 0.96 })
      .poly([x, top, x + width * 0.8, y, x + width * 0.72, bottom, x + width * 0.16, y + height]).fill({ color: 0x80645a, alpha: 0.9 })
      .moveTo(x + width * 0.14, top + 5).lineTo(x + width * 0.76, y + height * 0.16).stroke({ color: palette.accent, alpha: 0.24, width: 2 });
  }

  private drawCaveShadow(graphic: Graphics, x: number, y: number, width: number, height: number, palette: ScenePalette): void {
    graphic.poly([x, y, x + width, y, x + width * 0.9, y + height * 0.74, x + width * 0.55, y + height, x + width * 0.14, y + height * 0.82])
      .fill({ color: 0x1b1721, alpha: 0.92 })
      .poly([x + width * 0.12, y + height * 0.08, x + width * 0.84, y + height * 0.06, x + width * 0.7, y + height * 0.36, x + width * 0.24, y + height * 0.46])
      .fill({ color: palette.shadow, alpha: 0.42 });
  }

  private drawReefIslet(graphic: Graphics, x: number, y: number, width: number, height: number, palette: ScenePalette): void {
    graphic.ellipse(x + width * 0.5, y + height * 0.78, width * 0.52, height * 0.26).fill({ color: palette.shadow, alpha: 0.4 })
      .poly([x, y + height * 0.72, x + width * 0.12, y + height * 0.22, x + width * 0.48, y, x + width * 0.88, y + height * 0.18, x + width, y + height * 0.72, x + width * 0.74, y + height, x + width * 0.18, y + height])
      .fill({ color: 0x4a716c, alpha: 0.96 });
    const ridges = Math.max(3, Math.round(width / 68));
    for (let index = 0; index < ridges; index++) {
      const rx = x + width * (0.14 + index / ridges * 0.72);
      graphic.moveTo(rx - 8, y + height * 0.72).lineTo(rx + 9, y + height * 0.2).stroke({ color: index % 2 ? palette.fog : palette.accent, alpha: 0.24, width: 2 });
    }
  }

  private drawTideChannel(graphic: Graphics, x: number, y: number, width: number, height: number, palette: ScenePalette): void {
    graphic.ellipse(x + width * 0.5, y + height * 0.5, width * 0.5, height * 0.46).fill({ color: 0x225f77, alpha: 0.78 })
      .ellipse(x + width * 0.48, y + height * 0.42, width * 0.36, height * 0.16).fill({ color: palette.accent, alpha: 0.28 });
    for (let index = 0; index < 3; index++) {
      const yy = y + height * (0.28 + index * 0.2);
      graphic.moveTo(x + width * 0.2, yy).lineTo(x + width * 0.75, yy - height * 0.04).stroke({ color: palette.fog, alpha: 0.3, width: 1.5 });
    }
  }

  private drawShipwreck(graphic: Graphics, x: number, y: number, width: number, height: number, palette: ScenePalette): void {
    const hullY = y + height * 0.65;
    graphic.ellipse(x + width * 0.5, y + height * 0.82, width * 0.48, height * 0.16).fill({ color: palette.shadow, alpha: 0.38 })
      .poly([x + width * 0.08, hullY, x + width * 0.92, hullY, x + width * 0.72, y + height * 0.94, x + width * 0.22, y + height * 0.92]).fill({ color: 0x6d4c38, alpha: 0.98 })
      .rect(x + width * 0.47, y + height * 0.14, width * 0.08, height * 0.54).fill({ color: 0x4f382f });
    graphic.poly([x + width * 0.54, y + height * 0.18, x + width * 0.82, y + height * 0.48, x + width * 0.54, y + height * 0.52]).fill({ color: palette.fog, alpha: 0.46 })
      .moveTo(x + width * 0.18, hullY + height * 0.08).lineTo(x + width * 0.76, hullY + height * 0.04).stroke({ color: palette.accent, alpha: 0.42, width: 2 });
  }

  private drawTideCaveMouth(graphic: Graphics, x: number, y: number, width: number, height: number, palette: ScenePalette): void {
    graphic.ellipse(x + width * 0.5, y + height * 0.68, width * 0.48, height * 0.46).fill({ color: 0x102d42, alpha: 0.94 })
      .arc(x + width * 0.5, y + height * 0.68, Math.min(width, height) * 0.36, Math.PI, 0).stroke({ color: 0x547d81, alpha: 0.92, width: Math.max(6, width * 0.12) })
      .ellipse(x + width * 0.5, y + height * 0.9, width * 0.32, height * 0.1).fill({ color: palette.accent, alpha: 0.24 });
  }

  private drawSporeRing(graphic: Graphics, x: number, y: number, width: number, height: number, palette: ScenePalette): void {
    const cx = x + width / 2;
    const cy = y + height * 0.72;
    const spores = Math.max(4, Math.round(width / 24));
    graphic.ellipse(cx, cy, width * 0.48, height * 0.18).fill({ color: palette.shadow, alpha: 0.28 });
    for (let index = 0; index < spores; index++) {
      const angle = Math.PI * (0.12 + index / Math.max(1, spores - 1) * 0.76);
      const px = cx + Math.cos(angle) * width * 0.36;
      const py = cy - Math.sin(angle) * height * 0.42;
      const cap = 6 + index % 3 * 2;
      graphic.rect(px - 1.5, py, 3, height * 0.22).fill({ color: 0x6a8e71, alpha: 0.9 })
        .circle(px, py - cap * 0.18, cap).fill({ color: palette.accent, alpha: 0.68 })
        .circle(px - cap * 0.22, py - cap * 0.34, cap * 0.25).fill({ color: palette.fog, alpha: 0.72 });
    }
  }

  private drawPath(graphic: Graphics, x: number, y: number, width: number, height: number, palette: ScenePalette): void {
    graphic.poly([x + width * 0.18, y, x + width * 0.82, y, x + width, y + height, x, y + height]).fill({ color: palette.path, alpha: 0.94 })
      .poly([x + width * 0.12, y, x + width * 0.18, y, x, y + height, x - width * 0.08, y + height]).fill({ color: palette.shadow, alpha: 0.2 });
  }

  private drawGrassPatch(graphic: Graphics, x: number, y: number, width: number, height: number, palette: ScenePalette): void {
    graphic.rect(x, y, width, height).fill({ color: 0x3e7047, alpha: 0.76 });
    const blades = Math.max(10, Math.round(width * height / 750));
    for (let index = 0; index < blades; index++) {
      const bx = x + ((index * 37) % Math.max(1, width));
      const by = y + ((index * 53) % Math.max(1, height));
      const blade = 7 + index % 5;
      graphic.moveTo(bx, by + blade).lineTo(bx + (index % 3 - 1) * 3, by).stroke({ color: index % 4 === 0 ? palette.accent : 0x6b9c5c, alpha: 0.65, width: 1.4 });
    }
  }

  private drawAmbience(ambience: { preset: string; density: number }, palette: ScenePalette): void {
    const qualityCount = this.quality === 'cinematic' ? 30 : this.quality === 'standard' ? 17 : 7;
    const requested = Math.max(2, Math.round(qualityCount * Math.max(0.2, ambience.density / 0.42)));
    const sceneLimit = this.activeScene?.resources?.ambientParticleLimit ?? qualityCount;
    const count = Math.min(requested, sceneLimit);
    const luminous = ambience.preset === 'pollen' || ambience.preset === 'starlight' || ambience.preset === 'rune';
    for (let index = 0; index < count; index++) {
      const baseX = (index * 101) % (DESIGN_WIDTH + 120) - 60;
      const baseY = 100 + (index * 53) % 570;
      const graphic = new Graphics({ blendMode: luminous ? 'add' : 'normal' });
      if (ambience.preset === 'pollen') {
        const radius = 1.5 + index % 3;
        graphic.circle(baseX, baseY, radius).fill({ color: index % 3 === 0 ? palette.accent : palette.fog, alpha: this.quality === 'compatibility' ? 0.48 : 0.7 })
          .circle(baseX, baseY, radius * 3.2).fill({ color: palette.accent, alpha: 0.06 });
      } else if (ambience.preset === 'starlight' || ambience.preset === 'rune') {
        const radius = 2 + index % 3;
        graphic.star(baseX, baseY, ambience.preset === 'rune' ? 5 : 4, radius * 2.4, radius * 0.72).fill({ color: index % 3 === 0 ? palette.accent : palette.fog, alpha: this.quality === 'compatibility' ? 0.42 : 0.68 })
          .circle(baseX, baseY, radius * 3).fill({ color: palette.accent, alpha: 0.05 });
      } else {
        graphic.ellipse(baseX, baseY, 35 + index % 3 * 9, 9 + index % 2 * 3).fill({ color: palette.fog, alpha: this.quality === 'compatibility' ? 0.13 : 0.18 });
      }
      this.foreground.addChild(graphic);
      this.ambientParticles.push({ graphic, baseX, baseY, phase: index * 0.71, speed: luminous ? 0.42 + (index % 4) * 0.07 : 0.18 + (index % 4) * 0.035, drift: luminous ? 20 : 32 });
    }
  }

  private update(dt: number): void {
    if (!this.motionEnabled || this.visualSettings.reduceFlicker) return;
    this.elapsed += dt;
    for (const particle of this.ambientParticles) {
      particle.graphic.x = Math.sin(this.elapsed * particle.speed + particle.phase) * particle.drift;
      particle.graphic.y = Math.cos(this.elapsed * particle.speed * 0.7 + particle.phase) * (particle.drift * 0.16);
    }
    for (const view of this.characterViews.values()) view.update(dt);
  }

  private drawObjectVisual(graphic: Graphics, kind: SceneObjectKind): void {
    graphic.clear();
    if (kind === 'star-scar') {
      graphic.ellipse(0, 16, 23, 6).fill({ color: 0x3d4c45, alpha: 0.4 })
        .ellipse(0, 1, 16, 8).fill({ color: 0x796d52, alpha: 0.88 })
        .moveTo(-13, 5).lineTo(14, -8).stroke({ color: 0xffe485, alpha: 0.92, width: 2.4 })
        .circle(-5, -3, 3).fill({ color: 0xfff5c7, alpha: 0.9 })
        .circle(7, 3, 2.4).fill({ color: 0xfff5c7, alpha: 0.78 });
      return;
    }
    if (kind === 'signal-spore') {
      graphic.ellipse(0, 15, 20, 5).fill({ color: 0x16362f, alpha: 0.38 })
        .circle(0, -3, 14).fill({ color: 0x7ae1c5, alpha: 0.16 })
        .circle(0, -3, 8).fill({ color: 0x8ff5d7, alpha: 0.82 })
        .circle(-4, -8, 3).fill({ color: 0xeaffef, alpha: 0.94 })
        .circle(5, 4, 2.5).fill({ color: 0xc8fff0, alpha: 0.76 });
      return;
    }
    if (kind === 'anomaly-core') {
      graphic.ellipse(0, 18, 28, 7).fill({ color: 0x16362f, alpha: 0.5 })
        .circle(0, 0, 24).fill({ color: 0x234f53, alpha: 0.26 })
        .circle(0, 0, 18).stroke({ color: 0x91e7d5, alpha: 0.7, width: 2.5 })
        .poly([0, -16, 13, 0, 0, 16, -13, 0]).fill({ color: 0x5bbfae, alpha: 0.9 })
        .circle(0, 0, 5).fill({ color: 0xe5fff8, alpha: 0.96 });
      return;
    }
    if (kind === 'gravity-node') {
      graphic.circle(0, 0, 23).stroke({ color: 0xc6a9ff, alpha: 0.28, width: 2 })
        .poly([0, -22, 12, 0, 0, 22, -12, 0]).fill({ color: 0x8eeeff, alpha: 0.86 })
        .poly([0, -22, 12, 0, 0, 0]).fill({ color: 0xe8fbff, alpha: 0.75 })
        .circle(0, 0, 4).fill({ color: 0xffffff, alpha: 0.92 });
      return;
    }
    if (kind === 'ruin-terminal') {
      graphic.ellipse(0, 17, 25, 6).fill({ color: 0x120b26, alpha: 0.42 })
        .poly([-15, 14, -10, -16, 10, -16, 15, 14]).fill({ color: 0x4a3b68, alpha: 0.96 })
        .rect(-7, -10, 14, 13).fill({ color: 0x1c2748, alpha: 0.94 })
        .rect(-4, -7, 8, 2).fill({ color: 0x86efff, alpha: 0.84 })
        .circle(0, 0, 13).stroke({ color: 0xc6a9ff, alpha: 0.32, width: 1.5 });
      return;
    }
    if (kind === 'rift-core') {
      graphic.circle(0, 0, 24).fill({ color: 0x291546, alpha: 0.32 })
        .circle(0, 0, 18).stroke({ color: 0xc6a9ff, alpha: 0.72, width: 2 })
        .poly([0, -14, 14, 0, 0, 14, -14, 0]).fill({ color: 0x7d5ad3, alpha: 0.92 })
        .circle(0, 0, 5).fill({ color: 0x86efff, alpha: 0.96 });
      return;
    }
    if (kind === 'tide-gauge') {
      graphic.ellipse(0, 16, 19, 5).fill({ color: 0x143448, alpha: 0.4 })
        .rect(-4, -14, 8, 28).fill({ color: 0x5d756f })
        .circle(0, -14, 8).fill({ color: 0x80dce3, alpha: 0.84 })
        .circle(0, -14, 4).stroke({ color: 0xe8fff4, alpha: 0.88, width: 1.5 })
        .moveTo(0, -14).lineTo(3, -18).stroke({ color: 0x173b4c, alpha: 0.9, width: 1.5 });
      return;
    }
    if (kind === 'ship-log') {
      graphic.ellipse(0, 14, 20, 5).fill({ color: 0x143448, alpha: 0.38 })
        .rect(-12, -7, 24, 15).fill({ color: 0x80573d })
        .rect(-9, -5, 18, 11).fill({ color: 0xd5b57d })
        .moveTo(-5, -1).lineTo(6, -1).stroke({ color: 0x4b382d, alpha: 0.82, width: 1.5 })
        .moveTo(-5, 3).lineTo(4, 3).stroke({ color: 0x4b382d, alpha: 0.72, width: 1.2 });
      return;
    }
    if (kind === 'tide-anchor') {
      graphic.ellipse(0, 17, 26, 6).fill({ color: 0x102c3b, alpha: 0.42 })
        .circle(0, 0, 17).stroke({ color: 0xb977ff, alpha: 0.7, width: 2.5 })
        .poly([0, -15, 11, -2, 7, 14, -7, 14, -11, -2]).fill({ color: 0x5bd5dc, alpha: 0.82 })
        .circle(0, 0, 5).fill({ color: 0xe6ffff, alpha: 0.9 });
      return;
    }
    if (kind === 'rift-gate') {
      graphic.arc(0, 3, 21, Math.PI, 0).stroke({ color: 0x8f62d4, alpha: 0.88, width: 5 })
        .arc(0, 3, 14, Math.PI, 0).stroke({ color: 0xb977ff, alpha: 0.38, width: 2 })
        .circle(0, 4, 8).fill({ color: 0x1a123c, alpha: 0.82 })
        .star(0, 3, 4, 5, 2).fill({ color: 0x9ce9ec, alpha: 0.86 });
      return;
    }
    if (kind === 'legend-echo') {
      graphic.ellipse(0, 7, 24, 9).fill({ color: 0x86efff, alpha: 0.1 })
        .arc(-2, 0, 15, -Math.PI * 0.75, Math.PI * 0.42).stroke({ color: 0xe4f8ff, alpha: 0.86, width: 3 })
        .star(13, -13, 4, 5, 1.8).fill({ color: 0xc6a9ff, alpha: 0.9 });
      return;
    }
    graphic.poly([0, -18, 11, 0, 0, 18, -11, 0]).fill({ color: 0x8ee4df, alpha: 0.82 }).circle(0, 0, 4).fill({ color: 0xeafaf4 });
  }

  private objectVisualFor(id: string): SceneObjectKind {
    return this.activeScene?.objectVisuals?.find((object) => object.id === id)?.kind ?? 'default';
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
