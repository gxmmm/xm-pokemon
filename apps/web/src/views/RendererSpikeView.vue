<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { PIXI_SPIKE_LAYER_ORDER, PixiRendererSpike } from '@pokemon-online/renderer-pixi';
import { selectQualityProfile, type QualityProfile } from '@pokemon-online/renderer';

const viewport = ref<HTMLElement | null>(null);
const requestedQuality = ref<QualityProfile>('cinematic');
const mounted = ref(false);
const message = ref('等待挂载。该页面仅验证 renderer 生命周期，不接入正式世界或战斗。');
const quality = computed(() => selectQualityProfile({
  preferredQuality: requestedQuality.value,
  webgl: supportsWebGl(),
  webgl2: supportsWebGl2(),
  devicePixelRatio: window.devicePixelRatio,
  deviceMemoryGb: navigatorDeviceMemory(),
}));
const spike = new PixiRendererSpike(quality.value);

function context(kind: 'webgl' | 'webgl2'): WebGLRenderingContext | WebGL2RenderingContext | null {
  const canvas = document.createElement('canvas');
  return canvas.getContext(kind) as WebGLRenderingContext | WebGL2RenderingContext | null;
}
function supportsWebGl(): boolean { return !!context('webgl'); }
function supportsWebGl2(): boolean { return !!context('webgl2'); }
function navigatorDeviceMemory(): number | undefined {
  return (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
}

async function mountSpike(): Promise<void> {
  if (!viewport.value) return;
  if (mounted.value) spike.unmount();
  spike.setQuality(quality.value.quality);
  await spike.mount(viewport.value);
  await spike.enterWorld({ sceneId: 'mist-bay-town', biomeId: 'mist-harbor' });
  await spike.transition({ kind: 'fade', durationMs: 180, color: '#0c1724' });
  mounted.value = true;
  const report = spike.report();
  message.value = `已挂载 Pixi ${report.renderer}：${report.layers.length} 层、RenderTexture=${report.usesRenderTexture ? '通过' : '失败'}、additive=${report.additiveParticles ? '通过' : '失败'}。`;
}

function unmountSpike(): void {
  spike.unmount();
  mounted.value = false;
  message.value = '已销毁 canvas、RenderTexture 和 ResizeObserver。';
}

onUnmounted(unmountSpike);
</script>

<template>
  <section class="spike-page">
    <header>
      <p class="eyebrow">VISUAL RUNTIME · STAGE 1</p>
      <h1>Pixi GPU Renderer Spike</h1>
      <p>隔离验证固定设计分辨率、分层容器、GPU 粒子、additive blend、RenderTexture、resize 与资源销毁。</p>
    </header>

    <div class="controls">
      <label>请求质量
        <select v-model="requestedQuality" :disabled="mounted">
          <option value="cinematic">cinematic</option>
          <option value="standard">standard</option>
          <option value="compatibility">compatibility</option>
        </select>
      </label>
      <button type="button" @click="mountSpike">{{ mounted ? '重新挂载' : '挂载 Spike' }}</button>
      <button type="button" :disabled="!mounted" @click="unmountSpike">销毁 Spike</button>
      <span>实际：<b>{{ quality.quality }}</b>{{ quality.reason ? `（${quality.reason}）` : '' }}</span>
    </div>

    <div ref="viewport" class="viewport" aria-label="Pixi renderer spike viewport"></div>
    <p class="status">{{ message }}</p>
    <ol class="layers"><li v-for="layer in PIXI_SPIKE_LAYER_ORDER" :key="layer">{{ layer }}</li></ol>
  </section>
</template>

<style scoped>
.spike-page { min-height: 100%; padding: 28px; color: #e6edf7; background: #111827; }
.eyebrow { margin: 0; color: #75e4d6; font-size: 12px; font-weight: 800; letter-spacing: .14em; }
h1 { margin: 6px 0; font-size: 28px; } header > p:last-child { margin: 0; color: #aec1d5; }
.controls { display: flex; align-items: end; flex-wrap: wrap; gap: 12px; margin: 20px 0 12px; }
label { display: grid; gap: 4px; color: #b9cde0; font-size: 13px; } select, button { min-height: 34px; border-radius: 6px; border: 1px solid #55708c; background: #1d314a; color: #f2f7fb; padding: 0 10px; } button { cursor: pointer; } button:disabled { opacity: .45; cursor: default; }
.viewport { width: min(100%, 1040px); aspect-ratio: 16 / 9; overflow: hidden; border: 2px solid #42647c; border-radius: 10px; background: #0c1423; box-shadow: 0 12px 40px rgba(0,0,0,.28); }
.status { color: #aeead6; }.layers { display: flex; flex-wrap: wrap; gap: 8px 18px; padding-left: 20px; color: #9eb3ca; font-size: 12px; }
</style>

