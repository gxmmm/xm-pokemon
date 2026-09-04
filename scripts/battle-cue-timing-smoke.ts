import assert from 'node:assert/strict';
import { BEAM_CONTACT_DELAY_MS, projectileTimingFor, SKILL_CAST_PRESENTATION_BY_SKILL_ID } from '@pokemon-online/config';
import { BattleDirector, type BattleCue, type BattlePresentationEvent } from '@pokemon-online/presentation';
import { buildVfxLabCues, buildVfxLabEvents } from '../apps/web/src/battle/VfxLab.ts';
import { BattleCueScheduler } from '../packages/renderer-pixi/src/BattleCueScheduler.ts';
import { BattleEffectPool } from '../packages/renderer-pixi/src/BattleEffectPool.ts';
import { spawnProjectile } from '../packages/renderer-pixi/src/projectile-vfx.ts';

export function testBattleCueTiming(): void {
  const input = { actorId: 'caster', targetId: 'dummy', skillId: 'shadow-ball', sequence: 1 };
  const events = buildVfxLabEvents(input);
  const facts = JSON.stringify(events);
  assert.equal(events[0]!.at, events[1]!.at, 'lab facts share the engine release/outcome instant');
  const director = new BattleDirector();
  const cues = director.direct(events);
  const release = cues.find(({ cue }) => cue.type === 'vfx' && cue.eventType === 'skill')!.cue;
  assert(release.type === 'vfx');
  const contactMs = (release.delayMs ?? 0) + projectileTimingFor(release.recipe.variant, release.intensity).contactMs;
  const feedback = cues.filter(({ eventId }) => eventId === events[1]!.id);
  assert(feedback.length >= 3);
  assert(feedback.every(({ cue }) => cue.delayMs === contactMs), 'hit, impact and terrain wait for the same contact');
  assert.equal(JSON.stringify(events), facts, 'direction never modifies event facts or timestamps');
  assert.equal(director.direct(events).length, 0, 'repeated bridge history cannot replay an action');
  director.reset();
  assert.deepEqual(director.direct(events), cues);

  const critical: BattlePresentationEvent = { ...events[1]!, outcome: { damage: 99999, critical: true, ko: true } };
  const faint: BattlePresentationEvent = { id: 'faint', sequence: 3, type: 'faint', actorId: 'dummy', at: events[0]!.at };
  const knockout = new BattleDirector().direct([events[0]!, critical, faint]);
  assert(knockout.filter(({ eventId }) => eventId !== events[0]!.id).every(({ cue }) => cue.delayMs === contactMs),
    'critical impact, camera, hit-stop and faint cues share release timing, not damage intensity');
  const reversed = new BattleDirector().direct([critical, events[0]!]);
  assert(reversed.filter(({ eventId }) => eventId === critical.id).every(({ cue }) => cue.delayMs === contactMs),
    'pairing does not depend on damage/release array order');

  for (const unpaired of [
    { ...events[1]!, actorId: 'other' },
    { ...events[1]!, targetIds: ['other'] },
    { ...events[1]!, at: 0.5 },
    { ...events[1]!, skillId: undefined },
  ]) {
    const isolated = new BattleDirector().direct([events[0]!, unpaired]);
    assert(isolated.filter(({ eventId }) => eventId === unpaired.id).every(({ cue }) => !cue.delayMs),
      'unrelated hits and later damage ticks do not inherit a projectile delay');
  }
  const splitDirector = new BattleDirector();
  splitDirector.direct([events[0]!]);
  assert(splitDirector.direct(events).every(({ cue }) => !cue.delayMs), 'consumed release history cannot delay a newly submitted outcome again');
  const multi = new BattleDirector().direct([
    { ...events[0]!, targetIds: ['dummy', 'second'] },
    events[1]!,
    { ...events[1]!, id: 'second-hit', sequence: 3, targetIds: ['second'] },
  ]);
  const multiRelease = multi.find(({ cue }) => cue.type === 'vfx' && cue.eventType === 'skill')!.cue;
  assert(multiRelease.type === 'vfx');
  const multiContact = (multiRelease.delayMs ?? 0) + projectileTimingFor('shadow-orb', multiRelease.intensity).contactMs;
  assert(multi.filter(({ eventId }) => eventId !== events[0]!.id).every(({ cue }) => cue.delayMs === multiContact));

  const flame = new BattleDirector().direct(buildVfxLabEvents({ ...input, skillId: 'flamethrower' }));
  const flameRelease = flame.find(({ cue }) => cue.type === 'vfx' && cue.eventType === 'skill')!.cue;
  assert(flame.filter(({ sequence }) => sequence === 2).every(({ cue }) => cue.delayMs === (flameRelease.delayMs ?? 0) + BEAM_CONTACT_DELAY_MS),
    'flame impacts after initial ignition rather than waiting until the channel ends');
  for (const skillId of ['shadow-ball', 'fire-blast', 'thunderbolt']) {
    const batch = new BattleDirector().direct(buildVfxLabEvents({ ...input, skillId }));
    const shot = batch.find(({ cue }) => cue.type === 'vfx' && cue.eventType === 'skill')!.cue;
    assert(shot.type === 'vfx');
    const timing = projectileTimingFor(shot.recipe.variant, shot.intensity);
    const cast = SKILL_CAST_PRESENTATION_BY_SKILL_ID[skillId]!;
    assert.equal(shot.delayMs ?? 0, cast.charge ? 0 : cast.visualWindupMs, 'gameplay-timed casts do not repeat their charge');
    assert(batch.filter(({ sequence }) => sequence === 2).every(({ cue }) => cue.delayMs === (shot.delayMs ?? 0) + timing.contactMs));
    const effects = new BattleEffectPool();
    spawnProjectile(effects, { x: 50, y: 20 }, { x: 400, y: 80 }, 0xff8844, shot.intensity, shot.recipe.variant, shot.recipe.element);
    effects.update((timing.durationMs - 1) / 1000);
    assert.equal(effects.activeCount, 1, 'drawing uses the shared flight duration');
    effects.update(0.002);
    assert.equal(effects.activeCount, 0);
  }

  const repeated = buildVfxLabCues(new BattleDirector(), input, 3, 2);
  const first = repeated.filter(({ sequence }) => sequence < 10);
  const interval = first.reduce((ms, { cue }) => cue.type === 'action-window' ? Math.max(ms, cue.milliseconds) : ms, 720);
  for (let index = 1; index < 3; index++) {
    const batch = repeated.filter(({ sequence }) => sequence >= index * 10 && sequence < (index + 1) * 10);
    assert.equal(batch.length, first.length);
    batch.forEach(({ cue }, ordinal) => assert.equal(cue.delayMs, (first[ordinal]!.cue.delayMs ?? 0) + index * interval,
      `batch ${index} offsets every cue, including recovery, camera and terrain`));
  }
  const scheduler = new BattleCueScheduler();
  const scheduled: BattleCue[] = [
    { type: 'environment', reaction: 'scorch', delayMs: 60 },
    { type: 'camera', plan: { style: 'impact', focusIds: [], durationMs: 200 }, delayMs: 40 },
    { type: 'hit-stop', milliseconds: 70, delayMs: 60 },
  ];
  scheduled.forEach((cue) => assert.equal(scheduler.accept(cue), undefined));
  assert.equal(scheduler.remainingHitStopSeconds, 0, 'delayed hit-stop cannot freeze a projectile at launch');
  assert.equal(scheduler.advance(0.039).due.length, 0);
  const due = scheduler.advance(0.022).due;
  assert.deepEqual(due.map((cue) => cue.type), ['camera', 'environment'], 'crossed deadlines execute chronologically');
  assert(due.every((cue) => !cue.delayMs), 'ready cues cannot accidentally requeue their own delays');
  assert.equal(scheduler.remainingHitStopSeconds, 0.07);
  assert.equal(scheduler.advance(0.02).clockSeconds, 0);
  scheduler.clear();
  assert(scheduler.isSettled);
  assert.equal(scheduler.advance(1).due.length, 0, 'reset cancels all future feedback');
  console.log('✓ release/contact timing, paired outcomes, shared flight duration and complete lab batches');
}
