import { BattleSim, baseStat, createWildInstance, breed, createStarter, computeDamage, computeStats, applyExp, getAvailableEvolutions, rollEncounter, rollWildGroup, isHardCc } from '@pokemon-online/engine';
import { getSpecies, MAPS, getMap, SKILL_MAP, NORMAL_ATTACK, PASSIVE_SKILLS, sceneForNpc, sceneForObject, storyQuestLabel, visibleStoryNpcs, visibleStoryObjects, STORY_TRAINERS, isTideBlockedCell, isLowTideReefCell, isWalkable } from '@pokemon-online/config';
import { PASSIVE_SKILL_MAX, type BattleCombatant, type PokemonInstance } from '@pokemon-online/shared';
import { skillFxProfile } from '../apps/web/src/battle/BattleEffects.ts';
import { BattleActionTimeline } from '../apps/web/src/battle/BattleActions.ts';

function assert(cond: boolean, msg: string): void {
  if (!cond) { console.error('✗ ASSERT FAIL:', msg); process.exit(1); }
}

// 1. stats
const starter = createStarter(6); // Charizard
const stats = computeStats(starter);
assert(stats.hp > 0 && stats.atk > 0, 'stats positive');
console.log('✓ stats:', stats);

// 1a. Base stats define the starting panel only. Level growth is IV-led, so a
// high-IV Pokemon gains a visibly larger advantage as it is trained.
{
  const fixedIv = { hp: 20, atk: 20, def: 20, spd: 20 };
  const lowLevelBaseGap = baseStat(6, fixedIv, 1, 5, 'atk') - baseStat(1, fixedIv, 1, 5, 'atk');
  const highLevelBaseGap = baseStat(6, fixedIv, 1, 50, 'atk') - baseStat(1, fixedIv, 1, 50, 'atk');
  assert(lowLevelBaseGap === highLevelBaseGap, 'species base contributes a fixed initial-panel gap across levels');
  const lowIv = { hp: 1, atk: 1, def: 1, spd: 1 };
  const highIv = { hp: 31, atk: 31, def: 31, spd: 31 };
  const lowLevelIvGap = baseStat(6, highIv, 1, 5, 'atk') - baseStat(6, lowIv, 1, 5, 'atk');
  const highLevelIvGap = baseStat(6, highIv, 1, 50, 'atk') - baseStat(6, lowIv, 1, 50, 'atk');
  assert(highLevelIvGap > lowLevelIvGap * 5, 'IV has a substantially larger impact at higher levels');
  console.log(`✓ IV-led stat growth: base gap=${lowLevelBaseGap}, IV gap ${lowLevelIvGap}->${highLevelIvGap}`);
}

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

// 3a0. First-pass attack balance: a neutral normal attack remains meaningful,
// while type advantage belongs to active skills and no longer multiplies normal
// attacks. Seeded rolls prevent crits and random variance from hiding regressions.
{
  const balance = new BattleSim({ mode: 'pvp', player: [createWildInstance(6, 50)], enemy: [createWildInstance(1, 50)], isWild: false, seed: 83 });
  const attacker = balance.state.combatants.find((c) => c.side === 'player')!;
  const defender = balance.state.combatants.find((c) => c.side === 'enemy')!;
  const normal = computeDamage(attacker, defender, NORMAL_ATTACK, () => 0.5).damage;
  const ember = computeDamage(attacker, defender, SKILL_MAP['ember']!, () => 0.5).damage;
  const flamethrower = computeDamage(attacker, defender, SKILL_MAP['flamethrower']!, () => 0.5).damage;
  assert(normal >= 20, `normal attack is not chip-only (${normal})`);
  assert(ember > normal, `super-effective active skill still beats normal attack (${ember}/${normal})`);
  assert(flamethrower < normal * 5, `high-power skill burst is compressed (${flamethrower}/${normal})`);
  assert(NORMAL_ATTACK.cooldown < SKILL_MAP['ember']!.cooldown, 'normal attack recovers faster than starter damage skills');
  console.log(`✓ attack balance: normal=${normal}, ember=${ember}, flamethrower=${flamethrower}`);
}

