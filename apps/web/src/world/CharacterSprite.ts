/**
 * @canvas-archive-only
 * Archived Canvas compatibility/regression source. It must remain in the
 * repository, but must not be imported, mounted, dynamically loaded, offered
 * as a fallback, or extended by official GPU/Pixi world or battle runtime code.
 */
/**
 * CharacterSprite - loads the hero sprite sheet (4 directions x 3 walk frames)
 * or falls back to a procedurally-drawn pixel character. Sheet layout:
 * columns = frame (0 left-foot, 1 stand, 2 right-foot), rows = facing
 * (0 down, 1 left, 2 right, 3 up). Replace char/hero.png + atlas.json to
 * swap in 1:1 art without touching code.
 */
import type { Facing } from '@pokemon-online/shared';

export const CHAR_SIZE = 32;
export const CHAR_FRAMES = 3;

/** atlas.json: which sheet row holds each facing (0-3). */
interface CharAtlas {
  frames: number;
  rows: Record<Facing, number>;
}

const ROW: Record<Facing, number> = { down: 0, left: 1, right: 2, up: 3 };

let charImage: HTMLImageElement | null = null;
let charAtlas: CharAtlas | null = null;
let fallback: HTMLCanvasElement | null = null;
let loadPromise: Promise<void> | null = null;

export function loadCharacter(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    fallback = buildFallbackChar();
    try {
      const res = await fetch('/sprites/char/atlas.json', { cache: 'force-cache' });
      if (!res.ok) return;
      charAtlas = (await res.json()) as CharAtlas;
      const img = new Image();
      img.src = '/sprites/char/hero.png';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('char image load failed'));
      });
      charImage = img;
    } catch {
      charImage = null;
      charAtlas = null;
    }
  })();
  return loadPromise;
}

export function isCharacterReady(): boolean {
  return fallback !== null;
}

/** Draw the hero at screen pixel (dx,dy) facing `facing` on walk `frame` (0..2). */
export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  facing: Facing,
  frame: number,
  dx: number,
  dy: number,
  size: number = CHAR_SIZE,
): void {
  const f = ((Math.round(frame) % CHAR_FRAMES) + CHAR_FRAMES) % CHAR_FRAMES;
  if (charImage && charAtlas) {
    const row = charAtlas.rows[facing] ?? ROW[facing];
    ctx.drawImage(charImage, f * CHAR_SIZE, row * CHAR_SIZE, CHAR_SIZE, CHAR_SIZE, dx, dy, size, size);
    return;
  }
  if (fallback) {
    ctx.drawImage(fallback, f * CHAR_SIZE, ROW[facing] * CHAR_SIZE, CHAR_SIZE, CHAR_SIZE, dx, dy, size, size);
  }
}

export type NpcPalette = 'researcher' | 'rival' | 'scout' | 'villager';

/** Draw a compact NPC using the same walk-frame language as the hero. NPC art
 * stays original/procedural until a project-owned NPC sheet is supplied. */
