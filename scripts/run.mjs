import { build } from 'esbuild';
import { execFile, spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { acquireVerificationSlot, applyVerificationBudget, verificationBatches } from './verification-scheduler.mjs';

// One runner keeps argument forwarding and temporary-bundle cleanup consistent.
const [name, ...args] = process.argv.slice(2);
const browserReports = new Set(['battle-browser-report', 'battle-loading-browser-report', 'visual-browser-report', 'progress-browser-report', 'playable-browser-report']);
const entries = new Set(['smoke', 'balance-report', 'tactics-report', 'visual-report', 'typecheck', 'build-web', ...browserReports]);
if (!entries.has(name)) throw new Error('Unknown script: ' + name);
const output = resolve(`.script-${name}-${process.pid}.mjs`);
let child;
let stopping = false;
const cancellation = new AbortController();
let treeStopped = Promise.resolve();
let releaseSlot;
const stop = () => {
  if (stopping) return;
  stopping = true;
  cancellation.abort();
  if (child?.pid && child.exitCode === null) {
    if (process.platform === 'win32') treeStopped = new Promise(done => {
      execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, error => {
        if (error) console.error('验证子进程清理返回：' + error.message);
        done();
      });
    });
    else child.kill('SIGTERM');
  }
};
process.on('SIGINT', stop); process.on('SIGTERM', stop);
const runId = randomUUID();
try {
  releaseSlot = await acquireVerificationSlot(resolve('.'), console.log, cancellation.signal);
  console.log(`验证资源预算：${await applyVerificationBudget()}；串行执行。`);
  const run = async commandArgs => {
    if (stopping) return 130;
    return await new Promise((resolveExit, reject) => {
      child = spawn(process.execPath, commandArgs, { stdio: 'inherit', windowsHide: true, env: { ...process.env, GOMAXPROCS: '2', UV_THREADPOOL_SIZE: '2', PO_VERIFICATION_RUN_ID: runId } });
      child.once('error', reject);
      child.once('exit', code => { child = undefined; resolveExit(stopping ? 130 : code ?? 1); });
    });
  };
  if (name === 'typecheck' || name === 'build-web') {
    const commands = name === 'typecheck'
      ? [['node_modules/vue-tsc/bin/vue-tsc.js', '-p', 'apps/web/tsconfig.json', '--noEmit'], ['node_modules/typescript/bin/tsc', '-p', 'apps/worker/tsconfig.json', '--noEmit']]
      : [['node_modules/vite/bin/vite.js', 'build', '--config', 'apps/web/vite.config.ts']];
    for (const command of commands) { process.exitCode = await run(command); if (process.exitCode) break; }
  } else {
  await build({
    entryPoints: [`scripts/${name}.ts`], outfile: output,
    bundle: true, platform: 'node', format: 'esm', logLevel: 'warning',
    // Bundle workspace TypeScript too; only Playwright stays external, so the
    // scripts do not depend on newer Node versions' native TypeScript loader.
    ...(browserReports.has(name) ? { external: ['playwright-core'] } : {}),
  });
  const batches = verificationBatches(name, args);
  const reliefReport = name === 'battle-browser-report' && batches.length === 3 && args[0] === '--relief-only';
  const fullBattle = name === 'battle-browser-report' && args.length === 0;
  const reportRoot = resolve('doc/visual-baselines/battle', reliefReport ? 'relief' : '.');
  if (reliefReport || fullBattle) {
    await mkdir(reportRoot, { recursive: true });
    await writeFile(resolve(reportRoot, fullBattle ? 'suite-report.json' : 'report.json'), JSON.stringify({ runId, passed: false, status: 'running', samples: [] }));
  }
  for (const [index, batchArgs] of batches.entries()) {
    console.log(`验证批次 ${index + 1}/${batches.length}${batchArgs.length ? '：' + batchArgs.join(' ') : ''}`);
    process.exitCode = await run([output, ...batchArgs]);
    if (process.exitCode) break;
    if (index < batches.length - 1) { console.log('本批浏览器已关闭，休息 3 秒后继续。'); await delay(3000, undefined, { signal: cancellation.signal }); }
  }
  if (reliefReport && process.exitCode === 0) {
    const reports = [];
    for (const size of [1440, 1366, 1920]) reports.push(JSON.parse(await readFile(resolve(`doc/visual-baselines/battle/relief/report-${size}.json`), 'utf8')));
    if (!reports.every(report => report.runId === runId && report.passed && report.samples.length === 11)) throw new Error('场景批次报告不完整或不是本次运行');
    await writeFile(resolve(reportRoot, 'report.json'), JSON.stringify({ runId, passed: true, samples: reports.flatMap(report => report.samples) }, null, 2));
  }
  if (fullBattle && process.exitCode === 0) {
    const core = JSON.parse(await readFile(resolve(reportRoot, 'report.json'), 'utf8'));
    const natural = JSON.parse(await readFile(resolve(reportRoot, 'natural-report.json'), 'utf8'));
    if (core.runId !== runId || natural.runId !== runId || !natural.passed || core.errors.length) throw new Error('战斗批次报告不完整或不是本次运行');
    await writeFile(resolve(reportRoot, 'suite-report.json'), JSON.stringify({ runId, passed: true, core, natural }, null, 2));
  }
  }
} catch (error) {
  if (!stopping) throw error;
  process.exitCode = 130;
} finally {
  await treeStopped;
  await rm(output, { force: true });
  await releaseSlot?.();
  if (stopping) process.exitCode = 130;
  process.off('SIGINT', stop); process.off('SIGTERM', stop);
}