// 3a1. Damage is accumulated per combatant for the post-battle report, including
// a fighter that faints before the battle ends.
{
  const report = new BattleSim({ mode: 'pvp', player: [createWildInstance(6, 45)], enemy: [createWildInstance(1, 45)], isWild: false, seed: 97 });
  report.resolve(120);
  const dealt = report.state.combatants.map((c) => c.damageDealt);
  assert(dealt.some((damage) => damage > 0), 'combatants retain independently tracked damage totals');
  assert(dealt.every((damage) => Number.isFinite(damage) && damage >= 0), 'per-combatant damage totals are valid');
  console.log('✓ per-combatant damage report:', dealt.join('/'));
}

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

// 3ac. Static sprites receive short, event-driven action poses rather than
// continuous idle bobbing: melee gets anticipation/lunge; projectiles get a
// local launch anchor in front of the caster.
{
  const timeline = new BattleActionTimeline();
  const points: Record<string, { x: number; y: number }> = { actor: { x: 100, y: 120 }, target: { x: 220, y: 120 } };
  timeline.consume([{ t: 0, seq: 1, type: 'skill', actor: 'actor', target: 'target', skillId: 'dragon-claw', vfx: { kind: 'melee', type: 'dragon' } }], (uid) => uid ? points[uid] ?? null : null);
  timeline.update(0.18);
  const pose = timeline.poseOf('actor');
  assert(Math.abs(pose.dx) > 0.1 && timeline.isActive(), 'melee action has a bounded lunge pose');
  const anchor = timeline.anchorOf('actor', 'projectile', points.actor)!;
  assert(anchor.x > points.actor.x, 'projectile anchor is in front of caster');
  console.log('✓ event-driven action timeline');
}

// 3ad. Casts are committed, readable actions: starting a windup immediately
// locks both logical and rendered positions until the skill resolves or is interrupted.
{
  const casterInst = [6, 36, 73, 130, 143, 149, 150, 151]
    .map((speciesId) => createWildInstance(speciesId, 55))
    .find((instance) => instance.activeSkills.some((id) => (SKILL_MAP[id]?.castTime ?? 0) > 0));
  assert(!!casterInst, 'test roster includes a windup skill');
  const targetInst = createWildInstance(25, 30);
  const castSim = new BattleSim({ mode: 'pvp', player: [casterInst!], enemy: [targetInst], isWild: false, seed: 19 });
  const caster = castSim.state.combatants.find((c) => c.uid === casterInst!.uid)!;
  const target = castSim.state.combatants.find((c) => c.uid === targetInst.uid)!;
  caster.position = { x: 5, y: 6 };
  caster.pixel = { x: 4.2, y: 5.4 };
  target.position = { x: 9, y: 6 };
  target.pixel = { x: 9, y: 6 };
  const windupId = caster.activeSkills.find((id) => (SKILL_MAP[id]?.castTime ?? 0) > 0)!;
  (castSim as unknown as { startCast: (c: BattleCombatant, id: string) => void }).startCast(caster, windupId);
  assert(!!caster.castProgress && caster.pixel.x === caster.position.x && caster.pixel.y === caster.position.y, 'starting a cast snaps and locks render position');
  const locked = { ...caster.position };
  castSim.tick(0.05);
  assert(caster.position.x === locked.x && caster.position.y === locked.y && !!caster.castProgress, 'caster cannot move during windup');
  console.log('✓ cast lock and windup state');
}

