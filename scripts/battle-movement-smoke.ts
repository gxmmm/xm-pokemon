import assert from 'node:assert/strict';
import { BATTLE_MOVEMENT } from '@pokemon-online/config';
import { BattleSim, createWildInstance } from '@pokemon-online/engine';
import { distCells, findGridApproachStep, isCellInArena, travelPathDistance } from '../packages/engine/src/grid.ts';

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
          if (a.side === b.side) assert(distCells(a.position, b.position) >= BATTLE_MOVEMENT.allyDestinationClearance,
            'default formations retain allied destination clearance throughout combat');
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
  actor!.position = actor!.pixel = p(8, 7);
  other!.position = other!.pixel = p(10, 7);
  assert(canStep(p(9, 7)), 'opponents may still enter orthogonal melee reach');
  assert(canStep(p(9, 8)), 'opponents may still enter diagonal melee reach');
  other!.side = actor!.side;
  assert(!canStep(p(9, 7)), 'allies cannot reserve adjacent stops');
  assert(!canStep(p(9, 8)), 'allies cannot reserve diagonal-adjacent stops');
  assert(canStep(p(8, 8)), 'allies can travel while retaining two-cell stops');
  other!.alive = false;
  assert(canStep(p(9, 7)), 'fainted allies release destination clearance');
  other!.alive = true;
  other!.position = other!.pixel = p(9, 7);
  assert(canStep(p(8, 8)), 'a close custom formation may improve its gap incrementally');
  assert(!canStep(p(9, 8)), 'a close custom formation cannot transfer the same crowding to another cell');
  assert(canStep(p(7, 7)), 'a close custom formation can regain full clearance');
  const blocked = (from: { x: number; y: number }, to: { x: number; y: number }) =>
    to.x >= 6 && to.x <= 12 && to.y >= 4 && to.y <= 10 && (to.x !== 9 || to.y === 4)
      && travelPathDistance(from, to, p(9, 5), p(9, 10)) >= BATTLE_MOVEMENT.pathClearance;
  let step = p(8, 7);
  for (let i = 0; i < 12 && distCells(step, p(11, 7)) > 1.5; i++) {
    const next = findGridApproachStep(step, p(11, 7), 1.5, 1, blocked);
    assert(next, 'approach searches around a wall instead of oscillating in front of it');
    assert(blocked(step, next));
    step = next;
  }
  assert(distCells(step, p(11, 7)) <= 1.5, 'detour reaches the unchanged melee band');
  assert.equal(findGridApproachStep(p(8, 7), p(11, 7), 1.5, 1, () => false), undefined, 'fully blocked actor waits');
  let visits = 0;
  assert.equal(findGridApproachStep(p(8, 7), p(1000, 1000), 1.5, 1, () => { visits++; return true; }), undefined);
  assert(visits <= 20 * 14, 'an unreachable target cannot search beyond the battle grid');
  const formations = [undefined, [p(4, 6), p(4, 7), p(4, 8)], [p(4, 7), p(4, 7), p(4, 7)]];
  for (const formation of formations) for (const dt of [1 / 60, 0.05, 0.15]) {
    const meleeTeam = (ids: number[], side: string) => team(ids, side).map((c) => ({ ...c,
      activeSkills: [], passiveSkills: [], ability: 'keen-eye', personality: 'brave' as const }));
    const melee = new BattleSim({ mode: 'pve', player: meleeTeam([68, 68, 68], 'p'), enemy: meleeTeam([143], 'e'), seed: 904, formation });
    const players = melee.state.combatants.filter((c) => c.side === 'player');
    if (formation) assert.deepEqual(players.map((c) => c.position), formation, 'custom formation is not silently rewritten');
    while (!melee.isOver && melee.state.time < 60) melee.tick(dt);
    assert(melee.isOver, 'pure melee focus finishes without ranged-skill assistance');
    assert(players.every((c) => c.normalAttacks > 0), `every melee attacker gets through, formation=${JSON.stringify(formation)}, dt=${dt}`);
    assert(players.every((c, i) => players.slice(i + 1).every((other) =>
      distCells(c.position, other.position) >= BATTLE_MOVEMENT.allyDestinationClearance)), 'crowded starts recover allied spacing');
  }
  console.log('✓ engine travel/stop clearance, 27 fixed encounters, 9 melee formation cases and bounded detours', JSON.stringify(reports));
}
