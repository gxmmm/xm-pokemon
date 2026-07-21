<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { getSpecies, SKILL_MAP, SPECIES_LIST, type BattleEnvironmentId } from '@pokemon-online/config';
import { createWildInstance } from '@pokemon-online/engine';
import { BattleDirector, type BattlePresentation } from '@pokemon-online/presentation';
import type { BattleCombatant } from '@pokemon-online/shared';
import type { QualityProfile } from '@pokemon-online/renderer';
import PixiBattleViewport from '../components/PixiBattleViewport.vue';
import { buildVfxLabEvents } from '../battle/VfxLab.ts';

const CASTER_ID = 'vfx-lab:caster';
const DUMMY_ID = 'vfx-lab:dummy';
const casterSpeciesId = ref(6);
const search = ref('');
const biome = ref<BattleEnvironmentId>('grass');
const quality = ref<QualityProfile>('cinematic');
const intensity = ref(1);
const repeat = ref(3);
const looping = ref(false);
const presentation = ref<BattlePresentation | null>(null);
const cues = ref<ReturnType<BattleDirector['direct']>>([]);
const stageReady = ref(false);
const status = ref('选择技能后即可播放；双方位置固定，数值与冷却不会变化。');
const director = new BattleDirector();
const VFX_LAB_LOOP_INTERVAL_MS = 300;
let sequence = 1;
let loopTimer: ReturnType<typeof setInterval> | null = null;

const caster = computed(() => getSpecies(casterSpeciesId.value));
const filteredSpecies = computed(() => {
  const query = search.value.trim().toLowerCase();
  return query ? SPECIES_LIST.filter((species) => `${species.id} ${species.name} ${species.enName}`.toLowerCase().includes(query)) : SPECIES_LIST;
});
const selectableSkills = computed(() => caster.value.learnset.map((entry) => SKILL_MAP[entry.skill]).filter((skill): skill is NonNullable<typeof skill> => !!skill));

function staticCombatant(speciesId: number, side: 'player' | 'enemy', uid: string, position: { x: number; y: number }): BattleCombatant {
  const instance = createWildInstance(speciesId, 100, { rng: () => 0.5 });
  const species = getSpecies(speciesId);
  const stats = { hp: species.base.hp, atk: species.base.atk, def: species.base.def, spd: species.base.spd };
  return {
    uid, side, speciesId, types: species.types, level: 100, name: side === 'enemy' ? '训练假人' : species.name,
    personality: instance.personality, ability: instance.ability, activeSkills: [...instance.activeSkills], passiveSkills: [], stats,
    maxHp: stats.hp, currentHp: stats.hp, position, pixel: { ...position }, facing: side === 'player' ? 1 : -1,
    cooldowns: {}, abilityCooldowns: {}, pressureUntil: 0, sturdyUsed: false, normalAttackCd: 0,
    normalAttackInterval: species.normalAttackInterval, normalAttackSpeedMultiplier: 1, regenAccumulator: 0,
    normalRangeCells: species.normalAttackDelivery === 'ranged' ? 6 : 1.5, normalIsRanged: species.normalAttackDelivery === 'ranged',
    status: null, statusTimer: 0, statStages: { atk: 0, def: 0, spd: 0 }, shields: 0, damageDealt: 0, damageTaken: 0,
    normalDamage: 0, skillDamage: 0, healingDone: 0, shieldAbsorbed: 0, controlSeconds: 0, interrupts: 0, knockouts: 0,
    skillCasts: 0, normalAttacks: 0, hits: 0, misses: 0, skillStats: {}, buffs: [], castProgress: null, alive: true,
    iv: instance.iv, growth: instance.growth, currentTargetUid: uid === CASTER_ID ? DUMMY_ID : CASTER_ID, nextDecisionAt: Number.POSITIVE_INFINITY,
    plan: null, dotAccumulator: 0, flinchUntil: 0, moveCd: Number.POSITIVE_INFINITY,
  };
}

async function resetStage(): Promise<void> {
  const combatants = [
    staticCombatant(casterSpeciesId.value, 'player', CASTER_ID, { x: 5, y: 8 }),
    staticCombatant(143, 'enemy', DUMMY_ID, { x: 15, y: 8 }),
  ];
  presentation.value = { time: 0, combatants, events: [] };
  cues.value = [];
  director.reset();
  await nextTick();
  status.value = `${caster.value.name} 已就位，训练假人固定不动。`;
}

function playSkill(skillId: string): void {
  stopLoop();
  playSkillBatch(skillId, repeat.value);
}

function playSkillBatch(skillId: string, count: number): void {
  if (!stageReady.value || !presentation.value) return;
  const batches = Array.from({ length: count }, (_, index) => {
    const events = buildVfxLabEvents({ actorId: CASTER_ID, targetId: DUMMY_ID, skillId, sequence: sequence + index * 10 });
    const delayMs = index * 720;
    const boostedEvents = events.map((event) => event.type === 'damage' || event.type === 'skill'
      ? { ...event, outcome: event.outcome ? { ...event.outcome, damage: Math.round((event.outcome.damage ?? 1) * intensity.value * 5), critical: intensity.value >= 1.5 } : event.outcome }
      : event);
    return director.direct(boostedEvents).map((entry) => ({
      ...entry,
      cue: 'delayMs' in entry.cue ? { ...entry.cue, delayMs: (entry.cue.delayMs ?? 0) + delayMs } : entry.cue,
    }));
  });
  sequence += count * 10;
  cues.value = batches.flat();
  const skill = SKILL_MAP[skillId];
  status.value = `${skill?.name ?? skillId} 连播 ${count} 次：${skill?.effect?.target === 'self' || skill?.effect?.kind === 'heal' ? '对自身' : '对训练假人'}，强度 ${intensity.value.toFixed(1)}x。`;
}