// 3ad. Being hit makes only the nearest-ready skill recover faster. It gives
// reactive casts without collapsing every active cooldown into one burst.
{
  const attackerInst = createWildInstance(6, 35);
  const defenderInst = createWildInstance(25, 35);
  const cdSim = new BattleSim({ mode: 'pvp', player: [attackerInst], enemy: [defenderInst], isWild: false, seed: 29 });
  const attacker = cdSim.state.combatants.find((c) => c.uid === attackerInst.uid)!;
  const defender = cdSim.state.combatants.find((c) => c.uid === defenderInst.uid)!;
  const ids = defender.activeSkills.slice(0, 2);
  assert(ids.length >= 2, 'cooldown test defender has two active skills');
  defender.cooldowns[ids[0]!] = 2;
  defender.cooldowns[ids[1]!] = 5;
  const beforeNear = defender.cooldowns[ids[0]!];
  const beforeFar = defender.cooldowns[ids[1]!];
  (cdSim as unknown as { dealDamage: (a: BattleCombatant, d: BattleCombatant, id: string) => unknown }).dealDamage(attacker, defender, '__normal__');
  assert(defender.cooldowns[ids[0]!] < beforeNear && defender.cooldowns[ids[1]!] === beforeFar, 'damage advances only the nearest-ready skill cooldown');
  console.log('✓ reactive cooldown recovery');
}

// 3ae. A healthy 3v3 distributes ordinary target assignments so allies do not
// all path into one opponent's melee ring and form an immobile pile.
{
  const teamA = [createWildInstance(6, 32), createWildInstance(9, 32), createWildInstance(25, 32)];
  const teamB = [createWildInstance(16, 32), createWildInstance(41, 32), createWildInstance(52, 32)];
  const laneSim = new BattleSim({ mode: 'pvp', player: teamA, enemy: teamB, isWild: false, seed: 37 });
  laneSim.tick(0.35);
  const playerTargets = laneSim.state.combatants.filter((combatant) => combatant.side === 'player').map((combatant) => combatant.currentTargetUid).filter((uid): uid is string => !!uid);
  const largestAssignment = Math.max(...Array.from(new Set(playerTargets)).map((uid) => playerTargets.filter((target) => target === uid).length));
  assert(largestAssignment <= 2, `healthy allies distribute targets (largest assignment=${largestAssignment})`);
  console.log('✓ ally lane allocation');
}

// 3af. Original story data: the opening scene points the player toward the
// rival, and the rival becomes available only after the researcher briefing.
{
  const opening = { flags: [], activeQuest: 'meet-professor', completedQuests: [] };
  assert(visibleStoryNpcs('pallet', opening).some((n) => n.id === 'professor-lan'), 'opening researcher is visible');
  assert(!visibleStoryNpcs('pallet', opening).some((n) => n.id === 'rival-baiye'), 'rival waits for researcher briefing');
  const briefing = sceneForNpc('professor-lan', opening);
  assert(briefing.activeQuest === 'challenge-baiye' && (briefing.grantFlags ?? []).includes('professor_briefed'), 'researcher advances opening quest');
  const briefed = { ...opening, flags: ['professor_briefed'], activeQuest: 'challenge-baiye' };
  assert(visibleStoryNpcs('pallet', briefed).some((n) => n.id === 'rival-baiye'), 'rival appears after briefing');
  assert(storyQuestLabel('investigate-firefly').includes('萤火林道'), 'story objective label is present');
  console.log('✓ original story opening data');
}

// 3ad. Chapter-two story progression: the three ordered light clues reveal a
// visible trainer trial, whose victory then reveals the anomaly-core battle.
{
  const state = { flags: ['rival_defeated', 'firefly_signal_found'], activeQuest: 'mistwood-open', completedQuests: [] };
  assert(visibleStoryObjects('viridian-forest', state).some((o) => o.id === 'lumen-1'), 'first lumen is visible');
  const first = sceneForObject('lumen-1', state);
  assert((first.grantFlags ?? []).includes('lumen_1'), 'first lumen grants ordered flag');
  const afterOne = { ...state, flags: [...state.flags, 'lumen_1'] };
  assert(visibleStoryObjects('viridian-forest', afterOne).some((o) => o.id === 'lumen-2'), 'second lumen follows first');
  const afterThree = { ...state, flags: [...state.flags, 'lumen_1', 'lumen_2', 'lumen_3'] };
  assert(visibleStoryNpcs('viridian-forest', afterThree).some((n) => n.id === 'mist-runner'), 'trial trainer appears after all lumens');
  assert(STORY_TRAINERS['mist-runner-trial']?.questAfter === 'confront-anomaly', 'trial points to anomaly objective');
  const afterTrial = { ...afterThree, flags: [...afterThree.flags, 'mist_runner_defeated'] };
  assert(visibleStoryObjects('viridian-forest', afterTrial).some((o) => o.id === 'anomaly-core'), 'anomaly core appears after trial');
  assert(sceneForObject('anomaly-core', afterTrial).choices?.some((c) => c.battleId === 'anomaly-core'), 'anomaly core launches a story battle');
  const calm = { ...afterTrial, flags: [...afterTrial.flags, 'anomaly_calm'] };
  assert((sceneForNpc('professor-lan', calm).grantFlags ?? []).includes('chapter_one_complete'), 'professor closes chapter one after anomaly');
  console.log('✓ original story chapter two data');
}