export function drawNpc(
  ctx: CanvasRenderingContext2D,
  palette: NpcPalette,
  facing: Facing,
  frame: number,
  dx: number,
  dy: number,
  size: number = CHAR_SIZE,
): void {
  const scale = size / CHAR_SIZE;
  const colors: Record<NpcPalette, { skin: string; hair: string; shirt: string; dark: string; pants: string }> = {
    researcher: { skin: '#f0c59b', hair: '#d9e9f7', shirt: '#f4f5ea', dark: '#91b7d1', pants: '#33415c' },
    rival: { skin: '#e9b98a', hair: '#24304d', shirt: '#d64b5f', dark: '#9c2f45', pants: '#252738' },
    scout: { skin: '#c98f68', hair: '#4e3324', shirt: '#5a8d62', dark: '#365d43', pants: '#2e3c37' },
    villager: { skin: '#e7b987', hair: '#6e4a2a', shirt: '#d5a15d', dark: '#9b7041', pants: '#4d4a5b' },
  };
  const c = colors[palette];
  const leg = frame === 1 ? 0 : frame === 0 ? -2 : 2;
  ctx.save(); ctx.translate(dx, dy); ctx.scale(scale, scale);
  ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(16, 29, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = c.pants; ctx.fillRect(11, 22, 4, 7 + leg); ctx.fillRect(17, 22, 4, 7 - leg);
  ctx.fillStyle = c.shirt; ctx.fillRect(10, 14, 12, 10); ctx.fillRect(7, 15, 3, 7); ctx.fillRect(22, 15, 3, 7);
  ctx.fillStyle = c.dark; ctx.fillRect(10, 22, 12, 2);
  ctx.fillStyle = c.skin; ctx.fillRect(11, 5, 10, 10);
  ctx.fillStyle = c.hair; ctx.fillRect(10, 4, 12, 4);
  if (facing === 'up') ctx.fillRect(11, 4, 10, 8);
  else { ctx.fillRect(10, 4, 3, 8); ctx.fillRect(19, 4, 3, 8); }
  ctx.fillStyle = '#252535';
  if (facing === 'down') { ctx.fillRect(13, 10, 2, 2); ctx.fillRect(17, 10, 2, 2); }
  else if (facing === 'left') ctx.fillRect(13, 10, 2, 2);
  else if (facing === 'right') ctx.fillRect(17, 10, 2, 2);
  ctx.restore();
}

// ── procedural fallback: a simple pixel hero ─────────────────────────────────

function buildFallbackChar(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = CHAR_FRAMES * CHAR_SIZE;
  cv.height = 4 * CHAR_SIZE;
  const ctx = cv.getContext('2d')!;
  const facings: Facing[] = ['down', 'left', 'right', 'up'];
  facings.forEach((facing, r) => {
    for (let f = 0; f < CHAR_FRAMES; f++) {
      drawHero(ctx, facing, f, f * CHAR_SIZE, r * CHAR_SIZE);
    }
  });
  return cv;
}

function drawHero(ctx: CanvasRenderingContext2D, facing: Facing, frame: number, x: number, y: number): void {
  const s = CHAR_SIZE;
  // frame 1 = stand (no leg offset); 0 = left foot fwd; 2 = right foot fwd
  const legOffset = frame === 1 ? 0 : frame === 0 ? -2 : 2;
  const skin = '#f2c79a';
  const shirt = '#3a6ea5';
  const shirtDark = '#2c5279';
  const pants = '#2a2a3a';
  const hair = '#5a3a1a';
  ctx.clearRect(x, y, s, s);
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(x + s / 2, y + s - 3, 9, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // legs
  ctx.fillStyle = pants;
  ctx.fillRect(x + 11, y + 22, 4, 7 + legOffset);
  ctx.fillRect(x + 17, y + 22, 4, 7 - legOffset);
  // body (shirt)
  ctx.fillStyle = shirt;
  ctx.fillRect(x + 10, y + 14, 12, 10);
  ctx.fillStyle = shirtDark;
  ctx.fillRect(x + 10, y + 22, 12, 2);
  // arms
  ctx.fillStyle = shirt;
  ctx.fillRect(x + 7, y + 15, 3, 7);
  ctx.fillRect(x + 22, y + 15, 3, 7);
  // head
  ctx.fillStyle = skin;
  ctx.fillRect(x + 11, y + 5, 10, 10);
  // hair
  ctx.fillStyle = hair;
  ctx.fillRect(x + 10, y + 4, 12, 4);
  if (facing === 'up') {
    ctx.fillRect(x + 11, y + 4, 10, 8); // back of head
  } else {
    ctx.fillRect(x + 10, y + 4, 3, 8);
    ctx.fillRect(x + 19, y + 4, 3, 8);
  }
  // face details
  ctx.fillStyle = '#2a2a3a';
  if (facing === 'down') {
    ctx.fillRect(x + 13, y + 10, 2, 2);
    ctx.fillRect(x + 17, y + 10, 2, 2);
  } else if (facing === 'left') {
    ctx.fillRect(x + 13, y + 10, 2, 2);
  } else if (facing === 'right') {
    ctx.fillRect(x + 17, y + 10, 2, 2);
  }
  // up: no eyes
}
