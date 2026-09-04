import type { BattleEvent } from '@pokemon-online/shared';
import type { BattlePresentationCombatant, DirectedBattleCue } from '@pokemon-online/presentation';

type Health = NonNullable<BattleEvent['health']>;
interface PendingOutcome {
  event: BattleEvent;
  health: Health;
  cues: readonly DirectedBattleCue[];
  remaining: number;
}

/** Holds only displayed health and outcome cues; never derives HP from damage.
 * An outcome and its health record are delivered on one presentation frame. */
export class BattleOutcomeTimeline {
  private pending: PendingOutcome[] = [];
  private visible = new Map<string, { health: Health; snapshotTime: number }>();
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
      if (event.type !== 'damage' && event.type !== 'heal' && event.type !== 'faint') continue;
      const snapshot = snapshotFor(event);
      const uid = event.health?.uid ?? event.target ?? event.actor;
      const after = snapshot.combatants.find((combatant) => combatant.uid === uid);
      // Older DTOs fall back to a recorded snapshot, never to damage arithmetic.
      const health = event.health ?? (after ? { uid: after.uid, currentHp: after.currentHp, alive: after.alive } : undefined);
      if (!health) continue;
      const feedback = cues.filter((entry) => entry.sequence === event.seq);
      const delay = feedback.reduce((ms, entry) => Math.max(ms, entry.cue.delayMs ?? 0), 0) / 1000;
      // A later heal/faint cannot overtake a pending hit then be overwritten.
      const previousDelay = this.pending.filter((entry) => entry.health.uid === health.uid)
        .reduce((latest, entry) => Math.max(latest, entry.remaining), 0);
      const previous = before.find((combatant) => combatant.uid === health.uid);
      let held = this.visible.get(health.uid);
      if (!held) {
        held = { health: previous ? { uid: previous.uid, currentHp: previous.currentHp, alive: previous.alive } : health, snapshotTime: snapshot.time };
        this.visible.set(health.uid, held);
      }
      held.snapshotTime = Math.max(held.snapshotTime, snapshot.time);
      this.pending.push({ event, health, cues: feedback, remaining: Math.max(delay, previousDelay) });
      heldSequences.add(event.seq ?? 0);
    }
    const immediate = cues.filter((entry) => !heldSequences.has(entry.sequence));
    const ready = this.flush();
    const result = [...immediate, ...ready.cues];
    this.observeHitStop(result);
    return { cues: result, events: [...events.filter((event) => !heldSequences.has(event.seq ?? 0)), ...ready.events] };
  }

  apply(combatants: BattlePresentationCombatant[], snapshotTime: number): BattlePresentationCombatant[] {
    const pendingIds = new Set(this.pending.map((entry) => entry.health.uid));
    return combatants.map((combatant) => {
      const held = this.visible.get(combatant.uid);
      if (!held) return combatant;
      if (!pendingIds.has(combatant.uid) && snapshotTime > held.snapshotTime) {
        this.visible.delete(combatant.uid);
        return combatant;
      }
      return { ...combatant, currentHp: held.health.currentHp, alive: held.health.alive };
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
      this.visible.get(entry.health.uid)!.health = entry.health;
      cues.push(...entry.cues.map((directed) => ({ ...directed, cue: { ...directed.cue, delayMs: undefined } })));
    }
    this.observeHitStop(cues);
    return { cues, events: ready.map((entry) => entry.event) };
  }

  private observeHitStop(cues: readonly DirectedBattleCue[]): void {
    for (const { cue } of cues) if (cue.type === 'hit-stop' && !cue.delayMs) this.hitStop = Math.max(this.hitStop, cue.milliseconds / 1000);
  }
}
