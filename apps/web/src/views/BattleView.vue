<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useBattleStore } from '../stores/battle.ts';
import { useGameStore } from '../stores/game.ts';
import { getSpecies, SKILL_MAP, PERSONALITY_MAP, BATTLE_HUD, isGpuWorldMapId, type BattleEnvironmentId } from '@pokemon-online/config';
import { defeatExpYield, maxHp, type BattleSim } from '@pokemon-online/engine';
import type { BattleCombatant, PokemonInstance } from '@pokemon-online/shared';
import type { ExpGainResult } from '../stores/game.ts';
import PokemonSprite from '../components/PokemonSprite.vue';
import TypeBadge from '../components/TypeBadge.vue';
import BattleCombatantCard from '../components/BattleCombatantCard.vue';
import PixiBattleViewport from '../components/PixiBattleViewport.vue';
import type { BattlePresentation, DirectedBattleCue } from '@pokemon-online/presentation';
import { BattlePresentationBridge } from '../game/BattlePresentationBridge.ts';
import { consumeBattleVisualTransition, requestWorldReturnVisualTransition } from '../game/SceneVisualTransition.ts';
import { contributionSummary, roleLabel, tacticPresentation } from '../battle/CombatInsights.ts';

const battle = useBattleStore();
const game = useGameStore();
const router = useRouter();
const enteredFromGpuWorld = consumeBattleVisualTransition();
const savedSpeed = game.save?.settings.battleSpeed ?? 1;
const speed = ref([1, 2, 3].includes(savedSpeed) ? savedSpeed : 1);
const running = ref(true);
const ended = ref(false);
const skipped = ref(false);
const resultMsg = ref('');
const expResults = ref<ExpGainResult[]>([]);
const totalExp = ref(0);
const pixiRef = ref<InstanceType<typeof PixiBattleViewport> | null>(null);
// BattleStage is the only gameplay renderer for wild and PvP battles.
const gpuUnavailable = ref<string | null>(null);
const pixiStatus = ref(enteredFromGpuWorld && isGpuWorldMapId(enteredFromGpuWorld.mapId) ? 'GPU world-to-battle transition' : '正在初始化 GPU battle renderer…');
const returningToWorld = ref(false);
let raf = 0;

const sim = computed<BattleSim | null>(() => battle.sim);
function onPixiReady(): void {
  if (battle.phase === 'loading') battle.assetsReady = true;
  gpuUnavailable.value = null;
  pixiStatus.value = 'GPU 标准品质 renderer';
}
function onPixiUnavailable(message: string): void {
  gpuUnavailable.value = message;
  pixiStatus.value = `GPU 战斗渲染不可用：${message}`;
}
function activeRendererSettled(): boolean {
  return !!gpuUnavailable.value || (pixiRef.value?.isPresentationSettled() ?? false);
}
// skill-cast avatar flash: uid -> intensity 0..1, set to 1 on a 'skill' event,
// decays each frame. Reset when a new battle (sim) starts.
const skillFlash = ref<Record<string, number>>({});
const interruptFlash = ref<Record<string, number>>({});
const presentationBridge = new BattlePresentationBridge();
const presentation = ref<BattlePresentation | null>(null);
// The Pixi stage needs the full presentation cadence; side cards and the combat log
// do not. Keep DOM/reactivity updates at 12fps to avoid six cards re-rendering
// for every animation frame.
const hudCombatants = ref<BattleCombatant[]>([]);
const hudTime = ref(0);
const battleLog = ref<string[]>([]);
const hudOver = ref(false);
let nextHudSyncAt = 0;
let presentationCaughtUp = false;
const presentationCues = ref<DirectedBattleCue[]>([]);