function startLoop(skillId: string): void {
  stopLoop();
  looping.value = true;
  playSkillBatch(skillId, 1);
  loopTimer = setInterval(() => playSkillBatch(skillId, 1), VFX_LAB_LOOP_INTERVAL_MS);
  status.value = `${SKILL_MAP[skillId]?.name ?? skillId} 正在循环播放；再次点击该技能停止。`;
}

function stopLoop(): void {
  if (loopTimer) clearInterval(loopTimer);
  loopTimer = null;
  looping.value = false;
}

watch([casterSpeciesId, biome], () => { stopLoop(); void resetStage(); });
onMounted(() => { void resetStage(); });
onUnmounted(() => { stopLoop(); cues.value = []; });
</script>

<template>
  <section class="vfx-lab">
    <header class="lab-header"><div><p class="eyebrow">VISUAL TEST RANGE</p><h1>技能演示靶场</h1></div><RouterLink to="/battle-sandbox">返回随机战斗</RouterLink></header>
    <div class="layout">
      <aside class="panel selection"><label>施法宝可梦 <input v-model="search" placeholder="搜索图鉴" /></label><div class="species-list"><button v-for="species in filteredSpecies" :key="species.id" :class="{ active: species.id === casterSpeciesId }" type="button" @click="casterSpeciesId = species.id">#{{ String(species.id).padStart(3, '0') }} {{ species.name }}</button></div></aside>
      <main class="stage"><div class="toolbar"><label>环境 <select v-model="biome"><option value="grass">草地</option><option value="cave">洞窟</option><option value="water">水域</option><option value="dragon">龙穴</option><option value="arena">竞技场</option></select></label><label>质量 <select v-model="quality"><option value="cinematic">cinematic</option><option value="standard">standard</option><option value="compatibility">compatibility</option></select></label><label>演出强度 <input v-model.number="intensity" type="range" min="0.5" max="2" step="0.1" /><strong>{{ intensity.toFixed(1) }}x</strong></label><label>连播 <select v-model.number="repeat"><option :value="1">1 次</option><option :value="3">3 次</option><option :value="5">5 次</option></select></label></div><div class="viewport"><PixiBattleViewport :presentation="presentation ?? undefined" :cues="cues" :biome="biome" :quality="quality" @ready="stageReady = true" @unavailable="status = $event" /></div><p class="status">{{ status }}</p></main>
      <aside class="panel skills"><h2>{{ caster.name }}</h2><p>左侧施法者；右侧为静态训练假人。点击技能连播；右侧循环按钮持续播放。</p><div v-for="skill in selectableSkills" :key="skill.id" class="skill-row"><button type="button" class="skill" @click="playSkill(skill.id)"><span>{{ skill.name }}</span><small>{{ skill.type }} · {{ skill.range }}</small></button><button type="button" class="loop" :title="`${skill.name} 循环播放`" @click="looping ? stopLoop() : startLoop(skill.id)">{{ looping ? '■' : '↻' }}</button></div></aside>
    </div>
  </section>
</template>

<style scoped>
.vfx-lab { min-height: 100%; padding: 20px; color: #e9f3f2; background: #101b1d; }.lab-header { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:16px; }.eyebrow { margin:0; color:#8fe4b1; font-size:12px; font-weight:800; letter-spacing:.12em; } h1,h2,p { margin:0; } h1 { margin-top:4px; } a { color:#c8f6da; }.layout { display:grid; grid-template-columns:220px minmax(0, 1fr) 220px; gap:12px; }.panel { min-height:0; padding:12px; background:#18262a; border:1px solid #35555a; border-radius:8px; }.selection label { display:grid; gap:7px; font-size:13px; color:#b9d0cc; } input,select,button { font:inherit; color:#ebf7f3; background:#21383a; border:1px solid #426c69; border-radius:5px; } input,select { min-height:32px; padding:0 8px; }.species-list { display:grid; gap:5px; max-height:650px; overflow:auto; margin-top:10px; }.species-list button { padding:7px; text-align:left; }.species-list button.active { background:#2b725d; border-color:#9ce7b7; }.stage { min-width:0; }.toolbar { display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-bottom:8px; }.toolbar label { display:flex; align-items:center; gap:6px; color:#c0d8d4; font-size:13px; }.viewport { position:relative; aspect-ratio:16/9; overflow:hidden; background:#10213a; border:2px solid #568c78; border-radius:8px; }.status { min-height:22px; margin-top:8px; color:#bfe3c5; }.skills h2 { margin-bottom:6px; }.skills p { margin-bottom:10px; color:#a8bfbd; font-size:12px; line-height:1.5; }.skill-row { display:flex; gap:6px; margin:6px 0; }.skill { display:grid; flex:1; gap:3px; padding:9px; text-align:left; }.loop { width:34px; min-width:34px; padding:0; font-weight:800; }.skill:hover,.loop:hover { background:#315852; }.skill small { color:#a8d7c8; } @media (max-width:900px) { .layout { grid-template-columns:1fr; }.species-list { max-height:180px; grid-template-columns:repeat(2,minmax(0,1fr)); }.skills { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }.skills h2,.skills p { grid-column:1/-1; }.skill { margin:0; } }
</style>
