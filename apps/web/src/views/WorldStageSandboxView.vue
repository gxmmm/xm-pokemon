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
const sceneMapId = ref<'viridian-forest' | 'route3' | 'dragon-den' | 'deep-space' | 'mt-moon' | 'route1' | 'pallet'>(requestedScene === 'viridian-forest' || requestedScene === 'route3' || requestedScene === 'dragon-den' || requestedScene === 'deep-space' || requestedScene === 'mt-moon' || requestedScene === 'route1' || requestedScene === 'pallet' ? requestedScene : 'route3');
const status = ref('正在建立星陨高径 scene pack…');
const time = ref(0);
const scene = computed(() => WORLD_SCENE_BY_MAP_ID[sceneMapId.value]!);
const stage = new WorldStage(quality.value);
let raf = 0;
let last = 0;

const landmarks = computed(() => scene.value.landmarks ?? []);
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
  status.value = sceneMapId.value === 'route3'
    ? '星陨高径 WorldStage 已挂载：断崖岩壁、石阶古道、坠星刻痕、前景岩檐与高空星尘均来自 WorldSceneSpec。'
    : sceneMapId.value === 'viridian-forest'
      ? '迷雾林境 WorldStage 已挂载：树墙、孢子林地、根环、遮挡树冠、低雾与剧情对象外观均来自 WorldSceneSpec。'
      : sceneMapId.value === 'dragon-den'
      ? '潮洞 WorldStage 已挂载：潮蚀洞壁、盐晶潮池、锚印地台、洞口雾幕与守望者均来自 WorldSceneSpec。'
      : sceneMapId.value === 'deep-space'
        ? '深空遗迹 WorldStage 已挂载：失重石台、裂隙拱门、悬浮碎片、异常遗物与符文尘粒均来自 WorldSceneSpec。'
        : sceneMapId.value === 'mt-moon'
          ? '星陨观测所 WorldStage 已挂载：观测穹顶、陨石尖塔、星图地台、晶簇、裂隙雾与星图师均来自 WorldSceneSpec。'
          : sceneMapId.value === 'route1'
            ? '萤火林道 WorldStage 已挂载：树墙、路径、草地、根须、树冠遮挡、萤火与岚巡员均来自 WorldSceneSpec。'
            : '雾湾镇 WorldStage 已挂载：灯塔、研究所、码头、前景屋檐与薄雾均来自 WorldSceneSpec。';
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
    <header><p class="eyebrow">VISUAL RUNTIME · STAGE 9.1-draft</p><h1>WorldStage sandbox</h1><p>独立 scene pack 验证页：不接管 WorldView 的移动、碰撞、剧情、warp 或 encounter。</p></header>
    <div class="controls">
      <button type="button" @click="running = !running">{{ running ? '暂停人物行为' : '继续人物行为' }}</button>
      <label>场景 <select v-model="sceneMapId"><option value="route3">星陨高径</option><option value="viridian-forest">迷雾林境</option><option value="dragon-den">潮洞</option><option value="deep-space">深空遗迹对照</option><option value="mt-moon">星陨观测所对照</option><option value="route1">萤火林道对照</option><option value="pallet">雾湾镇对照</option></select></label>
      <label>质量 <select v-model="quality"><option value="cinematic">cinematic</option><option value="standard">standard</option><option value="compatibility">compatibility</option></select></label>
      <span>{{ scene.biome }} · {{ landmarks.length }} 个配置化地标 · {{ sceneMapId === 'route3' ? '玩家会穿过断崖岩檐前景' : sceneMapId === 'viridian-forest' ? '玩家会穿过迷雾树冠前景' : sceneMapId === 'dragon-den' ? '玩家会穿过潮雾前景' : sceneMapId === 'deep-space' ? '玩家会穿过近景失重石台' : sceneMapId === 'mt-moon' ? '玩家会穿过穹顶前景' : sceneMapId === 'route1' ? '玩家会穿过树冠前景' : '玩家会穿过屋檐' }}</span>
    </div>
    <div ref="viewport" class="viewport" :class="sceneMapId" aria-label="WorldStage sandbox" data-testid="world-stage-viewport"></div>
    <p class="status">{{ status }}</p>
    <ul v-if="sceneMapId === 'route3'"><li>高径配置：断崖岩壁、石阶古道、风化台地、坠星刻痕、岩檐遮挡与高空星尘全部来自通用 landmark / palette / ambience grammar。</li><li>剧情样本：陵导员 洛岩 <code>(6, 8)</code>、三枚坠星刻痕 <code>(3, 4)</code> / <code>(12, 6)</code> / <code>(5, 11)</code> 仅作为 renderer DTO；真实可见性、坐标和交互仍由既有 story/runtime 权威管理。</li><li><code>starlight</code> ambience 与 <code>sunlit-route</code> 高径色板由 scene config 描述；三档质量只降低粒子数量，不改变对象或地图规则。</li><li>本包仅完成 sandbox-first 与视觉回归候选；<code>route3</code> 未加入 GPU migration gate，Canvas 未删除，待人工验收后才可继续正式行为回归。</li></ul>
    <ul v-else-if="sceneMapId === 'viridian-forest'"><li>迷雾森林配置：远景树墙、孢子林地、根环、苔石、近景树冠与低雾全部来自通用 landmark / palette / ambience grammar。</li><li>剧情样本：织羽 <code>(10, 9)</code>、三枚潮光孢子 <code>(3, 4)</code> / <code>(12, 7)</code> / <code>(4, 11)</code> 与异相核 <code>(8, 5)</code> 仅作为 renderer DTO；真实可见性、坐标和交互仍由既有 story/runtime 权威管理。</li><li><code>mist</code> ambience 与 <code>mist-forest</code> 色板由 scene config 描述；三档质量只降低粒子数量，不改变对象或地图规则。</li><li>本包仅完成 sandbox-first 与视觉回归候选；<code>viridian-forest</code> 未加入 GPU migration gate，Canvas 未删除，待人工验收后才可继续正式行为回归。</li></ul>
    <ul v-else-if="sceneMapId === 'dragon-den'"><li>潮洞配置：潮蚀洞壁、盐晶潮池、深潮锚印地台、前景潮雾与符文尘粒。</li><li>剧情样本：潮洞守望者 <code>(10, 8)</code>、深潮锚印 <code>(8, 5)</code> 与深空裂隙 <code>(8, 2)</code> 仅作为 renderer DTO；坐标与可见性仍由既有 story/runtime 权威管理。</li><li><code>rune</code> ambience 与 <code>dragon-grotto</code> 色板由 scene config 描述；质量切换只改变粒子数量。</li><li>潮洞已通过人工验收并可经既有 Canvas / GPU 控制受控启用；规则与存档继续由原有 runtime/config 管理。</li></ul>
    <ul v-else-if="sceneMapId === 'deep-space'"><li>异常遗迹配置：失重石台、裂隙拱门、悬浮碎片、前景石台、裂隙雾与符文尘粒。</li><li>剧情样本：三个失重晶簇、古代终端、裂隙守卫核心和幻兽回响仅作为 renderer DTO object，坐标与可见性仍由既有 story/runtime 权威管理。</li><li><code>rune</code> ambience 与 <code>deep-ruin</code> 色板由 scene config 描述；质量切换只改变粒子数量。</li><li>深空遗迹已通过人工验收并可经既有 Canvas / GPU 控制受控启用；规则与存档继续由原有 runtime/config 管理。</li></ul>
    <ul v-else-if="sceneMapId === 'mt-moon'"><li>强地标配置：观测穹顶、陨石尖塔、星图地台、晶簇、裂隙雾与星光尘粒。</li><li>环境样本：玩家穿过穹顶上缘；星图师朔使用原有配置坐标 <code>(11, 8)</code> 追踪星图；星图镜仅为 renderer DTO object。</li><li><code>starlight</code> ambience 与 <code>moon-cavern</code> 色板由 scene config 描述；质量切换只改变粒子数量。</li><li>本页暂不接入正式 WorldView；观测所的自然 encounterFloor、碰撞、warp、NPC、剧情和存档继续由原有 runtime/config 管理。</li></ul>
    <ul v-else-if="sceneMapId === 'route1'"><li>自然场景配置：远景树墙、非单格重复树群、林间路径、发光草地、根须、苔石、前景树冠与低雾。</li><li>对照场景保留用于验证通用 WorldStage 未因观测所能力回归。</li></ul>
    <ul v-else><li>地标配置：灯塔、潮汐研究所、码头、市场屋檐、前景雾带。</li><li>对照场景保留用于验证通用 WorldStage 未因观测所能力回归。</li></ul>
  </section>
</template>

<style scoped>
.world-stage-page{min-height:100%;padding:28px;color:#eaf5f5;background:#10212d}.eyebrow{margin:0;color:#b9ee9d;font-size:12px;font-weight:800;letter-spacing:.14em}h1{margin:6px 0}header>p:last-child{color:#b9d1d4}.controls{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:18px 0 12px}button,select{min-height:34px;color:#effbfb;background:#244d59;border:1px solid #6093a0;border-radius:6px;padding:0 10px}label{display:flex;align-items:center;gap:6px;color:#c1dadd}.viewport{width:min(100%,1080px);aspect-ratio:16/9;overflow:hidden;border:2px solid #5d9899;border-radius:10px;box-shadow:0 14px 40px rgba(0,0,0,.35)}.viewport{background:#17213b}.viewport.route3{background:#5d84ae}.viewport.dragon-den{background:#143847}.viewport.viridian-forest{background:#183741}.viewport.deep-space{background:#160d31}.viewport.route1{background:#173b42}.viewport.pallet{background:#8cb6c4}.status{color:#b9ebd6}ul{color:#b8cdd2;line-height:1.7}code{padding:1px 4px;border-radius:3px;background:#17342e;color:#d8f5ae}
</style>
