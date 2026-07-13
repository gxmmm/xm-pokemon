<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useBattleStore } from '../stores/battle.ts';
import { useGameStore } from '../stores/game.ts';
import { getSpecies, SKILL_MAP, PERSONALITY_MAP, TYPE_COLORS } from '@pokemon-online/config';
import { defeatExpYield, maxHp, type BattleSim } from '@pokemon-online/engine';
import type { BattleCombatant, PokemonInstance } from '@pokemon-online/shared';
import type { ExpGainResult } from '../stores/game.ts';
import PokemonSprite from '../components/PokemonSprite.vue';
import TypeBadge from '../components/TypeBadge.vue';
import BattleCanvas from '../components/BattleCanvas.vue';
import type { Biome } from '../battle/BattleField.ts';

const battle = useBattleStore();
const game = useGameStore();
const router = useRouter();

const tick = ref(0);
const speed = ref(1);
const running = ref(true);
const ended = ref(false);
const resultMsg = ref('');
const expResults = ref<ExpGainResult[]>([]);
const totalExp = ref(0);
const canvasRef = ref<InstanceType<typeof BattleCanvas> | null>(null);
let raf = 0;

const sim = computed<BattleSim | null>(() => battle.sim);
const safeSim = computed<BattleSim>(() => sim.value as BattleSim);
// skill-cast avatar flash: uid -> intensity 0..1, set to 1 on a 'skill' event,
// decays each frame. Reset when a new battle (sim) starts.
const skillFlash = ref<Record<string, number>>({});
const interruptFlash = ref<Record<string, number>>({});
let lastSeq = 0;
let hitStop = 0; // hit-stop freeze seconds; sim.tick passes ~0.08x dt while > 0
watch(sim, () => { lastSeq = 0; hitStop = 0; skillFlash.value = {}; interruptFlash.value = {}; });
function avatarStyle(uid: string): Record<string, string> {
  const f = skillFlash.value[uid] ?? 0;
  if (f <= 0) return {};
  return {
    filter: `brightness(${1 + f * 2.5}) drop-shadow(0 0 ${f * 8}px rgba(255,255,255,${f * 0.9}))`,
    transform: `scale(${1 + f * 0.25})`,
  };
}
function interruptVal(uid: string): number { return interruptFlash.value[uid] ?? 0; }
const combatants = computed<BattleCombatant[]>(() => { void tick.value; return sim.value?.state.combatants ?? []; });
const playerComs = computed(() => combatants.value.filter((c) => c.side === 'player'));
const enemyComs = computed(() => combatants.value.filter((c) => c.side === 'enemy'));
const log = computed<string[]>(() => {
  void tick.value;
  const evs = sim.value?.state.events ?? [];
  return evs.slice(-7).map((e) => e.message).filter((m): m is string => !!m);
});
const isOver = computed(() => { void tick.value; return sim.value?.isOver ?? false; });

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
  if (id.includes('dragon')) return 'dragon';
  if (id.includes('moon') || id.includes('tunnel') || id.includes('cave')) return 'cave';
  if (id.includes('sea') || id.includes('water')) return 'water';
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

// per-skill cooldown chips for a combatant: each active skill + the normal attack.
// ready (cd<=0) -> bright skill initial; on cooldown -> dim countdown number.
function skillCds(c: BattleCombatant): { id: string; name: string; char: string; color: string; cd: number }[] {
  const list = c.activeSkills.map((id) => {
    const sk = SKILL_MAP[id];
    return { id, name: sk?.name ?? id, char: sk?.name?.[0] ?? '?', color: TYPE_COLORS[sk?.type ?? 'normal'] ?? '#A8A77A', cd: c.cooldowns[id] ?? 0 };
  });
  list.push({ id: '__normal__', name: '普通攻击', char: '普', color: '#6b7280', cd: c.normalAttackCd });
  return list;
}
const STATUS_TAG: Record<string, string> = { burn: '灼', poison: '毒', paralyze: '痹', freeze: '冰', sleep: '眠', confuse: '乱' };

