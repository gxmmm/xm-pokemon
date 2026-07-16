import type { BattleArtAssetKind, BattleArtMotionId, BattleArtSpriteSheetMetadata, BattleAssetManifestEntry } from '@pokemon-online/config';
import { Assets, Rectangle, Texture } from 'pixi.js';

/** Manifest-only Pixi loader. Resource URLs are resolved by @pokemon-online/config;
 * this class intentionally accepts an entry rather than a species or file path. */
export class BattleArtAssetLoader {
  private readonly textureRequests = new Map<string, Promise<Texture | null>>();
  private readonly metadataRequests = new Map<string, Promise<BattleArtSpriteSheetMetadata | null>>();
  private readonly clipTextureRequests = new Map<string, Promise<readonly Texture[] | null>>();

  load(entry: BattleAssetManifestEntry): Promise<Texture | null> {
    if (!isSpriteAsset(entry.kind) || !entry.url) return Promise.resolve(null);
    const cached = this.textureRequests.get(entry.id);
    if (cached) return cached;
    const request = Assets.load(entry.url)
      .then((asset) => asset instanceof Texture ? asset : null)
      .catch(() => null);
    this.textureRequests.set(entry.id, request);
    return request;
  }

  loadMetadata(entry: BattleAssetManifestEntry): Promise<BattleArtSpriteSheetMetadata | null> {
    if (entry.kind !== 'sprite-sheet' || !entry.metadataUrl) return Promise.resolve(null);
    const cached = this.metadataRequests.get(entry.id);
    if (cached) return cached;
    const request = fetch(entry.metadataUrl)
      .then(async (response) => response.ok ? response.json() as Promise<unknown> : null)
      .then((metadata) => isSpriteSheetMetadata(metadata) ? metadata : null)
      .catch(() => null);
    this.metadataRequests.set(entry.id, request);
    return request;
  }

  loadClip(entry: BattleAssetManifestEntry, motion: BattleArtMotionId): Promise<readonly Texture[] | null> {
    if (entry.kind !== 'sprite-sheet') return Promise.resolve(null);
    const key = `${entry.id}:${motion}`;
    const cached = this.clipTextureRequests.get(key);
    if (cached) return cached;
    const request = Promise.all([this.load(entry), this.loadMetadata(entry)])
      .then(([texture, metadata]) => {
        const clip = metadata?.clips[motion];
        if (!texture || !metadata || !clip?.frames.length) return null;
        const rows = Math.ceil(texture.height / metadata.frameHeight);
        const maxFrames = metadata.columns * rows;
        if (clip.frames.some((frame) => !Number.isInteger(frame) || frame < 0 || frame >= maxFrames)) return null;
        return clip.frames.map((frame) => new Texture({
          source: texture.source,
          frame: new Rectangle(
            (frame % metadata.columns) * metadata.frameWidth,
            Math.floor(frame / metadata.columns) * metadata.frameHeight,
            metadata.frameWidth,
            metadata.frameHeight,
          ),
        }));
      })
      .catch(() => null);
    this.clipTextureRequests.set(key, request);
    return request;
  }

  preload(entries: readonly BattleAssetManifestEntry[]): Promise<void> {
    return Promise.all(entries.map((entry) => this.load(entry))).then(() => undefined);
  }

  clear(): void {
    this.textureRequests.clear();
    this.metadataRequests.clear();
    this.clipTextureRequests.clear();
  }
}

/** Useful for diagnostics/tests without requiring browser asset decoding. */
export function isSpriteAsset(kind: BattleArtAssetKind): boolean {
  return kind === 'static-sprite' || kind === 'sprite-sheet';
}

function isSpriteSheetMetadata(value: unknown): value is BattleArtSpriteSheetMetadata {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1 || !positiveInteger(record.frameWidth) || !positiveInteger(record.frameHeight) || !positiveInteger(record.columns) || !positiveInteger(record.fps) || !record.clips || typeof record.clips !== 'object' || !Array.isArray(record.transitions)) return false;
  return Object.values(record.clips as Record<string, unknown>).every((clip) => {
    if (!clip || typeof clip !== 'object') return false;
    const candidate = clip as Record<string, unknown>;
    return typeof candidate.loop === 'boolean' && Array.isArray(candidate.frames) && candidate.frames.length > 0 && candidate.frames.every((frame) => Number.isInteger(frame) && (frame as number) >= 0);
  }) && record.transitions.every((transition) => {
    if (!transition || typeof transition !== 'object') return false;
    const candidate = transition as Record<string, unknown>;
    return typeof candidate.from === 'string' && typeof candidate.to === 'string' && positiveInteger(candidate.durationMs) && candidate.easing === 'cubic-in-out';
  });
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}
