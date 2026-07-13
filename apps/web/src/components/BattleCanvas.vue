<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import type { BattleSim } from '@pokemon-online/engine';
import { BATTLE_GRID } from '@pokemon-online/shared';
import type { TypeName } from '@pokemon-online/shared';
import { SKILL_MAP } from '@pokemon-online/config';
import { drawField, loadArenaBg, project, ARENA_W, ARENA_H, type Biome } from '../battle/BattleField.ts';
import { drawPokemon, preloadPokemon } from '../battle/BattleSprite.ts';
import { EffectManager, loadFxAssets } from '../battle/BattleEffects.ts';

const props = defineProps<{ sim: BattleSim; biome?: Biome }>();

const canvasEl = ref<HTMLCanvasElement | null>(null);
const fx = new EffectManager();
const hit = new Map<string, number>();      // uid -> hit feedback 0..1 (flash + squash + recoil)
const prevHp = new Map<string, number>();
const prevCell = new Map<string, { x: number; y: number }>();
const faintProg = new Map<string, number>(); // uid -> 0..1 faint shrink animation
const dustAcc = new Map<string, number>();   // uid -> footstep dust accumulator
let bobPhase = 0;
let flash = 0;                               // screen-flash intensity 0..1 (decays)
let flashColor = '#ffffff';
const SPRITE = (ARENA_W / BATTLE_GRID.cols) * 1.7; // uniform top-down sprite size

// ambient atmospheric motes (seeded once; biome-tinted at draw). Math.random is
// fine here - this is the live app, not a deterministic sim/workflow context.
const motes = Array.from({ length: 16 }, () => ({
  x: Math.random() * ARENA_W,
  y: Math.random() * ARENA_H,
  phase: Math.random() * Math.PI * 2,
  speed: 6 + Math.random() * 10,
  size: 1 + Math.random() * 2,
  wob: 4 + Math.random() * 8,
}));

const MOTE_COLOR: Record<Biome, string> = {
  grass: '#cfe8a0', cave: '#8a7a6a', water: '#bfe6ff', dragon: '#c89cff', arena: '#dadae6',
};

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

  // consume new events -> spawn VFX + track attacker lunges / screen-flash
  fx.consume(props.sim.state.events, cellOf);
  fx.update(dt);

  // sprites (sort so lower-y draws in front)
  const cs = [...props.sim.state.combatants].sort((a, b) => a.pixel.y - b.pixel.y);
  bobPhase = (bobPhase + dt * 6) % 1000;
  const now = performance.now() / 1000;
  for (const c of cs) {
    preloadPokemon(c.speciesId, c.side === 'player'); // idempotent; loads newly deployed sprites
    const sp = project(c.pixel.x, c.pixel.y);

    // hit feedback when HP dropped this frame: brightness flash + squash + recoil
    const prev = prevHp.get(c.uid);
    if (prev !== undefined && c.currentHp < prev - 0.5) hit.set(c.uid, 1);
    prevHp.set(c.uid, c.currentHp);
    const h = hit.get(c.uid) ?? 0;
    if (h > 0) hit.set(c.uid, Math.max(0, h - dt * 5));

    // faint animation progress (0..1 over 0.5s, then holds)
    if (!c.alive) faintProg.set(c.uid, Math.min(1, (faintProg.get(c.uid) ?? 0) + dt / 0.5));
    else faintProg.set(c.uid, 0);
    const faint = faintProg.get(c.uid) ?? 0;

    // attacker forward-lunge offset (eases out and back)
    const imp = fx.impulseOf(c.uid);
    const lx = imp ? imp.dx : 0;
    const ly = imp ? imp.dy : 0;
    const cx = sp.x + lx;
    const cy = sp.y + ly;

    // team ground glow under the sprite (depth + side readability)
    const glow = c.side === 'player' ? '#4a90e2' : '#e25555';
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.14 + 0.04 * Math.sin(now * 3 + c.uid.length);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(cx, sp.y + SPRITE * 0.42, SPRITE * 0.34, SPRITE * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // footstep dust while traveling between cells
    const prevC = prevCell.get(c.uid);
    const moving = !prevC || Math.hypot(c.pixel.x - c.position.x, c.pixel.y - c.position.y) > 0.06;
    prevCell.set(c.uid, { x: c.position.x, y: c.position.y });
    if (moving && c.alive) {
      const acc = (dustAcc.get(c.uid) ?? 0) + dt;
      if (acc > 0.07) { dustAcc.set(c.uid, acc - 0.07); fx.spawnDust(sp.x + Math.sin(bobPhase * 10) * 3, sp.y + SPRITE * 0.42, '#bfc4cc'); }
      else dustAcc.set(c.uid, acc);
    }

    // cast charge progress (0..1) + element type for theming
    let castFrac = 0;
    let castType: TypeName | undefined;
    if (c.castProgress) {
      const sk = SKILL_MAP[c.castProgress.skillId];
      const total = sk?.castTime ?? 0.4;
      castFrac = Math.max(0, Math.min(1, 1 - c.castProgress.remaining / total));
      castType = sk?.type;
    }

    drawPokemon(ctx, {
      speciesId: c.speciesId,
      back: c.side === 'player',
      types: c.types,
      cx, cy,
      size: SPRITE,
      facing: c.facing,
      hitFlash: h,
      recoil: h,
      alpha: c.alive ? 1 : 0.3,
      gray: c.alive ? 0 : 0.8,
      casting: !!c.castProgress,
      castFrac,
      castType,
      faint,
      status: c.status,
      bob: moving ? bobPhase : 0,
    });
  }

  // ambient motes (foreground atmosphere, biome-tinted)
  const moteColor = MOTE_COLOR[props.biome ?? 'grass'];
  ctx.globalCompositeOperation = 'lighter';
  for (const m of motes) {
    const yy = (m.y - now * m.speed) % ARENA_H;
    const y = yy < 0 ? yy + ARENA_H : yy;
    const xx = m.x + Math.sin(now * 0.8 + m.phase) * m.wob;
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = moteColor;
    ctx.fillRect(xx, y, m.size, m.size);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  // effects on top
  fx.draw(ctx);

  // vignette (darken edges for focus)
  const vg = ctx.createRadialGradient(ARENA_W / 2, ARENA_H / 2, ARENA_W * 0.3, ARENA_W / 2, ARENA_H / 2, ARENA_W * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.34)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, ARENA_W, ARENA_H);

  // screen flash on heavy hits (additive, decays)
  const imp = fx.impact();
  if (imp && imp.intensity > flash) { flash = imp.intensity; flashColor = imp.color; }
  flash = Math.max(0, flash - dt * 4);
  if (flash > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = flash * 0.16;
    ctx.fillStyle = flashColor;
    ctx.fillRect(0, 0, ARENA_W, ARENA_H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
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
