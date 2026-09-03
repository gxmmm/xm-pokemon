<script setup lang="ts">
declare global { interface Window { __WORLD_STAGE_DIAGNOSTICS__?: () => import('@pokemon-online/renderer-pixi').WorldStageDiagnostics; } }
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { WORLD_SCENE_BY_MAP_ID } from '@pokemon-online/config';
import type { QualityProfile, WorldEntityRenderSnapshot } from '@pokemon-online/renderer';
import { WorldStage } from '@pokemon-online/renderer-pixi';

const viewport = ref<HTMLElement | null>(null);
const visualRegressionMode = new URLSearchParams(window.location.search).get('visual-regression') === '1';
const requestedQuality = new URLSearchParams(window.location.search).get('visual-quality');
const requestedScene = new URLSearchParams(window.location.search).get('visual-scene');
const quality = ref<QualityProfile>(requestedQuality === 'standard' || requestedQuality === 'compatibility' ? requestedQuality : 'cinematic');
const running = ref(!visualRegressionMode);
const SANDBOX_MAP_IDS = [
  'viridian-forest', 'route3', 'rock-tunnel', 'sea-route', 'dragon-den',
  'deep-space', 'mt-moon', 'route1', 'pallet',
  'illusion-tower-1', 'illusion-tower-2', 'illusion-tower-3', 'illusion-tower-4', 'illusion-tower-5',
] as const;
type SandboxMapId = typeof SANDBOX_MAP_IDS[number];
type TowerMapId = Extract<SandboxMapId, `illusion-tower-${number}`>;
const SANDBOX_MAP_ID_SET = new Set<string>(SANDBOX_MAP_IDS);
const isSandboxMapId = (mapId: string | null): mapId is SandboxMapId => mapId !== null && SANDBOX_MAP_ID_SET.has(mapId);
const isTowerMapId = (mapId: SandboxMapId): mapId is TowerMapId => mapId.startsWith('illusion-tower-');
const sceneMapId = ref<SandboxMapId>(isSandboxMapId(requestedScene) ? requestedScene : 'illusion-tower-1');
const status = ref('正在挂载 WorldStage…');
const time = ref(0);
const scene = computed(() => WORLD_SCENE_BY_MAP_ID[sceneMapId.value]!);
const stage = new WorldStage(quality.value);
let raf = 0;
let last = 0;

const landmarks = computed(() => scene.value.landmarks ?? []);
const SCENE_READY_MESSAGE: Readonly<Record<Exclude<SandboxMapId, TowerMapId>, string>> = {
  'route3': '星陨高径：断崖岩壁、石阶古道、坠星刻痕、前景岩檐与高空星尘',
  'rock-tunnel': '赤砾裂谷：赤色岩壁、矿脉、落石台、低光岩檐与风沙',
  'sea-route': '静潮群岛：礁石群岛、浅潮水道、低潮沉船、潮洞口与海雾',
  'viridian-forest': '迷雾林境：树墙、孢子林地、根环、遮挡树冠、低雾与剧情对象外观',
  'dragon-den': '潮洞：潮蚀洞壁、盐晶潮池、锚印地台、洞口雾幕与守望者',
  'deep-space': '深空遗迹：失重石台、裂隙拱门、悬浮碎片、异常遗物与符文尘粒',
  'mt-moon': '星陨观测所：观测穹顶、陨石尖塔、星图地台、晶簇、裂隙雾与星图师',
  'route1': '萤火林道：树墙、路径、草地、根须、树冠遮挡、萤火与岚巡员',
  'pallet': '雾湾镇：灯塔、研究所、码头、前景屋檐与薄雾',
};

