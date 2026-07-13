/**
 * BattleSprite - loads Pokemon front/back pixel sprites and draws them on the
 * battle canvas, with per-frame effect overlays (hit flash + squash, faint,
 * cast charge-up, status aura, status tint). Falls back to a procedurally-
 * drawn type-colored pixel creature when the sprite is missing or fails to
 * load, so every battle renders even offline.
 * Sprites live at /sprites/pokemon/{id}.png and /back/{id}.png.
 *
 * Continuous overlays (status aura, cast charge) are procedural by default but
 * honor optional 1:1 sprites at /sprites/effects/status/<status>.png and
 * /sprites/effects/cast/<type>.png (see sprites/effects/README.md).
 */
import type { StatusKind, TypeName } from '@pokemon-online/shared';
import { TYPE_COLORS } from '@pokemon-online/config';
import { getFxImage } from './BattleEffects.ts';

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
  /** 0..1 hit brightness flash (briefly brightens the sprite, NOT a white box).
   *  Also drives the squash/stretch punch + recoil. */
  hitFlash?: number;
  /** 0..1 knockback: sprite jolts backward (away from facing) + small hop on hit. */
  recoil?: number;
  /** Short event-driven action offset; no continuous idle motion. */
  actionDx?: number;
  actionDy?: number;
  actionTilt?: number;
  actionScale?: number;
  /** overall alpha (faint -> low). */
  alpha?: number;
  /** grayscale amount 0..1 (fainted). */
  gray?: number;
  /** true while casting (charge-up draws). */
  casting?: boolean;
  /** 0..1 charge progress (0 = just started, 1 = about to fire). */
  castFrac?: number;
  /** skill element type for charge color theming. */
  castType?: TypeName;
  /** readable name displayed with the local charge bar. */
  castName?: string;
  /** 0..1 faint animation progress (scales down + sinks + fades). */
  faint?: number;
  status?: StatusKind | null;
  /** walk bob phase 0..1 for subtle motion while moving. */
  bob?: number;
}

export function drawPokemon(ctx: CanvasRenderingContext2D, o: DrawPokemonOpts): void {
  const img = getPokemonImage(o.speciesId, o.back);
  const s = o.size;
  const x = o.cx - s / 2;
  const y = o.cy - s / 2;
  const now = performance.now() / 1000;
  const h = o.hitFlash ?? 0;
  const fp = o.faint ?? 0;
  const faintScale = 1 - fp * 0.4;

  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;

  // knockback recoil + hop (applies to the sprite group; shadow stays grounded)
  const rx = o.recoil ? -o.facing * o.recoil * 12 : 0;
  const ry = o.recoil ? -o.recoil * 4 : 0; // hop up

  // shadow (ground; shrinks + fades with faint)
  const sh = 1 - fp * 0.6;
  ctx.fillStyle = `rgba(0,0,0,${0.22 * (1 - fp * 0.5)})`;
  ctx.beginPath();
  ctx.ellipse(o.cx, o.cy + s * 0.42, s * 0.32 * sh, s * 0.09 * sh, 0, 0, Math.PI * 2);
  ctx.fill();

  // cast charge-up (ground rune circle + converging particles) - world space,
  // drawn under the sprite. Procedural; cast/<type>.png overrides the core.
  if (o.casting) drawCastCharge(ctx, o.cx, o.cy + s * 0.42, s, o.castFrac ?? 0, o.castType);

  // sprite group: recoil/hop/faint-sink translate, facing flip, hit squash
  ctx.save();
  ctx.translate((o.actionDx ?? 0) + rx, (o.actionDy ?? 0) + ry + fp * s * 0.18); // action, hit recoil + faint sink
  if (o.facing === -1) {
    ctx.translate(o.cx, 0);
    ctx.scale(-1, 1);
    ctx.translate(-o.cx, 0);
  }
  // squash & stretch on hit: horizontal compress, vertical stretch, eases back
  // as `h` decays. Combined with faint shrink. (Toned down from 0.14/0.16 so
  // rapid hits don't read as twitching.)
  const sx = (1 - h * 0.12) * faintScale;
  const sy = (1 + h * 0.14) * faintScale;
  const cy2 = o.cy + s * 0.05; // sprite vertical pivot
  ctx.translate(o.cx, cy2);
  ctx.rotate(o.actionTilt ?? 0);
  const actionScale = o.actionScale ?? 1;
  ctx.scale(sx * actionScale, sy * actionScale);
  ctx.translate(-o.cx, -cy2);

  // filter: grayscale (fainted) + brightness flash (hit). Brightness flash
  // replaces the old solid-white rect overlay so a hit reads as the sprite
  // flashing bright, not a white box. (Capped at +1.0 so it isn't blinding.)
  let filter = '';
  if (o.gray) filter += `grayscale(${o.gray}) brightness(0.8) `;
  if (h > 0) filter += `brightness(${1 + h * 1.0}) saturate(0.5) `;
  ctx.filter = filter || 'none';

  if (img) {
    ctx.drawImage(img, x, y, s, s);
  } else {
    drawFallbackCreature(ctx, o.cx, o.cy, s, o.types);
  }
  ctx.filter = 'none';

  ctx.restore(); // pop sprite group (flip + squash + recoil)

  // Statuses use transparent particles only. A sprite-aligned tint rectangle
  // made transparent PNG creatures look as if they had an opaque color box.
  if (o.status) drawStatusAura(ctx, o.cx, o.cy, s, o.status, now);
  if (o.casting && o.castName) drawCastLabel(ctx, o.cx, o.cy - s * 0.62, s, o.castName, o.castFrac ?? 0, o.castType);

  ctx.restore();
}

