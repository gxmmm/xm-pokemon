import assert from 'node:assert/strict';
import type { BattleCombatant } from '@pokemon-online/shared';
import { BattleSim, createWildInstance } from '@pokemon-online/engine';
import { SKILL_MAP } from '@pokemon-online/config';
import { decide } from '../packages/engine/src/ai.ts';
import { canInterruptCast, releaseReliability, incomingControl, interruptChance } from '../packages/engine/src/skill-opportunity.ts';

function fixture() {
  const make = (uid: string) => ({ ...createWildInstance(25, 50, { rng: () => .5 }), uid, passiveSkills: [], ability: 'keen-eye', personality: 'cool' as const });
  const sim = new BattleSim({ mode: 'pvp', player: [make('actor')], enemy: [make('a'), make('b'), make('c')], seed: 81 });
  const [actor, ...enemies] = sim.state.combatants;
  for (const [i, unit] of sim.state.combatants.entries()) {
    unit.position = { x: i ? 10 : 5, y: i ? 5 + i : 7 }; unit.pixel = { ...unit.position };
    unit.currentHp = unit.maxHp = 1000; unit.types = ['normal']; unit.cooldowns = {}; unit.stats.atk = 100; unit.stats.def = 100;
  }
  actor!.basicSkillId = 'decision-fast'; actor!.activeSkills = ['decision-fast', 'decision-area'];
  return { sim, actor: actor!, enemies };
}
const ids = ['decision-fast', 'decision-area', 'decision-control'];
SKILL_MAP['decision-control'] = { ...SKILL_MAP['mind-lock']!, id: 'decision-control', accuracy: 100, effect: { kind: 'stun', target: 'enemy', chance: 1, duration: 1 } };
SKILL_MAP[ids[0]!] = { ...SKILL_MAP.ember!, id: ids[0]!, type: 'normal', power: 40, accuracy: 100, effect: undefined, space: { shape: 'single', reach: 6 }, castTime: 0, cooldown: 2 };
SKILL_MAP[ids[1]!] = { ...SKILL_MAP['hyper-beam']!, id: ids[1]!, type: 'normal', power: 100, accuracy: 100, effect: undefined, castTime: .6, cooldown: 6, space: { shape: 'line', width: 1.2 } };
try {
  const { sim, actor, enemies } = fixture();
  const choose = () => decide(actor, sim.state, () => .5)!.preferredSkillId;
  assert.equal(choose(), 'decision-area', '聚集目标值得放范围招式');
  enemies[1]!.position = enemies[1]!.pixel = { x: 10, y: 12 };
  enemies[2]!.position = enemies[2]!.pixel = { x: 15, y: 12 };
  assert.equal(choose(), 'decision-fast', '分散时使用可靠的基础招式');
  enemies[0]!.currentHp = 1;
  assert.equal(choose(), 'decision-fast', '残血用可及时收尾的短招');
  actor.cooldowns['decision-fast'] = 2;
  assert.equal(choose(), 'decision-area', '基础招式冷却时仍使用可用大招，不空等');
  const target = enemies[0]!, beam = SKILL_MAP['decision-area']!;
  target.pixel = { x: 10, y: 7 }; target.position = { x: 10, y: 10 };
  assert(releaseReliability(actor, target, target, beam, 0, .1) < releaseReliability(actor, target, target, beam, 0, .9), '激进性格更愿意承担移动风险');
  target.status = 'sleep'; target.statusTimer = 1;
  assert(releaseReliability(actor, target, target, beam, 0, .1) < 1, '控制不会取消已经开始的脚点缓动');
  target.status = null; target.position = { ...target.pixel };
  const cc = { ...beam, effect: { kind: 'stun' as const, target: 'enemy' as const, chance: 1, duration: 1 } };
  target.castProgress = { skillId: 'hyper-beam', remaining: .8 };
  assert(canInterruptCast(actor, target, cc, 0));
  target.castProgress.remaining = .65;
  assert(!canInterruptCast(actor, target, cc, 0), '差安全余量时不冒充可打断');
  target.castProgress.remaining = 1; actor.actionReadyRemaining = .5;
  assert(!canInterruptCast(actor, target, cc, 0), '自身恢复计入打断时间');
  actor.actionReadyRemaining = 0; target.ability = 'inner-focus';
  assert(!canInterruptCast(actor, target, cc, 0), '精神力免疫畏缩不拿打断收益');
  // 正式模拟实际采用短招完成收尾；固定输入完整事件可复现。
  const run = () => {
    const f = fixture();
    f.enemies[0]!.currentHp = 1;
    for (const enemy of f.enemies.slice(1)) { enemy.position = { x: 15, y: 12 }; enemy.pixel = { ...enemy.position }; }
    for (const enemy of f.enemies) for (const id of enemy.activeSkills) enemy.cooldowns[id] = 999;
    for (let i = 0; i < 20; i++) f.sim.tick(.05);
    assert(f.sim.state.events.some(e => e.type === 'damage' && e.actor === f.actor.uid && e.skillId === 'decision-fast'), '正式释放基础招式');
    assert(!f.enemies[0]!.alive, '短招确实击倒残血目标');
    return f.sim.state.events;
  };
  assert.deepEqual(run(), run());
  {
    const f = fixture(), tank = f.actor, enemy = f.enemies[0]!;
    tank.activeSkills = ['decision-fast', 'heavy-guard'];
    enemy.castProgress = { skillId: 'hyper-beam', remaining: .6 }; enemy.currentTargetUid = tank.uid;
    tank.buffs.push({ id: 'old-shield', kind: 'shield', magnitude: 300, remaining: 3 });
    tank.shields = 200;
    assert.equal(decide(tank, f.sim.state, () => .5)?.preferredSkillId, 'decision-fast', '已有真实护盾时继续进攻');
    tank.shields = 0;
    assert.equal(decide(tank, f.sim.state, () => .5)?.preferredSkillId, 'heavy-guard', '护盾破裂后恢复大招救急价值');
  }
  {
    const f = fixture();
    f.actor.position = f.actor.pixel = { x: 5, y: 7 };
    f.enemies[0]!.position = f.enemies[0]!.pixel = { x: 9, y: 5 };
    f.enemies[1]!.position = f.enemies[1]!.pixel = { x: 10, y: 9 };
    f.enemies[2]!.position = f.enemies[2]!.pixel = { x: 12, y: 10 };
    f.actor.currentTargetUid = 'a'; f.actor.targetCommitUntil = 999;
    const plan = decide(f.actor, f.sim.state, () => .5)!;
    assert.equal(plan.preferredSkillId, 'decision-area', '旁侧集群值得范围释放');
    assert.notEqual(plan.targetUid, 'a', '从原地改用实际覆盖两人的方向');
    assert(plan.desiredRangeCells >= 3.5, '调整瞄准仍维持远程站位');
    const area = SKILL_MAP['decision-area']!;
    SKILL_MAP['decision-area'] = { ...area, effect: { kind: 'stun', target: 'enemy', chance: 1, duration: 1 } };
    f.enemies[0]!.flinchUntil = 2;
    const fresh = decide(f.actor, f.sim.state, () => .5)!;
    assert.equal(fresh.preferredSkillId, 'decision-area', '旧目标已受控不会压低新方向的控制收益');
    assert.notEqual(fresh.targetUid, 'a');
    f.enemies[0]!.flinchUntil = 0;
    f.enemies[0]!.position = f.enemies[0]!.pixel = { x: 18, y: 3 };
    const nearby = decide(f.actor, f.sim.state, () => .5)!;
    assert.equal(nearby.preferredSkillId, 'decision-area', '旧目标在远处不误扣新方向的追距成本');
    assert.notEqual(nearby.targetUid, 'a');
    SKILL_MAP['decision-area'] = area;
    for (const enemy of f.enemies) { enemy.status = 'sleep'; enemy.statusTimer = 3; for (const id of enemy.activeSkills) enemy.cooldowns[id] = 999; }
    for (let i = 0; i < 30; i++) f.sim.tick(.05);
    const hit = new Set(f.sim.state.events.filter(event => event.type === 'damage' && event.actor === f.actor.uid && event.skillId === 'decision-area').map(event => event.target));
    assert(hit.has('b') && hit.has('c') && !hit.has('a'), '实际释放命中新瞄准覆盖的两只，未命中远处旧目标');

  }
  {
    const f = fixture();
    f.actor.activeSkills = ['decision-fast', 'mind-lock'];
    f.actor.currentTargetUid = 'a';
    for (const enemy of f.enemies) enemy.cooldowns = {};
    f.enemies[2]!.position = f.enemies[2]!.pixel = { x: 19, y: 13 };
    f.enemies[2]!.activeSkills = ['hyper-beam']; f.enemies[2]!.cooldowns['hyper-beam'] = .8;
    assert.notEqual(decide(f.actor, f.sim.state, () => .5)?.targetUid, 'c', '不为远处即将冷却的大招跨场转火');
    const ally: BattleCombatant = { ...f.actor, uid: 'helper', castProgress: { skillId: 'decision-control', remaining: .2 }, currentTargetUid: 'a', castAim: { ...f.enemies[0]!.pixel } };
    f.sim.state.combatants.push(ally);
    assert(incomingControl(f.actor, f.enemies[0]!, f.sim.state) > 0, '队友真实控制蓄力形成预约');
    ally.castProgress = null;
    assert.equal(incomingControl(f.actor, f.enemies[0]!, f.sim.state), 0, '控制蓄力中断立即释放预约');
    ally.castProgress = { skillId: 'decision-control', remaining: 1 };
    f.enemies[0]!.castProgress = { skillId: 'hyper-beam', remaining: .5 };
    assert.equal(incomingControl(f.actor, f.enemies[0]!, f.sim.state), 0, '来不及打断的队友不阻止补救');
    f.enemies[0]!.ability = 'inner-focus';
    assert.equal(interruptChance(SKILL_MAP['mind-lock']!, f.actor, f.enemies[0]!), 0, '免疫畏缩不给控制收益');
  }
  {
    const f = fixture();
    for (const enemy of f.enemies.slice(1)) enemy.alive = false;
    f.enemies[0]!.position = f.enemies[0]!.pixel = { x: 10.1, y: 7 };
    const original = SKILL_MAP['decision-fast']!;
    SKILL_MAP['decision-fast'] = { ...original, power: 48, space: { shape: 'single', reach: 5 } };
    assert.equal(decide(f.actor, f.sim.state, () => .5)?.preferredSkillId, 'decision-area', '收益接近时使用原地可释放招式，不为短招反复追距');
    SKILL_MAP['decision-fast'] = original;
  }
  console.log('✓ 聚集/分散选招、残血收尾与基础冷却衔接、移动风险与性格、控制窗口与免疫');
} finally { for (const id of ids) delete SKILL_MAP[id]; }
