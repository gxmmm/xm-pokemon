import assert from 'node:assert/strict';
import { BattleSim, createWildInstance } from '@pokemon-online/engine';
import { BattleDirector, snapshotBattle, toBattlePresentationEvent } from '@pokemon-online/presentation';
import type { BattleEvent } from '@pokemon-online/shared';
import { BattlePresentationBridge } from '../apps/web/src/game/BattlePresentationBridge.ts';
import { BattleOutcomeTimeline } from '../apps/web/src/game/BattleOutcomeTimeline.ts';

export function testBattleOutcomes(): void {
  const sim = new BattleSim({ mode: 'pvp', player: [createWildInstance(94, 100)], enemy: [createWildInstance(143, 100)], seed: 904 });
  const actor = { ...sim.state.combatants[0]!, uid: 'actor' };
  const victim = { ...sim.state.combatants[1]!, uid: 'victim', currentHp: 100, maxHp: 100, alive: true };
  const release: BattleEvent = { seq: 1, t: 0.1, type: 'skill', actor: 'actor', target: 'victim', skillId: 'shadow-ball', vfx: { kind: 'projectile', type: 'ghost' } };
  const hit: BattleEvent = { seq: 2, t: 0.1, type: 'damage', actor: 'actor', target: 'victim', skillId: 'shadow-ball',
    amount: 900, vfx: { kind: 'impact', type: 'ghost' }, health: { uid: 'victim', currentHp: 37, alive: true, at: 0.104 } };
  const death: BattleEvent = { seq: 3, t: 0.1, type: 'faint', actor: 'victim', message: '倒下', health: { uid: 'victim', currentHp: 0, alive: false, at: 0.104 } };
  const after = { ...victim, currentHp: 37 };
  const source = { isOver: false, state: { time: 0, combatants: [actor, victim], events: [] as BattleEvent[] } };
  const bridge = new BattlePresentationBridge({ presentationDelay: 0 });
  const displayed = (frame: ReturnType<BattlePresentationBridge['advance']>) => frame.presentation.combatants.find((c) => c.uid === 'victim')!;
  bridge.reset(source);
  source.state = { time: 0.104, combatants: [actor, after], events: [release, hit] };
  const original = JSON.stringify(source);
  let frame = bridge.advance(source, 0.104, 0.016);
  assert.equal(displayed(frame).currentHp, 100, 'release frame cannot reveal post-hit HP');
  assert(!frame.cues.some((entry) => entry.sequence === 2), 'outcome cues wait in the bridge, not a second renderer delay');
  const directed = new BattleDirector().direct([release, hit].map(toBattlePresentationEvent));
  const contactSeconds = Math.max(...directed.filter((entry) => entry.sequence === 2).map((entry) => entry.cue.delayMs ?? 0)) / 1000;
  frame = bridge.advance(source, 1.5, contactSeconds - 0.001);
  assert.equal(displayed(frame).currentHp, 100, '3x simulation delta cannot accelerate contact ahead of the renderer');
  frame = bridge.advance(source, 0, 0.001);
  assert.equal(displayed(frame).currentHp, 37, 'paused simulation still lets an already released visual action finish');
  assert(frame.cues.some((entry) => entry.sequence === 2) && frame.cues.filter((entry) => entry.sequence === 2).every((entry) => !entry.cue.delayMs));
  assert.equal(JSON.stringify(source), original, 'health presentation never mutates simulation facts');
  assert.equal(bridge.advance(source, 0, 0.01).cues.length, 0, 'outcome delivered exactly once');

  bridge.reset({ isOver: false, state: { time: 0, combatants: [actor, victim], events: [] } });
  const finalSource = { isOver: true, state: { time: 0.104, combatants: [actor, { ...victim, currentHp: 0, alive: false }],
    events: [release, { ...hit, health: { ...hit.health!, currentHp: 0 }, vfx: { ...hit.vfx!, ko: true } }, death,
      { seq: 4, t: 0.1, type: 'end' as const, message: '结束' }] } };
  frame = bridge.advance(finalSource, 0.104, 0.016);
  assert(displayed(frame).alive && displayed(frame).currentHp === 100 && !frame.isCaughtUp);
  assert(!frame.presentation.events.some((event) => event.type === 'faint' || event.type === 'end'), 'logs cannot announce death/end before contact');
  frame = bridge.advance(finalSource, 0, contactSeconds);
  assert(!displayed(frame).alive && displayed(frame).currentHp === 0 && frame.isCaughtUp);
  assert(frame.cues.some(({ cue }) => cue.type === 'animation' && cue.animation === 'faint'));
  assert(frame.cues.some(({ cue }) => cue.type === 'hit-stop'), 'KO hit-stop starts with visible KO, not release');
  bridge.reset({ isOver: false, state: { time: 0, combatants: [actor, victim], events: [] } });
  bridge.advance(finalSource, 0.104, 0.016);
  bridge.reset({ isOver: false, state: { time: 0, combatants: [actor, victim], events: [] } });
  frame = bridge.advance({ isOver: false, state: { time: 0, combatants: [actor, victim], events: [] } }, 0, 1);
  assert(displayed(frame).alive && displayed(frame).currentHp === 100 && frame.cues.length === 0, 'restart cancels pending death and health');

  const timeline = new BattleOutcomeTimeline();
  const before = snapshotBattle(0, [victim, { ...victim, uid: 'second' }]);
  const snapshot = snapshotBattle(0.104, [after, { ...after, uid: 'second', currentHp: 81 }]);
  const heal: BattleEvent = { ...hit, seq: 3, type: 'heal', health: { ...hit.health!, currentHp: 63 } };
  const second: BattleEvent = { ...hit, seq: 4, target: 'second', health: { uid: 'second', currentHp: 81, alive: true } };
  const feedback = [hit, heal, second].map((event) => ({ id: String(event.seq), eventId: String(event.seq), sequence: event.seq!, at: event.t,
    cue: { type: 'animation' as const, subjectId: event.health!.uid, animation: 'hit' as const, delayMs: event === hit ? 400 : 100 } }));
  timeline.enqueue([hit, heal, second], feedback, before.combatants, () => snapshot);
  const early = timeline.advance(0.1);
  assert.deepEqual(early.events.map((event) => event.seq), [4], 'different victims update independently');
  assert.equal(timeline.apply(snapshot.combatants, 0.104)[0]!.currentHp, 100, 'later healing cannot overtake an earlier pending hit');
  const late = timeline.advance(0.3);
  assert.deepEqual(late.events.map((event) => event.seq), [2, 3]);
  assert.equal(timeline.apply(snapshot.combatants, 0.104)[0]!.currentHp, 63, 'copies post-event HP instead of subtracting overkill or shield damage');
  assert.equal(timeline.apply(snapshotBattle(0.2, [{ ...after, currentHp: 64 }]).combatants, 0.2)[0]!.currentHp, 64, 'unlogged passive regen resumes from snapshots after outcomes settle');
  timeline.clear();
  const frozenFeedback = [
    { ...feedback[0]!, cue: { type: 'hit-stop' as const, milliseconds: 70, delayMs: 100 } },
    { ...feedback[2]!, cue: { ...feedback[2]!.cue, delayMs: 400 } },
  ];
  timeline.enqueue([hit, second], frozenFeedback, before.combatants, () => snapshot);
  assert.deepEqual(timeline.advance(0.1).events.map((event) => event.seq), [2]);
  assert.equal(timeline.advance(0.07).events.length, 0);
  assert.equal(timeline.advance(0.299).events.length, 0, 'another victim waits while renderer hit-stop freezes its flight');
  assert.deepEqual(timeline.advance(0.001).events.map((event) => event.seq), [4]);
  timeline.clear();
  const spread = { ...hit, vfx: { ...hit.vfx!, targetUids: ['victim', 'second'] } };
  assert.deepEqual(toBattlePresentationEvent(spread).targetIds, ['victim'], 'spread impact addresses its actual health victim');
  assert.deepEqual(toBattlePresentationEvent({ ...release, vfx: { ...release.vfx!, targetUids: ['victim', 'second'] } }).targetIds, ['victim', 'second']);

  sim.resolve(180);
  const outcomes = sim.state.events.filter((event) => ['damage', 'heal', 'faint'].includes(event.type));
  assert(outcomes.length > 0 && outcomes.every((event) => event.health && Number.isFinite(event.health.at)));
  const record = outcomes[0]!.health!;
  const recorded = JSON.stringify(record);
  sim.state.combatants.find((combatant) => combatant.uid === record.uid)!.currentHp = 12345;
  assert.equal(JSON.stringify(record), recorded, 'engine event health is a value copy, not a live combatant reference');
  console.log('✓ atomic HP/contact/faint presentation, wall-clock playback, per-victim order and reset');
}
