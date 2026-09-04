import type { BattleArtMotionId, BattleArtSpriteSheetMetadata, BattleAssetManifestEntry } from '@pokemon-online/config';
import { Sprite, Texture } from 'pixi.js';
import type { BattleArtAssetLoader } from './BattleArtAssets.ts';

type SpriteAssets = Pick<BattleArtAssetLoader, 'load' | 'loadClip' | 'loadMetadata'>;
export const BATTLE_SPRITE_DISPLAY_HEIGHT = 106;

/** Owns bitmap loading and clip playback; poses and action scheduling stay in CombatantView. */
export class CombatantSprite extends Sprite {
  private requestToken = 0;
  private frames: readonly Texture[] | null = null;
  private elapsedMs = 0;
  private fps = 12;
  private loop = true;
  private durationMs: number | undefined;
  private metadata: BattleArtSpriteSheetMetadata | null = null;

  constructor(
    private readonly assets: SpriteAssets,
    private readonly fallback: { visible: boolean },
    private readonly isOwnerDestroyed: () => boolean,
  ) {
    super(Texture.EMPTY);
    this.anchor.set(0.5, 0.58);
    this.visible = false;
  }

  async setAsset(asset: BattleAssetManifestEntry, motion: BattleArtMotionId): Promise<void> {
    const token = ++this.requestToken;
    this.frames = null;
    this.elapsedMs = 0;
    this.metadata = null;
    this.visible = false;
    this.fallback.visible = true;
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
    const index = this.loop ? frame % this.frames.length : Math.min(this.frames.length - 1, frame);
    const texture = this.frames[index]!;
    if (this.texture !== texture || !this.visible) this.showTexture(texture);
  }

  transitionDuration(from: BattleArtMotionId, to: BattleArtMotionId): number | undefined {
    return this.metadata?.transitions.find((transition) => transition.from === from && transition.to === to)?.durationMs;
  }

  private async loadClip(asset: BattleAssetManifestEntry, motion: BattleArtMotionId, token: number): Promise<void> {
    const framesForMotion = this.assets.loadClip(asset, motion).then((frames) => {
      // Missing recover/action clips reuse declared idle frames. Check the
      // token before issuing the fallback so obsolete work stops here too.
      if (!this.isCurrent(token) || frames?.length || motion === 'idle') return frames;
      return this.assets.loadClip(asset, 'idle');
    });
    const [frames, metadata] = await Promise.all([framesForMotion, this.assets.loadMetadata(asset)]);
    if (!this.isCurrent(token) || !frames?.length) return;
    this.metadata = metadata;
    this.frames = frames;
    this.fps = metadata?.fps ?? 12;
    this.updateFrame();
  }

  private isCurrent(token: number): boolean {
    return token === this.requestToken && !this.destroyed && !this.isOwnerDestroyed();
  }

  private showTexture(texture: Texture): void {
    this.texture = texture;
    const ratio = texture.height > 0 ? texture.width / texture.height : 1;
    this.height = BATTLE_SPRITE_DISPLAY_HEIGHT;
    this.width = Math.max(54, Math.min(142, BATTLE_SPRITE_DISPLAY_HEIGHT * ratio));
    this.visible = true;
    this.fallback.visible = false;
  }
}
