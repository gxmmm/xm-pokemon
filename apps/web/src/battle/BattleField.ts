/**
 * @canvas-archive-only
 * Archived Canvas compatibility/regression source. It must remain in the
 * repository, but must not be imported, mounted, dynamically loaded, offered
 * as a fallback, or extended by official GPU/Pixi world or battle runtime code.
 */
/**
 * BattleField - a layered, biome-aware combat diorama.  The simulation still
 * owns a rectangular tactical grid, but it is projected onto a perspective
 * field instead of an abstract oval stadium.  This keeps positions deterministic
 * while giving each encounter a place in the world.
 */
import { BATTLE_GRID } from '@pokemon-online/shared';

export type Biome = 'grass' | 'cave' | 'water' | 'dragon' | 'arena';

/** Internal drawing resolution (20:14 = grid aspect). */
export const ARENA_W = 1000;
export const ARENA_H = 700;
/** Legacy alias kept for any external import. */
export const BATTLE_CELL_PX = ARENA_W / BATTLE_GRID.cols;

type Point = { x: number; y: number };
type Side = 'player' | 'enemy';

interface Palette {
  skyTop: string; skyBottom: string; horizon: string; ground: string; groundDark: string;
  groundLight: string; edge: string; edgeLight: string; accent: string; mote: string;
}

const PALETTES: Record<Biome, Palette> = {
  grass:  { skyTop: '#213f62', skyBottom: '#8ec6a2', horizon: '#285b45', ground: '#6fa95e', groundDark: '#477a45', groundLight: '#9ad879', edge: '#2c5636', edgeLight: '#b9dd83', accent: '#ffd77a', mote: '#d7f29a' },
  cave:   { skyTop: '#171625', skyBottom: '#4a3b4c', horizon: '#2a2634', ground: '#66574c', groundDark: '#3e3540', groundLight: '#877260', edge: '#292535', edgeLight: '#9f8190', accent: '#f5b76d', mote: '#f1c77c' },
  water:  { skyTop: '#173553', skyBottom: '#83c9de', horizon: '#245f83', ground: '#438fb0', groundDark: '#236783', groundLight: '#72c8dc', edge: '#194964', edgeLight: '#a9e8ed', accent: '#f7db83', mote: '#d2f8ff' },
  dragon: { skyTop: '#120e2b', skyBottom: '#4a2866', horizon: '#241541', ground: '#513562', groundDark: '#302143', groundLight: '#8154a0', edge: '#211537', edgeLight: '#b78aff', accent: '#ffcf74', mote: '#efb8ff' },
  arena:  { skyTop: '#20283b', skyBottom: '#657287', horizon: '#343d50', ground: '#77736b', groundDark: '#4d4c4c', groundLight: '#aaa28b', edge: '#3a3a40', edgeLight: '#e4c66d', accent: '#e8c96a', mote: '#edf2ff' },
};

let bgImage: HTMLImageElement | null = null;
let bgLoadPromise: Promise<void> | null = null;
const fieldCache = new Map<string, HTMLCanvasElement>();
function clearFieldCache(): void { fieldCache.clear(); }

/** Optional hand-painted backdrop. It sits behind the procedural stage, so a
 * missing asset never changes battle readability. */
export function loadArenaBg(): Promise<void> {
  if (bgLoadPromise) return bgLoadPromise;
  bgLoadPromise = (async () => {
    try {
      const img = new Image();
      img.src = '/sprites/battle/arena-bg.png';
      await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('arena background unavailable')); });
      bgImage = img;
    } catch { bgImage = null; }
    clearFieldCache();
  })();
  return bgLoadPromise;
}

interface StageGeom { tl: Point; tr: Point; br: Point; bl: Point; }
function stageGeom(W: number, H: number): StageGeom {
  // Wide near edge and compact far edge create depth without moving the camera.
  return {
    tl: { x: W * 0.17, y: H * 0.255 }, tr: { x: W * 0.83, y: H * 0.255 },
    br: { x: W * 0.965, y: H * 0.84 }, bl: { x: W * 0.035, y: H * 0.84 },
  };
}

