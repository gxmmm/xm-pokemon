<script setup lang="ts">
import { onMounted, onUnmounted, computed, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from './stores/auth.ts';
import { useGameStore } from './stores/game.ts';
import MessageHost from './components/MessageHost.vue';
import GameMenu from './components/GameMenu.vue';

const auth = useAuthStore();
const game = useGameStore();
const router = useRouter();
const route = useRoute();

const showNav = computed(() => auth.isAuthenticated && game.hasSave && route.name !== 'new' && route.name !== 'load-error');
// battle manages its own controls + result modal; hide the global menu/back there
const showChrome = computed(() => showNav.value && route.path !== '/battle');
// Use the immutable initial URL rather than reactive router timing. Standalone
// validation sandboxes never unlock the playable world or account-bound routes.
const standaloneSandboxMode = computed(() => {
  const path = window.location.pathname;
  if (path.endsWith('/battle-sandbox') || path.endsWith('/vfx-lab')) return true;
  return new URLSearchParams(window.location.search).get('visual-regression') === '1'
    && (path.endsWith('/world-stage-sandbox') || path.endsWith('/battle-stage-sandbox'));
});

/** Scale the fixed 1280x800 design stage to fit the viewport (proportional,
 *  letterboxed). Bigger screen -> bigger game. Pure visual; battle/world logic
 *  is grid-based and untouched. */
function updateScale(): void {
  const s = Math.min(window.innerWidth / 1280, window.innerHeight / 800);
  document.documentElement.style.setProperty('--scale', String(Math.max(0.3, Math.min(2.5, s))));
}

function protectUnsaved(event: BeforeUnloadEvent): void {
  if (!game.unsaved) return;
  event.preventDefault();
  event.returnValue = '';
}

onMounted(() => {
  updateScale();
  window.addEventListener('resize', updateScale);
  // Authentication and save loading have a single owner: the route guard.
  window.addEventListener('beforeunload', protectUnsaved);
});
onUnmounted(() => {
  window.removeEventListener('resize', updateScale);
  window.removeEventListener('beforeunload', protectUnsaved);
});

// if save disappears (logout), go to login
watch(() => auth.isAuthenticated, (v) => {
  if (!v && !standaloneSandboxMode.value) router.replace({ name: 'login' });
});
</script>

<template>
  <div class="app-stage" :class="{ 'battle-sandbox-stage': route.name === 'battle-sandbox' }">
    <main class="view">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>
    <GameMenu v-if="showChrome" />
    <div v-if="showNav && game.saveError" class="save-error" role="alert">
      <span>进度尚未保存到云端：{{ game.saveError }}</span>
      <button class="sm" :disabled="game.saving" @click="game.persist(true)">{{ game.saving ? '保存中…' : '重试保存' }}</button>
    </div>
    <MessageHost />
  </div>
</template>

<style scoped>
.save-error { position:absolute; top:8px; left:50%; transform:translateX(-50%); z-index:60; display:flex; align-items:center; gap:12px; max-width:90%; padding:10px 14px; border:1px solid var(--bad); border-radius:10px; background:var(--panel); color:var(--ink); font-size:14px; }
/* This sandbox already reflows its HUD on narrow screens. Do not scale that
 * responsive layout down again; playable world/battle keep the fixed stage. */
@media (max-width: 820px) {
  .app-stage.battle-sandbox-stage { width: 100%; height: 100%; transform: none; }
}
</style>
