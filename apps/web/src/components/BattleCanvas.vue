<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { BATTLE_GRID } from '@pokemon-online/shared';
import type { TypeName } from '@pokemon-online/shared';
import type { BattlePresentation } from '../battle/PresentationTimeline.ts';
import { SKILL_MAP } from '@pokemon-online/config';
import { drawCombatantPlatform, drawField, loadArenaBg, project, ARENA_W, ARENA_H, type Biome } from '../battle/BattleField.ts';
import { drawPokemon, preloadPokemon } from '../battle/BattleSprite.ts';
import { EffectManager, loadFxAssets } from '../battle/BattleEffects.ts';
import { CanvasCueAdapter } from '../battle/CanvasCueAdapter.ts';
import type { DirectedBattleCue } from '@pokemon-online/presentation';
import { BattleActionTimeline } from '../battle/BattleActions.ts';

const props = defineProps<{ presentation?: BattlePresentation; biome?: Biome; cues?: readonly DirectedBattleCue[] }>();
const emit = defineEmits<{ impact: [intensity: number] }>();

const canvasEl = ref<HTMLCanvasElement | null>(null);
const fx = new EffectManager();
const cueAdapter = new CanvasCueAdapter();
const actions = new BattleActionTimeline();
const hit = new Map<string, number>();      // uid -> hit feedback 0..1 (flash + squash + recoil)
const prevHp = new Map<string, number>();
const prevCell = new Map<string, { x: number; y: number }>();
const faintProg = new Map<string, number>(); // uid -> 0..1 faint shrink animation
const dustAcc = new Map<string, number>();   // uid -> footstep dust accumulator
// The battlefield is deliberately camera-stable. Impact feedback belongs only at
// the struck location and on the affected combatant, never on the whole screen.
// localized heavy-hit light (replaces the old full-screen flash)
let flashAt: { x: number; y: number; t: number; life: number; color: string } | null = null;
// Knockouts get a short, local aftermath halo; it lives in world space and
// never becomes another full-screen flash.
let koAfterglow: { x: number; y: number; t: number; life: number; color: string } | null = null;
const lastReact = new Map<string, number>(); // uid -> last hit-reaction time (anti-twitch throttle)
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
onUnmounted(() => { fx.clear(); actions.clear(); cueAdapter.clear(); });

