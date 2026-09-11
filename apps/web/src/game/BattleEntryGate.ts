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
  constructor(private readonly start: () => void, private readonly timeout: () => void, private readonly time: EntryClock = clock) {
    this.started = time.now();
    this.cancelDeadline = time.schedule(() => this.finish(false), BATTLE_ENTRY.timeoutMs);
  }
  ready(): void {
    if (this.done || this.prepared) return;
    this.prepared = true;
    const elapsed = this.time.now() - this.started;
    if (elapsed >= BATTLE_ENTRY.timeoutMs) { this.finish(false); return; }
    if (elapsed >= BATTLE_ENTRY.minimumMs) this.finish(true);
    else this.cancelMinimum = this.time.schedule(() => this.finish(true), BATTLE_ENTRY.minimumMs - elapsed);
  }
  dispose(): void { this.done = true; this.cancelMinimum(); this.cancelDeadline(); }
  private finish(ready: boolean): void {
    if (this.done) return;
    this.dispose();
    if (ready) this.start(); else this.timeout();
  }
}