watch(sim, (next) => {
  presentation.value = presentationBridge.reset(next ?? undefined);
  presentationCaughtUp = false;
  presentationCues.value = [];
  skillFlash.value = {};
  interruptFlash.value = {};
  nextHudSyncAt = 0;
  if (next) syncHud(next);
}, { immediate: true });
function avatarStyle(uid: string): Record<string, string> {
  const f = skillFlash.value[uid] ?? 0;
  if (f <= 0) return {};
  return {
    filter: `brightness(${1 + f * 1.3}) drop-shadow(0 0 ${f * 8}px rgba(255,255,255,${f * 0.8}))`,
    transform: `scale(${1 + f * 0.14})`,
  };
}
function interruptVal(uid: string): number { return interruptFlash.value[uid] ?? 0; }
// The Pixi stage receives every presentation frame. HUD data is sampled separately
// so text, cooldown chips and battle-log DOM do not chase the 60fps canvas loop.
const playerComs = computed(() => hudCombatants.value.filter((c) => c.side === 'player'));
const enemyComs = computed(() => hudCombatants.value.filter((c) => c.side === 'enemy'));
const log = computed<string[]>(() => battleLog.value);
const isOver = computed(() => hudOver.value);

interface SideDamageSummary {
  side: 'player' | 'enemy';
  total: number;
  dps: number;
  members: {
    uid: string; name: string; role: string; roleLabel: string; contribution: string;
    damage: number; dps: number; share: number;
    damageTaken: number; healing: number; shield: number; control: number;
    interrupts: number; knockouts: number; basicDamage: number; skillDamage: number;
    casts: number; basicCasts: number; hits: number; misses: number;
    topSkills: { id: string; name: string; damage: number; casts: number; hits: number; misses: number }[];
  }[];
}

const damageSummary = computed<SideDamageSummary[]>(() => {
  const s = sim.value;
  if (!s) return [];
  const duration = Math.max(0.1, s.state.time);
  return (['player', 'enemy'] as const).map((side) => {
    const members = s.state.combatants.filter((c) => c.side === side).map((c) => {
      const role = getSpecies(c.speciesId).combatRole;
      const input = { role, damage: c.damageDealt, damageTaken: c.damageTaken, healing: c.healingDone, shield: c.shieldAbsorbed, control: c.controlSeconds, interrupts: c.interrupts, knockouts: c.knockouts };
      return {
        uid: c.uid, name: c.name, role: role ?? 'unassigned', roleLabel: roleLabel(role), contribution: contributionSummary(input),
        damage: c.damageDealt, dps: c.damageDealt / duration, share: 0,
        damageTaken: c.damageTaken, healing: c.healingDone, shield: c.shieldAbsorbed,
        control: c.controlSeconds, interrupts: c.interrupts, knockouts: c.knockouts,
      basicDamage: c.basicDamage, skillDamage: c.skillDamage,
      casts: c.skillCasts, basicCasts: c.basicCasts, hits: c.hits, misses: c.misses,
      topSkills: Object.entries(c.skillStats).map(([id, stat]) => ({ id, name: id === '__normal__' ? '普通攻击' : (SKILL_MAP[id]?.name ?? id), ...stat }))
          .filter((skill) => skill.casts > 0 || skill.damage > 0).sort((a, b) => b.damage - a.damage || b.casts - a.casts).slice(0, 2),
      };
    });
    const total = members.reduce((sum, member) => sum + member.damage, 0);
    for (const member of members) member.share = total > 0 ? member.damage / total : 0;
    members.sort((a, b) => b.damage - a.damage || a.name.localeCompare(b.name, 'zh-CN'));
    return { side, total, dps: total / duration, members };
  });
});
function hitRate(member: SideDamageSummary['members'][number]): string {
  const total = member.hits + member.misses;
  return total > 0 ? `${Math.round(member.hits / total * 100)}%` : '—';
}
const battleDuration = computed(() => sim.value?.state.time ?? 0);
const playerTactic = computed(() => tacticPresentation(sim.value?.state.teamTactics.player));
const enemyTactic = computed(() => tacticPresentation(sim.value?.state.teamTactics.enemy));

function syncHud(s: BattleSim): void {
  hudCombatants.value = presentation.value?.combatants ?? s.state.combatants;
  hudTime.value = presentation.value?.time ?? s.state.time;
  battleLog.value = (presentation.value?.events ?? []).map((event) => event.message).filter((message): message is string => !!message);
  hudOver.value = s.isOver && presentationCaughtUp;
}

const biome = computed<BattleEnvironmentId>(() => {
  if (battle.mode === 'pvp') return 'arena';
  return 'grass';
});
function skillName(id: string | undefined): string {
  if (!id) return '';
  return SKILL_MAP[id]?.name ?? (id === '__normal__' ? '普通攻击' : id);
}
function instanceName(uid: string): string {
  const inst = game.getInstance(uid);
  return inst?.nickname || (inst ? getSpecies(inst.speciesId).name : '?');
}

