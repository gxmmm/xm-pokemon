<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useGameStore } from '../stores/game.ts';
import { useBattleStore } from '../stores/battle.ts';
import { getMap, isWalkable, isEncounterTile, MAP_MAP, STORY_TRAINERS, STORY_WARP_REQUIREMENTS, WORLD_SCENE_BY_MAP_ID, isGpuWorldMapId, isLowTideReefCell, isTideBlockedCell, sceneForNpc, sceneForObject, storyQuestLabel, visibleStoryNpcs, visibleStoryObjects, type StoryNpc, type StoryObject, type StoryScene } from '@pokemon-online/config';
import { rollWildGroup, ENCOUNTER_CHANCE, dayNight } from '@pokemon-online/engine';
import type { Facing } from '@pokemon-online/shared';
import type { QualityProfile, WorldEntityRenderSnapshot } from '@pokemon-online/renderer';
import WorldCanvas from '../components/WorldCanvas.vue';
import PixiWorldViewport from '../components/PixiWorldViewport.vue';
import WorldMap from '../components/WorldMap.vue';
import { createTransitionState, runTransition } from '../world/transitions.ts';
import { consumeWorldReturnVisualTransition, requestBattleVisualTransition } from '../game/SceneVisualTransition.ts';
import { visualRuntimeCapabilities, visualRuntimeSettings } from '../visuals/runtime-settings.ts';
import { hasRendererObservationWorldScene, isRendererObservationWorldScene, rendererObservationEnabled } from '../visuals/runtime-observation.ts';

declare global {
  interface Window {
    __PO_WORLD_BEHAVIOR_DIAGNOSTICS__?: () => {
      mapId: string;
      sceneId: string | null;
      renderer: WorldRendererMode;
      position: { x: number; y: number };
      activeQuest: string | null;
      npcIds: readonly string[];
      objectIds: readonly string[];
      nearbyNpcId: string | null;
      nearbyObjectId: string | null;
      encounterEligible: boolean;
      diagnosticWorldScene: boolean;
    };
  }
}

const game = useGameStore();
const battle = useBattleStore();
const router = useRouter();
const returnedFromGpuBattle = consumeWorldReturnVisualTransition();

const map = computed(() => getMap(game.save!.currentMapId));
type WorldRendererMode = 'canvas' | 'pixi';
/** Formal eligibility stays config-owned. The observation-only branch below is an
 * authenticated diagnostic for a pending Scene Pack; it never mutates the gate. */
function canBridgeGpuWorld(mapId: string): boolean {
  return isGpuWorldMapId(mapId) || hasRendererObservationWorldScene(mapId);
}
const rendererMode = ref<WorldRendererMode>(
  returnedFromGpuBattle && canBridgeGpuWorld(returnedFromGpuBattle.mapId)
    ? 'pixi'
    : isRendererObservationWorldScene(map.value.id) ? 'pixi' : 'canvas',
);
const pixiQuality = ref<QualityProfile>(visualRuntimeCapabilities.value.quality);
const pixiStatus = ref(returnedFromGpuBattle && canBridgeGpuWorld(returnedFromGpuBattle.mapId)
  ? '正在恢复 GPU 世界 renderer…'
  : isRendererObservationWorldScene(map.value.id) ? 'GPU WorldView observation diagnostic' : 'Canvas compatibility renderer');
