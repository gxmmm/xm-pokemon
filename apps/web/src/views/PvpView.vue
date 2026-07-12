<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useGameStore } from '../stores/game.ts';
import { useBattleStore } from '../stores/battle.ts';
import { useMessage } from '../stores/message.ts';
import { api } from '../api/client.ts';
import { getSpecies } from '@pokemon-online/config';
import type { PokemonInstance } from '@pokemon-online/shared';
import PokemonCard from '../components/PokemonCard.vue';

const game = useGameStore();
const battle = useBattleStore();
const msg = useMessage();
const router = useRouter();

const friendName = ref('');
const opponentName = ref('');
const friends = ref<string[]>([]);
const error = ref<string | null>(null);
const busy = ref(false);
const opponentTeam = ref<PokemonInstance[] | null>(null);

onMounted(async () => {
  try { const r = await api.getFriends(); friends.value = r.friends; } catch { /* ignore */ }
});

const myTeam = computed(() => game.pvpTeamInstances);

async function addFriend(): Promise<void> {
  error.value = null;
  if (!friendName.value.trim()) return;
  try {
    await game.addFriend(friendName.value.trim());
    if (!friends.value.includes(friendName.value.trim())) friends.value.push(friendName.value.trim());
    friendName.value = '';
  } catch (e) { error.value = e instanceof Error ? e.message : '添加失败'; }
}

async function fetchOpponent(): Promise<void> {
  error.value = null; busy.value = true; opponentTeam.value = null;
  try {
    const r = await api.getOpponent(opponentName.value.trim());
    opponentName.value = r.username;
    opponentTeam.value = r.team;
    if (r.team.length === 0) error.value = '对手还未设置切磋队伍（队伍为空或全部倒下）';
  } catch (e) {
    error.value = e instanceof Error ? e.message : '查找失败';
  } finally { busy.value = false; }
}

function startBattle(): void {
  if (!opponentTeam.value || opponentTeam.value.length === 0) return;
  const ok = battle.startPvp(opponentTeam.value, opponentName.value);
  if (ok) router.push({ name: 'battle' });
  else msg.warn('你的切磋队伍为空，请先在「队伍」页设置3只宝可梦');
}
</script>

<template>
  <div v-if="game.save">
    <div class="panel" style="margin-bottom:12px">
      <h2 class="h-title" style="margin:0 0 4px">3v3 友谊切磋</h2>
      <p class="tiny muted">双方各出3只宝可梦，全部由AI自动对战。你只需设置好队伍，挑战朋友的存档队伍即可。</p>
    </div>

    <div class="panel" style="margin-bottom:12px">
      <div class="bold" style="margin-bottom:8px">我的切磋队伍</div>
      <div v-if="myTeam.length===0" class="tiny muted">尚未设置。请到「队伍」页选择3只宝可梦。</div>
      <div class="grid grid-3" v-else>
        <div v-for="p in myTeam" :key="p.uid"><PokemonCard :instance="p" /></div>
      </div>
    </div>

    <div class="panel" style="margin-bottom:12px">
      <div class="bold" style="margin-bottom:8px">好友</div>
      <div class="row">
        <input v-model="friendName" placeholder="输入好友用户名" class="grow" />
        <button class="sm" @click="addFriend">添加好友</button>
      </div>
      <div class="row wrap" style="margin-top:8px" v-if="friends.length">
        <button v-for="f in friends" :key="f" class="sm ghost" @click="opponentName=f">{{ f }}</button>
      </div>
    </div>

    <div class="panel">
      <div class="bold" style="margin-bottom:8px">挑战对手</div>
      <div class="row">
        <input v-model="opponentName" placeholder="对手用户名" class="grow" @keyup.enter="fetchOpponent" />
        <button class="sm" :disabled="busy || !opponentName" @click="fetchOpponent">{{ busy ? '查找中…' : '查找队伍' }}</button>
      </div>
      <p class="tiny" style="color:var(--bad)" v-if="error">{{ error }}</p>
      <div v-if="opponentTeam && opponentTeam.length" style="margin-top:10px">
        <div class="tiny muted">对手 {{ opponentName }} 的队伍：</div>
        <div class="grid grid-3" style="margin-top:6px">
          <div v-for="p in opponentTeam" :key="p.uid" class="opp-cell">
            <div class="bold tiny">{{ getSpecies(p.speciesId).name }}</div>
            <div class="tiny muted">Lv.{{ p.level }}</div>
          </div>
        </div>
        <button class="gold" style="width:100%;margin-top:10px" @click="startBattle">开始切磋！</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.opp-cell { background: var(--panel-2); border-radius: 8px; padding: 6px; text-align: center; color: var(--ink); }
</style>
