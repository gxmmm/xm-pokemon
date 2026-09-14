<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { BattleSim, createWildInstance } from '@pokemon-online/engine';
import { BattlePresentationBridge } from '../game/BattlePresentationBridge.ts';
import { BattleStage } from '@pokemon-online/renderer-pixi';
import { startRendererObservation } from '../visuals/runtime-observation.ts';

const viewport = ref<HTMLElement | null>(null);
const running = ref(false);
const speed = ref(1);
const biomeId = ref<'grass' | 'cave' | 'water' | 'dragon' | 'arena'>('grass');
const status = ref('准备中');
const simulationTime = ref(0);
const stage = new BattleStage();
const bridge = new BattlePresentationBridge();
let sim: BattleSim | null = null;
let raf = 0;
let lastFrame = 0;
let disposed = false;
let resetVersion = 0;
let stopObservation: (() => void) | null = null;

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
  if (disposed) return;
  const version = ++resetVersion;
  const nextSim = makeSimulation();
  sim = null;
  const presentation = bridge.reset(nextSim)!;
  await stage.enterBattle({ biomeId: biomeId.value, combatants: presentation.combatants });
  if (disposed || version !== resetVersion) return;
  sim = nextSim;
  stage.applyBattleSnapshot(presentation);
  simulationTime.value = 0;
  status.value = '场景已就绪：三对一自动战斗。';
}

function toggle(): void { running.value = !running.value; }

function frame(now: number): void {
  if (disposed) return;
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
      status.value = '战斗已结束。';
    }
  }
  raf = requestAnimationFrame(frame);
}

watch(biomeId, () => { void resetBattle(); });
onMounted(async () => {
  if (disposed || !viewport.value) return;
  await stage.mount(viewport.value);
  if (disposed) return;
  await resetBattle();
  if (disposed) return;
  stopObservation = startRendererObservation('battle', () => stage.getDiagnostics() as unknown as Record<string, unknown>);
  lastFrame = performance.now();
  raf = requestAnimationFrame(frame);
});
onUnmounted(() => {
  disposed = true;
  resetVersion++;
  stopObservation?.();
  cancelAnimationFrame(raf);
  stage.unmount();
});
</script>

<template>
  <section class="battle-stage-page">
    <header>
      <p class="eyebrow">战斗演示</p>
      <h1>战斗场景预览</h1>
      <p>观察自动战斗与技能效果，可切换场景、暂停或调整播放速度。</p>
    </header>

    <div class="controls">
      <button type="button" @click="toggle">{{ running ? '暂停' : '开始' }}</button>
      <button type="button" @click="resetBattle">重置三对一</button>
      <label>速度 <select v-model.number="speed"><option :value="1">1 倍</option><option :value="2">2 倍</option><option :value="3">3 倍</option></select></label>
      <label>环境 <select v-model="biomeId"><option value="grass">草地</option><option value="cave">洞窟</option><option value="water">水域</option><option value="dragon">龙穴</option><option value="arena">竞技场</option></select></label>
      <span>模拟时间 {{ simulationTime.toFixed(1) }} 秒 · 标准品质</span>
    </div>

    <div ref="viewport" class="viewport" aria-label="战斗场景预览"></div>
    <p class="status">{{ status }}</p>
    <ul>
      <li>可预览草地、洞窟、水域、龙穴与竞技场。</li>
      <li>观察角色出招、技能飞行与命中效果。</li>
      <li>此处战斗不影响玩家存档。</li>
    </ul>
  </section>
</template>

<style scoped>
.battle-stage-page { min-height: 100%; padding: 28px; color: #e7efff; background: #0d1724; }
.eyebrow { margin: 0; color: #9be6ae; font-size: 12px; font-weight: 800; letter-spacing: .14em; } h1 { margin: 6px 0; } header > p:last-child { color: #afc0d4; }
.controls { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin: 18px 0 12px; } button, select { min-height: 34px; color: #eff8ff; background: #1f3951; border: 1px solid #527b91; border-radius: 6px; padding: 0 10px; } label { display: flex; align-items: center; gap: 6px; color: #bed2e5; }
.viewport { width: min(100%, 1080px); aspect-ratio: 16 / 9; overflow: hidden; border: 2px solid #4c806c; border-radius: 10px; background: #10213a; box-shadow: 0 14px 40px rgba(0,0,0,.34); }.status { color: #bfe8c6; } ul { color: #aebed0; line-height: 1.7; }
</style>
