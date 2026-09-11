import type { BattleArtAssetKind, BattleArtMotionId, BattleArtSpriteSheetMetadata, BattleAssetManifestEntry } from '@pokemon-online/config';
import { Assets, Rectangle, Texture } from 'pixi.js';

/** Manifest-only Pixi loader. Resource URLs are resolved by @pokemon-online/config;
 * this class intentionally accepts an entry rather than a species or file path. */
export class BattleArtAssetLoader {
  private readonly textureRequests = new Map<string, Promise<Texture | null>>();
  private readonly metadataRequests = new Map<string, Promise<BattleArtSpriteSheetMetadata | null>>();
  private readonly clipTextureRequests = new Map<string, Promise<readonly Texture[] | null>>();
  private readonly readyClips = new Map<string, readonly Texture[]>();
  private readonly readyMetadata = new Map<string, BattleArtSpriteSheetMetadata>();
  private generation = 0;
  private readonly loadedTextures = new Set<string>();
  isTextureReady(entry: BattleAssetManifestEntry) { return this.loadedTextures.has(entry.id); }

  getLoadedClip(entry: BattleAssetManifestEntry, motion: BattleArtMotionId) { return this.readyClips.get(`${entry.id}:${motion}`); }
  getLoadedMetadata(entry: BattleAssetManifestEntry) { return this.readyMetadata.get(entry.id); }

  load(entry: BattleAssetManifestEntry): Promise<Texture | null> {
    if (!isSpriteAsset(entry.kind) || !entry.url) return Promise.resolve(null);
    const cached = this.textureRequests.get(entry.id);
    if (cached) return cached;
    const generation = this.generation;
    const request = Assets.load(entry.url)
      .then((asset) => {
        if (!(asset instanceof Texture)) return null;
        asset.source.scaleMode = 'nearest';
        if (generation === this.generation) this.loadedTextures.add(entry.id);
        return asset;
      })
      .catch(() => null);
    this.textureRequests.set(entry.id, request);
    return request;
  }

  loadMetadata(entry: BattleAssetManifestEntry): Promise<BattleArtSpriteSheetMetadata | null> {
    if (entry.kind !== 'sprite-sheet' || !entry.metadataUrl) return Promise.resolve(null);
    const cached = this.metadataRequests.get(entry.id);
    if (cached) return cached;
    const generation = this.generation;
    const request = fetch(entry.metadataUrl)
      .then(async (response) => response.ok ? response.json() as Promise<unknown> : null)
      .then((metadata) => {
        if (!isSpriteSheetMetadata(metadata)) return null;
        if (generation === this.generation) this.readyMetadata.set(entry.id, metadata);
        return metadata;
      })
      .catch(() => null);
    this.metadataRequests.set(entry.id, request);
    return request;
  }

  loadClip(entry: BattleAssetManifestEntry, motion: BattleArtMotionId): Promise<readonly Texture[] | null> {
    if (entry.kind !== 'sprite-sheet') return Promise.resolve(null);
    const key = `${entry.id}:${motion}`;
    const cached = this.clipTextureRequests.get(key);
    if (cached) return cached;
    const generation = this.generation;
    const request = Promise.all([this.load(entry), this.loadMetadata(entry)])
      .then(([texture, metadata]) => {
        const clip = metadata?.clips[motion];
        if (!texture || !metadata || !clip?.frames.length) return null;
        const rows = Math.ceil(texture.height / metadata.frameHeight);
        const maxFrames = metadata.columns * rows;
        if (clip.frames.some((frame) => !Number.isInteger(frame) || frame < 0 || frame >= maxFrames)) return null;
        const uniqueFrames = new Map<number, Texture>();
        return clip.frames.map((frame) => {
          const cached = uniqueFrames.get(frame);
          if (cached) return cached;
          const sliced = new Texture({
          source: texture.source,
          frame: new Rectangle(
            (frame % metadata.columns) * metadata.frameWidth,
            Math.floor(frame / metadata.columns) * metadata.frameHeight,
            metadata.frameWidth,
            metadata.frameHeight,
          ),
          });
          uniqueFrames.set(frame, sliced);
          return sliced;
        });
      })
      .then(frames => {
        if (frames && generation === this.generation) this.readyClips.set(key, frames);
        return frames;
      })
      .catch(() => null);
    this.clipTextureRequests.set(key, request);
    return request;
  }

  preload(entries: readonly BattleAssetManifestEntry[]): Promise<void> {
    const generation = this.generation;
    return Promise.all(entries.map(async entry => {
      await this.load(entry);
      if (generation !== this.generation) return;
      const metadata = await this.loadMetadata(entry);
      if (generation !== this.generation) return;
      if (metadata) await Promise.all((Object.keys(metadata.clips) as BattleArtMotionId[]).map(motion => this.loadClip(entry, motion)));
    })).then(() => undefined);
  }

  clear(): void {
    this.generation++;
    this.loadedTextures.clear();
    this.readyClips.clear();
    this.readyMetadata.clear();
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
  if (record.pixelScale !== undefined && (typeof record.pixelScale !== 'number' || !Number.isFinite(record.pixelScale) || record.pixelScale <= 0)) return false;
  if (record.pivot !== undefined) {
    const pivot = record.pivot as { x?: unknown; y?: unknown } | null;
    if (!pivot || typeof pivot.x !== 'number' || typeof pivot.y !== 'number' || !Number.isFinite(pivot.x) || !Number.isFinite(pivot.y)) return false;
  }
  if (record.frameAnchors !== undefined && (!Array.isArray(record.frameAnchors) || record.frameAnchors.some((frame) => !frame || typeof frame !== 'object'
    || Object.values(frame).some((point) => !point || typeof point !== 'object' || !Number.isFinite((point as { x: number }).x) || !Number.isFinite((point as { y: number }).y))))) return false;
  if (record.schemaVersion !== 1 || !positiveInteger(record.frameWidth) || !positiveInteger(record.frameHeight) || !positiveInteger(record.columns) || !positiveInteger(record.fps) || !record.clips || typeof record.clips !== 'object' || !Array.isArray(record.transitions)) return false;
  return Object.values(record.clips as Record<string, unknown>).every((clip) => {
    if (!clip || typeof clip !== 'object') return false;
    const candidate = clip as Record<string, unknown>;
    return typeof candidate.loop === 'boolean' && (candidate.holdLastFrame === undefined || typeof candidate.holdLastFrame === 'boolean') && Array.isArray(candidate.frames) && candidate.frames.length > 0 && candidate.frames.every((frame) => Number.isInteger(frame) && (frame as number) >= 0);
  }) && record.transitions.every((transition) => {
    if (!transition || typeof transition !== 'object') return false;
    const candidate = transition as Record<string, unknown>;
    return typeof candidate.from === 'string' && typeof candidate.to === 'string' && positiveInteger(candidate.durationMs) && candidate.easing === 'cubic-in-out';
  });
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}
