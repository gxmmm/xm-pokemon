<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useGameStore } from '../stores/game.ts';
import { useAuthStore } from '../stores/auth.ts';

const game = useGameStore();
const auth = useAuthStore();
const router = useRouter();
const busy = ref(false);
async function retry(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  try { await router.replace({ name: 'world' }); }
  finally { busy.value = false; }
}
</script>

<template>
  <div class="load-error-wrap">
    <div class="panel">
      <h2 class="h-title">暂时无法读取进度</h2>
      <p role="alert">{{ auth.error || game.error || '请检查网络后重试。' }}</p>
      <p class="muted tiny">连接恢复后将继续读取云端存档。</p>
      <button class="gold" :disabled="busy" @click="retry">{{ busy ? '读取中…' : '重新读取' }}</button>
    </div>
  </div>
</template>

<style scoped>
.load-error-wrap { display:flex; flex:1; align-items:center; justify-content:center; padding:24px; }
.panel { width:440px; max-width:100%; }
</style>
