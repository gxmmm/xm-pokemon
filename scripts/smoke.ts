import { BattleSim, createWildInstance, breed, createStarter, computeStats, applyExp, getAvailableEvolutions, rollEncounter } from '@pokemon-online/engine';
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
console.log('✓ pve battle winner:', sim.state.winner, 'events:', sim.state.events.length);

// 2b. PVE sequential bench: 3 player pokemon vs 1 strong wild -> verify
//     switch-on-faint (an 'enter' event fires when the lead faints)
const weakTeam = [createWildInstance(10, 3), createWildInstance(13, 3), createWildInstance(16, 3)];
const strongWild = createWildInstance(143, 40); // Snorlax lvl40
const benchSim = new BattleSim({ mode: 'pve', player: weakTeam, enemy: [strongWild], isWild: true });
benchSim.resolve(200);
assert(benchSim.playerTeamUids.length === 3, 'pve team has 3');
const enters = benchSim.state.events.filter((e) => e.type === 'enter').length;
assert(benchSim.state.ended, 'bench battle ended');
assert(enters >= 1, `bench deployed next on faint (enters=${enters})`);
console.log('✓ pve sequential bench: switches=', enters, 'winner=', benchSim.state.winner);

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
