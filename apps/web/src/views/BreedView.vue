<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useGameStore } from '../stores/game.ts';
import { getSpecies, PERSONALITY_MAP } from '@pokemon-online/config';
import PokemonCard from '../components/PokemonCard.vue';
import PokemonSprite from '../components/PokemonSprite.vue';
import type { PokemonInstance } from '@pokemon-online/shared';

const game = useGameStore();
const router = useRouter();
const aUid = ref<string | null>(null);
const bUid = ref<string | null>(null);
const result = ref<{ offspring: PokemonInstance; msg: string } | null>(null);

const all = computed(() => game.rosterInstances);
const parentA = computed(() => (aUid.value ? game.getInstance(aUid.value) : null));
const parentB = computed(() => (bUid.value ? game.getInstance(bUid.value) : null));

function pick(uid: string): void {
  if (aUid.value === uid) { aUid.value = null; return; }
  if (bUid.value === uid) { bUid.value = null; return; }
  if (!aUid.value) aUid.value = uid;
  else if (!bUid.value) bUid.value = uid;
  else aUid.value = uid; // replace A
}

function doBreed(): void {
  if (!aUid.value || !bUid.value) return;
  if (!confirm('炼妖将消耗两只宝可梦，产生一只新个体。确定继续吗？（梦幻式：两只均会消失）')) return;
  const r = game.breed(aUid.value, bUid.value);
  if (r.ok && r.offspring) {
    result.value = { offspring: r.offspring, msg: r.msg };
    aUid.value = null; bUid.value = null;
  } else {
    alert(r.msg);
  }
}
</script>

<template>
  <div v-if="game.save">
    <div class="panel" style="margin-bottom:12px">
      <h2 class="h-title" style="margin:0 0 4px">炼妖（梦幻式）</h2>
      <p class="tiny muted">
        两只宝可梦炼妖后产生一只新个体，种族随机继承主宠或副宠（不融合）。资质与成长重新随机，
        被动技能随机继承并保留多技能上限，特性极低概率变异。两只父母将被消耗。
      </p>
    </div>

    <div class="panel" style="margin-bottom:12px">
      <div class="bold" style="margin-bottom:8px">选择父母（点选两只）</div>
      <div class="grid grid-3">
        <div v-for="p in all" :key="p.uid" @click="pick(p.uid)">
          <PokemonCard :instance="p" :selectable="true" :selected="aUid===p.uid || bUid===p.uid" :fainted="false" />
        </div>
      </div>
    </div>

    <div class="panel" style="margin-bottom:12px" v-if="parentA && parentB">
      <div class="row center" style="gap:16px">
        <div class="center col"><PokemonSprite :species-id="parentA.speciesId" :size="64" /><span class="tiny">{{ getSpecies(parentA.speciesId).name }}</span></div>
        <div class="center col"><span style="font-size:28px">⚗️</span><span class="tiny">炼妖</span></div>
        <div class="center col"><PokemonSprite :species-id="parentB.speciesId" :size="64" /><span class="tiny">{{ getSpecies(parentB.speciesId).name }}</span></div>
      </div>
      <div class="tiny muted center" style="margin:8px 0">
        后代种族：{{ getSpecies(parentA.speciesId).name }} 或 {{ getSpecies(parentB.speciesId).name }}（随机）
      </div>
      <button class="gold" style="width:100%" @click="doBreed">开始炼妖</button>
    </div>

    <div class="panel" v-if="result">
      <h3 class="h-title center">炼妖成功！</h3>
      <div class="center col" style="margin:10px 0">
        <PokemonSprite :species-id="result.offspring.speciesId" :size="100" />
        <div class="bold">{{ getSpecies(result.offspring.speciesId).name }}</div>
        <span class="chip">Lv.{{ result.offspring.level }} · {{ PERSONALITY_MAP[result.offspring.personality]?.name }}型</span>
        <span class="chip">成长 ×{{ result.offspring.growth }} · 资质 {{ result.offspring.iv.atk }}/{{result.offspring.iv.def}}/{{result.offspring.iv.spd}}/{{result.offspring.iv.hp}}</span>
        <div class="tiny muted">特性：{{ result.offspring.ability }}</div>
        <div class="tiny">被动：{{ result.offspring.passiveSkills.length }} 个</div>
      </div>
      <pre class="tiny" style="white-space:pre-wrap;font-family:inherit">{{ result.msg }}</pre>
      <div class="row">
        <button class="sm" @click="router.push({name:'pokemon',params:{uid:result.offspring.uid}})">查看详情</button>
        <button class="sm ghost" @click="result=null">继续炼妖</button>
      </div>
    </div>
  </div>
</template>
