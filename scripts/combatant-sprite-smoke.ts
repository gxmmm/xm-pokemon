import assert from 'node:assert/strict';
import { BATTLE_ASSET_MANIFEST, type BattleArtSpriteSheetMetadata } from '@pokemon-online/config';
import { Texture } from 'pixi.js';
import type { BattleArtAssetLoader } from '../packages/renderer-pixi/src/BattleArtAssets.ts';
import { CombatantSprite } from '../packages/renderer-pixi/src/CombatantSprite.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

/** No network, timers, or image decoding: completions are deliberately reordered. */
export async function testCombatantSprite(): Promise<void> {
  const staticAsset = BATTLE_ASSET_MANIFEST.find((asset) => asset.kind === 'static-sprite')!;
  const sheet = BATTLE_ASSET_MANIFEST.find((asset) => asset.kind === 'sprite-sheet')!;
  const otherStatic = { ...staticAsset, id: 'test:other-static' };
  const otherSheet = { ...sheet, id: 'test:other-sheet' };
  const staticRequests = new Map<string, Promise<Texture | null>>();
  const clipRequests = new Map<string, Promise<readonly Texture[] | null>>();
  const metadataRequests = new Map<string, Promise<BattleArtSpriteSheetMetadata | null>>();
  const loadedAssets: string[] = [];
  const loadedClips: string[] = [];
  const assets: Pick<BattleArtAssetLoader, 'load' | 'loadClip' | 'loadMetadata'> = {
    load: (asset) => {
      loadedAssets.push(asset.id);
      return staticRequests.get(asset.id) ?? Promise.resolve(null);
    },
    loadClip: (asset, motion) => {
      const key = `${asset.id}:${motion}`;
      loadedClips.push(key);
      return clipRequests.get(key) ?? Promise.resolve(null);
    },
    loadMetadata: (asset) => metadataRequests.get(asset.id) ?? Promise.resolve(null),
  };
  const textures = Array.from({ length: 4 }, () => new Texture({ source: Texture.EMPTY.source }));
  const [first, second, third, fourth] = textures as [Texture, Texture, Texture, Texture];
  const fallback = { visible: true };
  let ownerDestroyed = false;
  const sprite = new CombatantSprite(assets, fallback, () => ownerDestroyed);
  const metadata: BattleArtSpriteSheetMetadata = {
    schemaVersion: 1, frameWidth: 96, frameHeight: 96, columns: 8, fps: 10,
    clips: { idle: { frames: [0, 1], loop: true } },
    transitions: [{ from: 'idle', to: 'attack', durationMs: 75, easing: 'cubic-in-out' }],
  };

  // Facing/asset changes discard late static-image completions.
  const oldStatic = deferred<Texture | null>();
  const newStatic = deferred<Texture | null>();
  staticRequests.set(staticAsset.id, oldStatic.promise);
  staticRequests.set(otherStatic.id, newStatic.promise);
  const oldLoad = sprite.setAsset(staticAsset, 'idle');
  const newLoad = sprite.setAsset(otherStatic, 'idle');
  assert(!sprite.visible && fallback.visible, 'asset replacement displays the procedural fallback');
  newStatic.resolve(second);
  await newLoad;
  oldStatic.resolve(first);
  await oldLoad;
  assert.equal(sprite.texture, second, 'late static asset cannot replace the current facing');
  assert(sprite.visible && !fallback.visible);
  assert.equal(sprite.height, 106);
  assert.equal(sprite.width, 106);

  const staticDuringAction = deferred<Texture | null>();
  staticRequests.set(staticAsset.id, staticDuringAction.promise);
  const actionLoad = sprite.setAsset(staticAsset, 'idle');
  await sprite.setMotion(staticAsset, 'attack');
  staticDuringAction.resolve(first);
  await actionLoad;
  assert.equal(sprite.texture, first, 'motion changes do not cancel a pending static bitmap');
  staticRequests.delete(staticAsset.id);
  await sprite.setAsset(staticAsset, 'idle');
  assert(!sprite.visible && fallback.visible, 'failed image load retains fallback');

  // A sequence loads only cropped clips, with metadata-owned FPS and transitions.
  metadataRequests.set(sheet.id, Promise.resolve(metadata));
  clipRequests.set(`${sheet.id}:idle`, Promise.resolve([first, second]));
  const staticLoadCount = loadedAssets.length;
  await sprite.setAsset(sheet, 'idle');
  assert.equal(loadedAssets.length, staticLoadCount, 'the atlas itself is never assigned to the sprite');
  assert.equal(sprite.transitionDuration('idle', 'attack'), 75);
  assert.equal(sprite.transitionDuration('idle', 'faint'), undefined);
  await sprite.setAsset(sheet, 'idle');
  assert(sprite.visible && !fallback.visible, 'reselecting the same frame restores sprite visibility');
  sprite.advance(100, true);
  assert.equal(sprite.texture, second);
  sprite.advance(100, true);
  assert.equal(sprite.texture, first, 'looping clips wrap at the declared FPS');
  sprite.advance(500, false);
  assert.equal(sprite.texture, second, 'finite clips hold their last frame');

  clipRequests.set(`${sheet.id}:attack`, Promise.resolve([first, second, third, fourth]));
  await sprite.setMotion(sheet, 'attack');
  sprite.advance(160, false, 200);
  assert.equal(sprite.texture, fourth, 'short action still reaches its authored final frames');
  await sprite.setMotion(sheet, 'attack');
  assert.equal(sprite.texture, first, 'repeated action restarts its sequence');
  const delayedAction = deferred<readonly Texture[] | null>();
  clipRequests.set(`${sheet.id}:attack`, delayedAction.promise);
  const delayedMotion = sprite.setMotion(sheet, 'attack');
  sprite.advance(160, false, 200);
  delayedAction.resolve([first, second, third, fourth]);
  await delayedMotion;
  assert.equal(sprite.texture, fourth, 'late clip catches up to the active action clock');
  await sprite.setAsset(sheet, 'idle');
  sprite.advance(100, true);

  const oldAttack = deferred<readonly Texture[] | null>();
  const newAttack = deferred<readonly Texture[] | null>();
  clipRequests.set(`${sheet.id}:attack`, oldAttack.promise);
  const oldMotion = sprite.setMotion(sheet, 'attack');
  assert.equal(sprite.texture, second, 'pending action keeps the last valid frame');
  assert(sprite.visible && !fallback.visible);
  clipRequests.set(`${sheet.id}:hit`, Promise.resolve([third]));
  await sprite.setMotion(sheet, 'hit');
  clipRequests.set(`${sheet.id}:attack`, newAttack.promise);
  const latestMotion = sprite.setMotion(sheet, 'attack');
  newAttack.resolve([fourth]);
  await latestMotion;
  oldAttack.resolve([first]);
  await oldMotion;
  assert.equal(sprite.texture, fourth, 'A-to-B-to-A motion changes reject the first A request');

  clipRequests.set(`${sheet.id}:recover`, Promise.resolve([]));
  await sprite.setMotion(sheet, 'recover');
  assert.equal(sprite.texture, first, 'missing recover frames reuse the idle clip');
  const missingOldClip = deferred<readonly Texture[] | null>();
  clipRequests.set(`${sheet.id}:cast`, missingOldClip.promise);
  const obsoleteFallback = sprite.setMotion(sheet, 'cast');
  await sprite.setMotion(sheet, 'hit');
  const requestsBeforeFallback = loadedClips.length;
  missingOldClip.resolve(null);
  await obsoleteFallback;
  assert.equal(loadedClips.length, requestsBeforeFallback, 'obsolete clips do not issue extra fallback loads');

  // Metadata arriving after a front/back sheet switch cannot restore the old clip.
  const oldMetadata = deferred<BattleArtSpriteSheetMetadata | null>();
  metadataRequests.set(sheet.id, oldMetadata.promise);
  const oldSheetLoad = sprite.setAsset(sheet, 'idle');
  clipRequests.set(`${otherSheet.id}:idle`, Promise.resolve([third]));
  await sprite.setAsset(otherSheet, 'idle');
  oldMetadata.resolve(metadata);
  await oldSheetLoad;
  assert.equal(sprite.texture, third);
  assert.equal(sprite.transitionDuration('idle', 'attack'), undefined, 'old metadata cannot leak into the new sheet');
  clipRequests.set(`${otherSheet.id}:idle`, Promise.resolve(null));
  await sprite.setAsset(otherSheet, 'idle');
  assert(!sprite.visible && fallback.visible, 'missing initial sequence retains fallback');

  const afterUnmount = deferred<Texture | null>();
  staticRequests.set(staticAsset.id, afterUnmount.promise);
  const unmountedLoad = sprite.setAsset(staticAsset, 'idle');
  const beforeUnmount = sprite.texture;
  ownerDestroyed = true;
  afterUnmount.resolve(fourth);
  await unmountedLoad;
  assert.equal(sprite.texture, beforeUnmount, 'owner teardown prevents late bitmap writes');
  assert(!sprite.visible && fallback.visible);

  ownerDestroyed = false;
  const afterDestroy = deferred<readonly Texture[] | null>();
  clipRequests.set(`${otherSheet.id}:idle`, afterDestroy.promise);
  const destroyedLoad = sprite.setAsset(otherSheet, 'idle');
  sprite.destroy();
  afterDestroy.resolve([first]);
  await destroyedLoad;
  assert(sprite.destroyed && fallback.visible, 'destroyed sprites ignore late clip completion');
  for (const texture of textures) texture.destroy();
  console.log('✓ combatant sprite loading, playback, fallback, and async race contracts');
}
