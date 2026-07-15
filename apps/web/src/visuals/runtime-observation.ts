export type RendererObservationStage = 'world' | 'battle';

export interface RendererObservationSample {
  stage: RendererObservationStage;
  atMs: number;
  heapUsedBytes?: number;
  diagnostics: Record<string, unknown>;
}

export interface RendererObservationReport {
  version: 1;
  startedAtMs: number;
  samples: readonly RendererObservationSample[];
  stageMounts: Readonly<Record<RendererObservationStage, number>>;
}

declare global {
  interface Window {
    __PO_RENDERER_OBSERVATION__?: () => RendererObservationReport;
  }
}

const query = new URLSearchParams(window.location.search);
const SESSION_KEY = 'pokemon-online.renderer-observation.v1';
const WORLD_SCENE_DIAGNOSTIC_KEY = 'pokemon-online.renderer-observation.world-scene.v1';
if (query.get('renderer-observation') === '1') {
  try { window.sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* keep explicit URL-only mode if storage is unavailable */ }
}
const observationRequested = query.get('renderer-observation') === '1'
  || (() => { try { return window.sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; } })();
const requestedWorldSceneDiagnostic = query.get('world-gpu-diagnostic');
// A normal in-app navigation may drop the URL query before this module is
// evaluated again. When an authenticated observation session is already active,
// preserve the recorded target instead of clearing its pending-map diagnostic.
const storedWorldSceneDiagnostic = (() => { try { return window.sessionStorage.getItem(WORLD_SCENE_DIAGNOSTIC_KEY); } catch { return null; } })();
if (requestedWorldSceneDiagnostic && observationRequested) {
  try { window.sessionStorage.setItem(WORLD_SCENE_DIAGNOSTIC_KEY, requestedWorldSceneDiagnostic); } catch { /* explicit URL-only mode remains available */ }
}
export const rendererObservationEnabled = observationRequested;
/** Explicit authenticated observation-only override used to exercise a pending
 * WorldScene through the real WorldView before its formal migration gate grows.
 * It never changes config eligibility, saves, route guards, or renderer-pixi. */
export const rendererObservationWorldSceneMapId = rendererObservationEnabled
  ? (requestedWorldSceneDiagnostic || storedWorldSceneDiagnostic)
  : null;
export function isRendererObservationWorldScene(mapId: string): boolean {
  return rendererObservationWorldSceneMapId === mapId;
}
export function hasRendererObservationWorldScene(mapId: string): boolean {
  return rendererObservationWorldSceneMapId === mapId;
}
const startedAtMs = performance.now();
const samples: RendererObservationSample[] = [];
const stageMounts: Record<RendererObservationStage, number> = { world: 0, battle: 0 };
const SAMPLE_INTERVAL_MS = 1000;
const MAX_SAMPLES = 720;

function exposeReport(): void {
  window.__PO_RENDERER_OBSERVATION__ = () => ({
    version: 1,
    startedAtMs,
    samples: [...samples],
    stageMounts: { ...stageMounts },
  });
}

function sample(stage: RendererObservationStage, readDiagnostics: () => Record<string, unknown>): void {
  const memory = performance as Performance & { memory?: { usedJSHeapSize?: number } };
  samples.push({ stage, atMs: Math.round(performance.now() - startedAtMs), heapUsedBytes: memory.memory?.usedJSHeapSize, diagnostics: readDiagnostics() });
  if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
  exposeReport();
}

/** Starts explicit opt-in diagnostics for an already-authenticated playable
 * route. It only reads renderer-local metrics; it never changes route guards,
 * game state, renderer state, or saves. */
export function startRendererObservation(stage: RendererObservationStage, readDiagnostics: () => Record<string, unknown>): () => void {
  if (!rendererObservationEnabled) return () => {};
  stageMounts[stage]++;
  sample(stage, readDiagnostics);
  const timer = window.setInterval(() => sample(stage, readDiagnostics), SAMPLE_INTERVAL_MS);
  return () => window.clearInterval(timer);
}
