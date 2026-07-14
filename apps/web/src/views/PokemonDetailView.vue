<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useGameStore } from '../stores/game.ts';
import { useMessage } from '../stores/message.ts';
import { getSpecies, PERSONALITY_MAP, ABILITY_MAP, SKILL_MAP, PASSIVE_MAP, PASSIVE_TIER_LABEL, TYPE_COLORS, levelProgress, expToNext, skillBudgetLabel, COMBAT_ROLE_LABEL, combatRoleTooltipText } from '@pokemon-online/config';
import { getAvailableEvolutions, computeStats, maxHp, ivCeiling, growthCeiling, statBreakdown } from '@pokemon-online/engine';
import PokemonSprite from '../components/PokemonSprite.vue';
import TypeBadge from '../components/TypeBadge.vue';
import Tip from '../components/Tip.vue';
import BackHub from '../components/BackHub.vue';
import type { Personality, Ability, Skill, IV, StatKey } from '@pokemon-online/shared';
import { HP_MULTIPLIER } from '@pokemon-online/shared';

const route = useRoute();
const router = useRouter();
const game = useGameStore();
const msg = useMessage();
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

// aptitude (IV) ceiling for this species + whether any stat exceeds it
const ivCeil = computed(() => (species.value ? ivCeiling(species.value.rarity) : 31));
const growthCeil = computed(() => (species.value ? growthCeiling(species.value.rarity) : 1.3));
const hasOverCeiling = computed(() => {
  if (!inst.value) return false;
  const iv = inst.value.iv;
  return (['hp','atk','def','spd'] as (keyof IV)[]).some((k) => iv[k] > ivCeil.value);
});
const isBred = computed(() => inst.value?.origin === 'bred');

const TIER_COLOR: Record<number, string> = { 1: '#6b7280', 2: '#3b4cca', 3: '#b8860b' };
// active skill pool: intrinsic (天生必带) first, then full learnset; known first, unlearned dim
const activeDisplay = computed(() => {
  if (!inst.value || !species.value) return [];
  const known = new Set(inst.value.activeSkills);
  const items: { id: string; owned: boolean; char: string; color: string; level: number; tip: string }[] = [];
  const seen = new Set<string>();
  const push = (sid: string, level: number) => {
    if (seen.has(sid)) return;
    seen.add(sid);
    const sk = SKILL_MAP[sid];
    items.push({
      id: sid, owned: known.has(sid),
      char: sk?.name?.[0] ?? '?',
      color: TYPE_COLORS[sk?.type ?? 'normal'] ?? '#A8A77A',
      level,
      tip: skillTip(sk) + (level === 0 ? '\n(天生必带)' : species.value?.signatureSkill === sid ? '\n(种族专属)' : ''),
    });
  };
  for (const id of species.value.intrinsic ?? []) push(id, 0);
  for (const e of species.value.learnset) push(e.skill, e.level);
  items.sort((a, b) => (a.owned === b.owned ? a.level - b.level : a.owned ? -1 : 1));
  return items;
});
// passive pool: bred -> only owned; else full pool (+extra) owned first, unowned dim
const passiveDisplay = computed(() => {
  if (!inst.value || !species.value) return [];
  const ownedSet = new Set(inst.value.passiveSkills);
  const intrinsicSet = new Set(species.value.intrinsicPassives ?? []);
  const pool = isBred.value
    ? [...inst.value.passiveSkills]
    : [...new Set([...species.value!.passivePool, ...inst.value.passiveSkills])];
  const items = pool.map((id) => {
    const p = PASSIVE_MAP[id];
    return {
      id, owned: ownedSet.has(id),
      char: p?.name?.[0] ?? '?',
      color: TIER_COLOR[p?.tier ?? 1],
      tip: p ? `${p.name}（${PASSIVE_TIER_LABEL[p.tier] ?? '?'}${intrinsicSet.has(id) ? '·必带' : ''}）\n${p.description}` : id,
    };
  });
  items.sort((a, b) => (a.owned === b.owned ? 0 : a.owned ? -1 : 1));
  return items;
});

