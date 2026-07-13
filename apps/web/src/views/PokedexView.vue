<script setup lang="ts">
import { ref, computed } from 'vue';
import { useGameStore } from '../stores/game.ts';
import { SPECIES_LIST, getSpecies, SKILL_MAP, ABILITY_MAP, PASSIVE_MAP, PASSIVE_TIER_LABEL, MAPS } from '@pokemon-online/config';
import { ivCeiling, growthCeiling, ivFloor, growthFloor } from '@pokemon-online/engine';
import PokemonSprite from '../components/PokemonSprite.vue';
import TypeBadge from '../components/TypeBadge.vue';
import Tip from '../components/Tip.vue';
import BackHub from '../components/BackHub.vue';
import type { PassiveSkill, Rarity, Ability, Skill } from '@pokemon-online/shared';
import { DEX_REVEAL_ALL } from '@pokemon-online/shared';

const game = useGameStore();
const caught = computed(() => game.dexCount);
const seen = computed(() => game.dexSeen);

const selectedId = ref<number | null>(null);
const species = computed(() => (selectedId.value ? getSpecies(selectedId.value) : null));
const entry = computed(() => (selectedId.value ? game.save?.pokedex[selectedId.value] : undefined));
const isSeen = computed(() => DEX_REVEAL_ALL || !!entry.value?.seen);

const ivCeil = computed(() => (species.value ? ivCeiling(species.value.rarity) : 31));
const ivFloorVal = computed(() => (species.value ? ivFloor(species.value.rarity) : 1));
const growthCeil = computed(() => (species.value ? growthCeiling(species.value.rarity) : 1.3));
const growthFloorVal = computed(() => (species.value ? growthFloor(species.value.rarity) : 0.8));

const RARITY_LABEL: Record<Rarity, string> = {
  common: '常见', uncommon: '少见', rare: '稀有', legendary: '传说', mythical: '幻兽',
};

function entryOf(id: number) { return game.save?.pokedex[id]; }
function select(id: number): void { selectedId.value = id; }
const isRevealed = (id: number) => DEX_REVEAL_ALL || !!entryOf(id)?.seen;
// reverse lookup: speciesId -> maps where it appears (with level range)
const encounterMaps = computed(() => {
  const m: Record<number, { map: string; min: number; max: number }[]> = {};
  for (const map of MAPS) {
    for (const e of map.encounters) {
      (m[e.speciesId] ??= []).push({ map: map.name, min: e.minLevel, max: e.maxLevel });
    }
  }
  return m;
});
function mapsOf(id: number) { return encounterMaps.value[id] ?? []; }

const TRIGGER_LABEL: Record<string, string> = {
  onLowHp: 'HP低于1/3时', onHit: '被击中时', passive: '持续生效', onEnter: '登场时',
  onTurnStart: '回合开始时', onFaint: '击倒对手时', onSwitch: '撤退时',
};
function abilityTip(a: Ability): string { return `${a.description}\n触发：${TRIGGER_LABEL[a.trigger] ?? a.trigger}`; }
function passiveTip(p: PassiveSkill | undefined, intrinsic = false): string {
  if (!p) return '';
  return `${p.name}（${PASSIVE_TIER_LABEL[p.tier] ?? '?'}${intrinsic ? '·必带' : ''}）\n${p.description}`;
}
function skillTip(s: Skill | undefined): string {
  if (!s) return '';
  const acc = s.accuracy === 0 ? '必中' : s.accuracy + '%';
  const target = s.targetMode === 'all-enemies'
    ? `敌方全体 · 单目标伤害 ${Math.round((s.areaMultiplier ?? 0.7) * 100)}%`
    : '敌方单体';
  return `${s.description}\n威力 ${s.power} · 命中 ${acc} · CD ${s.cooldown}s\n${s.range === 'melee' ? '近战' : '远程'} · 射程 ${s.rangeTiles} · ${target}${s.castTime ? ' · 蓄力 ' + s.castTime + 's' : ''}`;
}
</script>

