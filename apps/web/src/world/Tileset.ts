/**
 * Tileset - loads an external tile image + atlas (tile code -> atlas coords)
 * and draws map tiles. Falls back to a procedurally-drawn stylized tileset
 * when the external assets are missing or fail to load, so the world always
 * renders even offline. To swap in 1:1 art later, replace
 * apps/web/public/sprites/tiles/tileset.png + atlas.json (same layout).
 *
 * Tile codes (see packages/config/src/maps.ts):
 *  0 grass 1 tree 2 water 3 tall-grass 4 path 5 sand 6 rock 7 door
 *  8 flower 9 building 10 sign 11 water-edge
 */
export const TILE_SIZE = 32;

/** atlas.json: tile code -> {x,y} top-left of that tile in tileset.png (px). */
type TileAtlas = Record<number, { x: number; y: number }>;

let tileImage: HTMLImageElement | null = null;
let atlas: TileAtlas | null = null;
let fallback: HTMLCanvasElement | null = null;
let loadPromise: Promise<void> | null = null;

export function loadTileset(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    // procedural fallback first (cheap, guaranteed) so we never render nothing
    fallback = buildFallbackTileset();
    try {
      const res = await fetch('/sprites/tiles/atlas.json', { cache: 'force-cache' });
      if (!res.ok) return;
      atlas = (await res.json()) as TileAtlas;
      const img = new Image();
      img.src = '/sprites/tiles/tileset.png';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('tileset image load failed'));
      });
      tileImage = img;
    } catch {
      tileImage = null;
      atlas = null; // stay on procedural fallback
    }
  })();
  return loadPromise;
}

export function isTilesetReady(): boolean {
  return fallback !== null;
}

/** Draw a single tile code at screen pixel (dx,dy) with the given px size. */
export function drawTile(
  ctx: CanvasRenderingContext2D,
  code: number,
  dx: number,
  dy: number,
  size: number = TILE_SIZE,
): void {
  if (tileImage && atlas && atlas[code]) {
    const a = atlas[code];
    ctx.drawImage(tileImage, a.x, a.y, TILE_SIZE, TILE_SIZE, dx, dy, size, size);
    return;
  }
  if (fallback) {
    const col = code % 4;
    const row = Math.floor(code / 4);
    ctx.drawImage(fallback, col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE, dx, dy, size, size);
    return;
  }
  ctx.fillStyle = '#6ab04c';
  ctx.fillRect(dx, dy, size, size);
}

// ── procedural fallback tileset (4 cols x 3 rows = 12 tiles) ──────────────────

