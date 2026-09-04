import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

// One runner keeps argument forwarding and temporary-bundle cleanup consistent.
const [name, ...args] = process.argv.slice(2);
const browserReports = new Set(['battle-browser-report', 'visual-browser-report', 'progress-browser-report']);
const entries = new Set(['smoke', 'balance-report', 'tactics-report', 'visual-report', ...browserReports]);
if (!entries.has(name)) throw new Error('Unknown script: ' + name);
const output = resolve(`.script-${name}-${process.pid}.mjs`);
try {
  await build({
    entryPoints: [`scripts/${name}.ts`], outfile: output,
    bundle: true, platform: 'node', format: 'esm', logLevel: 'warning',
    // Bundle workspace TypeScript too; only Playwright stays external, so the
    // scripts do not depend on newer Node versions' native TypeScript loader.
    ...(browserReports.has(name) ? { external: ['playwright-core'] } : {}),
  });
  process.exitCode = await new Promise((resolveExit, reject) => {
    const child = spawn(process.execPath, [output, ...args], { stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) => resolveExit(code ?? 1));
  });
} finally {
  await rm(output, { force: true });
}
