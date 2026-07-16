import { battleArtMotionForAnimation, resolveBattleArtPresentation, type BattleArtLayerSpec, type BattleArtMotionId, type BattleArtSpriteSheetMetadata, type ResolvedBattleArtPresentation } from '@pokemon-online/config';
import type { BattleCombatant } from '@pokemon-online/shared';
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { BattleArtAssetLoader } from './BattleArtAssets.ts';

/**
 * GPU model view driven entirely by a resolved BattleArtProfile. It has no
 * species/skill/file-path branches: failed or unavailable assets retain the
 * configuration-owned procedural fallback so combat remains readable.
 */
export interface CombatantViewDiagnostics {
  modelId: string;
  profileId: string;
  layerCount: number;
  motion: BattleArtMotionId;
  facing: 1 | -1;
  transitioning: boolean;
  spriteReady: boolean;
}

export class CombatantView extends Container {
  private readonly body = new Container();
  private readonly behindLayers = new Container();
  private readonly frontLayers = new Container();
  private readonly shadow = new Graphics();
  private readonly fallback = new Graphics();
  private readonly decorations = new Map<string, { graphic: Graphics; spec: BattleArtLayerSpec }>();
  private readonly sprite = new Sprite(Texture.EMPTY);
  private presentation: ResolvedBattleArtPresentation;
  private loadToken = 0;
  private clipRequestToken = 0;
  private motionElapsedMs = 0;
  private motion: BattleArtMotionId;
  private transitionElapsedMs = 0;
  private transitionDurationMs = 0;
  private transitionFrom: MotionTransform | null = null;
  private clipFrames: readonly Texture[] | null = null;
  private clipMotion: BattleArtMotionId | null = null;
  private clipElapsedMs = 0;
  private clipFps = 12;
  private spriteSheetMetadata: BattleArtSpriteSheetMetadata | null = null;
  /** Renderer-facing direction comes from the battle snapshot, never model IDs. */
  private facing: 1 | -1 = 1;
  private alive = true;
  private baseScale: number;

  constructor(
    combatant: BattleCombatant,
    private readonly assets: BattleArtAssetLoader,
  ) {
    super();
    this.presentation = resolveBattleArtPresentation({ speciesId: combatant.speciesId, side: combatant.side });
    this.motion = this.presentation.motion.id;
    this.baseScale = this.presentation.profile.scale;
    this.drawFallback();
    this.rebuildLayers();
    this.sprite.anchor.set(0.5, 0.58);
    this.sprite.visible = false;
    this.body.addChild(this.behindLayers, this.shadow, this.fallback, this.sprite, this.frontLayers);
    this.addChild(this.body);
    this.refresh(combatant);
    this.requestTexture();
  }

  refresh(combatant: BattleCombatant): void {
    const resolved = resolveBattleArtPresentation({ speciesId: combatant.speciesId, side: combatant.side });
    const changedAsset = this.presentation.asset.id !== resolved.asset.id;
    const changedProfile = this.presentation.profile.id !== resolved.profile.id;
    this.presentation = resolved;
    this.baseScale = resolved.profile.scale;
    this.facing = combatant.facing;
    this.alive = combatant.alive;
    if (changedProfile) this.rebuildLayers();
    if (changedAsset) this.requestTexture();
  }

  playAnimation(animation: string): void {
    this.setMotion(battleArtMotionForAnimation(animation));
  }

  getDiagnostics(): CombatantViewDiagnostics {
    return {
      modelId: this.presentation.profile.modelId,
      profileId: this.presentation.profile.id,
      layerCount: this.decorations.size,
      motion: this.motion,
      facing: this.facing,
      transitioning: this.transitionFrom !== null,
      spriteReady: this.sprite.visible,
    };
  }

