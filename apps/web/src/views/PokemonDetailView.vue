<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useGameStore } from '../stores/game.ts';
import { useMessage } from '../stores/message.ts';
import { getSpecies, PERSONALITY_MAP, ABILITY_MAP, SKILL_MAP, PASSIVE_MAP, PASSIVE_TIER_LABEL, TYPE_COLORS, levelProgress, expToNext } from '@pokemon-online/config';
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
      tip: skillTip(sk) + (level === 0 ? '\n(天生必带)' : ''),
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
  return `${s.name}\n${s.description}\n威力 ${s.power} · 命中 ${acc} · CD ${s.cooldown}s\n${s.range === 'melee' ? '近战' : '远程'} · 射程 ${s.rangeTiles}${s.castTime ? ' · 蓄力 ' + s.castTime + 's' : ''}`;
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
  <div v-if="inst && species && stats">
    <div class="row" style="gap:6px;margin-bottom:8px">
      <button class="ghost sm" @click="router.back()">← 返回</button>
      <BackHub />
    </div>
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
            <Tip :text="personality ? personalityTip(personality) : ''"><span class="chip">{{ personality?.name }}型</span></Tip>
            <span class="chip" :class="{faded: inst.currentHp<=0}">{{ inst.origin==='bred'?'炼妖':inst.origin==='gift'?'礼物':'捕获' }}</span>
          </div>
          <div class="tiny muted">{{ species.dex }}</div>
          <div class="bar exp-bar" style="margin-top:6px"><span :style="{width:expPct+'%'}"></span></div>
          <div class="tiny muted">EXP {{ inst.exp }} / 下一级 {{ expToNext(species.growthRate, inst.level) }}</div>
        </div>
      </div>
    </div>

    <div class="panel" style="margin-top:12px">
      <div class="bold" style="margin-bottom:8px">属性 <span class="tiny muted" style="font-weight:400">hover看计算</span></div>
      <div class="grid grid-2 tiny">
        <div>生命：<Tip :text="statTip('hp')"><b>{{ stats.hp }}</b></Tip></div>
        <div>攻击：<Tip :text="statTip('atk')"><b>{{ stats.atk }}</b></Tip></div>
        <div>防御：<Tip :text="statTip('def')"><b>{{ stats.def }}</b></Tip></div>
        <div>速度：<Tip :text="statTip('spd')"><b>{{ stats.spd }}</b></Tip></div>
        <div>资质上限：{{ ivCeil }} <span class="muted">炼妖不封顶</span></div>
        <div>成长上限：×{{ growthCeil }} <span class="muted">亲密度 {{ inst.friendship }}</span></div>
      </div>
      <div class="tiny" style="margin-top:6px">
        资质：生命 {{ inst.iv.hp }} · 攻击 {{ inst.iv.atk }} · 防御 {{ inst.iv.def }} · 速度 {{ inst.iv.spd }}
        <span v-if="hasOverCeiling" class="bt-tag">超限</span>
        <span class="muted">　成长 ×{{ inst.growth }}</span>
      </div>
      <div class="tiny muted" style="margin-top:4px">当前HP：{{ inst.currentHp }}/{{ maxHp(inst) }}</div>
    </div>

    <div class="panel" style="margin-top:12px">
      <div class="bold" style="margin-bottom:8px">特性</div>
      <div v-if="ability" class="tiny"><Tip :text="abilityTip(ability)"><span class="chip">{{ ability.name }}</span></Tip> {{ ability.description }}</div>
    </div>

    <div class="panel" style="margin-top:12px">
      <div class="bold" style="margin-bottom:8px">主动技能池 <span class="tiny muted" style="font-weight:400">（已学优先·未学置灰·hover看效果）</span></div>
      <div class="skill-icon-grid">
        <Tip v-for="s in activeDisplay" :key="s.id" :text="s.tip">
          <div class="skill-ic" :class="{ dim: !s.owned }" :style="{ background: s.color }"><span>{{ s.char }}</span></div>
        </Tip>
      </div>
    </div>

    <div class="panel" style="margin-top:12px">
      <div class="bold" style="margin-bottom:8px">梦幻被动池 <span class="tiny muted" style="font-weight:400">{{ isBred ? '（继承）' : '（已拥有优先·未拥有置灰）' }}</span></div>
      <div class="skill-icon-grid">
        <Tip v-for="p in passiveDisplay" :key="p.id" :text="p.tip">
          <div class="skill-ic" :class="{ dim: !p.owned }" :style="{ background: p.color }"><span>{{ p.char }}</span></div>
        </Tip>
        <span v-if="passiveDisplay.length===0" class="tiny muted">无</span>
      </div>
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
.chip.faded { opacity:.5; }
.bt-tag { display:inline-block; margin-left:4px; padding:0 6px; border-radius:6px; background:var(--gold); color:#333; font-weight:800; font-size:11px; }
</style>
