<script setup lang="ts">
import { computed } from 'vue';

/**
 * 漆黑的魅影-style region map: towns + routes + caves + sea laid out as a
 * pictorial world map, shown as a semi-transparent overlay on the explore
 * page. Display-only (no fast-travel -- walk to map edges to travel, per design).
 *
 * Explorable nodes follow the real map chain (真新镇 -> ... -> 龙之秘境); a few
 * locked towns (未开放) hint at future content. Discovered = visited or current.
 */
const props = defineProps<{ currentMapId: string; visited: Set<string> }>();

type Kind = 'town' | 'route' | 'forest' | 'cave' | 'sea' | 'hidden';
interface WNode { id: string; name: string; x: number; y: number; kind: Kind; locked?: boolean; }

const NODES: WNode[] = [
  { id: 'pallet', name: '真新镇', x: 460, y: 555, kind: 'town' },
  { id: 'route1', name: '1号道路', x: 460, y: 465, kind: 'route' },
  { id: 'viridian-forest', name: '常磐森林', x: 460, y: 365, kind: 'forest' },
  { id: 'route3', name: '3号道路', x: 460, y: 265, kind: 'route' },
  { id: 'mt-moon', name: '月见山', x: 460, y: 170, kind: 'cave' },
  { id: 'rock-tunnel', name: '岩石隧道', x: 570, y: 95, kind: 'cave' },
  { id: 'sea-route', name: '海路', x: 730, y: 75, kind: 'sea' },
  { id: 'dragon-den', name: '龙之秘境', x: 870, y: 55, kind: 'hidden' },
  // locked towns (未开放) -- future content, not yet explorable
  { id: 'viridian-city', name: '常磐市', x: 290, y: 465, kind: 'town', locked: true },
  { id: 'pewter-city', name: '尼比市', x: 290, y: 265, kind: 'town', locked: true },
  { id: 'cerulean-city', name: '华蓝市', x: 650, y: 265, kind: 'town', locked: true },
];

const EDGES: [string, string][] = [
  ['pallet', 'route1'], ['route1', 'viridian-forest'], ['viridian-forest', 'route3'],
  ['route3', 'mt-moon'], ['mt-moon', 'rock-tunnel'], ['rock-tunnel', 'sea-route'], ['sea-route', 'dragon-den'],
  ['route1', 'viridian-city'], ['route3', 'pewter-city'], ['mt-moon', 'cerulean-city'],
];

const ICON: Record<Kind, string> = { town: '🏠', route: '🛣️', forest: '🌲', cave: '⛰️', sea: '🌊', hidden: '⭐' };
const FILL: Record<Kind, string> = { town: '#e8e8e8', route: '#c9a26a', forest: '#4a7a3a', cave: '#6a6a6a', sea: '#4a90e2', hidden: '#8a4abf' };

const nodeOf = (id: string) => NODES.find((n) => n.id === id);

const edges = computed(() => EDGES.map(([a, b]) => {
  const na = nodeOf(a)!, nb = nodeOf(b)!;
  const seen = (id: string) => props.visited.has(id) || id === props.currentMapId;
  return { x1: na.x, y1: na.y, x2: nb.x, y2: nb.y, seen: seen(a) || seen(b), locked: !!na.locked || !!nb.locked };
}));

function nodeState(n: WNode): { discovered: boolean; current: boolean } {
  const current = n.id === props.currentMapId;
  const discovered = n.locked ? false : (props.visited.has(n.id) || current);
  return { discovered, current };
}
</script>

<template>
  <svg viewBox="0 0 1000 640" class="world-svg" preserveAspectRatio="xMidYMid meet">
    <!-- sea background -->
    <rect x="0" y="0" width="1000" height="640" fill="#1e3a5a" />
    <!-- land mass -->
    <path d="M 60 90 Q 40 60 80 50 L 640 40 Q 690 40 700 80 L 700 560 Q 700 600 660 600 L 90 600 Q 50 600 55 560 Z" fill="#3a5a36" stroke="#2a4028" stroke-width="3" />
    <!-- south bay (sea) near 真新镇 -->
    <path d="M 380 600 Q 420 620 470 605 Q 520 620 560 600 L 560 640 L 380 640 Z" fill="#1e3a5a" />
    <!-- a lake -->
    <ellipse cx="180" cy="180" rx="40" ry="22" fill="#2a5a7a" opacity="0.8" />

    <!-- routes (edges) -->
    <g v-for="(e, i) in edges" :key="'e' + i">
      <line :x1="e.x1" :y1="e.y1" :x2="e.x2" :y2="e.y2"
        :stroke="e.locked ? '#3a3a4a' : (e.seen ? '#c9a26a' : '#445040')"
        :stroke-width="e.locked ? 3 : 6" :stroke-dasharray="e.seen && !e.locked ? 'none' : '4 6'" stroke-linecap="round" />
    </g>

    <!-- nodes -->
    <g v-for="n in NODES" :key="n.id" :transform="`translate(${n.x},${n.y})`">
      <template v-if="n.locked">
        <circle r="15" fill="#3a3a4a" stroke="#5a5a6a" stroke-width="2" />
        <text y="5" text-anchor="middle" font-size="16">🔒</text>
        <text y="34" text-anchor="middle" font-size="13" fill="#9aa0b5" font-weight="700">{{ n.name }}</text>
        <text y="50" text-anchor="middle" font-size="10" fill="#7a8090">未开放</text>
      </template>
      <template v-else>
        <circle v-if="nodeState(n).current" r="22" fill="none" stroke="#ffcb05" stroke-width="3" class="pulse" />
        <circle r="16" :fill="FILL[n.kind]" :stroke="nodeState(n).discovered ? '#fff' : '#2a2a36'" :stroke-width="nodeState(n).discovered ? 2.5 : 1.5" :opacity="nodeState(n).discovered ? 1 : 0.55" />
        <text y="5" text-anchor="middle" font-size="16">{{ nodeState(n).discovered ? ICON[n.kind] : '?' }}</text>
        <text y="36" text-anchor="middle" font-size="13" :fill="nodeState(n).discovered ? '#eaf0ff' : '#6a7080'" font-weight="700">{{ nodeState(n).discovered ? n.name : '？？？' }}</text>
        <text v-if="nodeState(n).current" y="52" text-anchor="middle" font-size="11" fill="#ffcb05">你在这里</text>
      </template>
    </g>
  </svg>
</template>

<style scoped>
.world-svg { width: 100%; height: 100%; display: block; }
.pulse { animation: wm-pulse 1.4s ease-in-out infinite; transform-origin: center; }
@keyframes wm-pulse { 0%, 100% { opacity: 0.4; r: 22; } 50% { opacity: 1; r: 26; } }
</style>