/** A compact local readout makes a windup understandable without relying on the
 * scrolling battle log: move name above the caster plus a transparent progress bar. */
function drawCastLabel(ctx: CanvasRenderingContext2D, cx: number, y: number, s: number, name: string, frac: number, type?: TypeName): void {
  const color = (type && TYPE_COLORS[type]) || '#ffd24a';
  const label = name.length > 10 ? `${name.slice(0, 9)}…` : name;
  ctx.save();
  ctx.font = 'bold 13px system-ui, sans-serif';
  const textW = Math.ceil(ctx.measureText(label).width);
  const w = Math.max(s * 0.88, textW + 24);
  const h = 27;
  const x = cx - w / 2;
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = 'rgba(8,13,26,0.88)';
  ctx.fillRect(x, y - h, w, h);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y - h + 0.5, w - 1, h - 1);
  ctx.fillStyle = '#f5f8ff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, y - 18);
  const barX = x + 7, barY = y - 9, barW = w - 14, barH = 4;
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = color;
  ctx.fillRect(barX, barY, Math.max(2, barW * Math.max(0, Math.min(1, frac))), barH);
  ctx.restore();
}

/** Charge-up visual while castProgress is active. `frac` 0..1 ramps intensity;
 *  particles spiral inward and a core brightens as the skill is about to fire. */