function updatePresentation(s: BattleSim, dtScaled: number, visualSeconds: number): void {
  const frame = presentationBridge.advance(s, dtScaled, visualSeconds);
  presentation.value = frame.presentation;
  presentationCues.value = [...frame.cues];
  presentationCaughtUp = frame.isCaughtUp;
  // Health/control changes are event-driven; other HUD details keep their 12fps budget.
  if (frame.newEvents.some((event) => event.health || event.control || event.type === 'faint')) syncHud(s);
  processPresentationEvents(frame.newEvents);
}

function processPresentationEvents(events: readonly import('@pokemon-online/shared').BattleEvent[]): void {
  for (const event of events) {
    if (event.type === 'skill' && event.actor) skillFlash.value[event.actor] = 1;
    if (event.vfx?.kind === 'cast' && event.actor) delete interruptFlash.value[event.actor];
    if (event.vfx?.kind === 'interrupt' && event.actor) interruptFlash.value[event.actor] = BATTLE_HUD.interruptNoticeSeconds;
  }
}

function frame(now: number): void {
  const realDt = Math.min(0.05, (now - (frame as unknown as { last?: number }).last!) / 1000);
  (frame as unknown as { last?: number }).last = now;
  const s = sim.value;
  if (s && battle.phase === 'fighting' && !ended.value) {
    const dtScaled = running.value ? realDt * speed.value : 0;
    // Authoritative simulation is intentionally never slowed for spectacle.
    if (!s.isOver && running.value) {
      s.tick(dtScaled);
    }
    updatePresentation(s, dtScaled, realDt);
    if (now >= nextHudSyncAt) {
      syncHud(s);
      nextHudSyncAt = now + 1000 / 12;
    }
    for (const k of Object.keys(skillFlash.value)) {
      const v = skillFlash.value[k] - realDt * 5;
      if (v <= 0) delete skillFlash.value[k]; else skillFlash.value[k] = v;
    }
    for (const k of Object.keys(interruptFlash.value)) {
      const v = interruptFlash.value[k] - realDt;
      if (v <= 0) delete interruptFlash.value[k]; else interruptFlash.value[k] = v;
    }
  }
  // Do not cover the canvas the instant the simulator decides a winner. The
  // final delayed event (especially a KO burst/faint) must finish its local VFX
  // before the result modal becomes visible.
  if (s && battle.phase === 'fighting' && s.isOver && !ended.value && presentationCaughtUp && activeRendererSettled()) onEnd();
  if (!ended.value) raf = requestAnimationFrame(frame);
}
function onEnd(): void {
  const s = sim.value;
  if (s) syncHud(s);
  ended.value = true;
  running.value = false;
  if (!s) return;
  if (battle.mode === 'pve') handlePveEnd(s.state.winner);
  else handlePvpEnd(s.state.winner);
}

function handlePveEnd(winner: 'player' | 'enemy' | 'draw' | undefined): void {
  const group = battle.wild;
  if (winner === 'player' && group.length) {
    // sum EXP over the whole defeated wild group; all deployed PVE pokemon
    // fought simultaneously, so each gets the full share (no bench).
    let total = 0;
    for (const w of group) { total += defeatExpYield(w, 'pve'); game.see(w.speciesId); }
    totalExp.value = total;
    expResults.value = battle.grantVictoryExp(total);
    resultMsg.value = '胜利！';
  } else {
    resultMsg.value = '你的宝可梦倒下了…';
  }
}

function handlePvpEnd(winner: 'player' | 'enemy' | 'draw' | undefined): void {
  if (winner === 'player') {
    const oppLevel = sim.value?.state.combatants.filter((c) => c.side === 'enemy').reduce((s, c) => s + c.level, 0) ?? 0;
    const total = Math.max(20, Math.floor(oppLevel * 5));
    totalExp.value = total;
    expResults.value = battle.grantVictoryExp(total);
    resultMsg.value = `切磋胜利！击败了 ${battle.opponentName} 的队伍`;
  } else if (winner === 'enemy') {
    resultMsg.value = `切磋失利…${battle.opponentName} 的队伍更强一筹`;
  } else {
    resultMsg.value = '平局';
  }
}

