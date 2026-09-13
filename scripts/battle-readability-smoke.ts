import { toBattlePresentationEvent } from '../packages/presentation/src/battle.ts';
import { BattleDirector } from '../packages/presentation/src/director.ts';
import assert from 'node:assert/strict';
import { BATTLE_EFFECT_COMPOSITION, BATTLE_ENVIRONMENTS } from '@pokemon-online/config';
import { BattleEffectPool } from '../packages/renderer-pixi/src/BattleEffectPool.ts';
import { BattleVfxExecutor } from '../packages/renderer-pixi/src/BattleVfxExecutor.ts';
import { planBattleCue } from '../packages/renderer-pixi/src/battle-plan.ts';
import { spawnBurst } from '../packages/renderer-pixi/src/impact-vfx.ts';
import { Graphics } from 'pixi.js';

export function testBattleReadability(): void {
  const pool = new BattleEffectPool();
  for (const outcome of [{ missed: true }, { effectiveness: 0 }]) {
    const miss = toBattlePresentationEvent({ seq: 99, t: 1, type: 'damage', actor: 'actor', target: 'a', skillId: 'close-combat', amount: 0, vfx: { kind: 'impact', ...outcome } });
    const cues = new BattleDirector().direct([miss]);
    assert(!cues.some(({cue}) => cue.type === 'animation' || cue.type === 'vfx' || cue.type === 'environment'), '闪避和免疫不产生成功受击反馈');
  }
  const directed = new BattleDirector().direct([
    { id: 'release', sequence: 1, at: 0, type: 'skill', actorId: 'actor', targetIds: ['a'], skillId: 'close-combat' },
    { id: 'damage', sequence: 2, at: 0, type: 'damage', actorId: 'actor', targetIds: ['a'], skillId: 'close-combat', outcome: { damage: 25 } },
  ]);
  assert.equal(directed.flatMap(({cue}) => planBattleCue(cue)).filter(p => p.primitive === 'impact').length, 1, '一次近战结果只产生一次命中冲击');
  const healing = new BattleDirector().direct([
    { id: 'release-heal', sequence: 3, at: 1, type: 'skill', actorId: 'actor', targetIds: ['a'], skillId: 'heal-pulse' },
    { id: 'heal', sequence: 4, at: 1, type: 'heal', actorId: 'actor', targetIds: ['a'], skillId: 'heal-pulse' },
  ]).flatMap(({cue}) => planBattleCue(cue));
  assert.deepEqual(healing.find(p => p.primitive === 'heal')?.targetIds, ['a']);
  assert.deepEqual(healing.find(p => p.primitive === 'ring')?.targetIds, ['actor'], '起手只在施法者身上，回复在患者身上');
  const healExecutor = new BattleVfxExecutor(pool, () => ({ x: 500, y: 500 }), () => ({ x: 507, y: 433 }));
  healExecutor.spawnPlans(healing.filter(p => p.primitive === 'heal'), BATTLE_ENVIRONMENTS.grass);
  assert.equal(pool.container.children[0]!.x, 507);
  assert.equal(pool.container.children[0]!.y, 433, '治疗使用真实身体挂点');
  pool.update(.1);
  assert(pool.container.children[0]!.getLocalBounds().width < 55, '回复粒子局部可读');
  pool.update(1);
  assert.equal(pool.activeCount, 0, '回复效果正常回收');
  const positions = new Map([['actor', { x: 300, y: 440 }], ['a', { x: 680, y: 430 }], ['b', { x: 750, y: 440 }], ['c', { x: 820, y: 430 }]]);
  const executor = new BattleVfxExecutor(pool, (uid) => positions.get(uid), uid => {
    const root = positions.get(uid);
    return root ? { x: root.x, y: root.y - 30 } : undefined;
  });
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
  // Sample the whole burst, including the late expansion that a single peak
  // screenshot misses. Supporting area color must stay local at either strength.
  for (const intensity of [0.15, 1]) {
    for (const element of ['fire', 'water', 'psychic', 'electric'] as const) {
      const color = 0xb779dd;
      spawnBurst(pool, { x: 700, y: 430 }, color, intensity, 'default', 16, element);
      const graphic = pool.container.children[0] as Graphics;
      assert.equal(graphic.blendMode, 'normal', 'overlapping area accents must not add into white');
      const duration = 0.46 + intensity * 0.22;
      for (let frame = 0; frame < 9; frame++) {
        pool.update(duration / 10);
        const bounds = graphic.getLocalBounds();
        assert(bounds.width > 0 && bounds.height > 0);
        assert(bounds.minX >= 600 && bounds.maxX <= 800 && bounds.minY >= 320 && bounds.maxY <= 530, 'area accent stays within the target-local coverage budget');
        if (element === 'psychic') {
          assert(graphic.context.instructions.every((item) => item.data.style.color === color), 'psychic orbits retain their element color');
        }
      }
      assert.equal(pool.activeCount, 1, 'composition preserves the existing burst lifetime');
      pool.update(duration / 10 + 0.00001);
      assert.equal(pool.activeCount, 0);
      assert(graphic.destroyed);
    }
  }
  console.log('✓ spread target coverage, ground/front layers, accent opacity, pause and disposal');
}