function sceneReadyMessage(mapId: SandboxMapId): string {
  if (isTowerMapId(mapId)) {
    const floor = Number(mapId.slice(-1));
    return `幻境之塔${'一二三四五'[floor - 1]}层：参数化石阶台地、投影晶簇、裂隙雾、近景阴影与符文尘粒`;
  }
  return SCENE_READY_MESSAGE[mapId];
}
function snapshot(at: number): readonly WorldEntityRenderSnapshot[] {
  if (sceneMapId.value === 'viridian-forest') {
    const stroll = 8 + Math.sin(at * 0.62) * 1.1;
    return [
      { id: 'player', kind: 'player', position: { x: stroll, y: 10.4 }, facing: 'up' },
      { id: 'mist-runner', kind: 'npc', position: { x: 10, y: 9 }, facing: 'left' },
      { id: 'lumen-1', kind: 'object', position: { x: 3, y: 4 }, facing: 'up' },
      { id: 'lumen-2', kind: 'object', position: { x: 12, y: 7 }, facing: 'up' },
      { id: 'lumen-3', kind: 'object', position: { x: 4, y: 11 }, facing: 'up' },
      { id: 'anomaly-core', kind: 'object', position: { x: 8, y: 5 }, facing: 'up' },
    ];
  }
  if (sceneMapId.value === 'illusion-tower-1' || sceneMapId.value === 'illusion-tower-2' || sceneMapId.value === 'illusion-tower-3' || sceneMapId.value === 'illusion-tower-4' || sceneMapId.value === 'illusion-tower-5') {
    const stroll = 8 + Math.sin(at * 0.56) * 1.1;
    return [{ id: 'player', kind: 'player', position: { x: stroll, y: 10.6 }, facing: 'up' }];
  }
  if (sceneMapId.value === 'route3') {
    const stroll = 8 + Math.sin(at * 0.66) * 1.16;
    return [
      { id: 'player', kind: 'player', position: { x: stroll, y: 10.5 }, facing: 'up' },
      { id: 'ridge-guide', kind: 'npc', position: { x: 6, y: 8 }, facing: 'right' },
      { id: 'star-1', kind: 'object', position: { x: 3, y: 4 }, facing: 'up' },
      { id: 'star-2', kind: 'object', position: { x: 12, y: 6 }, facing: 'up' },
      { id: 'star-3', kind: 'object', position: { x: 5, y: 11 }, facing: 'up' },
    ];
  }
  if (sceneMapId.value === 'rock-tunnel') {
    const stroll = 8 + Math.sin(at * 0.56) * 1.05;
    return [{ id: 'player', kind: 'player', position: { x: stroll, y: 10.7 }, facing: 'up' }];
  }
  if (sceneMapId.value === 'sea-route') {
    const stroll = 8 + Math.sin(at * 0.6) * 1.1;
    return [
      { id: 'player', kind: 'player', position: { x: stroll, y: 10.8 }, facing: 'up' },
      { id: 'tide-captain', kind: 'npc', position: { x: 6, y: 10 }, facing: 'right' },
      { id: 'chart-apprentice', kind: 'npc', position: { x: 11, y: 5 }, facing: 'left' },
      { id: 'tide-gauge', kind: 'object', position: { x: 4, y: 10 }, facing: 'up' },
      { id: 'ship-log', kind: 'object', position: { x: 12, y: 4 }, facing: 'up' },
    ];
  }
  if (sceneMapId.value === 'dragon-den') {
    const stroll = 7.8 + Math.sin(at * 0.64) * 1.12;
    return [
      { id: 'player', kind: 'player', position: { x: stroll, y: 10.7 }, facing: 'up' },
      { id: 'reef-keeper', kind: 'npc', position: { x: 10, y: 8 }, facing: 'left' },
      { id: 'tide-anchor', kind: 'object', position: { x: 8, y: 5 }, facing: 'up' },
      { id: 'deep-space-gate', kind: 'object', position: { x: 8, y: 2 }, facing: 'up' },
    ];
  }
  if (sceneMapId.value === 'deep-space') {
    const stroll = 7.8 + Math.sin(at * 0.58) * 1.15;
    return [
      { id: 'player', kind: 'player', position: { x: stroll, y: 10.8 }, facing: 'up' },
      { id: 'gravity-node-1', kind: 'object', position: { x: 3, y: 2 }, facing: 'up' },
      { id: 'gravity-node-2', kind: 'object', position: { x: 12, y: 5 }, facing: 'up' },
      { id: 'gravity-node-3', kind: 'object', position: { x: 5, y: 10 }, facing: 'up' },
      { id: 'ancient-terminal', kind: 'object', position: { x: 8, y: 5 }, facing: 'up' },
      { id: 'rift-heart', kind: 'object', position: { x: 8, y: 9 }, facing: 'up' },
      { id: 'legend-echo', kind: 'object', position: { x: 8, y: 2 }, facing: 'up' },
    ];
  }
  if (sceneMapId.value === 'mt-moon') {
    const stroll = 7.7 + Math.sin(at * 0.62) * 1.05;
    return [
      { id: 'player', kind: 'player', position: { x: stroll, y: 9.7 }, facing: 'up' },
      { id: 'sky-cartographer', kind: 'npc', position: { x: 11, y: 8 }, facing: 'left' },
      { id: 'star-chart-lens', kind: 'object', position: { x: 8, y: 7.7 }, facing: 'up' },
    ];
  }
  if (sceneMapId.value === 'route1') {
    const stroll = 7.7 + Math.sin(at * 0.72) * 1.25;
    return [
      { id: 'player', kind: 'player', position: { x: stroll, y: 9.8 }, facing: 'right' },
      { id: 'lantern-scout', kind: 'npc', position: { x: 7, y: 5 }, facing: 'down' },
      { id: 'lumen-sprout', kind: 'object', position: { x: 10.8, y: 8.2 }, facing: 'up' },
    ];
  }
  const stroll = 7.2 + Math.sin(at * 0.8) * 1.1;
  return [
    { id: 'player', kind: 'player', position: { x: stroll, y: 9.6 }, facing: 'right' },
    { id: 'professor-lan', kind: 'npc', position: { x: 6, y: 6 }, facing: 'down' },
    { id: 'harbor-villager', kind: 'npc', position: { x: 12, y: 5 }, facing: 'left' },
    { id: 'dock-fisher', kind: 'npc', position: { x: 3.5, y: 11 }, facing: 'up' },
  ];
}

