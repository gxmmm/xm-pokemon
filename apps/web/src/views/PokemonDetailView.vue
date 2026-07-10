<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useGameStore } from '../stores/game.ts';
import { getSpecies, PERSONALITY_MAP, ABILITY_MAP, SKILL_MAP, PASSIVE_MAP, levelProgress, expToNext } from '@pokemon-online/config';
import { getAvailableEvolutions, computeStats, maxHp } from '@pokemon-online/engine';
import PokemonSprite from '../components/PokemonSprite.vue';
import TypeBadge from '../components/TypeBadge.vue';

const route = useRoute();
const router = useRouter();
const game = useGameStore();
const uid = computed(() => route.params.uid as string);
const inst = computed(() => game.getInstance(uid.value));
const species = computed(() => (inst.value ? getSpecies(inst.value.speciesId) : null));
const personality = computed(() => (inst.value ? PERSONALITY_MAP[inst.value.personality] : null));
const ability = computed(() => (inst.value ? ABILITY_MAP[inst.value.ability] : null));
const stats = computed(() => (inst.value ? computeStats(inst.value) : null));
const evolutions = computed(() => (inst.value ? getAvailableEvolutions(inst.value) : []));
const evolveChoice = ref(false);
const renameMode = ref(false);
const renameVal = ref('');

const expPct = computed(() => species.value && inst.value ? Math.round(levelProgress(species.value.growthRate, inst.value.level, inst.value.exp) * 100) : 0);

function doEvolve(toId: number): void {
  if (!inst.value) return;
  if (!confirm(`确定让 ${inst.value.nickname || species.value?.name} 进化吗？`)) return;
  game.doEvolve(uid.value, toId);
  evolveChoice.value = false;
}
function startRename(): void {
  renameVal.value = inst.value?.nickname ?? '';
  renameMode.value = true;
}
function saveRename(): void {
  if (inst.value) inst.value.nickname = renameVal.value.trim() || undefined;
  renameMode.value = false;
  void game.persist();
}
function release(): void {
  if (!inst.value || !species.value) return;
  if (!confirm(`放生 ${inst.value.nickname || species.value.name}？放生后无法找回，但会保留图鉴记录。`)) return;
  game.release(uid.value);
  router.replace({ name: 'team' });
}
</script>

