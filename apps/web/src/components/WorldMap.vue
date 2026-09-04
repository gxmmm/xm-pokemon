<script setup lang="ts">
import { computed } from 'vue';
import { getMap } from '@pokemon-online/config';

const props = defineProps<{ currentMapId: string; visited: Set<string> }>();
const inTower = computed(() => props.currentMapId.startsWith('illusion-tower-'));
const towerVisited = computed(() => [...props.visited].some((id) => id.startsWith('illusion-tower-')));
</script>

<template>
  <div class="region-map">
    <svg viewBox="0 0 640 260" role="img" aria-label="雾湾镇与幻境之塔区域地图">
      <path d="M30 190 Q130 140 220 190 T610 190" fill="none" stroke="#608eaa" stroke-width="28" opacity=".25" />
      <path d="M190 135 Q320 70 450 135" fill="none" stroke="#d5c49b" stroke-width="3" stroke-dasharray="7 7" />
      <g :class="{ current: !inTower }">
        <circle cx="190" cy="135" r="28" />
        <text x="190" y="143" class="icon">⌂</text>
        <text x="190" y="189">{{ getMap('pallet').name }}</text>
        <text v-if="!inTower" x="190" y="215" class="hint">当前位置</text>
      </g>
      <g :class="{ current: inTower }">
        <circle cx="450" cy="135" r="28" />
        <text x="450" y="143" class="icon">♜</text>
        <text x="450" y="189">幻境之塔</text>
        <text x="450" y="215" class="hint">{{ inTower ? getMap(currentMapId).name : towerVisited ? '已探索 · 五层训练区域' : '从城镇塔门进入' }}</text>
      </g>
    </svg>
    <p>步行连接城镇与训练塔 · 塔内 Lv.5–55，覆盖全部 151 种宝可梦</p>
  </div>
</template>

<style scoped>
.region-map { color:#eee7d4; text-align:center; }
svg { width:100%; max-height:55vh; }
circle { fill:#284052; stroke:#8a9da3; stroke-width:2; }
.current circle { fill:#665636; stroke:#ffdc7c; stroke-width:3; }
text { fill:currentColor; text-anchor:middle; font-size:18px; }
.icon { font-size:28px; }
.hint { font-size:12px; fill:#b8c7cf; }
p { margin:0; font-size:12px; color:#b8c7cf; }
</style>
