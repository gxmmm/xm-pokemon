import assert from 'node:assert/strict';
import { BATTLE_MOVEMENT } from '@pokemon-online/config';
import { BattleSim, createWildInstance } from '@pokemon-online/engine';
import { isCellInArena, travelPathDistance } from '../packages/engine/src/grid.ts';

export function testBattleMovement(): void {
  const p = (x: number, y: number) => ({ x, y });
  assert.equal(travelPathDistance(p(0, 0), p(1, 1), p(0, 1), p(1, 0)), 0, 'crossing diagonals');
  assert.equal(travelPathDistance(p(0, 0), p(2, 0), p(1, 0), p(3, 0)), 0, 'following a still-occupied path');
  assert.equal(travelPathDistance(p(0, 0), p(1, 0), p(0, 1), p(1, 1)), 1, 'parallel lanes');
  assert.equal(travelPathDistance(p(0, 0), p(0, 0), p(1, 0), p(1, 0)), 1, 'stationary actors');
  assert(Math.abs(travelPathDistance(p(0, 0), p(1, 1), p(1, 0), p(1, 0)) - Math.SQRT1_2) < 1e-9, 'diagonal corner remains passable');
  const team = (ids: readonly number[], side: string) => ids.map((id, index) => ({ ...createWildInstance(id, 100, { rng: () => 0.5 }), uid: `${side}${index}` }));
  const cases = [[[6, 25, 94], [3, 9, 143]], [[68, 57, 76], [9, 143, 59]], [[6, 25, 94], [143]]] as const;
  const reports: unknown[] = [];
  for (const [player, enemy] of cases) for (const seed of [904, 905, 906]) for (const dt of [1 / 60, 0.05, 0.15]) {
    const sim = new BattleSim({ mode: enemy.length === 1 ? 'pve' : 'pvp', player: team(player, 'p'), enemy: team(enemy, 'e'), seed });
    let minimum = Infinity;
    let firstHit: number | undefined;
    while (sim.state.time < 120 && !sim.isOver) {
      const before = new Map(sim.state.combatants.map((c) => [c.uid, { ...c.pixel }]));
      sim.tick(dt);
      firstHit ??= sim.state.events.find((event) => event.type === 'damage')?.t;
      const alive = sim.state.combatants.filter((c) => c.alive);
      for (let i = 0; i < alive.length; i++) {
        const a = alive[i]!;
        assert(isCellInArena(a.position.x, a.position.y));
        for (const b of alive.slice(i + 1)) {
          const separation = Math.hypot(a.pixel.x - b.pixel.x, a.pixel.y - b.pixel.y);
          minimum = Math.min(minimum, separation);
          assert(separation >= BATTLE_MOVEMENT.pathClearance - 1e-7, `travel clearance at ${sim.state.time}: ${a.uid}/${b.uid} = ${separation}`);
          const fromA = before.get(a.uid)!, fromB = before.get(b.uid)!;
          const betweenFrames = travelPathDistance(p(fromA.x - fromB.x, fromA.y - fromB.y),
            p(a.pixel.x - b.pixel.x, a.pixel.y - b.pixel.y), p(0, 0), p(0, 0));
          assert(betweenFrames >= BATTLE_MOVEMENT.pathClearance - 1e-7, 'interpolated snapshots cannot cross between sampled frames');
          assert(a.position.x !== b.position.x || a.position.y !== b.position.y, 'no duplicate destination');
        }
      }
    }
    assert(firstHit !== undefined && firstHit < 5, `avoidance cannot stall the opening: ${JSON.stringify({ player, enemy, seed, dt, firstHit, units: sim.state.combatants.map(c => ({ uid: c.uid, pixel: c.pixel, cell: c.position })) })}`);
    assert(sim.isOver && sim.state.winner !== 'draw', `encounter timeout: ${JSON.stringify({ player, enemy, seed, dt, firstHit, units: sim.state.combatants.map(c => ({ uid: c.uid, hp: c.currentHp, cell: c.position, plan: c.plan })), recent: sim.state.events.slice(-3) })}`);
    if (dt === 0.05) reports.push({ player, enemy, seed, minimum: +minimum.toFixed(4), firstHit, duration: +sim.state.time.toFixed(2), winner: sim.state.winner });
  }
  const sim = new BattleSim({ mode: 'pvp', player: team([6], 'p'), enemy: team([9], 'e'), seed: 904 });
  const [actor, other] = sim.state.combatants;
  actor!.position = actor!.pixel = p(8, 7);
  other!.pixel = p(8, 8); other!.position = p(9, 7);
  const canStep = (cell: { x: number; y: number }) => (sim as unknown as { canStepTo(c: typeof actor, destination: { x: number; y: number }): boolean }).canStepTo(actor, cell);
  assert(!canStep(p(9, 8)), 'simulator rejects a free destination with a crossing path');
  other!.alive = false;
  assert(canStep(p(9, 8)), 'fainted units release their path immediately');
  other!.alive = true;
  other!.pixel = other!.position = p(8, 7);
  assert(canStep(p(9, 7)), 'a legacy overlapping formation can escape instead of deadlocking');
  other!.pixel = p(8.25, 7); other!.position = p(9, 7);
  assert(!canStep(p(10, 7)), 'already crowded actors cannot squeeze closer or cross through');
  assert(canStep(p(7, 7)), 'already crowded actors can separate');
  console.log('✓ engine swept-path clearance, 27 fixed encounters and no opening stalls', JSON.stringify(reports));
}
