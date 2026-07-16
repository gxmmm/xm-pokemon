<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useBattleStore } from '../stores/battle.ts';
import { useGameStore } from '../stores/game.ts';
import { getSpecies, SKILL_MAP, PERSONALITY_MAP, STORY_TRAINERS, TYPE_COLORS, isGpuWorldMapId } from '@pokemon-online/config';
import { defeatExpYield, maxHp, type BattleSim } from '@pokemon-online/engine';
import type { BattleCombatant, PokemonInstance } from '@pokemon-online/shared';
import type { ExpGainResult } from '../stores/game.ts';
import PokemonSprite from '../components/PokemonSprite.vue';
import TypeBadge from '../components/TypeBadge.vue';
import PixiBattleViewport from '../components/PixiBattleViewport.vue';
import type { Biome } from '../battle/BattleField.ts';
import type { QualityProfile } from '@pokemon-online/renderer';
import type { BattlePresentation, DirectedBattleCue } from '@pokemon-online/presentation';
import { BattlePresentationBridge } from '../game/BattlePresentationBridge.ts';
import { consumeBattleVisualTransition, requestWorldReturnVisualTransition } from '../game/SceneVisualTransition.ts';
import { visualRuntimeCapabilities, visualRuntimeSettings } from '../visuals/runtime-settings.ts';
import { hasRendererObservationWorldScene } from '../visuals/runtime-observation.ts';
import { contributionSummary, roleLabel, tacticPresentation } from '../battle/CombatInsights.ts';

const battle = useBattleStore();
const game = useGameStore();
const router = useRouter();
const enteredFromGpuWorld = consumeBattleVisualTransition();
function canBridgeGpuWorld(mapId: string): boolean {
  return isGpuWorldMapId(mapId) || hasRendererObservationWorldScene(mapId);
}

const speed = ref(1);
const running = ref(true);
const ended = ref(false);
const resultMsg = ref('');
const expResults = ref<ExpGainResult[]>([]);
const totalExp = ref(0);
const pixiRef = ref<InstanceType<typeof PixiBattleViewport> | null>(null);
// BattleStage is the only gameplay renderer for wild, story, and PvP battles.
// Legacy Canvas code remains in the repository but is never mounted by gameplay.
const gpuUnavailable = ref<string | null>(null);
const pixiQuality = ref<QualityProfile>(visualRuntimeCapabilities.value.quality);
const pixiStatus = ref(enteredFromGpuWorld && canBridgeGpuWorld(enteredFromGpuWorld.mapId) ? 'GPU world-to-battle transition' : '正在初始化 GPU battle renderer…');
const returningToWorld = ref(false);
let raf = 0;

const sim = computed<BattleSim | null>(() => battle.sim);
watch(() => visualRuntimeCapabilities.value.quality, (quality) => {
  pixiQuality.value = quality;
  pixiStatus.value = `GPU ${quality} renderer`;
});
function onPixiReady(): void {
  gpuUnavailable.value = null;
  pixiStatus.value = `GPU ${pixiQuality.value} renderer`;
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
// The canvas needs the full presentation cadence; side cards and the combat log
// do not. Keep DOM/reactivity updates at 12fps to avoid six cards re-rendering
// for every animation frame.
const hudCombatants = ref<BattleCombatant[]>([]);
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
// The canvas receives every presentation frame. HUD data is sampled separately
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
    interrupts: number; knockouts: number; normalDamage: number; skillDamage: number;
    casts: number; normalAttacks: number; hits: number; misses: number;
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
      normalDamage: c.normalDamage, skillDamage: c.skillDamage,
      casts: c.skillCasts, normalAttacks: c.normalAttacks, hits: c.hits, misses: c.misses,
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
  battleLog.value = s.state.events.map((event) => event.message).filter((message): message is string => !!message);
  hudOver.value = s.isOver;
}

