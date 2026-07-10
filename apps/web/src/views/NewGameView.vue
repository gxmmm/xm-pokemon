<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useGameStore } from '../stores/game.ts';
import { getSpecies } from '@pokemon-online/config';
import PokemonSprite from '../components/PokemonSprite.vue';
import TypeBadge from '../components/TypeBadge.vue';

const game = useGameStore();
const router = useRouter();
const starters = [1, 4, 7];
const selected = ref<number | null>(null);
const busy = ref(false);
const chosen = computed(() => (selected.value !== null ? getSpecies(selected.value) : null));

async function confirm(): Promise<void> {
  if (selected.value === null) return;
  busy.value = true;
  try {
    await game.startWithStarter(selected.value);
    router.replace({ name: 'world' });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="view">
    <div class="panel">
      <h2 class="h-title">选择你的初始伙伴</h2>
      <p class="muted tiny">大木博士为你准备了三只宝可梦，选一只开始冒险吧。</p>
      <div class="grid grid-3 starter-grid">
        <div v-for="id in starters" :key="id" class="starter" :class="{ active: selected === id }" @click="selected = id">
          <PokemonSprite :species-id="id" :size="88" />
          <div class="bold">{{ getSpecies(id).name }}</div>
          <div class="row center" style="gap:4px">
            <TypeBadge v-for="t in getSpecies(id).types" :key="t" :type="t" size="sm" />
          </div>
        </div>
      </div>
      <div class="chosen" v-if="chosen">
        <div class="row" style="align-items:flex-start;gap:12px">
          <PokemonSprite :species-id="chosen.id" :size="72" />
          <div>
            <div class="bold">{{ chosen.name }} <span class="chip">#{{ String(chosen.id).padStart(3,'0') }}</span></div>
            <div class="tiny muted">{{ chosen.dex }}</div>
            <div class="tiny">特性：{{ chosen.abilities.length }} · 成长：{{ chosen.growthRate }}</div>
          </div>
        </div>
        <button class="gold" :disabled="busy" @click="confirm" style="margin-top:12px;width:100%">
          {{ busy ? '创建中…' : `就决定是你了，${chosen.name}！` }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.starter-grid { margin-top: 12px; }
.starter {
  background: var(--panel-2); border-radius: 12px; padding: 12px; text-align: center;
  cursor: pointer; border: 3px solid transparent; transition: border-color .15s;
}
.starter:hover { border-color: var(--accent-2); }
.starter.active { border-color: var(--accent); }
.chosen { margin-top: 16px; padding-top: 14px; border-top: 2px dashed #ddd; }
</style>
