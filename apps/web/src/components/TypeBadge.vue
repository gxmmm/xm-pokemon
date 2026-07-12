<script setup lang="ts">
import { computed } from 'vue';
import { TYPE_COLORS, TYPE_LABELS_CN, typeTooltipText } from '@pokemon-online/config';
import type { TypeName } from '@pokemon-online/shared';
import Tip from './Tip.vue';
const props = defineProps<{ type: TypeName; size?: 'sm' | 'md' }>();
const color = computed(() => TYPE_COLORS[props.type]);
const label = computed(() => TYPE_LABELS_CN[props.type]);
const tip = computed(() => typeTooltipText(props.type));
</script>

<template>
  <Tip :text="tip" :clickable="false">
    <span class="type-badge" :class="size" :style="{ background: color }">{{ label }}</span>
  </Tip>
</template>

<style scoped>
.type-badge.sm { font-size: 10px; padding: 1px 6px; }
</style>
