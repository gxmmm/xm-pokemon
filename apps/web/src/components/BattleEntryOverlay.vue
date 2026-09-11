<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useBattleStore } from '../stores/battle.ts';
import { useMessage } from '../stores/message.ts';
import { BattleEntryGate } from '../game/BattleEntryGate.ts';

const battle = useBattleStore();
const router = useRouter();
const message = useMessage();
let gate: BattleEntryGate | null = null;
let origin = '/world';
watch(() => battle.sim, sim => {
  gate?.dispose(); gate = null;
  if (!sim || battle.phase !== 'loading') return;
  origin = router.currentRoute.value.path === '/battle' ? '/world' : router.currentRoute.value.fullPath;
  gate = new BattleEntryGate(() => {
    if (battle.sim === sim) battle.begin();
  }, () => {
    if (battle.sim !== sim) return;
    battle.clear();
    message.error('网络异常，战斗资源未能加载，已返回原场景。');
    void router.replace(origin);
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
  window.removeEventListener('keydown', blockGameKeys, true);
  window.removeEventListener('keyup', blockGameKeys, true);
});
</script>

<template>
  <div v-if="battle.sim && battle.phase === 'loading'" class="battle-entry" role="status" aria-live="polite" aria-label="战斗过场">
    <div class="entry-band top"></div><div class="entry-band bottom"></div>
    <div class="entry-center"><div class="entry-mark"><i></i><i></i><i></i></div><h1>准备迎战</h1><p>正在准备战斗场景</p></div>
  </div>
</template>

<style scoped>
.battle-entry { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; overflow: hidden; background: #142b29; color: #f2e9c6; }
.entry-band { position: absolute; inset-inline: -10%; height: 26%; background: repeating-linear-gradient(90deg,#315449 0 64px,#28463f 64px 128px); transform: skewY(-6deg); animation: march 1s steps(8) infinite; border-block: 8px solid #52705a; }
.top { top: 7%; }.bottom { bottom: 7%; animation-direction: reverse; }
.entry-center { position: relative; text-align: center; }.entry-center h1 { font-size: 32px; letter-spacing: 8px; margin: 20px 0 12px; }.entry-center p { color: #b7c6b2; }
.entry-mark { display: flex; justify-content: center; gap: 12px; }.entry-mark i { width: 12px; height: 12px; background: #efd18b; animation: pulse 900ms steps(2) infinite; }.entry-mark i:nth-child(2) { animation-delay: 150ms; }.entry-mark i:nth-child(3) { animation-delay: 300ms; }
@keyframes march { to { translate: 64px 0; } } @keyframes pulse { 50% { translate: 0 -8px; background: #88ae87; } }
</style>
