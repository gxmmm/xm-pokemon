<script setup lang="ts">
import { onMounted, onUnmounted, computed, watch, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from './stores/auth.ts';
import { useGameStore } from './stores/game.ts';
import MessageHost from './components/MessageHost.vue';
import GameMenu from './components/GameMenu.vue';
import BattleEntryOverlay from './components/BattleEntryOverlay.vue';
import { useBattleStore } from './stores/battle.ts';

const auth = useAuthStore();
const game = useGameStore();
const battle = useBattleStore();
const enteringBattle = computed(() => !!battle.sim && battle.phase === 'loading');
const router = useRouter();
const route = useRoute();
const view = ref<HTMLElement | null>(null);
watch(() => route.path, () => view.value?.scrollTo({ top: 0, left: 0 }));

const showNav = computed(() => auth.isAuthenticated && game.hasSave && route.name !== 'new' && route.name !== 'load-error');
// battle manages its own controls + result modal; hide the global menu/back there
const showChrome = computed(() => showNav.value && route.path !== '/battle' && !enteringBattle.value);
// Use the immutable initial URL rather than reactive router timing. Standalone
// validation sandboxes never unlock the playable world or account-bound routes.
const standaloneSandboxMode = computed(() => {
  const path = window.location.pathname;
  if (path.endsWith('/battle-sandbox') || path.endsWith('/vfx-lab')) return true;
  return new URLSearchParams(window.location.search).get('visual-regression') === '1'
    && (path.endsWith('/world-stage-sandbox') || path.endsWith('/battle-stage-sandbox'));
});

function protectUnsaved(event: BeforeUnloadEvent): void {
  if (!game.unsaved) return;
  event.preventDefault();
  event.returnValue = '';
}

onMounted(() => {
  // Authentication and save loading have a single owner: the route guard.
  window.addEventListener('beforeunload', protectUnsaved);
});
onUnmounted(() => {
  window.removeEventListener('beforeunload', protectUnsaved);
});

// if save disappears (logout), go to login
watch(() => auth.isAuthenticated, (v) => {
  if (!v && !standaloneSandboxMode.value) router.replace({ name: 'login' });
});
</script>

<template>
  <div class="app-stage" :class="{ 'battle-sandbox-stage': route.name === 'battle-sandbox' }">
    <main ref="view" class="view" :inert="enteringBattle" :class="{ 'with-menu': showChrome && route.name !== 'world', immersive: route.name === 'world' || route.name === 'battle' }">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>
    <GameMenu v-if="showChrome" />
    <div v-if="showNav && game.saveError" class="save-error" role="alert" :inert="enteringBattle">
      <span>进度尚未保存到云端：{{ game.saveError }}</span>
      <button class="sm" :disabled="game.saving" @click="game.persist(true)">{{ game.saving ? '保存中…' : '重试保存' }}</button>
    </div>
    <div :inert="enteringBattle"><MessageHost /></div>
    <BattleEntryOverlay />
  </div>
</template>

<style scoped>
.save-error { position:absolute; top:8px; left:50%; transform:translateX(-50%); z-index:60; display:flex; align-items:center; gap:12px; max-width:90%; padding:10px 14px; border:1px solid var(--bad); border-radius:10px; background:var(--panel); color:var(--ink); font-size:14px; }
</style>
