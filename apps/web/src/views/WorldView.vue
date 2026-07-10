<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useGameStore } from '../stores/game.ts';
import { useBattleStore } from '../stores/battle.ts';
import { getMap, isWalkable, isEncounterTile, MAP_MAP } from '@pokemon-online/config';
import { rollEncounter, ENCOUNTER_CHANCE, dayNight } from '@pokemon-online/engine';
import PokemonSprite from '../components/PokemonSprite.vue';
import { getSpecies } from '@pokemon-online/config';

const game = useGameStore();
const battle = useBattleStore();
const router = useRouter();

const map = computed(() => getMap(game.save!.currentMapId));
const dn = computed(() => dayNight());
const flash = ref(0);
let lastEncounter = 0;

const TILE_COLORS: Record<number, string> = {
  0: '#6ab04c', 1: '#235736', 2: '#4a90e2', 3: '#3f6f30', 4: '#c2b280',
  5: '#e6d690', 6: '#8a8a8a', 7: '#d4af37', 8: '#7fc04a', 9: '#b5651d',
  10: '#8e5a3a', 11: '#5a9fd4',
};

function tileAt(x: number, y: number): number {
  const t = map.value.tiles[y]?.[x];
  return t === undefined ? 1 : t;
}

function tryMove(dx: number, dy: number): void {
  if (!game.save) return;
  const nx = game.save.position.x + dx;
  const ny = game.save.position.y + dy;
  if (nx < 0 || ny < 0 || nx >= map.value.width || ny >= map.value.height) return;
  const tile = tileAt(nx, ny);
  if (!isWalkable(tile)) return;
  game.save.position = { x: nx, y: ny };

  // warp
  if (tile === 7) {
    const w = map.value.warps.find((w) => w.x === nx && w.y === ny);
    if (w) {
      game.travelTo(w.toMapId, w.toX, w.toY);
      flash.value++;
      return;
    }
  }
  // encounter
  if (isEncounterTile(tile)) {
    const now = Date.now();
    if (now - lastEncounter < 800) return;
    if (Math.random() < ENCOUNTER_CHANCE) {
      lastEncounter = now;
      const roll = rollEncounter(getMap(game.save.currentMapId), { mapId: game.save.currentMapId });
      if (roll) {
        const ok = battle.startWild(roll.instance, game.save.currentMapId);
        if (ok) router.push({ name: 'battle' });
      }
    }
  }
}

function onKey(e: KeyboardEvent): void {
  const map: Record<string, [number, number]> = {
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0],
  };
  const m = map[e.key];
  if (m) { e.preventDefault(); tryMove(m[0], m[1]); }
}

onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));

function heal(): void {
  game.healAll();
}

const lead = computed(() => game.pveTeamInstances[0] ?? game.rosterInstances[0]);
const connected = computed(() => map.value.connected);
</script>

<template>
  <div class="world" v-if="game.save">
    <div class="between" style="margin-bottom:8px">
      <div>
        <h2 class="h-title" style="margin:0">{{ map.name }}</h2>
        <span class="chip">{{ dn === 'day' ? '☀️ 白天' : '🌙 夜晚' }}</span>
        <span class="chip" v-if="map.hidden">隐藏地图</span>
      </div>
      <button class="sm ghost" @click="heal">💊 治疗全部</button>
    </div>
    <p class="tiny muted" style="margin:0 0 8px">{{ map.description }} {{ map.ambient }}</p>

    <div class="map-wrap">
      <div class="map-grid" :style="{ gridTemplateColumns: `repeat(${map.width}, var(--tile))` }" :key="flash">
        <template v-for="y in map.height" :key="y">
          <div
            v-for="x in map.width"
            :key="x + '-' + y"
            class="tile"
            :class="{ player: game.save.position.x === x-1 && game.save.position.y === y-1 }"
            :style="{ background: TILE_COLORS[tileAt(x-1, y-1)] }"
          >
            <span v-if="tileAt(x-1,y-1) === 7" class="door">🚪</span>
            <span v-if="tileAt(x-1,y-1) === 8" class="flower">🌸</span>
            <span v-if="tileAt(x-1,y-1) === 10" class="sign">📜</span>
          </div>
        </template>
      </div>
    </div>

    <div class="dpad">
      <button class="ghost" @click="tryMove(0,-1)">▲</button>
      <div class="row">
        <button class="ghost" @click="tryMove(-1,0)">◀</button>
        <button class="ghost" @click="tryMove(0,1)">▼</button>
        <button class="ghost" @click="tryMove(1,0)">▶</button>
      </div>
      <p class="tiny muted">方向键 / WASD 移动，草丛中可能遇到野生宝可梦</p>
    </div>

    <div class="panel" style="margin-top:12px" v-if="lead">
      <div class="bold" style="margin-bottom:6px">队伍领队</div>
      <div class="row" style="align-items:center;gap:10px">
        <PokemonSprite :species-id="lead.speciesId" :size="48" :faded="lead.currentHp<=0" />
        <div class="grow">
          <div class="between"><span class="bold">{{ lead.nickname || getSpecies(lead.speciesId).name }}</span><span class="chip">Lv.{{ lead.level }}</span></div>
          <div class="bar hp-bar"><span :style="{ width: '100%' }"></span></div>
          <div class="tiny muted" v-if="lead.currentHp<=0" style="color:var(--bad)">已倒下，请前往宝可梦中心治疗</div>
        </div>
      </div>
    </div>

    <div class="panel" style="margin-top:12px">
      <div class="bold" style="margin-bottom:6px">通往</div>
      <div class="row wrap">
        <button v-for="c in connected" :key="c.to" class="sm" @click="game.travelTo(c.to, c.x, c.y); flash++">
          → {{ MAP_MAP[c.to]?.name }}{{ MAP_MAP[c.to]?.hidden ? ' ⭐' : '' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.world { max-width: 560px; margin: 0 auto; }
.map-wrap { overflow: auto; border-radius: 10px; border: 4px solid #1c2740; background: #235736; }
.map-grid {
  --tile: 30px;
  display: grid; gap: 0; width: max-content; margin: 0 auto;
}
.tile { width: var(--tile); height: var(--tile); position: relative; font-size: 16px; display:flex; align-items:center; justify-content:center; }
.tile.player::after {
  content: '🧑'; position: absolute; inset: 0; display:flex; align-items:center; justify-content:center;
  font-size: 18px; filter: drop-shadow(0 0 2px #fff);
}
.door, .flower, .sign { font-size: 16px; }
.dpad { display:flex; flex-direction:column; align-items:center; gap:6px; margin-top:12px; }
.dpad .row { gap: 6px; }
</style>
