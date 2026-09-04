<script setup lang="ts">
declare global { interface Window { __WORLD_STAGE_DIAGNOSTICS__?: () => import('@pokemon-online/renderer-pixi').WorldStageDiagnostics; } }
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { MAPS, WORLD_SCENE_BY_MAP_ID } from '@pokemon-online/config';
import type { WorldEntityRenderSnapshot } from '@pokemon-online/renderer';
import { WorldStage } from '@pokemon-online/renderer-pixi';

const viewport = ref<HTMLElement | null>(null);
const visualRegressionMode = new URLSearchParams(window.location.search).get('visual-regression') === '1';
const requestedScene = new URLSearchParams(window.location.search).get('visual-scene');
const running = ref(!visualRegressionMode);
const sceneMapId = ref(MAPS.some((map) => map.id === requestedScene) ? requestedScene! : 'pallet');
const status = ref('正在挂载 WorldStage…');
const time = ref(0);
const scene = computed(() => WORLD_SCENE_BY_MAP_ID[sceneMapId.value]!);
const stage = new WorldStage();
let raf = 0;
let last = 0;

const landmarks = computed(() => scene.value.landmarks ?? []);
function snapshot(at: number): readonly WorldEntityRenderSnapshot[] {
  return [{ id: 'player', kind: 'player', position: { x: 8 + Math.sin(at * 0.56), y: 10.6 }, facing: 'up' }];
}

async function syncScene(): Promise<void> {
  await stage.enterScene({ sceneId: scene.value.id, biomeId: scene.value.biome }, scene.value);
  stage.applyWorldSnapshot({ time: time.value, entities: snapshot(time.value) });
  status.value = `${MAPS.find((map) => map.id === sceneMapId.value)!.name}均来自 WorldSceneSpec，WorldStage 已挂载。`;
}
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (running.value) {
    time.value += dt;
    stage.applyWorldSnapshot({ time: time.value, entities: snapshot(time.value) });
  }
  raf = requestAnimationFrame(frame);
}
watch(sceneMapId, () => { void syncScene(); });
onMounted(async () => {
  if (!viewport.value) return;
  await stage.mount(viewport.value);
  stage.setMotionEnabled(!visualRegressionMode);
  await syncScene();
  if (visualRegressionMode) {
    window.__WORLD_STAGE_DIAGNOSTICS__ = () => stage.getDiagnostics();
    document.documentElement.dataset.visualRegressionReady = 'true';
  }
  last = performance.now();
  raf = requestAnimationFrame(frame);
});
onUnmounted(() => {
  cancelAnimationFrame(raf);
  delete window.__WORLD_STAGE_DIAGNOSTICS__;
  delete document.documentElement.dataset.visualRegressionReady;
  stage.unmount();
});
</script>

<template>
  <section class="world-stage-page">
    <header><p class="eyebrow">VISUAL REGRESSION</p><h1>WorldStage sandbox</h1><p>独立 Scene Pack 验证页：不接管 WorldView 的移动、碰撞、warp 或 encounter。</p></header>
    <div class="controls">
      <button type="button" @click="running = !running">{{ running ? '暂停人物行为' : '继续人物行为' }}</button>
      <label>场景 <select v-model="sceneMapId"><option v-for="map in MAPS" :key="map.id" :value="map.id">{{ map.name }}</option></select></label>
      <span>{{ scene.biome }} · {{ landmarks.length }} 个配置化地标</span>
    </div>
    <div ref="viewport" class="viewport" :class="sceneMapId" aria-label="WorldStage sandbox" data-testid="world-stage-viewport"></div>
    <p class="status">{{ status }}</p>
    <ul>
      <li>该页面只验证 Scene Pack 与 WorldStage，不接管移动、碰撞、遭遇或存档。</li>
      <li>世界场景统一使用标准品质与固定表现预算；所有正式地图统一使用 Pixi。</li>
    </ul>
  </section>
</template>

<style scoped>
.world-stage-page{min-height:100%;padding:28px;color:#eaf5f5;background:#10212d}.eyebrow{margin:0;color:#b9ee9d;font-size:12px;font-weight:800;letter-spacing:.14em}h1{margin:6px 0}header>p:last-child{color:#b9d1d4}.controls{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:18px 0 12px}button,select{min-height:34px;color:#effbfb;background:#244d59;border:1px solid #6093a0;border-radius:6px;padding:0 10px}label{display:flex;align-items:center;gap:6px;color:#c1dadd}.viewport{width:min(100%,1080px);aspect-ratio:16/9;overflow:hidden;border:2px solid #5d9899;border-radius:10px;box-shadow:0 14px 40px rgba(0,0,0,.35)}.viewport{background:#17213b}.viewport.illusion-tower-1,.viewport.illusion-tower-2,.viewport.illusion-tower-3,.viewport.illusion-tower-4,.viewport.illusion-tower-5{background:#24113d}.viewport.pallet{background:#8cb6c4}.status{color:#b9ebd6}ul{color:#b8cdd2;line-height:1.7}code{padding:1px 4px;border-radius:3px;background:#17342e;color:#d8f5ae}
</style>
