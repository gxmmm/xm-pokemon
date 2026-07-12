/**
 * BattleSprite - loads Pokemon front/back pixel sprites and draws them on the
 * battle canvas, with per-frame effect overlays (hit flash, faint, cast glow,
 * status tint). Falls back to a procedurally-drawn type-colored pixel creature
 * when the sprite is missing or fails to load, so every battle renders even
 * offline. Sprites live at /sprites/pokemon/{id}.png and /back/{id}.png.
 */
import type { StatusKind, TypeName } from '@pokemon-online/shared';
import { TYPE_COLORS } from '@pokemon-online/config';

const cache = new Map<string, HTMLImageElement | null>();
const loading = new Set<string>();

function key(speciesId: number, back: boolean): string {
  return `${speciesId}-${back ? 'b' : 'f'}`;
}

/** Kick off loading a sprite (fire-and-forget). Resolves cache to the image or
 *  null on failure. */
export function preloadPokemon(speciesId: number, back: boolean): void {
  const k = key(speciesId, back);
  if (cache.has(k) || loading.has(k)) return;
  loading.add(k);
  const img = new Image();
  img.src = `/sprites/pokemon/${back ? 'back/' : ''}${speciesId}.png`;
  img.onload = () => { cache.set(k, img); loading.delete(k); };
  img.onerror = () => { cache.set(k, null); loading.delete(k); };
}

export function getPokemonImage(speciesId: number, back: boolean): HTMLImageElement | null {
  return cache.get(key(speciesId, back)) ?? null;
}

export interface DrawPokemonOpts {
  speciesId: number;
  back: boolean;
  types: TypeName[];
  cx: number; // screen center px
  cy: number;
  size: number;
  facing: 1 | -1;
  /** 0..1 hit brightness flash (briefly brightens the sprite, NOT a white box). */
  hitFlash?: number;
  /** 0..1 knockback: sprite jolts backward (away from facing) on hit. */
  recoil?: number;
  /** overall alpha (faint -> low). */
  alpha?: number;
  /** grayscale amount 0..1 (fainted). */
  gray?: number;
  /** true while casting (charge glow). */
  casting?: boolean;
  status?: StatusKind | null;
  /** walk bob phase 0..1 for subtle motion while moving. */
  bob?: number;
}

export function drawPokemon(ctx: CanvasRenderingContext2D, o: DrawPokemonOpts): void {
  const img = getPokemonImage(o.speciesId, o.back);
  const s = o.size;
  const x = o.cx - s / 2;
  const y = o.cy - s / 2;
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;

  // knockback recoil: shift the whole sprite away from the attacker (backwards
  // relative to facing). Applied here so shadow/sprite/glow all move together.
  const rx = o.recoil ? -o.facing * o.recoil * 8 : 0;
  if (rx) ctx.translate(rx, 0);

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(o.cx, o.cy + s * 0.42, s * 0.32, s * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();

  // bob while moving
  const bobY = o.bob ? Math.sin(o.bob * Math.PI * 2) * s * 0.03 : 0;

  // flip for facing
  if (o.facing === -1) {
    ctx.translate(o.cx, 0);
    ctx.scale(-1, 1);
    ctx.translate(-o.cx, 0);
  }

  // filter: grayscale (fainted) + brightness flash (hit). Brightness flash
  // replaces the old solid-white rect overlay so a hit reads as the sprite
  // flashing bright, not a white box.
  let filter = '';
  if (o.gray) filter += `grayscale(${o.gray}) brightness(0.8) `;
  if (o.hitFlash && o.hitFlash > 0) filter += `brightness(${1 + o.hitFlash * 1.6}) saturate(0.5) `;
  ctx.filter = filter || 'none';

  if (img) {
    ctx.drawImage(img, x, y + bobY, s, s);
  } else {
    drawFallbackCreature(ctx, o.cx, o.cy + bobY, s, o.types);
  }
  ctx.filter = 'none';

  // cast glow
  if (o.casting) {
    const pulse = 0.4 + 0.3 * Math.sin(performance.now() / 120);
    ctx.strokeStyle = `rgba(255,240,150,${pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(o.cx, o.cy + s * 0.05, s * 0.46, s * 0.42, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // status tint
  if (o.status) {
    const tint = STATUS_TINT[o.status];
    if (tint) {
      ctx.globalAlpha = (o.alpha ?? 1) * 0.3;
      ctx.fillStyle = tint;
      ctx.fillRect(x, y + bobY, s, s);
      ctx.globalAlpha = o.alpha ?? 1;
    }
  }
  ctx.restore();
}

const STATUS_TINT: Record<StatusKind, string> = {
  burn: '#ff5a2a',
  poison: '#a33ea1',
  paralyze: '#f7d02c',
  freeze: '#9fd8ff',
  sleep: '#8888aa',
  confuse: '#f95587',
};

// ── procedural fallback: a type-colored pixel creature ────────────────────────
function drawFallbackCreature(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, types: TypeName[]): void {
  const color = TYPE_COLORS[types[0] ?? 'normal'] ?? '#A8A77A';
  const dark = shade(color, -0.35);
  // body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy, s * 0.36, s * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  // belly
  ctx.fillStyle = shade(color, 0.3);
  ctx.beginPath();
  ctx.ellipse(cx, cy + s * 0.1, s * 0.2, s * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  // ears
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.28, cy - s * 0.18);
  ctx.lineTo(cx - s * 0.16, cy - s * 0.4);
  ctx.lineTo(cx - s * 0.08, cy - s * 0.18);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.28, cy - s * 0.18);
  ctx.lineTo(cx + s * 0.16, cy - s * 0.4);
  ctx.lineTo(cx + s * 0.08, cy - s * 0.18);
  ctx.fill();
  // eyes (face right by default; flipped via ctx when facing -1)
  ctx.fillStyle = '#1a1a22';
  ctx.fillRect(cx - s * 0.12, cy - s * 0.06, s * 0.06, s * 0.08);
  ctx.fillRect(cx + s * 0.06, cy - s * 0.06, s * 0.06, s * 0.08);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(cx - s * 0.1, cy - s * 0.05, s * 0.02, s * 0.02);
  ctx.fillRect(cx + s * 0.08, cy - s * 0.05, s * 0.02, s * 0.02);
}

function shade(hex: string, amt: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= (1 + amt); g *= (1 + amt); b *= (1 + amt); }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
