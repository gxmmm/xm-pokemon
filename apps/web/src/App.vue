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

const showNav = computed(() => auth.isAuthenticated && game.hasSave);
// battle manages its own controls + result modal; hide the global menu/back there
const showChrome = computed(() => showNav.value && route.path !== '/battle');
// Use the immutable initial URL rather than reactive router timing. Standalone
// validation sandboxes never unlock the playable world or account-bound routes.
const standaloneSandboxMode = computed(() => {
  const path = window.location.pathname;
  if (path.endsWith('/battle-sandbox')) return true;
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

onMounted(async () => {
  updateScale();
  window.addEventListener('resize', updateScale);
  // Browser visual regression opens only standalone sandbox routes. It never
  // bypasses authentication for the playable world or application pages.
  if (standaloneSandboxMode.value) return;
  await auth.restore();
  if (auth.isAuthenticated) {
    await game.load();
    if (!game.hasSave) router.replace({ name: 'new' });
  } else {
    router.replace({ name: 'login' });
  }
});
onUnmounted(() => window.removeEventListener('resize', updateScale));

// if save disappears (logout), go to login
watch(() => auth.isAuthenticated, (v) => {
  if (!v && !standaloneSandboxMode.value) router.replace({ name: 'login' });
});
</script>

<template>
  <div class="app-stage">
    <main class="view">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>
    <GameMenu v-if="showChrome" />
    <MessageHost />
  </div>
</template>

<style scoped>
.app-stage { /* base styles in style.css (.app-stage) */ }
</style>
