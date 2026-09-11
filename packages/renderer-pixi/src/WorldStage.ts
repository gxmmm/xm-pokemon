import { type AssetKey, type SceneTransitionRequest, type WorldCue, type WorldRenderInput, type WorldRenderer, type WorldRenderSnapshot } from '@pokemon-online/renderer';
import { Application, Container } from 'pixi.js';
import { PixelGraphics as Graphics } from './PixelGraphics.ts';
import { CharacterView, type CharacterAppearance, type CharacterBehavior } from './CharacterView.ts';
import { DrawCallObserver } from './draw-call-observer.ts';
import { PIXEL_ART_STYLE, type WorldReliefLayout } from '@pokemon-online/config';
import { drawWorldRelief } from './WorldRelief.ts';

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
  kind: 'lighthouse' | 'building' | 'dock' | 'boulder' | 'path' | 'roof' | 'fog-bank' | 'crystal-cluster' | 'rift-mist' | 'cave-veil' | 'stone-terrace' | 'cave-shadow';
  x: number;
  y: number;
  width?: number;
  height?: number;
  depth: 'terrain' | 'scenery' | 'occlusion' | 'foreground';
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
  relief?: WorldReliefLayout;
  landmarks?: readonly Landmark[];
  characters?: readonly SceneCharacter[];
  resources?: { preloadKeys: readonly string[]; ambientParticleLimit: number; entityLimit: number };
}

export interface WorldStageDiagnostics {
  sceneId: string | null;
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

/** Config-driven GPU world sample. It renders static scene-pack information and
 * renderer DTO snapshots only; movement/collision/encounters remain in
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
  private basePaint: { sky: Graphics; ground: Graphics; shadow: Graphics } | null = null;
  private readonly characterViews = new Map<string, CharacterView>();
  private reliefObjects: Graphics[] = [];
  private readonly ambientParticles: AmbientParticle[] = [];
  /** Asset keys retained only for the currently entered Scene Pack. Current world
   * packs are procedural, so this tracks the explicit zero-external-asset boundary. */
  private readonly scenePreloadKeys = new Set<AssetKey>();
  private host: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private activeScene: WorldStageSceneSpec | null = null;
  private elapsed = 0;
  private motionEnabled = true;
  private drawCallObserver: DrawCallObserver | null = null;
  private cancelTransition: (() => void) | null = null;
  private lifecycleVersion = 0;
  private sceneVersion = 0;

  async mount(host: HTMLElement): Promise<void> {
    this.unmount();
    const version = this.lifecycleVersion;
    this.host = host;
    const app = new Application();
    try {
    await app.init({
      width: DESIGN_WIDTH,
      height: DESIGN_HEIGHT,
      background: FALLBACK_PALETTE.backdrop,
      autoDensity: true,
      resolution: 1 / PIXEL_ART_STYLE.screenPixelSize,
      antialias: false,
      preference: 'webgl',
    });
    if (version !== this.lifecycleVersion) {
      this.disposeApplication(app);
      return;
    }
    app.canvas.style.cssText = 'display:block;width:100%;height:100%;image-rendering:pixelated;';
    host.replaceChildren(app.canvas);
    this.app = app;
    this.drawCallObserver = new DrawCallObserver((app.renderer as unknown as { gl?: WebGLRenderingContext }).gl ?? null);
    this.root = new Container();
    app.stage.addChild(this.root);
    this.root.addChild(this.terrain, this.scenery, this.entities, this.occlusion, this.foreground, this.overlay);
    this.entities.sortableChildren = true;
    this.transitionGraphic = new Graphics();
    this.overlay.addChild(this.transitionGraphic);
    app.ticker.add((ticker) => this.update(Math.min(0.05, ticker.deltaTime / 60)));
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    } catch (error) {
      const current = version === this.lifecycleVersion;
      if (this.app === app) this.unmount();
      else this.disposeApplication(app);
      if (current) throw error;
    }
  }

  unmount(): void {
    this.lifecycleVersion++;
    this.sceneVersion++;
    this.cancelTransition?.();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.ambientParticles.length = 0;
    this.scenePreloadKeys.clear();
    this.characterViews.clear();
    this.reliefObjects.length = 0;
    this.drawCallObserver?.destroy();
    this.drawCallObserver = null;
    for (const layer of [this.terrain, this.scenery, this.entities, this.occlusion, this.foreground, this.overlay]) {
      layer.removeChildren().forEach((child) => child.destroy({ children: true }));
    }
    this.root?.removeChildren();
    if (this.app) this.disposeApplication(this.app);
    this.app = null;
    this.root = null;
    this.transitionGraphic = null;
    this.basePaint = null;
    this.host?.replaceChildren();
    this.host = null;
    this.activeScene = null;
  }