<template>
  <div v-if="inst && species && stats">
    <button class="ghost sm" @click="router.back()" style="margin-bottom:8px">← 返回</button>
    <div class="panel">
      <div class="row" style="align-items:center;gap:14px">
        <PokemonSprite :species-id="species.id" :size="110" :faded="inst.currentHp<=0" />
        <div class="grow">
          <div class="between">
            <span class="h-title" style="margin:0">
              <template v-if="renameMode">
                <input v-model="renameVal" style="width:120px" @keyup.enter="saveRename" />
                <button class="sm gold" @click="saveRename">✓</button>
              </template>
              <template v-else>
                {{ inst.nickname || species.name }} <button class="sm ghost" @click="startRename">✏️</button>
              </template>
            </span>
            <span class="chip">#{{ String(species.id).padStart(3,'0') }}</span>
          </div>
          <div class="row" style="gap:6px;margin:4px 0">
            <TypeBadge v-for="t in species.types" :key="t" :type="t" />
            <span class="chip">Lv.{{ inst.level }}</span>
            <span class="chip">{{ personality?.name }}型</span>
            <span class="chip" :class="{faded: inst.currentHp<=0}">{{ inst.origin==='bred'?'炼妖':inst.origin==='gift'?'礼物':'捕获' }}</span>
          </div>
          <div class="tiny muted">{{ species.dex }}</div>
          <div class="bar exp-bar" style="margin-top:6px"><span :style="{width:expPct+'%'}"></span></div>
          <div class="tiny muted">EXP {{ inst.exp }} / 下一级 {{ expToNext(species.growthRate, inst.level) }}</div>
        </div>
      </div>
    </div>

    <div class="panel" style="margin-top:12px">
      <div class="bold" style="margin-bottom:8px">属性</div>
      <div class="grid grid-2 tiny">
        <div>生命：{{ stats.hp }} <span class="muted">(基础 {{ species.base.hp }})</span></div>
        <div>攻击：{{ stats.atk }} <span class="muted">(基础 {{ species.base.atk }})</span></div>
        <div>防御：{{ stats.def }} <span class="muted">(基础 {{ species.base.def }})</span></div>
        <div>速度：{{ stats.spd }} <span class="muted">(基础 {{ species.base.spd }})</span></div>
        <div>资质IV：{{ inst.iv.hp }}/{{ inst.iv.atk }}/{{ inst.iv.def }}/{{ inst.iv.spd }}</div>
        <div>成长：×{{ inst.growth }} <span class="muted">亲密度 {{ inst.friendship }}</span></div>
      </div>
      <div class="tiny muted" style="margin-top:6px">当前HP：{{ inst.currentHp }}/{{ maxHp(inst) }}</div>
    </div>

    <div class="panel" style="margin-top:12px">
      <div class="bold" style="margin-bottom:8px">特性</div>
      <div v-if="ability" class="tiny"><span class="chip">{{ ability.name }}</span> {{ ability.description }}</div>
    </div>

    <div class="panel" style="margin-top:12px">
      <div class="bold" style="margin-bottom:8px">主动技能（独立冷却）</div>
      <div v-for="s in inst.activeSkills" :key="s" class="tiny skill-row">
        <span class="bold">{{ SKILL_MAP[s]?.name }}</span>
        <TypeBadge :type="SKILL_MAP[s]?.type ?? 'normal'" size="sm" />
        <span class="muted">威力{{ SKILL_MAP[s]?.power || 0 }} · CD{{ SKILL_MAP[s]?.cooldown }}s · {{ SKILL_MAP[s]?.range==='melee'?'近战':'远程' }}</span>
      </div>
    </div>

    <div class="panel" style="margin-top:12px">
      <div class="bold" style="margin-bottom:8px">被动技能（梦幻式继承）</div>
      <div v-if="inst.passiveSkills.length===0" class="tiny muted">无</div>
      <div v-for="p in inst.passiveSkills" :key="p" class="tiny"><span class="chip">{{ PASSIVE_MAP[p]?.name }}</span> {{ PASSIVE_MAP[p]?.description }}</div>
    </div>

    <div class="panel" style="margin-top:12px" v-if="inst.lineage">
      <div class="bold" style="margin-bottom:8px">家谱</div>
      <div class="tiny muted">由 #{{ inst.lineage.speciesA }} 与 #{{ inst.lineage.speciesB }} 炼妖而来。</div>
    </div>

    <div class="panel" style="margin-top:12px" v-if="evolutions.length">
      <div class="bold" style="margin-bottom:8px">可以进化！</div>
      <div class="row wrap">
        <button v-for="e in evolutions" :key="e" class="gold sm" @click="doEvolve(e)">
          进化为 {{ getSpecies(e).name }}
        </button>
      </div>
    </div>

    <div class="panel" style="margin-top:12px">
      <div class="bold" style="margin-bottom:8px">操作</div>
      <div class="row wrap" style="align-items:center;gap:8px">
        <span class="chip" v-if="game.save!.pveTeam.includes(uid)">在 PVE 阵容</span>
        <span class="chip" v-if="game.save!.pvpTeam.includes(uid)">在 PVP 阵容</span>
        <span class="chip muted" v-if="!game.save!.pveTeam.includes(uid) && !game.save!.pvpTeam.includes(uid)">未编入阵容</span>
        <button class="sm danger" @click="release">放生</button>
      </div>
      <p class="tiny muted" style="margin-top:6px">阵容编排在「队伍」页管理。</p>
    </div>
  </div>
  <div v-else class="panel">找不到该宝可梦。<button class="sm" @click="router.replace({name:'team'})">返回</button></div>
</template>

<style scoped>
.skill-row { display:flex; align-items:center; gap:6px; padding:3px 0; border-bottom:1px dashed #eee; }
.chip.faded { opacity:.5; }
</style>
