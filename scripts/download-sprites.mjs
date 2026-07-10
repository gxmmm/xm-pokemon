#!/usr/bin/env node
/**
 * Download Gen-1 Pokemon sprites (front + back) from the PokeAPI sprites
 * repository into apps/web/public/sprites. Non-commercial fan project.
 *
 *   node scripts/download-sprites.mjs
 *
 * Idempotent: skips files that already exist. Re-run with --force to re-download.
 */
import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'apps/web/public/sprites/pokemon');
const ICONS = join(ROOT, 'apps/web/public/sprites/icons');

const BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const FORCE = process.argv.includes('--force');
const COUNT = 151;

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function download(url, dest) {
  if (!FORCE && await exists(dest)) return 'skip';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) { if (attempt < 2) { await sleep(500); continue; } return `fail(${res.status})`; }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 100) { if (attempt < 2) { await sleep(500); continue; } return 'fail(empty)'; }
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, buf);
      return 'ok';
    } catch (e) {
      if (attempt < 2) { await sleep(800 + attempt * 500); continue; }
      return 'fail(' + (e?.code || e?.name || 'err') + ')';
    }
  }
  return 'fail';
}

async function pool(items, worker, concurrency = 6) {
  const it = items[Symbol.iterator]();
  let done = 0;
  async function run() {
    for (const item of it) {
      await worker(item);
      done++;
      if (done % 20 === 0) process.stdout.write(`  ${done}/${items.length}\n`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => run()));
}

const tasks = [];
for (let id = 1; id <= COUNT; id++) {
  tasks.push({ id, kind: 'front', url: `${BASE}/${id}.png`, dest: join(OUT, `${id}.png`) });
  tasks.push({ id, kind: 'back', url: `${BASE}/back/${id}.png`, dest: join(OUT, 'back', `${id}.png`) });
}

let ok = 0, fail = 0, skip = 0;
console.log(`Downloading ${tasks.length} sprites (front+back, ids 1..${COUNT})...`);
await pool(tasks, async (t) => {
  const r = await download(t.url, t.dest);
  if (r === 'ok') ok++;
  else if (r === 'skip') skip++;
  else { fail++; console.error(`  ${t.kind} #${t.id}: ${r}`); }
});

// misc icons
console.log('Downloading UI icons...');
try {
  await mkdir(ICONS, { recursive: true });
  const r = await download('https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png', join(ICONS, 'pokeball.png'));
  console.log('  pokeball.png:', r);
} catch (e) {
  console.warn('  icon download failed (non-fatal):', e.message);
}

console.log(`\nDone. ok=${ok} skip=${skip} fail=${fail}`);
if (fail > 0) console.log('Some sprites failed (the game still works with fallback icons).');
