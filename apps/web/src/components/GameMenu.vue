<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth.ts';
import { useGameStore } from '../stores/game.ts';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const game = useGameStore();
const open = ref(false);

// In-game navigation (replaces the old web-style top tab bar). Hub = 探索;
// a floating 返回探索 pill + an in-drawer return button get you back to the
// hub from any sub-view. Opens as a right-side drawer (no modal popup).
const tiles = [
  { to: '/team', label: '队伍', icon: '👥', color: '#3b9c3b' },
  { to: '/breed', label: '炼妖', icon: '🥚', color: '#9b59b6' },
  { to: '/pokedex', label: '图鉴', icon: '📖', color: '#d23b3b' },
  { to: '/pvp', label: '切磋', icon: '⚔️', color: '#e0a800' },
  { to: '/shop', label: '商店', icon: '🛒', color: '#3b4cca' },
  { to: '/settings', label: '设置', icon: '⚙️', color: '#6b7280' },
];
const money = computed(() => game.save?.money ?? 0);
const onWorld = computed(() => route.path.startsWith('/world'));
function go(to: string): void { open.value = false; router.push(to); }
function backToWorld(): void { open.value = false; router.push({ name: 'world' }); }
</script>

<template>
  <div class="fab-group">
    <button v-if="!onWorld" class="fab-back" @click="backToWorld" title="返回探索">← 探索</button>
    <button class="menu-fab" :class="{ open }" @click="open = !open" aria-label="菜单">
      <img src="/sprites/icons/pokeball.png" class="poke-sprite" width="34" height="34" alt="" />
    </button>
  </div>

  <transition name="scrim-fade">
    <div v-if="open" class="drawer-scrim" @click="open = false"></div>
  </transition>
  <transition name="drawer-slide">
    <aside v-if="open" class="drawer">
      <div class="drawer-head">
        <span class="chip" v-if="auth.username">{{ auth.username }}</span>
        <span class="chip gold">💰 {{ money }}</span>
        <span class="chip saving" v-if="game.saving">保存中…</span>
        <button class="sm ghost close" @click="open = false">✕</button>
      </div>
      <button v-if="!onWorld" class="back-btn" @click="backToWorld">← 返回探索</button>
      <nav class="drawer-nav">
        <button v-for="t in tiles" :key="t.to" class="drawer-tile" :class="{ active: route.path.startsWith(t.to) }" @click="go(t.to)">
          <span class="tile-accent" :style="{ background: t.color }"></span>
          <span class="tile-icon">{{ t.icon }}</span>
          <span class="tile-label">{{ t.label }}</span>
        </button>
      </nav>
    </aside>
  </transition>
</template>

<style scoped>
.fab-group {
  position: absolute; right: 16px; bottom: 16px; z-index: 47;
  display: flex; align-items: center; gap: 10px;
}
.fab-back {
  padding: 10px 14px; border-radius: 999px; font-size: 13px; font-weight: 700;
  background: rgba(28,39,64,.92); color: var(--gold); border: 2px solid rgba(255,203,5,.5);
  box-shadow: 0 6px 18px rgba(0,0,0,.5); cursor: pointer; transition: transform .1s, filter .15s;
}
.fab-back:hover { transform: translateY(-1px); filter: brightness(1.1); }

.menu-fab {
  width: 56px; height: 56px; border-radius: 50%;
  background: #1c2740; border: 3px solid #ee1515;
  box-shadow: 0 6px 18px rgba(0,0,0,.5), inset 0 0 0 2px rgba(255,255,255,.12);
  display: flex; align-items: center; justify-content: center; padding: 0;
  transition: transform .18s; cursor: pointer;
}
.menu-fab:hover { transform: scale(1.06); }
.menu-fab.open { transform: rotate(135deg); }

.drawer-scrim {
  position: absolute; inset: 0; z-index: 45;
  background: rgba(0,0,0,.42);
}
.drawer {
  position: absolute; right: 0; top: 0; bottom: 0; z-index: 46;
  width: 280px; padding: 14px; gap: 10px;
  display: flex; flex-direction: column;
  background: linear-gradient(180deg, #1c2740, #141c30);
  border-left: 2px solid rgba(255,203,5,.3);
  box-shadow: -10px 0 30px rgba(0,0,0,.5);
}
.drawer-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.drawer-head .chip { background: rgba(255,255,255,.08); color: #eaf0ff; }
.drawer-head .chip.gold { color: var(--gold); }
.drawer-head .chip.saving { color: var(--gold); }
.drawer-head .close { margin-left: auto; color: #eaf0ff; }

.back-btn {
  width: 100%; padding: 9px; border-radius: 10px; cursor: pointer;
  background: var(--gold); color: #1c2740; border: none; font-weight: 800; font-size: 13px;
  box-shadow: 0 3px 0 rgba(0,0,0,.25); transition: filter .15s;
}
.back-btn:hover { filter: brightness(1.05); }

.drawer-nav { display: flex; flex-direction: column; gap: 6px; margin-top: 2px; }
.drawer-tile {
  position: relative; display: flex; align-items: center; gap: 12px;
  padding: 11px 14px; border-radius: 10px; cursor: pointer; text-align: left;
  background: rgba(255,255,255,.05); border: 2px solid transparent; color: #eaf0ff;
  overflow: hidden; transition: transform .08s, border-color .1s, background .1s;
}
.drawer-tile:hover { transform: translateX(2px); border-color: rgba(255,255,255,.3); }
.drawer-tile.active { border-color: var(--gold); background: rgba(255,203,5,.14); }
.tile-accent { position: absolute; left: 0; top: 0; bottom: 0; width: 4px; }
.tile-icon { font-size: 20px; line-height: 1; }
.tile-label { font-size: 14px; font-weight: 700; }

.drawer-slide-enter-active, .drawer-slide-leave-active { transition: transform .25s ease; }
.drawer-slide-enter-from, .drawer-slide-leave-to { transform: translateX(100%); }
.scrim-fade-enter-active, .scrim-fade-leave-active { transition: opacity .25s; }
.scrim-fade-enter-from, .scrim-fade-leave-to { opacity: 0; }
</style>
