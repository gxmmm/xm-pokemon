<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import type { GameMap, Facing } from '@pokemon-online/shared';
import type { StoryNpc, StoryObject } from '@pokemon-online/config';
import { drawTile, loadTileset, TILE_SIZE } from '../world/Tileset.ts';
import { drawCharacter, drawNpc, loadCharacter } from '../world/CharacterSprite.ts';
import { cameraOrigin } from '../world/Camera.ts';

const props = withDefaults(defineProps<{
  map: GameMap;
  /** render-time float position (interpolated between tiles) */
  px: number;
  py: number;
  facing: Facing;
  moving?: boolean;
  npcs?: StoryNpc[];
  interactNpcId?: string | null;
  objects?: StoryObject[];
  interactObjectId?: string | null;
  tide?: 'high' | 'low';
}>(), {
  moving: false,
  npcs: () => [],
  interactNpcId: null,
  objects: () => [],
  interactObjectId: null,
  tide: 'high',
});

const canvasEl = ref<HTMLCanvasElement | null>(null);
let raf = 0;
let last = 0;
let phase = 0; // walk stride phase 0..1

// Visible tile grid, derived from the container's layout size so the map FILLS
// the available area (no letterbox margins). tilesW targets ~TARGET_TILE_PX of
// container width; tilesH follows the container aspect so tiles stay square
// (no stretch). Layout size (clientWidth/Height) is pre-transform, so the tile
// COUNT is stable while the stage transform scales the pixels (bigger screen ->
// bigger tiles, same view). Re-measured on resize.
const TARGET_TILE_PX = 64;
const tilesW = ref(19);
const tilesH = ref(11);
let ro: ResizeObserver | null = null;

function measure(): void {
  const parent = canvasEl.value?.parentElement;
  if (!parent) return;
  const w = parent.clientWidth;
  const h = parent.clientHeight;
  if (w === 0 || h === 0) return;
  const tw = Math.max(8, Math.round(w / TARGET_TILE_PX));
  const th = Math.max(6, Math.round((tw * h) / w));
  tilesW.value = tw;
  tilesH.value = th;
}

onMounted(async () => {
  await Promise.all([loadTileset(), loadCharacter()]);
  measure();
  ro = new ResizeObserver(measure);
  if (canvasEl.value?.parentElement) ro.observe(canvasEl.value.parentElement);
  last = performance.now();
  raf = requestAnimationFrame(loop);
});
onUnmounted(() => { cancelAnimationFrame(raf); ro?.disconnect(); });

function loop(t: number): void {
  const dt = Math.min((t - last) / 1000, 0.05);
  last = t;
  phase = props.moving ? (phase + dt * 3.5) % 1 : 0;
render(frameFor(phase), t / 1000);
  raf = requestAnimationFrame(loop);
}

/** stride sequence: left(0) -> stand(1) -> right(2) -> stand(1) */
function frameFor(p: number): number {
  if (!props.moving) return 1;
  const f = p * 4;
  if (f < 1) return 0;
  if (f < 2) return 1;
  if (f < 3) return 2;
  return 1;
}

