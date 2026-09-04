import assert from 'node:assert/strict';
import { BATTLE_ART_PROFILES, resolveBattleArtPresentation, validateBattleArtConfiguration } from '@pokemon-online/config';
import { BattleSim, createWildInstance } from '@pokemon-online/engine';
import { BattleArtAssetLoader } from '../packages/renderer-pixi/src/BattleArtAssets.ts';
import { CombatantView } from '../packages/renderer-pixi/src/CombatantView.ts';
import { sampleBattleMotionPose } from '../packages/renderer-pixi/src/battle-motion.ts';

export function testCombatantMotion(): void {
  const assets = new BattleArtAssetLoader();
  assets.load = async () => null;
  assets.loadClip = async () => null;
  assets.loadMetadata = async () => null;
  for (const speciesId of [6, 94]) {
    const actor = new BattleSim({ mode: 'pve', player: [createWildInstance(speciesId, 10, { rng: () => 0.5 })], enemy: [], seed: 905 }).state.combatants[0]!;
    const snapshot = JSON.stringify(actor);
    const view = new CombatantView(actor, assets);
    const body = view.children[1]!;
    view.update(0.31);
    const beforeY = body.y;
    const beforeHover = view.getDiagnostics().visualHoverOffsetY;
    view.playAnimation('hit');
    view.update(0);
    assert.equal(view.getDiagnostics().visualHoverOffsetY, beforeHover, 'changing a motion cannot restart hover');
    assert(Math.abs(body.y - beforeY) < 1e-9, 'transition cannot apply hover height twice');
    view.playAnimation('projectile', 'after-current-motion', 100);
    view.update(0.23);
    assert.equal(view.getDiagnostics().motion, 'cast');
    const poseStart = { x: body.x, y: body.y - view.getDiagnostics().visualHoverOffsetY };
    view.update(0);
    assert.equal(body.x, poseStart.x, 'next clip cannot reuse previous clip progress');
    assert.equal(body.y - view.getDiagnostics().visualHoverOffsetY, poseStart.y);
    view.playAnimation('recoil', 'after-current-motion', 100);
    view.update(0.11);
    view.update(0.11);
    view.update(0.2);
    assert(view.isSettled(), 'authored recovery returns to neutral');
    assert.equal(JSON.stringify(actor), snapshot, 'pose playback cannot change battle facts');
    const profile = resolveBattleArtPresentation({ speciesId, side: 'player' }).profile;
    const tracks = profile.motionTracks!.cast!;
    const base = profile.motionPoses.cast!;
    assert.equal(sampleBattleMotionPose(base, tracks, 0).offsetY, tracks[0]!.offsetY);
    assert.equal(sampleBattleMotionPose(base, tracks, 0.54).rotationDeg, tracks[1]!.rotationDeg);
    assert.equal(sampleBattleMotionPose(base, tracks, 1).offsetY, tracks[2]!.offsetY);
    assert.deepEqual(sampleBattleMotionPose(base, tracks, -1), sampleBattleMotionPose(base, tracks, 0));
    assert.deepEqual(sampleBattleMotionPose(base, tracks, 2), sampleBattleMotionPose(base, tracks, 1));
    for (const invalid of [[], [{ at: 0 }, { at: 0 }], [{ at: 0 }, { at: 1, scaleY: -1 }], [{ at: 0 }, { at: 1, offsetY: NaN }]]) {
      assert(validateBattleArtConfiguration([{ ...profile, motionTracks: { cast: invalid } }]).invalidMotionProfileIds.includes(profile.id), 'malformed motion tracks must fail config validation');
    }
    view.destroy({ children: true });
  }
  const fallbackPose = { offsetX: 5 };
  assert.equal(sampleBattleMotionPose(fallbackPose, undefined, 0.5), fallbackPose, 'other profiles retain their existing poses');
  assert.equal(BATTLE_ART_PROFILES.filter((profile) => profile.motionTracks).length, 2, 'only the two reviewed showcase profiles opt in');
  assets.clear();
  console.log('✓ authored motion tracks, continuous hover, and action handoff');
}
