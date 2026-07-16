<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { getSpecies, SPECIES_LIST, type BattleEnvironmentId } from '@pokemon-online/config';
import { BattleSim } from '@pokemon-online/engine';
import type { BattlePresentation, DirectedBattleCue } from '@pokemon-online/presentation';
import type { BattleCombatant } from '@pokemon-online/shared';
import type { QualityProfile } from '@pokemon-online/renderer';
import { BattlePresentationBridge } from '../game/BattlePresentationBridge.ts';
import PixiBattleViewport from '../components/PixiBattleViewport.vue';
import { BATTLE_SANDBOX_LEVEL, BATTLE_SANDBOX_MAX_TEAM_SIZE, BATTLE_SANDBOX_MIN_TEAM_SIZE, createBattleSandboxTeam, isBattleSandboxTeamValid } from '../battle/BattleSandboxTeams.ts';

/**
 * 独立验收入口：不读取 Pinia、账户或存档；双方选择只在本页内存中保存。
 * 每次开始均重新调用 createWildInstance(..., 100)，因此个体值、性格和
 * 可选被动会像野生遭遇一样重新随机，不影响任何正式游戏数据。
 */
const playerSpeciesIds = ref<number[]>([]);
const enemySpeciesIds = ref<number[]>([]);
const activeSide = ref<'player' | 'enemy'>('player');
const search = ref('');
const biome = ref<BattleEnvironmentId>('grass');
const quality = ref<QualityProfile>('standard');
const running = ref(false);
const result = ref('');
const gpuUnavailable = ref<string | null>(null);
const simulationTime = ref(0);
const sim = shallowRef<BattleSim | null>(null);
const presentation = ref<BattlePresentation | null>(null);
const cues = ref<DirectedBattleCue[]>([]);
const hudCombatants = ref<BattleCombatant[]>([]);
const presentationBridge = new BattlePresentationBridge();
const pixiRef = ref<InstanceType<typeof PixiBattleViewport> | null>(null);
let raf = 0;
let lastFrame = 0;
let presentationCaughtUp = false;

const activeTeam = computed(() => activeSide.value === 'player' ? playerSpeciesIds.value : enemySpeciesIds.value);
const canStart = computed(() => isBattleSandboxTeamValid(playerSpeciesIds.value) && isBattleSandboxTeamValid(enemySpeciesIds.value));
const filteredSpecies = computed(() => {
  const query = search.value.trim().toLowerCase();
  if (!query) return SPECIES_LIST;
  return SPECIES_LIST.filter((species) => `${species.id} ${species.name} ${species.enName} ${species.types.join(' ')}`.toLowerCase().includes(query));
});
const playerTeam = computed(() => playerSpeciesIds.value.map(getSpecies));
const enemyTeam = computed(() => enemySpeciesIds.value.map(getSpecies));

function teamFor(side: 'player' | 'enemy'): number[] {
  return side === 'player' ? playerSpeciesIds.value : enemySpeciesIds.value;
}

function selectSide(side: 'player' | 'enemy'): void {
  activeSide.value = side;
}

function toggleSpecies(speciesId: number): void {
  const team = teamFor(activeSide.value);
  const index = team.indexOf(speciesId);
  if (index >= 0) {
    team.splice(index, 1);
    return;
  }
  if (team.length >= BATTLE_SANDBOX_MAX_TEAM_SIZE) return;
  team.push(speciesId);
}

function removeSpecies(side: 'player' | 'enemy', speciesId: number): void {
  const team = teamFor(side);
  const index = team.indexOf(speciesId);
  if (index >= 0) team.splice(index, 1);
}

function clearTeam(side: 'player' | 'enemy'): void {
  teamFor(side).splice(0);
}

function randomTeam(side: 'player' | 'enemy'): void {
  const candidates = [...SPECIES_LIST];
  const ids: number[] = [];
  while (ids.length < BATTLE_SANDBOX_MAX_TEAM_SIZE && candidates.length) {
    ids.push(candidates.splice(Math.floor(Math.random() * candidates.length), 1)[0]!.id);
  }
  const team = teamFor(side);
  team.splice(0, team.length, ...ids);
}

function syncHud(next: BattleSim): void {
  hudCombatants.value = next.state.combatants.map((combatant) => ({ ...combatant, cooldowns: { ...combatant.cooldowns } }));
}

