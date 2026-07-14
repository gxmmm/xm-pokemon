<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useGameStore } from '../stores/game.ts';
import { getSpecies, PERSONALITY_MAP, ABILITY_MAP, SKILL_MAP, PASSIVE_MAP, PASSIVE_TIER_LABEL, TYPE_COLORS, levelProgress, skillBudgetLabel, COMBAT_ROLE_LABEL } from '@pokemon-online/config';
import { computeStats, maxHp, ivCeiling, growthCeiling, statBreakdown } from '@pokemon-online/engine';
import PokemonSprite from './PokemonSprite.vue';
import TypeBadge from './TypeBadge.vue';
import Tip from './Tip.vue';
import type { Personality, Ability, Skill, IV, StatKey } from '@pokemon-online/shared';
import { HP_MULTIPLIER } from '@pokemon-online/shared';

const props = defineProps<{ uid: string | null }>();
const game = useGameStore();
const router = useRouter();

const inst = computed(() => (props.uid ? game.getInstance(props.uid) : undefined));
const species = computed(() => (inst.value ? getSpecies(inst.value.speciesId) : null));
const personality = computed(() => (inst.value ? PERSONALITY_MAP[inst.value.personality] : null));
const ability = computed(() => (inst.value ? ABILITY_MAP[inst.value.ability] : null));
const stats = computed(() => (inst.value ? computeStats(inst.value) : null));
const expPct = computed(() => species.value && inst.value ? Math.round(levelProgress(species.value.growthRate, inst.value.level, inst.value.exp) * 100) : 0);

const ivCeil = computed(() => (species.value ? ivCeiling(species.value.rarity) : 31));
const growthCeil = computed(() => (species.value ? growthCeiling(species.value.rarity) : 1.3));
const growthPct = computed(() => inst.value ? Math.min(100, Math.round((inst.value.growth / growthCeil.value) * 100)) : 0);
const isBred = computed(() => inst.value?.origin === 'bred');

const APT: { key: keyof IV; label: string }[] = [
  { key: 'hp', label: '命' }, { key: 'atk', label: '攻' },
  { key: 'def', label: '防' }, { key: 'spd', label: '速' },
];
const aptRows = computed(() => {
  if (!inst.value) return [];
  const iv = inst.value.iv;
  const ceil = ivCeil.value;
  return APT.map((r) => {
    const val = iv[r.key];
    return { ...r, val, ceil, pct: Math.min(100, Math.round((val / ceil) * 100)), broken: val > ceil };
  });
});

const STAT_LABEL: Record<StatKey, string> = { hp: '命', atk: '攻', def: '防', spd: '速' };
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
const statRows = computed(() => {
  if (!inst.value || !stats.value) return [];
  const keys: StatKey[] = ['hp', 'atk', 'def', 'spd'];
  return keys.map((k) => ({ key: k, label: STAT_LABEL[k], val: stats.value![k], tip: statTip(k) }));
});

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
      id: sid,
      owned: known.has(sid),
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

// passive pool: bred -> only owned; else full pool (+extra inherited) owned first, unowned dim
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
      id,
      owned: ownedSet.has(id),
      char: p?.name?.[0] ?? '?',
      color: TIER_COLOR[p?.tier ?? 1],
      tip: p ? `${p.name}（${PASSIVE_TIER_LABEL[p.tier] ?? '?'}${intrinsicSet.has(id) ? '·必带' : ''}）\n${p.description}` : id,
    };
  });
  items.sort((a, b) => (a.owned === b.owned ? 0 : a.owned ? -1 : 1));
  return items;
});

const RANGE_LABEL: Record<string, string> = { melee: '近战', ranged: '远程', adaptive: '自适应' };
const TARGET_LABEL: Record<string, string> = { nearest: '最近', weakest: '最弱', threat: '威胁', random: '随机' };
const BIAS_LABEL: Record<string, string> = { power: '重威力', speed: '重速攻', utility: '重辅助', balanced: '均衡' };
const TRIGGER_LABEL: Record<string, string> = { onLowHp: 'HP低于1/3时', onHit: '被击中时', passive: '持续生效', onEnter: '登场时', onTurnStart: '回合开始时', onFaint: '击倒对手时', onSwitch: '撤退时' };