const pixiWorldRef = ref<InstanceType<typeof PixiWorldViewport> | null>(null);
const gpuWorldScene = computed(() => canBridgeGpuWorld(map.value.id) ? WORLD_SCENE_BY_MAP_ID[map.value.id] : undefined);
/** Keep the player-visible toggle tied to the formal config gate. */
const canUseGpuWorld = computed(() => isGpuWorldMapId(map.value.id));
watch(() => visualRuntimeCapabilities.value.quality, (quality) => {
  pixiQuality.value = quality;
  if (rendererMode.value === 'pixi') pixiStatus.value = `GPU ${map.value.name} ${quality} renderer`;
});
const worldEntities = computed<WorldEntityRenderSnapshot[]>(() => [
  { id: 'player', kind: 'player', position: { x: view.px, y: view.py }, facing: view.facing },
  ...npcs.value.map((npc) => ({ id: npc.id, kind: 'npc' as const, position: { x: npc.x, y: npc.y } })),
  ...objects.value.map((object) => ({ id: object.id, kind: 'object' as const, position: { x: object.x, y: object.y } })),
]);
function toggleWorldRenderer(): void {
  if (!canUseGpuWorld.value || rendererMode.value === 'pixi') {
    rendererMode.value = 'canvas';
    pixiStatus.value = 'Canvas compatibility renderer';
    return;
  }
  pixiQuality.value = visualRuntimeCapabilities.value.quality;
  rendererMode.value = 'pixi';
  pixiStatus.value = `正在初始化 GPU ${map.value.name} renderer…`;
}
async function onPixiWorldReady(): Promise<void> {
  pixiStatus.value = `GPU ${map.value.name} ${pixiQuality.value} renderer`;
  if (returnedFromGpuBattle?.mapId === map.value.id && canBridgeGpuWorld(map.value.id)) {
    await nextTick();
    await pixiWorldRef.value?.playTransition({ kind: 'biome-crossfade', durationMs: 260, color: '#0b2430' });
  }
}
function onPixiWorldUnavailable(message: string): void {
  rendererMode.value = 'canvas';
  pixiStatus.value = `GPU 不可用，已回退 Canvas：${message}`;
}
async function enterBattleRoute(): Promise<void> {
  // Route handoff transports visual intent only. Battle facts have already been
  // created by the battle store and world movement stays frozen by `leaving`.
  if (rendererMode.value === 'pixi' && canBridgeGpuWorld(map.value.id)) {
    await pixiWorldRef.value?.playTransition({ kind: 'biome-crossfade', durationMs: 240, color: '#0b2430' });
    requestBattleVisualTransition({ mapId: map.value.id, quality: pixiQuality.value });
  }
  await router.push({ name: 'battle' });
}
const dn = computed(() => dayNight());
const showMap = ref(false);
const visitedSet = computed(() => new Set(game.save?.visitedMaps ?? []));
const npcs = computed<StoryNpc[]>(() => visibleStoryNpcs(map.value.id, game.save?.story));
const objects = computed<StoryObject[]>(() => visibleStoryObjects(map.value.id, game.save?.story));
const nearbyObject = computed<StoryObject | null>(() => {
  const px = Math.round(view.px), py = Math.round(view.py);
  return objects.value.find((object) => Math.abs(object.x - px) + Math.abs(object.y - py) === 1) ?? null;
});
const nearbyNpc = computed<StoryNpc | null>(() => {
  const px = Math.round(view.px), py = Math.round(view.py);
  return npcs.value.find((npc) => Math.abs(npc.x - px) + Math.abs(npc.y - py) === 1) ?? null;
});
const dialog = ref<StoryScene | null>(null);
const dialogNpc = ref<StoryNpc | null>(null);
const dialogIndex = ref(0);
const dialogDone = ref(false);
const objective = computed(() => storyQuestLabel(game.save?.story.activeQuest ?? 'meet-professor'));
const tide = computed(() => game.save?.story.tide ?? 'high');
const canInteract = computed(() => (!!nearbyNpc.value || !!nearbyObject.value) && !dialog.value && !transition.active && !leaving);
watch(gpuWorldScene, (scene) => {
  if (scene) {
    if (isRendererObservationWorldScene(map.value.id)) {
      rendererMode.value = 'pixi';
      pixiStatus.value = `GPU ${map.value.name} observation diagnostic`;
    }
    return;
  }
  rendererMode.value = 'canvas';
  pixiStatus.value = 'Canvas compatibility renderer';
});
// A pending-map observation can cross approved Canvas/GPU maps before reaching
// its target. Map-id watching makes the target handoff explicit even when both
// the prior and next scenes already have non-null Scene Pack DTOs.
watch(() => map.value.id, (mapId) => {
  if (!isRendererObservationWorldScene(mapId)) return;
  rendererMode.value = 'pixi';
  pixiStatus.value = `GPU ${map.value.name} observation diagnostic`;
});

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
return (isWalkable(tileAt(x, y)) || (tide.value === 'low' && isLowTideReefCell(map.value.id, x, y))) && !isTideBlockedCell(map.value.id, x, y, tide.value) && !npcs.value.some((npc) => npc.x === x && npc.y === y);
}