  private disposeApplication(app: Application): void {
    if (app.renderer) app.destroy({ removeView: true, releaseGlobalResources: false }, { children: true });
    else app.stage?.destroy({ children: true });
  }

  setMotionEnabled(enabled: boolean): void { this.motionEnabled = enabled; }

  getDiagnostics(): WorldStageDiagnostics {
    const drawCalls = this.drawCallObserver?.read() ?? { total: 0, sinceLastRead: 0 };
    return {
      sceneId: this.activeScene?.id ?? null,
      preloadKeyCount: this.scenePreloadKeys.size,
      ambientParticleCount: this.ambientParticles.length,
      entityCount: this.characterViews.size,
      staticChildCount: this.terrain.children.length + this.scenery.children.length + this.occlusion.children.length + this.foreground.children.length + this.reliefObjects.length - this.ambientParticles.length,
      totalChildCount: this.terrain.children.length + this.scenery.children.length + this.entities.children.length + this.occlusion.children.length + this.foreground.children.length + this.overlay.children.length,
      canvasCount: this.app?.canvas ? 1 : 0,
      canvasPixels: this.app?.canvas ? this.app.canvas.width * this.app.canvas.height : 0,
      drawCallTotal: drawCalls.total,
      drawCallsSinceLastSample: drawCalls.sinceLastRead,
      motionEnabled: this.motionEnabled,
    };
  }

  async preload(keys: readonly AssetKey[]): Promise<void> {
    for (const key of keys) this.scenePreloadKeys.add(key);
  }

  async transition(request: SceneTransitionRequest): Promise<void> {
    await this.animateTransitionOverlay(request.color ?? '#0b2430', request.kind === 'biome-crossfade' ? 0.82 : 0.68, request.durationMs ?? 260);
  }

