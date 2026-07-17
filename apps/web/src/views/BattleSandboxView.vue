<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { getSpecies, SKILL_MAP, SPECIES_LIST, TYPE_COLORS, type BattleEnvironmentId } from '@pokemon-online/config';
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
const actionFeed = ref<{ id: string; text: string; tone: 'player' | 'enemy' }[]>([]);
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
const playerCombatants = computed(() => hudCombatants.value.filter((combatant) => combatant.side === 'player'));
const enemyCombatants = computed(() => hudCombatants.value.filter((combatant) => combatant.side === 'enemy'));
const STATUS_TAG: Record<string, string> = { burn: '灼伤', poison: '中毒', paralyze: '麻痹', freeze: '冰冻', sleep: '睡眠', confuse: '混乱' };

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
  // The sandbox HUD follows the same delayed presentation snapshot as Pixi so
  // HP, cast bars and positions describe the frame the player is watching,
  // never a future BattleSim result.
  const source = presentation.value?.combatants ?? next.state.combatants;
  hudCombatants.value = source.map((combatant) => ({ ...combatant, cooldowns: { ...combatant.cooldowns } }));
}

function hpPercent(combatant: BattleCombatant): number {
  return Math.max(0, Math.min(100, combatant.currentHp / combatant.maxHp * 100));
}
function hpColor(combatant: BattleCombatant): string {
  const ratio = hpPercent(combatant);
  return ratio > 50 ? '#58d988' : ratio > 20 ? '#ffc95a' : '#ff766d';
}
function skillName(skillId: string | undefined): string {
  if (!skillId) return '普通攻击';
  return SKILL_MAP[skillId]?.name ?? (skillId === '__normal__' ? '普通攻击' : skillId);
}
function castPercent(combatant: BattleCombatant): number {
  const cast = combatant.castProgress;
  if (!cast) return 0;
  const total = SKILL_MAP[cast.skillId]?.castTime ?? 0;
  return total > 0 ? Math.max(0, Math.min(100, Math.round((1 - cast.remaining / total) * 100))) : 100;
}
function skillChips(combatant: BattleCombatant): { id: string; label: string; cd: number; color: string }[] {
  return [
    ...combatant.activeSkills.map((id) => ({ id, label: skillName(id).slice(0, 1), cd: combatant.cooldowns[id] ?? 0, color: TYPE_COLORS[SKILL_MAP[id]?.type ?? 'normal'] ?? '#8fa3b8' })),
    { id: '__normal__', label: '普', cd: combatant.normalAttackCd, color: '#79879a' },
  ];
}
function rememberAction(next: BattleSim, frame: { cues: readonly DirectedBattleCue[] }): void {
  for (const directed of frame.cues) {
    const cue = directed.cue;
    if (cue.type !== 'animation' || !['windup', 'melee', 'projectile', 'beam', 'burst', 'cast'].includes(cue.animation)) continue;
    const actor = next.state.combatants.find((combatant) => combatant.uid === cue.subjectId);
    if (!actor || actionFeed.value.some((entry) => entry.id === directed.id)) continue;
    const phase = cue.animation === 'windup' ? (cue.skillId !== '__normal__' && SKILL_MAP[cue.skillId ?? '']?.castTime ? '蓄力' : '准备') : cue.animation === 'beam' ? '持续施法' : '施放';
    actionFeed.value.unshift({ id: directed.id, tone: actor.side, text: `${actor.name} ${phase} · ${skillName(cue.skillId)}` });
  }
  actionFeed.value = actionFeed.value.slice(0, 4);
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
  actionFeed.value = [];
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
  actionFeed.value = [];
  presentationBridge.reset();
  result.value = '';
  simulationTime.value = 0;
  presentationCaughtUp = false;
}