function tryStartMove(dx: number, dy: number): void {
  if (!game.save || moveAnim || transition.active || leaving || dialog.value) return;
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
    const requirement = STORY_WARP_REQUIREMENTS[`${map.value.id}:${exit.toMapId}`];
if (requirement && !game.hasStoryFlag(requirement.flag)) { openGateHint(requirement.hint, exit.x, exit.y); return; }
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
          void enterBattleRoute().then(() => { if (router.currentRoute.value.name !== 'battle') leaving = false; }).catch(() => { leaving = false; });
        }
      }
    }
  }
}

function openNpc(npc: StoryNpc): void {
  if (!game.save) return;
  dialogNpc.value = npc;
  dialog.value = sceneForNpc(npc.id, game.save.story);
  dialogIndex.value = 0;
  dialogDone.value = false;
}
function openObject(object: StoryObject): void {
  if (!game.save) return;
  const roleByKind: Partial<Record<StoryObject['kind'], string>> = {
    core: '异相反应', star: '星图线索', 'tide-gauge': '潮汐装置', 'ship-log': '航海记录', anchor: '深潮反应',
    'gravity-node': '失重反应', terminal: '古代装置', 'legend-echo': '回响记录',
  };
  dialogNpc.value = { id: object.id, mapId: object.mapId, x: object.x, y: object.y, name: object.name, role: roleByKind[object.kind] ?? '潮光线索', palette: 'researcher' };
  dialog.value = sceneForObject(object.id, game.save.story);
  dialogIndex.value = 0;
  dialogDone.value = false;
}
function closeDialog(): void {
  if (!dialog.value || !game.save) return;
  if (dialog.value.grantFlags?.length || dialog.value.activeQuest) game.advanceStory(dialog.value.grantFlags, dialog.value.activeQuest);
  if (dialog.value.tide) game.setTide(dialog.value.tide);
  dialog.value = null;
  dialogNpc.value = null;
  dialogIndex.value = 0;
  dialogDone.value = false;
}
function nextDialog(): void {
  if (!dialog.value) return;
  if (!dialogDone.value) { dialogDone.value = true; return; }
  if (dialogIndex.value < dialog.value.lines.length - 1) { dialogIndex.value++; dialogDone.value = false; return; }
  if (!dialog.value.choices?.length) closeDialog();
}
async function chooseDialog(kind: 'close' | 'trainer-battle' | 'warp' | 'set-tide', battleId?: string, mapId?: string, x?: number, y?: number, nextTide?: 'high' | 'low'): Promise<void> {
  if (kind === 'close') { closeDialog(); return; }
  if (kind === 'set-tide' && nextTide) {
    game.setTide(nextTide);
    if (nextTide === 'low') game.advanceStory(['tide_low'], 'find-ship-log');
    dialog.value = null; dialogNpc.value = null;
    return;
  }
  if (kind === 'warp' && mapId !== undefined && x !== undefined && y !== undefined) {
    dialog.value = null; dialogNpc.value = null;
    await runTransition(transition, 'cave', '深空遗址', () => { game.travelTo(mapId, x, y); syncViewFromSave(); });
    return;
  }
  const trainer = battleId ? STORY_TRAINERS[battleId] : undefined;
  if (!trainer) return;
  const ok = battle.startStoryTrainer(trainer.team, trainer.name, trainer.id);
  if (!ok) return;
  dialog.value = null; dialogNpc.value = null; heldDir = null; moveAnim = null; leaving = true;
  void enterBattleRoute().then(() => { if (router.currentRoute.value.name !== 'battle') leaving = false; }).catch(() => { leaving = false; });
}
function openGateHint(text: string, x = Math.round(view.px), y = Math.round(view.py)): void {
  dialogNpc.value = { id: 'path-marker', mapId: map.value.id, x, y, name: '前方的路', role: '', palette: 'villager' };
  dialog.value = { lines: [{ speaker: '前方的路', text }] };
  dialogIndex.value = 0; dialogDone.value = false;
}
function showBlockedExit(): void {
  const px = Math.round(view.px), py = Math.round(view.py);
  for (const exit of map.value.warps) {
    if (Math.abs(exit.x - px) + Math.abs(exit.y - py) !== 1) continue;
    const requirement = STORY_WARP_REQUIREMENTS[`${map.value.id}:${exit.toMapId}`];
    if (requirement && !game.hasStoryFlag(requirement.flag)) {
      openGateHint(requirement.hint, exit.x, exit.y);
      return;
    }
  }
}