// ── hover tooltip text builders (so players can gauge strength at a glance) ──
const RANGE_LABEL: Record<string, string> = { melee: '近战', ranged: '远程', adaptive: '自适应' };
const TARGET_LABEL: Record<string, string> = { nearest: '最近', weakest: '最弱', threat: '威胁', random: '随机' };
const BIAS_LABEL: Record<string, string> = { power: '重威力', speed: '重速攻', utility: '重辅助', balanced: '均衡' };
const TRIGGER_LABEL: Record<string, string> = {
  onLowHp: 'HP低于1/3时', onHit: '被击中时', passive: '持续生效', onEnter: '登场时',
  onTurnStart: '回合开始时', onFaint: '击倒对手时', onSwitch: '撤退时',
};

function personalityTip(p: Personality): string {
  const lines = [
    p.description,
    `攻击倾向 ${Math.round(p.aggression * 100)}% · 偏好 ${RANGE_LABEL[p.rangePreference] ?? p.rangePreference}`,
    `风险偏好 ${Math.round(p.riskTolerance * 100)}% · 目标 ${TARGET_LABEL[p.targetPriority] ?? p.targetPriority}`,
    `技能偏好 ${BIAS_LABEL[p.skillBias] ?? p.skillBias} · 防守阈值 ${Math.round(p.defensiveThreshold * 100)}%`,
  ];
  if (p.fleeChance) lines.push(`逃跑倾向 ${Math.round(p.fleeChance * 100)}%`);
  return lines.join('\n');
}

function abilityTip(a: Ability): string {
  return `${a.description}\n触发：${TRIGGER_LABEL[a.trigger] ?? a.trigger}`;
}

function skillTip(s: Skill | undefined): string {
  if (!s) return '';
  const acc = s.accuracy === 0 ? '必中' : s.accuracy + '%';
  return `${s.name}\n${s.description}\n威力 ${s.power} · 命中 ${acc} · CD ${s.cooldown}s\n${s.range === 'melee' ? '近战' : '远程'} · 射程 ${s.rangeTiles}${s.castTime ? ' · 蓄力 ' + s.castTime + 's' : ''}\n定位：${skillBudgetLabel(s)}`;
}

const STAT_FULL: Record<StatKey, string> = { hp: '生命', atk: '攻击', def: '防御', spd: '速度' };
function statTip(key: StatKey): string {
  if (!inst.value) return '';
  const b = statBreakdown(inst.value, key);
  const inner = b.key === 'hp'
    ? `(基础${b.base} × 0.15 + 资质${b.iv} × 等级${b.level} × 0.07 + 等级${b.level} + 10)`
    : `(基础${b.base} × 0.10 + 资质${b.iv} × 等级${b.level} × 0.055 + 5)`;
  const mults = [`×成长${b.growth}`];
  if (b.key === 'hp') mults.push(`×血量${HP_MULTIPLIER}`);
  if (b.passiveMult !== 1) mults.push(`×被动${b.passiveMult}`);
  if (b.abilityMult !== 1) mults.push(`×特性${b.abilityMult}`);
  return `${STAT_FULL[b.key]} ${b.final}\n${inner}\n${mults.join(' ')}`;
}

