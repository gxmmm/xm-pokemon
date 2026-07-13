<script setup lang="ts">
import { ref, computed } from 'vue';
import { useGameStore } from '../stores/game.ts';
import { useMessage } from '../stores/message.ts';
import { getSpecies, PERSONALITY_MAP } from '@pokemon-online/config';
import { ivCeiling } from '@pokemon-online/engine';
import PokemonCard from '../components/PokemonCard.vue';
import PokemonSprite from '../components/PokemonSprite.vue';
import PokemonDetailPanel from '../components/PokemonDetailPanel.vue';
import BackHub from '../components/BackHub.vue';
import type { PokemonInstance, IV } from '@pokemon-online/shared';

const game = useGameStore();
const msg = useMessage();
const aUid = ref<string | null>(null); // 主宠
const bUid = ref<string | null>(null); // 副宠
const result = ref<{ offspring: PokemonInstance; msg: string } | null>(null);
const selectedUid = ref<string | null>(game.rosterInstances[0]?.uid ?? null);

const all = computed(() => game.rosterInstances);
const parentA = computed(() => (aUid.value ? game.getInstance(aUid.value) : null));
const parentB = computed(() => (bUid.value ? game.getInstance(bUid.value) : null));

// roster sort: battle-team first, then level desc, then rarity (rarer first)
const RARITY_RANK: Record<string, number> = { common: 0, uncommon: 1, rare: 2, legendary: 3, mythical: 4 };
const sortedAll = computed(() => {
  const save = game.save!;
  const inTeam = (uid: string) => save.pveTeam.includes(uid) || save.pvpTeam.includes(uid);
  return [...game.rosterInstances].sort((a, b) => {
    const ta = inTeam(a.uid) ? 1 : 0;
    const tb = inTeam(b.uid) ? 1 : 0;
    if (ta !== tb) return tb - ta;
    if (a.level !== b.level) return b.level - a.level;
    return (RARITY_RANK[getSpecies(b.speciesId).rarity] ?? 0) - (RARITY_RANK[getSpecies(a.speciesId).rarity] ?? 0);
  });
});

function nameOf(inst: PokemonInstance | null | undefined): string {
  return inst ? (inst.nickname || getSpecies(inst.speciesId).name) : '未选';
}
/** Tags showing which battle teams a mon is in (warns before breeding it away). */
function teamTags(uid: string): string[] {
  const tags: string[] = [];
  if (game.save!.pveTeam.includes(uid)) tags.push('PVE');
  if (game.save!.pvpTeam.includes(uid)) tags.push('PVP');
  return tags;
}

// click a roster card: select it (right detail). The 3 action buttons live
// below each card (click-triggered, like the team roster's 加入/移出 button).
function onCardClick(uid: string): void {
  selectedUid.value = uid;
}
function setMain(uid: string): void {
  if (bUid.value === uid) bUid.value = null; // a mon can't be both parents
  aUid.value = uid;
  selectedUid.value = uid;
}
function setSub(uid: string): void {
  if (aUid.value === uid) aUid.value = null;
  bUid.value = uid;
  selectedUid.value = uid;
}
async function releaseMon(uid: string): Promise<void> {
  const inst = game.getInstance(uid);
  if (!inst) return;
  const name = inst.nickname || getSpecies(inst.speciesId).name;
  const ok = await msg.confirm(`放生 ${name}？放生后无法找回，但会保留图鉴记录。`, { title: '放生', danger: true, okText: '放生' });
  if (!ok) return;
  if (aUid.value === uid) aUid.value = null;
  if (bUid.value === uid) bUid.value = null;
  if (selectedUid.value === uid) selectedUid.value = null;
  game.release(uid);
  msg.success(`已放生 ${name}`);
}

async function doBreed(): Promise<void> {
  if (!aUid.value || !bUid.value) return;
  const a = parentA.value, b = parentB.value;
  if (!a || !b) return;
  const inTeamCount = [aUid.value, bUid.value].filter((u) => teamTags(u).length).length;
  const warn = inTeamCount > 0 ? `\n⚠ 注意：父母中含出战阵容成员，炼妖后会从阵容移除。` : '';
  const ok = await msg.confirm(
    `将消耗 主宠 ${nameOf(a)} 与 副宠 ${nameOf(b)} 炼妖，产生一只新个体（梦幻式：两只父母均会消失）。${warn}`,
    { title: '炼妖', okText: '开始炼妖' },
  );
  if (!ok) return;
  const r = game.breed(aUid.value, bUid.value);
  if (r.ok && r.offspring) {
    result.value = { offspring: r.offspring, msg: r.msg };
    selectedUid.value = r.offspring.uid;
    aUid.value = null; bUid.value = null;
    msg.success('炼妖成功！');
  } else {
    msg.error(r.msg);
  }
}

// stats that exceed the offspring species' natural ceiling (bred IVs are uncapped)
function overCeilingStats(inst: PokemonInstance): (keyof IV)[] {
  const ceil = ivCeiling(getSpecies(inst.speciesId).rarity);
  return (['hp','atk','def','spd'] as (keyof IV)[]).filter((k) => inst.iv[k] > ceil);
}
const IV_LABEL: Record<keyof IV, string> = { hp: '生命', atk: '攻击', def: '防御', spd: '速度' };
</script>