function capture(uid: string): void {
  if (returningToWorld.value) return;
  if (game.rosterFull) return; // button is disabled; guard anyway
  const wild = battle.wild.find((w) => w.uid === uid);
  if (wild) {
    wild.currentHp = maxHp(wild);
    wild.status = null;
    wild.origin = 'caught';
    wild.caughtAt = Date.now();
    wild.caughtMapId = battle.mapId;
    game.addCaughtInstance(wild);
  }
  finalize(wild);
}

function releaseAll(): void {
  if (returningToWorld.value) return;
  for (const w of battle.wild) {
    const e = game.save!.pokedex[w.speciesId];
    if (e) e.released = true;
  }
  finalize(undefined);
}

async function returnToWorld(): Promise<void> {
  if (returningToWorld.value) return;
  returningToWorld.value = true;
  if (!gpuUnavailable.value && battle.mapId && isGpuWorldMapId(battle.mapId)) {
    await pixiRef.value?.playTransition({ kind: 'biome-crossfade', durationMs: 240, color: '#0b2430' });
    requestWorldReturnVisualTransition({ mapId: battle.mapId });
  }
  battle.clear();
  await router.replace({ name: 'world' });
}

async function finalize(caught: PokemonInstance | undefined): Promise<void> {
  game.recordBattle({
    win: sim.value?.state.winner === 'player',
    expGained: totalExp.value,
    caught,
    log: log.value,
  });
  game.healAll(); // auto full-heal entire roster after battle (frozen design)
  void game.persist(true);
  await returnToWorld();
}

async function leave(): Promise<void> {
  if (returningToWorld.value) return;
  game.recordBattle({
    win: sim.value?.state.winner === 'player',
    expGained: totalExp.value,
    log: log.value,
    opponent: battle.opponentName,
  });
  game.healAll();
  void game.persist(true);
  await returnToWorld();
}

function skip(): void {
  const s = sim.value;
  if (!s || ended.value || battle.phase !== 'fighting') return;
  if (!s.isOver) s.resolve(180);
  // Skip omits remaining choreography, including while paused. Publish the
  // authoritative final snapshot and dispose the visual work being skipped.
  const final = presentationBridge.reset(s);
  presentation.value = final ? { ...final, time: s.state.time, events: [...s.state.events] } : null;
  presentationCues.value = [];
  presentationCaughtUp = true;
  skipped.value = true;
  onEnd();
}

onMounted(() => {
  if (!sim.value) { router.replace({ name: 'world' }); return; }
  (frame as unknown as { last?: number }).last = performance.now();
  raf = requestAnimationFrame(frame);
});
onUnmounted(() => cancelAnimationFrame(raf));

const wildGroup = computed<PokemonInstance[]>(() => battle.wild);
const showCapture = computed(() => ended.value && battle.mode === 'pve' && sim.value?.state.winner === 'player' && wildGroup.value.length > 0);
</script>