function updatePresentation(next: BattleSim, elapsedSeconds: number): void {
  const frame = presentationBridge.advance(next, elapsedSeconds);
  presentation.value = frame.presentation;
  cues.value = [...frame.cues];
  rememberAction(next, frame);
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
    simulationTime.value = presentation.value?.time ?? next.state.time;
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
        <div class="battle-meta"><span>环境：{{ biome }}</span><span>质量：{{ quality }}</span><span>演绎时间：{{ simulationTime.toFixed(1) }}s</span><span v-if="result" class="result">{{ result }}</span></div>
        <div class="sandbox-stage">
          <aside class="sandbox-side player">
            <header>我方状态</header>
            <article v-for="combatant in playerCombatants" :key="combatant.uid" class="sandbox-mon" :class="{ fainted: !combatant.alive, casting: !!combatant.castProgress }">
              <div class="mon-line"><b>{{ combatant.name }}</b><span>Lv.{{ combatant.level }}</span></div>
              <div class="hp-track"><span :style="{ width: `${hpPercent(combatant)}%`, background: hpColor(combatant) }"></span></div>
              <small>{{ Math.max(0, Math.ceil(combatant.currentHp)) }} / {{ combatant.maxHp }}</small>
              <div class="mon-detail"><span v-for="skill in skillChips(combatant)" :key="skill.id" class="skill-chip" :class="{ ready: skill.cd <= 0 }" :style="{ '--skill-color': skill.color }">{{ skill.cd > 0 ? Math.ceil(skill.cd) : skill.label }}</span><em v-if="combatant.status" class="status-tag">{{ STATUS_TAG[combatant.status] }}</em></div>
              <div v-if="combatant.castProgress" class="cast-readout">蓄力 · {{ skillName(combatant.castProgress.skillId) }} {{ castPercent(combatant) }}%</div>
              <div v-if="combatant.castProgress" class="cast-track"><span :style="{ width: `${castPercent(combatant)}%` }"></span></div>
            </article>
          </aside>
          <div class="arena">
            <PixiBattleViewport ref="pixiRef" :presentation="presentation ?? undefined" :cues="cues" :biome="biome" :quality="quality" @ready="onPixiReady" @unavailable="onPixiUnavailable" />
            <div class="action-feed" aria-live="polite"><span v-for="action in actionFeed" :key="action.id" :class="action.tone">{{ action.text }}</span></div>
            <div v-if="gpuUnavailable" class="gpu-error">GPU 战斗渲染不可用：{{ gpuUnavailable }}</div>
          </div>
          <aside class="sandbox-side enemy">
            <header>敌方状态</header>
            <article v-for="combatant in enemyCombatants" :key="combatant.uid" class="sandbox-mon" :class="{ fainted: !combatant.alive, casting: !!combatant.castProgress }">
              <div class="mon-line"><b>{{ combatant.name }}</b><span>Lv.{{ combatant.level }}</span></div>
              <div class="hp-track"><span :style="{ width: `${hpPercent(combatant)}%`, background: hpColor(combatant) }"></span></div>
              <small>{{ Math.max(0, Math.ceil(combatant.currentHp)) }} / {{ combatant.maxHp }}</small>
              <div class="mon-detail"><span v-for="skill in skillChips(combatant)" :key="skill.id" class="skill-chip" :class="{ ready: skill.cd <= 0 }" :style="{ '--skill-color': skill.color }">{{ skill.cd > 0 ? Math.ceil(skill.cd) : skill.label }}</span><em v-if="combatant.status" class="status-tag">{{ STATUS_TAG[combatant.status] }}</em></div>
              <div v-if="combatant.castProgress" class="cast-readout">蓄力 · {{ skillName(combatant.castProgress.skillId) }} {{ castPercent(combatant) }}%</div>
              <div v-if="combatant.castProgress" class="cast-track"><span :style="{ width: `${castPercent(combatant)}%` }"></span></div>
            </article>
          </aside>
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
.setup-footer { display:flex; align-items:center; gap:13px; margin-top:15px; padding:11px 14px; border-radius:10px; background:rgba(7,16,29,.65); }.setup-footer label { font-weight:700; }.setup-footer select { margin-left:5px; padding:5px; border-radius:6px; }.start-button { margin-left:auto; }.sandbox-battle { display:flex; flex-direction:column; gap:10px; }.battle-meta { display:flex; flex-wrap:wrap; gap:12px; padding:9px 12px; border-radius:8px; background:rgba(5,14,25,.74); font-size:13px; }.battle-meta .result { color:#ffda75; font-weight:900; }
.sandbox-stage { display:grid; grid-template-columns:184px minmax(0,1fr) 184px; gap:10px; min-height:560px; }.arena { position:relative; min-height:560px; overflow:hidden; border:2px solid #6285aa; border-radius:12px; background:#0b1725; box-shadow:inset 0 0 50px rgba(7,16,34,.45); }.gpu-error { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; padding:20px; text-align:center; color:#ffd3cc; background:rgba(34,8,8,.85); }.sandbox-side { display:flex; flex-direction:column; gap:8px; padding:9px; border:1px solid rgba(146,181,215,.38); border-radius:11px; background:rgba(6,17,31,.84); }.sandbox-side > header { padding:3px 5px; color:#9bdcff; font-weight:900; letter-spacing:.8px; }.sandbox-side.enemy > header { color:#ffb2a7; text-align:right; }.sandbox-mon { padding:9px; border:1px solid rgba(154,189,222,.32); border-radius:8px; background:rgba(16,37,58,.86); }.sandbox-mon.casting { border-color:#ffe187; box-shadow:0 0 14px rgba(255,214,92,.23); }.sandbox-mon.fainted { opacity:.46; filter:grayscale(.7); }.mon-line { display:flex; justify-content:space-between; gap:5px; font-size:12px; }.mon-line span,.sandbox-mon small { color:#b8cce0; font-size:11px; }.hp-track { height:8px; overflow:hidden; margin:7px 0 3px; border-radius:99px; background:#07111e; }.hp-track span { display:block; height:100%; border-radius:inherit; transition:width .18s linear; }.mon-detail { display:flex; align-items:center; flex-wrap:wrap; gap:4px; margin-top:7px; }.skill-chip { display:inline-grid; place-items:center; width:21px; height:21px; border-radius:5px; color:#56687b; background:#1b2938; border:1px solid #344a5f; font-size:10px; font-style:normal; font-weight:900; }.skill-chip.ready { color:#fff; background:var(--skill-color); border-color:rgba(255,255,255,.72); }.status-tag { padding:3px 5px; color:#ffdfb3; border-radius:4px; background:#733c60; font-size:10px; font-style:normal; }.cast-readout { margin-top:7px; color:#ffe18c; font-size:11px; font-weight:800; }.cast-track { height:4px; overflow:hidden; margin-top:4px; border-radius:99px; background:#07111e; }.cast-track span { display:block; height:100%; border-radius:inherit; background:linear-gradient(90deg,#ff9d56,#ffe18c,#fff3bd); box-shadow:0 0 8px rgba(255,222,128,.72); transition:width .08s linear; }.action-feed { position:absolute; z-index:2; top:12px; left:50%; display:flex; flex-direction:column; gap:4px; width:min(72%,430px); transform:translateX(-50%); pointer-events:none; }.action-feed span { padding:5px 10px; border-radius:7px; color:#f6fbff; background:rgba(4,14,27,.72); border:1px solid rgba(204,227,246,.25); text-align:center; font-size:12px; font-weight:700; text-shadow:0 1px 2px #000; }.action-feed .player { border-color:rgba(99,197,255,.7); }.action-feed .enemy { border-color:rgba(255,147,133,.7); }.sandbox-note { margin:0; color:#aebfd2; font-size:12px; }
@media (max-width:1050px) { .sandbox-stage { grid-template-columns:145px minmax(0,1fr) 145px; }.sandbox-side { padding:6px; }.sandbox-mon { padding:7px; } } @media (max-width:820px) { .species-grid { grid-template-columns:repeat(4,1fr); }.team-row,.sandbox-stage { grid-template-columns:1fr; }.vs { display:none; }.sandbox-header,.catalog-toolbar,.setup-footer { align-items:stretch; flex-direction:column; }.catalog-toolbar input { width:100%; }.start-button { margin-left:0; }.sandbox-stage { min-height:0; }.arena { min-height:430px; order:-1; }.sandbox-side { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); }.sandbox-side > header { grid-column:1 / -1; }.sandbox-side.enemy > header { text-align:left; } }
</style>
