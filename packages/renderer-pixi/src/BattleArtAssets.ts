import type { BattleArtAssetKind, BattleAssetManifestEntry } from '@pokemon-online/config';
import { Assets, Texture } from 'pixi.js';

/** Manifest-only Pixi loader. Resource URLs are resolved by @pokemon-online/config;
 * this class intentionally accepts an entry rather than a species or file path. */
export class BattleArtAssetLoader {
  private readonly textureRequests = new Map<string, Promise<Texture | null>>();

  load(entry: BattleAssetManifestEntry): Promise<Texture | null> {
    if (entry.kind !== 'static-sprite' || !entry.url) return Promise.resolve(null);
    const cached = this.textureRequests.get(entry.id);
    if (cached) return cached;
    const request = Assets.load(entry.url)
      .then((asset) => asset instanceof Texture ? asset : null)
      .catch(() => null);
    this.textureRequests.set(entry.id, request);
    return request;
  }

  preload(entries: readonly BattleAssetManifestEntry[]): Promise<void> {
    return Promise.all(entries.map((entry) => this.load(entry))).then(() => undefined);
  }

  clear(): void {
    this.textureRequests.clear();
  }
}

/** Useful for diagnostics/tests without requiring browser asset decoding. */
export function isSpriteAsset(kind: BattleArtAssetKind): boolean {
  return kind === 'static-sprite';
}
