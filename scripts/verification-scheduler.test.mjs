import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { acquireVerificationSlot, verificationBatches } from './verification-scheduler.mjs';

test('全部场景与自然战斗保留，批次无重叠无遗漏', () => {
  assert.deepEqual(verificationBatches('battle-browser-report', []), [['--core-only'], ['--natural-only']]);
  assert.deepEqual(verificationBatches('battle-browser-report', ['--relief-only']), [1440, 1366, 1920].map(size => ['--relief-only', `--relief-size=${size}`]));
  assert.deepEqual(verificationBatches('battle-browser-report', ['--skills-only']), [['--skills-only']]);
});

test('跨进程互斥，持锁进程异常退出后排队者可继续', async () => {
  const moduleUrl = new URL('./verification-scheduler.mjs', import.meta.url).href;
  const workspace = `scheduler-test-${process.pid}`;
  const launch = milliseconds => {
    const source = `import { acquireVerificationSlot } from ${JSON.stringify(moduleUrl)}; const release=await acquireVerificationSlot(${JSON.stringify(workspace)},()=>{}); console.log('acquired'); setTimeout(async()=>{await release()},${milliseconds});`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', source], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    const acquired = new Promise(resolve => child.stdout.once('data', resolve));
    const exited = new Promise(resolve => child.once('exit', resolve));
    return { child, acquired, exited, output: () => output };
  };
  const first = launch(10000);
  let second;
  try {
    await first.acquired;
    second = launch(1);
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(second.output(), '', '第二个进程必须等待');
    first.child.kill();
    await first.exited;
    await second.acquired;
    assert.equal(await second.exited, 0, '无需清理锁文件即可继续');
  } finally { first.child.kill(); second?.child.kill(); }
});

test('排队取消不会夺走现有锁，取消后仍能再次排队', async () => {
  const workspace = `scheduler-cancel-${process.pid}`;
  const release = await acquireVerificationSlot(workspace, () => {});
  try {
    const controller = new AbortController();
    const waiting = acquireVerificationSlot(workspace, () => {}, controller.signal);
    setTimeout(() => controller.abort(), 50);
    await assert.rejects(waiting, { name: 'AbortError' });
  } finally { await release(); }
  const releaseAgain = await acquireVerificationSlot(workspace, () => {});
  await releaseAgain();
});
