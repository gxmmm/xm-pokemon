import { BattleSim, createWildInstance, breed, createStarter, computeStats, applyExp, getAvailableEvolutions, rollEncounter, rollWildGroup, isHardCc } from '@pokemon-online/engine';
import { getSpecies, MAPS, getMap, SKILL_MAP } from '@pokemon-online/config';
import type { BattleCombatant } from '@pokemon-online/shared';
import { skillFxProfile } from '../apps/web/src/battle/BattleEffects.ts';

function assert(cond: boolean, msg: string): void {
  if (!cond) { console.error('✗ ASSERT FAIL:', msg); process.exit(1); }
}

// 1. stats
const starter = createStarter(6); // Charizard
const stats = computeStats(starter);
assert(stats.hp > 0 && stats.atk > 0, 'stats positive');
console.log('✓ stats:', stats);

// 2. battle 1v1 PVE - must produce a winner without throwing
const wild = createWildInstance(25, 8);
const sim = new BattleSim({ mode: 'pve', player: [starter], enemy: [wild], isWild: true });
sim.resolve(120);
assert(sim.state.ended, 'battle ended');
assert(sim.state.winner === 'player' || sim.state.winner === 'enemy' || sim.state.winner === 'draw', 'has winner');
assert(sim.state.events.length > 5, 'events emitted');
// grid-movement stall sentinel: a real fight must land at least one hit. If the
// melee stop band ever exceeds attack range, combatants stall out of reach and
// the battle times out with zero attacks (the grid version of the old bug).
const hitEvents = sim.state.events.filter((e) => e.type === 'attack' || e.type === 'damage').length;
assert(hitEvents >= 1, `battle landed hits (hitEvents=${hitEvents}) - no stall`);
console.log('✓ pve battle winner:', sim.state.winner, 'events:', sim.state.events.length, 'hits:', hitEvents);

// 2b. PVE simultaneous: 3 player pokemon vs 1 strong wild (all active at once).
//     PVE is no longer sequential rotation - the whole team is on the field.
const weakTeam = [createWildInstance(10, 3), createWildInstance(13, 3), createWildInstance(16, 3)];
const strongWild = createWildInstance(143, 40); // Snorlax lvl40
const pveSim = new BattleSim({ mode: 'pve', player: weakTeam, enemy: [strongWild], isWild: true });
pveSim.resolve(200);
assert(pveSim.state.ended, 'pve simultaneous ended');
assert(pveSim.state.combatants.filter((c) => c.side === 'player').length === 3, 'pve all 3 active at once');
const pveHits = pveSim.state.events.filter((e) => e.type === 'attack' || e.type === 'damage').length;
assert(pveHits >= 1, `pve simultaneous landed hits (${pveHits}) - no stall`);
console.log('✓ pve simultaneous 3v1: winner=', pveSim.state.winner, 'hits=', pveHits);

// 2c. wild group rolls 1~3
const grp = rollWildGroup(getMap('route1'));
assert(grp.length >= 1 && grp.length <= 3, `wild group size 1..3 (${grp.length})`);
console.log('✓ wild group size:', grp.length);

// 3. 3v3 PVP battle (simultaneous)
const teamA = [createStarter(6), createStarter(9), createStarter(3)];
const teamB = [createWildInstance(150, 50), createWildInstance(131, 40), createWildInstance(143, 40)];
const pvp = new BattleSim({ mode: 'pvp', player: teamA, enemy: teamB, isWild: false });
pvp.resolve(180);
assert(pvp.state.ended, 'pvp ended');
console.log('✓ pvp battle winner:', pvp.state.winner);

// 3a. Structured presentation outcomes: a real damaging hit carries the
// director-facing result fields, and a lethal hit is explicitly tagged as KO.
const outcomeEvents = pvp.state.events.filter((e) => e.type === 'damage' && !!e.actor && (e.amount ?? 0) > 0);
assert(outcomeEvents.length > 0, 'pvp emitted damaging events with actors');
assert(outcomeEvents.some((e) => typeof e.vfx?.crit === 'boolean' && typeof e.vfx?.effectiveness === 'number' && typeof e.vfx?.ko === 'boolean'), 'damage events carry structured director outcomes');
assert(outcomeEvents.some((e) => e.vfx?.ko), 'a defeated combatant has a KO-tagged damage event');
console.log('✓ structured damage outcomes: ko=', outcomeEvents.filter((e) => e.vfx?.ko).length);

// 3aa. Spread skills: use a controlled simultaneous 3v3 state so Surf must hit
// every opposing active target and expose ordered spread metadata to the client.
{
  const surfUser = createWildInstance(131, 50);
  surfUser.activeSkills = ['surf'];
  const victims = [createWildInstance(6, 25), createWildInstance(9, 25), createWildInstance(3, 25)];
  const area = new BattleSim({ mode: 'pvp', player: [surfUser], enemy: victims, isWild: false, seed: 7 });
  const caster = area.state.combatants.find((c) => c.uid === surfUser.uid)!;
  const enemies = area.state.combatants.filter((c) => c.side === 'enemy');
  caster.currentTargetUid = enemies[0]!.uid;
  (area as unknown as { resolveSkill: (c: BattleCombatant, id: string) => void }).resolveSkill(caster, 'surf');
  const hits = area.state.events.filter((e) => e.type === 'damage' && e.skillId === 'surf' && e.actor === caster.uid);
  assert(hits.length === enemies.length, `surf spread hits every enemy (${hits.length}/${enemies.length})`);
  assert(hits.every((e, i) => e.vfx?.targetUids?.length === enemies.length && e.vfx.hitIndex === i && e.vfx.hitCount === enemies.length), 'spread damage events carry ordered target metadata');
  assert(hits.slice(1).every((e) => e.vfx?.secondary && (e.vfx.impactDelay ?? 0) > 0), 'secondary spread hits are marked and staggered');
  console.log('✓ spread skill Surf:', hits.length, 'targets');
}