function render(frame: number, now: number): void {
  const cv = canvasEl.value;
  if (!cv) return;
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const T = TILE_SIZE;
  const tw = tilesW.value, th = tilesH.value;
  const cssW = tw * T, cssH = th * T;
  if (cv.width !== cssW * dpr) {
    cv.width = cssW * dpr;
    cv.height = cssH * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  // background for the area outside the map
  ctx.fillStyle = '#0e1626';
  ctx.fillRect(0, 0, cssW, cssH);

  const { ox, oy } = cameraOrigin(props.px, props.py, props.map.width, props.map.height, {
    tilesW: tw,
    tilesH: th,
  });
  for (let vy = 0; vy < th; vy++) {
    for (let vx = 0; vx < tw; vx++) {
      const code = props.map.tiles[oy + vy]?.[ox + vx];
      if (code === undefined) continue; // outside map -> leave background
      drawTile(ctx, code, vx * T, vy * T, T);
    }
  }
  // Map-specific, original environmental dressing. It turns the base tile grid
  // into a place with landmarks without relying on copied game assets.
  drawAtmosphere(ctx, props.map.id, ox, oy, tw, th, T, now, props.tide);
  // Story objects are persistent, world-space clues rather than menu markers.
  for (const object of props.objects) {
    const x = (object.x - ox) * T, y = (object.y - oy) * T;
    if (x < -T || y < -T || x > cssW || y > cssH) continue;
    drawStoryObject(ctx, object, x, y, T, now, props.interactObjectId === object.id);
  }
  // NPCs are drawn after the terrain and before the player. The foreground
  // name plate keeps interactions legible without covering the exploration view.
  for (const npc of props.npcs) {
    const nx = (npc.x - ox) * T;
    const ny = (npc.y - oy) * T;
    if (nx < -T || ny < -T || nx > cssW || ny > cssH) continue;
    drawNpc(ctx, npc.palette, 'down', 1, nx, ny, T);
    if (props.interactNpcId === npc.id) {
      ctx.fillStyle = '#fff5b1'; ctx.fillRect(nx + 13, ny - 7, 6, 4);
      ctx.fillStyle = '#392b20'; ctx.fillRect(nx + 14, ny - 6, 4, 2);
    }
  }
  // player sprite (centered in its tile; CHAR_SIZE == TILE_SIZE)
  const sx = (props.px - ox) * T;
  const sy = (props.py - oy) * T;
  drawCharacter(ctx, props.facing, frame, sx, sy, T);
}
function drawStoryObject(ctx: CanvasRenderingContext2D, object: StoryObject, x: number, y: number, t: number, now: number, active: boolean): void {
  const pulse = 0.55 + Math.sin(now * 3 + object.x) * 0.25;
  if (object.kind === 'star') {
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = pulse;
    ctx.fillStyle = '#fff5ba'; ctx.fillRect(x + 14, y + 4, 4, 24); ctx.fillRect(x + 4, y + 14, 24, 4);
    ctx.fillStyle = '#9cbcff'; ctx.fillRect(x + 10, y + 10, 12, 12); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  } else if (object.kind === 'signal') {
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = pulse;
    ctx.fillStyle = '#8dffe3'; ctx.fillRect(x + 13, y + 7, 6, 12); ctx.fillStyle = '#d7fff8'; ctx.fillRect(x + 15, y + 5, 2, 16);
    ctx.globalAlpha = .25 + pulse * .25; ctx.fillStyle = '#53bff1'; ctx.beginPath(); ctx.arc(x + 16, y + 13, 12, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  } else if (object.kind === 'core') {
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = pulse;
    ctx.fillStyle = '#5ddcff'; ctx.beginPath(); ctx.moveTo(x + 16, y + 3); ctx.lineTo(x + 24, y + 16); ctx.lineTo(x + 16, y + 28); ctx.lineTo(x + 8, y + 16); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f1d7ff'; ctx.fillRect(x + 14, y + 10, 4, 12); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  } else if (object.kind === 'tide-gauge') {
    ctx.fillStyle = '#61798a'; ctx.fillRect(x + 13, y + 6, 6, 20); ctx.fillStyle = '#c8edf2'; ctx.fillRect(x + 14, y + 8, 4, 10); ctx.fillStyle = '#e9cf74'; ctx.fillRect(x + 11, y + 4, 10, 4);
  } else if (object.kind === 'ship-log') {
    ctx.fillStyle = '#704d34'; ctx.fillRect(x + 7, y + 12, 18, 10); ctx.fillStyle = '#e6d6a5'; ctx.fillRect(x + 10, y + 9, 12, 10); ctx.fillStyle = '#8d5736'; ctx.fillRect(x + 11, y + 12, 9, 1);
  } else if (object.kind === 'anchor') {
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = pulse; ctx.strokeStyle = '#cb8dff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x + 16, y + 15, 8, 0, Math.PI * 2); ctx.moveTo(x + 16, y + 4); ctx.lineTo(x + 16, y + 25); ctx.moveTo(x + 8, y + 22); ctx.lineTo(x + 24, y + 22); ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  } else if (object.kind === 'gravity-node') {
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = pulse;
    ctx.fillStyle = '#78e9ff'; ctx.beginPath(); ctx.moveTo(x + 16, y + 3); ctx.lineTo(x + 25, y + 15); ctx.lineTo(x + 16, y + 29); ctx.lineTo(x + 7, y + 15); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e0c4ff'; ctx.fillRect(x + 14, y + 10, 4, 10); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  } else if (object.kind === 'terminal') {
    ctx.fillStyle = '#34305e'; ctx.fillRect(x + 7, y + 7, 18, 19); ctx.fillStyle = '#7ee8ff'; ctx.fillRect(x + 10, y + 9, 12, 9); ctx.fillStyle = '#d8c1ff'; ctx.fillRect(x + 13, y + 20, 6, 3);
    ctx.globalAlpha = pulse; ctx.fillStyle = '#8eeeff'; ctx.fillRect(x + 12, y + 11, 8, 2); ctx.globalAlpha = 1;
  } else if (object.kind === 'legend-echo') {
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = pulse;
    ctx.fillStyle = '#fff3ba'; ctx.beginPath(); ctx.arc(x + 16, y + 14, 7, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#9cf7ff'; ctx.fillRect(x + 5, y + 13, 7, 3); ctx.fillRect(x + 20, y + 9, 6, 3);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = '#9b7a54'; ctx.fillRect(x + 8, y + 9, 16, 14); ctx.fillStyle = '#d9c59b'; ctx.fillRect(x + 10, y + 11, 12, 8);
  }
  if (active) { ctx.fillStyle = '#fff5a6'; ctx.fillRect(x + 13, y - 7, 6, 4); ctx.fillStyle = '#3b2a24'; ctx.fillRect(x + 14, y - 6, 4, 2); }
}

function drawAtmosphere(ctx: CanvasRenderingContext2D, mapId: string, ox: number, oy: number, tw: number, th: number, t: number, now: number, tide: 'high' | 'low'): void {
  const rect = (gx: number, gy: number, w: number, h: number, color: string) => {
    const x = (gx - ox) * t, y = (gy - oy) * t;
    if (x + w < 0 || y + h < 0 || x > tw * t || y > th * t) return;
    ctx.fillStyle = color; ctx.fillRect(x, y, w, h);
  };
  if (mapId === 'pallet') {
    // Research observatory roof, harbor lanterns, and a faint ocean haze.
    rect(5, 2, 68, 7, '#4c395e'); rect(7, 2, 8, 18, '#d6c7a0'); rect(51, 2, 8, 18, '#d6c7a0');
    rect(6, 3, 58, 4, '#b58a54'); rect(26, 1, 14, 6, '#d7e8ef');
    for (const [gx, gy] of [[3, 10], [12, 10], [13, 5]] as const) { const pulse = Math.floor((now * 2 + gx) % 2); rect(gx, gy, 4, 7, pulse ? '#ffd778' : '#c88c42'); rect(gx - .5, gy - 1, 5, 2, '#5a3d30'); }
    ctx.fillStyle = 'rgba(213,238,255,.13)'; for (let i = 0; i < 4; i++) ctx.fillRect((i * 97 + now * 12) % (tw * t), 12 + i * 20, 38, 2);
  } else if (mapId === 'route1') {
    ctx.fillStyle = 'rgba(153,218,255,.16)';
    for (let i = 0; i < 18; i++) { const x = ((i * 71 + now * 8) % (tw * t)); const y = ((i * 37 + now * 3) % (th * t)); ctx.fillRect(x, y, 2, 2); }
    for (const [gx, gy] of [[4, 4], [11, 7], [5, 10], [13, 3]] as const) { const a = .4 + .35 * Math.sin(now * 3 + gx); ctx.fillStyle = `rgba(187,255,209,${a})`; ctx.fillRect((gx - ox) * t + 13, (gy - oy) * t + 8, 3, 3); }
  } else if (mapId === 'sea-route') {
    const low = tide === 'low';
    ctx.fillStyle = low ? 'rgba(112,212,204,.16)' : 'rgba(43,118,184,.20)'; ctx.fillRect(0, 0, tw * t, th * t);
    for (let i = 0; i < 14; i++) { const x = (i * 59 + now * (low ? 5 : 11)) % (tw * t); const y = 8 + (i * 23 % Math.max(12, th * t - 16)); ctx.fillStyle = low ? 'rgba(218,240,188,.48)' : 'rgba(198,235,255,.32)'; ctx.fillRect(x, y, low ? 5 : 12, 2); }
    if (low) { for (const [gx, gy] of [[10, 4], [11, 4], [12, 4], [10, 5], [11, 5]] as const) { rect(gx, gy, t, t, '#b8a273'); ctx.fillStyle = '#8e7955'; ctx.fillRect((gx - ox) * t + 5, (gy - oy) * t + 14, t - 10, 3); } }
    // A project-owned sunken mast silhouette; the log itself remains a story object.
    const sx = (12 - ox) * t + 16, sy = (4 - oy) * t + 16; ctx.strokeStyle = '#604b3d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx, sy + 20); ctx.lineTo(sx - 7, sy - 20); ctx.stroke(); ctx.fillStyle = 'rgba(221,205,165,.55)'; ctx.fillRect(sx - 15, sy - 16, 9, 12);
  } else if (mapId === 'viridian-forest') {
    // A deep, original mistwood: root arches, low cyan fog, and a faint central
    // glow leave room for story objects without borrowing any existing map art.
    ctx.fillStyle = 'rgba(117,190,178,.10)'; ctx.fillRect(0, 0, tw * t, th * t);
    for (const [gx, gy, w] of [[2, 2, 24], [10, 3, 30], [5, 8, 38]] as const) { rect(gx, gy, w, 3, '#355849'); rect(gx + 5, gy + 3, 3, 13, '#493a2d'); rect(gx + w - 8, gy + 3, 3, 13, '#493a2d'); }
    const cx = (8 - ox) * t + 16, cy = (5 - oy) * t + 16;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 74); g.addColorStop(0, 'rgba(89,220,255,.22)'); g.addColorStop(1, 'rgba(89,220,255,0)'); ctx.fillStyle = g; ctx.fillRect(cx - 74, cy - 74, 148, 148);
    for (let i = 0; i < 18; i++) { const x = (i * 83 + now * 5) % (tw * t); const y = (i * 47 + now * 2) % (th * t); ctx.fillStyle = 'rgba(201,255,235,.32)'; ctx.fillRect(x, y, 2, 2); }
  } else if (mapId === 'route3') {
    ctx.fillStyle = 'rgba(62,54,89,.13)'; ctx.fillRect(0, 0, tw * t, th * t);
    for (const [gx, gy] of [[3, 3], [12, 5], [5, 10]] as const) { const x = (gx - ox) * t + 16, y = (gy - oy) * t + 16; ctx.strokeStyle = '#d5c7ff'; ctx.globalAlpha = .5 + .3 * Math.sin(now * 2 + gx); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 10, y); ctx.lineTo(x + 10, y); ctx.moveTo(x, y - 10); ctx.lineTo(x, y + 10); ctx.stroke(); }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 15; i++) { const x = (i * 61 + now * 9) % (tw * t); const y = (i * 29 + now * 2) % (th * t); ctx.fillStyle = 'rgba(245,238,190,.48)'; ctx.fillRect(x, y, 2, 2); }
  } else if (mapId === 'mt-moon') {
    ctx.fillStyle = 'rgba(30,34,68,.20)'; ctx.fillRect(0, 0, tw * t, th * t);
    const cx = (8 - ox) * t + 16, cy = (5 - oy) * t + 16; const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 90); g.addColorStop(0, 'rgba(205,225,255,.25)'); g.addColorStop(1, 'rgba(205,225,255,0)'); ctx.fillStyle = g; ctx.fillRect(cx - 90, cy - 90, 180, 180);
    ctx.strokeStyle = 'rgba(190,205,255,.42)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 44, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, 25, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 11; i++) { const a = now * .4 + i * .57; ctx.fillStyle = '#e9efff'; ctx.fillRect(cx + Math.cos(a) * 38 - 1, cy + Math.sin(a) * 24 - 1, 3, 3); }
  } else if (mapId === 'dragon-den') {
    ctx.fillStyle = 'rgba(24,78,96,.20)'; ctx.fillRect(0, 0, tw * t, th * t);
    for (let i = 0; i < 9; i++) { const x = (i * 79 + now * 4) % (tw * t); const y = (i * 43 + now * 2) % (th * t); ctx.fillStyle = i % 2 ? 'rgba(183,113,255,.45)' : 'rgba(121,239,255,.38)'; ctx.fillRect(x, y, 3, 7); }
    const cx = (8 - ox) * t + 16, cy = (5 - oy) * t + 16; const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 84); g.addColorStop(0, 'rgba(185,104,255,.22)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(cx - 84, cy - 84, 168, 168);
  } else if (mapId === 'deep-space') {
    ctx.fillStyle = 'rgba(22,14,49,.32)'; ctx.fillRect(0, 0, tw * t, th * t);
    for (let i = 0; i < 24; i++) { const x = (i * 47 + now * 3) % (tw * t); const y = (i * 83 + now * 1.5) % (th * t); ctx.fillStyle = i % 3 ? 'rgba(166,128,255,.48)' : 'rgba(127,231,255,.55)'; ctx.fillRect(x, y, 3, 3); }
    for (const [gx, gy] of [[3, 3], [12, 4], [5, 9], [11, 10]] as const) { const x = (gx - ox) * t + 16, y = (gy - oy) * t + 16; ctx.fillStyle = 'rgba(123,91,224,.52)'; ctx.beginPath(); ctx.moveTo(x, y - 15); ctx.lineTo(x + 8, y); ctx.lineTo(x, y + 15); ctx.lineTo(x - 8, y); ctx.closePath(); ctx.fill(); }
  } else if (mapId.startsWith('illusion-tower-')) {
    const floor = Number(mapId.slice(-1)) || 1;
    ctx.fillStyle = 'rgba(37,20,69,.30)'; ctx.fillRect(0, 0, tw * t, th * t);
    const cx = (8 - ox) * t + 16, cy = (7 - oy) * t + 16;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 124); glow.addColorStop(0, `rgba(181,119,255,${.13 + floor * .018})`); glow.addColorStop(1, 'rgba(181,119,255,0)'); ctx.fillStyle = glow; ctx.fillRect(cx - 124, cy - 124, 248, 248);
    for (let i = 0; i < 16; i++) { const x = (i * 71 + now * (2 + floor)) % (tw * t); const y = (i * 37 + now * 1.2) % (th * t); ctx.fillStyle = i % 2 ? 'rgba(223,191,255,.42)' : 'rgba(123,233,255,.36)'; ctx.fillRect(x, y, 2, 4); }
    ctx.fillStyle = '#3f2b68'; ctx.fillRect(cx - 18, cy - 24, 36, 8); ctx.fillStyle = '#a87de7'; ctx.fillRect(cx - 14, cy - 20, 28, 4);
  }
}

</script>

<template>
  <canvas ref="canvasEl" class="world-canvas"></canvas>
</template>

<style scoped>
.world-canvas {
  display: block;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  border-radius: 8px;
  border: 4px solid #1c2740;
}
</style>