async function doEvolve(toId: number): Promise<void> {
  if (!inst.value) return;
  if (!await msg.confirm(`确定让 ${inst.value.nickname || species.value?.name} 进化吗？`, { title: '进化' })) return;
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
async function release(): Promise<void> {
  if (!inst.value || !species.value) return;
  if (!await msg.confirm(`放生 ${inst.value.nickname || species.value.name}？放生后无法找回，但会保留图鉴记录。`, { title: '放生', danger: true, okText: '放生' })) return;
  game.release(uid.value);
  router.replace({ name: 'team' });
}
</script>

<template>
  <div v-if="inst && species && stats" class="pokemon-detail-page">
    <div class="row detail-nav" style="gap:6px">
      <button class="ghost sm" @click="router.back()">← 返回</button>
      <BackHub />
    </div>

    <header class="panel pokemon-hero">
      <PokemonSprite :species-id="species.id" :size="112" :faded="inst.currentHp<=0" />
      <div class="grow">
        <div class="between">
          <span class="h-title" style="margin:0">
            <span v-if="renameMode"><input v-model="renameVal" style="width:120px" @keyup.enter="saveRename" /> <button class="sm gold" @click="saveRename">✓</button></span>
            <span v-else>{{ inst.nickname || species.name }} <button class="sm ghost" @click="startRename">✏️</button></span>
          </span>
          <span class="chip">#{{ String(species.id).padStart(3,'0') }}</span>
        </div>
        <div class="row hero-tags">
          <TypeBadge v-for="t in species.types" :key="t" :type="t" />
          <span class="chip">Lv.{{ inst.level }}</span>
          <Tip :text="personality ? personalityTip(personality) : ''"><span class="chip">{{ personality?.name }}型</span></Tip>
          <span class="chip" :class="{faded: inst.currentHp<=0}">{{ inst.origin==='bred'?'炼妖':inst.origin==='gift'?'礼物':'捕获' }}</span>
          <Tip v-if="species.combatRole" :text="combatRoleTooltipText(species.combatRole)" :clickable="false"><span class="chip role-chip">{{ COMBAT_ROLE_LABEL[species.combatRole] }}</span></Tip>
        </div>
        <div class="tiny muted">{{ species.dex }}</div>
      </div>
      <div class="hero-progress">
        <div class="between tiny"><span>EXP</span><span>{{ expPct }}%</span></div>
        <div class="bar exp-bar"><span :style="{width:expPct+'%'}"></span></div>
        <div class="tiny muted">{{ inst.exp }} / 下一级 {{ expToNext(species.growthRate, inst.level) }}</div>
      </div>
    </header>

    <div class="detail-columns">
      <div class="detail-main">
        <section class="panel detail-section">
          <div class="section-title">当前属性 <span class="tiny muted">hover 查看计算</span></div>
          <div class="stat-dashboard">
            <div v-for="key in ['hp', 'atk', 'def', 'spd'] as StatKey[]" :key="key" class="stat-card"><span>{{ STAT_FULL[key] }}</span><Tip :text="statTip(key)"><b>{{ stats[key] }}</b></Tip></div>
          </div>
          <div class="current-hp tiny muted">当前 HP：{{ inst.currentHp }}/{{ maxHp(inst) }}</div>
        </section>

        <section class="panel detail-section">
          <div class="section-title">资质与成长 <span class="tiny muted">炼妖资质不封顶</span></div>
          <div class="apt-grid">
            <div v-for="key in ['hp', 'atk', 'def', 'spd'] as (keyof IV)[]" :key="key" class="apt-chip"><span>{{ STAT_FULL[key] }}</span><b>{{ inst.iv[key] }}</b></div>
            <div class="apt-chip growth-chip"><span>成长</span><b>×{{ inst.growth }}</b></div>
          </div>
          <div class="tiny muted" style="margin-top:6px">野生资质上限 {{ ivCeil }} · 成长上限 ×{{ growthCeil }} · 亲密度 {{ inst.friendship }}<span v-if="hasOverCeiling" class="bt-tag">资质超限</span></div>
        </section>

        <section class="panel detail-section">
          <div class="section-title">特性</div>
          <div v-if="ability" class="tiny"><Tip :text="abilityTip(ability)"><span class="chip">{{ ability.name }}</span></Tip> {{ ability.description }}</div>
        </section>

        <section v-if="evolutions.length" class="panel detail-section">
          <div class="section-title">可以进化</div>
          <div class="row wrap"><button v-for="e in evolutions" :key="e" class="gold sm" @click="doEvolve(e)">进化为 {{ getSpecies(e).name }}</button></div>
        </section>

        <section class="panel detail-section action-section">
          <div class="section-title">操作</div>
          <div class="row wrap" style="align-items:center;gap:8px">
            <span class="chip" v-if="game.save!.pveTeam.includes(uid)">在 PVE 阵容</span>
            <span class="chip" v-if="game.save!.pvpTeam.includes(uid)">在 PVP 阵容</span>
            <span class="chip muted" v-if="!game.save!.pveTeam.includes(uid) && !game.save!.pvpTeam.includes(uid)">未编入阵容</span>
            <button class="sm danger" @click="release">放生</button>
          </div>
        </section>
      </div>

      <div class="detail-skills">
        <section class="panel detail-section">
          <div class="section-title">主动技能 <span class="tiny muted">已学优先 · 未学置灰</span></div>
          <div class="skill-icon-grid large-skill-grid">
            <Tip v-for="s in activeDisplay" :key="s.id" :text="s.tip"><div class="skill-ic" :class="{ dim: !s.owned }" :style="{ background: s.color }"><span>{{ s.char }}</span></div></Tip>
          </div>
        </section>

        <section class="panel detail-section">
          <div class="section-title">梦幻被动 <span class="tiny muted">{{ isBred ? '继承技能' : '已拥有优先 · 未拥有置灰' }}</span></div>
          <div class="skill-icon-grid large-skill-grid">
            <Tip v-for="p in passiveDisplay" :key="p.id" :text="p.tip"><div class="skill-ic" :class="{ dim: !p.owned }" :style="{ background: p.color }"><span>{{ p.char }}</span></div></Tip>
            <span v-if="passiveDisplay.length===0" class="tiny muted">无</span>
          </div>
        </section>

        <section v-if="inst.lineage" class="panel detail-section lineage-section">
          <div class="section-title">家谱</div>
          <div class="tiny muted">由 #{{ inst.lineage.speciesA }} 与 #{{ inst.lineage.speciesB }} 炼妖而来。</div>
        </section>
      </div>
    </div>
  </div>
  <div v-else class="panel">找不到该宝可梦。<button class="sm" @click="router.replace({name:'team'})">返回</button></div>
</template>

<style scoped>
.pokemon-detail-page { max-width:1120px; margin:0 auto; }
.detail-nav { margin-bottom:8px; }
.pokemon-hero { display:grid; grid-template-columns:auto minmax(0,1fr) minmax(170px,.42fr); gap:14px; align-items:center; }
.hero-tags { gap:6px; margin:5px 0; flex-wrap:wrap; }
.hero-progress { align-self:stretch; display:flex; flex-direction:column; justify-content:center; gap:5px; }
.detail-columns { display:grid; grid-template-columns:minmax(0, .95fr) minmax(330px, 1.05fr); gap:12px; margin-top:12px; align-items:start; }
.detail-main, .detail-skills { display:flex; flex-direction:column; gap:12px; }
.detail-section { margin:0; padding:12px; }
.section-title { font-weight:800; margin-bottom:8px; }
.stat-dashboard { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:7px; }
.stat-card { display:flex; flex-direction:column; gap:2px; padding:7px; border-radius:8px; background:var(--panel-2); font-size:11px; color:var(--muted); }
.stat-card b { color:var(--ink); font-size:19px; line-height:1.1; }
.current-hp { margin-top:7px; }
.apt-grid { display:grid; grid-template-columns:repeat(5, minmax(0,1fr)); gap:6px; }
.apt-chip { display:flex; flex-direction:column; gap:1px; padding:6px; border-radius:7px; background:var(--panel-2); font-size:10px; color:var(--muted); }
.apt-chip b { color:var(--ink); font-size:14px; }
.growth-chip { background:rgba(91,180,105,.14); }
.large-skill-grid { gap:7px; min-height:36px; }
.large-skill-grid .skill-ic { width:32px; height:32px; font-size:14px; }
.lineage-section { border-left:3px solid var(--gold); }
.chip.faded { opacity:.5; }
.role-chip { background:rgba(184,134,11,.16); color:#7a5600; }
.bt-tag { display:inline-block; margin-left:4px; padding:0 6px; border-radius:6px; background:var(--gold); color:#333; font-weight:800; font-size:11px; }
@media (max-width:760px) { .pokemon-hero { grid-template-columns:auto minmax(0,1fr); } .hero-progress { grid-column:1 / -1; } .detail-columns { grid-template-columns:1fr; } .stat-dashboard { grid-template-columns:repeat(2,1fr); } .apt-grid { grid-template-columns:repeat(3,1fr); } }
</style>