function lerp(a: Point, b: Point, t: number): Point { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
function polygon(ctx: CanvasRenderingContext2D, points: Point[]): void {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
}
function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = (h ^ (h >>> 13)) * 1274126177 >>> 0;
  return (h % 1000) / 1000;
}
function stagePoint(u: number, v: number, g: StageGeom): Point {
  const left = lerp(g.tl, g.bl, v);
  const right = lerp(g.tr, g.br, v);
  return lerp(left, right, u);
}

/** Maps a continuous battle-grid cell to the perspective field. */
export function project(gx: number, gy: number, W: number = ARENA_W, H: number = ARENA_H): Point {
  const g = stageGeom(W, H);
  return stagePoint((gx + 0.5) / BATTLE_GRID.cols, (gy + 0.5) / BATTLE_GRID.rows, g);
}

function drawForest(ctx: CanvasRenderingContext2D, p: Palette, W: number, H: number): void {
  const horizon = H * 0.285;
  ctx.fillStyle = p.horizon;
  for (let x = -20; x < W + 40; x += 22) {
    const h = 26 + hash2(x, 4) * 55;
    ctx.fillRect(x, horizon - h * 0.45, 18, h * 0.7);
    ctx.beginPath(); ctx.arc(x + 9, horizon - h * 0.5, 18 + hash2(x, 7) * 15, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#173c33';
  for (let x = 0; x < W; x += 38) {
    const h = 30 + hash2(x, 19) * 44;
    ctx.fillRect(x + 14, horizon - h * 0.32, 9, h * 0.5);
    ctx.beginPath(); ctx.arc(x + 18, horizon - h * 0.52, 23, 0, Math.PI * 2); ctx.fill();
  }
}

function drawCave(ctx: CanvasRenderingContext2D, p: Palette, W: number, H: number): void {
  ctx.fillStyle = p.horizon;
  polygon(ctx, [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H * 0.37 }, { x: W * 0.74, y: H * 0.25 }, { x: W * 0.48, y: H * 0.31 }, { x: W * 0.2, y: H * 0.23 }, { x: 0, y: H * 0.38 }]); ctx.fill();
  ctx.fillStyle = '#100f1c';
  for (let x = -20; x < W + 40; x += 65) {
    const depth = 36 + hash2(x, 31) * 74;
    polygon(ctx, [{ x, y: 0 }, { x: x + 58, y: 0 }, { x: x + 30, y: depth }]); ctx.fill();
  }
  ctx.fillStyle = p.accent;
  ctx.globalAlpha = 0.26;
  for (let i = 0; i < 9; i++) {
    const x = 70 + i * 112;
    polygon(ctx, [{ x, y: H * 0.3 }, { x: x + 13, y: H * 0.19 }, { x: x + 27, y: H * 0.3 }]); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawWater(ctx: CanvasRenderingContext2D, p: Palette, W: number, H: number): void {
  const y = H * 0.29;
  ctx.fillStyle = p.horizon; ctx.fillRect(0, y, W, H * 0.19);
  ctx.strokeStyle = 'rgba(211,249,255,0.42)'; ctx.lineWidth = 2;
  for (let row = 0; row < 4; row++) {
    const yy = y + 14 + row * 23;
    for (let x = (row % 2) * 23; x < W; x += 54) { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + 24, yy); ctx.stroke(); }
  }
  ctx.fillStyle = '#1b4d5d';
  polygon(ctx, [{ x: 0, y: y + 50 }, { x: 110, y: y - 16 }, { x: 195, y: y + 48 }]); ctx.fill();
  polygon(ctx, [{ x: W - 220, y: y + 55 }, { x: W - 120, y: y - 35 }, { x: W, y: y + 50 }]); ctx.fill();
}

function drawDragon(ctx: CanvasRenderingContext2D, p: Palette, W: number, H: number): void {
  ctx.fillStyle = p.horizon;
  polygon(ctx, [{ x: 0, y: H * 0.39 }, { x: W * 0.17, y: H * 0.21 }, { x: W * 0.31, y: H * 0.34 }, { x: W * 0.53, y: H * 0.15 }, { x: W * 0.72, y: H * 0.34 }, { x: W, y: H * 0.19 }, { x: W, y: H * 0.46 }, { x: 0, y: H * 0.46 }]); ctx.fill();
  ctx.fillStyle = p.edgeLight; ctx.globalAlpha = 0.45;
  for (let i = 0; i < 10; i++) {
    const x = 50 + i * 100;
    const y = H * (0.18 + hash2(i, 61) * 0.15);
    const s = 15 + hash2(i, 64) * 22;
    polygon(ctx, [{ x, y: y + s }, { x: x + s * 0.45, y }, { x: x + s, y: y + s }, { x: x + s * 0.45, y: y + s * 1.3 }]); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawArenaRuins(ctx: CanvasRenderingContext2D, p: Palette, W: number, H: number): void {
  ctx.fillStyle = p.horizon; ctx.fillRect(0, H * 0.25, W, H * 0.17);
  ctx.fillStyle = '#252c37';
  for (let x = 30; x < W; x += 105) {
    const h = 34 + hash2(x, 76) * 35;
    ctx.fillRect(x, H * 0.31 - h, 20, h);
    ctx.fillStyle = p.edgeLight; ctx.globalAlpha = 0.5; ctx.fillRect(x + 4, H * 0.31 - h + 5, 3, h - 10); ctx.globalAlpha = 1; ctx.fillStyle = '#252c37';
  }
}

function drawBackdrop(ctx: CanvasRenderingContext2D, biome: Biome, p: Palette, W: number, H: number): void {
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.56);
  sky.addColorStop(0, p.skyTop); sky.addColorStop(1, p.skyBottom);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  if (bgImage) { ctx.globalAlpha = 0.28; ctx.drawImage(bgImage, 0, 0, W, H); ctx.globalAlpha = 1; }
  if (biome === 'grass') drawForest(ctx, p, W, H);
  else if (biome === 'cave') drawCave(ctx, p, W, H);
  else if (biome === 'water') drawWater(ctx, p, W, H);
  else if (biome === 'dragon') drawDragon(ctx, p, W, H);
  else drawArenaRuins(ctx, p, W, H);
}

function drawStage(ctx: CanvasRenderingContext2D, biome: Biome, p: Palette, W: number, H: number): void {
  const g = stageGeom(W, H);
  const floor = [g.tl, g.tr, g.br, g.bl];
  // A thick, asymmetric stone/earth lip makes the field feel embedded in the biome.
  const underside = [g.bl, g.br, { x: g.br.x - W * 0.018, y: g.br.y + H * 0.075 }, { x: g.bl.x + W * 0.018, y: g.bl.y + H * 0.075 }];
  ctx.fillStyle = p.edge; polygon(ctx, underside); ctx.fill();
  ctx.fillStyle = p.edgeLight; ctx.globalAlpha = 0.45; ctx.fillRect(g.bl.x + 30, g.bl.y + 19, g.br.x - g.bl.x - 60, 4); ctx.globalAlpha = 1;

  polygon(ctx, floor); ctx.save(); ctx.clip();
  const ground = ctx.createLinearGradient(0, g.tl.y, 0, g.bl.y);
  ground.addColorStop(0, p.groundDark); ground.addColorStop(0.52, p.ground); ground.addColorStop(1, p.groundLight);
  ctx.fillStyle = ground; ctx.fillRect(0, g.tl.y, W, g.bl.y - g.tl.y + 2);

  // Broken terrain facets: visible texture without a tactical grid overlay.
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 16; col++) {
      const r = hash2(col + 91, row + 17);
      if (r < 0.47) continue;
      const u = (col + r * 0.6) / 16;
      const v = (row + hash2(col, row) * 0.8) / 8;
      const at = stagePoint(u, v, g);
      const sz = 2 + r * 6 + v * 4;
      ctx.globalAlpha = 0.08 + r * 0.11;
      ctx.fillStyle = r > 0.75 ? p.groundLight : p.groundDark;
      ctx.fillRect(at.x - sz / 2, at.y - sz * 0.24, sz, Math.max(2, sz * 0.42));
    }
  }
  // World-specific surface marks.
  if (biome === 'water') {
    ctx.strokeStyle = 'rgba(213,251,255,0.28)'; ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) { const at = stagePoint(hash2(i, 9), hash2(i, 10), g); ctx.beginPath(); ctx.moveTo(at.x - 18, at.y); ctx.lineTo(at.x + 22, at.y - 2); ctx.stroke(); }
  } else if (biome === 'dragon') {
    ctx.strokeStyle = 'rgba(221,171,255,0.24)'; ctx.lineWidth = 2;
    for (let i = 0; i < 11; i++) { const at = stagePoint(hash2(i, 12), hash2(i, 13), g); ctx.beginPath(); ctx.moveTo(at.x - 10, at.y + 6); ctx.lineTo(at.x, at.y - 5); ctx.lineTo(at.x + 12, at.y + 3); ctx.stroke(); }
  } else if (biome === 'grass') {
    ctx.strokeStyle = 'rgba(226,255,170,0.28)'; ctx.lineWidth = 1;
    for (let i = 0; i < 26; i++) { const at = stagePoint(hash2(i, 21), hash2(i, 24), g); ctx.beginPath(); ctx.moveTo(at.x, at.y + 5); ctx.lineTo(at.x + 2, at.y - 4); ctx.stroke(); }
  }
  ctx.restore();

  ctx.strokeStyle = p.edge; ctx.lineWidth = 7; polygon(ctx, floor); ctx.stroke();
  ctx.strokeStyle = p.edgeLight; ctx.globalAlpha = 0.75; ctx.lineWidth = 2; polygon(ctx, floor); ctx.stroke(); ctx.globalAlpha = 1;
  // Directional entry markers replace old whole-side colour washes.
  const left = stagePoint(0.03, 0.78, g), right = stagePoint(0.97, 0.22, g);
  drawBanner(ctx, left, '#5cbbff', -1); drawBanner(ctx, right, '#ff8181', 1);
}