function personalityTip(p: Personality): string {
  return [p.description,
    `攻击倾向 ${Math.round(p.aggression * 100)}% · 偏好 ${RANGE_LABEL[p.rangePreference] ?? p.rangePreference}`,
    `风险偏好 ${Math.round(p.riskTolerance * 100)}% · 目标 ${TARGET_LABEL[p.targetPriority] ?? p.targetPriority}`,
    `技能偏好 ${BIAS_LABEL[p.skillBias] ?? p.skillBias} · 防守阈值 ${Math.round(p.defensiveThreshold * 100)}%`,
  ].join('\n');
}
function abilityTip(a: Ability): string { return `${a.description}\n触发：${TRIGGER_LABEL[a.trigger] ?? a.trigger}`; }
function skillTip(s: Skill | undefined): string {
  if (!s) return '';
  const acc = s.accuracy === 0 ? '必中' : s.accuracy + '%';
  const target = s.targetMode === 'all-enemies'
    ? `敌方全体 · 单目标伤害 ${Math.round((s.areaMultiplier ?? 0.7) * 100)}%`
    : '敌方单体';
  return `${s.name}\n${s.description}\n威力 ${s.power} · 命中 ${acc} · CD ${s.cooldown}s\n${s.range === 'melee' ? '近战' : '远程'} · 射程 ${s.rangeTiles} · ${target}${s.castTime ? ' · 蓄力 ' + s.castTime + 's' : ''}\n定位：${skillBudgetLabel(s)}`;
}
</script>