function buildFallbackTileset(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 4 * TILE_SIZE;
  cv.height = 4 * TILE_SIZE;
  const ctx = cv.getContext('2d')!;
  for (let code = 0; code < 16; code++) {
    const col = code % 4;
    const row = Math.floor(code / 4);
    drawFallbackTile(ctx, code, col * TILE_SIZE, row * TILE_SIZE);
  }
  return cv;
}

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function drawFallbackTile(ctx: CanvasRenderingContext2D, code: number, x: number, y: number): void {
  const s = TILE_SIZE;
  switch (code) {
    case 0: // grass
    case 3: // tall grass (grass base + overlay)
    case 8: // flower (grass base + overlay)
    case 10: { // sign (grass base + overlay)
      rect(ctx, x, y, s, s, '#6ab04c');
      ctx.fillStyle = '#5a9e3f';
      for (let i = 0; i < 6; i++) {
        ctx.fillRect(x + ((i * 7 + 3) % (s - 4)), y + ((i * 11 + 5) % (s - 4)), 2, 2);
      }
      break;
    }
    case 1: { // tree
      rect(ctx, x, y, s, s, '#6ab04c');
      rect(ctx, x + 11, y + 18, 10, 12, '#6b4a2b'); // trunk
      ctx.fillStyle = '#235736';
      ctx.beginPath();
      ctx.arc(x + 16, y + 13, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2f6b45';
      ctx.beginPath();
      ctx.arc(x + 12, y + 11, 6, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 2: { // water
      rect(ctx, x, y, s, s, '#4a90e2');
      ctx.strokeStyle = '#7fb2ee';
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(x + 3, y + 6 + i * 9);
        ctx.quadraticCurveTo(x + 12, y + 3 + i * 9, x + 21, y + 6 + i * 9);
        ctx.stroke();
      }
      break;
    }
    case 4: { // path
      rect(ctx, x, y, s, s, '#c2b280');
      ctx.fillStyle = '#b09e6e';
      ctx.fillRect(x + 6, y + 8, 3, 3);
      ctx.fillRect(x + 20, y + 18, 3, 3);
      ctx.fillRect(x + 14, y + 24, 2, 2);
      break;
    }
    case 5: { // sand
      rect(ctx, x, y, s, s, '#e6d690');
      ctx.fillStyle = '#d6c47a';
      ctx.fillRect(x + 8, y + 10, 2, 2);
      ctx.fillRect(x + 22, y + 6, 2, 2);
      break;
    }
    case 6: { // rock
      rect(ctx, x, y, s, s, '#8a8a8a');
      ctx.fillStyle = '#6f6f6f';
      ctx.fillRect(x + 4, y + 4, 10, 10);
      ctx.fillRect(x + 18, y + 14, 9, 9);
      ctx.strokeStyle = '#5a5a5a';
      ctx.beginPath();
      ctx.moveTo(x + 6, y + 6);
      ctx.lineTo(x + 12, y + 12);
      ctx.stroke();
      break;
    }
    case 7: { // door
      rect(ctx, x, y, s, s, '#3a2a1a');
      rect(ctx, x + 6, y + 4, 20, 24, '#d4af37');
      rect(ctx, x + 8, y + 6, 16, 20, '#8a6a2a');
      rect(ctx, x + 20, y + 16, 3, 3, '#3a2a1a'); // knob
      break;
    }
    case 9: { // building
      rect(ctx, x, y, s, s, '#b5651d'); // wall
      rect(ctx, x, y, s, 8, '#7a3a0e'); // roof
      rect(ctx, x + 10, y + 14, 8, 12, '#5a3a1a'); // door
      rect(ctx, x + 2, y + 12, 5, 5, '#9fd6f5'); // window
      rect(ctx, x + 24, y + 12, 5, 5, '#9fd6f5');
      break;
    }
    case 11: { // water-edge
      rect(ctx, x, y, s, s, '#5a9fd4');
      rect(ctx, x, y + s - 6, s, 6, '#e6d690'); // sandy bottom edge
      ctx.fillStyle = '#9fd0f0';
      ctx.fillRect(x + 4, y + 4, 6, 2);
      ctx.fillRect(x + 18, y + 8, 6, 2);
      break;
    }
    case 12: { // cave-entrance
      rect(ctx, x, y, s, s, '#6a5a4a'); // rock surround
      rect(ctx, x + 4, y + 4, s - 8, s - 8, '#1a1a22'); // dark mouth
      rect(ctx, x + 4, y + 4, s - 8, 4, '#3a2a2a'); // top lip shadow
      break;
    }
    case 13: { // dock
      rect(ctx, x, y, s, 6, '#5a9fd4'); // water top
      rect(ctx, x, y + 6, s, s - 6, '#8a6a3a'); // planks
      ctx.fillStyle = '#6b4a2a';
      ctx.fillRect(x + 4, y + 12, s - 8, 1);
      ctx.fillRect(x + 4, y + 20, s - 8, 1);
      break;
    }
    default:
      rect(ctx, x, y, s, s, '#6ab04c');
  }
  // overlays on grass base
  if (code === 3) { // tall grass tufts
    ctx.fillStyle = '#3f6f30';
    for (let i = 0; i < 4; i++) {
      const bx = x + 4 + i * 7;
      ctx.beginPath();
      ctx.moveTo(bx, y + s - 4);
      ctx.lineTo(bx + 2, y + s - 14);
      ctx.lineTo(bx + 4, y + s - 4);
      ctx.fill();
    }
  } else if (code === 8) { // flowers
    const colors = ['#e84c4c', '#f2d027', '#e84cc4'];
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = colors[i];
      ctx.beginPath();
      ctx.arc(x + 6 + i * 9, y + 8 + (i % 2) * 12, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (code === 10) { // sign post
    rect(ctx, x + 14, y + 14, 4, 14, '#8e5a3a'); // post
    rect(ctx, x + 6, y + 6, 20, 10, '#a97242'); // board
    ctx.fillStyle = '#5a3a1a';
    ctx.fillRect(x + 9, y + 9, 14, 1);
    ctx.fillRect(x + 9, y + 12, 10, 1);
  }
}
