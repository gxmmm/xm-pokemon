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
  if (selected.value === null || busy.value) return;
  busy.value = true;
  try {
    if (await game.startWithStarter(selected.value)) await router.replace({ name: 'world' });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="view">
    <div class="panel">
      <h2 class="h-title">选择你的初始伙伴</h2>
      <p class="muted tiny">选择一位伙伴，从雾湾镇开始训练之旅。</p>
      <div class="grid grid-3 starter-grid">
        <div v-for="id in starters" :key="id" class="starter" :class="{ active: selected === id }" @click="!busy && !game.hasSave && (selected = id)">
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
          {{ busy ? '保存中…' : game.hasSave ? '重试保存，开始冒险' : `就决定是你了，${chosen.name}！` }}
        </button>
        <p v-if="game.saveError" role="alert">保存失败：{{ game.saveError }}。伙伴已保留，请重试。</p>
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
