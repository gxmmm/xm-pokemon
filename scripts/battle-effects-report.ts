import assert from 'node:assert/strict';
import { BattleSim, createWildInstance } from '@pokemon-online/engine';
import { SKILL_MAP, PASSIVE_MAP, ABILITIES } from '@pokemon-online/config';
import { decide } from '../packages/engine/src/ai.ts';
import type { BattleCombatant, Skill } from '@pokemon-online/shared';
import { computeDamage } from '../packages/engine/src/damage.ts';
import { computeStats, effectiveStat, statBreakdown } from '../packages/engine/src/stats.ts';
import { skillHitChance, secondaryEffectChance } from '../packages/engine/src/combat-modifiers.ts';
import { BattleDirector, toBattlePresentationEvent } from '@pokemon-online/presentation';

const make = (uid: string, ability = 'keen-eye') => ({ ...createWildInstance(68, 50, { rng: () => .5 }), uid, ability, passiveSkills: [] });
const sim = new BattleSim({ mode: 'pvp', player: [make('a')], enemy: [make('b')], seed: 3 });
const [a,b] = sim.state.combatants as [BattleCombatant, BattleCombatant];
const internals = sim as unknown as {
  rng: () => number;
  dealDamage(a: BattleCombatant, b: BattleCombatant, id: string): { dealt: number };
  statusTick(c: BattleCombatant, dt: number): void;
  passiveRegen(c: BattleCombatant, dt: number): void;
};
internals.rng = () => .5;
const fire = SKILL_MAP['flamethrower']!;
const resistance = Object.values(PASSIVE_MAP).find(p => p.effect.kind === 'typeResist' && p.effect.type === 'fire')!;
assert(resistance);
for (const type of ['normal', 'grass', 'water'] as const) {
  b.types = [type]; b.ability = 'keen-eye'; b.passiveSkills = [];
  const base = computeDamage(a,b,fire,() => .5);
  b.ability = 'thick-fat';
  const fat = computeDamage(a,b,fire,() => .5);
  assert(Math.abs(fat.damage - base.damage * .5) <= 1, `${type} 厚脂肪独立减半`);
  assert.equal(fat.effectiveness, base.effectiveness);
  b.ability = 'keen-eye'; b.passiveSkills = [resistance.id];
  assert(Math.abs(computeDamage(a,b,fire,() => .5).damage - base.damage * resistance.effect.mult!) <= 1);
}
b.passiveSkills = []; b.types = ['normal'];
const inaccurate = { ...fire, accuracy: 30 };
a.ability = 'no-guard'; assert.equal(skillHitChance(a,b,inaccurate),1);
a.ability = 'keen-eye'; b.ability = 'no-guard'; assert.equal(skillHitChance(a,b,inaccurate),1);
b.ability = 'snow-cloak'; assert.equal(skillHitChance(a,b,fire),1, '没有天气不能触发雪隐');
a.ability = 'serene-grace';
for (const [base, expected] of [[.3,.525],[.6,.7],[.8,.8],[1,1]]) {
  const skill = { ...fire, effect: { ...fire.effect!, chance: base } } as Skill;
  assert(Math.abs(secondaryEffectChance(a,skill) - expected!) < 1e-9);
}
a.ability = 'keen-eye'; b.ability = 'lightning-rod';
internals.dealDamage(a,b,'thunderbolt'); assert.equal(b.statStages.atk,1);
internals.dealDamage(a,b,'flamethrower'); assert.equal(b.statStages.atk,1);
b.ability = 'keen-eye'; b.currentHp = b.maxHp;
const damage = computeDamage(a,b,fire,() => .5).damage;
const first = Math.floor(damage / 2), second = damage * 2;
b.shields = first + second;
b.buffs = [{ id:'old',kind:'shield',magnitude:first,remaining:.1 }, { id:'new',kind:'shield',magnitude:second,remaining:5 }];
internals.dealDamage(a,b,'flamethrower');
assert.equal(b.currentHp,b.maxHp);
assert.equal(b.shields,first + second - damage);
internals.statusTick(b,.2);
assert.equal(b.shields,first + second - damage,'旧盾到期不能扣除新盾');
internals.statusTick(b,5); assert.equal(b.shields,0);
for (const ability of ['solar-power','chlorophyll']) {
  const instance = make('weather',ability), plain = make('weather');
  assert.deepEqual(computeStats(instance),computeStats(plain));
  assert.equal(statBreakdown(instance,'atk').abilityMult,1);
}
b.currentHp = Math.floor(b.maxHp / 2); b.ability = 'dry-skin';
const hp = b.currentHp; internals.passiveRegen(b,1); assert.equal(b.currentHp,hp);
b.ability = 'rain-dish'; internals.passiveRegen(b,1); assert.equal(b.currentHp,hp);
sim.setWeather('rain'); internals.passiveRegen(b,1); assert(b.currentHp > hp);
const opening = new BattleSim({ mode:'pvp',player:[make('opening','opening-initiative')],enemy:[make('other')],seed:2 });
const c = opening.state.combatants[0]!;
assert.equal(effectiveStat(c,'spd'),Math.floor(c.stats.spd * 1.5));
c.statStages.spd = 6;
(opening as unknown as typeof internals).statusTick(c,6.1);
assert.equal(c.statStages.spd,6,'临时速度到期不扣除永久等级');
assert.equal(effectiveStat(c,'spd'),c.stats.spd * 4);
for (const status of ['burn','poison','paralyze','freeze','sleep','confuse'] as const) {
  const battle = new BattleSim({mode:'pvp',player:[{...make('status'),status}],enemy:[make('other')],seed:2});
  const unit = battle.state.combatants[0]!;
  assert(unit.statusTimer > 0);
  (battle as unknown as typeof internals).statusTick(unit,6);
  assert.equal(unit.status,null,'初始异常必须正常到期');
}
console.log('✓ 减伤比例、双向无防守、追加概率、避雷针、分层护盾、天气条件、临时速度与初始异常');

