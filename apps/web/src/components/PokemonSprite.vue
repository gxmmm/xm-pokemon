<script setup lang="ts">
import { ref, computed, watch } from 'vue';

const props = withDefaults(defineProps<{ speciesId: number; back?: boolean; size?: number; faded?: boolean }>(), {
  size: 96,
});
const errored = ref(false);
const src = computed(() => `/sprites/pokemon/${props.back ? 'back/' : ''}${props.speciesId}.png`);
watch(() => props.speciesId, () => { errored.value = false; });
</script>

<template>
  <img
    v-if="!errored"
    :src="src"
    :width="size"
    :height="size"
    class="poke-sprite"
    :style="{ opacity: faded ? 0.45 : 1, filter: faded ? 'grayscale(0.6)' : 'none' }"
    alt=""
    @error="errored = true"
  />
  <div v-else class="sprite-fallback" :style="{ width: size + 'px', height: size + 'px' }">
    <img src="/sprites/icons/pokeball.png" :width="size * 0.6" :height="size * 0.6" class="poke-sprite" alt="" />
  </div>
</template>

<style scoped>
.sprite-fallback { display: flex; align-items: center; justify-content: center; opacity: .5; }
</style>
