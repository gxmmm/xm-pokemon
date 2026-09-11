import type { BattleArtAnchorId, BattleArtMotionId, BattleArtSpriteSheetMetadata, BattleAssetManifestEntry } from '@pokemon-online/config';
import { Sprite, Texture } from 'pixi.js';
import type { BattleArtAssetLoader } from './BattleArtAssets.ts';

type SpriteAssets = Pick<BattleArtAssetLoader, 'load' | 'loadClip' | 'loadMetadata'> & Partial<Pick<BattleArtAssetLoader, 'getLoadedClip' | 'getLoadedMetadata'>>;
export const BATTLE_SPRITE_DISPLAY_HEIGHT = 106;
interface OpaqueFrame { left: number; top: number; right: number; bottom: number; }
const opaqueFrames = new WeakMap<Texture, OpaqueFrame>();

/** Inspect an already-loaded manifest texture once; transparent canvas margins
 * must not count as the body. No asset paths or model-specific overrides. */
function opaqueFrame(texture: Texture): OpaqueFrame {
  const cached = opaqueFrames.get(texture);
  if (cached) return cached;
  let bounds = { left: 0, top: 0, right: 1, bottom: 1 };
  if (typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (context) {
        const frame = texture.frame;
        context.drawImage(texture.source.resource as CanvasImageSource, frame.x, frame.y, frame.width, frame.height, 0, 0, 64, 64);
        const pixels = context.getImageData(0, 0, 64, 64).data;
        let left = 64, top = 64, right = 0, bottom = 0;
        for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
          if (pixels[(y * 64 + x) * 4 + 3]! < 48) continue;
          left = Math.min(left, x); top = Math.min(top, y);
          right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
        }
        if (right > left && bottom > top) {
          const trim = texture.trim;
          bounds = { left: ((trim?.x ?? 0) + left / 64 * frame.width) / texture.orig.width,
            right: ((trim?.x ?? 0) + right / 64 * frame.width) / texture.orig.width,
            top: ((trim?.y ?? 0) + top / 64 * frame.height) / texture.orig.height,
            bottom: ((trim?.y ?? 0) + bottom / 64 * frame.height) / texture.orig.height };
        }
      }
    } catch { /* Non-readable GPU sources retain the declared frame bounds. */ }
  }
  opaqueFrames.set(texture, bounds);
  return bounds;
}

/** Owns bitmap loading and clip playback; poses and action scheduling stay in CombatantView. */
export class CombatantSprite extends Sprite {
  private requestToken = 0;
  private frames: readonly Texture[] | null = null;
  private elapsedMs = 0;
  private fps = 12;
  private loop = true;
  private durationMs: number | undefined;
  private metadata: BattleArtSpriteSheetMetadata | null = null;
  private holdLastFrame = false;
  private contactFrame: OpaqueFrame | null = null;

  constructor(
    private readonly assets: SpriteAssets,
    private readonly fallback: { visible: boolean },
    private readonly isOwnerDestroyed: () => boolean,
  ) {
    super(Texture.EMPTY);
    this.anchor.set(0.5, 0.58);
    this.visible = false;
  }

  async setAsset(asset: BattleAssetManifestEntry, motion: BattleArtMotionId, preservePlayback = false): Promise<void> {
    const token = ++this.requestToken;
    this.frames = null;
    if (!preservePlayback) {
      this.elapsedMs = 0;
      this.metadata = null;
      this.contactFrame = null;
      this.visible = false;
      this.fallback.visible = true;
    }
    if (asset.kind === 'sprite-sheet') {
      // Never display an entire sequence atlas as a single combatant bitmap.
      await this.loadClip(asset, motion, token);
    } else {
      const texture = await this.assets.load(asset);
      if (this.isCurrent(token) && texture) this.showTexture(texture);
    }
  }

  async setMotion(asset: BattleAssetManifestEntry, motion: BattleArtMotionId): Promise<void> {
    this.frames = null;
    this.elapsedMs = 0;
    // A static bitmap request must survive action changes. Sequence requests,
    // however, supersede older actions while retaining the last visible frame.
    if (asset.kind === 'sprite-sheet') {
      await this.loadClip(asset, motion, ++this.requestToken);
    }
  }

  advance(elapsedMs: number, loop: boolean, durationMs?: number): void {
    this.elapsedMs += elapsedMs;
    this.loop = loop;
    this.durationMs = durationMs;
    this.updateFrame();
  }

