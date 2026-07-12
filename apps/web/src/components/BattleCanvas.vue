<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import type { BattleSim } from '@pokemon-online/engine';
import { BATTLE_GRID } from '@pokemon-online/shared';
import { drawField, loadArenaBg, project, ARENA_W, ARENA_H, type Biome } from '../battle/BattleField.ts';
import { drawPokemon, preloadPokemon } from '../battle/BattleSprite.ts';
import { EffectManager, loadFxAssets } from '../battle/BattleEffects.ts';

const props = defineProps<{ sim: BattleSim; biome?: Biome }>();

const canvasEl = ref<HTMLCanvasElement | null>(null);
const fx = new EffectManager();
const hit = new Map<string, number>();      // uid -> hit feedback 0..1 (brightness flash + recoil)
const prevHp = new Map<string, number>();
const prevCell = new Map<string, { x: number; y: number }>();
let bobPhase = 0;
const SPRITE = (ARENA_W / BATTLE_GRID.cols) * 1.7; // uniform top-down sprite size

onMounted(() => {
  // background + optional VFX sprites load async; rendering is procedural until ready
  void Promise.all([loadArenaBg(), loadFxAssets()]);
});
onUnmounted(() => fx.clear());

/** Render one frame. dt is real seconds (scaled by battle speed) for effect lifetimes. */
function render(dt: number): void {
  const cv = canvasEl.value;
  if (!cv) return;
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (cv.width !== ARENA_W * dpr) { cv.width = ARENA_W * dpr; cv.height = ARENA_H * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;

  // oval arena floor (no grid lines)
  drawField(ctx, props.biome ?? 'grass', ARENA_W, ARENA_H);

  // consume new events -> spawn VFX
  fx.consume(props.sim.state.events, cellOf);
  fx.update(dt);

  // sprites (sort so lower-y draws in front)
  const cs = [...props.sim.state.combatants].sort((a, b) => a.pixel.y - b.pixel.y);
  bobPhase = (bobPhase + dt * 6) % 1000;
  for (const c of cs) {
    preloadPokemon(c.speciesId, c.side === 'player'); // idempotent; loads newly deployed sprites
    const sp = project(c.pixel.x, c.pixel.y);
    // hit feedback when HP dropped this frame: brightness flash + recoil (no screen shake)
    const prev = prevHp.get(c.uid);
    if (prev !== undefined && c.currentHp < prev - 0.5) hit.set(c.uid, 1);
    prevHp.set(c.uid, c.currentHp);
    const h = hit.get(c.uid) ?? 0;
    if (h > 0) hit.set(c.uid, Math.max(0, h - dt * 5));
    // bob while traveling between cells
    const prevC = prevCell.get(c.uid);
    const moving = !prevC || Math.hypot(c.pixel.x - c.position.x, c.pixel.y - c.position.y) > 0.06;
    prevCell.set(c.uid, { x: c.position.x, y: c.position.y });
    drawPokemon(ctx, {
      speciesId: c.speciesId,
      back: c.side === 'player',
      types: c.types,
      cx: sp.x, cy: sp.y,
      size: SPRITE,
      facing: c.facing,
      hitFlash: h,
      recoil: h,
      alpha: c.alive ? 1 : 0.3,
      gray: c.alive ? 0 : 0.8,
      casting: !!c.castProgress,
      status: c.status,
      bob: moving ? bobPhase : 0,
    });
  }

  // effects on top
  fx.draw(ctx);
}

function cellOf(uid?: string): { x: number; y: number } | null {
  if (!uid) return null;
  const c = props.sim.state.combatants.find((x) => x.uid === uid);
  if (!c) return null;
  return project(c.pixel.x, c.pixel.y);
}

defineExpose({ render });
</script>

<template>
  <canvas ref="canvasEl" class="battle-canvas"></canvas>
</template>

<style scoped>
.battle-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}
</style>
