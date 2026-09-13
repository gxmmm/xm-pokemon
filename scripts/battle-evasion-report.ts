import assert from 'node:assert/strict';
import { BattleSim, createWildInstance } from '@pokemon-online/engine';
import { SKILL_MAP } from '@pokemon-online/config';
import { skillCovers } from '../packages/engine/src/skill-space.ts';
import { BattleEvasion } from '../packages/engine/src/evasion.ts';
import { isCellInArena, distCells } from '../packages/engine/src/grid.ts';
function fixture(skillId = 'flamethrower') {
  const make = (id: number, uid: string) => ({ ...createWildInstance(id, 50, { rng: () => .5 }), uid, passiveSkills: [], ability: 'keen-eye', personality: 'timid' as const });
  const sim = new BattleSim({ mode: 'pvp', player: [make(25, 'dodge')], enemy: [make(6, 'caster')], seed: 61 });
  const [unit, caster] = sim.state.combatants;
  unit!.position = { x: 10, y: 8 }; unit!.pixel = { ...unit!.position }; unit!.stats.spd = 200;
  caster!.position = { x: 6, y: 7 }; caster!.pixel = { ...caster!.position }; caster!.castAim = { x: 10, y: 7 };
  caster!.castProgress = { skillId, remaining: SKILL_MAP[skillId]!.castTime! };
  unit!.currentTargetUid = caster!.uid;
  return { sim, unit: unit!, caster: caster! };
}
const cases = [];
for (const skillId of ['flamethrower', 'hyper-beam', 'earthquake', 'rock-slide']) {
  for (const roll of [0, .99]) {
    const { sim, unit, caster } = fixture(skillId);
    if (skillId === 'earthquake') { unit.position = { x: 11, y: 9 }; unit.pixel = { ...unit.position }; }
    if (skillId === 'rock-slide') { unit.position = { x: 12, y: 9 }; unit.pixel = { ...unit.position }; }
    const before = { ...unit.position }, evasion = new BattleEvasion();
    let steps = 0, rolls = 0;
    const skill = SKILL_MAP[skillId]!;
    while (caster.castProgress!.remaining > .025) {
      sim.state.time += .025;
      unit.moveCd = Math.max(0, (unit.moveCd ?? 0) - .025);
      unit.pixel.x += (unit.position.x - unit.pixel.x) * (1 - Math.exp(-.025 * 9));
      unit.pixel.y += (unit.position.y - unit.pixel.y) * (1 - Math.exp(-.025 * 9));
      const previous = { ...unit.position };
      evasion.step(unit, sim.state, .1, (_unit, cell) => isCellInArena(cell.x, cell.y), () => { rolls++; return roll; });
      if (distCells(previous, unit.position) > .01) steps++;
      caster.castProgress!.remaining -= .025;
    }
    const hit = skillCovers(skill, caster.pixel, caster.castAim!, unit.pixel);
    assert.equal(rolls, 1, `同一蓄力只掷一次避让判定 ${skillId}`);
    if (roll === 0) { assert(steps > 0 && steps <= 2, `短距离避让 ${skillId}`); assert(!hit, `连续脚点真实离开 ${skillId}`); }
    else { assert.deepEqual(unit.position, before); assert(hit, '未避让仍正常承受命中'); }
    cases.push({ skillId, roll, steps, hit });
  }
}
for (const reason of ['busy', 'blocked', 'too-late', 'single']) {
  const { sim, unit, caster } = fixture(reason === 'single' ? 'ember' : 'hyper-beam');
  const before = { ...unit.position }, evasion = new BattleEvasion();
  if (reason === 'busy') unit.actionLockRemaining = 1;
  if (reason === 'too-late') caster.castProgress!.remaining = .08;
  for (let tick = 0; tick < 8; tick++) {
    sim.state.time += .025;
    evasion.step(unit, sim.state, .1, (_unit, cell) => reason !== 'blocked' && isCellInArena(cell.x, cell.y), () => 0);
  }
  assert.deepEqual(unit.position, before, `不能强行避让：${reason}`);
}
// 中断立刻释放避让持有，同一个技能下一次施法可重新判断。
{
  const { sim, unit, caster } = fixture('hyper-beam'), evasion = new BattleEvasion();
  evasion.step(unit, sim.state, .1, () => true, () => 0);
  sim.state.time = .15; assert(evasion.step(unit, sim.state, .1, () => true, () => 0));
  caster.castProgress = null;
  assert(!evasion.step(unit, sim.state, .1, () => true, () => 0), '打断释放持有');
}
// 正式 BattleSim 使用同一移动/伤害链路，避让不会凭空生成 miss。
function actualBattle(roll: number) {
  const { sim, unit, caster } = fixture('hyper-beam');
  for (const c of sim.state.combatants) for (const id of c.activeSkills) c.cooldowns[id] = 999;
  sim.rng = () => roll;
  while (sim.state.time < .65) sim.tick(.025);
  const damage = sim.state.events.filter(e => e.type === 'damage' && e.skillId === 'hyper-beam' && e.target === unit.uid);
  return { damage: damage.reduce((n, e) => n + (e.amount ?? 0), 0), pixel: unit.pixel, events: sim.state.events };
}
assert.equal(actualBattle(0).damage, 0, '正式释放按避让后的脚点判定未覆盖');
assert(actualBattle(.8).damage > 0, '未避让仍实际扣血');
assert.deepEqual(actualBattle(0), actualBattle(0), '同种子和输入可完全复现');
// 同一个随机值下，低血量与保守性格更愿意躲避。
for (const [personality, hpRatio, expected] of [['brave', 1, false], ['timid', 1, true], ['brave', .1, true]] as const) {
  const { sim, unit } = fixture('hyper-beam'), evasion = new BattleEvasion();
  unit.personality = personality; unit.currentHp = unit.maxHp * hpRatio;
  evasion.step(unit, sim.state, .1, (_c, cell) => isCellInArena(cell.x, cell.y), () => .4);
  sim.state.time = .2;
  assert.equal(evasion.step(unit, sim.state, .1, (_c, cell) => isCellInArena(cell.x, cell.y), () => .4), expected);
}
// 光束中心需要两步，实际连续位置必须在释放前离开。
{
  const { sim, unit, caster } = fixture('hyper-beam'), evasion = new BattleEvasion();
  unit.position = { x: 10, y: 7 }; unit.pixel = { ...unit.position };
  let steps = 0;
  while (caster.castProgress!.remaining > .025) {
    sim.state.time += .025; unit.moveCd = Math.max(0, (unit.moveCd ?? 0) - .025);
    unit.pixel.x += (unit.position.x - unit.pixel.x) * (1 - Math.exp(-.025 * 9));
    unit.pixel.y += (unit.position.y - unit.pixel.y) * (1 - Math.exp(-.025 * 9));
    const previous = { ...unit.position };
    evasion.step(unit, sim.state, .1, (_c, cell) => isCellInArena(cell.x, cell.y), () => 0);
    if (distCells(previous, unit.position) > .01) steps++;
    caster.castProgress!.remaining -= .025;
  }
  assert.equal(steps, 2);
  assert(!skillCovers(SKILL_MAP['hyper-beam']!, caster.pixel, caster.castAim!, unit.pixel));
}
// 途中新增即将落下的范围：取消旧路线且不额外掷骰。
{
  const { sim, unit, caster } = fixture('hyper-beam'), evasion = new BattleEvasion();
  const rng = () => 0;
  evasion.step(unit, sim.state, .1, () => true, rng);
  sim.state.time = .15; assert(evasion.step(unit, sim.state, .1, () => true, rng));
  const before = { ...unit.position };
  sim.state.combatants.push({ ...caster, uid: 'new-threat', castAim: { ...unit.pixel }, castProgress: { skillId: 'rock-slide', remaining: .01 } });
  assert(!evasion.step(unit, sim.state, .1, () => true, () => { throw Error('不应重新掷骰'); }));
  assert.deepEqual(unit.position, before);
}
// 第二个范围更早释放，不能只用第一招剩余时间判断终点安全。
{
  const { sim, unit, caster } = fixture('hyper-beam'), evasion = new BattleEvasion();
  sim.state.combatants.push({ ...caster, uid: 'early-threat', castAim: { ...unit.pixel }, castProgress: { skillId: 'rock-slide', remaining: .08 } });
  const before = { ...unit.position };
  evasion.step(unit, sim.state, .1, () => true, () => 0);
  sim.state.time = .15;
  assert(!evasion.step(unit, sim.state, .1, () => true, () => 0));
  assert.deepEqual(unit.position, before);
}
// 极窄光束穿过路线内部但不覆盖端点，完整线段检测不能漏过。
{
  const id = '__evasion_narrow_test';
  SKILL_MAP[id] = { ...SKILL_MAP['hyper-beam']!, id, space: { ...SKILL_MAP['hyper-beam']!.space!, width: .02 } };
  try {
    for (const crossing of [false, true]) {
      const { sim, unit, caster } = fixture('hyper-beam'), evasion = new BattleEvasion();
      if (crossing) sim.state.combatants.push({ ...caster, uid: 'narrow-threat', pixel: { x: 9.63, y: 5 }, position: { x: 9.63, y: 5 }, castAim: { x: 9.63, y: 10 }, castProgress: { skillId: id, remaining: .6 } });
      const allowed = (_c: unknown, cell: { x: number; y: number }) => cell.x === 9 && cell.y === 9;
      evasion.step(unit, sim.state, .1, allowed, () => 0);
      sim.state.time = .15;
      assert.equal(evasion.step(unit, sim.state, .1, allowed, () => 0), !crossing, '路线内部的窄范围也阻止穿越');
    }
  } finally { delete SKILL_MAP[id]; }
}
console.log(JSON.stringify(cases));
console.log('✓ 扇形/直线/周身/落点范围的连续脚点避让、失败命中、动作锁、无路、反应时间与打断');