const KEY_MAP: Record<string, [number, number]> = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
  W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0],
};
function onKey(e: KeyboardEvent): void {
  if (e.key === ' ' || e.key === 'Enter' || e.key.toLowerCase() === 'e') {
    e.preventDefault();
    if (dialog.value) nextDialog();
    else if (nearbyNpc.value) openNpc(nearbyNpc.value);
    else if (nearbyObject.value) openObject(nearbyObject.value);
    else showBlockedExit();
    return;
  }
  const dir = KEY_MAP[e.key];
  if (!dir) return;
  e.preventDefault();
  heldDir = { dx: dir[0], dy: dir[1] };
  if (!moveAnim && !transition.active) tryStartMove(dir[0], dir[1]);
}
function onKeyUp(e: KeyboardEvent): void {
  if (e.key in KEY_MAP) heldDir = null;
}

function heal(): void { game.healAll(); }
function interact(): void { if (dialog.value) nextDialog(); else if (nearbyNpc.value) openNpc(nearbyNpc.value); else if (nearbyObject.value) openObject(nearbyObject.value); else showBlockedExit(); }

onMounted(() => {
  leaving = false;
  syncViewFromSave();
  if (rendererObservationEnabled) {
    window.__PO_WORLD_BEHAVIOR_DIAGNOSTICS__ = () => ({
      mapId: map.value.id,
      sceneId: gpuWorldScene.value?.id ?? null,
      renderer: rendererMode.value,
      position: { x: Math.round(view.px), y: Math.round(view.py) },
      activeQuest: game.save?.story.activeQuest ?? null,
      npcIds: npcs.value.map((npc) => npc.id),
      objectIds: objects.value.map((object) => object.id),
      nearbyNpcId: nearbyNpc.value?.id ?? null,
      nearbyObjectId: nearbyObject.value?.id ?? null,
      encounterEligible: isEncounterTile(tileAt(Math.round(view.px), Math.round(view.py)), map.value),
      diagnosticWorldScene: isRendererObservationWorldScene(map.value.id),
    });
  }
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
        <span class="chip" v-if="map.id === 'sea-route'">{{ tide === 'low' ? '🌊 低潮' : '🌊 高潮' }}</span>
      </div>
      <div class="row" style="gap:6px">
        <button class="sm ghost" @click="showMap = !showMap">🗺 地图</button>
        <button class="sm ghost" @click="interact">💬 交互</button>
        <button class="sm ghost" @click="heal">💊 治疗</button>
        <button v-if="canUseGpuWorld" class="sm ghost" :title="pixiStatus" @click="toggleWorldRenderer">{{ rendererMode === 'pixi' ? `GPU ${map.name}` : 'Canvas' }}</button>
      </div>
    </div>
    <p class="tiny muted" style="margin:0 0 5px">{{ map.description }} {{ map.ambient }}</p>
    <div class="objective"><span>主线目标</span><strong>{{ objective }}</strong></div>

    <div class="canvas-wrap">
      <WorldCanvas v-if="rendererMode === 'canvas'"
        :map="map"
        :px="view.px"
        :py="view.py"
        :facing="view.facing"
        :moving="view.moving"
        :npcs="npcs"
        :interact-npc-id="nearbyNpc?.id ?? null"
        :objects="objects"
        :interact-object-id="nearbyObject?.id ?? null"
        :tide="tide"
      />
      <PixiWorldViewport v-else-if="gpuWorldScene" ref="pixiWorldRef" :scene="gpuWorldScene" :entities="worldEntities" :quality="pixiQuality" :visual-settings="visualRuntimeSettings" @ready="onPixiWorldReady" @unavailable="onPixiWorldUnavailable" />
    </div>

    <div v-if="(nearbyNpc || nearbyObject) && !dialog" class="interact-hint">按 <b>E</b> / 空格 {{ nearbyNpc ? `与 ${nearbyNpc.name} 对话` : `调查 ${nearbyObject?.name}` }}</div>

    <div v-if="dialog && dialogNpc" class="dialog-layer" @click.self="nextDialog">
      <div class="dialog-box">
        <div class="dialog-head"><span class="dialog-portrait">{{ dialogNpc.name.slice(0, 1) }}</span><div><b>{{ dialog.lines[dialogIndex]?.speaker }}</b><small>{{ dialog.lines[dialogIndex]?.role || dialogNpc.role }}</small></div></div>
        <p class="dialog-text">{{ dialog.lines[dialogIndex]?.text }}</p>
        <div v-if="dialogIndex < dialog.lines.length - 1 || !dialogDone" class="dialog-next">{{ dialogDone ? '点击或按空格继续' : '点击或按空格显示完整文字' }}</div>
        <div v-else-if="dialog.choices?.length" class="dialog-choices"><button v-for="choice in dialog.choices" :key="choice.label" :class="choice.kind === 'trainer-battle' ? 'gold' : 'ghost'" @click="chooseDialog(choice.kind, choice.battleId, choice.mapId, choice.x, choice.y, choice.tide)">{{ choice.label }}</button></div>
        <button v-else class="sm ghost dialog-close" @click="closeDialog">结束对话</button>
      </div>
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

.objective { border-left:3px solid var(--gold); background:rgba(255,203,5,.10); padding:5px 8px; margin-bottom:5px; font-size:12px; display:flex; gap:8px; align-items:center; }
.objective span { color:var(--gold); font-weight:800; white-space:nowrap; }.objective strong { color:var(--ink); }
.interact-hint { position:absolute; left:50%; bottom:18px; transform:translateX(-50%); z-index:15; background:rgba(10,17,31,.88); color:#f6f3e2; border:1px solid rgba(255,235,160,.55); border-radius:14px; padding:5px 12px; font-size:12px; box-shadow:0 3px 10px rgba(0,0,0,.35); }.interact-hint b { color:#ffe88c; }
.dialog-layer { position:absolute; inset:0; z-index:55; display:flex; align-items:flex-end; padding:18px; background:linear-gradient(transparent 38%,rgba(5,8,18,.28)); }
.dialog-box { width:min(760px,100%); margin:0 auto; background:linear-gradient(180deg,#1a2843,#101a2d); color:#f5f4ec; border:3px solid #d8b85c; box-shadow:0 8px 0 #080d18,0 18px 45px rgba(0,0,0,.58); border-radius:12px; padding:12px 16px; }
.dialog-head { display:flex; align-items:center; gap:9px; color:#ffe89a; }.dialog-head small { display:block; color:#aebed8; font-size:11px; margin-top:1px; }.dialog-portrait { width:30px; height:30px; display:grid; place-items:center; border-radius:50%; background:#456e9d; color:#fff; border:2px solid #b9daf7; font-weight:900; }
.dialog-text { min-height:56px; margin:9px 0 5px; line-height:1.65; font-size:15px; text-shadow:0 1px 1px #000; }.dialog-next { color:#a9c9f5; font-size:11px; text-align:right; }.dialog-choices { display:flex; gap:8px; justify-content:flex-end; }.dialog-close { float:right; }

</style>