<template>
  <div v-if="inst && species && stats" class="detail-panel">
    <!-- header (compact) -->
    <div class="row" style="align-items:center;gap:10px">
      <PokemonSprite :species-id="species.id" :size="60" :faded="inst.currentHp<=0" />
      <div class="grow">
        <div class="between">
          <span class="bold" style="font-size:15px">{{ inst.nickname || species.name }}</span>
          <span class="tiny muted">Lv.{{ inst.level }} · #{{ String(species.id).padStart(3,'0') }}</span>
        </div>
        <div class="row" style="gap:4px;margin:3px 0;flex-wrap:wrap">
          <TypeBadge v-for="t in species.types" :key="t" :type="t" size="sm" />
          <Tip :text="personality ? personalityTip(personality) : ''"><span class="chip sm-chip">{{ personality?.name }}型</span></Tip>
          <span class="chip sm-chip">{{ isBred?'炼妖':inst.origin==='gift'?'礼物':'捕获' }}</span>
          <span v-if="species.combatRole" class="chip sm-chip role-chip">{{ COMBAT_ROLE_LABEL[species.combatRole] }}</span>
          <span class="chip sm-chip" v-if="game.save!.pveTeam.includes(inst.uid)">PVE</span>
          <span class="chip sm-chip" v-if="game.save!.pvpTeam.includes(inst.uid)">PVP</span>
        </div>
        <div class="bar exp-bar" style="height:6px"><span :style="{width:expPct+'%'}"></span></div>
        <div class="tiny muted">HP {{ inst.currentHp }}/{{ maxHp(inst) }} · EXP {{ expPct }}%</div>
      </div>
    </div>

    <!-- 资质 | 属性 并排 -->
    <div class="row" style="gap:10px;align-items:flex-start">
      <div style="flex:1;min-width:0">
        <div class="sect">资质 <span class="muted" style="font-weight:400">上限{{ ivCeil }}</span></div>
        <div class="apt-list">
          <div v-for="r in aptRows" :key="r.key" class="apt-row" :class="{ broken: r.broken }">
            <span class="apt-label">{{ r.label }}</span>
            <div class="apt-bar"><span :style="{ width: r.pct + '%' }"></span></div>
            <span class="apt-val">{{ r.val }}</span>
            <span v-if="r.broken" class="bt-tag">超</span>
          </div>
          <div class="apt-row">
            <span class="apt-label">成</span>
            <div class="apt-bar growth"><span :style="{ width: growthPct + '%' }"></span></div>
            <span class="apt-val">×{{ inst.growth }}</span>
          </div>
        </div>
      </div>
      <div style="flex:1;min-width:0">
        <div class="sect">属性 <span class="muted" style="font-weight:400">当前值·hover看计算</span></div>
        <div class="stat-mini">
          <div v-for="r in statRows" :key="r.key">
            <span class="muted">{{ r.label }}</span>
            <Tip :text="r.tip"><b>{{ r.val }}</b></Tip>
          </div>
        </div>
        <div class="sect" style="margin-top:4px">特性</div>
        <div v-if="ability" class="tiny"><Tip :text="abilityTip(ability)"><span class="chip sm-chip">{{ ability.name }}</span></Tip></div>
      </div>
    </div>

    <!-- 主动技能池（图标网格，已学优先，未学置灰） -->
    <div class="sect">主动技能 <span class="muted" style="font-weight:400">（已学优先·未学置灰·hover看效果）</span></div>
    <div class="skill-icon-grid">
      <Tip v-for="s in activeDisplay" :key="s.id" :text="s.tip">
        <div class="skill-ic" :class="{ dim: !s.owned }" :style="{ background: s.color }"><span>{{ s.char }}</span></div>
      </Tip>
    </div>

    <!-- 梦幻被动池（图标网格，已拥有优先，未拥有置灰；炼妖产物只显示已拥有） -->
    <div class="sect">梦幻被动 <span class="muted" style="font-weight:400">{{ isBred ? '（继承）' : '（已拥有优先·未拥有置灰）' }}</span></div>
    <div class="skill-icon-grid">
      <Tip v-for="p in passiveDisplay" :key="p.id" :text="p.tip">
        <div class="skill-ic" :class="{ dim: !p.owned }" :style="{ background: p.color }"><span>{{ p.char }}</span></div>
      </Tip>
      <span v-if="passiveDisplay.length===0" class="tiny muted">无</span>
    </div>

    <div v-if="inst.lineage" class="tiny muted">家谱：#{{ inst.lineage.speciesA }} × #{{ inst.lineage.speciesB }}</div>
    <button class="sm ghost" style="align-self:flex-start" @click="router.push({name:'pokemon',params:{uid:inst.uid}})">完整详情 -&gt;</button>
  </div>
  <div v-else class="detail-panel empty">
    <div class="tiny muted center">选择一只宝可梦查看详情</div>
  </div>
</template>

<style scoped>
.detail-panel { display:flex; flex-direction:column; gap:6px; }
.detail-panel.empty { justify-content:center; align-items:center; min-height:200px; }
.sect { margin-top:4px; font-size:12px; font-weight:800; color:var(--ink); }
.chip.faded { opacity:.5; }
.role-chip { background:rgba(184,134,11,.16); color:#7a5600; }

.apt-list { display:flex; flex-direction:column; gap:3px; }
.apt-row { display:flex; align-items:center; gap:6px; }
.apt-label { width:14px; font-size:11px; font-weight:800; color:var(--ink); flex-shrink:0; }
.apt-bar { flex:1; height:8px; background:#d9d9d9; border-radius:4px; overflow:hidden; }
.apt-bar > span { display:block; height:100%; background:var(--accent-2); transition:width .3s; }
.apt-bar.growth > span { background:var(--grass); }
.apt-row.broken .apt-bar > span { background:var(--gold); }
.apt-val { width:40px; text-align:right; font-size:11px; font-weight:700; color:var(--ink); flex-shrink:0; }
.apt-val .muted { font-weight:400; }
.bt-tag { display:inline-block; padding:0 4px; border-radius:4px; background:var(--gold); color:#333; font-weight:800; font-size:9px; flex-shrink:0; }

.stat-mini { display:grid; grid-template-columns:repeat(2,1fr); gap:2px 6px; font-size:12px; }
.stat-mini b { font-weight:800; color:var(--ink); }
.stat-mini .muted { font-weight:400; }
</style>