function drawBanner(ctx: CanvasRenderingContext2D, at: Point, color: string, dir: -1 | 1): void {
  ctx.fillStyle = '#172033'; ctx.fillRect(at.x - 3, at.y - 42, 6, 44);
  ctx.fillStyle = color;
  polygon(ctx, [{ x: at.x, y: at.y - 40 }, { x: at.x + dir * 42, y: at.y - 32 }, { x: at.x, y: at.y - 18 }]); ctx.fill();
}

function paintFieldBase(ctx: CanvasRenderingContext2D, biome: Biome, W: number, H: number): void {
  const p = PALETTES[biome] ?? PALETTES.grass;
  ctx.imageSmoothingEnabled = false;
  drawBackdrop(ctx, biome, p, W, H);
  drawStage(ctx, biome, p, W, H);
  // Sparse static motes in the back layer; the live canvas adds drifting motes.
  ctx.fillStyle = p.mote;
  for (let i = 0; i < 22; i++) {
    const x = hash2(i, 112) * W, y = 28 + hash2(i, 114) * H * 0.32;
    ctx.globalAlpha = 0.08 + hash2(i, 117) * 0.16;
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;
}

/** Draw a cached immutable biome scene. */
export function drawField(ctx: CanvasRenderingContext2D, biome: Biome, W: number, H: number): void {
  const key = `${biome}:${W}x${H}:${bgImage ? 'image' : 'procedural'}`;
  let cached = fieldCache.get(key);
  if (!cached) {
    cached = document.createElement('canvas'); cached.width = W; cached.height = H;
    const base = cached.getContext('2d'); if (base) paintFieldBase(base, biome, W, H);
    fieldCache.set(key, cached);
  }
  ctx.drawImage(cached, 0, 0, W, H);
}

/** A low hexagonal formation plate anchors each creature to the perspective field
 * without reintroducing the old ellipse arena language. */
export function drawCombatantPlatform(ctx: CanvasRenderingContext2D, x: number, y: number, side: Side, alive: boolean, size: number): void {
  const color = side === 'player' ? '#5ab7ff' : '#ff7777';
  const w = size * 0.42, h = size * 0.115;
  const points: Point[] = [
    { x: x - w, y: y }, { x: x - w * 0.48, y: y - h }, { x: x + w * 0.48, y: y - h },
    { x: x + w, y: y }, { x: x + w * 0.48, y: y + h }, { x: x - w * 0.48, y: y + h },
  ];
  ctx.save();
  ctx.globalAlpha = alive ? 0.42 : 0.16;
  ctx.fillStyle = '#111b28'; polygon(ctx, points); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = color; polygon(ctx, points); ctx.stroke();
  ctx.globalAlpha = alive ? 0.3 : 0.1;
  ctx.fillStyle = color; polygon(ctx, [points[1], points[2], { x, y }]); ctx.fill();
  ctx.restore();
}
