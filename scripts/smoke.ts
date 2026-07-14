import { BattleSim, baseStat, createWildInstance, breed, createStarter, computeDamage, computeStats, applyExp, getAvailableEvolutions, rollEncounter, rollWildGroup, isHardCc, decide, mulberry32 } from '@pokemon-online/engine';
import { getSpecies, MAPS, getMap, SKILL_MAP, NORMAL_ATTACK, PASSIVE_SKILLS, SPECIES_LIST, SKILLS, skillRoleOf, SIGNATURE_SKILLS, COMBAT_ROLE_LABEL, sceneForNpc, sceneForObject, storyQuestLabel, visibleStoryNpcs, visibleStoryObjects, STORY_TRAINERS, isTideBlockedCell, isLowTideReefCell, isWalkable } from '@pokemon-online/config';
import { PASSIVE_SKILL_MAX, type BattleCombatant, type PokemonInstance } from '@pokemon-online/shared';
import { skillFxProfile } from '../apps/web/src/battle/BattleEffects.ts';
import { BattleActionTimeline } from '../apps/web/src/battle/BattleActions.ts';
import { contributionSummary, tacticPresentation } from '../apps/web/src/battle/CombatInsights.ts';

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
  assert(normal >= 15, `normal attack is not chip-only (${normal})`);
  assert(ember > normal, `super-effective active skill still beats normal attack (${ember}/${normal})`);
  assert(flamethrower < normal * 6, `high-power skill burst is compressed (${flamethrower}/${normal})`);
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
  assert(report.state.combatants.every((c) => c.damageDealt === c.normalDamage + c.skillDamage), 'recap splits total damage into normal and skill damage');
  assert(report.state.combatants.every((c) => Object.values(c.skillStats).reduce((sum, stat) => sum + stat.damage, 0) === c.damageDealt), 'per-skill recap damage sums to each Pokemon total');
  assert(report.state.combatants.every((c) => [c.damageTaken, c.healingDone, c.shieldAbsorbed, c.controlSeconds, c.interrupts, c.knockouts, c.skillCasts, c.normalAttacks, c.hits, c.misses, ...Object.values(c.skillStats).flatMap((stat) => [stat.casts, stat.hits, stat.misses, stat.damage])].every((value) => Number.isFinite(value) && value >= 0)), 'all personal recap metrics are valid non-negative values');
  console.log('✓ per-combatant battle recap:', dealt.join('/'));
}

// 3a2. Every active skill has a deterministic role/budget so tooltips and future
// balancing work from the same configured vocabulary.
{
  const roles = new Set(['fill', 'main', 'burst', 'area', 'control', 'support']);
  assert(SKILLS.every((skill) => roles.has(skillRoleOf(skill))), 'every configured skill has a balance role');
  assert(skillRoleOf(SKILL_MAP['ember']!) === 'fill' && skillRoleOf(SKILL_MAP['hyper-beam']!) === 'burst', 'damage skill budgets classify fill and burst moves');
  assert(skillRoleOf(SKILL_MAP['surf']!) === 'area' && skillRoleOf(SKILL_MAP['recover']!) === 'support' && skillRoleOf(SKILL_MAP['sleep-powder']!) === 'control', 'area, support, and control skills have distinct budgets');
  console.log('✓ skill balance budgets:', SKILLS.length);
}

// 3a3. First-wave species signatures are configuration-driven, show up in the
// learned skill list at their intended levels, and use real configured skills.
{
  const signatureIds = Object.keys(SIGNATURE_SKILLS).map(Number);
  assert(signatureIds.length === 12, 'first-wave signature roster contains 12 species');
  for (const speciesId of signatureIds) {
    const signature = SIGNATURE_SKILLS[speciesId]!;
    const species = getSpecies(speciesId);
    assert(species.signatureSkill === signature.skill && !!SKILL_MAP[signature.skill], `${species.name} has a valid configured signature skill`);
    assert(species.combatRole === signature.role && !!COMBAT_ROLE_LABEL[signature.role], `${species.name} has a visible combat role`);
    assert(species.learnset.some((entry) => entry.skill === signature.skill && entry.level === signature.level), `${species.name} learns its signature at the configured level`);
    const atLevel = createWildInstance(speciesId, signature.level);
    assert(atLevel.activeSkills.includes(signature.skill), `${species.name} keeps its signature equipped at the learned level`);
  }
  const pikachu = createWildInstance(25, 55);
  assert(pikachu.activeSkills.includes('volt-chain'), 'Pikachu equips Volt Chain at high level');
  console.log('✓ first-wave species signatures:', signatureIds.length);
}

