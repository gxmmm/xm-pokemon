import { useGameStore } from '../apps/web/src/stores/game.ts';
import { useBattleStore } from '../apps/web/src/stores/battle.ts';
import { router } from '../apps/web/src/router.ts';
import { BattleSim, createWildInstance, maxHp } from '@pokemon-online/engine';

let frameTime = 0;
const originalFrame = window.requestAnimationFrame.bind(window);
window.requestAnimationFrame = (callback) => originalFrame((now) => { frameTime = now; callback(now); });
let speedSamples: number[] = [];
export function resetSpeedSamples(): void { speedSamples = []; }

// Imported only by the isolated Vite browser report, never by production routes.
export async function prepare(outcome: 'win' | 'loss' | 'long' | 'natural', speed: number): Promise<void> {
  const game = useGameStore();
  const battle = useBattleStore();
  if (!game.save) throw new Error('Fixture requires an authenticated isolated save');
  const players = [6, 9, 3].map((id) => createWildInstance(id, outcome === 'loss' ? 5 : 70));
  const enemies = [10, 13, 16].map((id) => createWildInstance(id, outcome === 'win' || outcome === 'natural' ? 5 : 70));
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
  await router.push({ name: 'battle' });
}

export function read() {
  const game = useGameStore();
  const battle = useBattleStore();
  return {
    time: battle.sim?.state.time,
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
