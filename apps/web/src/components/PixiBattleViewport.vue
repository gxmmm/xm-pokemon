<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { BattlePresentation, DirectedBattleCue } from '@pokemon-online/presentation';
import type { SceneTransitionRequest, VisualRuntimeSettings } from '@pokemon-online/renderer';
import { BattleStage } from '@pokemon-online/renderer-pixi';
import { startRendererObservation } from '../visuals/runtime-observation.ts';

const props = defineProps<{
  presentation?: BattlePresentation;
  cues?: readonly DirectedBattleCue[];
  biome: string;
  visualSettings?: VisualRuntimeSettings;
  introTransition?: boolean;
}>();
const emit = defineEmits<{
  ready: [];
  unavailable: [message: string];
}>();

const host = ref<HTMLElement | null>(null);
const stage = new BattleStage();
let mounted = false;
let disposed = false;
let stopObservation: (() => void) | null = null;
let enteredBiome: string | null = null;
let entering: { biome: string; promise: Promise<void> } | null = null;

async function syncPresentation(presentation = props.presentation): Promise<void> {
  if (disposed || !mounted || !presentation) return;
  const biome = props.biome;
  if (enteredBiome !== biome || entering) {
    // Snapshot updates during loading share one request for the desired biome.
    // Returning to the visible biome must also supersede another pending biome.
    if (entering?.biome !== biome) {
      entering = { biome, promise: stage.enterBattle({ biomeId: biome, combatants: presentation.combatants }) };
    }
    const pending = entering;
    try {
      await pending.promise;
    } catch (error) {
      if (entering !== pending || disposed) return;
      entering = null;
      throw error;
    }
    if (disposed || !mounted || entering !== pending || props.biome !== biome) return;
    enteredBiome = biome;
    entering = null;
    // Do not restore the snapshot captured before asynchronous asset loading.
    if (props.presentation) stage.applyBattleSnapshot(props.presentation);
    return;
  }
  stage.applyBattleSnapshot(presentation);
}

async function syncCues(cues = props.cues ?? []): Promise<void> {
  if (disposed || !mounted || entering || cues.length === 0) return;
  await stage.playBattleCues(cues.map((entry) => entry.cue));
}

onMounted(async () => {
  await nextTick();
  if (disposed || !host.value) return;
  try {
    await stage.mount(host.value);
    if (disposed) return;
    mounted = true;
    stage.setVisualSettings(props.visualSettings);
    await syncPresentation();
    while (!disposed && props.presentation && (entering || enteredBiome !== props.biome)) await syncPresentation();
    if (disposed) return;
    await syncCues();
    if (disposed) return;
    if (props.introTransition) await stage.transition({ kind: 'biome-crossfade', durationMs: 240, color: '#0b2430' });
    if (disposed) return;
    stopObservation = startRendererObservation('battle', () => stage.getDiagnostics() as unknown as Record<string, unknown>);
    emit('ready');
  } catch (error) {
    reportUnavailable(error);
  }
});

function reportUnavailable(error: unknown): void {
  if (disposed) return;
  const message = error instanceof Error ? error.message : '无法初始化 GPU 战斗渲染器';
  emit('unavailable', message);
}

watch(() => props.visualSettings, (settings) => stage.setVisualSettings(settings), { deep: true });
watch(() => props.presentation, (presentation) => { void syncPresentation(presentation).catch(reportUnavailable); });
watch(() => props.biome, () => { void syncPresentation().catch(reportUnavailable); });
// BattlePresentationBridge supplies an incremental array each frame. Deliberately
// do not re-read engine events here; BattleStage consumes the director cues.
watch(() => props.cues, (cues) => { void syncCues(cues); });

async function playTransition(request: SceneTransitionRequest): Promise<void> {
  if (mounted) await stage.transition(request);
}

function isPresentationSettled(): boolean {
  return mounted && stage.isSettled();
}

function getDiagnostics() { return stage.getDiagnostics(); }

defineExpose({ getDiagnostics, isPresentationSettled, playTransition });

onUnmounted(() => {
  disposed = true;
  stopObservation?.();
  stopObservation = null;
  mounted = false;
  enteredBiome = null;
  entering = null;
  stage.unmount();
});
</script>

<template>
  <div ref="host" class="pixi-battle-viewport" aria-label="GPU battle renderer"></div>
</template>

<style scoped>
.pixi-battle-viewport { position: absolute; inset: 0; overflow: hidden; }
</style>
