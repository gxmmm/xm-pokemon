import { BATTLE_ENTRY } from '@pokemon-online/config';

interface EntryClock {
  now(): number;
  schedule(callback: () => void, delay: number): () => void;
}
const clock: EntryClock = {
  now: () => performance.now(),
  schedule: (callback, delay) => { const timer = setTimeout(callback, delay); return () => clearTimeout(timer); },
};

/** 只控制进入资格，不推进模拟或处理任何战斗结果。 */
export class BattleEntryGate {
  private readonly started: number;
  private done = false;
  private prepared = false;
  private cancelMinimum = () => {};
  private cancelDeadline = () => {};
  private cancelReveal = () => {};
  constructor(private readonly start: () => void, private readonly timeout: () => void, private readonly time: EntryClock = clock, private readonly reveal: (durationMs: number) => void = () => {}) {
    this.started = time.now();
    this.cancelDeadline = time.schedule(() => this.finish(false), BATTLE_ENTRY.timeoutMs);
  }
  ready(): void {
    if (this.done || this.prepared) return;
    this.prepared = true;
    const elapsed = this.time.now() - this.started;
    if (elapsed >= BATTLE_ENTRY.timeoutMs) { this.finish(false); return; }
    const revealAt = BATTLE_ENTRY.minimumMs - BATTLE_ENTRY.revealMs;
    if (elapsed >= revealAt) this.open();
    else this.cancelMinimum = this.time.schedule(() => this.open(), revealAt - elapsed);
  }
  dispose(): void { this.done = true; this.cancelMinimum(); this.cancelDeadline(); this.cancelReveal(); }
  private open(): void {
    if (this.done) return;
    const remaining = BATTLE_ENTRY.timeoutMs - (this.time.now() - this.started);
    if (remaining <= 0) { this.finish(false); return; }
    this.cancelDeadline();
    const duration = Math.min(BATTLE_ENTRY.revealMs, remaining);
    this.cancelReveal = this.time.schedule(() => this.finish(true), duration);
    this.reveal(duration);
  }
  private finish(ready: boolean): void {
    if (this.done) return;
    this.dispose();
    if (ready) this.start(); else this.timeout();
  }
}
