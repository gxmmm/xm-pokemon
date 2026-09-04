import assert from 'node:assert/strict';
import { BATTLE_ENVIRONMENTS, resolveBattleArtAnchor, resolveBattleArtPresentation } from '@pokemon-online/config';
import { BattleSim, createWildInstance } from '@pokemon-online/engine';
import { BattleDirector } from '@pokemon-online/presentation';
import { Container, Graphics, Mesh, Sprite } from 'pixi.js';
import { BattleArtAssetLoader } from '../packages/renderer-pixi/src/BattleArtAssets.ts';
import { BattleEffectPool } from '../packages/renderer-pixi/src/BattleEffectPool.ts';
import { BattleVfxExecutor } from '../packages/renderer-pixi/src/BattleVfxExecutor.ts';
import { CombatantView } from '../packages/renderer-pixi/src/CombatantView.ts';
import { planBattleCue } from '../packages/renderer-pixi/src/battle-plan.ts';

export function testBattleAnchors(): void {
  const assets = new BattleArtAssetLoader();
  assets.load = async () => null;
  assets.loadClip = async () => null;
  assets.loadMetadata = async () => null;
  for (const speciesId of [6, 94]) {
    for (const facing of [1, -1] as const) {
      const actor = new BattleSim({ mode: 'pve', player: [createWildInstance(speciesId, 10)], enemy: [], seed: 29 }).state.combatants[0]!;
      actor.facing = facing;
      const snapshot = JSON.stringify(actor);
      const view = new CombatantView(actor, assets);
      const parent = new Container();
      parent.position.set(89, -120);
      parent.scale.set(0.6);
      parent.addChild(view);
      view.position.set(400, 500);
      view.scale.set(0.8);
      view.update(0.1);
      const first = view.getAnchorPosition('muzzle');
      assert.equal(Math.sign(first.x - view.x), facing, 'muzzle follows facing, not deployment side');
      assert(first.y < view.y, 'muzzle is above the ground root');
      parent.position.set(-200, 900);
      parent.scale.set(2);
      assert.deepEqual(view.getAnchorPosition('muzzle'), first, 'shared camera transform must not be applied twice');
      view.playAnimation('beam');
      view.update(0.15);
      const pose = view.children[1]!;
      const bitmap = pose.children.find((child) => child instanceof Sprite) as Sprite;
      bitmap.visible = true;
      bitmap.width = 142;
      bitmap.height = 106;
      const anchor = resolveBattleArtAnchor(resolveBattleArtPresentation({ speciesId, side: 'player', facing }).profile, 'muzzle');
      const x = anchor.x * 142 * pose.scale.x;
      const y = anchor.y * 106 * pose.scale.y;
      const expected = { x: view.x + view.scale.x * (pose.x + x * Math.cos(pose.rotation) - y * Math.sin(pose.rotation)),
        y: view.y + view.scale.y * (pose.y + x * Math.sin(pose.rotation) + y * Math.cos(pose.rotation)) };
      const actual = view.getAnchorPosition('muzzle');
      assert(Math.hypot(actual.x - expected.x, actual.y - expected.y) < 0.00001, 'anchor includes hover, pose, rotation and projected scale');
      assert.notDeepEqual(actual, first);
      assert.equal(JSON.stringify(actor), snapshot);
      parent.destroy({ children: true });
    }
  }

  const pool = new BattleEffectPool();
  let muzzle: { x: number; y: number } | undefined = { x: 410, y: 360 };
  const actor = { x: 400, y: 420 };
  const target = { x: 800, y: 400 };
  const executor = new BattleVfxExecutor(pool, (uid) => uid === 'caster' ? actor : uid === 'target' ? target : undefined,
    (uid, anchor) => uid === 'caster' && anchor === 'muzzle' ? muzzle : undefined);
  const makePlans = (skillId: string) => new BattleDirector().direct([{ id: 'cast', sequence: 1, type: 'skill', at: 0,
    actorId: 'caster', targetIds: ['target'], skillId }]).flatMap(({ cue }) => planBattleCue(cue));
  const flame = makePlans('flamethrower');
  assert.equal(flame[0]?.actorAnchor, 'muzzle');
  assert.equal(executor.spawnPlans(flame, BATTLE_ENVIRONMENTS.grass), 1);
  const mesh = pool.container.children[0] as Mesh;
  const sourceOf = () => ({ x: (mesh.geometry.positions[0]! + mesh.geometry.positions[6]!) / 2,
    y: (mesh.geometry.positions[1]! + mesh.geometry.positions[7]!) / 2 });
  assert.deepEqual(sourceOf(), muzzle);
  Object.assign(muzzle, { x: 437, y: 338 });
  pool.update(0.05);
  assert.deepEqual(sourceOf(), muzzle, 'ongoing flame follows the live mouth');
  muzzle = undefined;
  pool.update(0.05);
  assert.equal(mesh.visible, false, 'missing owner does not leave a floating beam');
  pool.clear();
  assert(mesh.destroyed);
  assert.equal(executor.spawnPlans(flame, BATTLE_ENVIRONMENTS.grass), 0);

  muzzle = { x: 410, y: 360 };
  executor.spawnPlans(makePlans('shadow-ball'), BATTLE_ENVIRONMENTS.grass);
  const orb = pool.container.children[0] as Graphics;
  pool.update(0.08);
  const firstBounds = orb.getLocalBounds().clone();
  Object.assign(muzzle, { x: 20, y: 10 });
  pool.update(0.001);
  assert(Math.abs(orb.getLocalBounds().x - firstBounds.x) < 10, 'released projectile does not jump back to the moved caster');
  pool.clear();
  pool.container.destroy();
  console.log('✓ configured VFX anchors, facing/pose/projection, live beam attachment and detached projectiles');
}
