<script setup lang="ts">
import { useRouter } from 'vue-router';
// "返回探索" - quick return to the world hub from any sub-view.
const router = useRouter();
function back(): void { router.push({ name: 'world' }); }
</script>

<template>
  <button class="sm ghost back-hub" @click="back" title="返回探索">← 探索</button>
</template>

<style scoped>
.back-hub { color: #eaf0ff; }
</style>