// 3a4. Species combat roles are a tactical layer on top of personality: tanks
// hold the nearest line, burst users execute low HP, and area signatures are
// preferred when several enemies are present.
{
  const ready = (combatants: BattleCombatant[]) => {
    for (const combatant of combatants) for (const id of Object.keys(combatant.cooldowns)) combatant.cooldowns[id] = 0;
  };
  const tankSim = new BattleSim({ mode: 'pvp', player: [createWildInstance(143, 55)], enemy: [createWildInstance(150, 55), createWildInstance(25, 55)], isWild: false, seed: 211 });
  const tank = tankSim.state.combatants.find((c) => c.side === 'player')!;
  tank.personality = 'cool';
  tankSim.state.combatants.filter((c) => c.side === 'enemy')[0]!.position = { x: 8, y: 6 };
  tankSim.state.combatants.filter((c) => c.side === 'enemy')[1]!.position = { x: 14, y: 6 };
  const tankPlan = decide(tank, tankSim.state, mulberry32(1))!;
  assert(tankPlan.targetUid === tankSim.state.combatants.filter((c) => c.side === 'enemy')[0]!.uid, 'tank role prioritizes the nearest frontline target');

  const burstSim = new BattleSim({ mode: 'pvp', player: [createWildInstance(150, 55)], enemy: [createWildInstance(143, 55), createWildInstance(131, 55)], isWild: false, seed: 223 });
  const burst = burstSim.state.combatants.find((c) => c.side === 'player')!;
  burst.personality = 'cool';
  const burstEnemies = burstSim.state.combatants.filter((c) => c.side === 'enemy');
  burstEnemies[0]!.currentHp = Math.floor(burstEnemies[0]!.maxHp * 0.9);
  burstEnemies[1]!.currentHp = Math.floor(burstEnemies[1]!.maxHp * 0.12);
  const burstPlan = decide(burst, burstSim.state, mulberry32(2))!;
  assert(burstPlan.targetUid === burstEnemies[1]!.uid, 'burst role prioritizes a low-HP execution target');

  const areaSim = new BattleSim({ mode: 'pvp', player: [createWildInstance(25, 55)], enemy: [createWildInstance(6, 55), createWildInstance(9, 55), createWildInstance(3, 55)], isWild: false, seed: 227 });
  const area = areaSim.state.combatants.find((c) => c.side === 'player')!;
  area.personality = 'cool'; ready(areaSim.state.combatants);
  const areaPlan = decide(area, areaSim.state, mulberry32(3))!;
  assert(areaPlan.preferredSkillId === 'volt-chain', 'area role favors Pikachu signature against a clustered enemy team');

  const controlSim = new BattleSim({ mode: 'pvp', player: [createWildInstance(65, 55)], enemy: [createWildInstance(143, 55), createWildInstance(150, 55)], isWild: false, seed: 229 });
  const controller = controlSim.state.combatants.find((c) => c.side === 'player')!;
  controller.personality = 'cool'; ready(controlSim.state.combatants);
  const controlEnemies = controlSim.state.combatants.filter((c) => c.side === 'enemy');
  controlEnemies[0]!.position = { x: 8, y: 5 };
  controlEnemies[1]!.position = { x: 14, y: 5 };
  // Keep both large nukes outside the forecast window: this case isolates the
  // baseline control-role threat selector from the later cooldown-window test.
  controlEnemies[0]!.cooldowns['hyper-beam'] = 3;
  controlEnemies[1]!.cooldowns['psyonic-annihilation'] = 3;
  // Wild instance IVs vary by run, so force a strict threat ordering for this
  // selector test rather than relying on incidental generated stat rolls.
  controlEnemies[0]!.stats.atk = 50;
  controlEnemies[1]!.stats.atk = 200;
  const controlPlan = decide(controller, controlSim.state, mulberry32(4))!;
  assert(controlPlan.targetUid === controlEnemies[1]!.uid, 'control role selects the highest-attack threat');
  assert(controlPlan.desiredRangeCells > 1, 'control role maintains a ranged engagement band');

  const supportSim = new BattleSim({ mode: 'pvp', player: [createWildInstance(131, 55)], enemy: [createWildInstance(143, 55)], isWild: false, seed: 233 });
  const support = supportSim.state.combatants.find((c) => c.side === 'player')!;
  support.personality = 'cool'; ready(supportSim.state.combatants);
  support.currentHp = Math.floor(support.maxHp * 0.2);
  const supportPlan = decide(support, supportSim.state, mulberry32(5))!;
  assert(supportPlan.preferredSkillId === 'tidal-aegis', 'support role protects itself under lethal pressure');

  const bruiserSim = new BattleSim({ mode: 'pvp', player: [createWildInstance(149, 55)], enemy: [createWildInstance(131, 55), createWildInstance(25, 55)], isWild: false, seed: 239 });
  const bruiser = bruiserSim.state.combatants.find((c) => c.side === 'player')!;
  bruiser.personality = 'cool'; ready(bruiserSim.state.combatants);
  const bruiserEnemies = bruiserSim.state.combatants.filter((c) => c.side === 'enemy');
  bruiserEnemies[0]!.position = { x: 9, y: 5 };
  bruiserEnemies[1]!.position = { x: 14, y: 5 };
  const bruiserPlan = decide(bruiser, bruiserSim.state, mulberry32(6))!;
  assert(bruiserPlan.targetUid === bruiserEnemies[0]!.uid, 'bruiser role holds the nearest frontline target');
  assert(bruiserPlan.preferredSkillId === 'dragon-surge', 'bruiser role favors its melee signature');
  assert(bruiserPlan.desiredRangeCells === 1, 'bruiser role closes to melee distance');
  console.log('✓ species role AI tactics');
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

// 3ab1. Player-facing passive names and descriptions must never expose internal
// English type ids such as p-electricres / bug / electric.
{
  const elementalPassives = PASSIVE_SKILLS.filter((p) => p.id.endsWith('power') || p.id.endsWith('res'));
  const asciiTypeIds = /\b(normal|fire|water|grass|electric|ice|fighting|poison|ground|flying|psychic|bug|rock|ghost|dragon|dark|steel|fairy)\b/i;
  assert(elementalPassives.every((p) => !asciiTypeIds.test(`${p.name} ${p.description}`)), 'elemental passive display text is fully Chinese');
  const electricRes = PASSIVE_SKILLS.find((p) => p.id === 'p-electricres');
  assert(electricRes?.name === '电之抗' && electricRes.description.includes('电属性'), 'electric resistance has a Chinese name and detailed description');
  console.log('✓ localized elemental passive descriptions');
}

// 3ab2. Team tactics and post-battle contribution wording share the same
// player-facing vocabulary as the AI system; no raw internal enum leaks into UI.
{
  const protect = tacticPresentation({ kind: 'protect', targetUid: 'enemy', protectUid: 'ally', expiresAt: 2 });
  assert(protect?.label === '保护反制' && protect.description.includes('前排'), 'protect team tactic has a readable battlefield explanation');
  const tankText = contributionSummary({ role: 'tank', damage: 30, damageTaken: 180, healing: 0, shield: 0, control: 0, interrupts: 1, knockouts: 0 });
  const supportText = contributionSummary({ role: 'support', damage: 0, damageTaken: 30, healing: 120, shield: 60, control: 0, interrupts: 0, knockouts: 0 });
  const controlText = contributionSummary({ role: 'control', damage: 40, damageTaken: 50, healing: 0, shield: 0, control: 1.5, interrupts: 1, knockouts: 0 });
  assert(tankText.includes('前排承伤') && tankText.includes('打断'), 'tank contribution explains interception and interrupt value');
  assert(supportText.includes('治疗 120') && supportText.includes('护盾 60'), 'support contribution exposes sustain value');
  assert(controlText.includes('控制 1.5 秒') && controlText.includes('打断'), 'control contribution exposes control-chain value');
  console.log('✓ battle tactical presentation labels');
}

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

// 3ae1. Before individual plans are evaluated, a side now publishes a short
// shared intent: finish a low target, pressure the strongest threat, or protect
// an ally from a committed high-impact cast. Individual lane allocation can
// still split the third attacker, preventing formation pileups.
{
  const finishTeam = [createWildInstance(6, 42), createWildInstance(9, 42), createWildInstance(25, 42)];
  const finishEnemies = [createWildInstance(143, 42), createWildInstance(131, 42), createWildInstance(16, 42)];
  const finishSim = new BattleSim({ mode: 'pvp', player: finishTeam, enemy: finishEnemies, isWild: false, seed: 41 });
  const finishTarget = finishSim.state.combatants.find((combatant) => combatant.uid === finishEnemies[1]!.uid)!;
  finishTarget.currentHp = Math.floor(finishTarget.maxHp * 0.22);
  finishSim.tick(0.35);
  const finishIntent = finishSim.state.teamTactics.player;
  assert(finishIntent?.kind === 'finish' && finishIntent.targetUid === finishTarget.uid, 'team publishes a finish intent for an exposed low-HP enemy');
  const finishAssignments = finishSim.state.combatants.filter((combatant) => combatant.side === 'player' && combatant.currentTargetUid === finishTarget.uid).length;
  assert(finishAssignments >= 2, `team converts a finish intent into coordinated pressure (${finishAssignments} allies)`);

  const protectTeam = [createWildInstance(143, 50), createWildInstance(25, 50)];
  const protectEnemies = [createWildInstance(150, 50)];
  const protectSim = new BattleSim({ mode: 'pvp', player: protectTeam, enemy: protectEnemies, isWild: false, seed: 43 });
  const protector = protectSim.state.combatants.find((combatant) => combatant.uid === protectTeam[0]!.uid)!;
  const guarded = protectSim.state.combatants.find((combatant) => combatant.uid === protectTeam[1]!.uid)!;
  const caster = protectSim.state.combatants.find((combatant) => combatant.uid === protectEnemies[0]!.uid)!;
  const protectorStartX = protector.position.x;
  caster.currentTargetUid = guarded.uid;
  caster.castProgress = { skillId: 'psyonic-annihilation', remaining: 0.7 };
  protectSim.tick(0.05);
  const protectIntent = protectSim.state.teamTactics.player;
  assert(protectIntent?.kind === 'protect' && protectIntent.protectUid === guarded.uid && protectIntent.targetUid === caster.uid, 'team flags the ally under a major windup and its caster');
  assert(protector.currentTargetUid === caster.uid, 'frontline protector turns toward the threatening caster');
  assert(protector.position.x > protectorStartX, 'frontline protector steps toward the interception lane');

  const coverTeam = [createWildInstance(143, 50), createWildInstance(65, 50)];
  const coverEnemies = [createWildInstance(149, 50)];
  const coverSim = new BattleSim({ mode: 'pvp', player: coverTeam, enemy: coverEnemies, isWild: false, seed: 47 });
  const coverTank = coverSim.state.combatants.find((combatant) => combatant.uid === coverTeam[0]!.uid)!;
  const backliner = coverSim.state.combatants.find((combatant) => combatant.uid === coverTeam[1]!.uid)!;
  const diver = coverSim.state.combatants.find((combatant) => combatant.uid === coverEnemies[0]!.uid)!;
  coverTank.position = { x: 7, y: 6 };
  backliner.position = { x: 9, y: 6 };
  diver.position = { x: 10, y: 6 };
  const backlinerStartX = backliner.position.x;
  coverSim.tick(0.35);
  assert(backliner.plan?.positioning === 'backline' || backliner.currentTargetUid === diver.uid, 'control role receives a backline movement plan');
  assert(backliner.position.x < backlinerStartX, 'backline controller yields space behind its frontline cover');
  console.log('✓ team tactical intents and positioning');
}

// 3ae2. Control decisions consider both the enemy's next key cooldown and the
// remaining disable window: reserve a ready hard-CC for a looming nuke, but do
// not waste a second control while an ally's disable is still holding the target.
{
  const controllerInst = createWildInstance(65, 55);
  controllerInst.activeSkills = ['mind-lock', 'confusion'];
  const nukeInst = createWildInstance(150, 55);
  const windowSim = new BattleSim({ mode: 'pvp', player: [controllerInst], enemy: [nukeInst], isWild: false, seed: 53 });
  const controller = windowSim.state.combatants.find((combatant) => combatant.uid === controllerInst.uid)!;
  const nuke = windowSim.state.combatants.find((combatant) => combatant.uid === nukeInst.uid)!;
  controller.personality = 'cool';
  for (const combatant of windowSim.state.combatants) for (const id of Object.keys(combatant.cooldowns)) combatant.cooldowns[id] = 0;
  nuke.cooldowns['psyonic-annihilation'] = 0.8;
  const windowPlan = decide(controller, windowSim.state, mulberry32(53))!;
  assert(windowPlan.targetUid === nuke.uid && windowPlan.preferredSkillId === 'mind-lock', 'controller reserves hard CC for an impending high-impact cooldown');
  controller.currentTargetUid = nuke.uid;
  (windowSim as unknown as { resolveSkill: (c: BattleCombatant, id: string) => void }).resolveSkill(controller, 'mind-lock');
  assert(windowSim.state.events.some((event) => event.type === 'skill' && event.actor === controller.uid && event.skillId === 'mind-lock'), 'planned hard CC produces a concrete battle skill event');

  nuke.flinchUntil = windowSim.state.time + 0.9;
  nuke.ccIncomingUntil = windowSim.state.time + 0.9;
  const heldPlan = decide(controller, windowSim.state, mulberry32(54))!;
  assert(heldPlan.preferredSkillId !== 'mind-lock', 'controller avoids overlapping an already-secured control window');
  console.log('✓ control and cooldown windows');
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
  const towerSpecies = new Set<number>();
  assert(town.warps.some((w) => w.toMapId === 'illusion-tower-1' && w.transition === 'door'), 'town has an open illusion tower entrance');
  for (const [mapId, min, max] of bands) {
    const floor = getMap(mapId);
    assert(floor.encounterFloor && floor.encounters.length > 0, `${mapId} has floor encounters`);
    assert(floor.encounters.every((entry) => entry.minLevel === min && entry.maxLevel === max), `${mapId} uses its intended level band`);
    for (const entry of floor.encounters) towerSpecies.add(entry.speciesId);
    assert(isWalkable(floor.tiles[12]![8]!) && isWalkable(floor.tiles[11]![8]!), `${mapId} has a clear path from the lower stair`);
    if (mapId !== 'illusion-tower-5') assert(isWalkable(floor.tiles[1]![8]!) && isWalkable(floor.tiles[0]![8]!), `${mapId} has a clear path to the upper stair`);
  }
  assert(towerSpecies.size === SPECIES_LIST.length && SPECIES_LIST.every((species) => towerSpecies.has(species.id)), 'tower floors collectively cover the complete Pokedex');
  assert(getMap('illusion-tower-1').warps.some((w) => w.toMapId === 'illusion-tower-2'), 'tower first floor leads upward');
  assert(getMap('illusion-tower-5').warps.some((w) => w.toMapId === 'illusion-tower-4'), 'tower summit leads back downward');
  console.log('✓ illusion tower complete-Pokedex sandbox data');
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
  // A deterministic planned hard-CC cast is asserted above; these varied matchups are telemetry for interruption coordination.
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
