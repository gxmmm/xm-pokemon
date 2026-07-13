<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useGameStore } from '../stores/game.ts';
import { useBattleStore } from '../stores/battle.ts';
import { getMap, isWalkable, isEncounterTile, MAP_MAP } from '@pokemon-online/config';
import { rollWildGroup, ENCOUNTER_CHANCE, dayNight } from '@pokemon-online/engine';
import type { Facing } from '@pokemon-online/shared';
import WorldCanvas from '../components/WorldCanvas.vue';
import WorldMap from '../components/WorldMap.vue';
import { createTransitionState, runTransition } from '../world/transitions.ts';

const game = useGameStore();
const battle = useBattleStore();
const router = useRouter();

const map = computed(() => getMap(game.save!.currentMapId));
const dn = computed(() => dayNight());
const showMap = ref(false);
const visitedSet = computed(() => new Set(game.save?.visitedMaps ?? []));

// render-time float position, interpolated between tiles for smooth walking.
// save.position stays integer (the logical cell); `view` is what the canvas draws.
const view = reactive({ px: 0, py: 0, facing: 'down' as Facing, moving: false });
const transition = reactive(createTransitionState());

// overlay visuals derived from the transition state
const fadeOpacity = computed(() => (transition.phase === 'in' ? 1 - transition.progress : transition.progress));
const barPct = computed(() => (transition.phase === 'in' ? 1 - transition.progress : transition.progress) * 50);
const showBoatMsg = computed(() => transition.phase !== 'in' || transition.progress < 0.6);

// ── movement state machine ──
let moveAnim: { fromX: number; fromY: number; toX: number; toY: number; t: number; dur: number } | null = null;
let heldDir: { dx: number; dy: number } | null = null;
let last = 0;
let raf = 0;
let lastEncounter = 0;
let leaving = false; // true once we navigate away to battle: stops world side-effects during the route fade

function syncViewFromSave(): void {
  if (!game.save) return;
  view.px = game.save.position.x;
  view.py = game.save.position.y;
  view.facing = game.save.position.facing;
  view.moving = false;
}

function tileAt(x: number, y: number): number {
  const t = map.value.tiles[y]?.[x];
  return t === undefined ? 1 : t;
}

function canEnter(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= map.value.width || y >= map.value.height) return false;
  return isWalkable(tileAt(x, y));
}

function tryStartMove(dx: number, dy: number): void {
  if (!game.save || moveAnim || transition.active || leaving) return;
  const facing: Facing = dx < 0 ? 'left' : dx > 0 ? 'right' : dy < 0 ? 'up' : 'down';
  view.facing = facing;
  game.save.position.facing = facing;
  const nx = Math.round(view.px) + dx;
  const ny = Math.round(view.py) + dy;
  if (!canEnter(nx, ny)) return;
  moveAnim = { fromX: view.px, fromY: view.py, toX: nx, toY: ny, t: 0, dur: 0.16 };
  view.moving = true;
}

function loop(t: number): void {
  const dt = Math.min((t - last) / 1000, 0.05);
  last = t;
  if (moveAnim) {
    moveAnim.t += dt;
    const p = Math.min(moveAnim.t / moveAnim.dur, 1);
    view.px = moveAnim.fromX + (moveAnim.toX - moveAnim.fromX) * p;
    view.py = moveAnim.fromY + (moveAnim.toY - moveAnim.fromY) * p;
    if (p >= 1) {
      const ax = moveAnim.toX;
      const ay = moveAnim.toY;
      moveAnim = null;
      view.moving = false;
      void onArrive(ax, ay);
    }
  } else if (heldDir && !transition.active && !leaving) {
    tryStartMove(heldDir.dx, heldDir.dy);
  }
  raf = requestAnimationFrame(loop);
}

async function onArrive(x: number, y: number): Promise<void> {
  if (!game.save || leaving) return;
  game.save.position = { x, y, facing: view.facing };
  // exit tile (edge path / cave-entrance / dock / door) -> cross to another map
  // with a cinematic transition; never an instant teleport.
  const exit = map.value.warps.find((w) => w.x === x && w.y === y);
  if (exit) {
    const kind = exit.transition ?? 'fade';
    const label = exit.label ?? MAP_MAP[exit.toMapId]?.name ?? '';
    await runTransition(transition, kind, label, () => {
      game.travelTo(exit.toMapId, exit.toX, exit.toY);
      syncViewFromSave();
    });
    return;
  }
  // wild encounter
  const tile = tileAt(x, y);
  if (isEncounterTile(tile, map.value)) {
    const now = Date.now();
    if (now - lastEncounter < 800) return;
    if (Math.random() < ENCOUNTER_CHANCE) {
      lastEncounter = now;
      const rolls = rollWildGroup(getMap(game.save.currentMapId), { mapId: game.save.currentMapId });
      if (rolls.length) {
        const ok = battle.startWild(rolls.map((r) => r.instance), game.save.currentMapId);
        if (ok) {
          // Stop the world loop immediately: WorldView stays mounted during the
          // route fade-out, so without this a continued keypress would move again,
          // re-trigger onArrive and race a second router.push('battle') -> the
          // first navigation gets aborted and the screen flashes without entering
          // battle. Leaving=true freezes movement until we remount on return.
          leaving = true;
          heldDir = null;
          moveAnim = null;
          router.push({ name: 'battle' }).then((f) => { if (f) leaving = false; }).catch(() => { leaving = false; });
        }
      }
    }
  }
}

