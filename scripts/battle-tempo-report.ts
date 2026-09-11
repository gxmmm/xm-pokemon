import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { BattleSim, createWildInstance } from '@pokemon-online/engine';
import { battleActionTiming, actionGapForSpeed, skillCooldownRate, SPECIES_LIST, SKILL_MAP } from '@pokemon-online/config';
import { activeSkillsForLevel, tacticalSkillsForInstance } from '../packages/engine/src/instance.ts';
import { decide } from '../packages/engine/src/ai.ts';
import { effectiveStat } from '../packages/engine/src/stats.ts';
import { BattleDirector } from '../packages/presentation/src/director.ts';
import { toBattlePresentationEvent } from '../packages/presentation/src/battle.ts';

function sample(speed: number, skills: string[] = []) {
  const actor = { ...createWildInstance(6, 50, { rng: () => .5 }), uid: 'actor', activeSkills: skills, passiveSkills: [], ability: 'keen-eye', personality: 'brave' as const };
  const enemy = { ...createWildInstance(143, 50, { rng: () => .5 }), uid: 'target', activeSkills: [], passiveSkills: [], ability: 'keen-eye' };
  const sim = new BattleSim({ mode: 'pvp', player: [actor], enemy: [enemy], seed: 41 });
  const [a, b] = sim.state.combatants;
  a!.position = a!.pixel = { x: 5, y: 7 }; b!.position = b!.pixel = { x: 9, y: 7 };
  a!.stats.spd = speed; a!.stats.atk = 25;
  b!.currentHp = b!.maxHp = 1e7; b!.status = 'sleep'; b!.statusTimer = 999;
  for (const id of skills) a!.cooldowns[id] = 0;
  return { sim, a: a!, b: b! };
}
const reports = [];
for (const species of SPECIES_LIST) {
  assert(SKILL_MAP[species.basicSkillId] && species.basicSkillCooldown >= 2 && species.basicSkillCooldown <= 3.2);
  assert(!activeSkillsForLevel(species.id, 50).includes(species.basicSkillId), '基础招式不占战术配招名额');
}
const duplicate = { speciesId: 6, level: 50, activeSkills: ['ember', 'flamethrower', 'fire-blast', 'fly'] };
const tactical = tacticalSkillsForInstance(duplicate);
assert.equal(tactical.length, 4);
assert(!tactical.includes('ember') && tactical.includes('fly'), '基础重复配招释放名额，保留其余已选招式');
assert.equal(duplicate.activeSkills[0], 'ember', '配招投影不修改存档');
const changing = sample(20, ['flamethrower']);
changing.a.status = 'sleep'; changing.a.statusTimer = 10;
changing.a.cooldowns.flamethrower = 10;
changing.sim.tick(.1);
const remaining = changing.a.cooldowns.flamethrower;
changing.a.stats.spd = 200;
changing.sim.tick(.1);
assert(Math.abs(changing.a.cooldowns.flamethrower - (remaining * skillCooldownRate(20, false) / skillCooldownRate(200, false) - .1)) < 1e-8, '冷却中速度改变保留已完成进度');
const regen = sample(80);
regen.a.ability = 'rain-dish'; regen.a.status = 'sleep'; regen.a.statusTimer = 99;
regen.a.currentHp = regen.a.maxHp;
for (let i = 0; i < 100; i++) regen.sim.tick(.05);
assert.equal(regen.a.regenAccumulator, 0, '满血不储存被动回复');
regen.a.currentHp -= 100;
const woundedHp = regen.a.currentHp;
regen.sim.tick(.05);
assert(regen.a.currentHp - woundedHp < 2, '受伤后不能兑现此前满血回复');
for (const speed of [20, 80, 200, 1000000]) {
  const { sim, a } = sample(speed);
  while (sim.state.time < 30) sim.tick(.05);
  const attacks = sim.state.events.filter(e => e.actor === a.uid && e.type === 'skill' && e.skillId === a.basicSkillId && e.vfx?.kind !== 'cast');
  const minimumGap = Math.min(...attacks.slice(1).map((event, i) => event.t - attacks[i]!.t));
  assert(minimumGap + 1e-8 >= battleActionTiming('ember', true).totalMs / 1000 + actionGapForSpeed(speed));
  reports.push({ speed, attacks: attacks.length, minimumGap: +minimumGap.toFixed(3), expectedInterval: +(2.3 / skillCooldownRate(speed, true)).toFixed(3) });
}
assert(reports[0]!.attacks < reports[1]!.attacks && reports[1]!.attacks < reports[2]!.attacks, '同种角色低中高速度具有可观测出手差异');
assert(reports[3]!.attacks < reports[0]!.attacks * 2.1, '极端资质收益受上限约束');