<template>
  <div class="battle" v-if="sim" :class="{ 'entering-battle': battle.phase === 'loading' }">
    <div class="battle-toolbar" v-if="battle.phase === 'fighting'">
      <span class="bold tiny">{{ running ? '自动战斗中' : ended ? '战斗结束' : '战斗已暂停' }}</span>
      <div class="arena-controls">
        <button class="sm ghost" :disabled="ended" @click="speed = speed === 1 ? 2 : speed === 2 ? 3 : 1">{{ speed }}x</button>
        <button class="sm ghost" :disabled="ended" @click="running = !running">{{ running ? '暂停' : '继续' }}</button>
        <button class="sm ghost" :disabled="ended" @click="skip">跳过</button>
      </div>
    </div>
    <div class="battle-row">
      <!-- Player HUD floats over the full-window battlefield. -->
      <div class="side-panel player-side">
        <div class="side-label">我方</div>
        <BattleCombatantCard v-for="c in playerComs" :key="c.uid" :combatant="c" :time="hudTime" :interrupted="interruptVal(c.uid) > 0" :avatar-style="avatarStyle(c.uid)" />
      </div>

      <!-- ARENA -->
      <div class="arena" :class="{ over: isOver }">
        <PixiBattleViewport v-if="!skipped" ref="pixiRef" :presentation="presentation ?? undefined" :cues="presentationCues" :biome="biome" require-assets @ready="onPixiReady" @unavailable="onPixiUnavailable" />
        <div v-if="gpuUnavailable" class="gpu-unavailable">GPU 战斗渲染不可用：{{ gpuUnavailable }}</div>
        <div class="tactic-ribbon player" v-if="playerTactic" :class="playerTactic.tone" :title="playerTactic.description"><span>我方 · {{ playerTactic.label }}</span><small>{{ playerTactic.description }}</small></div>
        <div class="tactic-ribbon enemy" v-if="enemyTactic" :class="enemyTactic.tone" :title="enemyTactic.description"><span>敌方 · {{ enemyTactic.label }}</span><small>{{ enemyTactic.description }}</small></div>
      </div>

      <!-- Enemy HUD shares the opposite screen edge. -->
      <div class="side-panel enemy-side">
        <div class="side-label">敌方</div>
        <BattleCombatantCard v-for="c in enemyComs" :key="c.uid" :combatant="c" :time="hudTime" :interrupted="interruptVal(c.uid) > 0" :avatar-style="avatarStyle(c.uid)" />
      </div>
    </div>

    <div class="modal-backdrop" v-if="ended">
      <div class="modal battle-result" role="dialog" aria-modal="true" aria-label="战斗结算">
        <h2 class="h-title center">{{ resultMsg }}</h2>
        <details v-if="damageSummary.length" class="damage-report" open>
          <summary>伤害统计 · 战斗 {{ battleDuration.toFixed(1) }} 秒</summary>
          <div class="damage-sides">
            <section v-for="summary in damageSummary" :key="summary.side" class="damage-side" :class="summary.side">
              <div class="damage-side-head">
                <span>{{ summary.side === 'player' ? '我方' : '敌方' }}</span>
                <strong>{{ summary.total }} 伤害</strong>
                <span>{{ summary.dps.toFixed(1) }} DPS</span>
              </div>
              <div v-for="(member, rank) in summary.members" :key="member.uid" class="damage-member">
                <div class="damage-member-top">
                  <span class="damage-rank">{{ rank + 1 }}</span>
                  <span class="ell">{{ member.name }}</span>
                  <b>{{ member.damage }}</b><small>{{ member.dps.toFixed(1) }}/s</small>
                </div>
                <div class="contribution-line"><span class="role-pill">{{ member.roleLabel }}</span><span>{{ member.contribution }}</span></div>
                <div class="damage-bar"><span :style="{ width: `${Math.round(member.share * 100)}%` }"></span></div>
                <div class="recap-metrics">
                  <span>基础 {{ member.basicDamage }}</span><span>技 {{ member.skillDamage }}</span>
                  <span>承 {{ member.damageTaken }}</span><span>疗 {{ member.healing }}</span>
                  <span v-if="member.shield">盾 {{ member.shield }}</span><span v-if="member.control">控 {{ member.control.toFixed(1) }}s</span>
                  <span v-if="member.interrupts">断 {{ member.interrupts }}</span><span v-if="member.knockouts">击倒 {{ member.knockouts }}</span>
                  <span>命中 {{ hitRate(member) }}</span>
                </div>
                <div v-if="member.topSkills.length" class="recap-skills">
                  <span v-for="skill in member.topSkills" :key="skill.id">{{ skill.name }} {{ skill.damage }}伤 / {{ skill.casts }}次</span>
                </div>
              </div>
            </section>
          </div>
        </details>
        <details v-if="log.length" class="result-log">
          <summary>查看战斗日志（{{ log.length }} 条）</summary>
          <div class="result-log-list"><div v-for="(entry, i) in log" :key="i">{{ entry }}</div></div>
        </details>
        <template v-if="showCapture">
          <p class="tiny center muted">击败了 {{ wildGroup.length }} 只宝可梦！可选择捕捉其中一只，或全部放生（放生保留图鉴记录）。战斗结束自动回满状态。</p>
          <div class="wild-list">
            <div v-for="w in wildGroup" :key="w.uid" class="wild-entry">
              <PokemonSprite :species-id="w.speciesId" :size="64" />
              <div class="grow">
                <div class="bold">{{ getSpecies(w.speciesId).name }}</div>
                <div class="row center" style="gap:4px">
                  <TypeBadge v-for="t in getSpecies(w.speciesId).types" :key="t" :type="t" size="sm" />
                </div>
                <div class="tiny muted">Lv.{{ w.level }} · {{ PERSONALITY_MAP[w.personality ?? 'cool']?.name }}型</div>
              </div>
              <button class="gold sm" :disabled="game.rosterFull" @click="capture(w.uid)">捕捉</button>
            </div>
          </div>
          <div v-if="expResults.length" class="exp-list">
            <div v-for="r in expResults" :key="r.uid" class="tiny">
              {{ instanceName(r.uid) }}：
              <span v-if="r.toLevel>r.fromLevel">Lv.{{ r.fromLevel }} -> Lv.{{ r.toLevel }} 🎉</span>
              <span v-else>获得经验</span>
              <span v-if="r.learnedSkills.length"> · 学会了 {{ r.learnedSkills.map(skillName).join('、') }}</span>
            </div>
          </div>
          <p v-if="game.rosterFull" class="tiny center" style="color:var(--bad)">携带已达上限({{ game.ROSTER_MAX }})，无法捕捉，请先放生再捕捉。</p>
          <div class="row" style="margin-top:12px">
            <button class="danger grow" @click="releaseAll">全部放生</button>
          </div>
        </template>
        <template v-else>
          <p class="tiny center muted">战斗结束，队伍已自动回满状态。</p>
          <div v-if="expResults.length" class="exp-list" style="margin:10px 0">
            <div v-for="r in expResults" :key="r.uid" class="tiny">
              {{ instanceName(r.uid) }}：
              <span v-if="r.toLevel>r.fromLevel">Lv.{{ r.fromLevel }} -> Lv.{{ r.toLevel }} 🎉</span>
              <span v-else>获得经验</span>
            </div>
          </div>
          <button class="gold" style="width:100%;margin-top:8px" @click="leave">返回</button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.battle { position:relative; width:100%; height:100%; isolation:isolate; }