function frame(now: number): void {
  const realDt = Math.min(0.05, (now - (frame as unknown as { last?: number }).last!) / 1000);
  (frame as unknown as { last?: number }).last = now;
  const s = sim.value;
  if (s) {
    // scan new events first: side-panel avatar flashes + hit-stop trigger.
    // hit-stop fires on real hits only (actor present, not DOT), scaled by the
    // share of target maxHp dealt (3..9s cap -> feels like a 60-90ms freeze).
    const evs = s.state.events;
    for (const e of evs) {
      if ((e.seq ?? 0) <= lastSeq) continue;
      if (e.type === 'skill' && e.actor) skillFlash.value[e.actor] = 1;
      if (e.type === 'info' && e.actor && /被打断/.test(e.message ?? '')) interruptFlash.value[e.actor] = 1;
      if (e.type === 'damage' && e.actor && (e.amount ?? 0) > 0) {
        const tgt = s.state.combatants.find((c) => c.uid === e.target);
        if (tgt) hitStop = Math.max(hitStop, Math.min(0.09, Math.max(0.03, (e.amount ?? 0) / tgt.maxHp * 1.4)));
      }
    }
    if (evs.length) lastSeq = Math.max(lastSeq, evs[evs.length - 1].seq ?? 0);
    for (const k of Object.keys(skillFlash.value)) {
      const v = skillFlash.value[k] - realDt * 4;
      if (v <= 0) delete skillFlash.value[k]; else skillFlash.value[k] = v;
    }
    for (const k of Object.keys(interruptFlash.value)) {
      const v = interruptFlash.value[k] - realDt * 3;
      if (v <= 0) delete interruptFlash.value[k]; else interruptFlash.value[k] = v;
    }

    // advance the sim; during hit-stop nearly freeze it (0.08x) so the impact
    // frame lands with weight. Render below still gets full dt so VFX (burst,
    // flash, particles) keep animating through the freeze.
    if (!s.isOver && running.value) {
      const dtScaled = realDt * speed.value;
      s.tick(hitStop > 0 ? dtScaled * 0.08 : dtScaled);
      tick.value++;
      hitStop = Math.max(0, hitStop - dtScaled);
    }
    canvasRef.value?.render(running.value ? realDt * speed.value : 0);
  }
  if (s && s.isOver && !ended.value) onEnd();
  raf = requestAnimationFrame(frame);
}