{
  const battle = new BattleSim({mode:'pvp',player:[make('sun','solar-power'),make('leaf','chlorophyll')],enemy:[make('enemy')],seed:7});
  const [sun,leaf,enemy] = battle.state.combatants as [BattleCombatant,BattleCombatant,BattleCombatant];
  for (const unit of battle.state.combatants) { unit.actionLockRemaining = 100; unit.actionReadyRemaining = 100; }
  battle.setWeather('sun','测试晴天',2);
  assert.equal(effectiveStat(sun,'atk'),Math.floor(sun.stats.atk*1.5));
  assert.equal(effectiveStat(leaf,'spd'),Math.floor(leaf.stats.spd*1.5));
  const startHp = sun.currentHp;
  battle.tick(1); assert(sun.currentHp < startHp,'太阳之力有真实生命代价');
  const costs = battle.state.events.filter(e=>e.vfx?.selfCost);
  assert(costs.length>0);
  assert.equal(new BattleDirector().direct(costs.map(toBattlePresentationEvent)).length,0,'自身代价不触发受击动作');
  const beforeSuppress = sun.currentHp;
  enemy.ability = 'cloud-nine'; battle.tick(.05);
  assert(battle.state.weather?.suppressed);
  assert.equal(effectiveStat(sun,'atk'),sun.stats.atk);
  assert.equal(sun.currentHp,beforeSuppress,'抑制天气同时停止生命消耗');
  enemy.alive = false; enemy.currentHp = 0;
  (battle as unknown as {refreshWeather():void}).refreshWeather();
  assert(!battle.state.weather?.suppressed);
  assert.equal(effectiveStat(leaf,'spd'),Math.floor(leaf.stats.spd*1.5));
  enemy.alive = true; enemy.currentHp = enemy.maxHp; enemy.ability = 'keen-eye';
  battle.setWeather('rain','覆盖',.5);
  assert.equal(effectiveStat(sun,'atk'),sun.stats.atk);
  battle.tick(.6); assert.equal(battle.state.weather,undefined);
  battle.setWeather('snow','刷新',5); battle.tick(.1); battle.setWeather('snow','刷新',5);
  assert.equal(battle.state.weather?.remaining,5);
  sun.ability = 'snow-cloak'; (battle as unknown as {refreshWeather():void}).refreshWeather();
  enemy.ability = 'serene-grace'; assert.equal(skillHitChance(enemy,sun,fire),.8);
  sun.ability = 'sand-veil'; battle.setWeather('sand'); assert.equal(skillHitChance(enemy,sun,fire),.8);
  sun.ability = 'dry-skin'; battle.setWeather('sun');
  const boosted = computeDamage(enemy,sun,fire,() => .5).damage;
  battle.setWeather('rain'); const plain = computeDamage(enemy,sun,fire,() => .5).damage;
  assert(Math.abs(boosted-plain*1.25)<=1);
  enemy.alive = false; battle.tick(.05); assert(battle.isOver); assert.equal(battle.state.weather,undefined);
  assert(battle.state.combatants.every(c=>!c.effectiveWeather));
  const drought = new BattleSim({mode:'pvp',player:[make('sunny','drought')],enemy:[make('e')],weather:'rain',seed:2});
  assert.equal(drought.state.weather?.kind,'sun'); assert.equal(drought.state.weather?.remaining,20);
}
{
  const battle = new BattleSim({mode:'pvp',player:[make('guts','guts')],enemy:[make('e')],seed:8});
  const unit = battle.state.combatants[0]!;
  const sync = () => (battle as unknown as {refreshWeather():void}).refreshWeather();
  unit.status = 'poison'; unit.statusTimer = 1; sync(); sync();
  let notices = battle.state.events.filter(e=>e.vfx?.notice);
  assert.equal(notices.length,1); assert.equal(notices[0]!.vfx!.notice!.text,'毅力·攻击提升');
  unit.status = 'burn'; sync(); assert.equal(battle.state.events.filter(e=>e.vfx?.notice).length,1,'异常更换但条件仍满足不重复提示');
  unit.status = null; sync(); sync();
  notices = battle.state.events.filter(e=>e.vfx?.notice);
  assert.equal(notices.length,2); assert.equal(notices[1]!.vfx!.notice!.active,false);
  const director = new BattleDirector();
  const cues = director.direct(notices.map(toBattlePresentationEvent));
  assert.equal(cues.filter(c=>c.cue.type==='notice').length,2,'条件提示穿过正式表现链路');
  assert(!cues.some(c=>c.cue.type==='vfx'),'条件提示不附带光环');
  assert.equal(director.direct(notices.map(toBattlePresentationEvent)).length,0,'同一提示不重复播放');
}
console.log('✓ 天气覆盖/刷新/到期、气象台倒下恢复、真实增益代价、终局清理、条件启停文字及去重');

