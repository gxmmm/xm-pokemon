import assert from 'node:assert/strict';
import { BattleSim, createWildInstance } from '@pokemon-online/engine';
import { battleEnvironmentFor } from '@pokemon-online/config';
import { defaultFormation, isCellInArena } from '../packages/engine/src/grid.ts';
import { battleDisplayFacing } from '../packages/renderer-pixi/src/battle-facing.ts';
import { projectBattleGroundPoint } from '../packages/renderer-pixi/src/battle-ground.ts';
import { computeStats, statBreakdown, effectiveStat } from '../packages/engine/src/stats.ts';
const make = (id: number, uid: string) => ({ ...createWildInstance(id, 50, { rng: () => .5 }), uid });
const sim = new BattleSim({ mode: 'pvp', player: [make(6, 'caster'), make(25, 'ally')], enemy: [make(143, 'enemy')], seed: 91 });
const [caster, , enemy] = sim.state.combatants;
caster!.castProgress = { skillId: 'hyper-beam', remaining: .6 }; caster!.castAim = { ...enemy!.pixel };
enemy!.alive = false; enemy!.currentHp = 0;
sim.tick(.05);
assert(sim.isOver); assert.equal(caster!.castProgress, null); assert.equal(caster!.castAim, undefined);
assert.equal(sim.state.events.filter(e => e.type === 'end').length, 1);
sim.tick(1); assert.equal(sim.state.events.filter(e => e.type === 'end').length, 1);
for (const biome of ['grass', 'cave', 'water', 'dragon', 'arena']) {
  const camera = battleEnvironmentFor(biome).camera;
  for (const [x,y] of [[8,4],[8,10],[5,7],[13,7]]) {
    caster!.pixel = { x: 8, y: 7 }; enemy!.pixel = { x: x!, y: y! };
    caster!.currentTargetUid = enemy!.uid; enemy!.currentTargetUid = caster!.uid;
    assert.equal(battleDisplayFacing(caster!, [caster!, enemy!], camera), -battleDisplayFacing(enemy!, [caster!, enemy!], camera), '纵向和横向交战显示朝向相反');
  }
  for (const [w,h] of [[1366,768],[1440,900],[1920,1080]]) {
    const scale = Math.max(w! / 1280, h! / 720), ox = (w! - 1280 * scale) / 2, oy = (h! - 720 * scale) / 2;
    const rail = Math.max(252, Math.min(w! * .19, 292)) + 24;
    for (let x=0;x<20;x++) for (let y=0;y<14;y++) if (isCellInArena(x,y)) {
      const p = projectBattleGroundPoint(x,y,camera), sx=p.x*scale+ox, sy=p.y*scale+oy;
      assert(sx-60*scale > rail && sx+60*scale < w!-rail, `${biome} 侧边HUD余量`);
      assert(sy-115*scale > 80 && sy+20*scale < h!-80, `${biome} 上下HUD余量`);
    }
  }
}
const formation = defaultFormation(); assert.equal(formation[1]!.y - formation[0]!.y, 3);
for (const [ability, key] of [['guts','atk'],['marvel-scale','def']] as const) {
  const instance = { ...make(68, ability), ability, passiveSkills: [] };
  const plain = computeStats({ ...instance, ability: 'keen-eye' });
  assert.equal(computeStats(instance)[key], plain[key], '无异常不加常驻属性');
  assert.equal(statBreakdown(instance,key).abilityMult, 1);
  const battle = new BattleSim({ mode:'pvp', player:[instance], enemy:[make(143,'dummy')], seed:2 });
  const unit = battle.state.combatants[0]!;
  assert.equal(effectiveStat(unit,key),plain[key]);
  unit.status = 'poison'; assert.equal(effectiveStat(unit,key),Math.floor(plain[key]*1.5));
  unit.status = null; assert.equal(effectiveStat(unit,key),plain[key], '解除异常立即还原');
  if (ability === 'guts') { unit.status='burn'; assert.equal(effectiveStat(unit,key),Math.floor(plain[key]*1.5)); }
}
{
  const instance = { ...make(68,'power'), ability:'huge-power', passiveSkills:[] };
  assert.equal(computeStats(instance).atk, Math.floor(computeStats({...instance,ability:'keen-eye'}).atk*1.5), '大力的常驻加成保留');
  const opening = new BattleSim({ mode:'pvp',player:[make(6,'p')],enemy:[make(143,'e')],seed:2 });
  const camera=battleEnvironmentFor('grass').camera;
  const positions=opening.state.combatants.map(c=>projectBattleGroundPoint(c.pixel.x,c.pixel.y,camera));
  assert(positions[0]!.x<positions[1]!.x && positions[0]!.y>positions[1]!.y,'我方左下对方右上');
  const actor=opening.state.combatants[0]!, opponent=opening.state.combatants[1]!;
  actor.currentTargetUid=opponent.uid;
  actor.actionAim={...opponent.pixel}; actor.actionLockRemaining=1;
  const facing=battleDisplayFacing(actor,opening.state.combatants,camera);
  opponent.pixel={x:0,y:13};
  assert.equal(battleDisplayFacing(actor,opening.state.combatants,camera),facing,'收招期间保留释放方向');
  const patient={...opponent,uid:'patient',pixel:{x:2,y:10}};
  actor.castProgress={skillId:'heal-pulse',remaining:.3}; actor.castSupportUid=patient.uid; actor.actionAim={...patient.pixel};
  actor.castAim={x:18,y:2};
  assert.equal(battleDisplayFacing(actor,[actor,opponent,patient],camera),-1,'友疗面向患者而非敌方瞄准点');
}
console.log('✓ 终局取消残留蓄力、双向投影朝向、默认阵距与全合法格桌面HUD余量');
