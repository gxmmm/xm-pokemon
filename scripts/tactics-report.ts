import { BattleSim, createWildInstance, maxHp, mulberry32, isHardCc } from '@pokemon-online/engine';
import { getSpecies, SKILL_MAP } from '@pokemon-online/config';
import type { IV, PokemonInstance, TeamTacticKind } from '@pokemon-online/shared';

type Role = 'burst' | 'bruiser' | 'tank' | 'control' | 'support' | 'kite' | 'area' | 'unassigned';
interface Scenario { id: string; label: string; player: number[]; enemy: number[]; }
interface RoleMetrics { samples: number; depth: number; enemyDistance: number; breachSeconds: number; damage: number; taken: number; healing: number; shields: number; control: number; knockouts: number; }

const LEVEL = 55;
const SEEDS = [61, 62, 63, 64] as const;
const MAX_SECONDS = 120;
const SAMPLE_DT = 0.1;
const SCENARIOS: Scenario[] = [
  { id: 'frontline-cover', label: '前排保护 vs 突进爆发', player: [143, 65, 25], enemy: [149, 150, 131] },
  { id: 'control-window', label: '控制链 vs 关键冷却', player: [65, 94, 3], enemy: [150, 143, 149] },
  { id: 'area-pressure', label: '范围压制 vs 均衡编队', player: [25, 112, 150], enemy: [131, 143, 3] },
  { id: 'mixed-front', label: '混合前中后排', player: [6, 9, 131], enemy: [143, 65, 25] },
];

function assert(condition: boolean, message: string): void { if (!condition) { console.error(`✗ tactics report assertion failed: ${message}`); process.exit(1); } }
function fixedIv(value: number): IV { return { hp: value, atk: value, def: value, spd: value }; }
function makeInstance(speciesId: number, seed: number): PokemonInstance {
  const instance = createWildInstance(speciesId, LEVEL, { rng: mulberry32(seed) });
  // createWildInstance normally creates time/random-based UIDs. Pin them here so
  // lane preference and every matrix metric remain reproducible across runs.
  instance.uid = 'matrix_' + seed.toString(36) + '_' + speciesId;
  instance.iv = fixedIv(24); instance.growth = 1.08; instance.currentHp = maxHp(instance); return instance;
}
function roleOf(speciesId: number): Role { return getSpecies(speciesId).combatRole ?? 'unassigned'; }
function isBackline(c: { speciesId: number; normalIsRanged?: boolean }): boolean { const role = roleOf(c.speciesId); return role === 'support' || role === 'control' || role === 'kite' || !!c.normalIsRanged; }
function isMeleeThreat(c: { speciesId: number; normalIsRanged?: boolean }): boolean { const role = roleOf(c.speciesId); return !c.normalIsRanged || role === 'tank' || role === 'bruiser'; }
function addRole(map: Map<Role, RoleMetrics>, role: Role, value: Partial<RoleMetrics>): void {
  const current = map.get(role) ?? { samples: 0, depth: 0, enemyDistance: 0, breachSeconds: 0, damage: 0, taken: 0, healing: 0, shields: 0, control: 0, knockouts: 0 };
  current.samples += value.samples ?? 0; current.depth += value.depth ?? 0; current.enemyDistance += value.enemyDistance ?? 0; current.breachSeconds += value.breachSeconds ?? 0;
  current.damage += value.damage ?? 0; current.taken += value.taken ?? 0; current.healing += value.healing ?? 0; current.shields += value.shields ?? 0; current.control += value.control ?? 0; current.knockouts += value.knockouts ?? 0;
  map.set(role, current);
}
function nearestDistance(a: { position: { x: number; y: number } }, others: { position: { x: number; y: number } }[]): number { return Math.min(...others.map((b) => Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y))); }

const roleTotals = new Map<Role, RoleMetrics>();
const tacticSeconds: Record<TeamTacticKind, number> = { finish: 0, protect: 0, pressure: 0, split: 0 };
const scenarioTotals = new Map<string, { label: string; battles: number; playerWins: number; enemyWins: number; draws: number; duration: number; timeouts: number }>();
let battles = 0, totalDamage = 0, targetSwitches = 0, hardCcCasts = 0, hardCcOverlaps = 0, completedBattles = 0;

