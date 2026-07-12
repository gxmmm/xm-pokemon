#!/usr/bin/env node
/**
 * Optional: download an external tileset + hero sprite sheet for the world
 * renderer and emit the matching atlas.json. The world already runs on a
 * built-in procedurally-drawn stylized tileset, so this is ONLY needed to
 * swap in nicer / 1:1 art.
 *
 * Usage:
 *   node scripts/download-tileset.mjs                              # print spec + help
 *   node scripts/download-tileset.mjs <tileset.png-url> <hero.png-url>
 *
 * ── Asset spec (what the renderer expects) ──────────────────────────────
 * apps/web/public/sprites/tiles/tileset.png  — 32x32 tiles, 4 cols x 4 rows
 *     code -> (col = code % 4, row = floor(code / 4)):
 *       0 grass  1 tree  2 water  3 tall-grass  4 path  5 sand  6 rock  7 door
 *       8 flower 9 building 10 sign 11 water-edge 12 cave-entrance 13 dock
 * apps/web/public/sprites/tiles/atlas.json  — { "0":{"x":0,"y":0}, ... } (px)
 * apps/web/public/sprites/char/hero.png     — 32x32 frames, 3 cols (frames) x 4 rows
 *     rows: 0 down 1 left 2 right 3 up ; frames: 0 left-foot 1 stand 2 right-foot
 * apps/web/public/sprites/char/atlas.json   — { "frames":3, "rows":{"down":0,"left":1,"right":2,"up":3} }
 *
 * To use 1:1 Pokemon art: drop your tileset.png + hero.png into the folders
 * above with a matching layout (or adjust atlas.json coordinates). The
 * renderer picks up external assets automatically and falls back to the
 * built-in stylized tiles whenever a file is missing.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TILES_DIR = join(ROOT, 'apps/web/public/sprites/tiles');
const CHAR_DIR = join(ROOT, 'apps/web/public/sprites/char');

const TILE_URL = process.argv[2] || '';
const HERO_URL = process.argv[3] || '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function download(url, dest) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) { if (attempt < 2) { await sleep(500); continue; } return `fail(${res.status})`; }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 100) { if (attempt < 2) { await sleep(500); continue; } return 'fail(empty)'; }
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, buf);
      return 'ok';
    } catch (e) {
      if (attempt < 2) await sleep(500);
      else return 'fail(' + (e?.message || 'error') + ')';
    }
  }
  return 'fail';
}

// atlas for the default 4x4 tile layout (32px tiles)
const TILE_ATLAS = {};
for (let code = 0; code < 16; code++) {
  TILE_ATLAS[code] = { x: (code % 4) * 32, y: Math.floor(code / 4) * 32 };
}
const CHAR_ATLAS = { frames: 3, rows: { down: 0, left: 1, right: 2, up: 3 } };

async function main() {
  await mkdir(TILES_DIR, { recursive: true });
  await mkdir(CHAR_DIR, { recursive: true });

  if (!TILE_URL && !HERO_URL) {
    console.log('未提供素材 URL。世界渲染器使用内置程序化风格化瓦片，无需外部素材即可运行。');
    console.log('要换用自有/1:1 素材，运行：');
    console.log('  node scripts/download-tileset.mjs <tileset.png-url> <hero.png-url>');
    console.log('（素材规范见本文件顶部注释）');
    return;
  }

  if (TILE_URL) {
    const r = await download(TILE_URL, join(TILES_DIR, 'tileset.png'));
    console.log('tileset.png:', r);
    if (r === 'ok') await writeFile(join(TILES_DIR, 'atlas.json'), JSON.stringify(TILE_ATLAS, null, 2));
  }
  if (HERO_URL) {
    const r = await download(HERO_URL, join(CHAR_DIR, 'hero.png'));
    console.log('hero.png:', r);
    if (r === 'ok') await writeFile(join(CHAR_DIR, 'atlas.json'), JSON.stringify(CHAR_ATLAS, null, 2));
  }
  console.log('完成。未下载成功的部分将使用内置程序化兜底。');
}

main().catch((e) => { console.error(e); process.exit(1); });