// 3ab. Every configured move has a visual direction. This prevents future skill
// additions from silently falling back to a generic anonymous projectile.
const FX_FAMILIES = new Set(['orb', 'bolt', 'beam', 'wave', 'storm', 'meteor', 'blade', 'dash', 'fang', 'drain', 'curse', 'guard', 'heal', 'powder', 'rune']);
for (const skill of Object.values(SKILL_MAP)) assert(FX_FAMILIES.has(skillFxProfile(skill.id, skill.type).family), `skill visual profile: ${skill.id}`);
console.log('✓ skill visual profiles:', Object.keys(SKILL_MAP).length);

// 3b. AI behavior: reactive interrupts (A) + team CC coordination (D). Run
//     several high-level 3v3 matchups (so big windup nukes + hard-CC moves are
//     in active sets) and aggregate:
//       - interrupts: '被打断' info events (a windup cancelled by hard CC) -- A
//       - doubleCc: two allies hard-CCing the SAME target within 0.6s -- D avoids
//     Lower doubleCc / non-zero interrupts => the new AI logic is firing.
{
  const matchups: [number[], number[]][] = [
    [[6, 9, 3], [150, 131, 143]],
    [[59, 130, 143], [6, 9, 3]],
    [[131, 143, 59], [9, 3, 6]],
    [[150, 143, 131], [59, 130, 6]],
  ];
  let interrupts = 0, doubleCc = 0, hardCcCasts = 0, defensiveCasts = 0;
  const DEFENSIVE = new Set(['recover', 'synthesis', 'rest', 'protect', 'reflect']);
  for (const [a, b] of matchups) {
    const ta = a.map((id) => createWildInstance(id, 45));
    const tb = b.map((id) => createWildInstance(id, 45));
    const s = new BattleSim({ mode: 'pvp', player: ta, enemy: tb, isWild: false });
    s.resolve(180);
    interrupts += s.state.events.filter((e) => e.type === 'info' && (e.message ?? '').includes('被打断')).length;
    const ccCasts: { t: number; target?: string; actor?: string }[] = [];
    for (const e of s.state.events) {
      if (e.type === 'skill' && e.skillId && DEFENSIVE.has(e.skillId)) defensiveCasts++;
      const sk = e.skillId ? SKILL_MAP[e.skillId] : undefined;
      if (e.type === 'skill' && sk && isHardCc(sk)) { hardCcCasts++; ccCasts.push({ t: e.t, target: e.target, actor: e.actor }); }
    }
    ccCasts.sort((x, y) => x.t - y.t);
    for (let i = 0; i < ccCasts.length; i++) {
      for (let j = i + 1; j < ccCasts.length; j++) {
        if (ccCasts[j].t - ccCasts[i].t > 0.6) break;
        if (ccCasts[j].target && ccCasts[j].target === ccCasts[i].target && ccCasts[j].actor !== ccCasts[i].actor) doubleCc++;
      }
    }
  }
  console.log('✓ ai behavior over', matchups.length, 'matchups: interrupts=', interrupts, 'hardCcCasts=', hardCcCasts, 'doubleCc=', doubleCc, 'defensiveCasts=', defensiveCasts);
  assert(hardCcCasts >= 1, `hard-CC skills are being cast (hardCcCasts=${hardCcCasts})`);
}

// 4. breeding - consumes parents, produces offspring of a parent species
const a = createStarter(1);
const b = createStarter(7);
const result = breed(a, b);
assert(result.offspring.speciesId === 1 || result.offspring.speciesId === 7, 'offspring species is a parent');
assert(result.offspring.level === 5, 'offspring level 5');
assert(!!result.offspring.lineage, 'lineage recorded');
console.log('✓ breed offspring species:', result.offspring.speciesId, 'passives:', result.offspring.passiveSkills.length);

// 5. exp / level up / evolution availability
const e = createStarter(1); // Bulbasaur -> Ivysaur at 16
applyExp(e, 99999);
assert(e.level >= 16, 'leveled past 16');
const evos = getAvailableEvolutions(e);
assert(evos.includes(2), 'can evolve to Ivysaur');
console.log('✓ evolution available:', evos);

// 6. encounter rolls across maps
let any = false;
for (const m of MAPS) {
  const r = rollEncounter(getMap(m.id));
  if (r) { any = true; assert(r.instance.currentHp > 0, 'wild has hp'); }
}
assert(any, 'at least one map yields encounters');
console.log('✓ encounters roll OK');

// 7. legendary encounter from dragon-den
const den = getMap('dragon-den');
const leg = rollEncounter(den);
assert(leg !== null, 'dragon-den yields encounter');
console.log('✓ dragon-den encounter:', getSpecies(leg!.speciesId).name, 'lvl', leg!.level);

console.log('\n🎉 ALL ENGINE SMOKE TESTS PASSED');
