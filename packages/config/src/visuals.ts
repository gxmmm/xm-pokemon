import type { BattleActorChoreography, TypeName } from '@pokemon-online/shared';

/** Shared world/battle visual vocabulary. These are static data contracts;
 * renderer implementations must not add map- or skill-id branches to replace
 * them. The first two scene packs are configuration-only Stage 1 prototypes. */
export type BiomeId =
  | 'mist-harbor'
  | 'lumen-forest'
  | 'mist-forest'
  | 'sunlit-route'
  | 'moon-cavern'
  | 'tide-sea'
  | 'dragon-grotto'
  | 'deep-ruin'
  | 'illusion-tower';

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
  kind: 'lighthouse' | 'building' | 'dock' | 'tree-cluster' | 'tree-wall' | 'canopy' | 'root-cluster' | 'boulder' | 'path' | 'grass-patch' | 'roof' | 'fog-bank' | 'observatory-dome' | 'meteor-spire' | 'star-chart' | 'crystal-cluster' | 'rift-mist' | 'gravity-platform' | 'rift-arch' | 'void-debris' | 'tide-cavern-wall' | 'crystal-tide-pool' | 'anchor-dais' | 'cave-veil' | 'spore-ring' | 'ridge-wall' | 'stone-terrace' | 'starfall-scar' | 'ridge-overhang' | 'canyon-wall' | 'mineral-vein' | 'rock-shelf' | 'cave-shadow' | 'reef-islet' | 'tide-channel' | 'shipwreck' | 'tide-cave-mouth';
  x: number; y: number; width?: number; height?: number; depth: 'terrain' | 'scenery' | 'occlusion' | 'foreground';
}

export type WorldCharacterAppearance = 'hero' | 'researcher' | 'villager' | 'fisher' | 'scout';
export type WorldCharacterBehavior = 'idle' | 'study-tide' | 'look-out' | 'sort-nets' | 'tend-lantern' | 'trace-stars';
export interface WorldCharacterSpec {
  id: string;
  appearance: WorldCharacterAppearance;
  behavior: WorldCharacterBehavior;
  /** Omit position for a dynamic entity supplied by the authoritative world snapshot. */
  x?: number;
  y?: number;
}

export type WorldSceneObjectKind = 'default' | 'signal-spore' | 'anomaly-core' | 'gravity-node' | 'ruin-terminal' | 'rift-core' | 'legend-echo' | 'tide-anchor' | 'rift-gate' | 'star-scar' | 'tide-gauge' | 'ship-log';

/** Optional config-owned appearance for authoritative object DTOs. Object visibility
 * and positions still come from the application snapshot, never this scene pack. */
export interface WorldSceneObjectSpec {
  id: string;
  kind: WorldSceneObjectKind;
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
  objectVisuals?: readonly WorldSceneObjectSpec[];
  resources: WorldSceneResourceBudget;
}

export interface WorldSceneBudgetReport {
  sceneId: string;
  mapId: string;
  landmarkCount: number;
  staticContainerCount: number;
  dynamicEntityCount: number;
  cinematicAmbientParticles: number;
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
  | 'fist' | 'claw' | 'bite' | 'horn' | 'tail' | 'body-slam' | 'psychic-bolt' | 'elemental-bolt';

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
  /** Upper bound for the cinematic burst primitive before quality reduction. */
  particleBudget: number;
}


