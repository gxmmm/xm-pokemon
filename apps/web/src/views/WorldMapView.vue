<script setup lang="ts">
import { computed } from 'vue';
import { useGameStore } from '../stores/game.ts';
import { MAPS } from '@pokemon-online/config';

const game = useGameStore();

// Hand-laid positions for the world overview (a winding north->south path:
// dragon-den at the top, pallet at the bottom). Purely cosmetic layout.
const POS: Record<string, { x: number; y: number }> = {
  'dragon-den': { x: 320, y: 40 },
  'sea-route': { x: 180, y: 110 },
  'rock-tunnel': { x: 320, y: 180 },
  'mt-moon': { x: 180, y: 250 },
  'route3': { x: 320, y: 320 },
  'viridian-forest': { x: 180, y: 390 },
  'route1': { x: 320, y: 460 },
  'pallet': { x: 180, y: 530 },
};

const visited = computed(() => new Set(game.save?.visitedMaps ?? []));
const current = computed(() => game.save?.currentMapId);

const nodes = computed(() =>
  MAPS.map((m) => ({
    id: m.id,
    name: m.name,
    x: POS[m.id]?.x ?? 0,
    y: POS[m.id]?.y ?? 0,
    discovered: visited.value.has(m.id),
    hidden: !!m.hidden,
    current: current.value === m.id,
  })),
);

// edges along the exploration chain (adjacent entries in MAPS)
const edges = computed(() => {
  const out: { x1: number; y1: number; x2: number; y2: number; seen: boolean }[] = [];
  for (let i = 0; i < MAPS.length - 1; i++) {
    const pa = POS[MAPS[i].id];
    const pb = POS[MAPS[i + 1].id];
    if (!pa || !pb) continue;
    out.push({ x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, seen: visited.value.has(MAPS[i].id) || visited.value.has(MAPS[i + 1].id) });
  }
  return out;
});
</script>

<template>
  <div class="world-map" v-if="game.save">
    <div class="between" style="margin-bottom:8px">
      <h2 class="h-title" style="margin:0">🗺 世界地图</h2>
      <router-link to="/world" class="sm ghost">← 返回</router-link>
    </div>
    <p class="tiny muted" style="margin:0 0 8px">已发现的地点与连通关系。仅用于导航，不能瞬间移动--请走到地图边缘前往相邻区域。</p>

    <svg viewBox="0 0 500 580" class="map-svg">
      <line
        v-for="(e, i) in edges"
        :key="'e' + i"
        :x1="e.x1" :y1="e.y1" :x2="e.x2" :y2="e.y2"
        :stroke="e.seen ? '#5fa67a' : '#3a3f55'"
        stroke-width="3"
        stroke-dasharray="2 4"
      />
      <g v-for="n in nodes" :key="n.id" :transform="`translate(${n.x},${n.y})`">
        <circle
          r="15"
          :fill="n.discovered ? (n.current ? '#f2c037' : '#3a6ea5') : '#23263a'"
          :stroke="n.current ? '#fff' : '#555a72'"
          :stroke-width="n.current ? 3 : 1.5"
        />
        <text y="4" text-anchor="middle" font-size="14" fill="#fff">
          {{ n.discovered ? (n.hidden ? '★' : '●') : '?' }}
        </text>
        <text y="34" text-anchor="middle" font-size="13" :fill="n.discovered ? '#e8eaf0' : '#5a607a'" font-weight="600">
          {{ n.discovered ? n.name : '？？？' }}
        </text>
        <text v-if="n.current" y="50" text-anchor="middle" font-size="11" fill="#f2c037">你在这里</text>
      </g>
    </svg>

    <div class="legend">
      <span><span class="dot disc"></span> 已发现</span>
      <span><span class="dot cur"></span> 当前位置</span>
      <span><span class="dot unk"></span> 未发现</span>
    </div>
  </div>
</template>

<style scoped>
.world-map { max-width: 560px; margin: 0 auto; }
.map-svg { width: 100%; height: auto; background: #0e1626; border-radius: 10px; border: 4px solid #1c2740; display: block; }
.legend { display: flex; gap: 16px; justify-content: center; margin-top: 10px; font-size: 12px; color: #9aa0b5; }
.dot { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
.dot.disc { background: #3a6ea5; }
.dot.cur { background: #f2c037; }
.dot.unk { background: #23263a; border: 1px solid #555a72; }
</style>
