import type { BattleActorChoreography, TypeName } from '@pokemon-online/shared';

/** One standard composition: spread accents support, rather than bury, actors. */
export const BATTLE_EFFECT_COMPOSITION = {
  groundRingScaleY: 0.38,
  spreadBurstOpacity: 0.28,
} as const;
export type BattleEffectLayer = 'ground' | 'front';

/** Ordinary damage accents never replace the actor's ongoing skill timeline. */
export const BATTLE_HIT_REACTION = { durationMs: 160, offsetX: 4 } as const;

/** Shared world/battle visual vocabulary. These are static data contracts;
 * renderer implementations must not add map- or skill-id branches to replace
 * them. The first two scene packs are configuration-only Stage 1 prototypes. */
export type BiomeId = 'mist-harbor' | 'illusion-tower';

export interface BiomeVisualSpec {
  id: BiomeId;
  palette: {
    sky: string;
    ambient: string;
    fog: string;
    ground: string;
    accent: string;
  };
  ambience: {
    fogDensity: number;
    particleKind: 'mist' | 'pollen' | 'ember' | 'spray' | 'dust' | 'starlight' | 'rune';
    particleDensity: number;
  };
  battleEnvironment: 'harbor' | 'forest' | 'route' | 'cavern' | 'sea' | 'grotto' | 'ruin' | 'tower';
}

export interface SceneLayerSpec {
  id: string;
  assetKey?: string;
  depth: number;
  parallax?: number;
}

export interface WorldScenePalette {
  backdrop: string;
  ground: string;
  path: string;
  shadow: string;
  accent: string;
  fog: string;
}

export interface WorldLandmarkSpec {
  id: string;
  kind: 'lighthouse' | 'building' | 'dock' | 'boulder' | 'path' | 'roof' | 'fog-bank' | 'crystal-cluster' | 'rift-mist' | 'cave-veil' | 'stone-terrace' | 'cave-shadow';
  x: number; y: number; width?: number; height?: number; depth: 'terrain' | 'scenery' | 'occlusion' | 'foreground';
}

export type WorldCharacterAppearance = 'hero' | 'fisher';
export type WorldCharacterBehavior = 'idle' | 'sort-nets';
export interface WorldCharacterSpec {
  id: string;
  appearance: WorldCharacterAppearance;
  behavior: WorldCharacterBehavior;
  /** Omit position for a dynamic entity supplied by the authoritative world snapshot. */
  x?: number;
  y?: number;
}

export type WorldScenePreloadKey = 'procedural-primitives';

/** Scene-local caps are renderer-ready configuration, not gameplay state.
 * `preloadKeys` deliberately scopes loading to the active scene; current packs
 * use procedural primitives only and therefore never preload global assets. */
export interface WorldSceneResourceBudget {
  preloadKeys: readonly WorldScenePreloadKey[];
  landmarkLimit: number;
  staticContainerLimit: number;
  ambientParticleLimit: number;
  entityLimit: number;
}

export interface WorldSceneSpec {
  id: string;
  mapId: string;
  biome: BiomeId;
  terrain: readonly SceneLayerSpec[];
  scenery: readonly SceneLayerSpec[];
  occlusion: readonly SceneLayerSpec[];
  foreground: readonly SceneLayerSpec[];
  ambience: { preset: BiomeVisualSpec['ambience']['particleKind']; density: number };
  palette: WorldScenePalette;
  landmarks?: readonly WorldLandmarkSpec[];
  characters?: readonly WorldCharacterSpec[];
  resources: WorldSceneResourceBudget;
}

export interface WorldSceneBudgetReport {
  sceneId: string;
  mapId: string;
  landmarkCount: number;
  staticContainerCount: number;
  dynamicEntityCount: number;
  ambientParticleCount: number;
  preloadKeyCount: number;
  fingerprint: string;
}

export interface WorldSceneBudgetValidationReport {
  duplicateSceneIds: readonly string[];
  duplicateMapIds: readonly string[];
  missingGpuSceneMapIds: readonly string[];
  unknownPreloadKeys: readonly string[];
  overBudgetSceneIds: readonly string[];
  mismatchedBaselineMapIds: readonly string[];
}

