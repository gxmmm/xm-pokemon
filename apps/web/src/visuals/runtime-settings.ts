import { ref } from 'vue';
import {
  DEFAULT_VISUAL_RUNTIME_SETTINGS,
  type CameraIntensity,
  type VisualRuntimeSettings,
} from '@pokemon-online/renderer';

const STORAGE_KEY = 'pokemon-online.visual-runtime-settings.v1';
const cameraIntensities: readonly CameraIntensity[] = ['full', 'reduced', 'off'];

function readVisualRuntimeSettings(): VisualRuntimeSettings {
  const fallback = { ...DEFAULT_VISUAL_RUNTIME_SETTINGS };
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return fallback;
    const candidate = JSON.parse(saved) as Partial<VisualRuntimeSettings>;
    return {
      reduceFlicker: candidate.reduceFlicker === true,
      cameraIntensity: cameraIntensities.includes(candidate.cameraIntensity as CameraIntensity)
        ? candidate.cameraIntensity as CameraIntensity
        : fallback.cameraIntensity,
    };
  } catch {
    return fallback;
  }
}

/** Device-local presentation preferences. They intentionally do not use Pinia,
 * PlayerSave, or the sync API, so accessibility choices never alter save semantics. */
export const visualRuntimeSettings = ref<VisualRuntimeSettings>(readVisualRuntimeSettings());

export function updateVisualRuntimeSettings(patch: Partial<VisualRuntimeSettings>): void {
  visualRuntimeSettings.value = { ...visualRuntimeSettings.value, ...patch };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(visualRuntimeSettings.value));
  } catch {
    // Private-mode or storage-quota failures must not block the visual controls.
  }
}
