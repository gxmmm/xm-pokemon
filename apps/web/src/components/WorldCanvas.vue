<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import type { GameMap, Facing } from '@pokemon-online/shared';
import { drawTile, loadTileset, TILE_SIZE } from '../world/Tileset.ts';
import { drawCharacter, loadCharacter } from '../world/CharacterSprite.ts';
import { cameraOrigin } from '../world/Camera.ts';

const props = withDefaults(defineProps<{
  map: GameMap;
  /** render-time float position (interpolated between tiles) */
  px: number;
  py: number;
  facing: Facing;
  moving?: boolean;
}>(), {
  moving: false,
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
  render(frameFor(phase));
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

function render(frame: number): void {
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
  // player sprite (centered in its tile; CHAR_SIZE == TILE_SIZE)
  const sx = (props.px - ox) * T;
  const sy = (props.py - oy) * T;
  drawCharacter(ctx, props.facing, frame, sx, sy, T);
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
