import type { BattleEvent } from '@pokemon-online/shared';
import type { BattlePresentationCombatant, DirectedBattleCue } from '@pokemon-online/presentation';

type OutcomePatch = Partial<Pick<BattlePresentationCombatant, 'currentHp' | 'alive' | 'status' | 'statusTimer' | 'flinchUntil' | 'castProgress'>>;
interface PendingOutcome {
  event: BattleEvent;
  uid: string;
  patch: OutcomePatch;
  cues: readonly DirectedBattleCue[];
  remaining: number;
}

/** Delivers recorded health/control facts and their cues on one presentation
 * frame. Never derives health, status or interruption from visual effects. */
export class BattleOutcomeTimeline {
  private pending: PendingOutcome[] = [];
  private visible = new Map<string, { patch: OutcomePatch; snapshotTime: number }>();
  private hitStop = 0;

  get isSettled(): boolean { return this.pending.length === 0; }

  advance(seconds: number): { cues: DirectedBattleCue[]; events: BattleEvent[] } {
    const elapsed = this.hitStop > 0 ? 0 : seconds;
    this.hitStop = Math.max(0, this.hitStop - seconds);
    for (const entry of this.pending) entry.remaining -= elapsed;
    return this.flush();
  }

  enqueue(events: readonly BattleEvent[], cues: readonly DirectedBattleCue[], before: readonly BattlePresentationCombatant[],
    snapshotFor: (event: BattleEvent) => { time: number; combatants: readonly BattlePresentationCombatant[] }): { cues: DirectedBattleCue[]; events: BattleEvent[] } {
    const heldSequences = new Set<number>();
    for (const event of events) {
      const healthEvent = event.type === 'damage' || event.type === 'heal' || event.type === 'faint';
      if (!healthEvent && !event.control) continue;
      const snapshot = snapshotFor(event);
      const uid = event.health?.uid ?? event.control?.uid ?? event.target ?? event.actor;
      if (!uid) continue;
      const after = snapshot.combatants.find((combatant) => combatant.uid === uid);
      // Older DTOs fall back to a recorded snapshot, never to damage arithmetic.
      const health = healthEvent ? event.health ?? after : undefined;
      const patch: OutcomePatch = {};
      if (health) Object.assign(patch, { currentHp: health.currentHp, alive: health.alive });
      if (event.control) {
        const { uid: _uid, at: _at, ...control } = event.control;
        Object.assign(patch, control);
      }
      if (!Object.keys(patch).length) continue;
      const feedback = cues.filter((entry) => entry.sequence === event.seq);
      const delay = feedback.reduce((ms, entry) => Math.max(ms, entry.cue.delayMs ?? 0), 0) / 1000;
      // Healing, control and interruption cannot overtake an earlier hit.
      const previousDelay = this.pending.filter((entry) => entry.uid === uid)
        .reduce((latest, entry) => Math.max(latest, entry.remaining), 0);
      const previous = before.find((combatant) => combatant.uid === uid);
      let held = this.visible.get(uid);
      if (!held) {
        held = { patch: {}, snapshotTime: snapshot.time };
        this.visible.set(uid, held);
      }
      // Hold only fields changed by these events; control must not freeze HP.
      for (const key of Object.keys(patch) as (keyof OutcomePatch)[]) {
        if (!(key in held.patch)) Object.assign(held.patch, { [key]: previous ? previous[key] : patch[key] });
      }
      held.snapshotTime = Math.max(held.snapshotTime, snapshot.time);
      this.pending.push({ event, uid, patch, cues: feedback, remaining: Math.max(delay, previousDelay) });
      heldSequences.add(event.seq ?? 0);
    }
    const immediate = cues.filter((entry) => !heldSequences.has(entry.sequence));
    const ready = this.flush();
    const result = [...immediate, ...ready.cues];
    this.observeHitStop(result);
    return { cues: result, events: [...events.filter((event) => !heldSequences.has(event.seq ?? 0)), ...ready.events] };
  }

  apply(combatants: BattlePresentationCombatant[], snapshotTime: number): BattlePresentationCombatant[] {
    const pendingIds = new Set(this.pending.map((entry) => entry.uid));
    return combatants.map((combatant) => {
      let held = this.visible.get(combatant.uid);
      if (held && !pendingIds.has(combatant.uid) && snapshotTime > held.snapshotTime) {
        this.visible.delete(combatant.uid);
        held = undefined;
      }
      const shown = held ? { ...combatant, ...held.patch } : combatant;
      // A hard-controlled actor stops visibly charging at contact, even if the
      // engine emits cancellation on its next tick. Never synthesize that event.
      const disabled = !shown.alive || shown.status === 'sleep' || shown.status === 'freeze' || (shown.flinchUntil ?? 0) > snapshotTime;
      return disabled && shown.castProgress ? { ...shown, castProgress: null } : shown;
    });
  }

  visibleEvents(events: readonly BattleEvent[]): BattleEvent[] {
    const hidden = new Set(this.pending.map((entry) => entry.event.seq));
    return events.filter((event) => !hidden.has(event.seq) && (event.type !== 'end' || this.isSettled));
  }

  clear(): void { this.pending = []; this.visible.clear(); this.hitStop = 0; }

  private flush(): { cues: DirectedBattleCue[]; events: BattleEvent[] } {
    const ready = this.pending.filter((entry) => entry.remaining <= 0.000001);
    this.pending = this.pending.filter((entry) => entry.remaining > 0.000001);
    const cues: DirectedBattleCue[] = [];
    for (const entry of ready) {
      Object.assign(this.visible.get(entry.uid)!.patch, entry.patch);
      cues.push(...entry.cues.map((directed) => ({ ...directed, cue: { ...directed.cue, delayMs: undefined } })));
    }
    this.observeHitStop(cues);
    return { cues, events: ready.map((entry) => entry.event) };
  }

  private observeHitStop(cues: readonly DirectedBattleCue[]): void {
    for (const { cue } of cues) if (cue.type === 'hit-stop' && !cue.delayMs) this.hitStop = Math.max(this.hitStop, cue.milliseconds / 1000);
  }
}