<template>
  <div v-if="game.save" class="breed-layout">
    <!-- LEFT: 上区(炼妖) + 下区(当前宠摘要) -->
    <div class="breed-left">
      <div class="panel" style="margin-bottom:10px;padding:10px">
        <div class="between" style="margin:0 0 4px">
          <h2 class="h-title" style="margin:0;font-size:17px">炼妖（梦幻式）</h2>
          <BackHub />
        </div>
        <p class="tiny muted" style="margin:0">
          两只炼妖产生一只新个体，种族<b>主宠65%/副宠35%</b>概率继承（不融合）。资质=父母均值×<b>{0.8/0.9/1.0/1.1/1.2}</b>、最低1、
          <span class="gold-txt">不封顶</span>；成长=父母均值×<b>{0.9/1.0/1.1}</b>（封顶1.3）；被动=<b>必带100%保留</b>+父母并集主宠65%/副宠35%。两只父母将被消耗。
        </p>
      </div>

      <!-- 主/副 两个格子 -->
      <div class="panel" style="margin-bottom:10px;padding:10px">
        <div class="row center" style="gap:12px">
          <div class="center col slot-box" :class="{ filled: !!parentA }" @click="aUid=null">
            <span class="slot-label">主宠</span>
            <PokemonSprite v-if="parentA" :species-id="parentA.speciesId" :size="48" />
            <span v-else class="slot-empty">＋</span>
            <span class="tiny bold">{{ nameOf(parentA) }}</span>
          </div>
          <div class="center col" style="gap:2px"><span style="font-size:22px">⚗️</span><span class="tiny">炼妖</span></div>
          <div class="center col slot-box" :class="{ filled: !!parentB }" @click="bUid=null">
            <span class="slot-label">副宠</span>
            <PokemonSprite v-if="parentB" :species-id="parentB.speciesId" :size="48" />
            <span v-else class="slot-empty">＋</span>
            <span class="tiny bold">{{ nameOf(parentB) }}</span>
          </div>
        </div>
        <button class="gold" style="width:100%;margin-top:8px" :disabled="!parentA || !parentB" @click="doBreed">开始炼妖</button>
      </div>

      <!-- 父母选择（点击弹出 主/副/放生 三选项） -->
      <div class="panel" style="margin-bottom:10px;padding:10px">
        <div class="bold tiny" style="margin-bottom:6px">选择宝可梦（出战优先·等级降序 · 点击弹 主/副/放生）</div>
        <div class="grid grid-4 roster-grid">
          <div v-for="p in sortedAll" :key="p.uid" class="roster-cell" :class="{ selected: selectedUid===p.uid }" @click="onCardClick(p.uid)">
            <span class="badge" v-if="aUid===p.uid">主</span>
            <span class="badge b" v-else-if="bUid===p.uid">副</span>
            <span class="team-tag" v-if="teamTags(p.uid).length">{{ teamTags(p.uid).join('·') }}</span>
            <PokemonCard :instance="p" :selectable="true" :selected="aUid===p.uid || bUid===p.uid || selectedUid===p.uid" :fainted="false" compact />
            <div class="card-actions" @click.stop>
              <button class="sm" @click="setMain(p.uid)">主宠</button>
              <button class="sm" @click="setSub(p.uid)">副宠</button>
              <button class="sm danger" @click="releaseMon(p.uid)">放生</button>
            </div>
          </div>
        </div>
        <div v-if="all.length < 2" class="tiny muted" style="margin-top:6px">至少需要2只宝可梦才能炼妖。</div>
      </div>

      <div class="panel" v-if="result" style="margin-bottom:10px;padding:10px">
        <h3 class="h-title center" style="font-size:16px">炼妖成功！</h3>
        <div class="center col" style="margin:8px 0;gap:4px">
          <PokemonSprite :species-id="result.offspring.speciesId" :size="84" />
          <div class="bold">{{ getSpecies(result.offspring.speciesId).name }}</div>
          <span class="chip">Lv.{{ result.offspring.level }} · {{ PERSONALITY_MAP[result.offspring.personality]?.name }}型 · 成长 ×{{ result.offspring.growth }}</span>
          <div class="tiny" v-if="overCeilingStats(result.offspring).length">
            <span class="gold-txt">资质超限：{{ overCeilingStats(result.offspring).map(k=>IV_LABEL[k]).join('、') }}</span>
          </div>
        </div>
        <div class="tiny muted">详情见右侧面板。</div>
      </div>
    </div>

    <!-- RIGHT: 资质 / 技能 详细 -->
    <div class="breed-right panel">
      <PokemonDetailPanel :uid="selectedUid" />
    </div>
  </div>
</template>

<style scoped>
.breed-layout { display:flex; gap:12px; align-items:flex-start; position:relative; }
.breed-left { flex:1; min-width:0; }
.breed-right { width: 460px; flex-shrink:0; }

.slot-box {
  background:var(--panel-2); border-radius:10px; padding:8px 12px; gap:3px; min-width:88px;
  border:2px dashed #cbd5e1; cursor:pointer;
}
.slot-box.filled { border-style:solid; border-color:var(--accent-2); }
.slot-box:hover { border-color:var(--accent); }
.slot-label { font-size:11px; font-weight:800; color:var(--muted); }
.slot-empty { font-size:28px; color:var(--muted); line-height:1; }

.roster-cell { position:relative; cursor:pointer; border-radius:10px; }
.roster-cell.selected { outline:2px solid var(--accent); }
.roster-cell .badge { position:absolute; top:4px; right:4px; background:var(--accent); color:#fff; border-radius:50%; width:22px; height:22px; font-size:11px; display:flex; align-items:center; justify-content:center; z-index:3; font-weight:700; }
.roster-cell .badge.b { background:var(--accent-2); }
.roster-cell .team-tag { position:absolute; top:4px; left:4px; background:var(--warn); color:#333; border-radius:6px; padding:0 5px; font-size:10px; font-weight:800; z-index:3; }

.card-actions { display:flex; gap:3px; margin-top:4px; }
.card-actions button { flex:1; font-size:11px; padding:4px 4px; }

.gold-txt { color:var(--gold); font-weight:800; }
</style>
