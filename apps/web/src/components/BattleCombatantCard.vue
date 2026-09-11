<script setup lang="ts">
import { computed } from 'vue';
import type { BattleCombatant } from '@pokemon-online/shared';
import { combatHud } from '../battle/CombatHud.ts';
import PokemonSprite from './PokemonSprite.vue';

const props = defineProps<{ combatant: BattleCombatant; time: number; interrupted: boolean; avatarStyle: Record<string, string> }>();
const hud = computed(() => combatHud(props.combatant, props.time, props.interrupted));
</script>

<template>
  <article class="mon-card" :class="{ fainted: !combatant.alive, casting: !!hud.cast, critical: hud.critical }" :data-uid="combatant.uid" :aria-label="combatant.name">
    <div class="mc-head">
      <span class="mc-avatar" :style="avatarStyle"><PokemonSprite :species-id="combatant.speciesId" :size="30" :faded="!combatant.alive" /></span>
      <strong class="ell" :title="combatant.name">{{ combatant.name }}</strong>
      <span class="mc-level">Lv.{{ combatant.level }}</span>
    </div>
    <div class="mc-health">
      <span :class="{ danger: hud.critical }">{{ !combatant.alive ? '已倒下' : hud.critical ? '濒危' : '生命' }}</span>
      <span class="mc-hp-number">{{ Math.ceil(Math.max(0, combatant.currentHp)) }} / {{ combatant.maxHp }}</span>
    </div>
    <div class="mc-hp" role="meter" aria-label="生命" :aria-valuenow="combatant.currentHp" :aria-valuemax="combatant.maxHp" aria-valuemin="0"><span :style="{ width: `${hud.ratio * 100}%`, background: hud.hpColor }" /></div>
    <div class="mc-action" :class="{ control: hud.controlled, interrupted: combatant.alive && interrupted, active: !!hud.cast }">
      <span class="ell" :title="hud.action">{{ hud.action }}</span><span v-if="hud.cast">{{ Math.round(hud.progress * 100) }}%</span>
    </div>
    <div class="mc-cast-track"><span :style="{ width: `${hud.progress * 100}%`, opacity: hud.cast ? 1 : 0 }" /></div>
    <div class="mc-statuses">
      <span v-for="status in hud.statuses" :key="status.id" class="mc-status" :class="[status.id, { control: status.control }]">{{ status.text }}</span>
      <span v-if="!hud.statuses.length" class="mc-no-status">{{ combatant.alive ? '无异常状态' : '已退出战斗' }}</span>
    </div>
    <div class="mc-skills">
      <span v-for="skill in hud.skills" :key="skill.id" class="mc-skill" :class="{ basic: skill.basic, ready: skill.ready, active: skill.casting }" :style="{ '--skill-color': skill.color }" :title="skill.detail" tabindex="0" :aria-label="skill.detail">
        <span class="ell">{{ skill.name }}</span><span class="mc-skill-state">{{ skill.state }}</span>
      </span>
    </div>
  </article>
</template>

<style scoped>
.mon-card { flex:none; box-sizing:border-box; height:198px; padding:9px 11px; border:2px solid #afbd98; border-radius:2px; background:#203932; color:#f1edce; box-shadow:3px 3px 0 #142a27; font-size:12px; }
.mon-card.critical { border-color:#ff929088; }.mon-card.casting { border-top-color:#edc574; }
.mon-card.fainted { background:rgba(24,31,38,.88); color:#a9b5bf; }
.mc-head { height:30px; display:flex; align-items:center; gap:7px; }.mc-head strong { flex:1; font-size:14px; }
.ell { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.mc-avatar { display:inline-flex; flex:none; }.mc-level { color:#c7d5df; font-size:12px; flex:none; }
.mc-health { display:flex; justify-content:space-between; line-height:19px; color:#bdceda; }.mc-hp-number { color:#edf5f5; font-variant-numeric:tabular-nums; }.danger { color:#ffaaa7; font-weight:700; }
.mc-hp { height:5px; background:#ffffff1a; border-radius:3px; overflow:hidden; }.mc-hp > span { display:block; height:100%; }
.mc-action { height:21px; display:flex; align-items:center; justify-content:space-between; gap:6px; color:#a9bfcd; }.mc-action.active { color:#ffe1a0; }.mc-action.control, .mc-action.interrupted { color:#ffb3a9; }
.mc-cast-track { height:2px; background:#ffffff09; }.mc-cast-track span { display:block; height:100%; background:#edc574; }
.mc-statuses { height:25px; display:flex; align-items:center; gap:5px; white-space:nowrap; }
.mc-status { font-size:12px; color:#f4d0ae; }.mc-status + .mc-status::before { content:'·'; padding-right:5px; color:#a9bfcd; }.mc-status.control { color:#ffe39a; }.mc-status.poison,.mc-status.confuse { color:#e3b6f1; }.mc-status.freeze { color:#afe3ff; }.mc-no-status { color:#9cb1bf; }
.mc-skills { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); grid-template-rows:repeat(3,23px); gap:3px 6px; }
.mc-skill { min-width:0; display:flex; align-items:center; gap:4px; padding:0 5px; border-left:2px solid var(--skill-color); border-radius:3px; background:#ffffff09; cursor:help; }
.mc-skill > .ell { flex:1; }.mc-skill-state { flex:none; font-size:11px; color:#bdceda; font-variant-numeric:tabular-nums; }.mc-skill.ready .mc-skill-state { color:#9bdfc3; }.mc-skill.active { background:#edc57418; }.mc-skill.active .mc-skill-state { color:#ffe1a0; }
.mc-skill.basic { grid-row:3; grid-column:1 / -1; border-left-color:#9baebc; }.mc-skill:focus-visible { outline:1px solid #b9dfff; outline-offset:1px; }
.fainted .mc-skill { border-left-color:#77848b; color:#a9b5bf; }.fainted .mc-hp-number { color:#a9b5bf; }
</style>