  update(dtSeconds: number): void {
    const clip = this.presentation.profile.motions[this.motion];
    const elapsedMs = dtSeconds * 1000;
    this.motionElapsedMs += elapsedMs;
    const progress = clip.loop ? (this.motionElapsedMs % clip.durationMs) / clip.durationMs : Math.min(1, this.motionElapsedMs / clip.durationMs);
    if (!clip.loop && progress >= 1 && this.motion !== 'faint') this.setMotion('idle');

    const pulse = this.motion === 'idle' ? Math.sin(progress * Math.PI * 2) * 0.025
      : this.motion === 'locomotion' ? Math.sin(progress * Math.PI * 2) * 0.05
      : this.motion === 'charge' || this.motion === 'channel' ? Math.sin(progress * Math.PI * 2) * 0.035
      : 0;
    const recoil = this.motion === 'hit' ? Math.sin(progress * Math.PI) * -12 : 0;
    const faintScale = this.motion === 'faint' || !this.alive ? 1 - Math.min(0.3, progress * 0.3) : 1;
    const pose = this.presentation.profile.motionPoses[this.motion] ?? {};
    const target: MotionTransform = {
      // Mirror the complete visual hierarchy (sprite, authored layers, generic
      // aura/halo and fallback) with the renderer snapshot direction. Offsets,
      // recoil and tilt follow that same direction so attack/cast poses point
      // toward the combatant's current target instead of a fixed screen side.
      scaleX: this.facing * this.baseScale * (pose.scaleX ?? 1) * (1 + pulse) * faintScale,
      scaleY: this.baseScale * (pose.scaleY ?? 1) * (1 - pulse * 0.6) * faintScale,
      x: this.facing * ((pose.offsetX ?? 0) + recoil),
      y: pose.offsetY ?? 0,
      rotation: this.facing * (pose.rotationDeg ?? 0) * Math.PI / 180,
    };
    this.advanceClip(elapsedMs);
    const transform = this.interpolateTransition(target, elapsedMs);
    this.body.scale.set(transform.scaleX, transform.scaleY);
    this.body.position.set(transform.x, transform.y);
    this.body.rotation = transform.rotation;
    this.updateLayers(progress, pose.glowAlpha, pose.glowScale);
    this.alpha = this.alive ? 1 : 0.25;
  }

  private setMotion(motion: BattleArtMotionId): void {
    if (this.motion === motion) return;
    this.transitionFrom = {
      scaleX: this.body.scale.x,
      scaleY: this.body.scale.y,
      x: this.body.position.x,
      y: this.body.position.y,
      rotation: this.body.rotation,
    };
    this.transitionElapsedMs = 0;
    this.transitionDurationMs = this.transitionDurationFor(this.motion, motion);
    this.motion = motion;
    this.motionElapsedMs = 0;
    this.clipFrames = null;
    this.clipMotion = null;
    this.clipElapsedMs = 0;
    this.requestClip(motion);
  }

  private requestClip(motion: BattleArtMotionId): void {
    const asset = this.presentation.asset;
    if (asset.kind !== 'sprite-sheet') return;
    const requestToken = ++this.clipRequestToken;
    // Keep the last valid frame visible through an action change. On the first
    // load the procedural fallback remains visible; a full sprite sheet is
    // never assigned to the Sprite while metadata/frames are still loading.
    void Promise.all([this.assets.loadClip(asset, motion), this.assets.loadMetadata(asset)]).then(([frames, metadata]) => {
      if (requestToken !== this.clipRequestToken || this.destroyed || this.motion !== motion || !frames?.length) return;
      this.spriteSheetMetadata = metadata;
      this.clipFrames = frames;
      this.clipMotion = motion;
      this.clipElapsedMs = 0;
      this.clipFps = metadata?.fps ?? 12;
      this.sprite.texture = frames[0]!;
      this.sprite.visible = true;
      this.fallback.visible = false;
      this.sizeSprite(this.sprite.texture);
    });
  }

  private transitionDurationFor(from: BattleArtMotionId, to: BattleArtMotionId): number {
    const declared = this.spriteSheetMetadata?.transitions.find((transition) => transition.from === from && transition.to === to);
    return declared?.durationMs ?? this.presentation.profile.motions[to].blendInMs;
  }

  private advanceClip(elapsedMs: number): void {
    if (!this.clipFrames?.length || this.clipMotion !== this.motion) return;
    this.clipElapsedMs += elapsedMs;
    const clip = this.presentation.profile.motions[this.motion];
    const index = clip.loop
      ? Math.floor(this.clipElapsedMs / (1000 / this.clipFps)) % this.clipFrames.length
      : Math.min(this.clipFrames.length - 1, Math.floor(this.clipElapsedMs / (1000 / this.clipFps)));
    const texture = this.clipFrames[index]!;
    if (this.sprite.texture !== texture) {
      this.sprite.texture = texture;
      this.sizeSprite(texture);
    }
  }