// 3ae. Chapter-three story: returning with the calm tide opens the starfall
// route; ordered star marks open the cartographer trial and then the star lens.
{
  const base = { flags: ['rival_defeated', 'firefly_signal_found', 'lumen_1', 'lumen_2', 'lumen_3', 'mist_runner_defeated', 'anomaly_calm', 'chapter_one_complete'], activeQuest: 'climb-starfell', completedQuests: [] };
  assert(visibleStoryObjects('route3', base).some((o) => o.id === 'star-1'), 'first star mark is visible');
  const starOne = sceneForObject('star-1', base);
  assert((starOne.grantFlags ?? []).includes('star_1') && starOne.activeQuest === 'read-stars', 'first star mark advances route puzzle');
  const stars = { ...base, flags: [...base.flags, 'star_1', 'star_2', 'star_3'] };
  assert(visibleStoryNpcs('mt-moon', stars).some((n) => n.id === 'sky-cartographer'), 'cartographer appears after three star marks');
  assert(STORY_TRAINERS['cartographer-trial']?.questAfter === 'align-lens', 'cartographer points to lens alignment');
  const trialWon = { ...stars, flags: [...stars.flags, 'cartographer_defeated'] };
  assert(visibleStoryObjects('mt-moon', trialWon).some((o) => o.id === 'observatory-lens'), 'star lens appears after cartographer trial');
  assert(sceneForObject('observatory-lens', trialWon).choices?.some((c) => c.battleId === 'observatory-lens'), 'lens launches chapter-three boss battle');
  console.log('✓ original story chapter three data');
}

// 3af. Tide-island chapter: the tide instrument exposes a real walkable reef
// shelf, reveals the ship log, then unlocks the tide-cave anchor and deep-space gate.
{
  const base = { flags: ['lens_aligned'], activeQuest: 'eastbound-signal', completedQuests: [], tide: 'high' as const };
  assert(visibleStoryNpcs('sea-route', base).some((n) => n.id === 'tide-captain'), 'tide captain appears after lens alignment');
  const captain = sceneForNpc('tide-captain', base);
  assert((captain.grantFlags ?? []).includes('tide_briefed'), 'captain introduces tide puzzle');
  const briefed = { ...base, flags: [...base.flags, 'tide_briefed'] };
  assert(visibleStoryObjects('sea-route', briefed).some((o) => o.id === 'tide-gauge'), 'tide gauge appears after captain briefing');
  const tideScene = sceneForObject('tide-gauge', briefed);
  assert(tideScene.choices?.some((c) => c.kind === 'set-tide' && c.tide === 'low'), 'tide gauge offers low tide');
  assert(isTideBlockedCell('sea-route', 10, 4, 'high') && !isTideBlockedCell('sea-route', 10, 4, 'low') && isLowTideReefCell('sea-route', 10, 4), 'reef shelf changes walkability by tide');
  const low = { ...briefed, flags: [...briefed.flags, 'tide_low'], tide: 'low' as const, activeQuest: 'find-ship-log' };
  assert(visibleStoryObjects('sea-route', low).some((o) => o.id === 'ship-log'), 'ship log appears at low tide');
  const log = sceneForObject('ship-log', low);
  assert((log.grantFlags ?? []).includes('ship_log_found'), 'ship log points into tide cave');
  const logFound = { ...low, flags: [...low.flags, 'ship_log_found'] };
  assert(visibleStoryNpcs('dragon-den', logFound).some((n) => n.id === 'reef-keeper'), 'tide keeper appears with log');
  const trialWon = { ...logFound, flags: [...logFound.flags, 'reef_trial_won'] };
  assert(visibleStoryObjects('dragon-den', trialWon).some((o) => o.id === 'tide-anchor'), 'tide anchor appears after reef trial');
  const calm = { ...trialWon, flags: [...trialWon.flags, 'deep_anchor_calm'] };
  assert(visibleStoryObjects('dragon-den', calm).some((o) => o.id === 'deep-space-gate'), 'deep-space gate appears after anchor boss');
  assert(sceneForObject('deep-space-gate', calm).choices?.some((c) => c.kind === 'warp' && c.mapId === 'deep-space'), 'deep-space gate warps to next region');
  console.log('✓ original story tide-island data');
}