function startBattle(): void {
  if (!canStart.value) return;
  const player = createBattleSandboxTeam(playerSpeciesIds.value);
  const enemy = createBattleSandboxTeam(enemySpeciesIds.value);
  const next = BattleSim.fromInstances({
    mode: 'pvp',
    player,
    enemy,
    deployment: 'simultaneous',
    isWild: false,
    speed: 1,
  });
  sim.value = next;
  presentation.value = presentationBridge.reset(next);
  cues.value = [];
  syncHud(next);
  simulationTime.value = 0;
  presentationCaughtUp = false;
  result.value = '';
  gpuUnavailable.value = null;
  running.value = true;
}

function resetToSetup(): void {
  running.value = false;
  sim.value = null;
  presentation.value = null;
  cues.value = [];
  hudCombatants.value = [];
  presentationBridge.reset();
  result.value = '';
  simulationTime.value = 0;
  presentationCaughtUp = false;
}

function updatePresentation(next: BattleSim, elapsedSeconds: number): void {
  const frame = presentationBridge.advance(next, elapsedSeconds);
  presentation.value = frame.presentation;
  cues.value = [...frame.cues];
  presentationCaughtUp = frame.isCaughtUp;
}

function frame(now: number): void {
  const elapsedSeconds = Math.min(0.05, Math.max(0, now - lastFrame) / 1000);
  lastFrame = now;
  const next = sim.value;
  if (next) {
    if (running.value && !next.isOver) next.tick(elapsedSeconds);
    updatePresentation(next, elapsedSeconds);
    syncHud(next);
    simulationTime.value = next.state.time;
    if (next.isOver && presentationCaughtUp && (gpuUnavailable.value || pixiRef.value?.isPresentationSettled())) {
      running.value = false;
      if (!result.value) result.value = next.state.winner === 'player' ? '我方胜利' : next.state.winner === 'enemy' ? '对方胜利' : '平局';
    }
  }
  raf = requestAnimationFrame(frame);
}

function onPixiReady(): void { gpuUnavailable.value = null; }
function onPixiUnavailable(message: string): void {
  gpuUnavailable.value = message;
  running.value = false;
}

watch(quality, () => { /* PixiBattleViewport reacts through its prop. */ });
onMounted(() => {
  lastFrame = performance.now();
  raf = requestAnimationFrame(frame);
});
onUnmounted(() => cancelAnimationFrame(raf));
</script>

