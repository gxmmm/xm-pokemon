<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useGameStore } from '../stores/game.ts';
import PokemonCard from '../components/PokemonCard.vue';
import PokemonSprite from '../components/PokemonSprite.vue';
import PokemonDetailPanel from '../components/PokemonDetailPanel.vue';
import BackHub from '../components/BackHub.vue';
import { getSpecies } from '@pokemon-online/config';
import { isCellInArena, defaultFormation, FORMATION_START_COLS } from '@pokemon-online/engine';
import { BATTLE_GRID } from '@pokemon-online/shared';

const game = useGameStore();

const tab = ref<'roster' | 'formation'>('roster');
const activeTeam = ref<'pve' | 'pvp'>('pve');
const selectedUid = ref<string | null>(game.rosterInstances[0]?.uid ?? null);
const formSlot = ref(0);
const formation = ref<{ x: number; y: number }[]>([...(game.save?.formation ?? defaultFormation())]);

const TEAM_SIZE = 3;
const sel = computed<string[]>(() => (activeTeam.value === 'pve' ? game.save!.pveTeam : game.save!.pvpTeam));

watch(() => game.save?.formation, (v) => { if (v) formation.value = v.map((c) => ({ ...c })); });

function select(uid: string): void { selectedUid.value = uid; }
function toggle(uid: string): void {
  const arr = activeTeam.value === 'pve' ? [...game.save!.pveTeam] : [...game.save!.pvpTeam];
  const i = arr.indexOf(uid);
  if (i >= 0) arr.splice(i, 1);
  else if (arr.length < TEAM_SIZE) arr.push(uid);
  if (activeTeam.value === 'pve') game.setPveTeam(arr);
  else game.setPvpTeam(arr);
  selectedUid.value = uid;
}
function clearTeam(): void {
  if (activeTeam.value === 'pve') game.setPveTeam([]);
  else game.setPvpTeam([]);
}

function instanceOf(uid: string | undefined) { return uid ? game.getInstance(uid) : undefined; }
function nameOf(uid: string | undefined) { const i = instanceOf(uid); return i ? (i.nickname || getSpecies(i.speciesId).name) : '空位'; }

function formSlotAt(gx: number, gy: number): number {
  return formation.value.findIndex((c) => c.x === gx && c.y === gy);
}
function placeForm(gx: number, gy: number): void {
  if (!isCellInArena(gx, gy)) return;
  const f = formation.value.map((c) => ({ ...c }));
  const other = f.findIndex((c, i) => i !== formSlot.value && c.x === gx && c.y === gy);
  if (other >= 0) f[other] = { ...f[formSlot.value] }; // swap
  f[formSlot.value] = { x: gx, y: gy };
  game.setFormation(f);
}
function resetFormation(): void { game.setFormation(defaultFormation()); }
</script>

