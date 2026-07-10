<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.ts';
import { useGameStore } from '../stores/game.ts';

const auth = useAuthStore();
const game = useGameStore();
const router = useRouter();

const mode = ref<'login' | 'register'>('login');
const username = ref('');
const password = ref('');
const error = ref<string | null>(null);
const busy = ref(false);

async function submit(): Promise<void> {
  error.value = null;
  if (!username.value || !password.value) { error.value = '请输入用户名和密码'; return; }
  busy.value = true;
  try {
    if (mode.value === 'login') await auth.login(username.value, password.value);
    else await auth.register(username.value, password.value);
    await game.load();
    if (game.hasSave) router.replace({ name: 'world' });
    else router.replace({ name: 'new' });
  } catch (e) {
    error.value = e instanceof Error ? e.message : '操作失败';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="login-wrap">
    <div class="login-card panel">
      <div class="center col" style="gap:4px;margin-bottom:14px">
        <img src="/sprites/icons/pokeball.png" width="56" height="56" class="poke-sprite" alt="" />
        <h1 class="h-title">Pokémon Online</h1>
        <p class="muted tiny">和朋友一起探索、收集、培养的宝可梦世界</p>
      </div>
      <div class="tabs">
        <button :class="{ active: mode === 'login' }" @click="mode = 'login'">登录</button>
        <button :class="{ active: mode === 'register' }" @click="mode = 'register'">注册</button>
      </div>
      <div class="col">
        <input v-model="username" placeholder="用户名（2-20位）" @keyup.enter="submit" />
        <input v-model="password" type="password" placeholder="密码（至少4位）" @keyup.enter="submit" />
        <button class="gold" :disabled="busy" @click="submit">{{ busy ? '处理中…' : (mode === 'login' ? '登录' : '注册并开始') }}</button>
        <p class="error tiny" v-if="error">{{ error }}</p>
      </div>
      <p class="tiny muted center" style="margin-top:14px">
        朋友之间共同游玩 · 捕获100%成功 · 无排行榜无体力
      </p>
    </div>
  </div>
</template>

<style scoped>
.login-wrap { flex:1; display:flex; align-items:center; justify-content:center; padding:16px; }
.login-card { width: 100%; max-width: 380px; }
.tabs { display:flex; gap:6px; margin-bottom:12px; }
.tabs button { flex:1; background:var(--panel-2); color:var(--ink); }
.tabs button.active { background:var(--accent); color:#fff; }
.error { color: var(--bad); text-align:center; }
</style>