export const BIOME_VISUALS: Readonly<Record<BiomeId, BiomeVisualSpec>> = {
  'mist-harbor': {
    id: 'mist-harbor',
    palette: { sky: '#90b6c7', ambient: '#cfe4e9', fog: '#dff4f1', ground: '#55777c', accent: '#f1cd83' },
    ambience: { fogDensity: 0.52, particleKind: 'mist', particleDensity: 0.42 },
    battleEnvironment: 'harbor',
  },
  'lumen-forest': {
    id: 'lumen-forest',
    palette: { sky: '#173b42', ambient: '#86c4a7', fog: '#b8f0d5', ground: '#305543', accent: '#d7ee7b' },
    ambience: { fogDensity: 0.36, particleKind: 'pollen', particleDensity: 0.55 },
    battleEnvironment: 'forest',
  },
  'mist-forest': {
    id: 'mist-forest',
    palette: { sky: '#183741', ambient: '#7da8a4', fog: '#c4e2d4', ground: '#294d42', accent: '#91e7d5' },
    ambience: { fogDensity: 0.62, particleKind: 'mist', particleDensity: 0.64 },
    battleEnvironment: 'forest',
  },
  'sunlit-route': {
    id: 'sunlit-route',
    palette: { sky: '#86b9df', ambient: '#f9e7b7', fog: '#fff4d7', ground: '#62814b', accent: '#ffe485' },
    ambience: { fogDensity: 0.12, particleKind: 'pollen', particleDensity: 0.28 },
    battleEnvironment: 'route',
  },
  'moon-cavern': {
    id: 'moon-cavern',
    palette: { sky: '#17213b', ambient: '#8498ba', fog: '#b7c5e3', ground: '#3d465e', accent: '#d7e5ff' },
    ambience: { fogDensity: 0.26, particleKind: 'starlight', particleDensity: 0.32 },
    battleEnvironment: 'cavern',
  },
  'tide-sea': {
    id: 'tide-sea',
    palette: { sky: '#558dac', ambient: '#a6d9e8', fog: '#d6f6fb', ground: '#37748f', accent: '#f6d79c' },
    ambience: { fogDensity: 0.19, particleKind: 'spray', particleDensity: 0.48 },
    battleEnvironment: 'sea',
  },
  'dragon-grotto': {
    id: 'dragon-grotto',
    palette: { sky: '#143847', ambient: '#5cbfc8', fog: '#9ce9ec', ground: '#275563', accent: '#b977ff' },
    ambience: { fogDensity: 0.28, particleKind: 'rune', particleDensity: 0.36 },
    battleEnvironment: 'grotto',
  },
  'deep-ruin': {
    id: 'deep-ruin',
    palette: { sky: '#1f163f', ambient: '#755fc2', fog: '#c1a9ff', ground: '#352852', accent: '#7fe7ff' },
    ambience: { fogDensity: 0.33, particleKind: 'starlight', particleDensity: 0.46 },
    battleEnvironment: 'ruin',
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
      { id: 'professor-lan', appearance: 'researcher', behavior: 'study-tide' },
      { id: 'harbor-villager', appearance: 'villager', behavior: 'look-out' },
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
  {
    id: 'lumen-trail', mapId: 'route1', biome: 'lumen-forest',
    terrain: [{ id: 'forest-path', depth: 2 }, { id: 'luminous-grass', depth: 2 }],
    scenery: [{ id: 'forest-trunks', depth: 3 }, { id: 'forest-canopy-back', depth: 3, parallax: 0.88 }, { id: 'root-and-stone', depth: 3 }],
    occlusion: [{ id: 'forest-canopy-front', depth: 5 }],
    foreground: [{ id: 'lumen-motes', depth: 6, parallax: 1.08 }, { id: 'low-forest-fog', depth: 6, parallax: 1.04 }],
    ambience: { preset: 'pollen', density: 0.62 },
    palette: { backdrop: '#173b42', ground: '#305543', path: '#68845a', shadow: '#17372f', accent: '#d7ee7b', fog: '#b8f0d5' },
    characters: [
      { id: 'player', appearance: 'hero', behavior: 'idle' },
      { id: 'lantern-scout', appearance: 'scout', behavior: 'tend-lantern' },
    ],
    landmarks: [
      { id: 'distant-lumen-woods', kind: 'tree-wall', x: 0, y: 0.2, width: 16, height: 3.3, depth: 'scenery' },
      { id: 'north-canopy', kind: 'tree-cluster', x: 0.2, y: 0.6, width: 5.1, height: 3.3, depth: 'scenery' },
      { id: 'east-woods', kind: 'tree-cluster', x: 11.4, y: 1.1, width: 4.4, height: 4.7, depth: 'scenery' },
      { id: 'west-root-grove', kind: 'tree-cluster', x: 0.15, y: 6.3, width: 4.2, height: 5.4, depth: 'scenery' },
      { id: 'south-woods', kind: 'tree-cluster', x: 9.7, y: 9.9, width: 6.1, height: 3.2, depth: 'scenery' },
      { id: 'moss-path', kind: 'path', x: 6.2, y: 0.5, width: 3.7, height: 13.2, depth: 'terrain' },
      { id: 'lumen-grass-west', kind: 'grass-patch', x: 3.0, y: 3.8, width: 3.1, height: 7.8, depth: 'terrain' },
      { id: 'lumen-grass-east', kind: 'grass-patch', x: 10.0, y: 4.7, width: 2.4, height: 4.9, depth: 'terrain' },
      { id: 'old-root-crossing', kind: 'root-cluster', x: 4.3, y: 7.1, width: 3.0, height: 1.5, depth: 'scenery' },
      { id: 'blue-moss-boulders', kind: 'boulder', x: 11.1, y: 8.5, width: 2.2, height: 1.5, depth: 'scenery' },
      { id: 'north-overhang', kind: 'canopy', x: 0, y: 0, width: 7.0, height: 2.5, depth: 'occlusion' },
      { id: 'west-overhang', kind: 'canopy', x: 0, y: 6.8, width: 3.7, height: 4.8, depth: 'occlusion' },
      { id: 'south-overhang', kind: 'canopy', x: 10.4, y: 10.8, width: 5.6, height: 2.2, depth: 'occlusion' },
      { id: 'lumen-fog-bank', kind: 'fog-bank', x: 1.0, y: 10.7, width: 11.5, height: 2.6, depth: 'foreground' },
    ],
    resources: { preloadKeys: ['procedural-primitives'], landmarkLimit: 18, staticContainerLimit: 38, ambientParticleLimit: 46, entityLimit: 12 },
  },
  {
    id: 'mistwood-trial', mapId: 'viridian-forest', biome: 'mist-forest',
    terrain: [{ id: 'mossy-trial-path', depth: 2 }, { id: 'spore-meadow', depth: 2 }],
    scenery: [{ id: 'mistwood-trunks', depth: 3 }, { id: 'rooted-stones', depth: 3 }, { id: 'spore-clearings', depth: 3 }],
    occlusion: [{ id: 'near-mistwood-canopy', depth: 5 }],
    foreground: [{ id: 'low-mist-curtain', depth: 6, parallax: 1.08 }],
    ambience: { preset: 'mist', density: 0.68 },
    palette: { backdrop: '#183741', ground: '#294d42', path: '#5c806e', shadow: '#16362f', accent: '#91e7d5', fog: '#c4e2d4' },
    characters: [
      { id: 'player', appearance: 'hero', behavior: 'idle' },
      { id: 'mist-runner', appearance: 'scout', behavior: 'look-out' },
    ],
    /** Decorative grammar only. Map tiles, collision, encounters, warp and story
     * visibility stay authoritative in maps.ts / story.ts and enter as DTOs. */
    landmarks: [
      { id: 'far-mistwood-wall', kind: 'tree-wall', x: 0, y: 0.35, width: 16, height: 3.1, depth: 'scenery' },
      { id: 'west-mistwood-grove', kind: 'tree-cluster', x: 0.1, y: 2.8, width: 3.6, height: 8.0, depth: 'scenery' },
      { id: 'east-mistwood-grove', kind: 'tree-cluster', x: 12.4, y: 2.6, width: 3.5, height: 8.3, depth: 'scenery' },
      { id: 'south-mistwood-grove', kind: 'tree-cluster', x: 5.8, y: 10.2, width: 6.0, height: 2.4, depth: 'scenery' },
      { id: 'trial-moss-path', kind: 'path', x: 6.2, y: 0.9, width: 3.6, height: 11.7, depth: 'terrain' },
      { id: 'west-spore-meadow', kind: 'grass-patch', x: 2.7, y: 3.4, width: 3.4, height: 5.9, depth: 'terrain' },
      { id: 'east-spore-meadow', kind: 'grass-patch', x: 9.8, y: 4.5, width: 2.5, height: 4.6, depth: 'terrain' },
      { id: 'anomaly-root-ring', kind: 'root-cluster', x: 5.3, y: 5.8, width: 5.4, height: 2.0, depth: 'scenery' },
      { id: 'mistwood-boulders', kind: 'boulder', x: 3.2, y: 9.6, width: 2.1, height: 1.5, depth: 'scenery' },
      { id: 'north-spore-ring', kind: 'spore-ring', x: 2.0, y: 2.3, width: 2.3, height: 1.4, depth: 'scenery' },
      { id: 'east-spore-ring', kind: 'spore-ring', x: 10.7, y: 7.5, width: 2.1, height: 1.3, depth: 'scenery' },
      { id: 'north-mistwood-overhang', kind: 'canopy', x: 0, y: 0, width: 6.2, height: 2.4, depth: 'occlusion' },
      { id: 'west-mistwood-overhang', kind: 'canopy', x: 0, y: 7.0, width: 3.5, height: 4.7, depth: 'occlusion' },
      { id: 'south-mistwood-overhang', kind: 'canopy', x: 10.5, y: 10.6, width: 5.5, height: 2.4, depth: 'occlusion' },
      { id: 'mistwood-foreground-fog', kind: 'fog-bank', x: 0.8, y: 10.7, width: 13.9, height: 2.4, depth: 'foreground' },
    ],
    objectVisuals: [
      { id: 'lumen-1', kind: 'signal-spore' },
      { id: 'lumen-2', kind: 'signal-spore' },
      { id: 'lumen-3', kind: 'signal-spore' },
      { id: 'anomaly-core', kind: 'anomaly-core' },
    ],
    resources: { preloadKeys: ['procedural-primitives'], landmarkLimit: 20, staticContainerLimit: 40, ambientParticleLimit: 50, entityLimit: 12 },
  },
  {
    id: 'starfall-ridge', mapId: 'route3', biome: 'sunlit-route',
    terrain: [{ id: 'ridge-stone-road', depth: 2 }, { id: 'ridge-grass-verges', depth: 2 }],
    scenery: [{ id: 'highland-cliffs', depth: 3 }, { id: 'weathered-terraces', depth: 3 }, { id: 'meteor-scars', depth: 3 }],
    occlusion: [{ id: 'near-ridge-overhang', depth: 5 }],
    foreground: [{ id: 'highland-dust', depth: 6, parallax: 1.06 }],
    ambience: { preset: 'starlight', density: 0.42 },
    palette: { backdrop: '#5d84ae', ground: '#71845a', path: '#a69470', shadow: '#3d4c45', accent: '#ffe485', fog: '#fff1cc' },
    characters: [
      { id: 'player', appearance: 'hero', behavior: 'idle' },
      { id: 'ridge-guide', appearance: 'scout', behavior: 'look-out' },
    ],
    /** Decorative highland grammar only. Existing map/story config remains the
     * authority for the ancient-road collision, encounter grass, warps and stars. */
    landmarks: [
      { id: 'north-ridge-wall', kind: 'ridge-wall', x: 0, y: 0.2, width: 16, height: 2.7, depth: 'scenery' },
      { id: 'west-ridge-wall', kind: 'ridge-wall', x: 0.1, y: 3.0, width: 3.2, height: 8.6, depth: 'scenery' },
      { id: 'east-ridge-wall', kind: 'ridge-wall', x: 12.8, y: 2.7, width: 3.1, height: 8.9, depth: 'scenery' },
      { id: 'old-highroad', kind: 'path', x: 6.25, y: 0.7, width: 3.5, height: 12.0, depth: 'terrain' },
      { id: 'west-grass-verge', kind: 'grass-patch', x: 2.8, y: 2.9, width: 2.7, height: 4.5, depth: 'terrain' },
      { id: 'east-grass-verge', kind: 'grass-patch', x: 10.2, y: 3.8, width: 2.0, height: 5.1, depth: 'terrain' },
      { id: 'central-stone-terrace', kind: 'stone-terrace', x: 5.5, y: 5.1, width: 5.1, height: 3.5, depth: 'scenery' },
      { id: 'west-starfall-scar', kind: 'starfall-scar', x: 2.0, y: 2.8, width: 2.4, height: 1.7, depth: 'scenery' },
      { id: 'east-starfall-scar', kind: 'starfall-scar', x: 10.8, y: 5.2, width: 2.1, height: 1.6, depth: 'scenery' },
      { id: 'south-starfall-scar', kind: 'starfall-scar', x: 4.2, y: 9.8, width: 2.3, height: 1.6, depth: 'scenery' },
      { id: 'weathered-ridge-boulders', kind: 'boulder', x: 10.1, y: 9.6, width: 2.5, height: 1.6, depth: 'scenery' },
      { id: 'north-ridge-overhang', kind: 'ridge-overhang', x: 0, y: 0, width: 6.0, height: 2.2, depth: 'occlusion' },
      { id: 'east-ridge-overhang', kind: 'ridge-overhang', x: 12.5, y: 5.8, width: 3.5, height: 4.7, depth: 'occlusion' },
      { id: 'highland-foreground-haze', kind: 'fog-bank', x: 1.1, y: 10.8, width: 13.5, height: 2.2, depth: 'foreground' },
    ],
    objectVisuals: [
      { id: 'star-1', kind: 'star-scar' },
      { id: 'star-2', kind: 'star-scar' },
      { id: 'star-3', kind: 'star-scar' },
    ],
    resources: { preloadKeys: ['procedural-primitives'], landmarkLimit: 18, staticContainerLimit: 38, ambientParticleLimit: 34, entityLimit: 12 },
  },
  {
    id: 'starfall-observatory', mapId: 'mt-moon', biome: 'moon-cavern',
    terrain: [{ id: 'meteor-stone-floor', depth: 2 }, { id: 'starlit-path', depth: 2 }],
    scenery: [{ id: 'observatory-dome', depth: 3 }, { id: 'meteor-spires', depth: 3 }, { id: 'crystal-constellation', depth: 3 }],
    occlusion: [{ id: 'dome-rim', depth: 5 }, { id: 'hanging-rift-mist', depth: 5 }],
    foreground: [{ id: 'starfall-dust', depth: 6, parallax: 1.08 }],
    ambience: { preset: 'starlight', density: 0.58 },
    palette: { backdrop: '#17213b', ground: '#3d465e', path: '#66708a', shadow: '#1f2639', accent: '#d7e5ff', fog: '#b7c5e3' },
    characters: [
      { id: 'player', appearance: 'hero', behavior: 'idle' },
      { id: 'sky-cartographer', appearance: 'researcher', behavior: 'trace-stars' },
    ],
    landmarks: [
      { id: 'far-rift-mist', kind: 'rift-mist', x: 0, y: 0.7, width: 16, height: 2.7, depth: 'scenery' },
      { id: 'west-meteor-wall', kind: 'meteor-spire', x: 0.1, y: 2.1, width: 3.2, height: 8.5, depth: 'scenery' },
      { id: 'east-meteor-wall', kind: 'meteor-spire', x: 12.6, y: 1.5, width: 3.3, height: 9.1, depth: 'scenery' },
      { id: 'starfall-dome', kind: 'observatory-dome', x: 4.0, y: 1.5, width: 8.0, height: 6.3, depth: 'scenery' },
      { id: 'constellation-floor', kind: 'star-chart', x: 5.1, y: 6.4, width: 5.8, height: 3.2, depth: 'terrain' },
      { id: 'north-crystals', kind: 'crystal-cluster', x: 3.4, y: 3.2, width: 2.2, height: 2.1, depth: 'scenery' },
      { id: 'south-crystals', kind: 'crystal-cluster', x: 10.4, y: 8.6, width: 2.1, height: 2.4, depth: 'scenery' },
      { id: 'dome-upper-rim', kind: 'observatory-dome', x: 6.3, y: 8.4, width: 3.3, height: 1.8, depth: 'occlusion' },
      { id: 'rift-overhang', kind: 'rift-mist', x: 0.6, y: 10.5, width: 14.2, height: 2.0, depth: 'foreground' },
    ],
    resources: { preloadKeys: ['procedural-primitives'], landmarkLimit: 14, staticContainerLimit: 34, ambientParticleLimit: 44, entityLimit: 10 },
  },
  {
    id: 'red-rift-canyon', mapId: 'rock-tunnel', biome: 'moon-cavern',
    terrain: [{ id: 'rift-stone-floor', depth: 2 }, { id: 'broken-canyon-path', depth: 2 }],
    scenery: [{ id: 'red-canyon-walls', depth: 3 }, { id: 'exposed-mineral-veins', depth: 3 }, { id: 'fallen-rock-shelves', depth: 3 }],
    occlusion: [{ id: 'near-rift-ceiling', depth: 5 }],
    foreground: [{ id: 'canyon-dust-curtain', depth: 6, parallax: 1.08 }],
    ambience: { preset: 'dust', density: 0.52 },
    palette: { backdrop: '#2a2534', ground: '#4e4038', path: '#80705e', shadow: '#201a24', accent: '#f0a46c', fog: '#d8b79a' },
    characters: [{ id: 'player', appearance: 'hero', behavior: 'idle' }],
    /** Decorative canyon grammar only. The encounterFloor, collision cells, cave
     * warps and every progression gate remain authoritative map/story inputs. */
    landmarks: [
      { id: 'far-rift-ceiling', kind: 'canyon-wall', x: 0, y: 0.2, width: 16, height: 2.9, depth: 'scenery' },
      { id: 'west-rift-wall', kind: 'canyon-wall', x: 0.1, y: 2.0, width: 3.1, height: 9.4, depth: 'scenery' },
      { id: 'east-rift-wall', kind: 'canyon-wall', x: 12.7, y: 1.6, width: 3.2, height: 9.9, depth: 'scenery' },
      { id: 'central-rift-path', kind: 'path', x: 6.3, y: 0.8, width: 3.4, height: 12.1, depth: 'terrain' },
      { id: 'west-mineral-face', kind: 'mineral-vein', x: 2.3, y: 2.6, width: 3.0, height: 3.3, depth: 'scenery' },
      { id: 'east-mineral-face', kind: 'mineral-vein', x: 10.4, y: 2.9, width: 2.6, height: 3.2, depth: 'scenery' },
      { id: 'lower-rift-vein', kind: 'mineral-vein', x: 9.7, y: 8.6, width: 2.8, height: 2.0, depth: 'scenery' },
      { id: 'central-fallen-shelf', kind: 'rock-shelf', x: 5.4, y: 5.5, width: 5.2, height: 3.2, depth: 'scenery' },
      { id: 'south-rift-shelf', kind: 'rock-shelf', x: 3.4, y: 9.0, width: 3.0, height: 1.8, depth: 'scenery' },
      { id: 'weathered-canyon-boulders', kind: 'boulder', x: 10.1, y: 10.2, width: 2.4, height: 1.4, depth: 'scenery' },
      { id: 'north-ceiling-shadow', kind: 'cave-shadow', x: 0, y: 0, width: 6.2, height: 2.4, depth: 'occlusion' },
      { id: 'east-ceiling-shadow', kind: 'cave-shadow', x: 12.3, y: 5.2, width: 3.7, height: 5.0, depth: 'occlusion' },
      { id: 'south-canyon-dust', kind: 'cave-veil', x: 0.8, y: 10.5, width: 14.0, height: 2.5, depth: 'foreground' },
    ],
    resources: { preloadKeys: ['procedural-primitives'], landmarkLimit: 18, staticContainerLimit: 38, ambientParticleLimit: 38, entityLimit: 10 },
  },
  {
    id: 'stilltide-isles', mapId: 'sea-route', biome: 'tide-sea',
    terrain: [{ id: 'shallow-tide', depth: 2 }, { id: 'reef-walkways', depth: 2 }],
    scenery: [{ id: 'exposed-reef-islets', depth: 3 }, { id: 'low-tide-wreck', depth: 3 }, { id: 'tide-cave-mouth', depth: 3 }],
    occlusion: [{ id: 'near-reef-shelf', depth: 5 }],
    foreground: [{ id: 'sea-spray-curtain', depth: 6, parallax: 1.08 }],
    ambience: { preset: 'spray', density: 0.64 },
    palette: { backdrop: '#183f58', ground: '#3f7b82', path: '#b5b08a', shadow: '#143448', accent: '#80dce3', fog: '#d8f5ee' },
    characters: [
      { id: 'player', appearance: 'hero', behavior: 'idle' },
      { id: 'tide-captain', appearance: 'villager', behavior: 'look-out' },
      { id: 'chart-apprentice', appearance: 'researcher', behavior: 'study-tide' },
    ],
    /** Reefs, the wreck and cave mouth are decorative. Tide state, boat/cave
     * warps, encounterFloor, collision and story visibility remain map/story DTO facts. */
    landmarks: [
      { id: 'far-stilltide-reef', kind: 'reef-islet', x: 0, y: 0.2, width: 16, height: 2.7, depth: 'scenery' },
      { id: 'west-exposed-reef', kind: 'reef-islet', x: 0.2, y: 3.0, width: 4.4, height: 8.1, depth: 'scenery' },
      { id: 'east-exposed-reef', kind: 'reef-islet', x: 11.8, y: 2.8, width: 4.0, height: 8.5, depth: 'scenery' },
      { id: 'central-reef-crossing', kind: 'path', x: 6.3, y: 0.7, width: 3.4, height: 12.3, depth: 'terrain' },
      { id: 'west-shallow-channel', kind: 'tide-channel', x: 3.1, y: 3.5, width: 3.3, height: 4.5, depth: 'terrain' },
      { id: 'east-shallow-channel', kind: 'tide-channel', x: 9.7, y: 4.1, width: 3.0, height: 4.0, depth: 'terrain' },
      { id: 'low-tide-wreck', kind: 'shipwreck', x: 10.0, y: 2.6, width: 3.6, height: 2.7, depth: 'scenery' },
      { id: 'south-reef-boulders', kind: 'boulder', x: 2.7, y: 9.1, width: 3.2, height: 1.9, depth: 'scenery' },
      { id: 'north-tide-cave', kind: 'tide-cave-mouth', x: 5.5, y: 0.1, width: 5.1, height: 2.4, depth: 'scenery' },
      { id: 'west-reef-shelf', kind: 'reef-islet', x: 0, y: 6.8, width: 3.3, height: 4.5, depth: 'occlusion' },
      { id: 'east-reef-shelf', kind: 'reef-islet', x: 13.0, y: 6.1, width: 3.0, height: 4.9, depth: 'occlusion' },
      { id: 'south-sea-spray', kind: 'cave-veil', x: 0.6, y: 10.4, width: 14.8, height: 2.2, depth: 'foreground' },
    ],
    objectVisuals: [
      { id: 'tide-gauge', kind: 'tide-gauge' },
      { id: 'ship-log', kind: 'ship-log' },
    ],
    resources: { preloadKeys: ['procedural-primitives'], landmarkLimit: 18, staticContainerLimit: 38, ambientParticleLimit: 48, entityLimit: 12 },
  },
  {
    id: 'tide-dragon-den', mapId: 'dragon-den', biome: 'dragon-grotto',
    terrain: [{ id: 'saltstone-floor', depth: 2 }, { id: 'tide-runoff', depth: 2 }],
    scenery: [{ id: 'cavern-walls', depth: 3 }, { id: 'crystal-pools', depth: 3 }, { id: 'anchor-chamber', depth: 3 }],
    occlusion: [{ id: 'north-cave-ceiling', depth: 5 }, { id: 'south-cave-veil', depth: 5 }],
    foreground: [{ id: 'brine-runes', depth: 6, parallax: 1.06 }],
    ambience: { preset: 'rune', density: 0.54 },
    palette: { backdrop: '#143847', ground: '#275563', path: '#427988', shadow: '#102c3b', accent: '#b977ff', fog: '#9ce9ec' },
    characters: [
      { id: 'player', appearance: 'hero', behavior: 'idle' },
      { id: 'reef-keeper', appearance: 'scout', behavior: 'study-tide' },
    ],
    landmarks: [
      { id: 'far-tide-cavern', kind: 'tide-cavern-wall', x: 0, y: 0.4, width: 16, height: 3.3, depth: 'scenery' },
      { id: 'west-saltstone-wall', kind: 'tide-cavern-wall', x: 0.2, y: 3.0, width: 3.2, height: 8.2, depth: 'scenery' },
      { id: 'east-saltstone-wall', kind: 'tide-cavern-wall', x: 12.7, y: 2.3, width: 3.1, height: 9.2, depth: 'scenery' },
      { id: 'central-brine-pool', kind: 'crystal-tide-pool', x: 5.2, y: 6.4, width: 5.6, height: 2.4, depth: 'terrain' },
      { id: 'deep-anchor-dais', kind: 'anchor-dais', x: 6.2, y: 3.5, width: 3.6, height: 2.7, depth: 'scenery' },
      { id: 'north-cave-overhang', kind: 'tide-cavern-wall', x: 4.4, y: 0.6, width: 7.3, height: 2.9, depth: 'occlusion' },
      { id: 'south-brine-veil', kind: 'cave-veil', x: 0.6, y: 10.5, width: 14.8, height: 2.0, depth: 'foreground' },
    ],
    objectVisuals: [
      { id: 'tide-anchor', kind: 'tide-anchor' },
      { id: 'deep-space-gate', kind: 'rift-gate' },
    ],
    resources: { preloadKeys: ['procedural-primitives'], landmarkLimit: 12, staticContainerLimit: 32, ambientParticleLimit: 42, entityLimit: 10 },
  },
  {
    id: 'deep-space-ruins', mapId: 'deep-space', biome: 'deep-ruin',
    terrain: [{ id: 'rift-stone-shelves', depth: 2 }, { id: 'gravity-bridges', depth: 2 }],
    scenery: [{ id: 'suspended-ruins', depth: 3 }, { id: 'void-arches', depth: 3 }, { id: 'rift-debris', depth: 3 }],
    occlusion: [{ id: 'near-floating-shelf', depth: 5 }, { id: 'lower-rift-veil', depth: 5 }],
    foreground: [{ id: 'deep-rune-dust', depth: 6, parallax: 1.1 }],
    ambience: { preset: 'rune', density: 0.66 },
    palette: { backdrop: '#160d31', ground: '#342650', path: '#63527f', shadow: '#120b26', accent: '#86efff', fog: '#c6a9ff' },
    characters: [{ id: 'player', appearance: 'hero', behavior: 'idle' }],
    /** Decorative geometry only. Collision, warp, encounterFloor and story
     * progression stay in maps.ts / story.ts and are not duplicated here. */
    landmarks: [
      { id: 'far-void-rift', kind: 'rift-mist', x: 0, y: 0.5, width: 16, height: 3.2, depth: 'scenery' },
      { id: 'west-suspended-shelves', kind: 'gravity-platform', x: 0.5, y: 2.0, width: 4.7, height: 2.3, depth: 'scenery' },
      { id: 'east-suspended-shelves', kind: 'gravity-platform', x: 11.0, y: 2.9, width: 4.3, height: 2.1, depth: 'scenery' },
      { id: 'central-ruin-bridge', kind: 'gravity-platform', x: 5.5, y: 6.2, width: 5.0, height: 1.65, depth: 'terrain' },
      { id: 'rift-entry-arch', kind: 'rift-arch', x: 6.5, y: 9.1, width: 3.0, height: 3.1, depth: 'scenery' },
      { id: 'distant-void-debris', kind: 'void-debris', x: 0.4, y: 3.7, width: 15.0, height: 4.5, depth: 'scenery' },
      { id: 'near-floating-shelf', kind: 'gravity-platform', x: 5.3, y: 10.0, width: 5.6, height: 2.6, depth: 'occlusion' },
      { id: 'rift-veil-foreground', kind: 'rift-mist', x: 0.7, y: 11.3, width: 14.6, height: 1.8, depth: 'foreground' },
    ],
    objectVisuals: [
      { id: 'gravity-node-1', kind: 'gravity-node' },
      { id: 'gravity-node-2', kind: 'gravity-node' },
      { id: 'gravity-node-3', kind: 'gravity-node' },
      { id: 'ancient-terminal', kind: 'ruin-terminal' },
      { id: 'rift-heart', kind: 'rift-core' },
      { id: 'legend-echo', kind: 'legend-echo' },
    ],
    resources: { preloadKeys: ['procedural-primitives'], landmarkLimit: 14, staticContainerLimit: 36, ambientParticleLimit: 50, entityLimit: 12 },
  },
  ...ILLUSION_TOWER_SCENES,
];

/** Explicit migration gate for formal WorldView GPU rendering. Scene packs can
 * exist for sandbox/prototyping without being eligible for the live world path. */
export const GPU_WORLD_MAP_IDS = ['pallet', 'route1', 'illusion-tower-1', 'illusion-tower-2', 'illusion-tower-3', 'illusion-tower-4', 'illusion-tower-5', 'viridian-forest', 'route3', 'mt-moon', 'rock-tunnel', 'sea-route', 'deep-space', 'dragon-den'] as const;
export function isGpuWorldMapId(mapId: string): mapId is typeof GPU_WORLD_MAP_IDS[number] {
  return (GPU_WORLD_MAP_IDS as readonly string[]).includes(mapId);
}

export const WORLD_SCENE_PRELOAD_KEY_CATALOG: readonly WorldScenePreloadKey[] = ['procedural-primitives'];
const WORLD_STAGE_CINEMATIC_AMBIENT_BASE = 30;

function sceneStaticContainerCount(scene: WorldSceneSpec): number {
  return 3 + (scene.landmarks?.length ?? 0) + 1;
}

function sceneCinematicAmbientParticles(scene: WorldSceneSpec): number {
  return Math.max(2, Math.round(WORLD_STAGE_CINEMATIC_AMBIENT_BASE * Math.max(0.2, scene.ambience.density / 0.42)));
}

/** Stable config signature used by Node reports until browser screenshot capture
 * is introduced. It detects unintended scene composition/order changes without
 * coupling test infrastructure to Pixi or DOM output. */
export function worldSceneFingerprint(scene: WorldSceneSpec): string {
  const landmarkSignature = (scene.landmarks ?? []).map((landmark) => `${landmark.id}:${landmark.kind}:${landmark.depth}`).join('|');
  const characterSignature = (scene.characters ?? []).map((character) => `${character.id}:${character.appearance}:${character.behavior}`).join('|');
  const objectSignature = (scene.objectVisuals ?? []).map((object) => `${object.id}:${object.kind}`).join('|');
  return [scene.id, scene.mapId, scene.biome, scene.ambience.preset, scene.ambience.density, landmarkSignature, characterSignature, objectSignature].join('#');
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
  pallet: '18226d2f',
  route1: 'd2919216',
  'viridian-forest': '796ba47b',
  route3: '0711a01b',
  'mt-moon': '05366b70',
  'rock-tunnel': '90cfb219',
  'sea-route': '15c1084d',
  'dragon-den': 'fa843cf7',
  'deep-space': '9ebe7f67',
  'illusion-tower-1': '8549b7fc',
  'illusion-tower-2': '10977c7e',
  'illusion-tower-3': 'ee088b9c',
  'illusion-tower-4': '87888546',
  'illusion-tower-5': 'e94e9ce6',
};

export function worldSceneBudgetReport(scene: WorldSceneSpec): WorldSceneBudgetReport {
  return {
    sceneId: scene.id,
    mapId: scene.mapId,
    landmarkCount: scene.landmarks?.length ?? 0,
    staticContainerCount: sceneStaticContainerCount(scene),
    dynamicEntityCount: (scene.characters?.length ?? 0) + (scene.objectVisuals?.length ?? 0),
    cinematicAmbientParticles: sceneCinematicAmbientParticles(scene),
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
    if (report.landmarkCount > scene.resources.landmarkLimit || report.staticContainerCount > scene.resources.staticContainerLimit || report.dynamicEntityCount > scene.resources.entityLimit || report.cinematicAmbientParticles > scene.resources.ambientParticleLimit) overBudgetSceneIds.push(scene.id);
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