<template>
  <section class="battle-sandbox">
    <header class="sandbox-header">
      <div>
        <p class="eyebrow">BATTLE ACCEPTANCE SANDBOX</p>
        <h1>自由战斗验收沙盒</h1>
        <p>无需登录、不会读写存档。双方各选 {{ BATTLE_SANDBOX_MIN_TEAM_SIZE }}～{{ BATTLE_SANDBOX_MAX_TEAM_SIZE }} 只，支持 1v1 至 3v3；每次开战都会重新随机生成满级野生式个体。</p>
      </div>
      <div class="sandbox-actions">
        <button v-if="sim" class="ghost" type="button" @click="resetToSetup">返回选队</button>
        <button v-if="sim" type="button" :class="running ? 'danger' : 'good'" @click="running = !running" :disabled="!!gpuUnavailable || !!result">{{ running ? '暂停' : '继续' }}</button>
        <button v-if="sim" class="gold" type="button" @click="startBattle">使用同一选择重新随机</button>
      </div>
    </header>

    <template v-if="!sim">
      <div class="team-row">
        <section class="team-panel" :class="{ active: activeSide === 'player' }" @click="selectSide('player')">
          <div class="team-heading"><div><span class="side-label player">我方</span><strong>{{ playerTeam.length }} / 3</strong></div><div><button class="sm ghost dark-ghost" type="button" @click.stop="randomTeam('player')">随机 3 只</button><button class="sm ghost dark-ghost" type="button" @click.stop="clearTeam('player')">清空</button></div></div>
          <div class="slots"><button v-for="species in playerTeam" :key="species.id" type="button" class="selected-species" @click.stop="removeSpecies('player', species.id)"><b>#{{ String(species.id).padStart(3, '0') }}</b> {{ species.name }} <span>×</span></button><span v-for="slot in Math.max(0, 3 - playerTeam.length)" :key="`player-empty-${slot}`" class="empty-slot">选择空位</span></div>
        </section>
        <div class="vs">VS<br><small>{{ playerTeam.length || 0 }}v{{ enemyTeam.length || 0 }}</small></div>
        <section class="team-panel enemy-panel" :class="{ active: activeSide === 'enemy' }" @click="selectSide('enemy')">
          <div class="team-heading"><div><span class="side-label enemy">对方</span><strong>{{ enemyTeam.length }} / 3</strong></div><div><button class="sm ghost dark-ghost" type="button" @click.stop="randomTeam('enemy')">随机 3 只</button><button class="sm ghost dark-ghost" type="button" @click.stop="clearTeam('enemy')">清空</button></div></div>
          <div class="slots"><button v-for="species in enemyTeam" :key="species.id" type="button" class="selected-species" @click.stop="removeSpecies('enemy', species.id)"><b>#{{ String(species.id).padStart(3, '0') }}</b> {{ species.name }} <span>×</span></button><span v-for="slot in Math.max(0, 3 - enemyTeam.length)" :key="`enemy-empty-${slot}`" class="empty-slot">选择空位</span></div>
        </section>
      </div>

      <section class="catalog panel">
        <div class="catalog-toolbar">
          <div><strong>正在为<span :class="activeSide">{{ activeSide === 'player' ? '我方' : '对方' }}</span>选队</strong><span class="muted tiny"> · 点击图鉴项加入；再次点击移除。单队最多 3 只。</span></div>
          <input v-model="search" type="search" placeholder="搜索编号、名称、英文名或属性" aria-label="搜索宝可梦">
        </div>
        <div class="species-grid">
          <button v-for="species in filteredSpecies" :key="species.id" class="species-choice" :class="{ selected: activeTeam.includes(species.id), disabled: !activeTeam.includes(species.id) && activeTeam.length >= 3 }" type="button" @click="toggleSpecies(species.id)">
            <span class="dex">#{{ String(species.id).padStart(3, '0') }}</span><b>{{ species.name }}</b><small>{{ species.types.join(' / ') }}</small>
          </button>
        </div>
      </section>

      <footer class="setup-footer">
        <label>环境 <select v-model="biome"><option value="grass">草原</option><option value="cave">洞窟</option><option value="water">水域</option><option value="dragon">龙穴</option><option value="arena">竞技场</option></select></label>
        <label>质量 <select v-model="quality"><option value="cinematic">cinematic</option><option value="standard">standard</option><option value="compatibility">compatibility</option></select></label>
        <span class="muted tiny">所选物种不进入图鉴、背包、队伍或战斗记录。</span>
        <button class="good start-button" type="button" :disabled="!canStart" @click="startBattle">开始 {{ playerTeam.length }}v{{ enemyTeam.length }} 满级随机战斗</button>
      </footer>
    </template>

    <template v-else>
      <div class="sandbox-battle">
        <div class="battle-meta"><span>环境：{{ biome }}</span><span>质量：{{ quality }}</span><span>模拟时间：{{ simulationTime.toFixed(1) }}s</span><span v-if="result" class="result">{{ result }}</span></div>
        <div class="arena">
          <PixiBattleViewport ref="pixiRef" :presentation="presentation ?? undefined" :cues="cues" :biome="biome" :quality="quality" @ready="onPixiReady" @unavailable="onPixiUnavailable" />
          <div v-if="gpuUnavailable" class="gpu-error">GPU 战斗渲染不可用：{{ gpuUnavailable }}</div>
        </div>
        <div class="combatant-summary">
          <div v-for="combatant in hudCombatants" :key="combatant.uid" :class="combatant.side"><b>{{ getSpecies(combatant.speciesId).name }}</b><span> Lv.{{ combatant.level }}</span><meter :value="combatant.currentHp" :max="combatant.maxHp"></meter><small>{{ Math.max(0, Math.ceil(combatant.currentHp)) }} / {{ combatant.maxHp }}</small></div>
        </div>
        <p class="sandbox-note">本局为内存中的验收模拟：不会奖励经验、触发捕捉、写入存档、修改正式阵容或影响任何账号数据。</p>
      </div>
    </template>
  </section>
</template>

