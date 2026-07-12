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
  tilesW?: number;
  tilesH?: number;
}>(), {
  moving: false,
  tilesW: 15,
  tilesH: 11,
});

const canvasEl = ref<HTMLCanvasElement | null>(null);
let raf = 0;
let last = 0;
let phase = 0; // walk stride phase 0..1

onMounted(async () => {
  await Promise.all([loadTileset(), loadCharacter()]);
  last = performance.now();
  raf = requestAnimationFrame(loop);
});
onUnmounted(() => cancelAnimationFrame(raf));

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
  const cssW = props.tilesW * T;
  const cssH = props.tilesH * T;
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
    tilesW: props.tilesW,
    tilesH: props.tilesH,
  });
  for (let vy = 0; vy < props.tilesH; vy++) {
    for (let vx = 0; vx < props.tilesW; vx++) {
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
  <canvas ref="canvasEl" class="world-canvas" :style="{ aspectRatio: `${tilesW} / ${tilesH}` }"></canvas>
</template>

<style scoped>
.world-canvas {
  display: block;
  width: 100%;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  border-radius: 8px;
  border: 4px solid #1c2740;
}
</style>
