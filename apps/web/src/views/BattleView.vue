<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useBattleStore } from '../stores/battle.ts';
import { useGameStore } from '../stores/game.ts';
import { getSpecies, SKILL_MAP, PERSONALITY_MAP } from '@pokemon-online/config';
import { defeatExpYield, maxHp, type BattleSim } from '@pokemon-online/engine';
import type { BattleCombatant } from '@pokemon-online/shared';
import type { ExpGainResult } from '../stores/game.ts';
import PokemonSprite from '../components/PokemonSprite.vue';
import TypeBadge from '../components/TypeBadge.vue';

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
let raf = 0;

const sim = computed<BattleSim | null>(() => battle.sim);
const combatants = computed<BattleCombatant[]>(() => { void tick.value; return sim.value?.state.combatants ?? []; });
const playerComs = computed(() => combatants.value.filter((c) => c.side === 'player'));
const enemyComs = computed(() => combatants.value.filter((c) => c.side === 'enemy'));
const log = computed<string[]>(() => {
  void tick.value;
  const evs = sim.value?.state.events ?? [];
  return evs.slice(-7).map((e) => e.message).filter((m): m is string => !!m);
});
const isOver = computed(() => { void tick.value; return sim.value?.isOver ?? false; });

// PVE bench: ordered player team with status (active / fainted / waiting)
const playerTeamUids = computed<string[]>(() => { void tick.value; return sim.value?.playerTeamUids ?? []; });
function benchStatus(uid: string): 'active' | 'fainted' | 'waiting' {
  const c = sim.value?.state.combatants.find((x) => x.uid === uid);
  if (!c) return 'waiting';
  return c.alive ? 'active' : 'fainted';
}

function hpRatio(c: BattleCombatant): number {
  return Math.max(0, c.currentHp / c.maxHp);
}
function hpColor(c: BattleCombatant): string {
  const r = hpRatio(c);
  return r > 0.5 ? '#4caf50' : r > 0.2 ? '#e0a800' : '#d23b3b';
}
function posStyle(c: BattleCombatant): Record<string, string> {
  return {
    left: `${(c.position.x / 720) * 100}%`,
    top: `${(c.position.y / 360) * 100}%`,
    transform: `translate(-50%,-50%) scaleX(${c.facing})`,
  };
}
function skillName(id: string | undefined): string {
  if (!id) return '';
  return SKILL_MAP[id]?.name ?? (id === '__normal__' ? '普通攻击' : id);
}
function instanceName(uid: string): string {
  const inst = game.getInstance(uid);
  return inst?.nickname || (inst ? getSpecies(inst.speciesId).name : '?');
}