<style scoped>
.battle-sandbox { min-height:100%; padding:24px 30px; overflow:auto; color:#eaf1fb; background:radial-gradient(circle at 50% -20%,#314c76 0,#142237 48%,#0c1523 100%); }
.sandbox-header { display:flex; gap:20px; align-items:flex-start; justify-content:space-between; margin-bottom:18px; }.sandbox-header h1 { margin:3px 0 7px; font-size:28px; }.sandbox-header p { margin:0; color:#bed0e7; max-width:790px; }.eyebrow { margin:0; color:#9be6ae!important; font-size:12px; letter-spacing:1.4px; font-weight:800; }.sandbox-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; }.dark-ghost { color:#44556d; border-color:#b7c4d3; }
.team-row { display:grid; grid-template-columns:1fr 80px 1fr; gap:14px; align-items:stretch; margin-bottom:15px; }.team-panel { min-height:126px; padding:14px; border:2px solid rgba(168,195,225,.35); border-radius:13px; background:rgba(11,22,38,.72); cursor:pointer; transition:border-color .15s,transform .15s; }.team-panel.active { border-color:#7cd8ff; transform:translateY(-2px); box-shadow:0 8px 25px rgba(59,167,230,.18); }.enemy-panel.active { border-color:#ffae9d; }.team-heading { display:flex; justify-content:space-between; gap:8px; align-items:center; }.team-heading > div:last-child { display:flex; gap:5px; }.side-label { display:inline-block; margin-right:7px; padding:3px 8px; border-radius:99px; font-size:12px; font-weight:800; }.side-label.player { background:#1767a1; }.side-label.enemy { background:#a64438; }.slots { display:flex; flex-wrap:wrap; gap:7px; margin-top:16px; }.selected-species { padding:7px 8px; background:#294968; color:#fff; border:1px solid #73c3ee; box-shadow:none; font-size:12px; }.enemy-panel .selected-species { background:#633b42; border-color:#e79383; }.selected-species span { margin-left:5px; color:#ffcfbe; }.empty-slot { display:inline-flex; align-items:center; min-width:112px; padding:7px 9px; border:1px dashed rgba(201,219,240,.45); color:#9fb2c9; border-radius:7px; font-size:12px; }.vs { align-self:center; text-align:center; color:#ffdd78; font-weight:900; font-size:21px; }.vs small { color:#b7c7dc; font-size:12px; }
.catalog { padding:13px; }.catalog-toolbar { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:10px; }.catalog-toolbar input { width:310px; padding:8px 10px; border:1px solid #bdc9d5; border-radius:7px; font:inherit; }.catalog-toolbar .player { color:#1576bd; }.catalog-toolbar .enemy { color:#bd4e40; }.species-grid { display:grid; grid-template-columns:repeat(6,1fr); gap:6px; max-height:355px; overflow:auto; padding-right:4px; }.species-choice { min-height:51px; padding:5px 7px; text-align:left; color:#2d3d52; background:#edf3f9; border:1px solid #c5d4e3; box-shadow:none; }.species-choice:hover:not(.disabled) { filter:brightness(.97); }.species-choice.selected { background:#d3f0ff; border-color:#3faee6; }.species-choice.disabled { opacity:.42; }.species-choice .dex { display:block; color:#667b91; font-size:10px; }.species-choice b { font-size:13px; }.species-choice small { display:block; color:#687a8c; font-size:10px; }
.setup-footer { display:flex; align-items:center; gap:13px; margin-top:15px; padding:11px 14px; border-radius:10px; background:rgba(7,16,29,.65); }.setup-footer label { font-weight:700; }.setup-footer select { margin-left:5px; padding:5px; border-radius:6px; }.start-button { margin-left:auto; }.sandbox-battle { display:flex; flex-direction:column; gap:10px; }.battle-meta { display:flex; flex-wrap:wrap; gap:12px; padding:9px 12px; border-radius:8px; background:rgba(5,14,25,.74); font-size:13px; }.battle-meta .result { color:#ffda75; font-weight:900; }.arena { position:relative; height:510px; overflow:hidden; border:1px solid #6285aa; border-radius:11px; background:#0b1725; }.gpu-error { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; padding:20px; text-align:center; color:#ffd3cc; background:rgba(34,8,8,.85); }.combatant-summary { display:grid; grid-template-columns:repeat(3,1fr); gap:7px; }.combatant-summary > div { display:grid; grid-template-columns:auto auto 1fr auto; align-items:center; gap:5px; padding:7px 9px; border-radius:7px; background:rgba(12,27,44,.82); font-size:12px; }.combatant-summary > div.enemy { background:rgba(58,25,31,.78); }.combatant-summary meter { width:100%; height:10px; }.combatant-summary small { white-space:nowrap; color:#d9e7f4; }.sandbox-note { margin:0; color:#aebfd2; font-size:12px; }
@media (max-width:900px) { .species-grid { grid-template-columns:repeat(4,1fr); }.team-row { grid-template-columns:1fr; }.vs { display:none; }.sandbox-header,.catalog-toolbar,.setup-footer { align-items:stretch; flex-direction:column; }.catalog-toolbar input { width:100%; }.start-button { margin-left:0; }.arena { height:440px; } }
</style>