.entering-battle .side-panel, .entering-battle .tactic-ribbon { visibility:hidden; }
.wild-list { display:flex; flex-direction:column; gap:6px; margin:10px 0; }
.wild-entry { display:flex; align-items:center; gap:10px; background: var(--panel-2); border-radius: 8px; padding: 6px 8px; }

.battle-row { position:absolute; inset:0; pointer-events:none; }
.side-panel { position:absolute; top:88px; z-index:5; width:clamp(252px,19vw,292px); max-height:calc(100% - 112px); display:flex; flex-direction:column; gap:8px; overflow-y:auto; pointer-events:auto; }
.player-side { left:24px; }.enemy-side { right:24px; }
.side-label { font-size:12px; font-weight:800; padding:2px 6px; letter-spacing:1px; text-shadow:0 1px 5px #142537; }
.player-side .side-label { color:#8acfff; }
.enemy-side .side-label { color:#ff9b9b; }

.arena {
  position:absolute; inset:0; background:#0e1626; overflow:hidden; pointer-events:auto;
}
.arena.over { filter: brightness(.85); }
.gpu-unavailable { position:absolute; inset:0; z-index:6; display:grid; place-items:center; padding:24px; text-align:center; color:#ffe4a6; background:rgba(8,13,24,.88); border:1px solid rgba(255,203,5,.35); }
.tactic-ribbon { position:absolute; left:50%; transform:translateX(-50%); z-index:4; min-width:132px; max-width:calc(100% - 18px); padding:4px 8px; border-radius:7px; text-align:center; pointer-events:none; color:#fff; text-shadow:0 1px 2px rgba(0,0,0,.45); box-shadow:0 2px 8px rgba(0,0,0,.28); background:rgba(62,78,108,.88); }
.tactic-ribbon.player { top:24px; }.tactic-ribbon.enemy { bottom:24px; }
.tactic-ribbon span { display:block; font-size:10px; font-weight:900; letter-spacing:.4px; }.tactic-ribbon small { display:block; max-width:230px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:8px; opacity:.92; }
.tactic-ribbon.finish { background:rgba(196,78,64,.91); }.tactic-ribbon.protect { background:rgba(57,119,191,.91); }.tactic-ribbon.pressure { background:rgba(143,80,176,.91); }.tactic-ribbon.split { background:rgba(62,122,111,.91); }

.battle-toolbar { position:absolute; top:24px; left:24px; right:24px; z-index:10; display:flex; align-items:center; justify-content:space-between; gap:8px; pointer-events:none; }
.battle-toolbar > span { padding:9px 12px; border-radius:8px; background:rgba(13,30,43,.82); }
.arena-controls { display:flex; gap:6px; }
.arena-controls { pointer-events:auto; }
.arena-controls button { min-height:40px; min-width:44px; }
.arena-controls button { background: rgba(28,39,64,.8); }
.damage-report { margin: 8px 0; border: 1px solid var(--line); border-radius: 8px; background: var(--panel-2); }
.damage-report summary { cursor: pointer; padding: 7px 9px; font-size: 12px; font-weight: 800; color: var(--ink); }
.damage-sides { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:8px; border-top:1px solid var(--line); padding:8px; }
.damage-side { min-width:0; border-radius:6px; padding:6px; background:rgba(255,255,255,.42); }
.damage-side.player { border-left:3px solid #4a90e2; }
.damage-side.enemy { border-left:3px solid #e25555; }
.damage-side-head { display:flex; align-items:baseline; flex-wrap:wrap; gap:4px; margin-bottom:5px; font-size:10px; color:var(--muted); }
.damage-side-head > span:first-child { font-weight:800; color:var(--ink); }
.damage-side-head strong { margin-left:auto; color:var(--ink); font-size:11px; }
.damage-member { min-width:0; padding:4px 0; }
.damage-member + .damage-member { border-top:1px dashed rgba(0,0,0,.12); }
.damage-member-top { display:grid; grid-template-columns:14px minmax(0, 1fr) auto auto; align-items:center; gap:4px; font-size:10px; }
.damage-rank { color:var(--muted); font-weight:800; text-align:center; }
.damage-member .ell { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.damage-member b { font-size:10px; color:var(--ink); }
.damage-member small { color:var(--muted); white-space:nowrap; font-size:9px; }
.contribution-line { display:flex; align-items:center; gap:4px; min-width:0; margin-top:3px; color:var(--muted); font-size:9px; line-height:1.25; }.contribution-line > span:last-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.role-pill { flex:none; border-radius:999px; padding:1px 4px; color:var(--ink); background:rgba(74,144,226,.14); font-weight:800; }.damage-side.enemy .role-pill { background:rgba(226,85,85,.14); }
.recap-metrics { display:flex; flex-wrap:wrap; gap:2px 5px; margin-top:3px; color:var(--muted); font-size:9px; }
.recap-skills { display:flex; flex-wrap:wrap; gap:3px 5px; margin-top:3px; font-size:9px; color:var(--ink); }
.recap-skills span { padding:1px 4px; border-radius:4px; background:rgba(74,144,226,.10); }
.damage-side.enemy .recap-skills span { background:rgba(226,85,85,.10); }
.damage-bar { height:5px; overflow:hidden; border-radius:999px; background:rgba(0,0,0,.12); }
.damage-bar span { display:block; height:100%; min-width:0; border-radius:inherit; background:#4a90e2; }
.damage-side.enemy .damage-bar span { background:#e25555; }
@media (max-width: 700px) { .damage-sides { grid-template-columns:1fr; } }
.result-log { margin: 8px 0; border: 1px solid var(--line); border-radius: 8px; background: var(--panel-2); }
.result-log summary { cursor: pointer; padding: 7px 9px; font-size: 12px; font-weight: 800; color: var(--ink); }
.result-log-list { max-height: 180px; overflow-y: auto; border-top: 1px solid var(--line); padding: 7px 9px; font-size: 11px; line-height: 1.5; color: var(--muted); }
.result-log-list > div + div { margin-top: 2px; }
.exp-list { background: var(--panel-2); border-radius: 8px; padding: 8px; }
.battle-result { max-width:640px; }
.damage-side-head, .damage-side-head strong, .damage-member-top, .damage-member b,
.damage-member small, .contribution-line, .recap-metrics, .recap-skills, .result-log-list { font-size:12px; }
</style>
