<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { BATTLE_GRID } from '@pokemon-online/shared';
import type { BattleEvent, TypeName } from '@pokemon-online/shared';
import type { BattlePresentation } from '../battle/PresentationTimeline.ts';
import { SKILL_MAP } from '@pokemon-online/config';
import { drawField, loadArenaBg, project, ARENA_W, ARENA_H, type Biome } from '../battle/BattleField.ts';
import { drawPokemon, preloadPokemon } from '../battle/BattleSprite.ts';
import { EffectManager, loadFxAssets } from '../battle/BattleEffects.ts';

const props = defineProps<{ presentation?: BattlePresentation; forecast?: BattleEvent[]; biome?: Biome }>();
const emit = defineEmits<{ impact: [intensity: number] }>();

const canvasEl = ref<HTMLCanvasElement | null>(null);
const fx = new EffectManager();
const hit = new Map<string, number>();      // uid -> hit feedback 0..1 (flash + squash + recoil)
const prevHp = new Map<string, number>();
const prevCell = new Map<string, { x: number; y: number }>();
const faintProg = new Map<string, number>(); // uid -> 0..1 faint shrink animation
const dustAcc = new Map<string, number>();   // uid -> footstep dust accumulator
let bobPhase = 0;
// camera (director): eased pan/zoom toward the focal exchange + decaying shake.
let camX = 0, camY = 0, zoom = 1, shakeAmp = 0;
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
onUnmounted(() => fx.clear());

