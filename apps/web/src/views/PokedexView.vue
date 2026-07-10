<script setup lang="ts">
import { computed } from 'vue';
import { useGameStore } from '../stores/game.ts';
import { SPECIES_LIST } from '@pokemon-online/config';
import PokemonSprite from '../components/PokemonSprite.vue';
import TypeBadge from '../components/TypeBadge.vue';

const game = useGameStore();
const caught = computed(() => game.dexCount);
const seen = computed(() => game.dexSeen);

function entry(id: number) {
  return game.save?.pokedex[id];
}
</script>

<template>
  <div v-if="game.save">
    <div class="panel" style="margin-bottom:12px">
      <div class="between">
        <h2 class="h-title" style="margin:0">宝可梦图鉴</h2>
        <span class="chip">已收集 {{ caught }}/151 · 见过 {{ seen }}</span>
      </div>
      <p class="tiny muted">探索世界、击败与捕捉宝可梦来丰富图鉴。放生也会保留记录。</p>
    </div>
    <div class="grid grid-4">
      <div v-for="sp in SPECIES_LIST" :key="sp.id" class="dex-cell" :class="{ caught: entry(sp.id)?.caught, seen: entry(sp.id)?.seen && !entry(sp.id)?.caught }">
        <div class="num">#{{ String(sp.id).padStart(3,'0') }}</div>
        <PokemonSprite v-if="entry(sp.id)?.seen" :species-id="sp.id" :size="56" :faded="!entry(sp.id)?.caught" />
        <div v-else class="silhouette">❔</div>
        <div class="name">{{ entry(sp.id)?.seen ? sp.name : '？？？' }}</div>
        <div v-if="entry(sp.id)?.seen" class="row center" style="gap:2px">
          <TypeBadge v-for="t in sp.types" :key="t" :type="t" size="sm" />
        </div>
        <div class="tiny" v-if="entry(sp.id)?.caught">持有 {{ entry(sp.id)?.count }}</div>
        <div class="tiny" v-else-if="entry(sp.id)?.released" style="color:var(--warn)">已放生</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dex-cell {
  background: var(--panel); color: var(--ink); border-radius: 10px; padding: 8px 6px;
  text-align: center; position: relative; box-shadow: 0 2px 0 rgba(0,0,0,.12);
}
.dex-cell.caught { border: 2px solid var(--good); }
.dex-cell.seen { border: 2px solid var(--warn); }
.num { font-size: 10px; color: var(--muted); }
.name { font-weight: 700; font-size: 13px; margin: 2px 0; }
.silhouette { font-size: 40px; opacity: .4; }
</style>
