import { computed, ref } from 'vue';
import {
  DEFAULT_VISUAL_RUNTIME_SETTINGS,
  selectQualityProfile,
  type CameraIntensity,
  type QualityPreference,
  type VisualRuntimeSettings,
} from '@pokemon-online/renderer';

const STORAGE_KEY = 'pokemon-online.visual-runtime-settings.v1';
const cameraIntensities: readonly CameraIntensity[] = ['full', 'reduced', 'off'];
const qualityPreferences: readonly QualityPreference[] = ['auto', 'cinematic', 'standard', 'compatibility'];

function isQualityPreference(value: unknown): value is QualityPreference {
  return qualityPreferences.includes(value as QualityPreference);
}

function readVisualRuntimeSettings(): VisualRuntimeSettings {
  const fallback = { ...DEFAULT_VISUAL_RUNTIME_SETTINGS };
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return fallback;
    const candidate = JSON.parse(saved) as Partial<VisualRuntimeSettings>;
    return {
      qualityPreference: isQualityPreference(candidate.qualityPreference) ? candidate.qualityPreference : fallback.qualityPreference,
      reduceFlicker: candidate.reduceFlicker === true,
      cameraIntensity: cameraIntensities.includes(candidate.cameraIntensity as CameraIntensity)
        ? candidate.cameraIntensity as CameraIntensity
        : fallback.cameraIntensity,
    };
  } catch {
    return fallback;
  }
}

function probeBrowserRenderer(): { webgl: boolean; webgl2: boolean; devicePixelRatio: number; deviceMemoryGb?: number } {
  const probe = document.createElement('canvas');
  const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number };
  return {
    webgl: !!probe.getContext('webgl'),
    webgl2: !!probe.getContext('webgl2'),
    devicePixelRatio: window.devicePixelRatio || 1,
    deviceMemoryGb: navigatorWithMemory.deviceMemory,
  };
}

/** Device-local presentation preferences. They intentionally do not use Pinia,
 * PlayerSave, or the sync API, so accessibility choices never alter save semantics. */
export const visualRuntimeSettings = ref<VisualRuntimeSettings>(readVisualRuntimeSettings());
const browserRendererProbe = probeBrowserRenderer();

/** Browser probing stays in the Vue bridge. The renderer package only receives
 * the resolved QualityProfile, while the pure policy remains testable in renderer. */
export const visualRuntimeCapabilities = computed(() => selectQualityProfile({
  ...browserRendererProbe,
  preferredQuality: visualRuntimeSettings.value.qualityPreference === 'auto'
    ? undefined
    : visualRuntimeSettings.value.qualityPreference,
}));

export function updateVisualRuntimeSettings(patch: Partial<VisualRuntimeSettings>): void {
  visualRuntimeSettings.value = { ...visualRuntimeSettings.value, ...patch };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(visualRuntimeSettings.value));
  } catch {
    // Private-mode or storage-quota failures must not block the visual controls.
  }
}