// 3ag. Deep-space chapter: three gravity nodes wake the terminal, which summons
// the rift guardian and then reveals a non-capturable legendary-related echo.
{
  const arrived = { flags: ['deep_anchor_calm'], activeQuest: 'deep-space-gate', completedQuests: [], tide: 'low' as const };
  assert(visibleStoryObjects('deep-space', arrived).some((o) => o.id === 'gravity-node-1'), 'first gravity node appears after entering deep space');
  const nodeOne = sceneForObject('gravity-node-1', arrived);
  assert((nodeOne.grantFlags ?? []).includes('gravity_node_1') && nodeOne.activeQuest === 'stabilize-gravity', 'first gravity node starts stabilization puzzle');
  const nodeOneSet = { ...arrived, flags: [...arrived.flags, 'gravity_node_1'] };
  assert(visibleStoryObjects('deep-space', nodeOneSet).some((o) => o.id === 'gravity-node-2'), 'second gravity node follows first');
  const nodeTwoSet = { ...nodeOneSet, flags: [...nodeOneSet.flags, 'gravity_node_2'] };
  assert(visibleStoryObjects('deep-space', nodeTwoSet).some((o) => o.id === 'gravity-node-3'), 'third gravity node follows second');
  const stabilized = { ...nodeTwoSet, flags: [...nodeTwoSet.flags, 'gravity_node_3'] };
  assert(visibleStoryObjects('deep-space', stabilized).some((o) => o.id === 'ancient-terminal'), 'terminal appears after all gravity nodes');
  const terminal = sceneForObject('ancient-terminal', stabilized);
  assert((terminal.grantFlags ?? []).includes('terminal_awakened') && terminal.activeQuest === 'face-rift-guardian', 'terminal activates guardian objective');
  const awakened = { ...stabilized, flags: [...stabilized.flags, 'terminal_awakened'] };
  assert(visibleStoryObjects('deep-space', awakened).some((o) => o.id === 'rift-heart'), 'rift guardian appears after terminal activation');
  assert(sceneForObject('rift-heart', awakened).choices?.some((c) => c.battleId === 'rift-heart'), 'rift guardian launches chapter boss battle');
  assert(STORY_TRAINERS['rift-heart']?.questAfter === 'follow-legend-echo', 'guardian victory points to legend echo');
  const guardianCalm = { ...awakened, flags: [...awakened.flags, 'rift_guardian_calm'] };
  assert(visibleStoryObjects('deep-space', guardianCalm).some((o) => o.id === 'legend-echo'), 'legend echo appears after guardian battle');
  const echo = sceneForObject('legend-echo', guardianCalm);
  assert((echo.grantFlags ?? []).includes('deep_space_chapter_complete') && echo.choices?.some((c) => c.kind === 'warp' && c.mapId === 'pallet'), 'legend echo closes chapter and offers return');
  console.log('✓ original story deep-space data');
}

