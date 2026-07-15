<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { BattleSim, createWildInstance } from '@pokemon-online/engine';
import { BattlePresentationBridge } from '../game/BattlePresentationBridge.ts';
import { BattleStage } from '@pokemon-online/renderer-pixi';
import type { QualityProfile } from '@pokemon-online/renderer';

const viewport = ref<HTMLElement | null>(null);
const running = ref(false);
const speed = ref(1);
const requestedQuality = ref<QualityProfile>('cinematic');
const biomeId = ref<'grass' | 'cave' | 'water' | 'dragon' | 'arena'>('grass');
const status = ref('准备中');
const simulationTime = ref(0);
const stage = new BattleStage(requestedQuality.value);
const bridge = new BattlePresentationBridge();
let sim: BattleSim | null = null;
let raf = 0;
let lastFrame = 0;

const qualityLabel = computed(() => requestedQuality.value);

function makeSimulation(): BattleSim {
  return new BattleSim({
    mode: 'pve',
    isWild: true,
    seed: 140718,
    player: [createWildInstance(6, 22), createWildInstance(25, 21), createWildInstance(1, 20)],
    enemy: [createWildInstance(143, 23)],
  });
}

async function resetBattle(): Promise<void> {
  sim = makeSimulation();
  const presentation = bridge.reset(sim)!;
  await stage.enterBattle({ biomeId: biomeId.value, combatants: presentation.combatants });
  stage.applyBattleSnapshot(presentation);
  simulationTime.value = 0;
  status.value = `${biomeId.value} 环境样板就绪：3v1 自动战斗，Pixi 仅消费 presentation snapshot 与 directed cues。`;
}

function toggle(): void { running.value = !running.value; }
function setQuality(): void {
  stage.setQuality(requestedQuality.value);
  status.value = `质量档位已切换为 ${requestedQuality.value}。compatibility 会保留战斗信息并降低环境密度。`;
}

function frame(now: number): void {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if (sim && running.value) {
    const scaled = dt * speed.value;
    if (!sim.isOver) sim.tick(scaled);
    const presentationFrame = bridge.advance(sim, scaled);
    stage.applyBattleSnapshot(presentationFrame.presentation);
    void stage.playBattleCues(presentationFrame.cues.map((entry) => entry.cue));
    simulationTime.value = sim.state.time;
    if (sim.isOver && presentationFrame.isCaughtUp && stage.isSettled()) {
      running.value = false;
      status.value = '战斗已结束；规则结果由 BattleSim 决定，Pixi 仅完成了对应演出。';
    }
  }
  raf = requestAnimationFrame(frame);
}

watch(requestedQuality, setQuality);
watch(biomeId, () => { void resetBattle(); });
onMounted(async () => {
  if (!viewport.value) return;
  await stage.mount(viewport.value);
  await resetBattle();
  lastFrame = performance.now();
  raf = requestAnimationFrame(frame);
});
onUnmounted(() => {
  cancelAnimationFrame(raf);
  stage.unmount();
});
</script>

<template>
  <section class="battle-stage-page">
    <header>
      <p class="eyebrow">VISUAL RUNTIME · STAGE 3</p>
      <h1>Pixi BattleStage 垂直切片</h1>
      <p>独立样板页：不替换正式 BattleView，不接触 Pinia 或 engine 内部状态。Vue 只提供控制与说明。</p>
    </header>

    <div class="controls">
      <button type="button" @click="toggle">{{ running ? '暂停' : '开始' }}</button>
      <button type="button" @click="resetBattle">重置 3v1</button>
      <label>速度 <select v-model.number="speed"><option :value="1">1x</option><option :value="2">2x</option><option :value="3">3x</option></select></label>
      <label>环境 <select v-model="biomeId"><option value="grass">grass</option><option value="cave">cave</option><option value="water">water</option><option value="dragon">dragon</option><option value="arena">arena</option></select></label>
      <label>质量 <select v-model="requestedQuality"><option value="cinematic">cinematic</option><option value="standard">standard</option><option value="compatibility">compatibility</option></select></label>
      <span>模拟时间 {{ simulationTime.toFixed(1) }}s · {{ qualityLabel }}</span>
    </div>

    <div ref="viewport" class="viewport" aria-label="Pixi BattleStage vertical slice"></div>
    <p class="status">{{ status }}</p>
    <ul>
      <li>已实现：grass / cave / water / dragon / arena 配置化 biome、CombatantView、camera rig、presentation-only hit-stop。</li>
      <li>程序化 primitives：projectile/trail、impact、beam、burst、ring，以及 config-gated scorch / frost / spark / splash / spore / debris / rune-pulse。</li>
      <li>现有 Canvas 主路径保持不变；这是下一步替换前的并行验证入口。</li>
    </ul>
  </section>
</template>

<style scoped>
.battle-stage-page { min-height: 100%; padding: 28px; color: #e7efff; background: #0d1724; }
.eyebrow { margin: 0; color: #9be6ae; font-size: 12px; font-weight: 800; letter-spacing: .14em; } h1 { margin: 6px 0; } header > p:last-child { color: #afc0d4; }
.controls { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin: 18px 0 12px; } button, select { min-height: 34px; color: #eff8ff; background: #1f3951; border: 1px solid #527b91; border-radius: 6px; padding: 0 10px; } label { display: flex; align-items: center; gap: 6px; color: #bed2e5; }
.viewport { width: min(100%, 1080px); aspect-ratio: 16 / 9; overflow: hidden; border: 2px solid #4c806c; border-radius: 10px; background: #10213a; box-shadow: 0 14px 40px rgba(0,0,0,.34); }.status { color: #bfe8c6; } ul { color: #aebed0; line-height: 1.7; }
</style>
