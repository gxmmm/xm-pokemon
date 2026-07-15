import type { BattleCombatant, TypeName } from '@pokemon-online/shared';

export type QualityProfile = 'cinematic' | 'standard' | 'compatibility';
export type QualityPreference = 'auto' | QualityProfile;
export type CameraIntensity = 'full' | 'reduced' | 'off';

/** Low-frequency presentation preferences. They contain no game, save, or
 * simulation state and cross the Vue-to-renderer bridge as a renderer-neutral DTO. */
export interface VisualRuntimeSettings {
  qualityPreference: QualityPreference;
  reduceFlicker: boolean;
  cameraIntensity: CameraIntensity;
}

export const DEFAULT_VISUAL_RUNTIME_SETTINGS: Readonly<VisualRuntimeSettings> = {
  qualityPreference: 'auto',
  reduceFlicker: false,
  cameraIntensity: 'full',
};
export type AssetKey = string & { readonly __assetKey: unique symbol };

export interface SceneTransitionRequest {
  kind: 'fade' | 'mask' | 'biome-crossfade';
  durationMs?: number;
  color?: string;
}

export interface GameRenderer {
  mount(container: HTMLElement): Promise<void>;
  unmount(): void;
  setQuality(profile: QualityProfile): void;
  preload(keys: readonly AssetKey[]): Promise<void>;
  transition(request: SceneTransitionRequest): Promise<void>;
}

export interface WorldEntityRenderSnapshot {
  id: string;
  kind: 'player' | 'npc' | 'wild' | 'object';
  position: { x: number; y: number };
  facing?: 'up' | 'down' | 'left' | 'right';
}

export interface WorldRenderInput {
  sceneId: string;
  biomeId: string;
}

export interface WorldRenderSnapshot {
  time: number;
  entities: readonly WorldEntityRenderSnapshot[];
}

export type WorldCue =
  | { type: 'camera-focus'; entityId: string }
  | { type: 'entity-animation'; entityId: string; animation: 'idle' | 'walk' | 'run' | 'interact' }
  | { type: 'ambience'; id: string; intensity?: number };

export interface BattleRenderInput {
  biomeId: string;
  combatants: readonly BattleCombatant[];
}

export interface BattleRenderSnapshot {
  time: number;
  combatants: readonly BattleCombatant[];
}

/** Kept independent from presentation so a renderer package never has to
 * import a director implementation. Presentation is structurally compatible. */
export type BattleCue =
  | { type: 'camera'; plan: { style: string; focusIds: readonly string[]; durationMs: number; zoom?: number; shake?: number } }
  | { type: 'vfx'; recipe: { id: string; element?: TypeName; delivery?: string; variant?: string; particleBudget?: number }; anchors: { actorId?: string; targetIds?: readonly string[] }; intensity: number }
  | { type: 'animation'; subjectId: string; animation: string }
  | { type: 'hit-stop'; milliseconds: number }
  | { type: 'time-scale'; scale: number; durationMs: number }
  | { type: 'environment'; reaction: string }
  | { type: 'sound'; cue: { id: string; volume?: number } };

export interface WorldRenderer extends GameRenderer {
  enterWorld(input: WorldRenderInput): Promise<void>;
  applyWorldSnapshot(snapshot: WorldRenderSnapshot): void;
  playWorldCues(cues: readonly WorldCue[]): Promise<void>;
}

export interface BattleRenderer extends GameRenderer {
  enterBattle(input: BattleRenderInput): Promise<void>;
  applyBattleSnapshot(snapshot: BattleRenderSnapshot): void;
  playBattleCues(cues: readonly BattleCue[]): Promise<void>;
  isSettled(): boolean;
}