function hpRatio(c: BattleCombatant): number {
  return Math.max(0, c.currentHp / c.maxHp);
}
function hpColor(c: BattleCombatant): string {
  const r = hpRatio(c);
  return r > 0.5 ? '#4caf50' : r > 0.2 ? '#e0a800' : '#d23b3b';
}
const biome = computed<Biome>(() => {
  if (battle.mode === 'pvp') return 'arena';
  const id = battle.mapId ?? '';
if (id.includes('dragon') || id === 'deep-space') return 'dragon';
  if (id.includes('moon') || id.includes('tunnel') || id.includes('cave')) return 'cave';
  if (id.includes('sea') || id.includes('water')) return 'water';
  return 'grass';
});
function skillTargetLabel(id: string): string {
  const sk = SKILL_MAP[id];
  return sk?.targetMode === 'all-enemies' ? `敌方全体（单目标伤害 ${Math.round((sk.areaMultiplier ?? 0.7) * 100)}%）` : '敌方单体';
}
function skillName(id: string | undefined): string {
  if (!id) return '';
  return SKILL_MAP[id]?.name ?? (id === '__normal__' ? '普通攻击' : id);
}
function instanceName(uid: string): string {
  const inst = game.getInstance(uid);
  return inst?.nickname || (inst ? getSpecies(inst.speciesId).name : '?');
}

// per-skill cooldown chips for a combatant: each active skill + the normal attack.
// ready (cd<=0) -> bright skill initial; on cooldown -> dim countdown number.
function skillCds(c: BattleCombatant): { id: string; name: string; char: string; color: string; cd: number; target: string }[] {
  const list = c.activeSkills.map((id) => {
    const sk = SKILL_MAP[id];
    return { id, name: sk?.name ?? id, char: sk?.name?.[0] ?? '?', color: TYPE_COLORS[sk?.type ?? 'normal'] ?? '#A8A77A', cd: c.cooldowns[id] ?? 0, target: skillTargetLabel(id) };
  });
  list.push({ id: '__normal__', name: '普通攻击', char: '普', color: '#6b7280', cd: c.normalAttackCd, target: '敌方单体' });
  return list;
}
const STATUS_TAG: Record<string, string> = { burn: '灼', poison: '毒', paralyze: '痹', freeze: '冰', sleep: '眠', confuse: '乱' };

function updatePresentation(s: BattleSim, dtScaled: number): void {
  const frame = presentationBridge.advance(s, dtScaled);
  presentation.value = frame.presentation;
  presentationCues.value = [...frame.cues];
  // Pixi consumes the same director hit-stop cue. The bridge pauses only its
  // delayed visual cursor, never BattleSim's authoritative rule clock.
  for (const directed of frame.cues) {
    if (directed.cue.type === 'hit-stop') presentationBridge.requestHitStop(Math.max(0, (directed.cue.milliseconds - 30) / 70));
  }
  presentationCaughtUp = frame.isCaughtUp;
  processPresentationEvents(frame.newEvents);
}

function processPresentationEvents(events: readonly import('@pokemon-online/shared').BattleEvent[]): void {
  for (const event of events) {
    if (event.type === 'skill' && event.actor) skillFlash.value[event.actor] = 1;
    if (event.type === 'info' && event.actor && /被打断/.test(event.message ?? '')) interruptFlash.value[event.actor] = 1;
  }
}

function frame(now: number): void {
  const realDt = Math.min(0.05, (now - (frame as unknown as { last?: number }).last!) / 1000);
  (frame as unknown as { last?: number }).last = now;
  const s = sim.value;
  if (s) {
    const dtScaled = running.value ? realDt * speed.value : 0;
    // Authoritative simulation is intentionally never slowed for spectacle.
    if (!s.isOver && running.value) {
      s.tick(dtScaled);
    }
    updatePresentation(s, dtScaled);
    if (now >= nextHudSyncAt) {
      syncHud(s);
      nextHudSyncAt = now + 1000 / 12;
    }
    for (const k of Object.keys(skillFlash.value)) {
      const v = skillFlash.value[k] - realDt * 5;
      if (v <= 0) delete skillFlash.value[k]; else skillFlash.value[k] = v;
    }
    for (const k of Object.keys(interruptFlash.value)) {
      const v = interruptFlash.value[k] - realDt * 3;
      if (v <= 0) delete interruptFlash.value[k]; else interruptFlash.value[k] = v;
    }
  }
  // Do not cover the canvas the instant the simulator decides a winner. The
  // final delayed event (especially a KO burst/faint) must finish its local VFX
  // before the result modal becomes visible.
  if (s && s.isOver && !ended.value && presentationCaughtUp && activeRendererSettled()) onEnd();
  raf = requestAnimationFrame(frame);
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
    const results: ExpGainResult[] = [];
    for (const p of game.pveTeamInstances) results.push(game.grantExp(p.uid, total));
    expResults.value = results;
    resultMsg.value = '胜利！';
  } else {
    resultMsg.value = '你的宝可梦倒下了…';
  }
}