const KEY_MAP: Record<string, [number, number]> = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
  W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0],
};
function onKey(e: KeyboardEvent): void {
  const dir = KEY_MAP[e.key];
  if (!dir) return;
  e.preventDefault();
  heldDir = { dx: dir[0], dy: dir[1] };
  if (!moveAnim && !transition.active) tryStartMove(dir[0], dir[1]);
}
function onKeyUp(e: KeyboardEvent): void {
  if (e.key in KEY_MAP) heldDir = null;
}

function heal(): void {
  game.healAll();
}

onMounted(() => {
  leaving = false;
  syncViewFromSave();
  // capture phase: receive keys BEFORE browser extensions (e.g. video-speed
  // controllers) that listen on document/body and stopPropagation on WASD.
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKeyUp, true);
  last = performance.now();
  raf = requestAnimationFrame(loop);
});
onUnmounted(() => {
  window.removeEventListener('keydown', onKey, true);
  window.removeEventListener('keyup', onKeyUp, true);
  cancelAnimationFrame(raf);
});

// when the save position changes externally (warps under the transition cover),
// re-sync the render view unless a move animation is in flight.
watch(() => game.save?.position, () => {
  if (!moveAnim) syncViewFromSave();
}, { deep: true });
</script>

<template>
  <div class="world" v-if="game.save">
    <div class="between" style="margin-bottom:8px">
      <div>
        <h2 class="h-title" style="margin:0">{{ map.name }}</h2>
        <span class="chip">{{ dn === 'day' ? '☀️ 白天' : '🌙 夜晚' }}</span>
        <span class="chip" v-if="map.hidden">隐藏地图</span>
      </div>
      <div class="row" style="gap:6px">
        <button class="sm ghost" @click="showMap = !showMap">🗺 地图</button>
        <button class="sm ghost" @click="heal">💊 治疗</button>
      </div>
    </div>
    <p class="tiny muted" style="margin:0 0 8px">{{ map.description }} {{ map.ambient }}</p>

    <div class="canvas-wrap">
      <WorldCanvas
        :map="map"
        :px="view.px"
        :py="view.py"
        :facing="view.facing"
        :moving="view.moving"
      />
    </div>

    <!-- crossing transition overlay -->
    <div class="transition-overlay" v-if="transition.active">
      <template v-if="transition.kind === 'boat'">
        <div class="letterbox" :style="{ height: barPct + '%' }"></div>
        <div class="boat-msg" v-if="showBoatMsg">⛵ 乘船前往 {{ transition.label }}…</div>
        <div class="letterbox bottom" :style="{ height: barPct + '%' }"></div>
      </template>
      <div v-else class="fade-screen" :style="{ opacity: fadeOpacity }"></div>
    </div>

    <!-- world map overlay (semi-transparent, on the explore page) -->
    <transition name="map-fade">
      <div v-if="showMap" class="map-overlay" @click.self="showMap = false">
        <div class="map-panel">
          <div class="between" style="margin-bottom:6px">
            <span class="h-title" style="margin:0;font-size:18px">🗺 世界地图</span>
            <button class="sm ghost" @click="showMap = false">✕</button>
          </div>
          <div class="map-canvas">
            <WorldMap :current-map-id="game.save!.currentMapId" :visited="visitedSet" />
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.world { display:flex; flex-direction:column; height:100%; gap:8px; }
.canvas-wrap { flex:1; min-height:0; display:flex; align-items:center; justify-content:center; }

.transition-overlay { position: absolute; inset: 0; z-index: 50; pointer-events: none; }
.fade-screen { position: absolute; inset: 0; background: #000; }
.letterbox { position: absolute; left: 0; right: 0; top: 0; background: #000; }
.letterbox.bottom { top: auto; bottom: 0; }
.boat-msg {
  position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%);
  text-align: center; color: #fff; font-size: 16px; text-shadow: 0 1px 2px #000;
}

/* world map overlay - semi-transparent (~80%) so the explore scene shows behind */
.map-overlay {
  position: absolute; inset: 0; z-index: 60;
  display: flex; align-items: center; justify-content: center; padding: 18px;
  background: rgba(6,10,20,0.45);
}
.map-panel {
  --map-opacity: 0.82;
  width: min(900px, 100%); max-height: 90%; display: flex; flex-direction: column;
  background: rgba(20,28,48,var(--map-opacity)); border: 2px solid rgba(255,203,5,.3);
  border-radius: 14px; padding: 14px; box-shadow: 0 12px 40px rgba(0,0,0,.5);
}
.map-canvas { flex:1; min-height: 0; }
.map-fade-enter-active, .map-fade-leave-active { transition: opacity .2s; }
.map-fade-enter-from, .map-fade-leave-to { opacity: 0; }
</style>
