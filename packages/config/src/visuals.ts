import type { Skill, TypeName } from '@pokemon-online/shared';
import { SKILLS } from './skills.ts';

/** Shared world/battle visual vocabulary. These are static data contracts;
 * renderer implementations must not add map- or skill-id branches to replace
 * them. The first two scene packs are configuration-only Stage 1 prototypes. */
export type BiomeId =
  | 'mist-harbor'
  | 'lumen-forest'
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

export interface WorldLandmarkSpec {
  id: string;
  kind: 'lighthouse' | 'building' | 'dock' | 'tree-cluster' | 'roof' | 'fog-bank';
  x: number; y: number; width?: number; height?: number; depth: 'scenery' | 'occlusion' | 'foreground';
}

export type WorldCharacterAppearance = 'hero' | 'researcher' | 'villager' | 'fisher';
export type WorldCharacterBehavior = 'idle' | 'study-tide' | 'look-out' | 'sort-nets';
export interface WorldCharacterSpec {
  id: string;
  appearance: WorldCharacterAppearance;
  behavior: WorldCharacterBehavior;
  /** Omit position for a dynamic entity supplied by the authoritative world snapshot. */
  x?: number;
  y?: number;
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
  landmarks?: readonly WorldLandmarkSpec[];
  characters?: readonly WorldCharacterSpec[];
}

export type SkillVisualTier = 'basic' | 'signature' | 'finisher';
export type DeliveryKind = 'melee' | 'projectile' | 'beam' | 'area' | 'aura';

export interface SkillVisualRecipe {
  id: string;
  skillId: string;
  element: TypeName;
  tier: SkillVisualTier;
  delivery: DeliveryKind;
  impact: 'spark' | 'burst' | 'wave' | 'rune' | 'heal' | 'status';
  camera: 'light' | 'track' | 'impact' | 'finisher';
  environmentReaction?: 'scorch' | 'frost' | 'spark' | 'splash' | 'spore' | 'debris' | 'rune-pulse';
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
  },
  {
    id: 'lumen-trail', mapId: 'route1', biome: 'lumen-forest',
    terrain: [{ id: 'forest-path', depth: 2 }],
    scenery: [{ id: 'forest-trunks', depth: 3 }, { id: 'forest-canopy-back', depth: 3, parallax: 0.88 }],
    occlusion: [{ id: 'forest-canopy-front', depth: 5 }],
    foreground: [{ id: 'lumen-motes', depth: 6, parallax: 1.08 }],
    ambience: { preset: 'pollen', density: 0.55 },
  },
];

export const WORLD_SCENE_BY_MAP_ID: Readonly<Record<string, WorldSceneSpec>> = Object.fromEntries(
  WORLD_SCENES.map((scene) => [scene.mapId, scene]),
);

function deliveryFor(skill: Skill): DeliveryKind {
  if (skill.effect?.kind === 'heal' || skill.effect?.kind === 'shield' || skill.effect?.kind === 'buff') return 'aura';
  if (skill.targetMode === 'all-enemies') return 'area';
  if (skill.range === 'melee') return 'melee';
  if (skill.id.includes('beam') || skill.id.includes('ray') || skill.id.includes('laser')) return 'beam';
  return 'projectile';
}

function impactFor(skill: Skill, delivery: DeliveryKind): SkillVisualRecipe['impact'] {
  if (skill.effect?.kind === 'heal') return 'heal';
  if (skill.effect?.kind === 'status' || skill.effect?.kind === 'stun' || skill.effect?.kind === 'debuff') return 'status';
  if (delivery === 'area') return 'wave';
  if (skill.type === 'psychic' || skill.type === 'ghost') return 'rune';
  return delivery === 'melee' ? 'spark' : 'burst';
}

function reactionFor(type: TypeName): SkillVisualRecipe['environmentReaction'] | undefined {
  const reactions: Partial<Record<TypeName, NonNullable<SkillVisualRecipe['environmentReaction']>>> = {
    fire: 'scorch', ice: 'frost', electric: 'spark', water: 'splash', grass: 'spore', rock: 'debris', ground: 'debris', psychic: 'rune-pulse', ghost: 'rune-pulse', dragon: 'rune-pulse',
  };
  return reactions[type];
}

function recipeFor(skill: Skill): SkillVisualRecipe {
  const delivery = deliveryFor(skill);
  const tier: SkillVisualTier = skill.power >= 110 ? 'finisher' : skill.power >= 75 ? 'signature' : 'basic';
  return {
    id: `skill:${skill.id}`,
    skillId: skill.id,
    element: skill.type,
    tier,
    delivery,
    impact: impactFor(skill, delivery),
    camera: tier === 'finisher' ? 'finisher' : delivery === 'projectile' || delivery === 'beam' ? 'track' : delivery === 'area' ? 'impact' : 'light',
    environmentReaction: reactionFor(skill.type),
  };
}

/** Every current skill gets a deterministic, data-driven fallback recipe.
 * Individual signature overrides will be additive in Stage 6, not renderer
 * conditionals. */
export const SKILL_VISUAL_RECIPES: readonly SkillVisualRecipe[] = SKILLS.map(recipeFor);
export const SKILL_VISUAL_RECIPE_MAP: Readonly<Record<string, SkillVisualRecipe>> = Object.fromEntries(
  SKILL_VISUAL_RECIPES.map((recipe) => [recipe.skillId, recipe]),
);

export function skillVisualRecipeFor(skillId: string): SkillVisualRecipe | undefined {
  return SKILL_VISUAL_RECIPE_MAP[skillId];
}