function handlePvpEnd(winner: 'player' | 'enemy' | 'draw' | undefined): void {
  const scripted = battle.storyBattleId ? STORY_TRAINERS[battle.storyBattleId] : undefined;
  if (scripted) {
    if (winner === 'player') {
      if (scripted.rewardExp !== false) {
        const total = Math.max(20, scripted.team.reduce((sum, entry) => sum + entry.level * 6, 0));
        totalExp.value = total;
        for (const p of game.pveTeamInstances) expResults.value.push(game.grantExp(p.uid, Math.floor(total / Math.max(1, game.pveTeamInstances.length))));
      }
      if (!scripted.repeatable) game.advanceStory(scripted.winFlags, scripted.questAfter);
      resultMsg.value = scripted.winText ?? `${scripted.name} 露出不甘心的笑容："这次算你赢。潮汐的谜团，我们各凭本事。"`;
    } else {
      resultMsg.value = `${scripted.name}："别灰心。回去调整队伍，再来一次。"`;
    }
    return;
  }
  if (winner === 'player') {
    const oppLevel = sim.value?.state.combatants.filter((c) => c.side === 'enemy').reduce((s, c) => s + c.level, 0) ?? 0;
    const total = Math.max(20, Math.floor(oppLevel * 5));
    totalExp.value = total;
    const team = game.pvpTeamInstances;
    const results: ExpGainResult[] = [];
    for (const p of team) results.push(game.grantExp(p.uid, Math.floor(total / Math.max(1, team.length))));
    expResults.value = results;
    resultMsg.value = `切磋胜利！击败了 ${battle.opponentName} 的队伍`;
  } else if (winner === 'enemy') {
    resultMsg.value = `切磋失利…${battle.opponentName} 的队伍更强一筹`;
  } else {
    resultMsg.value = '平局';
  }
}

function capture(uid: string): void {
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
  for (const w of battle.wild) {
    const e = game.save!.pokedex[w.speciesId];
    if (e) e.released = true;
  }
  finalize(undefined);
}