export type SkillVisualTier = 'basic' | 'signature' | 'finisher';
export type DeliveryKind = 'melee' | 'projectile' | 'beam' | 'area' | 'aura';
export type SkillVisualImpact = 'spark' | 'burst' | 'wave' | 'rune' | 'heal' | 'status';
export type EnvironmentReaction = 'scorch' | 'frost' | 'spark' | 'splash' | 'spore' | 'debris' | 'rune-pulse';
export type SkillRecipeVariant = 'default' | 'cross' | 'meteor' | 'chain' | 'surge' | 'hymn' | 'crown' | 'chant' | 'dive' | 'bind' | 'snare'
  | 'flame-stream' | 'fire-glyph' | 'arc-bolt' | 'sky-strike'
  | 'fist' | 'claw' | 'bite' | 'horn' | 'tail' | 'body-slam' | 'wing-slap' | 'beak-peck' | 'tusk-gore' | 'pincer-snap' | 'whip-lash' | 'kick' | 'shell-bash'
  | 'flame-bolt' | 'water-shot' | 'spark-bolt' | 'leaf-shot' | 'ice-shard' | 'psychic-bolt' | 'shadow-orb' | 'stone-shot' | 'wind-cutter' | 'fairy-spark' | 'neutral-star';

export interface SkillVisualRecipe {
  id: string;
  skillId: string;
  element: TypeName;
  tier: SkillVisualTier;
  delivery: DeliveryKind;
  impact: SkillVisualImpact;
  camera: 'light' | 'track' | 'impact' | 'finisher';
  environmentReaction?: EnvironmentReaction;
  /** Renderer-neutral primitive detail; it selects an existing generic motif,
   * never names an individual skill in renderer-pixi. */
  variant?: SkillRecipeVariant;
  /** Optional actor-side motion/visibility choreography. It is static recipe
   * data; presentation forwards it and renderer consumers only execute the DTO. */
  actorChoreography?: BattleActorChoreography;
  /** Upper bound for the burst primitive in the standard renderer. */
  particleBudget: number;
}


export const BIOME_VISUALS: Readonly<Record<BiomeId, BiomeVisualSpec>> = {
  'mist-harbor': {
    id: 'mist-harbor',
    palette: { sky: '#90b6c7', ambient: '#cfe4e9', fog: '#dff4f1', ground: '#55777c', accent: '#f1cd83' },
    ambience: { fogDensity: 0.52, particleKind: 'mist', particleDensity: 0.42 },
    battleEnvironment: 'harbor',
  },
  'illusion-tower': {
    id: 'illusion-tower',
    palette: { sky: '#24113d', ambient: '#895ac2', fog: '#d4b4ff', ground: '#493069', accent: '#7be9ff' },
    ambience: { fogDensity: 0.22, particleKind: 'rune', particleDensity: 0.5 },
    battleEnvironment: 'tower',
  },
};

/** The tower uses one parameterized Scene Pack factory across its five floors.
 * Floor index only selects static visual composition; collision, encounter bands,
 * progression and stair warps remain owned by the existing map configuration. */
export const ILLUSION_TOWER_SCENE_MAP_IDS = ['illusion-tower-1', 'illusion-tower-2', 'illusion-tower-3', 'illusion-tower-4', 'illusion-tower-5'] as const;

