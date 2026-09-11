import assert from 'node:assert/strict';
import { BattleEntryGate } from '../apps/web/src/game/BattleEntryGate.ts';

export function testBattleEntry() {
  for (const readyAt of [200, 2000, 10001, undefined]) {
    let now = 0, starts = 0, failures = 0;
    const tasks = new Set<{ at: number; run: () => void }>();
    const gate = new BattleEntryGate(() => starts++, () => failures++, {
      now: () => now,
      schedule: (run, delay) => { const task = { at: now + delay, run }; tasks.add(task); return () => tasks.delete(task); },
    });
    const advance = (to: number) => {
      while (true) {
        const next = [...tasks].filter(task => task.at <= to).sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        now = next.at; tasks.delete(next); next.run();
      }
      now = to;
    };
    if (readyAt !== undefined) { advance(readyAt); gate.ready(); gate.ready(); }
    if (readyAt === 200) { advance(999); assert.equal(starts, 0); advance(1000); assert.equal(starts, 1); }
    if (readyAt === 2000) assert.equal(starts, 1, '较慢资源就绪后立即开始');
    advance(11000);
    assert.equal(starts, readyAt !== undefined && readyAt < 10000 ? 1 : 0);
    assert.equal(failures, starts ? 0 : 1);
    gate.ready(); gate.dispose(); advance(20000);
    assert.equal(starts + failures, 1, '迟到加载或重复就绪不能重复开始');
    assert.equal(tasks.size, 0);
  }
  let cancelled = false;
  const gate = new BattleEntryGate(() => assert.fail('disposed start'), () => assert.fail('disposed timeout'), {
    now: () => 0, schedule: () => () => { cancelled = true; },
  });
  gate.dispose(); gate.ready(); assert(cancelled);
  console.log('✓ 战斗入口：最少1秒、最多10秒、一次性开战、超时与取消');
}
