<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { BattlePresentation, DirectedBattleCue } from '@pokemon-online/presentation';
import type { QualityProfile, SceneTransitionRequest, VisualRuntimeSettings } from '@pokemon-online/renderer';
import { BattleStage } from '@pokemon-online/renderer-pixi';
import { startRendererObservation } from '../visuals/runtime-observation.ts';

const props = defineProps<{
  presentation?: BattlePresentation;
  cues?: readonly DirectedBattleCue[];
  biome: string;
  quality?: QualityProfile;
  visualSettings?: VisualRuntimeSettings;
  introTransition?: boolean;
}>();
const emit = defineEmits<{
  ready: [];
  unavailable: [message: string];
}>();

const host = ref<HTMLElement | null>(null);
const stage = new BattleStage(props.quality ?? 'standard');
let mounted = false;
let stopObservation: (() => void) | null = null;
let enteredBiome: string | null = null;

async function syncPresentation(presentation = props.presentation): Promise<void> {
  if (!mounted || !presentation) return;
  if (enteredBiome !== props.biome) {
    await stage.enterBattle({ biomeId: props.biome, combatants: presentation.combatants });
    enteredBiome = props.biome;
  }
  stage.applyBattleSnapshot(presentation);
}

async function syncCues(cues = props.cues ?? []): Promise<void> {
  if (!mounted || cues.length === 0) return;
  await stage.playBattleCues(cues.map((entry) => entry.cue));
}

onMounted(async () => {
  await nextTick();
  if (!host.value) return;
  try {
    await stage.mount(host.value);
    mounted = true;
    stage.setVisualSettings(props.visualSettings);
    await syncPresentation();
    await syncCues();
    if (props.introTransition) await stage.transition({ kind: 'biome-crossfade', durationMs: 240, color: '#0b2430' });
    stopObservation = startRendererObservation('battle', () => stage.getDiagnostics() as unknown as Record<string, unknown>);
    emit('ready');
  } catch (error) {
    const message = error instanceof Error ? error.message : '无法初始化 GPU 战斗渲染器';
    emit('unavailable', message);
  }
});

watch(() => props.quality, (quality) => stage.setQuality(quality ?? 'standard'));
watch(() => props.visualSettings, (settings) => stage.setVisualSettings(settings), { deep: true });
watch(() => props.presentation, (presentation) => { void syncPresentation(presentation); });
// BattlePresentationBridge supplies an incremental array each frame. Deliberately
// do not re-read engine events here: both Canvas and Pixi consume director cues.
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
  stopObservation?.();
  stopObservation = null;
  mounted = false;
  enteredBiome = null;
  stage.unmount();
});
</script>

<template>
  <div ref="host" class="pixi-battle-viewport" aria-label="GPU battle renderer"></div>
</template>

<style scoped>
.pixi-battle-viewport { position: absolute; inset: 0; overflow: hidden; }
</style>