function drawCastCharge(ctx: CanvasRenderingContext2D, cx: number, gy: number, s: number, frac: number, type?: TypeName): void {
  const color = (type && TYPE_COLORS[type]) || '#ffd24a';
  const bodyY = gy - s * 0.15;
  // ground rune circle (grows with progress)
  const gr = s * (0.3 + frac * 0.18);
  ctx.globalAlpha = 0.3 + frac * 0.4;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, gy, gr, gr * 0.35, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.2 + frac * 0.3;
  ctx.beginPath();
  ctx.ellipse(cx, gy, gr * 0.6, gr * 0.6 * 0.35, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.globalCompositeOperation = 'lighter';
  const img = type ? getFxImage(`cast/${type}`) : null;
  if (img) {
    // 1:1 cast sprite overrides the procedural particles
    const sz = s * (0.5 + frac * 0.3);
    ctx.globalAlpha = 0.5 + frac * 0.5;
    ctx.drawImage(img, cx - sz / 2, bodyY - sz / 2, sz, sz);
  } else {
    // converging particles spiraling inward as frac -> 1
    const n = 8;
    const t = performance.now() / 1000;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + t * 3;
      const r = s * 0.5 * (1 - frac);
      const px = cx + Math.cos(a) * r;
      const py = bodyY + Math.sin(a) * r * 0.6;
      ctx.globalAlpha = 0.5 + frac * 0.5;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, 2 + frac * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // bright core ramps in over the second half
    if (frac > 0.5) {
      const ca = (frac - 0.5) * 2;
      const grad = ctx.createRadialGradient(cx, bodyY, 0, cx, bodyY, s * 0.3);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = ca * 0.7;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, bodyY, s * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

/** Continuous ambient particles for an active status, drawn around the creature
 *  each frame so the field reads as alive and statuses are identifiable at a
 *  glance. status/<status>.png overrides the procedural particles. */
function drawStatusAura(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, status: StatusKind, t: number): void {
  const img = getFxImage(`status/${status}`);
  if (img) {
    const sz = s * 0.9;
    ctx.globalAlpha = 0.6 + 0.2 * Math.sin(t * 6);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(img, cx - sz / 2, cy - s * 0.1 - sz / 2, sz, sz);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    return;
  }
  ctx.globalCompositeOperation = 'lighter';
  switch (status) {
    case 'burn': {
      for (let i = 0; i < 5; i++) {
        const ph = (t * 1.5 + i * 0.37) % 1;
        const px = cx + Math.sin(t * 4 + i) * s * 0.18;
        const py = cy + s * 0.3 - ph * s * 0.6;
        ctx.globalAlpha = (1 - ph) * 0.8;
        ctx.fillStyle = ph < 0.5 ? '#ffd24a' : '#ff5a2a';
        ctx.beginPath();
        ctx.arc(px, py, 2 + (1 - ph) * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'poison': {
      for (let i = 0; i < 4; i++) {
        const ph = (t + i * 0.5) % 1;
        const px = cx + Math.sin(t * 2 + i * 2) * s * 0.2;
        const py = cy + s * 0.3 - ph * s * 0.5;
        ctx.globalAlpha = (1 - ph) * 0.7;
        ctx.strokeStyle = '#a33ea1';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(px, py, 2 + ph * 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case 'paralyze': {
      for (let i = 0; i < 6; i++) {
        const a = (t * 8 + i * 1.7) % (Math.PI * 2);
        const r = s * 0.32;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r * 0.7;
        if (Math.sin(t * 20 + i) <= 0.3) continue;
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = '#f7d02c';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px - 2, py); ctx.lineTo(px + 2, py);
        ctx.moveTo(px, py - 2); ctx.lineTo(px, py + 2);
        ctx.stroke();
      }
      break;
    }
    case 'freeze': {
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#9fd8ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(cx, cy, s * 0.34, s * 0.32, 0, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + t * 0.5;
        const r = s * 0.36;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = '#cfeeff';
        ctx.fillRect(px - 1, py - 1, 2, 2);
      }
      break;
    }
    case 'sleep': {
      for (let i = 0; i < 2; i++) {
        const ph = (t * 0.8 + i * 0.5) % 1;
        const px = cx + s * 0.2 + ph * s * 0.2;
        const py = cy - s * 0.3 - ph * s * 0.4;
        ctx.globalAlpha = (1 - ph) * 0.8;
        ctx.fillStyle = '#aab0c0';
        ctx.font = `bold ${10 + ph * 4}px monospace`;
        ctx.fillText('Z', px, py);
      }
      break;
    }
    case 'confuse': {
      for (let i = 0; i < 3; i++) {
        const a = t * 4 + (i * Math.PI * 2) / 3;
        const r = s * 0.3;
        const px = cx + Math.cos(a) * r;
        const py = cy - s * 0.25 + Math.sin(a) * r * 0.5;
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = '#f95587';
        ctx.fillRect(px - 2, py - 0.5, 4, 1);
        ctx.fillRect(px - 0.5, py - 2, 1, 4);
      }
      break;
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

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
