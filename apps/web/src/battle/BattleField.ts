/**
 * BattleField - draws the top-down oval colosseum arena and maps grid cells to
 * screen pixels. A 1:1 stadium background can be dropped in at
 * /sprites/battle/arena-bg.png (1000x700, 20:14); when absent a procedural
 * pixel-art stadium (seat rings) is drawn. The oval floor + grid are always
 * procedural so the arena always renders offline. See sprites/battle/arena-bg.md.
 */
import { BATTLE_GRID } from '@pokemon-online/shared';

export type Biome = 'grass' | 'cave' | 'water' | 'dragon' | 'arena';

/** Internal drawing resolution (20:14 = grid aspect). Scaled to fit the canvas. */
export const ARENA_W = 1000;
export const ARENA_H = 700;
/** Legacy alias kept for any external import. */
export const BATTLE_CELL_PX = ARENA_W / BATTLE_GRID.cols;

let bgImage: HTMLImageElement | null = null;
let bgLoadPromise: Promise<void> | null = null;

export function loadArenaBg(): Promise<void> {
  if (bgLoadPromise) return bgLoadPromise;
  bgLoadPromise = (async () => {
    try {
      const img = new Image();
      img.src = '/sprites/battle/arena-bg.png';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('arena-bg load failed'));
      });
      bgImage = img;
    } catch {
      bgImage = null; // procedural fallback
    }
  })();
  return bgLoadPromise;
}

interface Palette { stands: string; stands2: string; floor: string; floor2: string; line: string; wall: string; wallHi: string; seat: string; }
const PALETTES: Record<Biome, Palette> = {
  grass:  { stands: '#2a3a2a', stands2: '#1e2a1e', floor: '#8fcf6e', floor2: '#74b85a', line: 'rgba(20,40,20,0.20)', wall: '#5a4a2a', wallHi: '#8a7a4a', seat: '#3a4a2a' },
  cave:   { stands: '#2a2538', stands2: '#1a1626', floor: '#6a5a4a', floor2: '#52453a', line: 'rgba(0,0,0,0.30)', wall: '#3a3550', wallHi: '#5a4a6a', seat: '#2a2538' },
  water:  { stands: '#1e3a5a', stands2: '#162a44', floor: '#4a90e2', floor2: '#3a78c8', line: 'rgba(255,255,255,0.20)', wall: '#2a4a7a', wallHi: '#5a7aaa', seat: '#1e3a5a' },
  dragon: { stands: '#2a1a3a', stands2: '#1a0f28', floor: '#4a2a5a', floor2: '#381f48', line: 'rgba(180,120,255,0.24)', wall: '#2a1a3a', wallHi: '#6f35fc', seat: '#241634' },
  arena:  { stands: '#2a3040', stands2: '#1c2230', floor: '#7a7a86', floor2: '#646470', line: 'rgba(255,255,255,0.16)', wall: '#3a3a4a', wallHi: '#d4af37', seat: '#262c3a' },
};

interface Geom { x0: number; y0: number; x1: number; y1: number; cx: number; cy: number; a: number; b: number; }
function geom(W: number, H: number): Geom {
  // Oval floor inset: leave wider top/bottom margins (12%) so the battle log
  // and controls can overlay the stands without covering the floor.
  const x0 = W * 0.06, y0 = H * 0.08, x1 = W * 0.94, y1 = H * 0.88;
  return { x0, y0, x1, y1, cx: W / 2, cy: H / 2, a: (x1 - x0) / 2, b: (y1 - y0) / 2 };
}

/** Map a grid cell (continuous gx, gy) to screen pixel center. Linear top-down. */
export function project(gx: number, gy: number, W: number = ARENA_W, H: number = ARENA_H): { x: number; y: number } {
  const g = geom(W, H);
  return {
    x: g.x0 + ((gx + 0.5) / BATTLE_GRID.cols) * (g.x1 - g.x0),
    y: g.y0 + ((gy + 0.5) / BATTLE_GRID.rows) * (g.y1 - g.y0),
  };
}

function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = (h ^ (h >>> 13)) * 1274126177 >>> 0;
  return (h % 1000) / 1000;
}

export function drawField(ctx: CanvasRenderingContext2D, biome: Biome, W: number, H: number): void {
  const p = PALETTES[biome] ?? PALETTES.grass;
  const g = geom(W, H);
  ctx.imageSmoothingEnabled = false;

  // ── stands / stadium background ──
  if (bgImage) {
    ctx.drawImage(bgImage, 0, 0, W, H);
  } else {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, p.stands2);
    grad.addColorStop(1, p.stands);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // concentric seat rings around the oval
    for (let r = 1.12; r <= 1.6; r += 0.12) {
      ctx.strokeStyle = p.seat;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(g.cx, g.cy, g.a * r, g.b * r, 0, 0, Math.PI * 2);
      ctx.stroke();
      // seat dots along the ring
      const n = Math.round(40 * r);
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2;
        const sx = g.cx + Math.cos(ang) * g.a * r;
        const sy = g.cy + Math.sin(ang) * g.b * r;
        ctx.fillStyle = hash2(i, Math.round(r * 10)) > 0.5 ? p.stands2 : p.seat;
        ctx.fillRect(sx - 1, sy - 1, 2, 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  // ── oval floor ──
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(g.cx, g.cy, g.a * 1.03, g.b * 1.03, 0, 0, Math.PI * 2);
  ctx.clip();
  const fg = ctx.createLinearGradient(0, g.cy - g.b, 0, g.cy + g.b);
  fg.addColorStop(0, p.floor2);
  fg.addColorStop(0.5, p.floor);
  fg.addColorStop(1, p.floor2);
  ctx.fillStyle = fg;
  ctx.fillRect(g.x0, g.y0, g.x1 - g.x0, g.y1 - g.y0);
  // floor texture (no grid lines - the arena reads as an open field)
  for (let gy = 0; gy < BATTLE_GRID.rows; gy++) {
    for (let gx = 0; gx < BATTLE_GRID.cols; gx++) {
      const r = hash2(gx, gy);
      if (r > 0.8) {
        const sp = project(gx, gy, W, H);
        ctx.fillStyle = p.floor2;
        ctx.fillRect(sp.x - 2, sp.y - 2, 3, 3);
      }
    }
  }
  // side tint: player left, enemy right
  ctx.fillStyle = 'rgba(80,140,220,0.10)';
  ctx.fillRect(g.x0, g.y0, (g.x1 - g.x0) * 0.2, g.y1 - g.y0);
  ctx.fillStyle = 'rgba(220,90,90,0.10)';
  ctx.fillRect(g.x0 + (g.x1 - g.x0) * 0.8, g.y0, (g.x1 - g.x0) * 0.2, g.y1 - g.y0);
  ctx.restore();

  // ── oval arena wall ──
  ctx.lineWidth = 5;
  ctx.strokeStyle = p.wall;
  ctx.beginPath();
  ctx.ellipse(g.cx, g.cy, g.a * 1.03, g.b * 1.03, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = p.wallHi;
  ctx.beginPath();
  ctx.ellipse(g.cx, g.cy, g.a * 1.03, g.b * 1.03, 0, 0, Math.PI * 2);
  ctx.stroke();
}
