<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue';
import { BATTLE_ENTRY } from '@pokemon-online/config';
import { useRouter } from 'vue-router';
import { useBattleStore } from '../stores/battle.ts';
import { useMessage } from '../stores/message.ts';
import { BattleEntryGate } from '../game/BattleEntryGate.ts';

const battle = useBattleStore();
const router = useRouter();
const message = useMessage();
let gate: BattleEntryGate | null = null;
let origin = '/world';
const stage = ref<'impact' | 'locked' | 'reveal'>('impact');
const aperture = ref(1);
let animation = 0;
let started = 0;
let revealStarted = 0;
let revealDuration = 0;
// 中心短缝先横向打开，再以阶梯边缘向四边展开。
const curtainPath = computed(() => {
  const p = aperture.value;
  const w = 530 * Math.pow(p, .55), h = 530 * p * p;
  const x = 500 - w, y = 500 - h, r = Math.min(24, w * .22, h * .4);
  return `M0 0H1000V1000H0Z M${x+r} ${y}H${1000-x-r}V${y+r}H${1000-x}V${1000-y-r}H${1000-x-r}V${1000-y}H${x+r}V${1000-y-r}H${x}V${y+r}H${x+r}Z`;
});
function animate(now: number): void {
  if (!battle.sim || battle.phase !== 'loading') return;
  if (stage.value === 'reveal') aperture.value = Math.min(1, Math.floor((now - revealStarted) / revealDuration * 24) / 24);
  else {
    const elapsed = now - started;
    aperture.value = 1 - Math.min(1, Math.max(0, (elapsed - 100) / (BATTLE_ENTRY.impactMs - 100)));
    if (elapsed >= BATTLE_ENTRY.impactMs) stage.value = 'locked';
  }
  animation = requestAnimationFrame(animate);
}
watch(() => battle.sim, sim => {
  gate?.dispose(); gate = null;
  cancelAnimationFrame(animation);
  if (!sim || battle.phase !== 'loading') return;
  stage.value = 'impact'; aperture.value = 1; started = performance.now();
  animation = requestAnimationFrame(animate);
  origin = router.currentRoute.value.path === '/battle' ? '/world' : router.currentRoute.value.fullPath;
  gate = new BattleEntryGate(() => {
    if (battle.sim === sim) { aperture.value = 1; cancelAnimationFrame(animation); battle.begin(); }
  }, () => {
    if (battle.sim !== sim) return;
    battle.clear();
    message.error('网络异常，战斗资源未能加载，已返回原场景。');
    void router.replace(origin);
  }, undefined, duration => {
    stage.value = 'reveal'; aperture.value = 0;
    revealStarted = performance.now(); revealDuration = duration;
  });
}, { flush: 'sync', immediate: true });
watch(() => battle.assetsReady, ready => { if (ready) gate?.ready(); }, { flush: 'sync' });
watch(() => router.currentRoute.value.fullPath, path => {
  if (battle.phase === 'loading' && path !== '/battle' && path !== origin) battle.clear();
});
function blockGameKeys(event: KeyboardEvent): void {
  if (!battle.sim || battle.phase !== 'loading') return;
  event.preventDefault();
  event.stopImmediatePropagation();
}
onMounted(() => {
  window.addEventListener('keydown', blockGameKeys, true);
  window.addEventListener('keyup', blockGameKeys, true);
});
onUnmounted(() => {
  gate?.dispose();
  cancelAnimationFrame(animation);
  window.removeEventListener('keydown', blockGameKeys, true);
  window.removeEventListener('keyup', blockGameKeys, true);
});
</script>

<template>
  <div v-if="battle.sim && battle.phase === 'loading'" class="battle-entry" :class="stage" :data-stage="stage" role="status" aria-live="polite" aria-label="战斗过场">
    <svg class="curtain" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true"><path :d="curtainPath" fill="#06090e" fill-rule="evenodd" /></svg>
    <div class="impact-lines" aria-hidden="true"><i v-for="n in 6" :key="n" :style="{ '--n': n }"></i></div>
    <div class="lock" aria-hidden="true"><i v-for="n in 4" :key="n" :class="`corner c${n}`"></i><b></b><span class="sight horizontal"></span><span class="sight vertical"></span></div>
    <div class="entry-caption"><strong>遭遇敌人</strong><span>准备迎战</span><div class="signal"><i></i><i></i><i></i></div></div>
  </div>
</template>

<style scoped>
.battle-entry { position: fixed; inset: 0; z-index: 1000; overflow: hidden; color: #f1dbad; }
.curtain { position: absolute; width: 100%; height: 100%; }
.lock { position: absolute; left: 50%; top: 50%; width: 88px; height: 64px; margin: -32px -44px; animation: acquire 300ms steps(5) both; }
.corner { position: absolute; width: 20px; height: 16px; border-color: #e9bd72; border-style: solid; border-width: 0; }
.c1 { left: 0; top: 0; border-left-width: 4px; border-top-width: 4px; }.c2 { right: 0; top: 0; border-right-width: 4px; border-top-width: 4px; }.c3 { right: 0; bottom: 0; border-right-width: 4px; border-bottom-width: 4px; }.c4 { left: 0; bottom: 0; border-left-width: 4px; border-bottom-width: 4px; }
.lock b { position: absolute; left: 40px; top: 28px; width: 8px; height: 8px; background: #f6e7c4; }
.sight { position: absolute; background: #70583b; }.horizontal { width: 136px; height: 2px; left: -24px; top: 31px; }.vertical { width: 2px; height: 104px; top: -20px; left: 43px; }
.entry-caption { position: absolute; top: calc(50% + 84px); left: 0; right: 0; text-align: center; animation: caption-in 350ms steps(1) both; }
.entry-caption strong { display: block; font-size: 24px; letter-spacing: 10px; }.entry-caption span { display: block; margin-top: 12px; font-size: 12px; letter-spacing: 5px; color: #9a998e; }
.signal { display: flex; justify-content: center; gap: 8px; margin-top: 22px; }.signal i { width: 4px; height: 4px; background: #c6a268; animation: signal 1200ms steps(3) infinite; }.signal i:nth-child(2) { animation-delay: 200ms; }.signal i:nth-child(3) { animation-delay: 400ms; }
.locked .lock { animation: tension 1200ms steps(4) infinite; }
.reveal .lock { animation: unlock 200ms steps(4) forwards; }.reveal .entry-caption { visibility: hidden; }
.impact-lines { position: absolute; inset: 0; }.impact-lines i { position: absolute; top: calc(12% + var(--n) * 11%); width: 36%; height: 4px; background: #eee1b1; transform: skewX(-35deg); animation: strike 280ms steps(5) both; }.impact-lines i:nth-child(even) { right: 0; }.impact-lines i:nth-child(odd) { left: 0; }
.locked .impact-lines, .reveal .impact-lines { display: none; }
@keyframes strike { 0% { scale: 0 1; opacity: 0; } 30% { scale: 1 1; opacity: .8; } 100% { scale: .2 1; opacity: 0; } }
@keyframes acquire { from { scale: 2.6; opacity: 0; } 40% { opacity: 1; } to { scale: 1; opacity: 1; } }
@keyframes caption-in { 0%, 99% { opacity: 0; } 100% { opacity: 1; } }
@keyframes tension { 50% { translate: 0 -2px; } }
@keyframes signal { 50% { opacity: .25; } }
@keyframes unlock { to { scale: 1.8; opacity: 0; } }
</style>
