import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { BattleSim, createWildInstance } from '@pokemon-online/engine';
import { SKILL_MAP, PERSONALITIES } from '@pokemon-online/config';
import { decide } from '../packages/engine/src/ai.ts';
import { skillCovers, skillVictims } from '../packages/engine/src/skill-space.ts';
import { distCells } from '../packages/engine/src/grid.ts';

const team = (ids: number[], side: string) => ids.map((id, i) => ({ ...createWildInstance(id, 50, { rng: () => .5 }), uid: `${side}${i}` }));
const formations = [
  { id: 'melee', p: [68, 57, 76], e: [68, 57, 76] },
  { id: 'mixed', p: [68, 6, 65], e: [143, 9, 94] },
  { id: 'ranged', p: [6, 25, 65], e: [9, 131, 94] },
  { id: 'surround', p: [68, 57, 76], e: [143] },
];
const reports = [];
for (const setup of formations) for (const seed of [11, 22, 33]) {
  const simulate = () => {
    const sim = new BattleSim({ mode: 'pvp', player: team(setup.p, 'p'), enemy: team(setup.e, 'e'), seed });
    // 延长单目标存活以检查持续围攻，避免两人提前击倒目标掩盖第三人的可达性。
    if (setup.id === 'surround') for (const c of sim.state.combatants.filter(c => c.side === 'enemy')) { c.maxHp *= 3; c.currentHp = c.maxHp; }
    return sim;
  };
  const sim = simulate();
  let rangedSamples = 0, rangedCrowded = 0, distanceSum = 0, meleeDamage = 0;
  while (!sim.isOver && sim.state.time < 120) {
    sim.tick(.05);
    for (const c of sim.state.combatants.filter(c => c.alive && c.normalIsRanged)) {
      const target = sim.state.combatants.find(t => t.uid === c.currentTargetUid && t.alive);
      if (!target || sim.state.time < 2) continue;
      const d = distCells(c.pixel, target.pixel);
      rangedSamples++; distanceSum += d; if (d < 2.5) rangedCrowded++;
      if (c.plan) assert(c.plan.desiredRangeCells >= 3.5, '射手不因性格、冷却、优势而强制贴脸');
    }
  }
  assert(sim.isOver && sim.state.winner !== 'draw', `${setup.id}/${seed} must resolve`);
  meleeDamage = sim.state.combatants.filter(c => !c.normalIsRanged).reduce((sum, c) => sum + c.damageDealt, 0);
  if (setup.id === 'melee' || setup.id === 'surround') assert(sim.state.combatants.filter(c => c.side === 'player').every(c => c.damageDealt > 0), `${setup.id}/${seed} 每个围攻者都能输出: ${JSON.stringify(sim.state.combatants.map(c => ({uid:c.uid, damage:c.damageDealt, pos:c.position, hp:c.currentHp})))}`);
  if (rangedSamples) assert(rangedCrowded / rangedSamples < .4, `${setup.id} long-term crowding: ${rangedCrowded / rangedSamples}`);
  const repeat = simulate(); while (!repeat.isOver && repeat.state.time < 120) repeat.tick(.05);
  assert.deepEqual(repeat.state, sim.state, '固定种子完整状态可复现');
  reports.push({ id: setup.id, seed, duration: +sim.state.time.toFixed(2), winner: sim.state.winner, rangedMeanDistance: +(distanceSum / Math.max(1, rangedSamples)).toFixed(2), crowdedRatio: +(rangedCrowded / Math.max(1, rangedSamples)).toFixed(3), meleeDamage });
}
for (const corner of [{ x: 1, y: 1 }, { x: 18, y: 12 }]) {
  const sim = new BattleSim({ mode: 'pvp', player: team([68, 6, 65], 'p'), enemy: team([143], 'e'), seed: 44 });
  const enemy = sim.state.combatants.find(c => c.side === 'enemy')!;
  enemy.position = { ...corner }; enemy.pixel = { ...corner };
  while (!sim.isOver && sim.state.time < 120) sim.tick(.05);
  assert(sim.isOver, '角落追击不会长期寻路空转');
}
const fixture = new BattleSim({ mode: 'pvp', player: team([6], 'p'), enemy: team([143, 68], 'e'), seed: 1 });
const [actor, near, far] = fixture.state.combatants;
actor!.position = actor!.pixel = { x: 5, y: 7 }; near!.position = near!.pixel = { x: 9, y: 7 }; far!.position = far!.pixel = { x: 12, y: 7 };
actor!.activeSkills = ['flamethrower']; actor!.cooldowns.flamethrower = 99;
near!.currentHp = near!.maxHp * .1;
for (const personality of PERSONALITIES) {
  actor!.personality = personality.id; actor!.currentTargetUid = undefined;
  assert(decide(actor!, fixture.state, () => .5)!.desiredRangeCells >= 3.5, personality.id);
}
const flame = SKILL_MAP.flamethrower!;
assert(skillCovers(flame, { x: 5, y: 7 }, { x: 10, y: 7 }, { x: 10, y: 8 }));
assert(!skillCovers(flame, { x: 5, y: 7 }, { x: 10, y: 7 }, { x: 4, y: 7 }), '背后不受喷射命中');
assert(!skillCovers(flame, { x: 5, y: 7 }, { x: 10, y: 7 }, { x: 10, y: 12 }), '离开扇形可躲避');
assert(!skillCovers(flame, { x: 5, y: 7 }, { x: 10, y: 7 }, { x: 15, y: 7 }), '超射程不命中');
// 连续脚点跨越范围边界，下一落点不得提前决定命中。
near!.position = { x: 10, y: 12 }; near!.pixel = { x: 10, y: 7 };
assert(skillVictims(flame, actor!, near!, [near!], { x: 10, y: 7 }).length === 1);
near!.position = { x: 10, y: 7 }; near!.pixel = { x: 10, y: 12 };
assert(skillVictims(flame, actor!, near!, [near!], { x: 10, y: 7 }).length === 0);
near!.pixel = { ...near!.position };
actor!.personality = 'brave'; actor!.currentTargetUid = undefined;
const braveRange = decide(actor!, fixture.state, () => .5)!.desiredRangeCells;
actor!.personality = 'timid'; actor!.currentTargetUid = undefined;
assert(decide(actor!, fixture.state, () => .5)!.desiredRangeCells > braveRange, '胆小与勇敢保留可观测站位差异');
// 强制命中率失败，检查整个释放链而非只检查伤害函数。
const testSkill = SKILL_MAP.flamethrower!;
const originalAccuracy = testSkill.accuracy, originalEffect = testSkill.effect;
try {
  testSkill.accuracy = 1; testSkill.effect = { kind: 'status', target: 'enemy', status: 'burn', chance: 1 };
  for (const immune of [false, true]) {
    const sample = new BattleSim({ mode: 'pvp', player: team([6], 'p'), enemy: team([143], 'e'), seed: 11 });
    const [a, b] = sample.state.combatants;
    a!.position = a!.pixel = { x: 5, y: 7 }; b!.position = b!.pixel = { x: 10, y: 7 };
    a!.currentTargetUid = b!.uid;
    if (immune) { testSkill.accuracy = 100; b!.ability = 'flash-fire'; }
    const hp = b!.currentHp;
    (sample as unknown as { rng: () => number }).rng = () => .99;
    (sample as unknown as { resolveSkill(c: typeof actor, id: string): void }).resolveSkill(a, 'flamethrower');
    assert.equal(b!.currentHp, hp); assert.notEqual(b!.status, 'burn', '闪避/免疫不附加灼伤');
  }
} finally { testSkill.accuracy = originalAccuracy; testSkill.effect = originalEffect; }
await mkdir('doc/visual-baselines/battle-space', { recursive: true });
await writeFile('doc/visual-baselines/battle-space/report.json', JSON.stringify({ passed: true, reports }, null, 2));
console.log(JSON.stringify(reports, null, 2));
console.log('✓ 空间重构：12场固定对局、全性格优势距离、方向覆盖与复现');
