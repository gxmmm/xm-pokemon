import { BattleSim, createWildInstance, breed, createStarter, computeStats, applyExp, getAvailableEvolutions, rollEncounter, rollWildGroup } from '@pokemon-online/engine';
import { getSpecies, MAPS, getMap } from '@pokemon-online/config';

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