<template>
  <div v-if="game.save" class="team-layout">
    <!-- LEFT: 上区(控制) + 下区(当前宠摘要) -->
    <div class="team-left">
      <!-- 上区：阵容 / 阵型 -->
      <div class="panel" style="margin-bottom:10px;padding:10px">
        <div class="between">
          <h2 class="h-title" style="margin:0;font-size:17px">队伍 / 阵容</h2>
          <div class="row" style="gap:8px;align-items:center">
            <span class="chip sm-chip">{{ game.rosterInstances.length }}/{{ game.ROSTER_MAX }}</span>
            <BackHub />
          </div>
        </div>
        <div class="tabs" style="margin:8px 0">
          <button :class="{ active: tab==='roster' }" @click="tab='roster'">出战阵容</button>
          <button :class="{ active: tab==='formation' }" @click="tab='formation'">阵型</button>
        </div>

        <div v-if="tab==='roster'">
          <div class="tabs sub-tabs">
            <button :class="{ active: activeTeam==='pve' }" @click="activeTeam='pve'">PVE</button>
            <button :class="{ active: activeTeam==='pvp' }" @click="activeTeam='pvp'">PVP</button>
          </div>
          <div class="row" style="gap:8px;margin:10px 0">
            <div v-for="i in TEAM_SIZE" :key="i" class="slot" @click="sel[i-1] && select(sel[i-1]!)">
              <span class="ord">{{ i }}</span>
              <template v-if="sel[i-1] && instanceOf(sel[i-1])">
                <PokemonSprite :species-id="instanceOf(sel[i-1])!.speciesId" :size="44" />
                <div class="tiny bold">{{ nameOf(sel[i-1]) }}</div>
                <div class="tiny muted">Lv.{{ instanceOf(sel[i-1])!.level }}</div>
                <button class="sm ghost" @click.stop="toggle(sel[i-1]!)">移除</button>
              </template>
              <template v-else><div class="empty-slot tiny muted">空位</div></template>
            </div>
          </div>
          <div class="row" style="align-items:center;gap:8px">
            <button class="sm ghost" @click="clearTeam">清空</button>
            <span class="tiny muted">已选 {{ sel.length }}/{{ TEAM_SIZE }} · 点下方宝可梦加入</span>
          </div>
        </div>

        <div v-else>
          <p class="tiny muted">选槽位→点起始区格子摆放（PVE/PVP 共用）。</p>
          <div class="row" style="gap:8px;margin:8px 0">
            <button v-for="i in TEAM_SIZE" :key="i" class="form-slot-btn" :class="{ active: formSlot===i-1 }" @click="formSlot=i-1">
              <span class="ord">{{ i }}</span>
              <PokemonSprite v-if="instanceOf(game.save!.pveTeam[i-1])" :species-id="instanceOf(game.save!.pveTeam[i-1])!.speciesId" :size="30" />
              <span class="tiny">{{ nameOf(game.save!.pveTeam[i-1]) }}</span>
            </button>
          </div>
          <div class="form-grid" :style="{ gridTemplateColumns: `repeat(${FORMATION_START_COLS}, 1fr)` }">
            <template v-for="gy in BATTLE_GRID.rows" :key="gy">
              <div
                v-for="gx in FORMATION_START_COLS" :key="gx + '-' + gy"
                class="form-cell"
                :class="{ placeable: isCellInArena(gx-1, gy-1), occ: formSlotAt(gx-1, gy-1) >= 0, sel: formSlotAt(gx-1, gy-1) === formSlot }"
                @click="placeForm(gx-1, gy-1)"
              >
                <span v-if="formSlotAt(gx-1, gy-1) >= 0" class="ord">{{ formSlotAt(gx-1, gy-1) + 1 }}</span>
              </div>
            </template>
          </div>
          <button class="sm ghost" style="margin-top:8px" @click="resetFormation">重置默认</button>
        </div>
      </div>

      <!-- 携带列表（选择） -->
      <div class="panel" style="margin-bottom:10px;padding:10px">
        <div class="bold tiny" style="margin-bottom:6px">携带宝可梦</div>
        <div class="grid grid-4">
          <div v-for="p in game.rosterInstances" :key="p.uid" class="roster-cell" :class="{ selected: selectedUid===p.uid }" @click="select(p.uid)">
            <span class="badge" v-if="sel.includes(p.uid)">{{ sel.indexOf(p.uid)+1 }}</span>
            <PokemonCard :instance="p" :fainted="p.currentHp<=0" selectable :selected="selectedUid===p.uid" compact />
            <button v-if="tab==='roster'" class="sm" :disabled="sel.length>=TEAM_SIZE && !sel.includes(p.uid)" @click.stop="toggle(p.uid)">
              {{ sel.includes(p.uid) ? '移出' : '加入' }}
            </button>
          </div>
        </div>
        <div v-if="game.rosterInstances.length===0" class="tiny muted">还没有宝可梦，去探索捕捉吧！</div>
      </div>
    </div>

    <!-- RIGHT: 资质 / 技能 详细 -->
    <div class="team-right panel">
      <PokemonDetailPanel :uid="selectedUid" />
    </div>
  </div>
</template>

<style scoped>
.team-layout { display:flex; gap:12px; align-items:flex-start; }
.team-left { flex:1; min-width:0; }
.team-right { width: 460px; flex-shrink:0; }
.tabs { display:flex; gap:6px; }
.tabs button { flex:1; background:var(--panel-2); color:var(--ink); }
.tabs button.active { background:var(--accent-2); color:#fff; }
.sub-tabs button { font-size:13px; }
.slot {
  flex:1; background:var(--panel-2); border-radius:10px; padding:6px; text-align:center; cursor:pointer;
  position:relative; min-height:92px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px;
}
.slot .ord { position:absolute; top:4px; left:4px; background:var(--accent); color:#fff; border-radius:50%; width:18px; height:18px; font-size:11px; display:flex; align-items:center; justify-content:center; }
.empty-slot { color:var(--muted); }
.roster-cell { position:relative; cursor:pointer; border-radius:10px; }
.roster-cell.selected { outline:2px solid var(--accent); }
.roster-cell .badge { position:absolute; top:4px; right:4px; background:var(--accent); color:#fff; border-radius:50%; width:20px; height:20px; font-size:12px; display:flex; align-items:center; justify-content:center; z-index:3; font-weight:700; }
.form-slot-btn { position:relative; background:var(--panel-2); color:var(--ink); display:flex; flex-direction:column; align-items:center; gap:2px; padding:6px; border-radius:8px; }
.form-slot-btn.active { background:var(--accent-2); color:#fff; }
.form-slot-btn .ord { position:absolute; top:2px; left:2px; background:var(--accent); color:#fff; border-radius:50%; width:14px; height:14px; font-size:9px; display:flex; align-items:center; justify-content:center; }
.form-grid { display:grid; gap:2px; max-width:240px; }
.form-cell { aspect-ratio:1; background:var(--bg-dark); border-radius:3px; opacity:.3; }
.form-cell.placeable { opacity:.7; background:var(--panel-2); cursor:pointer; position:relative; }
.form-cell.placeable:hover { background:var(--accent-2); }
.form-cell.occ { background:var(--accent); opacity:1; }
.form-cell.sel { outline:2px solid #fff; }
.form-cell .ord { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:#fff; font-size:11px; font-weight:700; }
</style>
