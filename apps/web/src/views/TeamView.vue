<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useGameStore } from '../stores/game.ts';
import PokemonCard from '../components/PokemonCard.vue';
import PokemonSprite from '../components/PokemonSprite.vue';
import { getSpecies } from '@pokemon-online/config';

const game = useGameStore();
const router = useRouter();

const activeTab = ref<'pve' | 'pvp'>('pve');
const pveSel = ref<string[]>([...(game.save?.pveTeam ?? [])]);
const pvpSel = ref<string[]>([...(game.save?.pvpTeam ?? [])]);

const sel = computed<string[]>(() => (activeTab.value === 'pve' ? pveSel : pvpSel).value);
const TEAM_SIZE = 3;

function toggle(uid: string): void {
  const arr = sel.value;
  const i = arr.indexOf(uid);
  if (i >= 0) {
    arr.splice(i, 1);
  } else if (arr.length < TEAM_SIZE) {
    arr.push(uid);
  }
  commit();
}
function clearTeam(): void {
  sel.value.splice(0, sel.value.length);
  commit();
}
function commit(): void {
  if (activeTab.value === 'pve') game.setPveTeam(pveSel.value);
  else game.setPvpTeam(pvpSel.value);
}

watch(() => game.save?.pveTeam, (v) => { if (v) pveSel.value = [...v]; });
watch(() => game.save?.pvpTeam, (v) => { if (v) pvpSel.value = [...v]; });

function heal(): void {
  game.healAll();
}
</script>

<template>
  <div v-if="game.save">
    <div class="panel" style="margin-bottom:12px">
      <div class="between">
        <h2 class="h-title" style="margin:0">队伍 / 阵容</h2>
        <span class="chip">{{ game.rosterInstances.length }}/{{ game.ROSTER_MAX }} 携带</span>
      </div>
      <p class="tiny muted">随身携带最多{{ game.ROSTER_MAX }}只（暂无仓库）。设置 PVE / PVP 两套阵容，各选3只并排定出战顺序。点击宝可梦查看详情。</p>
      <button class="sm good" @click="heal">治疗全部（战斗后也会自动回满）</button>
    </div>

    <!-- loadout editor -->
    <div class="panel" style="margin-bottom:12px">
      <div class="tabs">
        <button :class="{ active: activeTab==='pve' }" @click="activeTab='pve'">PVE 阵容（顺序轮换）</button>
        <button :class="{ active: activeTab==='pvp' }" @click="activeTab='pvp'">PVP 阵容（3v3同时）</button>
      </div>
      <div class="row" style="gap:8px;margin:10px 0">
        <div v-for="i in TEAM_SIZE" :key="i" class="slot">
          <span class="ord">{{ i }}</span>
          <template v-if="sel[i-1] && game.getInstance(sel[i-1])">
            <PokemonSprite :species-id="game.getInstance(sel[i-1])!.speciesId" :size="52" />
            <div class="tiny bold">{{ game.getInstance(sel[i-1])!.nickname || getSpecies(game.getInstance(sel[i-1])!.speciesId).name }}</div>
            <div class="tiny muted">Lv.{{ game.getInstance(sel[i-1])!.level }}</div>
            <button class="sm ghost" @click="toggle(sel[i-1]!)">移除</button>
          </template>
          <template v-else>
            <div class="empty-slot">空位</div>
          </template>
        </div>
      </div>
      <div class="row">
        <button class="sm ghost" @click="clearTeam">清空阵容</button>
        <span class="tiny muted">已选 {{ sel.length }}/{{ TEAM_SIZE }} · 点击下方宝可梦加入</span>
      </div>
    </div>

    <!-- roster -->
    <div class="panel">
      <div class="bold" style="margin-bottom:8px">携带宝可梦</div>
      <div class="grid grid-3">
        <div v-for="p in game.rosterInstances" :key="p.uid" class="roster-cell" @click="router.push({name:'pokemon',params:{uid:p.uid}})">
          <span class="badge" v-if="sel.includes(p.uid)">{{ sel.indexOf(p.uid)+1 }}</span>
          <PokemonCard :instance="p" :fainted="p.currentHp<=0" selectable :selected="sel.includes(p.uid)" />
          <button class="sm" :disabled="sel.length>=TEAM_SIZE && !sel.includes(p.uid)" @click.stop="toggle(p.uid)">
            {{ sel.includes(p.uid) ? '移出阵容' : '加入阵容' }}
          </button>
        </div>
      </div>
      <div v-if="game.rosterInstances.length===0" class="tiny muted">还没有宝可梦，去探索捕捉吧！</div>
      <div v-if="game.rosterFull" class="tiny" style="color:var(--warn);margin-top:8px">携带已满{{ game.ROSTER_MAX }}只，捕捉新宝可梦需先放生。</div>
    </div>
  </div>
</template>

<style scoped>
.tabs { display:flex; gap:6px; }
.tabs button { flex:1; background:var(--panel-2); color:var(--ink); }
.tabs button.active { background:var(--accent-2); color:#fff; }
.slot {
  flex:1; background:var(--panel-2); border-radius:10px; padding:8px; text-align:center;
  position:relative; min-height:120px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px;
}
.slot .ord { position:absolute; top:4px; left:4px; background:var(--accent); color:#fff; border-radius:50%; width:18px; height:18px; font-size:11px; display:flex; align-items:center; justify-content:center; }
.empty-slot { color:var(--muted); }
.roster-cell { position:relative; }
.roster-cell .badge { position:absolute; top:4px; right:4px; background:var(--accent); color:#fff; border-radius:50%; width:20px; height:20px; font-size:12px; display:flex; align-items:center; justify-content:center; z-index:3; font-weight:700; }
</style>