function illusionTowerScene(floor: number): WorldSceneSpec {
  const isSummit = floor === 5;
  const paletteByFloor: readonly WorldScenePalette[] = [
    { backdrop: '#24113d', ground: '#493069', path: '#7c618f', shadow: '#1a102c', accent: '#7be9ff', fog: '#d4b4ff' },
    { backdrop: '#291244', ground: '#53316f', path: '#89639c', shadow: '#1c1030', accent: '#a58bff', fog: '#dfc5ff' },
    { backdrop: '#2e154a', ground: '#613777', path: '#9b6ca8', shadow: '#201137', accent: '#f0a6ff', fog: '#efd0ff' },
    { backdrop: '#351852', ground: '#6c3d80', path: '#aa779e', shadow: '#25143f', accent: '#ffc27b', fog: '#f5d9ff' },
    { backdrop: '#3d1a5b', ground: '#79458b', path: '#bd8dac', shadow: '#2b1649', accent: '#fff0a6', fog: '#ffe3ff' },
  ];
  const palette = paletteByFloor[floor - 1]!;
  const suffix = `f${floor}`;
  return {
    id: `illusion-tower-training-${floor}`,
    mapId: ILLUSION_TOWER_SCENE_MAP_IDS[floor - 1]!,
    biome: 'illusion-tower',
    terrain: [{ id: 'illusion-stone-floor', depth: 2 }, { id: 'projection-walkway', depth: 2 }],
    scenery: [{ id: 'rune-terraces', depth: 3 }, { id: 'projection-crystals', depth: 3 }, { id: 'floating-rift-mist', depth: 3 }],
    occlusion: [{ id: 'near-tower-shadow', depth: 5 }],
    foreground: [{ id: 'front-rune-veil', depth: 6, parallax: 1.08 }],
    ambience: { preset: 'rune', density: 0.44 + floor * 0.035 },
    palette,
    characters: [{ id: 'player', appearance: 'hero', behavior: 'idle' }],
    /** Generic terrace/crystal/rift grammar. Nothing here identifies a collision
     * cell, encounter species, stair coordinate, or floor-transition rule. */
    landmarks: [
      { id: `tower-far-rift-${suffix}`, kind: 'rift-mist', x: 0.3, y: 0.4, width: 15.4, height: 2.5, depth: 'scenery' },
      { id: `tower-west-terrace-${suffix}`, kind: 'stone-terrace', x: 0.4, y: 2.1, width: 4.0, height: 8.7, depth: 'scenery' },
      { id: `tower-east-terrace-${suffix}`, kind: 'stone-terrace', x: 11.6, y: 1.8, width: 4.0, height: 9.1, depth: 'scenery' },
      { id: `tower-central-path-${suffix}`, kind: 'path', x: 6.3, y: 0.6, width: 3.4, height: 12.3, depth: 'terrain' },
      { id: `tower-west-crystals-${suffix}`, kind: 'crystal-cluster', x: 2.4, y: 3.0, width: 2.8, height: 3.0, depth: 'scenery' },
      { id: `tower-east-crystals-${suffix}`, kind: 'crystal-cluster', x: 10.6, y: 4.2, width: 2.7, height: 3.1, depth: 'scenery' },
      { id: `tower-lower-crystals-${suffix}`, kind: 'crystal-cluster', x: 6.4, y: 8.9, width: 3.2, height: 2.4, depth: 'scenery' },
      { id: `tower-projection-stones-${suffix}`, kind: 'boulder', x: 3.2, y: 9.9, width: 2.1, height: 1.4, depth: 'scenery' },
      { id: `tower-north-shadow-${suffix}`, kind: 'cave-shadow', x: 0.4, y: 0, width: 6.0, height: 2.3, depth: 'occlusion' },
      { id: `tower-${isSummit ? 'summit' : 'stair'}-veil-${suffix}`, kind: 'cave-veil', x: 0.8, y: 10.5, width: 14.1, height: 2.5, depth: 'foreground' },
    ],
    resources: { preloadKeys: ['procedural-primitives'], landmarkLimit: 14, staticContainerLimit: 32, ambientParticleLimit: 48, entityLimit: 8 },
  };
}

export const ILLUSION_TOWER_SCENES: readonly WorldSceneSpec[] = ILLUSION_TOWER_SCENE_MAP_IDS.map((_, index) => illusionTowerScene(index + 1));

/** First scene-pack samples. They intentionally describe layers rather than
 * duplicating map collision, encounters, warp, or story logic. */
export const WORLD_SCENES: readonly WorldSceneSpec[] = [
  {
    id: 'mist-bay-town', mapId: 'pallet', biome: 'mist-harbor',
    terrain: [{ id: 'harbor-ground', depth: 2 }],
    scenery: [{ id: 'harbor-buildings', depth: 3 }, { id: 'lighthouse', depth: 3, parallax: 0.82 }],
    occlusion: [{ id: 'harbor-roofs', depth: 5 }],
    foreground: [{ id: 'harbor-fog', depth: 6, parallax: 1.12 }],
    ambience: { preset: 'mist', density: 0.42 },
    palette: { backdrop: '#8cb6c4', ground: '#5f8079', path: '#76968d', shadow: '#31575c', accent: '#f1cd83', fog: '#e6f8f2' },
    characters: [
      { id: 'player', appearance: 'hero', behavior: 'idle' },
      { id: 'dock-fisher', appearance: 'fisher', behavior: 'sort-nets', x: 3.5, y: 11 },
    ],
    landmarks: [
      { id: 'west-dock', kind: 'dock', x: 1, y: 11, width: 8, height: 2, depth: 'scenery' },
      { id: 'tide-research-institute', kind: 'building', x: 5, y: 2, width: 4, height: 3, depth: 'scenery' },
      { id: 'mist-bay-lighthouse', kind: 'lighthouse', x: 12, y: 1, width: 2, height: 5, depth: 'scenery' },
      { id: 'market-awning', kind: 'roof', x: 6, y: 9, width: 3, height: 2, depth: 'occlusion' },
      { id: 'harbor-fog-front', kind: 'fog-bank', x: 0, y: 10, width: 16, height: 4, depth: 'foreground' },
    ],
    resources: { preloadKeys: ['procedural-primitives'], landmarkLimit: 12, staticContainerLimit: 30, ambientParticleLimit: 30, entityLimit: 12 },
  },
  ...ILLUSION_TOWER_SCENES,
];

/** Every reviewed Scene Pack is eligible for the Pixi world path. Deriving the
 * index from the scenes avoids maintaining a second map-id whitelist. */
export const GPU_WORLD_MAP_IDS: readonly string[] = WORLD_SCENES.map((scene) => scene.mapId);
const GPU_WORLD_MAP_ID_SET = new Set(GPU_WORLD_MAP_IDS);
export function isGpuWorldMapId(mapId: string): boolean {
  return GPU_WORLD_MAP_ID_SET.has(mapId);
}

