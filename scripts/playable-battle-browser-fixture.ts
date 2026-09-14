import { useGameStore } from '../apps/web/src/stores/game.ts';
import { useBattleStore } from '../apps/web/src/stores/battle.ts';
import { router } from '../apps/web/src/router.ts';
import { BattleSim, createWildInstance, maxHp, markOwned } from '@pokemon-online/engine';
import { PASSIVE_SKILLS } from '@pokemon-online/config';

let frameTime = 0;
const originalFrame = window.requestAnimationFrame.bind(window);
window.requestAnimationFrame = (callback) => originalFrame((now) => { frameTime = now; callback(now); });
let speedSamples: number[] = [];
export function resetSpeedSamples(): void { speedSamples = []; }

export async function prepareWeather(): Promise<void> {
  const battle = useBattleStore();
  const player = {...createWildInstance(68,50,{rng:()=>.5}),uid:'weather-player',ability:'guts',passiveSkills:[]};
  const enemy = {...createWildInstance(10,50,{rng:()=>.5}),uid:'weather-enemy',ability:'keen-eye',passiveSkills:[]};
  battle.sim = new BattleSim({mode:'pvp',player:[player],enemy:[enemy],seed:4242});
  battle.mode = 'pvp'; battle.phase = 'fighting'; battle.assetsReady = true;
  const sim = battle.sim;
  for (const c of sim.state.combatants) { c.actionLockRemaining = 1000; c.actionReadyRemaining = 1000; c.ability = 'keen-eye'; c.passiveSkills = []; }
  sim.setWeather('rain','天气验收',120);
  await router.push({name:'battle'});
}
export function weatherSample(kind: 'sun'|'rain'|'snow'|'sand', status: boolean): void {
  const sim = useBattleStore().sim!;
  const actor = sim.state.combatants[0]!;
  actor.ability = 'guts'; actor.status = status ? 'poison' : null; actor.statusTimer = status ? 30 : 0;
  sim.setWeather(kind,'天气验收',120);
}

// Imported only by the isolated Vite browser report, never by production routes.
export async function prepare(outcome: 'win' | 'loss' | 'long' | 'natural', speed: number, activeBattle = false): Promise<void> {
  const game = useGameStore();
  const battle = useBattleStore();
  if (!game.save) throw new Error('Fixture requires an authenticated isolated save');
  const players = [6, 9, 3].map((id) => createWildInstance(id, outcome === 'loss' ? 5 : 70, { rng: () => 0.5 }));
  const enemies = [10, 13, 16].map((id) => createWildInstance(id, outcome === 'win' || outcome === 'natural' ? 5 : 70, { rng: () => 0.5 }));
  if (outcome === 'natural') enemies.forEach((p) => { p.currentHp = 1; });
  game.save.roster = players.map((p) => p.uid);
  game.save.instances = Object.fromEntries(players.map((p) => [p.uid, p]));
  game.save.pveTeam = [...game.save.roster];
  game.save.pvpTeam = [...game.save.roster];
  game.save.settings.battleSpeed = speed;
  game.save.currentMapId = 'illusion-tower-1';
  game.save.position = { x: 8, y: 11, facing: 'up' };
  battle.startWild(enemies, 'illusion-tower-1');
  battle.sim = BattleSim.fromInstances({ mode: 'pve', player: players, enemy: enemies, speed, isWild: true, seed: 4242 });
  if (outcome === 'long') battle.sim.state.combatants.forEach((c) => { c.maxHp *= 5; c.currentHp = c.maxHp; });
  let previousFrame: number | undefined;
  const tick = battle.sim.tick.bind(battle.sim);
  battle.sim.tick = (dt: number) => {
    if (previousFrame !== undefined && frameTime > previousFrame) {
      speedSamples.push(dt / Math.min(0.05, (frameTime - previousFrame) / 1000));
    }
    previousFrame = frameTime;
    tick(dt);
  };
  if (activeBattle) { battle.phase = 'fighting'; battle.assetsReady = true; }
  await router.push({ name: 'battle' });
}

