import type { BattleCue } from '@pokemon-online/renderer';

interface ScheduledBattleCue {
  cue: BattleCue;
  remainingSeconds: number;
}

export interface BattleCueClockStep {
  clockSeconds: number;
  due: readonly ScheduledBattleCue['cue'][];
}

/** Owns delayed visual cues and hit-stop time without executing renderer work. */
export class BattleCueScheduler {
  private delayed: ScheduledBattleCue[] = [];
  private hitStopSeconds = 0;

  get pendingCount(): number {
    return this.delayed.length;
  }

  get remainingHitStopSeconds(): number {
    return this.hitStopSeconds;
  }

  get isSettled(): boolean {
    return this.delayed.length === 0 && this.hitStopSeconds <= 0.001;
  }

  /** Returns an immediately executable cue, or consumes it into timeline state. */
  accept(cue: BattleCue): BattleCue | undefined {
    if ((cue.delayMs ?? 0) > 0) {
      this.delayed.push({ cue: { ...cue, delayMs: undefined }, remainingSeconds: cue.delayMs! / 1000 });
      return undefined;
    }
    if (cue.type === 'hit-stop') {
      this.hitStopSeconds = Math.max(this.hitStopSeconds, cue.milliseconds / 1000);
      return undefined;
    }
    return cue;
  }

  advance(dt: number): BattleCueClockStep {
    const clockSeconds = this.hitStopSeconds > 0 ? 0 : dt;
    this.hitStopSeconds = Math.max(0, this.hitStopSeconds - dt);
    if (clockSeconds <= 0) return { clockSeconds: 0, due: [] };

    const due: ScheduledBattleCue[] = [];
    const pending: ScheduledBattleCue[] = [];
    for (const entry of this.delayed) {
      entry.remainingSeconds -= clockSeconds;
      if (entry.remainingSeconds <= 0) due.push(entry);
      else pending.push(entry);
    }
    this.delayed = pending;
    // A long frame can cross several batches; preserve their intended order.
    const ready = due.sort((a, b) => a.remainingSeconds - b.remainingSeconds)
      .flatMap(({ cue }) => { const immediate = this.accept(cue); return immediate ? [immediate] : []; });
    return { clockSeconds, due: ready };
  }

  clear(): void {
    this.delayed = [];
    this.hitStopSeconds = 0;
  }
}