async function syncScene(): Promise<void> {
  await stage.enterScene({ sceneId: scene.value.id, biomeId: scene.value.biome }, scene.value);
  stage.applyWorldSnapshot({ time: time.value, entities: snapshot(time.value) });
  status.value = `${sceneReadyMessage(sceneMapId.value)}均来自 WorldSceneSpec，WorldStage 已挂载。`;
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
  status.value = `${quality.value}：环境粒子密度已按质量档位调整，scene 与地图规则仍完全分离。`;
}
watch(quality, setQuality);
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
    <header><p class="eyebrow">VISUAL REGRESSION</p><h1>WorldStage sandbox</h1><p>独立 Scene Pack 验证页：不接管 WorldView 的移动、碰撞、剧情、warp 或 encounter。</p></header>
    <div class="controls">
      <button type="button" @click="running = !running">{{ running ? '暂停人物行为' : '继续人物行为' }}</button>
      <label>场景 <select v-model="sceneMapId"><option value="illusion-tower-1">幻境之塔·一层</option><option value="illusion-tower-2">幻境之塔·二层</option><option value="illusion-tower-3">幻境之塔·三层</option><option value="illusion-tower-4">幻境之塔·四层</option><option value="illusion-tower-5">幻境之塔·五层（同一参数包）</option><option value="sea-route">静潮群岛</option><option value="rock-tunnel">赤砾裂谷</option><option value="route3">星陨高径</option><option value="viridian-forest">迷雾林境</option><option value="dragon-den">潮洞</option><option value="deep-space">深空遗迹对照</option><option value="mt-moon">星陨观测所对照</option><option value="route1">萤火林道对照</option><option value="pallet">雾湾镇对照</option></select></label>
      <label>质量 <select v-model="quality"><option value="cinematic">cinematic</option><option value="standard">standard</option><option value="compatibility">compatibility</option></select></label>
      <span>{{ scene.biome }} · {{ landmarks.length }} 个配置化地标 · {{ sceneMapId.startsWith('illusion-tower-') ? '玩家会穿过投影符文雾幕' : sceneMapId === 'sea-route' ? '玩家会穿过礁石海雾前景' : sceneMapId === 'rock-tunnel' ? '玩家会穿过低光岩檐前景' : sceneMapId === 'route3' ? '玩家会穿过断崖岩檐前景' : sceneMapId === 'viridian-forest' ? '玩家会穿过迷雾树冠前景' : sceneMapId === 'dragon-den' ? '玩家会穿过潮雾前景' : sceneMapId === 'deep-space' ? '玩家会穿过近景失重石台' : sceneMapId === 'mt-moon' ? '玩家会穿过穹顶前景' : sceneMapId === 'route1' ? '玩家会穿过树冠前景' : '玩家会穿过屋檐' }}</span>
    </div>
    <div ref="viewport" class="viewport" :class="sceneMapId" aria-label="WorldStage sandbox" data-testid="world-stage-viewport"></div>
    <p class="status">{{ status }}</p>
    <ul>
      <li>该页面只验证 Scene Pack 与 WorldStage，不接管移动、碰撞、遭遇、剧情或存档。</li>
      <li>三档质量只调整表现预算，不改变地图规则；所有正式地图统一使用 Pixi。</li>
    </ul>
  </section>
</template>

<style scoped>
.world-stage-page{min-height:100%;padding:28px;color:#eaf5f5;background:#10212d}.eyebrow{margin:0;color:#b9ee9d;font-size:12px;font-weight:800;letter-spacing:.14em}h1{margin:6px 0}header>p:last-child{color:#b9d1d4}.controls{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:18px 0 12px}button,select{min-height:34px;color:#effbfb;background:#244d59;border:1px solid #6093a0;border-radius:6px;padding:0 10px}label{display:flex;align-items:center;gap:6px;color:#c1dadd}.viewport{width:min(100%,1080px);aspect-ratio:16/9;overflow:hidden;border:2px solid #5d9899;border-radius:10px;box-shadow:0 14px 40px rgba(0,0,0,.35)}.viewport{background:#17213b}.viewport.illusion-tower-1,.viewport.illusion-tower-2,.viewport.illusion-tower-3,.viewport.illusion-tower-4,.viewport.illusion-tower-5{background:#24113d}.viewport.sea-route{background:#183f58}.viewport.rock-tunnel{background:#2a2534}.viewport.route3{background:#5d84ae}.viewport.dragon-den{background:#143847}.viewport.viridian-forest{background:#183741}.viewport.deep-space{background:#160d31}.viewport.route1{background:#173b42}.viewport.pallet{background:#8cb6c4}.status{color:#b9ebd6}ul{color:#b8cdd2;line-height:1.7}code{padding:1px 4px;border-radius:3px;background:#17342e;color:#d8f5ae}
</style>