  private updateFrame(): void {
    if (!this.frames?.length) return;
    const frame = !this.loop && this.durationMs
      ? Math.floor(this.elapsedMs / this.durationMs * this.frames.length)
      : Math.floor(this.elapsedMs / (1000 / this.fps));
    const index = this.loop && !this.holdLastFrame ? frame % this.frames.length : Math.min(this.frames.length - 1, frame);
    const texture = this.frames[index]!;
    if (this.texture !== texture || !this.visible) this.showTexture(texture);
  }

  transitionDuration(from: BattleArtMotionId, to: BattleArtMotionId): number | undefined {
    return this.metadata?.transitions.find((transition) => transition.from === from && transition.to === to)?.durationMs;
  }

  /** 源逐帧挂点随选中的方向图和帧变化，返回身体容器内坐标。 */
  getFrameAnchor(id: BattleArtAnchorId): { x: number; y: number } | undefined {
    const metadata = this.metadata;
    if (!metadata?.frameAnchors || !this.visible) return undefined;
    const index = Math.round(this.texture.frame.y / metadata.frameHeight) * metadata.columns
      + Math.round(this.texture.frame.x / metadata.frameWidth);
    const point = metadata.frameAnchors[index]?.[id];
    return point ? {
      x: (point.x / metadata.frameWidth - this.anchor.x) * this.width * Math.sign(this.scale.x),
      y: (point.y / metadata.frameHeight - this.anchor.y) * this.height,
    } : undefined;
  }

  getBodyBounds(forContact = false) {
    const bounds = forContact && this.contactFrame ? this.contactFrame : opaqueFrame(this.texture);
    return {
      x: ((bounds.left + bounds.right) / 2 - this.anchor.x) * this.width * (this.scale.x < 0 ? -1 : 1),
      y: ((bounds.top + bounds.bottom) / 2 - this.anchor.y) * this.height,
      width: (bounds.right - bounds.left) * this.width,
      height: (bounds.bottom - bounds.top) * this.height,
    };
  }

  private async loadClip(asset: BattleAssetManifestEntry, motion: BattleArtMotionId, token: number): Promise<void> {
    const ready = this.assets.getLoadedClip?.(asset, motion);
    const readyMetadata = this.assets.getLoadedMetadata?.(asset);
    // 同一 cue 批次内先切释放帧，再让 VFX 读取该帧的出口，不能等待微任务。
    if (ready?.length && readyMetadata && this.isCurrent(token)) {
      this.metadata = readyMetadata;
      this.holdLastFrame = readyMetadata.clips[motion]?.holdLastFrame ?? false;
      this.frames = ready;
      this.fps = readyMetadata.fps;
      this.updateFrame();
      return;
    }
    const framesForMotion = this.assets.loadClip(asset, motion).then((frames) => {
      // Missing recover/action clips reuse declared idle frames. Check the
      // token before issuing the fallback so obsolete work stops here too.
      if (!this.isCurrent(token) || frames?.length || motion === 'idle') return frames;
      return this.assets.loadClip(asset, 'idle');
    });
    const [frames, metadata] = await Promise.all([framesForMotion, this.assets.loadMetadata(asset)]);
    if (!this.isCurrent(token) || !frames?.length) return;
    this.metadata = metadata;
    this.holdLastFrame = metadata?.clips[motion]?.holdLastFrame ?? false;
    this.frames = frames;
    this.fps = metadata?.fps ?? 12;
    this.updateFrame();
  }

  private isCurrent(token: number): boolean {
    return token === this.requestToken && !this.destroyed && !this.isOwnerDestroyed();
  }

  private showTexture(texture: Texture): void {
    this.texture = texture;
    this.contactFrame ??= opaqueFrame(texture);
    this.anchor.set(this.metadata?.pivot?.x ?? 0.5, this.metadata?.pivot?.y ?? 0.58);
    const ratio = texture.height > 0 ? texture.width / texture.height : 1;
    this.height = this.metadata?.pixelScale ? texture.height * this.metadata.pixelScale : BATTLE_SPRITE_DISPLAY_HEIGHT;
    this.width = this.metadata?.pixelScale ? texture.width * this.metadata.pixelScale : Math.max(54, Math.min(142, BATTLE_SPRITE_DISPLAY_HEIGHT * ratio));
    this.visible = true;
    this.fallback.visible = false;
  }
}
