<script setup lang="ts">
import { computed } from 'vue';
import type { PokemonInstance } from '@pokemon-online/shared';
import { getSpecies, levelProgress, PERSONALITY_MAP, ABILITY_MAP } from '@pokemon-online/config';
import { maxHp } from '@pokemon-online/engine';
import PokemonSprite from './PokemonSprite.vue';
import TypeBadge from './TypeBadge.vue';

const props = defineProps<{ instance: PokemonInstance; showHp?: boolean; selectable?: boolean; selected?: boolean; fainted?: boolean }>();
const species = computed(() => getSpecies(props.instance.speciesId));
const hpRatio = computed(() => props.instance.currentHp / Math.max(1, maxHp(props.instance)));
const expPct = computed(() => Math.round(levelProgress(species.value.growthRate, props.instance.level, props.instance.exp) * 100));
const personality = computed(() => PERSONALITY_MAP[props.instance.personality]);
const ability = computed(() => ABILITY_MAP[props.instance.ability]);
const hpColor = computed(() => hpRatio.value > 0.5 ? '#4caf50' : hpRatio.value > 0.2 ? '#e0a800' : '#d23b3b');
</script>

<template>
  <div class="pcard" :class="{ selected, fainted }" :style="{ borderColor: selected ? 'var(--accent)' : undefined }">
    <div class="pcard-top">
      <PokemonSprite :species-id="instance.speciesId" :size="56" :faded="fainted" />
      <div class="pcard-info">
        <div class="between">
          <span class="bold">{{ instance.nickname || species.name }}</span>
          <span class="chip">Lv.{{ instance.level }}</span>
        </div>
        <div class="row" style="gap:4px;margin:2px 0">
          <TypeBadge v-for="t in species.types" :key="t" :type="t" size="sm" />
          <span class="chip">{{ personality?.name }}</span>
        </div>
        <template v-if="showHp !== false">
          <div class="bar hp-bar" style="height:8px"><span :style="{ width: (hpRatio*100)+'%', background: hpColor }"></span></div>
          <div class="tiny muted between">
            <span>{{ instance.currentHp }}/{{ maxHp(instance) }}</span>
            <span>EXP {{ expPct }}%</span>
          </div>
        </template>
        <div class="tiny muted" v-if="ability">{{ ability.name }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pcard {
  background: var(--panel); color: var(--ink); border-radius: 12px; padding: 8px 10px;
  border: 3px solid transparent; box-shadow: 0 3px 0 rgba(0,0,0,.12);
  cursor: default;
}
.pcard.selectable { cursor: pointer; }
.pcard.selectable:hover { border-color: var(--accent-2); }
.pcard.selected { border-color: var(--accent); }
.pcard.fainted { opacity: .6; }
.pcard-top { display: flex; gap: 8px; align-items: center; }
.pcard-info { flex: 1; min-width: 0; }
</style>