function frame(now: number): void {
  const realDt = Math.min(0.05, (now - (frame as unknown as { last?: number }).last!) / 1000);
  (frame as unknown as { last?: number }).last = now;
  const s = sim.value;
  if (s && !s.isOver && running.value) {
    s.tick(realDt * speed.value);
    tick.value++;
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
  const wild = battle.wild;
  if (winner === 'player' && wild) {
    const total = defeatExpYield(wild, 'pve');
    totalExp.value = total;
    const foughtUids = new Set(sim.value!.state.combatants.filter((c) => c.side === 'player').map((c) => c.uid));
    const results: ExpGainResult[] = [];
    for (const p of game.pveTeamInstances) {
      const amt = foughtUids.has(p.uid) ? total : Math.floor(total * 0.3); // benched share
      results.push(game.grantExp(p.uid, amt));
    }
    expResults.value = results;
    game.see(wild.speciesId);
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

function capture(): void {
  if (game.rosterFull) return; // button is disabled; guard anyway
  const wild = battle.wild;
  if (wild) {
    wild.currentHp = maxHp(wild);
    wild.status = null;
    wild.origin = 'caught';
    wild.caughtAt = Date.now();
    wild.caughtMapId = battle.mapId;
    game.addCaughtInstance(wild);
  }
  finalize(true);
}

function release(): void {
  if (battle.wild) {
    const e = game.save!.pokedex[battle.wild.speciesId];
    if (e) e.released = true;
  }
  finalize(false);
}

function finalize(caught: boolean): void {
  game.recordBattle({
    win: sim.value?.state.winner === 'player',
    expGained: totalExp.value,
    caught: caught ? battle.wild ?? undefined : undefined,
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

const wildSpecies = computed(() => (battle.wild ? getSpecies(battle.wild.speciesId) : null));
const showCapture = computed(() => ended.value && battle.mode === 'pve' && sim.value?.state.winner === 'player' && !!battle.wild);
</script>

<template>
  <div class="battle" v-if="sim">
    <!-- PVE bench: ordered team with status -->
    <div class="bench" v-if="battle.mode === 'pve' && playerTeamUids.length">
      <div class="tiny muted">出战顺序（倒下自动换下一只）</div>
      <div class="bench-row">
        <div v-for="(uid, i) in playerTeamUids" :key="uid" class="bench-slot" :class="benchStatus(uid)">
          <span class="ord">{{ i + 1 }}</span>
          <PokemonSprite :species-id="game.getInstance(uid)?.speciesId ?? 0" :size="40" :faded="benchStatus(uid)==='fainted'" />
          <span class="tiny">{{ instanceName(uid) }}</span>
        </div>
      </div>
    </div>

    <div class="arena" :class="{ over: isOver }">
      <div class="com-info enemy-info" v-for="c in enemyComs" :key="c.uid">
        <div class="between"><span class="bold">{{ c.name }}</span><span class="chip">Lv.{{ c.level }}</span></div>
        <div class="bar hp-bar"><span :style="{ width: hpRatio(c)*100+'%', background: hpColor(c) }"></span></div>
        <div class="tiny muted">{{ Math.ceil(c.currentHp) }}/{{ c.maxHp }} <span v-if="c.status">· {{ c.status }}</span></div>
      </div>

      <div class="com-info player-info" v-for="c in playerComs" :key="c.uid">
        <div class="between"><span class="bold">{{ c.name }}</span><span class="chip">Lv.{{ c.level }}</span></div>
        <div class="bar hp-bar"><span :style="{ width: hpRatio(c)*100+'%', background: hpColor(c) }"></span></div>
        <div class="tiny muted">{{ Math.ceil(c.currentHp) }}/{{ c.maxHp }} <span v-if="c.status">· {{ c.status }}</span></div>
      </div>

      <div v-for="c in combatants" :key="'s'+c.uid" class="sprite-slot" :style="posStyle(c)">
        <PokemonSprite :species-id="c.speciesId" :back="c.side==='player'" :size="88" :faded="!c.alive" />
        <div class="cast-tag tiny" v-if="c.castProgress">蓄力中…</div>
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
        <template v-if="showCapture && wildSpecies">
          <div class="center col" style="margin:10px 0">
            <PokemonSprite :species-id="wildSpecies.id" :size="96" />
            <div class="bold">{{ wildSpecies.name }}</div>
            <div class="row center" style="gap:4px">
              <TypeBadge v-for="t in wildSpecies.types" :key="t" :type="t" size="sm" />
            </div>
            <div class="tiny muted">Lv.{{ battle.wild?.level }} · {{ PERSONALITY_MAP[battle.wild?.personality ?? 'cool']?.name }}</div>
          </div>
          <p class="tiny center muted">击败后可选择捕捉或放生（捕捉100%成功，放生保留图鉴记录）。战斗结束自动回满状态。</p>
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
            <button class="gold grow" :disabled="game.rosterFull" @click="capture">捕捉</button>
            <button class="ghost grow" @click="release">放生</button>
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
.bench { background: var(--bg-dark); border-radius: 10px; padding: 6px 10px; }
.bench-row { display:flex; gap:8px; align-items:flex-end; }
.bench-slot { display:flex; flex-direction:column; align-items:center; position:relative; opacity:.55; }
.bench-slot.active { opacity:1; }
.bench-slot.fainted { opacity:.35; }
.bench-slot .ord { position:absolute; top:-2px; left:0; background:var(--accent); color:#fff; border-radius:50%; width:16px; height:16px; font-size:10px; display:flex; align-items:center; justify-content:center; z-index:1; }
.arena {
  position: relative; width: 100%; aspect-ratio: 720/360; max-height: 50vh;
  background: linear-gradient(#9bd6f5 0%, #cfeefd 60%, #b6e3a1 60%, #8fcf6e 100%);
  border-radius: 12px; border: 4px solid #1c2740; overflow: hidden;
}
.arena.over { filter: brightness(.85); }
.com-info {
  position: absolute; width: 42%; max-width: 220px; background: rgba(255,255,255,.92);
  border-radius: 8px; padding: 4px 8px; color: #2b2b2b; z-index: 2;
}
.enemy-info { top: 8px; right: 8px; }
.player-info { bottom: 8px; left: 8px; }
.sprite-slot { position: absolute; transition: left .06s linear, top .06s linear; z-index: 1; }
.cast-tag { background: rgba(0,0,0,.6); color:#fff; border-radius:6px; padding:1px 6px; text-align:center; margin-top:-6px; }
.log { min-height: 92px; max-height: 110px; overflow-y: auto; }
.log .tiny { line-height: 1.5; }
.controls { display:flex; gap:6px; justify-content:center; }
.exp-list { background: var(--panel-2); border-radius: 8px; padding: 8px; }
</style>