<template>
  <div v-if="game.save" class="dex-layout">
    <!-- LEFT: 种族网格 -->
    <div class="dex-left">
      <div class="panel" style="margin-bottom:12px">
        <div class="between">
          <h2 class="h-title" style="margin:0;font-size:18px">宝可梦图鉴</h2>
          <div class="row" style="gap:8px;align-items:center">
            <span class="chip">收集 {{ caught }}/151 · 见过 {{ seen }}</span>
            <BackHub />
          </div>
        </div>
      </div>
      <div class="grid grid-4">
        <div
          v-for="sp in SPECIES_LIST" :key="sp.id" class="dex-cell"
          :class="{ caught: entryOf(sp.id)?.caught, seen: isRevealed(sp.id) && !entryOf(sp.id)?.caught, selected: selectedId===sp.id }"
          @click="select(sp.id)"
        >
          <div class="num">#{{ String(sp.id).padStart(3,'0') }}</div>
          <PokemonSprite v-if="isRevealed(sp.id)" :species-id="sp.id" :size="48" :faded="!entryOf(sp.id)?.caught" />
          <div v-else class="silhouette">❔</div>
          <div class="name">{{ isRevealed(sp.id) ? sp.name : '？？？' }}</div>
          <div v-if="entryOf(sp.id)?.caught" class="tiny muted">持有 {{ entryOf(sp.id)?.count }}</div>
        </div>
      </div>
    </div>

    <!-- RIGHT: 种族详情（资质上限 / 全部技能） -->
    <div class="dex-right panel">
      <div v-if="species && isSeen" class="detail">
        <div class="row" style="align-items:center;gap:12px">
          <PokemonSprite :species-id="species.id" :size="88" :faded="!entry?.caught" />
          <div class="grow">
            <div class="between">
              <span class="h-title" style="margin:0;font-size:18px">{{ species.name }}</span>
              <span class="chip">#{{ String(species.id).padStart(3,'0') }}</span>
            </div>
            <div class="row" style="gap:6px;margin:4px 0;flex-wrap:wrap">
              <TypeBadge v-for="t in species.types" :key="t" :type="t" />
              <span class="chip">{{ RARITY_LABEL[species.rarity] }}</span>
            </div>
            <div class="tiny muted">{{ species.dex }}</div>
          </div>
        </div>

        <div class="sub bold">基础属性</div>
        <div class="grid grid-2 tiny">
          <div>生命：{{ species.base.hp }}</div>
          <div>攻击：{{ species.base.atk }}</div>
          <div>防御：{{ species.base.def }}</div>
          <div>速度：{{ species.base.spd }}</div>
        </div>

        <div class="sub bold">资质 / 成长 <span class="tiny muted" style="font-weight:400">（野生在此内随机 · 炼妖不封顶）</span></div>
        <div class="tiny">
          资质：{{ ivFloorVal }}~{{ ivCeil }}（野生随机）<br />
          成长：×{{ growthFloorVal }}~×{{ growthCeil }}（野生随机·炼妖按公式）
        </div>

        <div class="sub bold">出现地图</div>
        <div v-if="mapsOf(species.id).length" class="tiny row" style="gap:4px;flex-wrap:wrap">
          <span v-for="m in mapsOf(species.id)" :key="m.map + m.min" class="chip sm-chip">{{ m.map }} Lv.{{ m.min }}-{{ m.max }}</span>
        </div>
        <div v-else class="tiny muted">不可野外捕获（可通过炼妖/进化获得）</div>

        <div class="sub bold">全部可能技能 <span class="tiny muted" style="font-weight:400">（天生必带·升级习得）</span></div>
        <div v-for="s in species.intrinsic" :key="'in-'+s" class="tiny skill-row">
          <span class="lv-chip" style="background:var(--gold);color:#333">天生</span>
          <Tip :text="skillTip(SKILL_MAP[s])"><span class="bold">{{ SKILL_MAP[s]?.name }}</span></Tip>
          <TypeBadge :type="SKILL_MAP[s]?.type ?? 'normal'" size="sm" />
          <span class="muted">威力{{ SKILL_MAP[s]?.power || 0 }} · {{ SKILL_MAP[s]?.range==='melee'?'近战':'远程' }}</span>
        </div>
        <div v-for="e in species.learnset" :key="e.level + '-' + e.skill" class="tiny skill-row">
          <span class="lv-chip">Lv.{{ e.level }}</span>
          <Tip :text="skillTip(SKILL_MAP[e.skill])"><span class="bold">{{ SKILL_MAP[e.skill]?.name }}</span></Tip>
          <TypeBadge :type="SKILL_MAP[e.skill]?.type ?? 'normal'" size="sm" />
          <span class="muted">威力{{ SKILL_MAP[e.skill]?.power || 0 }} · {{ SKILL_MAP[e.skill]?.range==='melee'?'近战':'远程' }}</span>
        </div>

        <div class="sub bold">特性池</div>
        <div v-for="aid in species.abilities" :key="aid" class="tiny">
          <Tip :text="ABILITY_MAP[aid] ? abilityTip(ABILITY_MAP[aid]) : ''"><span class="chip">{{ ABILITY_MAP[aid]?.name ?? aid }}</span></Tip>
          {{ ABILITY_MAP[aid]?.description }}
        </div>
        <div v-if="species.hiddenAbility" class="tiny muted">隐藏特性：{{ ABILITY_MAP[species.hiddenAbility]?.name ?? species.hiddenAbility }}</div>

        <div class="sub bold">梦幻技能池 <span class="tiny muted" style="font-weight:400">（种族固定 · 野生随机持有1~5 · 灰=初级/蓝=中级/金=高级 · 标必带为天生持有）</span></div>
        <div v-if="species.passivePool.length===0" class="tiny muted">无</div>
        <div v-for="pid in species.passivePool" :key="pid" class="tiny">
          <Tip :text="passiveTip(PASSIVE_MAP[pid], species.intrinsicPassives.includes(pid))">
            <span class="chip" :style="species.intrinsicPassives.includes(pid) ? 'background:var(--gold);color:#333' : ''">{{ PASSIVE_MAP[pid]?.name ?? pid }}<span v-if="species.intrinsicPassives.includes(pid)">·必带</span></span>
          </Tip>
          {{ PASSIVE_MAP[pid]?.description }}
        </div>

        <div class="sub bold" v-if="species.evolution && species.evolution.length">进化</div>
        <div v-if="species.evolution && species.evolution.length" class="tiny row" style="gap:6px;flex-wrap:wrap;align-items:center">
          <template v-for="(e, i) in species.evolution" :key="e.to">
            <span v-if="i>0">/</span>
            <span class="chip">{{ getSpecies(e.to).name }}（Lv.{{ e.level }}）</span>
          </template>
        </div>

        <div class="tiny muted sub" v-if="!entry?.caught" style="color:var(--warn)">尚未捕获该宝可梦</div>
      </div>
      <div v-else-if="species && !isSeen" class="empty">
        <div class="silhouette big">❔</div>
        <div class="tiny muted center" style="margin-top:8px">尚未发现该宝可梦</div>
      </div>
      <div v-else class="empty">
        <div class="tiny muted center">选择左侧图鉴查看详情</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dex-layout { display:flex; gap:12px; align-items:flex-start; }
