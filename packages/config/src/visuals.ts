import type { BattleActorChoreography, TypeName } from '@pokemon-online/shared';
import { MAP_MAP } from './maps.ts';

/** One standard composition: spread accents support, rather than bury, actors. */
export const BATTLE_EFFECT_COMPOSITION = {
  groundRingScaleY: 0.38,
  // Alpha-composited color remains visible without adding white over actors.
  spreadBurstOpacity: 0.42,
  burst: {
    blendMode: 'normal',
    maxRadius: 76,
    coreRadiusRatio: 0.14,
    coreOpacity: 0.24,
    highlightOpacity: 0.38,
  },
} as const;
export type BattleEffectLayer = 'ground' | 'front';

/** Shared directional detail budgets for the representative skill vocabulary. */
export const BATTLE_SKILL_DETAILS = {
  water: { length: 34, width: 9, highlight: 0xc0eaff, trailCount: 3 },
  beam: { baseWidth: 12, strengthWidth: 16, coreOpacity: 0.50, flowCount: 5, energyColor: 0xe8ad5c, ignitionRatio: 0.08, fadeRatio: 0.24 },
  directionalImpacts: ['cross', 'claw', 'horn', 'tail', 'wing-slap', 'beak-peck', 'tusk-gore', 'pincer-snap', 'whip-lash', 'kick'],
} as const;

/** Local body coverage and terrain contact budgets, in unprojected sprite units. */
export const BATTLE_BODY_EFFECTS = {
  flameAnchors: [[-0.23, -0.32], [0.19, -0.27], [-0.08, -0.19], [0.29, -0.08], [-0.29, -0.04],
    [0.07, -0.02], [-0.17, 0.10], [0.22, 0.16], [-0.03, 0.23], [0.05, -0.37]],
  moteCount: 9,
  minimumScreenPixel: { body: 2, flame: 2, glyph: 2 },
  palette: { ember: 0xa93624, fire: 0xed7027, fireTip: 0xffca62, poison: 0x885b9f, poisonLight: 0xb78bc3, poisonCore: 0x512368,
    electric: 0xf3ce5c, ice: 0x79bdd3, iceLight: 0xc3e5ec, sleep: 0xb8cfdf, confuse: 0xc495bb, shadow: 0x293448 },
} as const;
export const BATTLE_FOOT_CONTACT = {
  widthRatio: 0.58,
  heightRatio: 0.065,
  bladeCount: 7,
  opacity: 0.76,
} as const;

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
  relief?: WorldReliefLayout;
  landmarks?: readonly WorldLandmarkSpec[];
  characters?: readonly WorldCharacterSpec[];
  resources: WorldSceneResourceBudget;
}

/** 只读视觉地面来自权威地图，renderer 不再用自由摆放的大色块代替道路。 */
export interface WorldReliefLayout {
  tiles: readonly (readonly number[])[];
  style: 'harbor' | 'moss' | 'tidal' | 'crystal' | 'forge' | 'astral';
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
  | 'flame-bolt' | 'water-shot' | 'spark-bolt' | 'leaf-shot' | 'ice-shard' | 'psychic-bolt' | 'shadow-orb' | 'stone-shot' | 'wind-cutter' | 'fairy-spark' | 'neutral-star' | 'wind-flakes' | 'lunar-orb';

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
    { backdrop: '#172e30', ground: '#64766c', path: '#98a18a', shadow: '#1e3b38', accent: '#b8dd96', fog: '#c2d8c7' },
    { backdrop: '#183442', ground: '#567a82', path: '#91b1b0', shadow: '#193f4b', accent: '#a1e2dc', fog: '#c5e6df' },
    { backdrop: '#24273e', ground: '#65657a', path: '#9898a2', shadow: '#24283e', accent: '#c59ceb', fog: '#d0c6e9' },
    { backdrop: '#30292f', ground: '#786b64', path: '#ad9780', shadow: '#312a33', accent: '#ffc27b', fog: '#d9b3a1' },
    { backdrop: '#202c48', ground: '#788595', path: '#abb7bd', shadow: '#293655', accent: '#ffe0a0', fog: '#d8e2ed' },
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
    relief: { tiles: MAP_MAP[ILLUSION_TOWER_SCENE_MAP_IDS[floor - 1]!]!.tiles,
      style: (['moss', 'tidal', 'crystal', 'forge', 'astral'] as const)[floor - 1]! },
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
    palette: { backdrop: '#285769', ground: '#65875a', path: '#b5ab82', shadow: '#294a43', accent: '#e0c783', fog: '#c6dfce' },
    relief: { tiles: MAP_MAP.pallet!.tiles, style: 'harbor' },
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
  return scene.relief ? 6 + scene.relief.tiles.length : 3 + (scene.landmarks?.length ?? 0) + 1;
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
  return [scene.id, scene.mapId, scene.biome, scene.ambience.preset, scene.ambience.density, landmarkSignature, characterSignature,
    scene.relief?.style ?? '', scene.relief?.tiles.map(row=>row.join(',')).join(';') ?? ''].join('#');
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
  pallet: '290b32cd',
  'illusion-tower-1': '96de19cc',
  'illusion-tower-2': '35ffc6c8',
  'illusion-tower-3': '5be59850',
  'illusion-tower-4': 'b982ef4f',
  'illusion-tower-5': 'b3172093',
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
