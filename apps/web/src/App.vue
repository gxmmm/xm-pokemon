<script setup lang="ts">
import { onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from './stores/auth.ts';
import { useGameStore } from './stores/game.ts';

const auth = useAuthStore();
const game = useGameStore();
const router = useRouter();

const showNav = computed(() => auth.isAuthenticated && game.hasSave);

onMounted(async () => {
  await auth.restore();
  if (auth.isAuthenticated) {
    await game.load();
    if (!game.hasSave) router.replace({ name: 'new' });
  } else {
    router.replace({ name: 'login' });
  }
});

// if save disappears (logout), go to login
watch(() => auth.isAuthenticated, (v) => {
  if (!v) router.replace({ name: 'login' });
});

const navItems = [
  { to: '/world', label: '探索' },
  { to: '/team', label: '队伍' },
  { to: '/breed', label: '炼妖' },
  { to: '/pokedex', label: '图鉴' },
  { to: '/pvp', label: '切磋' },
  { to: '/shop', label: '商店' },
  { to: '/settings', label: '设置' },
];
</script>

<template>
  <div class="app-shell">
    <header class="app-header" v-if="showNav">
      <div class="brand">
        <img src="/sprites/icons/pokeball.png" class="poke-sprite" width="22" height="22" alt="" />
        <span class="brand-name">Pokémon Online</span>
        <span class="chip" v-if="auth.username">{{ auth.username }}</span>
        <span class="chip" v-if="game.save">💰{{ game.save.money }}</span>
      </div>
      <span class="saving tiny" v-if="game.saving">保存中…</span>
    </header>
    <nav class="app-nav" v-if="showNav">
      <router-link v-for="n in navItems" :key="n.to" :to="n.to">{{ n.label }}</router-link>
    </nav>
    <main class="view">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>
  </div>
</template>

<style scoped>
.app-shell { display: flex; flex-direction: column; min-height: 100%; }
.app-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; background: var(--bg-dark);
}
.brand { display: flex; align-items: center; gap: 8px; }
.brand-name { font-weight: 800; color: var(--gold); letter-spacing: .5px; }
.saving { color: var(--gold); }
</style>