const { sim, a, b } = sample(200, ['flamethrower', 'fire-blast']);
let previousLock = 0, previousPosition = { ...a.position };
while (sim.state.time < 20) {
  sim.tick(.05);
  if (previousLock > .05) assert.deepEqual(a.position, previousPosition, '完整出手期间不允许继续走位');
  previousLock = a.actionLockRemaining ?? 0; previousPosition = { ...a.position };
}
const actions = sim.state.events.filter(e => e.actor === a.uid && e.type === 'skill' && e.vfx?.kind !== 'cast');
assert(actions.some(e => e.skillId === a.basicSkillId) && actions.some(e => e.skillId !== a.basicSkillId));
for (let i = 0; i < actions.length; i++) {
  const action = actions[i]!, timing = battleActionTiming(action.skillId, true);
  const cues = new BattleDirector().direct([toBattlePresentationEvent(action)]);
  const window = cues.find(c => c.cue.type === 'action-window')!.cue;
  assert(window.type === 'action-window' && window.milliseconds === timing.totalMs, '引擎与表现共享完整动作占用');
  if (i + 1 < actions.length) assert(actions[i + 1]!.t - action.t + 1e-8 >= timing.totalMs / 1000 + actionGapForSpeed(200), '基础与战术招式不得穿插抢占');
}
a.statStages.spd = 6;
assert.equal(effectiveStat(a, 'spd'), 800);
a.status = 'paralyze'; assert.equal(effectiveStat(a, 'spd'), 400);
assert(actionGapForSpeed(effectiveStat(a, 'spd')) > actionGapForSpeed(800));
// 战术技能同样获得较温和的速度收益，HUD 存储实际剩余秒数。
for (const speed of [20, 200, 1e6]) {
  const fixture = sample(speed, ['flamethrower']);
  fixture.a.cooldowns.flamethrower = 10; fixture.a.status = 'sleep'; fixture.a.statusTimer = 10;
  fixture.sim.tick(.1); assert(Math.abs(fixture.a.cooldowns.flamethrower - (10 / skillCooldownRate(speed, false) - .1)) < 1e-8);
}
// 快速远程打慢速近战，出手停步仍给近战真实命中机会。
const chase = sample(1000000);
chase.b.status = null; chase.b.stats.spd = 20; chase.b.currentHp = chase.b.maxHp = 10000;
chase.a.currentHp = chase.a.maxHp = 10000;
while (chase.sim.state.time < 30) chase.sim.tick(.05);
assert(chase.b.damageDealt > 0 && chase.a.damageDealt > 0, '高速远程不能无代价无限风筝');
const make = (id: number, uid: string) => ({ ...createWildInstance(id, 50, { rng: () => .5 }), uid, activeSkills: [], passiveSkills: [], ability: 'keen-eye', personality: 'cool' as const });
const healing = new BattleSim({ mode: 'pvp', player: [make(113, 'healer'), make(68, 'patient')], enemy: [make(143, 'foe')], seed: 45 });
const [healer, patient, foe] = healing.state.combatants;
healer!.position = healer!.pixel = { x: 5, y: 7 }; patient!.position = patient!.pixel = { x: 9, y: 7 }; foe!.position = foe!.pixel = { x: 16, y: 7 };
patient!.currentHp = patient!.maxHp * .5;
assert.equal(decide(healer!, healing.state, () => .5)?.supportTargetUid, patient!.uid);
const beforeHp = patient!.currentHp;
healing.tick(.05);
assert(patient!.currentHp > beforeHp && healer!.healingDone > 0, '基础治疗命中队友而非始终自疗');
assert(healing.state.events.some(e => e.type === 'heal' && e.target === patient!.uid && e.skillId === 'heal-pulse'));
healer!.cooldowns['heal-pulse'] = 0; patient!.currentHp = patient!.maxHp;
assert.equal(decide(healer!, healing.state, () => .5)?.preferredSkillId, null, '全队满血不空放基础治疗');
patient!.alive = false; patient!.currentHp = 0;
assert.equal(decide(healer!, healing.state, () => .5)?.supportTargetUid, undefined, '不选择倒下队友');
patient!.alive = true; patient!.currentHp = 1; patient!.position = patient!.pixel = { x: 18, y: 12 };
assert.equal(decide(healer!, healing.state, () => .5)?.supportTargetUid, undefined, '不跨场追逐遥远队友');
healer!.currentHp = healer!.maxHp * .4;
assert.equal(decide(healer!, healing.state, () => .5)?.supportTargetUid, healer!.uid, '需要时可以自疗');
assert(!healing.state.events.some(e => e.type === 'attack' || e.skillId === '__normal__'), '正式引擎不产生通用普攻');
const sustainReports = [];
for (const ids of [[113, 68, 6], [113, 36, 131]]) {
  const team = ids.map((id, i) => ({ ...createWildInstance(id, 50, { rng: () => .5 }), uid: `p${i}` }));
  const opponents = [68, 25, 94].map((id, i) => ({ ...createWildInstance(id, 50, { rng: () => .5 }), uid: `e${i}` }));
  const fight = new BattleSim({ mode: 'pvp', player: team, enemy: opponents, seed: 47 });
  while (!fight.isOver && fight.state.time < 120) fight.tick(.05);
  assert(fight.isOver, `治疗阵容应能结束 ${ids} ${JSON.stringify(fight.state.combatants.map(c => ({id:c.speciesId,hp:c.currentHp,pos:c.position,skills:c.activeSkills,damage:c.damageDealt,heal:c.healingDone})))}`);
  sustainReports.push({ ids, duration: fight.state.time, winner: fight.state.winner });
}
await mkdir('doc/visual-baselines/battle-tempo', { recursive: true });
await writeFile('doc/visual-baselines/battle-tempo/report.json', JSON.stringify({ passed: true, reports, sustainReports, mixedActions: actions.length, meleeDamage: chase.b.damageDealt }, null, 2));
console.log(JSON.stringify(reports));
console.log('✓ 速度收益、动作占用、混合衔接、阶段麻痹、分层冷却和近战接敌');