function onEnd(): void {
  ended.value = true;
  running.value = false;
  const s = sim.value;
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

function finalize(caught: PokemonInstance | undefined): void {
  game.recordBattle({
    win: sim.value?.state.winner === 'player',
    expGained: totalExp.value,
    caught,
    log: log.value,
  });
  game.healAll(); // auto full-heal entire roster after battle (frozen design)
  void game.persist(true);
  battle.clear();
  router.replace({ name: 'world' });
}

function leave(): void {
  game.recordBattle({
    win: sim.value?.state.winner === 'player',
    expGained: totalExp.value,
    log: log.value,
    opponent: battle.opponentName,
  });
  game.healAll();
  void game.persist(true);
  battle.clear();
  router.replace({ name: 'world' });
}

function skip(): void {
  const s = sim.value;
  if (s && !s.isOver) { s.resolve(180); tick.value++; }
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
            <div v-for="s in skillCds(c)" :key="s.id" class="cd-chip" :class="{ ready: s.cd <= 0 }" :style="{ background: s.color }" :title="s.name + (s.cd > 0 ? ' CD ' + Math.ceil(s.cd) + 's' : ' 就绪')">
              <span v-if="s.cd > 0">{{ Math.ceil(s.cd) }}</span>
              <span v-else>{{ s.char }}</span>
            </div>
            <span v-if="c.status" class="status-tag" :class="c.status">{{ STATUS_TAG[c.status] }}</span>
            <span v-if="c.castProgress" class="cast-tag">蓄力</span>
            <span v-else-if="interruptVal(c.uid) > 0" class="cast-tag bad">打断</span>
          </div>
        </div>
      </div>

      <!-- ARENA -->
      <div class="arena" :class="{ over: isOver }">
        <BattleCanvas ref="canvasRef" :sim="safeSim" :biome="biome" />
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
            <div v-for="s in skillCds(c)" :key="s.id" class="cd-chip" :class="{ ready: s.cd <= 0 }" :style="{ background: s.color }" :title="s.name + (s.cd > 0 ? ' CD ' + Math.ceil(s.cd) + 's' : ' 就绪')">
              <span v-if="s.cd > 0">{{ Math.ceil(s.cd) }}</span>
              <span v-else>{{ s.char }}</span>
            </div>
            <span v-if="c.status" class="status-tag" :class="c.status">{{ STATUS_TAG[c.status] }}</span>
            <span v-if="c.castProgress" class="cast-tag">蓄力</span>
            <span v-else-if="interruptVal(c.uid) > 0" class="cast-tag bad">打断</span>
          </div>
        </div>
      </div>
    </div>

    <div class="log panel">
      <div v-for="(l, i) in log" :key="i" class="tiny">{{ l }}</div>
    </div>

    <div class="controls">
      <button class="sm ghost" @click="speed = speed === 1 ? 2 : speed === 2 ? 3 : 1">{{ speed }}x</button>
      <button class="sm ghost" @click="running = !running">{{ running ? '⏸ 暂停' : '▶ 继续' }}</button>
      <button class="sm ghost" @click="skip">⏭ 跳过演算</button>
    </div>

    <div class="modal-backdrop" v-if="ended">
      <div class="modal">
        <h2 class="h-title center">{{ resultMsg }}</h2>
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
.battle { display:flex; flex-direction:column; gap:8px; }
.wild-list { display:flex; flex-direction:column; gap:6px; margin:10px 0; }
.wild-entry { display:flex; align-items:center; gap:10px; background: var(--panel-2); border-radius: 8px; padding: 6px 8px; }

.battle-row { display:flex; gap:8px; align-items:center; justify-content:center; }
.side-panel { width: 196px; flex-shrink:0; display:flex; flex-direction:column; gap:6px; }
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
.cast-tag { font-size:10px; font-weight:800; padding:0 5px; border-radius:4px; background:var(--gold); color:#333; box-shadow:0 0 6px rgba(255,203,5,.7); }
.cast-tag.bad { background:var(--bad); color:#fff; box-shadow:0 0 6px rgba(210,59,59,.7); }
.status-tag.burn { background:#e25822; color:#fff; }
.status-tag.poison { background:#9b59b6; color:#fff; }
.status-tag.paralyze { background:#f1c40f; color:#333; }
.status-tag.freeze { background:#74b9ff; color:#333; }
.status-tag.sleep { background:#7f8c8d; color:#fff; }
.status-tag.confuse { background:#e84393; color:#fff; }

.arena {
  position: relative; flex: 1 1 0; min-width: 0; aspect-ratio: 20 / 14; max-height: 80vh;
  background: #0e1626; border-radius: 12px; border: 4px solid #1c2740; overflow: hidden; align-self: center;
}
.arena.over { filter: brightness(.85); }
.log { min-height: 70px; max-height: 92px; overflow-y: auto; }
.log .tiny { line-height: 1.5; }
.controls { display:flex; gap:6px; justify-content:center; }
.exp-list { background: var(--panel-2); border-radius: 8px; padding: 8px; }

@media (max-width: 860px) {
  .battle-row { flex-direction:column; }
  .side-panel { width:100%; flex-direction:row; flex-wrap:wrap; }
  .side-panel .mon-card { flex:1 1 140px; min-width:120px; }
  .arena { width:100%; flex:none; max-height:60vh; }
}
</style>