{
  const supportedCustom = new Set(['static','flame-body','poison-point','sand-veil','snow-cloak','cloud-nine','limber','immunity','no-guard']);
  assert(ABILITIES.filter(a=>a.effect.kind==='custom').every(a=>supportedCustom.has(a.id)),'没有未实现的空特性');
  const battle = new BattleSim({mode:'pvp',player:[make('a')],enemy:[make('b')],seed:4});
  const [actor,foe] = battle.state.combatants as [BattleCombatant,BattleCombatant];
  const test = battle as unknown as typeof internals & {cooldownRate(c:BattleCombatant,basic:boolean):number};
  test.rng=()=>.1; actor.types=['normal']; foe.types=['normal']; foe.maxHp=foe.currentHp=10000;
  actor.ability='illuminate'; assert.equal(skillHitChance(actor,foe,{...fire,accuracy:60}),.7);
  actor.ability='keen-eye'; foe.ability='damp';
  const damp=computeDamage(actor,foe,fire,()=>.5).damage;
  foe.ability='keen-eye'; const plain=computeDamage(actor,foe,fire,()=>.5).damage;
  assert(Math.abs(damp-plain*.8)<=1);
  actor.ability='magnet-pull'; foe.types=['steel'];
  const magnet=computeDamage(actor,foe,fire,()=>.5).damage;
  actor.ability='keen-eye'; const steel=computeDamage(actor,foe,fire,()=>.5).damage;
  assert(Math.abs(magnet-steel*1.2)<=1);
  actor.ability='skill-link'; const base=test.cooldownRate(actor,true), tactical=test.cooldownRate(actor,false);
  actor.ability='keen-eye'; assert(Math.abs(base/test.cooldownRate(actor,true)-1.15)<1e-9); assert.equal(tactical,test.cooldownRate(actor,false));
  assert.equal(computeStats(make('adaptive','imposter')).def,Math.floor(computeStats(make('plain')).def*1.2));
  for (const [ability,key,skill] of [['cute-charm','atk','tackle'],['cursed-body','spd','flamethrower']] as const) {
    foe.ability=ability; foe.types=['normal']; foe.currentHp=10000; foe.abilityCooldowns={};
    actor.statStages={atk:0,def:0,spd:0};
    if(ability==='cute-charm') {test.dealDamage(actor,foe,'flamethrower');assert.equal(actor.statStages.atk,0,'迷人之躯不反制远程');}
    test.dealDamage(actor,foe,skill); assert.equal(actor.statStages[key],-1);
    test.dealDamage(actor,foe,skill); assert.equal(actor.statStages[key],-1,'冷却防重复触发');
    foe.abilityCooldowns={}; actor.statStages[key]=-6; test.dealDamage(actor,foe,skill); assert.equal(actor.statStages[key],-6);
    actor.statStages[key]=0; foe.shields=10000; test.dealDamage(actor,foe,skill); assert.equal(actor.statStages[key],0,'护盾完全吸收不触发'); foe.shields=0;
  }
  const entry=new BattleSim({mode:'pvp',player:[make('n','unnerve'),make('r','run-away')],enemy:[make('e')],seed:1});
  assert.equal(entry.state.combatants[2]!.pressureUntil,8);
  const runner=entry.state.combatants[1]!; assert.equal(effectiveStat(runner,'spd'),Math.floor(runner.stats.spd*1.5));
  actor.ability='keen-eye'; foe.ability='sand-veil'; foe.effectiveWeather='sand';
  assert.equal(skillHitChance(actor,foe,SKILL_MAP.swift!),1,'必中仍服从覆盖，但不受闪避影响');
  actor.types=['fire']; actor.passiveSkills=['p-adapt'];
  const matching=computeDamage(actor,foe,fire,()=>.5).damage;
  const notMatching=computeDamage(actor,foe,SKILL_MAP.tackle!,()=>.5).damage;
  actor.passiveSkills=[];
  assert(matching>computeDamage(actor,foe,fire,()=>.5).damage);
  assert.equal(notMatching,computeDamage(actor,foe,SKILL_MAP.tackle!,()=>.5).damage);
}
{
  const battle = new BattleSim({mode:'pvp',player:[make('a')],enemy:[make('immune','flash-fire'),make('open')],seed:9});
  const [actor,immune,open] = battle.state.combatants as [BattleCombatant,BattleCombatant,BattleCombatant];
  actor.rangedRole=true; actor.engagementRangeCells=6; actor.activeSkills=['flamethrower'];actor.basicSkillId='flamethrower';actor.cooldowns={flamethrower:0};
  actor.position=actor.pixel={x:7,y:7}; immune.position=immune.pixel={x:10,y:6}; open.position=open.pixel={x:10,y:8};
  actor.currentTargetUid=immune.uid; actor.targetCommitUntil=100;
  battle.state.teamTactics.player={kind:'pressure',targetUid:immune.uid,expiresAt:100};
  const plan=decide(actor,battle.state,()=>.5)!;
  assert.equal(plan.targetUid,open.uid,'免疫不被目标黏性与集火覆盖'); assert(plan.desiredRangeCells>=3.5);
  actor.ability='solar-power'; actor.currentHp=1; actor.activeSkills=['ember','hyper-beam'];actor.basicSkillId='ember';actor.cooldowns={ember:0,'hyper-beam':0};
  battle.setWeather('sun'); open.types=['normal'];immune.types=['normal'];
  const urgent=decide(actor,battle.state,()=>.5)!;
  assert.notEqual(urgent.preferredSkillId,'hyper-beam','生命代价致命时不选赶不上的长蓄力');
}
console.log('✓ 九项简单特性、触发冷却与上限、免疫目标调整、合理作战距离和天气生命代价选招');