// 3ah. Illusion tower: the town-side sandbox has five linked floors with
// intentionally escalating encounter bands for battle, capture, and breeding tests.
{
  const bands: [string, number, number][] = [
    ['illusion-tower-1', 5, 10], ['illusion-tower-2', 12, 18], ['illusion-tower-3', 20, 28],
    ['illusion-tower-4', 30, 40], ['illusion-tower-5', 45, 55],
  ];
  const town = getMap('pallet');
  assert(town.warps.some((w) => w.toMapId === 'illusion-tower-1' && w.transition === 'door'), 'town has an open illusion tower entrance');
  for (const [mapId, min, max] of bands) {
    const floor = getMap(mapId);
    assert(floor.encounterFloor && floor.encounters.length > 0, `${mapId} has floor encounters`);
    assert(floor.encounters.every((entry) => entry.minLevel >= min && entry.maxLevel <= max), `${mapId} uses its intended level band`);
    assert(isWalkable(floor.tiles[12]![8]!) && isWalkable(floor.tiles[11]![8]!), `${mapId} has a clear path from the lower stair`);
    if (mapId !== 'illusion-tower-5') assert(isWalkable(floor.tiles[1]![8]!) && isWalkable(floor.tiles[0]![8]!), `${mapId} has a clear path to the upper stair`);
  }
  assert(getMap('illusion-tower-1').warps.some((w) => w.toMapId === 'illusion-tower-2'), 'tower first floor leads upward');
  assert(getMap('illusion-tower-5').warps.some((w) => w.toMapId === 'illusion-tower-4'), 'tower summit leads back downward');
  console.log('✓ illusion tower sandbox data');
}

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

// 4a. The passive catalogue must have enough distinct skills for the configured
// 24-slot breeding cap. Two full parents must also be able to reach that cap.
{
  const allPassiveIds = PASSIVE_SKILLS.map((p) => p.id);
  assert(allPassiveIds.length >= PASSIVE_SKILL_MAX, `passive catalogue supports ${PASSIVE_SKILL_MAX} distinct slots`);
  const makeParent = (uid: string, passiveSkills: string[]): PokemonInstance => ({
    ...createStarter(1), uid, passiveSkills,
  });
  const main = makeParent('passive-main', allPassiveIds.slice(0, PASSIVE_SKILL_MAX));
  const sub = makeParent('passive-sub', allPassiveIds.slice(0, PASSIVE_SKILL_MAX));
  const originalRandom = Math.random;
  Math.random = () => 0; // all inheritance rolls succeed; species inherits main
  try {
    const fullPassiveOffspring = breed(main, sub).offspring;
    assert(fullPassiveOffspring.passiveSkills.length === PASSIVE_SKILL_MAX, `breeding reaches the ${PASSIVE_SKILL_MAX}-passive cap`);
    assert(new Set(fullPassiveOffspring.passiveSkills).size === PASSIVE_SKILL_MAX, 'bred passives are unique at cap');
  } finally {
    Math.random = originalRandom;
  }
  console.log(`✓ breeding passive cap: ${PASSIVE_SKILL_MAX}`);
}

// 4b. Model selection and passive inheritance are intentionally separate:
// species rolls main 65% / sub 35%, then non-intrinsic union skills roll 55%.
{
  const main = { ...createStarter(1), uid: 'inherit-main', passiveSkills: ['p-power'] };
  const sub = { ...createStarter(7), uid: 'inherit-sub', passiveSkills: ['p-iron'] };
  const originalRandom = Math.random;
  let rolls = 0;
  // breed consumes rolls for species, IVs, growth, personality, ability,
  // mutation, and shuffle before it starts the two passive inheritance rolls.
  Math.random = () => [...Array(10).fill(0.5), 0.6][rolls++] ?? 0.6;
  try {
    const offspring = breed(main, sub).offspring;
    assert(offspring.speciesId === main.speciesId, 'main species is selected by the 65% model roll');
    assert(offspring.passiveSkills.includes('p-power'), 'first non-intrinsic union passive is retained at 55%');
    assert(!offspring.passiveSkills.includes('p-iron'), 'second non-intrinsic union passive is not retained above 55%');
  } finally {
    Math.random = originalRandom;
  }
  console.log('✓ breeding passive inheritance: union 55% independent of model roll');
}

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