for (let scenarioIndex = 0; scenarioIndex < SCENARIOS.length; scenarioIndex++) {
  const scenario = SCENARIOS[scenarioIndex]!;
  for (const mirror of [false, true]) for (const seedOffset of SEEDS) {
    const playerIds = mirror ? scenario.enemy : scenario.player;
    const enemyIds = mirror ? scenario.player : scenario.enemy;
    const seed = 700_000 + scenarioIndex * 1_000 + seedOffset * 2 + (mirror ? 1 : 0);
    const sim = new BattleSim({ mode: 'pvp', player: playerIds.map((id, i) => makeInstance(id, seed + i * 11)), enemy: enemyIds.map((id, i) => makeInstance(id, seed + 100 + i * 11)), isWild: false, seed });
    const priorTargets = new Map<string, string | undefined>(); const ccEvents: { t: number; actor?: string; target?: string }[] = []; let latestSeq = 0;
    while (!sim.state.ended && sim.state.time < MAX_SECONDS) {
      sim.tick(SAMPLE_DT);
      for (const side of ['player', 'enemy'] as const) { const tactic = sim.state.teamTactics[side]; if (tactic) tacticSeconds[tactic.kind] += SAMPLE_DT; }
      for (const c of sim.state.combatants.filter((combatant) => combatant.alive)) {
        const previous = priorTargets.get(c.uid); if (previous && c.currentTargetUid && previous !== c.currentTargetUid) targetSwitches++; priorTargets.set(c.uid, c.currentTargetUid);
        const opponents = sim.state.combatants.filter((other) => other.side !== c.side && other.alive); if (opponents.length === 0) continue;
        const depth = c.side === 'player' ? c.position.x : sim.state.arena.cols - 1 - c.position.x;
        const meleeOpponents = opponents.filter(isMeleeThreat); const breach = isBackline(c) && meleeOpponents.length > 0 && nearestDistance(c, meleeOpponents) < 3;
        addRole(roleTotals, roleOf(c.speciesId), { samples: 1, depth, enemyDistance: nearestDistance(c, opponents), breachSeconds: breach ? SAMPLE_DT : 0 });
      }
      for (const event of sim.state.events) {
        if (!event.seq || event.seq <= latestSeq) continue; latestSeq = Math.max(latestSeq, event.seq); const skill = event.skillId ? SKILL_MAP[event.skillId] : undefined;
        if (event.type === 'skill' && skill && isHardCc(skill)) { hardCcCasts++; for (const previous of ccEvents) if (event.target && event.target === previous.target && event.actor !== previous.actor && event.t - previous.t <= 0.6) hardCcOverlaps++; ccEvents.push({ t: event.t, actor: event.actor, target: event.target }); }
      }
    }
    const timeout = sim.state.events.some((event) => event.type === 'end' && event.message === '时间到');
    const total = scenarioTotals.get(scenario.id) ?? { label: scenario.label, battles: 0, playerWins: 0, enemyWins: 0, draws: 0, duration: 0, timeouts: 0 };
    total.battles++; total.duration += sim.state.time; total.timeouts += timeout ? 1 : 0; if (sim.state.winner === 'player') total.playerWins++; else if (sim.state.winner === 'enemy') total.enemyWins++; else total.draws++; scenarioTotals.set(scenario.id, total);
    battles++; if (!timeout) completedBattles++;
    for (const c of sim.state.combatants) { totalDamage += c.damageDealt; addRole(roleTotals, roleOf(c.speciesId), { damage: c.damageDealt, taken: c.damageTaken, healing: c.healingDone, shields: c.shieldAbsorbed, control: c.controlSeconds, knockouts: c.knockouts }); }
  }
}

console.log('\n=== Tactical Regression Matrix ===');
console.log(`battles=${battles} completed=${completedBattles} totalDamage=${Math.round(totalDamage)} targetSwitches=${targetSwitches} hardCc=${hardCcCasts} ccOverlap=${hardCcOverlaps}`);
console.log('\nScenario pacing (mirrored fixed seeds)');
for (const total of scenarioTotals.values()) console.log(`- ${total.label}: battles=${total.battles}, player/enemy/draw=${total.playerWins}/${total.enemyWins}/${total.draws}, avg=${(total.duration / total.battles).toFixed(1)}s, timeout=${total.timeouts}`);
console.log('\nTeam tactic coverage (sampled seconds across both sides)'); console.log(Object.entries(tacticSeconds).map(([kind, seconds]) => `${kind}=${seconds.toFixed(1)}s`).join('  '));
console.log('\nRole contribution and positioning');
for (const [role, total] of [...roleTotals.entries()].sort(([a], [b]) => a.localeCompare(b))) { const samples = Math.max(1, total.samples); console.log(`- ${role}: dmg=${Math.round(total.damage)}, taken=${Math.round(total.taken)}, heal=${Math.round(total.healing)}, shield=${Math.round(total.shields)}, control=${total.control.toFixed(1)}s, ko=${total.knockouts}, depth=${(total.depth / samples).toFixed(2)}, enemyDist=${(total.enemyDistance / samples).toFixed(2)}, backlineBreach=${total.breachSeconds.toFixed(1)}s`); }
assert(completedBattles === battles, 'all fixed-seed matrix battles resolve before the timeout');
assert(totalDamage > 0, 'matrix produces meaningful combat damage');
assert(tacticSeconds.finish > 0 && tacticSeconds.protect > 0 && tacticSeconds.pressure > 0, 'matrix exercises finish, protect, and pressure intents');
assert(hardCcCasts > 0, 'matrix exercises hard-control decisions');
assert(hardCcOverlaps <= Math.max(8, Math.floor(hardCcCasts * 0.12)), 'hard-CC overlap stays bounded: ' + hardCcOverlaps + '/' + hardCcCasts);
assert(targetSwitches > 0, 'matrix exercises target switching and team retargeting');
console.log('\n✓ TACTICAL MATRIX REGRESSION PASSED');