  private interpolateTransition(target: MotionTransform, elapsedMs: number): MotionTransform {
    if (!this.transitionFrom || this.transitionDurationMs <= 0) {
      this.transitionFrom = null;
      return target;
    }
    this.transitionElapsedMs += elapsedMs;
    const progress = Math.min(1, this.transitionElapsedMs / this.transitionDurationMs);
    const amount = cubicInOut(progress);
    const from = this.transitionFrom;
    if (progress >= 1) this.transitionFrom = null;
    return {
      scaleX: lerp(from.scaleX, target.scaleX, amount),
      scaleY: lerp(from.scaleY, target.scaleY, amount),
      x: lerp(from.x, target.x, amount),
      y: lerp(from.y, target.y, amount),
      rotation: lerp(from.rotation, target.rotation, amount),
    };
  }

  private rebuildLayers(): void {
    this.behindLayers.removeChildren().forEach((child) => child.destroy());
    this.frontLayers.removeChildren().forEach((child) => child.destroy());
    this.decorations.clear();
    for (const spec of this.presentation.profile.layers) {
      const graphic = new Graphics();
      const color = colorNumber(this.presentation.theme[spec.color], 0xffffff);
      if (spec.kind === 'aura') graphic.ellipse(0, -4, 34, 42).fill({ color, alpha: spec.alpha });
      else graphic.circle(0, -8, 39).stroke({ color, alpha: spec.alpha, width: 3 });
      if (spec.depth === 'behind') this.behindLayers.addChild(graphic);
      else this.frontLayers.addChild(graphic);
      this.decorations.set(spec.id, { graphic, spec });
    }
  }

  private updateLayers(progress: number, glowAlpha = 0, glowScale = 1): void {
    const motionPulse = this.motion === 'charge' || this.motion === 'channel'
      ? Math.sin(progress * Math.PI * 2)
      : Math.sin(progress * Math.PI);
    for (const { graphic, spec } of this.decorations.values()) {
      const pulse = motionPulse * (spec.pulse ?? 0);
      graphic.scale.set(spec.scale * glowScale * (1 + pulse));
      graphic.alpha = Math.min(1, spec.alpha + glowAlpha * 0.55 + Math.max(0, pulse) * 0.22);
    }
  }

  private drawFallback(): void {
    const theme = this.presentation.theme;
    const primary = colorNumber(theme.primary, 0x69d4e7);
    const secondary = colorNumber(theme.secondary, 0x7ee6ac);
    this.shadow.clear().ellipse(0, 22, 43 * this.presentation.profile.shadowScale, 14).fill({ color: 0x07101a, alpha: 0.34 });
    this.fallback.clear()
      .circle(0, -8, 25).fill({ color: primary, alpha: 0.94 })
      .circle(-8, -16, 8).fill({ color: 0xffffff, alpha: 0.35 })
      .rect(-26, 26, 52, 6).fill({ color: 0x172331, alpha: 0.9 })
      .rect(-25, 27, 50, 4).fill({ color: secondary });
  }

  private requestTexture(): void {
    const requestId = ++this.loadToken;
    const asset = this.presentation.asset;
    this.clipRequestToken++;
    this.clipFrames = null;
    this.clipMotion = null;
    this.clipElapsedMs = 0;
    this.spriteSheetMetadata = null;
    this.sprite.visible = false;
    this.fallback.visible = true;
    this.drawFallback();
    if (asset.kind === 'sprite-sheet') {
      // Sequence sheets must only be displayed through loadClip(), which crops
      // one declared frame. Assigning the sheet Texture here would squash the
      // entire atlas into a combatant silhouette.
      this.requestClip(this.motion);
      return;
    }
    void this.assets.load(asset).then((texture) => {
      if (requestId !== this.loadToken || this.destroyed || !texture) return;
      this.sprite.texture = texture;
      this.sizeSprite(texture);
      this.sprite.visible = true;
      this.fallback.visible = false;
    });
  }

  private sizeSprite(texture: Texture): void {
    const ratio = texture.height > 0 ? texture.width / texture.height : 1;
    const height = 106;
    this.sprite.height = height;
    this.sprite.width = Math.max(54, Math.min(142, height * ratio));
  }
}

interface MotionTransform {
  scaleX: number;
  scaleY: number;
  x: number;
  y: number;
  rotation: number;
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function cubicInOut(value: number): number {
  return value < 0.5 ? 4 * value * value * value : 1 - ((-2 * value + 2) ** 3) / 2;
}

function colorNumber(value: string, fallback: number): number {
  const normalized = value.replace('#', '');
  const parsed = Number.parseInt(normalized, 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}
