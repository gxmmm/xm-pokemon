<script setup lang="ts">
import { ref } from 'vue';
import { useGameStore } from '../stores/game.ts';
import { SHOP_ITEMS, ITEM_MAP } from '@pokemon-online/config';
import BackHub from '../components/BackHub.vue';

const game = useGameStore();
const qty = ref<Record<string, number>>({});
const msg = ref<string | null>(null);

function getQty(id: string): number { return qty.value[id] ?? 1; }
function setQty(id: string, v: number): void { qty.value[id] = Math.max(1, Math.min(99, v)); }

function buy(id: string): void {
  const r = game.buyItem(id, getQty(id));
  msg.value = r.msg;
  setTimeout(() => { msg.value = null; }, 2000);
}
</script>

<template>
  <div v-if="game.save">
    <div class="panel" style="margin-bottom:12px">
      <div class="between">
        <h2 class="h-title" style="margin:0">商店</h2>
        <div class="row" style="gap:8px;align-items:center">
          <span class="chip">💰 {{ game.save.money }}</span>
          <BackHub />
        </div>
      </div>
    </div>
    <div class="grid grid-2">
      <div v-for="id in SHOP_ITEMS" :key="id" class="panel shop-item">
        <div class="bold">{{ ITEM_MAP[id].name }}</div>
        <div class="tiny muted">{{ ITEM_MAP[id].description }}</div>
        <div class="between" style="margin-top:6px;align-items:center">
          <span class="chip">💰{{ ITEM_MAP[id].price }}</span>
          <span class="tiny muted">持有 {{ game.save.items[id] ?? 0 }}</span>
        </div>
        <div class="row" style="margin-top:6px;gap:4px">
          <input type="number" min="1" max="99" :value="getQty(id)" @input="setQty(id, +($event.target as HTMLInputElement).value)" style="width:60px" />
          <button class="sm gold grow" @click="buy(id)">购买</button>
        </div>
      </div>
    </div>
    <p class="tiny center" style="color:var(--good)" v-if="msg">{{ msg }}</p>
  </div>
</template>

<style scoped>
.shop-item { padding: 10px; }
</style>
