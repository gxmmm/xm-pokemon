import assert from 'node:assert/strict';
import { BATTLE_EFFECT_COMPOSITION, BATTLE_ENVIRONMENTS } from '@pokemon-online/config';
import { BattleEffectPool } from '../packages/renderer-pixi/src/BattleEffectPool.ts';
import { BattleVfxExecutor } from '../packages/renderer-pixi/src/BattleVfxExecutor.ts';
import { planBattleCue } from '../packages/renderer-pixi/src/battle-plan.ts';

export function testBattleReadability(): void {
  const pool = new BattleEffectPool();
  const positions = new Map([['actor', { x: 300, y: 440 }], ['a', { x: 680, y: 430 }], ['b', { x: 750, y: 440 }], ['c', { x: 820, y: 430 }]]);
  const executor = new BattleVfxExecutor(pool, (uid) => positions.get(uid));
  const plans = planBattleCue({ type: 'vfx', recipe: { id: 'spread', delivery: 'area', element: 'water' },
    anchors: { actorId: 'actor', targetIds: ['a', 'b', 'a', 'missing', 'c'] }, intensity: 0.8 });
  const original = JSON.stringify(plans);
  assert.equal(executor.spawnPlans(plans, BATTLE_ENVIRONMENTS.grass), 6, 'one burst and one ground ring per unique resolved target');
  assert.equal(pool.activeCount, 6);
  assert.equal(pool.childCount, 6, 'diagnostics count both layers');
  assert.equal(pool.container.children.length, 3);
  assert.equal(pool.groundContainer.children.length, 3);
  pool.update(0.1);
  pool.groundContainer.children.forEach((graphic, index) => {
    assert.equal(graphic.x, positions.get(['a', 'b', 'c'][index]!)!.x);
    assert.equal(graphic.y, positions.get(['a', 'b', 'c'][index]!)!.y, 'rings use feet, not body contact anchors');
    assert.equal(graphic.scale.y, BATTLE_EFFECT_COMPOSITION.groundRingScaleY);
    assert(graphic.getLocalBounds().width > 0);
  });
  pool.container.children.forEach((graphic) => assert.equal(graphic.alpha, BATTLE_EFFECT_COMPOSITION.spreadBurstOpacity));
  const bounds = pool.groundContainer.children[0]!.getLocalBounds().width;
  pool.update(0);
  assert.equal(pool.groundContainer.children[0]!.getLocalBounds().width, bounds, 'both layers pause together');
  pool.setReduceFlicker(true);
  pool.container.children.forEach((graphic) => assert(Math.abs(graphic.alpha - BATTLE_EFFECT_COMPOSITION.spreadBurstOpacity * 0.46) < 1e-6));
  pool.setReduceFlicker(false);
  pool.container.children.forEach((graphic) => assert.equal(graphic.alpha, BATTLE_EFFECT_COMPOSITION.spreadBurstOpacity, 'accessibility toggles preserve accent opacity'));
  pool.update(1);
  assert.equal(pool.childCount, 0, 'both layers release expired effects');
  assert.equal(JSON.stringify(plans), original, 'dispatch never mutates cue plans');
  assert.equal(executor.spawnPlans([{ ...plans[0]!, targetIds: ['missing'] }], BATTLE_ENVIRONMENTS.grass), 0, 'missing targets cannot create phantom effects on the actor');
  const impact = planBattleCue({ type: 'vfx', recipe: { id: 'impact:water', delivery: 'aura', element: 'water' }, anchors: { targetIds: ['b'] }, intensity: 0.8 });
  assert.equal(executor.spawnPlans(impact, BATTLE_ENVIRONMENTS.grass), 1);
  assert.equal(pool.container.children[0]!.alpha, 1, 'authoritative impact remains full strength');
  const environment = planBattleCue({ type: 'environment', reaction: 'splash', anchors: { targetIds: ['a', 'b', 'c'] } });
  assert.equal(executor.spawnPlans(environment, BATTLE_ENVIRONMENTS.grass), 3);
  assert.equal(pool.groundContainer.children.length, 3, 'environment responses sit below actors');
  pool.clear();
  assert.equal(pool.childCount, 0);
  assert.equal(executor.spawnPlans([{ primitive: 'chain', targetIds: ['a', 'b', 'c'], actorId: 'actor', intensity: 1 }], BATTLE_ENVIRONMENTS.grass), 1, 'chain remains a single connected path');
  pool.clear();
  console.log('✓ spread target coverage, ground/front layers, accent opacity, pause and disposal');
}