.dex-left { flex:1; min-width:0; }
.dex-right { width: 460px; flex-shrink:0; overscroll-behavior:contain; }
.dex-cell {
  background: var(--panel); color: var(--ink); border-radius: 10px; padding: 8px 6px;
  text-align: center; position: relative; box-shadow: 0 2px 0 rgba(0,0,0,.12);
  cursor: pointer; border: 2px solid transparent;
}
.dex-cell.caught { border-color: var(--good); }
.dex-cell.seen { border-color: var(--warn); }
.dex-cell.selected { outline: 2px solid var(--accent); }
.dex-cell .num { font-size: 10px; color: var(--muted); }
.dex-cell .name { font-weight: 700; font-size: 13px; margin: 2px 0; }
.dex-cell .silhouette { font-size: 36px; opacity: .4; }
.detail { display:flex; flex-direction:column; gap:8px; }
.detail .sub { margin-top:6px; }
.skill-row { display:flex; align-items:center; gap:6px; padding:3px 0; border-bottom:1px dashed #eee; }
.lv-chip { display:inline-block; background:var(--accent-2); color:#fff; border-radius:6px; padding:0 6px; font-size:10px; font-weight:700; min-width:36px; text-align:center; }
.empty { display:flex; flex-direction:column; justify-content:center; align-items:center; min-height:240px; }
.silhouette.big { font-size: 56px; opacity:.4; }
</style>