export function read() {
  const game = useGameStore();
  const battle = useBattleStore();
  return {
    time: battle.sim?.state.time,
    phase: battle.phase,
    combatants: battle.sim?.state.combatants.map(c => ({ uid: c.uid, hp: c.currentHp, alive: c.alive, cast: c.castProgress, plan: c.plan })),
    observedAt: performance.now(),
    speedSamples: [...speedSamples],
    winner: battle.sim?.state.winner,
    over: battle.sim?.isOver,
    stats: { ...game.save!.stats },
    roster: [...game.save!.roster],
    map: game.save!.currentMapId,
    position: { ...game.save!.position },
    healed: game.rosterInstances.every((p) => p.currentHp === maxHp(p) && p.status === null),
    experience: game.rosterInstances.map((p) => ({ uid: p.uid, exp: p.exp })),
  };
}

export async function prepareEndingDuringCast(): Promise<void> {
  await prepare('natural', 1, true);
  const sim = useBattleStore().sim!, actor = sim.state.combatants[0]!;
  actor.castProgress = { skillId: 'hyper-beam', remaining: 60 };
  actor.currentTargetUid = sim.state.combatants.find(c => c.side === 'enemy')!.uid;
  actor.castAim = { ...sim.state.combatants.find(c => c.side === 'enemy')!.pixel };
}


export async function visit(path: string): Promise<void> { await router.push(path); }

/** Paused presentation fixtures exercise the actual route without production debug hooks. */
export function pinHud(cleared = false): void {
  const team = (ids: number[], side: string) => ids.map((id, i) => ({ ...createWildInstance(id, 70, { rng: () => 0.5 }), uid: `hud-${side}-${i}` }));
  const sim = new BattleSim({ mode: 'pve', player: team([6, 25, 94], 'p'), enemy: team([3, 9, 143], 'e'), seed: 4242 });
  sim.state.combatants.forEach((c, i) => {
    c.maxHp = 1000; c.currentHp = i === 0 ? 200 : i === 5 ? 0 : 750;
    c.name = i === 0 ? '训练家的喷火龙超长昵称' : c.name;
    c.activeSkills = ['hyper-beam', 'fire-blast', 'thunderbolt', 'hydro-pump'];
    c.cooldowns = { 'hyper-beam': 0, 'fire-blast': 4.2, thunderbolt: 0.3, 'hydro-pump': 0 };
    if (c.basicSkillId) c.cooldowns[c.basicSkillId] = .7;
    c.alive = i !== 5;
    c.castProgress = i === 0 || i === 5 ? { skillId: 'hyper-beam', remaining: 0.3 } : null;
    c.status = (['burn', 'burn', 'sleep', 'freeze', 'paralyze', 'confuse'] as const)[i]!;
    c.statusTimer = 4;
    c.flinchUntil = i === 1 ? 2.5 : 0;
    if (cleared) { c.alive = true; c.currentHp = 1000; c.status = null; c.statusTimer = 0; c.flinchUntil = 0; c.castProgress = null; }
  });
  useBattleStore().sim = sim;
}

export function interruptHud(): void {
  const sim = useBattleStore().sim!;
  const c = sim.state.combatants[0]!;
  c.castProgress = null;
  sim.state.events.push({ t: sim.state.time, seq: Math.max(0, ...sim.state.events.map((e) => e.seq ?? 0)) + 1,
    type: 'info', actor: c.uid, skillId: 'hyper-beam', vfx: { kind: 'interrupt' },
    control: { uid: c.uid, at: sim.state.time, status: c.status, statusTimer: c.statusTimer, flinchUntil: 0, castProgress: null } });
}

export async function prepareCollection(): Promise<string> {
  const game = useGameStore();
  const pet = createWildInstance(1, 70);
  pet.origin = 'bred';
  pet.passiveSkills = PASSIVE_SKILLS.slice(0, 24).map((p) => p.id);
  game.save!.instances[pet.uid] = pet;
  game.save!.roster.push(pet.uid);
  markOwned(game.save!, pet.speciesId);
  return pet.uid;
}