async function returnToWorld(): Promise<void> {
  if (returningToWorld.value) return;
  returningToWorld.value = true;
  if (!gpuUnavailable.value && battle.mapId && canBridgeGpuWorld(battle.mapId)) {
    await pixiRef.value?.playTransition({ kind: 'biome-crossfade', durationMs: 240, color: '#0b2430' });
    requestWorldReturnVisualTransition({ mapId: battle.mapId, quality: pixiQuality.value });
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
  if (s && !s.isOver) { s.resolve(180); syncHud(s); }
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
  <div class="battle" v-if="sim">
    <div class="battle-row">
      <!-- LEFT: player team (outside arena) -->
      <div class="side-panel player-side">
        <div class="side-label">我方</div>
        <div v-for="c in playerComs" :key="c.uid" class="mon-card" :class="{ fainted: !c.alive, casting: !!c.castProgress }">
          <div class="mc-head">
            <span class="bold tiny ell">{{ c.name }}</span>
            <span class="chip sm-chip">Lv.{{ c.level }}</span>
            <div class="bar hp-bar mc-hp"><span :style="{ width: hpRatio(c)*100 + '%', background: hpColor(c) }"></span></div>
          </div>
          <div class="mc-skills">
            <span class="mc-avatar" :style="avatarStyle(c.uid)"><PokemonSprite :species-id="c.speciesId" :size="26" :faded="!c.alive" /></span>
            <div v-for="s in skillCds(c)" :key="s.id" class="cd-chip" :class="{ ready: s.cd <= 0 }" :style="{ background: s.color }" :title="s.name + ' · ' + s.target + (s.cd > 0 ? ' CD ' + Math.ceil(s.cd) + 's' : ' 就绪')">
              <span v-if="s.cd > 0">{{ Math.ceil(s.cd) }}</span>
              <span v-else>{{ s.char }}</span>
            </div>
            <span v-if="c.status" class="status-tag" :class="c.status">{{ STATUS_TAG[c.status] }}</span>
            <span v-if="c.castProgress" class="cast-tag">{{ skillName(c.castProgress.skillId) }} {{ Math.round((1 - c.castProgress.remaining / (SKILL_MAP[c.castProgress.skillId]?.castTime || 1)) * 100) }}%</span>
            <span v-else-if="interruptVal(c.uid) > 0" class="cast-tag bad">打断</span>
          </div>
        </div>
      </div>

      <!-- ARENA -->
      <div class="arena" :class="{ over: isOver }">
        <PixiBattleViewport ref="pixiRef" :presentation="presentation ?? undefined" :cues="presentationCues" :biome="biome" :quality="pixiQuality" :visual-settings="visualRuntimeSettings" :intro-transition="!!enteredFromGpuWorld && canBridgeGpuWorld(enteredFromGpuWorld.mapId)" @ready="onPixiReady" @unavailable="onPixiUnavailable" />
        <div v-if="gpuUnavailable" class="gpu-unavailable">GPU 战斗渲染不可用：{{ gpuUnavailable }}</div>
        <div class="tactic-ribbon player" v-if="playerTactic" :class="playerTactic.tone" :title="playerTactic.description"><span>我方 · {{ playerTactic.label }}</span><small>{{ playerTactic.description }}</small></div>
        <div class="tactic-ribbon enemy" v-if="enemyTactic" :class="enemyTactic.tone" :title="enemyTactic.description"><span>敌方 · {{ enemyTactic.label }}</span><small>{{ enemyTactic.description }}</small></div>
        <div class="arena-controls">
          <button class="sm ghost" @click="speed = speed === 1 ? 2 : speed === 2 ? 3 : 1">{{ speed }}x</button>
          <button class="sm ghost" @click="running = !running">{{ running ? '⏸' : '▶' }}</button>
          <button class="sm ghost" @click="skip">⏭</button>
        </div>
      </div>

      <!-- RIGHT: enemy team (outside arena) -->
      <div class="side-panel enemy-side">
        <div class="side-label">敌方</div>
        <div v-for="c in enemyComs" :key="c.uid" class="mon-card" :class="{ fainted: !c.alive, casting: !!c.castProgress }">
          <div class="mc-head">
            <span class="bold tiny ell">{{ c.name }}</span>
            <span class="chip sm-chip">Lv.{{ c.level }}</span>
            <div class="bar hp-bar mc-hp"><span :style="{ width: hpRatio(c)*100 + '%', background: hpColor(c) }"></span></div>
          </div>
          <div class="mc-skills">
            <span class="mc-avatar" :style="avatarStyle(c.uid)"><PokemonSprite :species-id="c.speciesId" :size="26" :faded="!c.alive" /></span>
            <div v-for="s in skillCds(c)" :key="s.id" class="cd-chip" :class="{ ready: s.cd <= 0 }" :style="{ background: s.color }" :title="s.name + ' · ' + s.target + (s.cd > 0 ? ' CD ' + Math.ceil(s.cd) + 's' : ' 就绪')">
              <span v-if="s.cd > 0">{{ Math.ceil(s.cd) }}</span>
              <span v-else>{{ s.char }}</span>
            </div>
            <span v-if="c.status" class="status-tag" :class="c.status">{{ STATUS_TAG[c.status] }}</span>
            <span v-if="c.castProgress" class="cast-tag">{{ skillName(c.castProgress.skillId) }} {{ Math.round((1 - c.castProgress.remaining / (SKILL_MAP[c.castProgress.skillId]?.castTime || 1)) * 100) }}%</span>
            <span v-else-if="interruptVal(c.uid) > 0" class="cast-tag bad">打断</span>
          </div>
        </div>
      </div>
    </div>

    <div class="modal-backdrop" v-if="ended">
      <div class="modal">
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
                  <span>普 {{ member.normalDamage }}</span><span>技 {{ member.skillDamage }}</span>
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
.battle { display:flex; flex-direction:column; gap:8px; height:100%; }
.wild-list { display:flex; flex-direction:column; gap:6px; margin:10px 0; }
.wild-entry { display:flex; align-items:center; gap:10px; background: var(--panel-2); border-radius: 8px; padding: 6px 8px; }

.battle-row { display:flex; gap:10px; align-items:stretch; justify-content:center; flex:1; min-height:0; }
.side-panel { width: 140px; flex-shrink:0; display:flex; flex-direction:column; gap:6px; overflow-y:auto; }
.side-label { font-size:11px; font-weight:800; text-align:center; padding:2px; letter-spacing:1px; }
.player-side .side-label { color:#8acfff; }
.enemy-side .side-label { color:#ff9b9b; }

.mon-card {
  background: var(--panel); color: var(--ink); border-radius: 8px; padding: 5px 6px;
  box-shadow: 0 2px 0 rgba(0,0,0,.15); border: 2px solid transparent;
}
.mon-card.fainted { opacity:.4; filter: grayscale(.6); }
.mon-card.casting { border-color: var(--gold); box-shadow: 0 0 8px rgba(255,203,5,.6); }
.mc-head { display:flex; align-items:center; gap:5px; }
.mc-head .ell { flex:0 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:78px; }
.mc-hp { flex:1; min-width:30px; }
.mc-skills { display:flex; align-items:center; gap:3px; margin-top:4px; flex-wrap:wrap; }
.mc-avatar { display:inline-flex; transition: filter .08s ease, transform .08s ease; }

.cd-chip {
  width:22px; height:22px; border-radius:5px; display:flex; align-items:center; justify-content:center;
  color:#fff; font-size:11px; font-weight:800; text-shadow:0 1px 1px rgba(0,0,0,.45);
}
.cd-chip.ready { box-shadow: 0 0 0 1.5px rgba(255,255,255,.65); }
.cd-chip:not(.ready) { opacity:.5; filter: grayscale(.4); }
.status-tag { font-size:10px; font-weight:800; padding:0 4px; border-radius:4px; margin-left:auto; }
.cast-tag { font-size:9px; font-weight:800; padding:1px 5px; border-radius:4px; background:var(--gold); color:#333; box-shadow:0 0 6px rgba(255,203,5,.55); white-space:nowrap; max-width:122px; overflow:hidden; text-overflow:ellipsis; }
.cast-tag.bad { background:var(--bad); color:#fff; box-shadow:0 0 6px rgba(210,59,59,.7); }
.status-tag.burn { background:#e25822; color:#fff; }
.status-tag.poison { background:#9b59b6; color:#fff; }
.status-tag.paralyze { background:#f1c40f; color:#333; }
.status-tag.freeze { background:#74b9ff; color:#333; }
.status-tag.sleep { background:#7f8c8d; color:#fff; }
.status-tag.confuse { background:#e84393; color:#fff; }

.arena {
  position: relative; flex: 1 1 auto; min-width: 0; aspect-ratio: 20 / 14; max-height: none;
  background: #0e1626; border-radius: 12px; border: 4px solid #1c2740; overflow: hidden; align-self: center;
}
.arena.over { filter: brightness(.85); }
.gpu-unavailable { position:absolute; inset:0; z-index:6; display:grid; place-items:center; padding:24px; text-align:center; color:#ffe4a6; background:rgba(8,13,24,.88); border:1px solid rgba(255,203,5,.35); }
.tactic-ribbon { position:absolute; left:50%; transform:translateX(-50%); z-index:4; min-width:132px; max-width:calc(100% - 18px); padding:4px 8px; border-radius:7px; text-align:center; pointer-events:none; color:#fff; text-shadow:0 1px 2px rgba(0,0,0,.45); box-shadow:0 2px 8px rgba(0,0,0,.28); background:rgba(62,78,108,.88); }
.tactic-ribbon.player { top:8px; }.tactic-ribbon.enemy { bottom:8px; }
.tactic-ribbon span { display:block; font-size:10px; font-weight:900; letter-spacing:.4px; }.tactic-ribbon small { display:block; max-width:230px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:8px; opacity:.92; }
.tactic-ribbon.finish { background:rgba(196,78,64,.91); }.tactic-ribbon.protect { background:rgba(57,119,191,.91); }.tactic-ribbon.pressure { background:rgba(143,80,176,.91); }.tactic-ribbon.split { background:rgba(62,122,111,.91); }

.arena-controls {
  position: absolute; top: 8px; right: 8px; display: flex; gap: 4px; z-index: 5;
}
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
</style>