export const WORLD_SCENE_PRELOAD_KEY_CATALOG: readonly WorldScenePreloadKey[] = ['procedural-primitives'];
const WORLD_STAGE_AMBIENT_BASE = 17;

function sceneStaticContainerCount(scene: WorldSceneSpec): number {
  return 3 + (scene.landmarks?.length ?? 0) + 1;
}

function sceneAmbientParticleCount(scene: WorldSceneSpec): number {
  return Math.max(2, Math.round(WORLD_STAGE_AMBIENT_BASE * Math.max(0.2, scene.ambience.density / 0.42)));
}

/** Stable config signature used by Node reports until browser screenshot capture
 * is introduced. It detects unintended scene composition/order changes without
 * coupling test infrastructure to Pixi or DOM output. */
export function worldSceneFingerprint(scene: WorldSceneSpec): string {
  const landmarkSignature = (scene.landmarks ?? []).map((landmark) => `${landmark.id}:${landmark.kind}:${landmark.depth}`).join('|');
  const characterSignature = (scene.characters ?? []).map((character) => `${character.id}:${character.appearance}:${character.behavior}`).join('|');
  return [scene.id, scene.mapId, scene.biome, scene.ambience.preset, scene.ambience.density, landmarkSignature, characterSignature].join('#');
}

/** Compact stable identifier for reportable visual composition baselines. */
export function worldSceneFingerprintHash(scene: WorldSceneSpec): string {
  let hash = 0x811c9dc5;
  for (const character of worldSceneFingerprint(scene)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** First config-level visual regression baselines. Update deliberately only after
 * a reviewed visual change; browser screenshots can be layered on later. */
export const WORLD_SCENE_VISUAL_BASELINES: Readonly<Record<string, string>> = {
  pallet: '2c999c00',
  'illusion-tower-1': '921155b7',
  'illusion-tower-2': '3b91d869',
  'illusion-tower-3': 'c351f757',
  'illusion-tower-4': '07b74941',
  'illusion-tower-5': '5e6e1761',
};

export function worldSceneBudgetReport(scene: WorldSceneSpec): WorldSceneBudgetReport {
  return {
    sceneId: scene.id,
    mapId: scene.mapId,
    landmarkCount: scene.landmarks?.length ?? 0,
    staticContainerCount: sceneStaticContainerCount(scene),
    dynamicEntityCount: (scene.characters?.length ?? 0),
    ambientParticleCount: sceneAmbientParticleCount(scene),
    preloadKeyCount: scene.resources.preloadKeys.length,
    fingerprint: worldSceneFingerprint(scene),
  };
}

export function validateWorldSceneBudgets(scenes: readonly WorldSceneSpec[] = WORLD_SCENES): WorldSceneBudgetValidationReport {
  const sceneIds = new Set<string>();
  const mapIds = new Set<string>();
  const duplicateSceneIds: string[] = [];
  const duplicateMapIds: string[] = [];
  const unknownPreloadKeys: string[] = [];
  const overBudgetSceneIds: string[] = [];
  const mismatchedBaselineMapIds: string[] = [];
  for (const scene of scenes) {
    if (sceneIds.has(scene.id)) duplicateSceneIds.push(scene.id);
    if (mapIds.has(scene.mapId)) duplicateMapIds.push(scene.mapId);
    sceneIds.add(scene.id);
    mapIds.add(scene.mapId);
    const report = worldSceneBudgetReport(scene);
    if (scene.resources.preloadKeys.some((key) => !WORLD_SCENE_PRELOAD_KEY_CATALOG.includes(key))) unknownPreloadKeys.push(scene.id);
    if (report.landmarkCount > scene.resources.landmarkLimit || report.staticContainerCount > scene.resources.staticContainerLimit || report.dynamicEntityCount > scene.resources.entityLimit || report.ambientParticleCount > scene.resources.ambientParticleLimit) overBudgetSceneIds.push(scene.id);
    if (WORLD_SCENE_VISUAL_BASELINES[scene.mapId] !== worldSceneFingerprintHash(scene)) mismatchedBaselineMapIds.push(scene.mapId);
  }
  return {
    duplicateSceneIds,
    duplicateMapIds,
    missingGpuSceneMapIds: GPU_WORLD_MAP_IDS.filter((mapId) => !mapIds.has(mapId)),
    unknownPreloadKeys,
    overBudgetSceneIds,
    mismatchedBaselineMapIds,
  };
}

export const WORLD_SCENE_BY_MAP_ID: Readonly<Record<string, WorldSceneSpec>> = Object.fromEntries(
  WORLD_SCENES.map((scene) => [scene.mapId, scene]),
);