  private async animateTransitionOverlay(fill: string, peakAlpha: number, durationMs: number): Promise<void> {
    this.cancelTransition?.();
    const overlay = this.transitionGraphic;
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
        const bounds = this.viewportBounds();
        overlay.clear().rect(bounds.x, bounds.y, bounds.width, bounds.height).fill({ color: fill, alpha: peakAlpha * Math.sin(progress * Math.PI) });
        if (progress < 1) frame = requestAnimationFrame(draw);
        else finish();
      };
      frame = requestAnimationFrame(draw);
    });
  }

  async enterWorld(_input: WorldRenderInput): Promise<void> {
    this.activeScene = null;
    this.drawScene();
  }

  async enterScene(_input: WorldRenderInput, scene: WorldStageSceneSpec): Promise<void> {
    if (!this.app) return;
    const lifecycle = this.lifecycleVersion;
    const version = ++this.sceneVersion;
    this.activeScene = scene;
    // Scene-local only: switching packs discards prior preload ownership rather
    // than retaining assets for every world map.
    this.scenePreloadKeys.clear();
    await this.preload((scene.resources?.preloadKeys ?? []).map((key) => key as AssetKey));
    if (!this.app || lifecycle !== this.lifecycleVersion || version !== this.sceneVersion) return;
    this.drawScene();
  }

  applyWorldSnapshot(snapshot: WorldRenderSnapshot): void {
    if (!this.app) return;
    const dynamicIds = new Set(snapshot.entities.map((entity) => entity.id));
    const staticCharacters = (this.activeScene?.characters ?? [])
      .filter((character) => character.x !== undefined && character.y !== undefined && !dynamicIds.has(character.id))
      .map((character) => ({ id: character.id, kind: 'npc' as const, position: { x: character.x!, y: character.y! } }));
    // Visual budgeting may cap DTOs but cannot alter authoritative world state.
    // Input ordering places the player first, then authoritative character DTOs.
    const entityLimit = this.activeScene?.resources?.entityLimit ?? Number.POSITIVE_INFINITY;
    const entities = [...snapshot.entities, ...staticCharacters].slice(0, entityLimit);
    const characterIds = new Set(entities.map((entity) => entity.id));

    for (const [id, view] of this.characterViews) if (!characterIds.has(id)) { view.destroy(); this.characterViews.delete(id); }

    for (const entity of entities) {
      const point = { x: 160 + entity.position.x * TILE_WIDTH, y: 110 + entity.position.y * TILE_HEIGHT };
      const character = this.characterSpecFor(entity.id, entity.kind);
      let view = this.characterViews.get(entity.id);
      if (!view) {
        view = new CharacterView(character.appearance, character.behavior);
        this.characterViews.set(entity.id, view);
        this.entities.addChild(view.container);
      } else view.setStyle(character.appearance, character.behavior);
      view.setWorldPosition(point.x, point.y);
      view.container.zIndex = point.y;
    }
  }

  async playWorldCues(_cues: readonly WorldCue[]): Promise<void> {}

  private drawScene(): void {
    for (const object of this.reliefObjects) { object.removeFromParent(); object.destroy(); }
    this.reliefObjects.length = 0;
    for (const layer of [this.terrain, this.scenery, this.occlusion, this.foreground]) layer.removeChildren().forEach((child) => child.destroy());
    this.ambientParticles.length = 0;
    const palette = this.activeScene?.palette ?? FALLBACK_PALETTE;
    this.drawBase(palette);
    if (this.activeScene?.relief) {
      const art = drawWorldRelief(this.activeScene.relief, palette);
      this.terrain.addChild(art.floor); this.scenery.addChild(art.backdrop); this.foreground.addChild(art.front);
      this.reliefObjects = art.rows;
      this.entities.addChild(...art.rows);
    } else if (this.activeScene) this.drawLandmarks(this.activeScene, palette);
    this.drawAmbience(this.activeScene?.ambience ?? { preset: 'mist', density: 0.3 }, palette);
    this.resize();
  }

  private drawBase(palette: ScenePalette): void {
    this.basePaint = { sky: new Graphics(), ground: new Graphics(), shadow: new Graphics() };
    this.terrain.addChild(this.basePaint.sky, this.basePaint.ground, this.basePaint.shadow);
    this.paintViewportBase(palette);
  }

  private viewportBounds(): { x: number; y: number; width: number; height: number } {
    const scale = this.root?.scale.x ?? 1;
    const width = (this.host?.clientWidth ?? DESIGN_WIDTH) / scale;
    const height = (this.host?.clientHeight ?? DESIGN_HEIGHT) / scale;
    return { x: -(this.root?.x ?? 0) / scale, y: -(this.root?.y ?? 0) / scale, width, height };
  }

  private paintViewportBase(palette: ScenePalette): void {
    if (!this.basePaint) return;
    const bounds = this.viewportBounds();
    // Extend the continuous environment, keeping every map entity in the same
    // uniform projection instead of stretching or cropping the playable map.
    this.basePaint.sky.clear().rect(bounds.x, bounds.y, bounds.width, bounds.height).fill({ color: palette.backdrop });
    if (this.activeScene?.relief) {
      this.basePaint.ground.clear(); this.basePaint.shadow.clear();
      if (this.activeScene.relief.style === 'harbor') {
        this.basePaint.ground.rect(bounds.x,bounds.y,bounds.width,Math.max(0,650-bounds.y)).fill({color:palette.ground});
        this.basePaint.shadow.rect(bounds.x,650,bounds.width,17).fill({color:palette.shadow});
      }
      return;
    }
    this.basePaint.ground.clear().rect(bounds.x, 410, bounds.width, Math.max(0, bounds.y + bounds.height - 410)).fill({ color: palette.ground });
    this.basePaint.shadow.clear().rect(bounds.x, 408, bounds.width, 8).fill({ color: palette.shadow, alpha: 0.18 });
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
      case 'boulder': this.drawBoulders(graphic, x, y, width, height, palette); break;
      case 'path': this.drawPath(graphic, x, y, width, height, palette); break;
      case 'fog-bank': graphic.ellipse(x + width / 2, y + height / 2, width * 0.75, height * 0.7).fill({ color: palette.fog, alpha: 0.28 }); break;
      case 'crystal-cluster': this.drawCrystalCluster(graphic, x, y, width, height, palette); break;
      case 'rift-mist': this.drawRiftMist(graphic, x, y, width, height, palette); break;
      case 'cave-veil': this.drawCaveVeil(graphic, x, y, width, height, palette); break;
      case 'stone-terrace': this.drawStoneTerrace(graphic, x, y, width, height, palette); break;
      case 'cave-shadow': this.drawCaveShadow(graphic, x, y, width, height, palette); break;
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

  private drawCaveVeil(graphic: Graphics, x: number, y: number, width: number, height: number, palette: ScenePalette): void {
    const bands = Math.max(3, Math.round(width / 120));
    for (let index = 0; index < bands; index++) {
      const cx = x + width * (0.1 + index / bands * 0.8);
      const cy = y + height * (0.36 + index % 2 * 0.22);
      graphic.ellipse(cx, cy, width / bands * 0.66, height * 0.34).fill({ color: palette.fog, alpha: 0.11 + index % 2 * 0.04 })
        .ellipse(cx, cy + height * 0.1, width / bands * 0.4, height * 0.12).fill({ color: 0x3fa9c4, alpha: 0.1 });
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

  private drawCaveShadow(graphic: Graphics, x: number, y: number, width: number, height: number, palette: ScenePalette): void {
    graphic.poly([x, y, x + width, y, x + width * 0.9, y + height * 0.74, x + width * 0.55, y + height, x + width * 0.14, y + height * 0.82])
      .fill({ color: 0x1b1721, alpha: 0.92 })
      .poly([x + width * 0.12, y + height * 0.08, x + width * 0.84, y + height * 0.06, x + width * 0.7, y + height * 0.36, x + width * 0.24, y + height * 0.46])
      .fill({ color: palette.shadow, alpha: 0.42 });
  }

  private drawPath(graphic: Graphics, x: number, y: number, width: number, height: number, palette: ScenePalette): void {
    graphic.poly([x + width * 0.18, y, x + width * 0.82, y, x + width, y + height, x, y + height]).fill({ color: palette.path, alpha: 0.94 })
      .poly([x + width * 0.12, y, x + width * 0.18, y, x, y + height, x - width * 0.08, y + height]).fill({ color: palette.shadow, alpha: 0.2 });
  }

  private drawAmbience(ambience: { preset: string; density: number }, palette: ScenePalette): void {
    const standardParticleCount = 17;
    const requested = Math.max(2, Math.round(standardParticleCount * Math.max(0.2, ambience.density / 0.42)));
    const sceneLimit = this.activeScene?.resources?.ambientParticleLimit ?? standardParticleCount;
    const count = Math.min(requested, sceneLimit);
    const luminous = ambience.preset === 'pollen' || ambience.preset === 'starlight' || ambience.preset === 'rune';
    for (let index = 0; index < count; index++) {
      const baseX = (index * 101) % (DESIGN_WIDTH + 120) - 60;
      const baseY = this.activeScene?.relief?.style === 'harbor' ? 660 + index * 7 : 100 + (index * 53) % 570;
      const graphic = new Graphics({ blendMode: luminous ? 'add' : 'normal' });
      if (ambience.preset === 'pollen') {
        const radius = 1.5 + index % 3;
        graphic.circle(baseX, baseY, radius).fill({ color: index % 3 === 0 ? palette.accent : palette.fog, alpha: 0.7 })
          .circle(baseX, baseY, radius * 3.2).fill({ color: palette.accent, alpha: 0.06 });
      } else if (ambience.preset === 'starlight' || ambience.preset === 'rune') {
        const radius = 2 + index % 3;
        graphic.star(baseX, baseY, ambience.preset === 'rune' ? 5 : 4, radius * 2.4, radius * 0.72).fill({ color: index % 3 === 0 ? palette.accent : palette.fog, alpha: 0.68 })
          .circle(baseX, baseY, radius * 3).fill({ color: palette.accent, alpha: 0.05 });
      } else {
        graphic.ellipse(baseX, baseY, 35 + index % 3 * 9, 5 + index % 2 * 3).fill({ color: palette.fog, alpha: 0.08 });
      }
      this.foreground.addChild(graphic);
      this.ambientParticles.push({ graphic, baseX, baseY, phase: index * 0.71, speed: luminous ? 0.42 + (index % 4) * 0.07 : 0.18 + (index % 4) * 0.035, drift: luminous ? 20 : 32 });
    }
  }

  private update(dt: number): void {
    if (!this.motionEnabled) return;
    this.elapsed += dt;
    for (const particle of this.ambientParticles) {
      particle.graphic.x = Math.sin(this.elapsed * particle.speed + particle.phase) * particle.drift;
      particle.graphic.y = Math.cos(this.elapsed * particle.speed * 0.7 + particle.phase) * (particle.drift * 0.16);
    }
    for (const view of this.characterViews.values()) view.update(dt);
  }

  private characterSpecFor(id: string, kind: 'player' | 'npc' | 'wild'): { appearance: CharacterAppearance; behavior: CharacterBehavior } {
    const configured = this.activeScene?.characters?.find((character) => character.id === id);
    if (configured) return configured;
    if (kind === 'player') return { appearance: 'hero', behavior: 'idle' };
    return { appearance: 'fisher', behavior: 'idle' };
  }

  private resize(): void {
    if (!this.app || !this.root || !this.host) return;
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.app.renderer.resize(width, height);
    // Buildings can extend above their map anchors. Fit their actual geometry
    // with a small margin as well as the playable map; foreground fog may bleed.
    let left = 0, top = 0, right = DESIGN_WIDTH, bottom = DESIGN_HEIGHT;
    for (const layer of [this.scenery, this.occlusion]) {
      if (!layer.children.length) continue;
      const bounds = layer.getLocalBounds();
      left = Math.min(left, bounds.x - 16);
      top = Math.min(top, bounds.y - 16);
      right = Math.max(right, bounds.x + bounds.width + 16);
      bottom = Math.max(bottom, bounds.y + bounds.height + 16);
    }
    const scale = Math.min(width / (right - left), height / (bottom - top));
    this.root.scale.set(scale);
    this.root.position.set((width - (right + left) * scale) / 2, (height - (bottom + top) * scale) / 2);
    this.paintViewportBase(this.activeScene?.palette ?? FALLBACK_PALETTE);
  }
}