/** Render one frame. dt is real seconds (scaled by battle speed) for effect lifetimes. */
function render(dt: number): void {
  const cv = canvasEl.value;
  const presentation = props.presentation;
  if (!cv || !presentation) return;
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  // Pixel-art combat has its own fixed 1000×700 internal grid. Rendering it at
  // device-pixel-ratio 2 doubled every frame's fill-rate without adding useful
  // detail, especially under six simultaneous fighters and VFX. A 1× buffer is
  // sharper for this style and substantially steadier on integrated graphics.
  const dpr = 1;
  if (cv.width !== ARENA_W * dpr) { cv.width = ARENA_W * dpr; cv.height = ARENA_H * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;

  // Canvas is now a compatibility cue consumer. BattleDirector owns core
  // event interpretation; this component only adapts and draws its cues.
  const cues = props.cues ?? [];
  actions.consumeCues(cues, (uid) => cellOf(presentation, uid));
  actions.update(dt);
  fx.consumeLegacyEvents(
    cueAdapter.consume(cues),
    (uid) => cellOf(presentation, uid),
    (uid) => combatantOf(presentation, uid),
    (uid, kind) => actions.anchorOf(uid ?? '', kind, cellOf(presentation, uid)),
  );
  fx.update(dt);

  // The camera never pans, zooms, or shakes. Local projectiles, bursts, numbers,
  // hit reactions and KO halos carry the action without moving the entire arena.
  const impact = fx.impact();
  if (impact && impact.heavy) {
    flashAt = { x: impact.x, y: impact.y, t: 0, life: impact.ko ? 0.34 : 0.25, color: impact.color };
    if (impact.ko) koAfterglow = { x: impact.x, y: impact.y, t: 0, life: 0.72, color: impact.color };
    // Presentation-only pause: parent holds the delayed timeline briefly while
    // the simulator itself continues at normal speed.
    emit('impact', impact.ko ? 1 : impact.intensity);
  }
  const now = performance.now() / 1000;

  ctx.save();

  // cached perspective biome scene (no tactical grid overlay)
  drawField(ctx, props.biome ?? 'grass', ARENA_W, ARENA_H);

  // sprites (sort so lower-y draws in front)
  const cs = [...presentation.combatants].sort((a, b) => a.pixel.y - b.pixel.y);
  for (const c of cs) {
    preloadPokemon(c.speciesId, c.side === 'player'); // idempotent; loads newly deployed sprites
    const sp = project(c.pixel.x, c.pixel.y);

    // hit feedback when HP dropped this frame. Throttled per-actor (0.3s) so a
    // rapid string of light hits doesn't keep the sprite twitching; a heavy hit
    // (≥8% maxHp) bypasses the throttle. Replaces the old "set 1 every drop".
    const prev = prevHp.get(c.uid);
    if (prev !== undefined) {
      const dropped = prev - c.currentHp;
      if (dropped > 0.5) {
        const heavy = dropped / c.maxHp > 0.08;
        if (heavy || now - (lastReact.get(c.uid) ?? 0) > 0.3) {
          hit.set(c.uid, 1);
          lastReact.set(c.uid, now);
        }
      }
    }
    prevHp.set(c.uid, c.currentHp);
    const h = hit.get(c.uid) ?? 0;
    if (h > 0) hit.set(c.uid, Math.max(0, h - dt * 5));

    // Keep every combatant stable and equally framed. Contrast is carried by
    // the local VFX at the attacker/target rather than dimming the full board.
    const dim = 1;

    // faint animation progress (0..1 over 0.5s, then holds)
    if (!c.alive) faintProg.set(c.uid, Math.min(1, (faintProg.get(c.uid) ?? 0) + dt / 0.5));
    else faintProg.set(c.uid, 0);
    const faint = faintProg.get(c.uid) ?? 0;

    // attacker forward-lunge offset (eases out and back)
    const action = actions.poseOf(c.uid);
    // drawPokemon applies the action offset to the sprite group only, keeping
    // its ground shadow and status anchor stable instead of double-translating.
    const cx = sp.x;
    const cy = sp.y;

    // Formation plates make team ownership and footing readable without the old
    // floating oval shadows. The field itself now supplies the world-scale scene.
    drawCombatantPlatform(ctx, cx, sp.y + SPRITE * 0.42, c.side, c.alive, SPRITE);

    // footstep dust while traveling between cells
    const prevC = prevCell.get(c.uid);
    const moving = !prevC || Math.hypot(c.pixel.x - c.position.x, c.pixel.y - c.position.y) > 0.06;
    prevCell.set(c.uid, { x: c.position.x, y: c.position.y });
    if (moving && c.alive && !c.castProgress) {
      const acc = (dustAcc.get(c.uid) ?? 0) + dt;
      if (acc > 0.16) { dustAcc.set(c.uid, acc - 0.16); fx.spawnDust(sp.x, sp.y + SPRITE * 0.42, '#bfc4cc'); }
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
      actionDx: action.dx,
      actionDy: action.dy,
      actionTilt: action.tilt,
      actionScale: action.scale,
      alpha: (c.alive ? 1 : 0.3) * dim,
      gray: c.alive ? 0 : 0.8,
      casting: !!c.castProgress,
      castFrac,
      castType,
      castName: c.castProgress ? (SKILL_MAP[c.castProgress.skillId]?.name ?? c.castProgress.skillId) : undefined,
      faint,
      status: c.status,
      bob: 0,
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

  // Knockout aftermath: a restrained residual light behind the faint particles.
  // It gives the fallen position a moment of weight without washing out allies.
  if (koAfterglow) {
    koAfterglow.t += dt;
    if (koAfterglow.t >= koAfterglow.life) koAfterglow = null;
    else {
      const k = koAfterglow.t / koAfterglow.life;
      const r = 44 + k * 68;
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(koAfterglow.x, koAfterglow.y, 0, koAfterglow.x, koAfterglow.y, r);
      g.addColorStop(0, koAfterglow.color);
      g.addColorStop(0.45, 'rgba(235,242,255,0.22)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = (1 - k) * 0.22;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(koAfterglow.x, koAfterglow.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  // localized heavy-hit light (replaces the old full-screen flash): additive
  // radial glow at the impact point, decays over ~0.25s.
  if (flashAt) {
    flashAt.t += dt;
    if (flashAt.t >= flashAt.life) flashAt = null;
    else {
      const k = flashAt.t / flashAt.life;
      const r = 140 * (1 - k * 0.3);
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(flashAt.x, flashAt.y, 0, flashAt.x, flashAt.y, r);
      g.addColorStop(0, flashAt.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = (1 - k) * 0.5;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(flashAt.x, flashAt.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  ctx.restore();

  // vignette (screen-space post, outside the camera so edges stay stable)
  const vg = ctx.createRadialGradient(ARENA_W / 2, ARENA_H / 2, ARENA_W * 0.3, ARENA_W / 2, ARENA_H / 2, ARENA_W * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.34)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, ARENA_W, ARENA_H);
}

/** Converts a combatant's delayed grid position into the canvas point used by
 * local projectiles, bursts, damage numbers and KO effects. */
function cellOf(presentation: BattlePresentation, uid?: string): { x: number; y: number } | null {
  if (!uid) return null;
  const c = presentation.combatants.find((combatant) => combatant.uid === uid);
  return c ? project(c.pixel.x, c.pixel.y) : null;
}

/** maxHp lookup for local damage-share impact intensity. */
function combatantOf(presentation: BattlePresentation, uid?: string): { maxHp: number } | null {
  if (!uid) return null;
  const c = presentation.combatants.find((x) => x.uid === uid);
  return c ? { maxHp: c.maxHp } : null;
}

/** Whether the local VFX created by the delayed presentation have finished. */
function isPresentationSettled(): boolean {
  return !fx.hasBlockingVisuals() && !actions.isActive() && !flashAt && !koAfterglow;
}

defineExpose({ render, isPresentationSettled });
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