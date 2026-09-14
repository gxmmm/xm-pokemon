<script setup lang="ts">
import { computed } from 'vue';
import type { BattleWeather } from '@pokemon-online/shared';
import { BATTLE_WEATHER } from '@pokemon-online/config';
const props = defineProps<{ weather?: BattleWeather }>();
const spec = computed(() => props.weather ? BATTLE_WEATHER[props.weather.kind] : undefined);
const label = computed(() => spec.value?.name ?? '无天气');
const details = computed(() => props.weather ? `${label.value} · 剩余 ${Math.ceil(props.weather.remaining)} 秒\n来源：${props.weather.source}\n${props.weather.suppressed ? '气象台：天气效果已抑制，仍在计时。' : spec.value!.description}` : '当前没有天气影响');
const pixels = computed(() => (spec.value?.pixels ?? ['0000000','0000000','0011100','0111110','1111111','0000000','0000000']).flatMap((row,y) => [...row].flatMap((cell,x) => cell === '1' ? [{x,y}] : [])));
</script>
<template>
  <div class="weather-badge" :class="{ suppressed: weather?.suppressed }" :title="details" :aria-label="details" role="status" :data-weather="weather?.kind ?? 'none'">
    <svg viewBox="0 0 9 9" aria-hidden="true" shape-rendering="crispEdges" :style="{color:spec?.color ?? '#a5b8c1'}"><rect v-for="p in pixels" :key="`${p.x}-${p.y}`" :x="p.x+1" :y="p.y+1" width="1" height="1" fill="currentColor" /></svg>
    <span>{{ weather?.suppressed ? '已抑制' : label }}</span>
  </div>
</template>
<style scoped>
.weather-badge { position:absolute; z-index:8; top:12px; left:50%; transform:translateX(-50%); width:62px; height:62px; box-sizing:border-box; border:2px solid #718994; border-radius:50%; background:#142834ed; box-shadow:0 3px 0 #09141c; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#e1eced; pointer-events:auto; }
svg { width:29px; height:29px; flex-shrink:0; }
span { font-size:11px; line-height:15px; font-weight:700; }
.suppressed { border-color:#727980; }
.suppressed svg { opacity:.45; }
</style>
