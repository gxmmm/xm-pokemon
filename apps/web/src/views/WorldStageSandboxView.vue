<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { WORLD_SCENE_BY_MAP_ID } from '@pokemon-online/config';
import type { QualityProfile, WorldEntityRenderSnapshot } from '@pokemon-online/renderer';
import { WorldStage } from '@pokemon-online/renderer-pixi';

const viewport = ref<HTMLElement | null>(null);
const quality = ref<QualityProfile>('cinematic');
const running = ref(true);
const status = ref('正在建立雾湾镇 scene pack…');
const time = ref(0);
const scene = WORLD_SCENE_BY_MAP_ID.pallet!;
const stage = new WorldStage(quality.value);
let raf = 0;
let last = 0;

const landmarks = computed(() => scene.landmarks ?? []);
function snapshot(at: number): readonly WorldEntityRenderSnapshot[] {
  const stroll = 7.2 + Math.sin(at * 0.8) * 1.1;
  return [
    { id: 'player', kind: 'player', position: { x: stroll, y: 9.6 }, facing: 'right' },
    { id: 'professor-lan', kind: 'npc', position: { x: 6, y: 6 }, facing: 'down' },
    { id: 'harbor-villager', kind: 'npc', position: { x: 12, y: 5 }, facing: 'left' },
    { id: 'dock-fisher', kind: 'npc', position: { x: 3.5, y: 11 }, facing: 'up' },
  ];
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
function setQuality(): void {
  stage.setQuality(quality.value);
  status.value = `${quality.value}：雾层密度已按质量档位调整，scene 与地图规则仍完全分离。`;
}
watch(quality, setQuality);
onMounted(async () => {
  if (!viewport.value) return;
  await stage.mount(viewport.value);
  await stage.enterScene({ sceneId: scene.id, biomeId: scene.biome }, scene);
  stage.applyWorldSnapshot({ time: 0, entities: snapshot(0) });
  status.value = '雾湾镇 WorldStage 已挂载：灯塔、研究所、码头、前景屋檐与薄雾均来自 WorldSceneSpec。';
  last = performance.now();
  raf = requestAnimationFrame(frame);
});
onUnmounted(() => { cancelAnimationFrame(raf); stage.unmount(); });
</script>

<template>
  <section class="world-stage-page">
    <header><p class="eyebrow">VISUAL RUNTIME · STAGE 4</p><h1>雾湾镇 WorldStage 垂直切片</h1><p>独立 scene pack 验证页：不接管 WorldView 的移动、碰撞、剧情或 encounter。</p></header>
    <div class="controls">
      <button type="button" @click="running = !running">{{ running ? '暂停人物行为' : '继续人物行为' }}</button>
      <label>质量 <select v-model="quality"><option value="cinematic">cinematic</option><option value="standard">standard</option><option value="compatibility">compatibility</option></select></label>
      <span>{{ scene.biome }} · {{ landmarks.length }} 个配置化地标 · 玩家会穿过屋檐</span>
    </div>
    <div ref="viewport" class="viewport" aria-label="Mist Bay WorldStage sandbox"></div>
    <p class="status">{{ status }}</p>
    <ul><li>地标配置：灯塔、潮汐研究所、码头、市场屋檐、前景雾带。</li><li>代表角色：玩家、澜博士、渔人阿澈、码头渔民行为占位；玩家会在屋檐遮挡范围内往返。</li><li>切换质量档位会立即重建雾层：cinematic 最密、standard 居中、compatibility 最少。</li><li>旧 WorldCanvas 未增加雾湾镇特例；本页只证明 scene/render 层可独立工作。</li></ul>
  </section>
</template>

<style scoped>
.world-stage-page{min-height:100%;padding:28px;color:#eaf5f5;background:#10212d}.eyebrow{margin:0;color:#92e3dd;font-size:12px;font-weight:800;letter-spacing:.14em}h1{margin:6px 0}header>p:last-child{color:#b9d1d4}.controls{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:18px 0 12px}button,select{min-height:34px;color:#effbfb;background:#244d59;border:1px solid #6093a0;border-radius:6px;padding:0 10px}label{display:flex;align-items:center;gap:6px;color:#c1dadd}.viewport{width:min(100%,1080px);aspect-ratio:16/9;overflow:hidden;border:2px solid #5d9899;border-radius:10px;background:#8cb6c4;box-shadow:0 14px 40px rgba(0,0,0,.35)}.status{color:#b9ebd6}ul{color:#b8cdd2;line-height:1.7}
</style>
