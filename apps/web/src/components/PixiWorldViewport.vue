<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { WorldSceneSpec } from '@pokemon-online/config';
import type { QualityProfile, SceneTransitionRequest, WorldEntityRenderSnapshot } from '@pokemon-online/renderer';
import { WorldStage } from '@pokemon-online/renderer-pixi';

const props = defineProps<{
  scene: WorldSceneSpec;
  entities: readonly WorldEntityRenderSnapshot[];
  quality?: QualityProfile;
}>();
const emit = defineEmits<{
  ready: [];
  unavailable: [message: string];
}>();

const host = ref<HTMLElement | null>(null);
const stage = new WorldStage(props.quality ?? 'standard');
let mounted = false;
let enteredSceneId: string | null = null;

async function syncScene(): Promise<void> {
  if (!mounted) return;
  if (enteredSceneId !== props.scene.id) {
    await stage.enterScene({ sceneId: props.scene.id, biomeId: props.scene.biome }, props.scene);
    enteredSceneId = props.scene.id;
  }
  stage.applyWorldSnapshot({ time: performance.now() / 1000, entities: props.entities });
}

onMounted(async () => {
  await nextTick();
  if (!host.value) return;
  try {
    await stage.mount(host.value);
    mounted = true;
    await syncScene();
    emit('ready');
  } catch (error) {
    const message = error instanceof Error ? error.message : '无法初始化 GPU 世界渲染器';
    emit('unavailable', message);
  }
});

async function playTransition(request: SceneTransitionRequest): Promise<void> {
  if (mounted) await stage.transition(request);
}

watch(() => props.quality, (quality) => stage.setQuality(quality ?? 'standard'));
watch(() => props.scene.id, () => { void syncScene(); });
// WorldView remains authoritative for movement and interaction. This bridge only
// mirrors its structured entity snapshot into the GPU stage.
watch(() => props.entities, () => { void syncScene(); }, { deep: true });

defineExpose({ playTransition });

onUnmounted(() => {
  mounted = false;
  enteredSceneId = null;
  stage.unmount();
});
</script>

<template>
  <div ref="host" class="pixi-world-viewport" aria-label="GPU world renderer"></div>
</template>

<style scoped>
.pixi-world-viewport { width: min(100%, 920px); aspect-ratio: 16 / 9; overflow: hidden; border-radius: 10px; box-shadow: 0 5px 20px rgba(0,0,0,.25); }
</style>