/** Render one frame. dt is real seconds (scaled by battle speed) for effect lifetimes. */
function render(dt: number): void {
  const cv = canvasEl.value;
  const presentation = props.presentation;
  if (!cv || !presentation) return;
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (cv.width !== ARENA_W * dpr) { cv.width = ARENA_W * dpr; cv.height = ARENA_H * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;

  // consume new events -> spawn VFX + track focal / impact (director)
  fx.consume(presentation.events, (uid) => cellOf(presentation, uid), (uid) => combatantOf(presentation, uid));
  fx.update(dt);

  // ── director camera: use the delayed future window to pre-aim high points ──
  // Effects are still consumed only at presentation time. This forecast merely
  // starts the framing roughly 160ms early, so a 3v3 high-impact exchange gets
  // room on screen before its projectile/burst arrives.
  const forecast = forecastFocal(presentation, props.forecast ?? []);
  const actualFocal = fx.focalOf();
  // Keep an ongoing big exchange stable, but allow a comparably meaningful
  // imminent exchange to prepare the next shot instead of reacting late.
  const focal = forecast && (!actualFocal || forecast.intensity >= actualFocal.intensity * 0.85)
    ? forecast
    : actualFocal;
  const impact = fx.impact();
  if (impact && impact.heavy) {
    shakeAmp = Math.min(10, Math.max(shakeAmp, impact.intensity * 10));
    flashAt = { x: impact.x, y: impact.y, t: 0, life: impact.ko ? 0.34 : 0.25, color: impact.color };
    if (impact.ko) koAfterglow = { x: impact.x, y: impact.y, t: 0, life: 0.72, color: impact.color };
    // Presentation-only pause: parent holds the delayed timeline briefly while
    // the simulator itself continues at normal speed.
    emit('impact', impact.ko ? 1 : impact.intensity);
  }
  const isKoFocus = !!actualFocal && actualFocal.koHold > 0;
  const wantZoom = focal && focal.intensity > 0.2 ? 1 + Math.min(isKoFocus ? 0.075 : 0.06, focal.intensity * 0.08) : 1;
  let wantCamX = 0, wantCamY = 0;
  if (focal && focal.intensity > 0.2) {
    // pull focal toward center (subtle 12%), clamped so we never reveal past edges
    const limX = (wantZoom - 1) * ARENA_W / 2;
    const limY = (wantZoom - 1) * ARENA_H / 2;
    wantCamX = Math.max(-limX, Math.min(limX, (ARENA_W / 2 - focal.x) * 0.12));
    wantCamY = Math.max(-limY, Math.min(limY, (ARENA_H / 2 - focal.y) * 0.12));
  }
  const ek = 1 - Math.exp(-dt * 5);
  zoom += (wantZoom - zoom) * ek;
  camX += (wantCamX - camX) * ek;
  camY += (wantCamY - camY) * ek;
  shakeAmp = Math.max(0, shakeAmp - dt * 40);
  const now = performance.now() / 1000;
  const shX = (Math.sin(now * 53) + Math.sin(now * 31.7) * 0.5) * shakeAmp * 0.5;
  const shY = (Math.cos(now * 47) + Math.cos(now * 29.3) * 0.5) * shakeAmp * 0.5;

  ctx.save();
  ctx.translate(ARENA_W / 2 + shX, ARENA_H / 2 + shY);
  ctx.scale(zoom, zoom);
  ctx.translate(-ARENA_W / 2 + camX, -ARENA_H / 2 + camY);

  // oval arena floor (no grid lines)
  drawField(ctx, props.biome ?? 'grass', ARENA_W, ARENA_H);

  // sprites (sort so lower-y draws in front)
  const cs = [...presentation.combatants].sort((a, b) => a.pixel.y - b.pixel.y);
  bobPhase = (bobPhase + dt * 6) % 1000;
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

    // focal dim: non-focal combatants darken while the featured exchange plays
    let dim = 1;
    if (focal && focal.intensity > 0.25 && c.uid !== focal.actorUid && !(focal.targetUids ?? [focal.targetUid]).includes(c.uid)) {
      // During a knockout hold, push the surrounding 3v3 skirmish one step
      // back without hiding it; teammates/opponents stay readable in frame.
      dim = 1 - focal.intensity * (isKoFocus ? 0.58 : 0.45);
    }

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
    ctx.globalAlpha = (0.14 + 0.04 * Math.sin(now * 3 + c.uid.length)) * dim;
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
      alpha: (c.alive ? 1 : 0.3) * dim,
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

/** Finds the next meaningful exchange in the simulation lead window. It never
 * renders an effect early; it only supplies a soft camera target for a better
 * 3v3 composition before the event reaches presentation time. */
function forecastFocal(presentation: BattlePresentation, events: BattleEvent[]): { actorUid: string; targetUid: string; targetUids?: string[]; x: number; y: number; intensity: number } | null {
  for (const e of events) {
    if (!e.actor || !e.target) continue;
    if (e.type !== 'skill' && e.type !== 'damage') continue;
    const actor = cellOf(presentation, e.actor);
    const targetUids = e.vfx?.targetUids?.length ? e.vfx.targetUids : [e.target];
    const targets = targetUids.map((uid) => cellOf(presentation, uid)).filter((p): p is { x: number; y: number } => !!p);
    if (!actor || targets.length === 0) continue;
    const target = targets[0]!;
    const targetCom = presentation.combatants.find((c) => c.uid === e.target);
    const frac = e.type === 'damage' && targetCom ? (e.amount ?? 0) / targetCom.maxHp : 0;
    const outcome = e.vfx;
    const highlight = !!outcome?.crit || (outcome?.effectiveness ?? 1) > 1;
    // A skill gives a gentle lead-in; structured crit/advantage/KO metadata
    // strengthens the future framing without leaking any actual VFX early.
    const intensity = e.type === 'damage'
      ? Math.max(outcome?.ko ? 0.88 : 0.26, Math.min(0.88, frac * 4 + (highlight ? 0.16 : 0)))
      : 0.24;
    const gx = targets.reduce((sum, p) => sum + p.x, 0) / targets.length;
    const gy = targets.reduce((sum, p) => sum + p.y, 0) / targets.length;
    return { actorUid: e.actor, targetUid: e.target, targetUids: targetUids.filter((uid): uid is string => !!uid), x: (actor.x + gx) / 2, y: (actor.y + gy) / 2, intensity };
  }
  return null;
}

function cellOf(presentation: BattlePresentation, uid?: string): { x: number; y: number } | null {
  if (!uid) return null;
  const c = presentation.combatants.find((x) => x.uid === uid);
  if (!c) return null;
  return project(c.pixel.x, c.pixel.y);
}

/** maxHp lookup for the director (damage-share -> focal/impact intensity). */
function combatantOf(presentation: BattlePresentation, uid?: string): { maxHp: number } | null {
  if (!uid) return null;
  const c = presentation.combatants.find((x) => x.uid === uid);
  return c ? { maxHp: c.maxHp } : null;
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
