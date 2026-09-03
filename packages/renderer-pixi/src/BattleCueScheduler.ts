import type { BattleCue } from '@pokemon-online/renderer';

interface ScheduledBattleCue {
  cue: Extract<BattleCue, { type: 'animation' | 'vfx' }>;
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
    if (cue.type === 'hit-stop') {
      this.hitStopSeconds = Math.max(this.hitStopSeconds, cue.milliseconds / 1000);
      return undefined;
    }
    if ((cue.type === 'animation' || cue.type === 'vfx') && (cue.delayMs ?? 0) > 0) {
      this.delayed.push({ cue, remainingSeconds: (cue.delayMs ?? 0) / 1000 });
      return undefined;
    }
    return cue;
  }

  advance(dt: number): BattleCueClockStep {
    const clockSeconds = this.hitStopSeconds > 0 ? 0 : dt;
    this.hitStopSeconds = Math.max(0, this.hitStopSeconds - dt);
    if (clockSeconds <= 0) return { clockSeconds: 0, due: [] };

    const due: ScheduledBattleCue['cue'][] = [];
    const pending: ScheduledBattleCue[] = [];
    for (const entry of this.delayed) {
      entry.remainingSeconds -= clockSeconds;
      if (entry.remainingSeconds <= 0) due.push(entry.cue);
      else pending.push(entry);
    }
    this.delayed = pending;
    return { clockSeconds, due };
  }

  clear(): void {
    this.delayed = [];
    this.hitStopSeconds = 0;
  }
}
