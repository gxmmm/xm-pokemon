import type { Skill, TypeName } from '@pokemon-online/shared';
import { SKILLS } from './skills.ts';
import type { DeliveryKind, EnvironmentReaction, SkillRecipeVariant, SkillVisualImpact, SkillVisualRecipe, SkillVisualTier } from './visuals.ts';

export interface SkillVisualGrammar {
  element: TypeName;
  defaultImpact: SkillVisualImpact;
  reaction?: EnvironmentReaction;
  variants: readonly SkillRecipeVariant[];
}

/** Type grammar is config data shared by generated fallback recipes and focused
 * signature overrides. It deliberately stays outside renderer-pixi. */
export const SKILL_VISUAL_GRAMMAR: Readonly<Record<TypeName, SkillVisualGrammar>> = {
  normal: { element: 'normal', defaultImpact: 'spark', variants: ['default', 'cross'] },
  fire: { element: 'fire', defaultImpact: 'burst', reaction: 'scorch', variants: ['default', 'meteor', 'surge'] },
  water: { element: 'water', defaultImpact: 'wave', reaction: 'splash', variants: ['default', 'surge', 'hymn'] },
  grass: { element: 'grass', defaultImpact: 'burst', reaction: 'spore', variants: ['default', 'surge', 'hymn'] },
  electric: { element: 'electric', defaultImpact: 'spark', reaction: 'spark', variants: ['default', 'chain', 'crown'] },
  ice: { element: 'ice', defaultImpact: 'burst', reaction: 'frost', variants: ['default', 'hymn', 'meteor'] },
  fighting: { element: 'fighting', defaultImpact: 'spark', variants: ['default', 'cross'] },
  poison: { element: 'poison', defaultImpact: 'burst', variants: ['default', 'surge'] },
  ground: { element: 'ground', defaultImpact: 'wave', reaction: 'debris', variants: ['default', 'meteor'] },
  flying: { element: 'flying', defaultImpact: 'wave', variants: ['default', 'cross'] },
  psychic: { element: 'psychic', defaultImpact: 'rune', reaction: 'rune-pulse', variants: ['default', 'hymn', 'meteor'] },
  bug: { element: 'bug', defaultImpact: 'spark', variants: ['default', 'cross'] },
  rock: { element: 'rock', defaultImpact: 'burst', reaction: 'debris', variants: ['default', 'meteor'] },
  ghost: { element: 'ghost', defaultImpact: 'rune', reaction: 'rune-pulse', variants: ['default', 'hymn'] },
  dragon: { element: 'dragon', defaultImpact: 'rune', reaction: 'rune-pulse', variants: ['default', 'meteor', 'surge'] },
  dark: { element: 'dark', defaultImpact: 'burst', variants: ['default', 'cross'] },
  steel: { element: 'steel', defaultImpact: 'spark', variants: ['default', 'cross'] },
  fairy: { element: 'fairy', defaultImpact: 'heal', variants: ['default', 'chant', 'hymn'] },
};

const SIGNATURE_VARIANTS: Readonly<Record<string, SkillRecipeVariant>> = {
  'hyper-beam': 'meteor', 'solar-beam': 'surge', 'draco-meteor': 'meteor', 'volt-chain': 'chain',
  'thunder-crown': 'crown', 'frostbound-hymn': 'hymn', 'renewal-chant': 'chant', 'genesis-pulse': 'hymn',
  'psyonic-annihilation': 'meteor', 'sunfire-pursuit': 'surge', 'tempest-breaker': 'surge',
};

function deliveryFor(skill: Skill): DeliveryKind {
  if (skill.effect?.kind === 'heal' || skill.effect?.kind === 'shield' || skill.effect?.kind === 'buff') return 'aura';
  if (skill.targetMode === 'all-enemies') return 'area';
  if (skill.range === 'melee') return 'melee';
  if (skill.id.includes('beam') || skill.id.includes('ray') || skill.id.includes('laser')) return 'beam';
  return 'projectile';
}
function impactFor(skill: Skill, delivery: DeliveryKind): SkillVisualImpact {
  if (skill.effect?.kind === 'heal') return 'heal';
  if (skill.effect?.kind === 'status' || skill.effect?.kind === 'stun' || skill.effect?.kind === 'debuff') return 'status';
  if (delivery === 'area') return 'wave';
  return SKILL_VISUAL_GRAMMAR[skill.type].defaultImpact;
}
function tierFor(skill: Skill): SkillVisualTier { return skill.power >= 110 ? 'finisher' : skill.power >= 75 ? 'signature' : 'basic'; }
function budgetFor(tier: SkillVisualTier, delivery: DeliveryKind): number {
  const base = tier === 'finisher' ? 28 : tier === 'signature' ? 18 : 11;
  return delivery === 'area' ? base + 6 : delivery === 'beam' ? base + 3 : base;
}
function recipeFor(skill: Skill): SkillVisualRecipe {
  const delivery = deliveryFor(skill);
  const tier = tierFor(skill);
  const grammar = SKILL_VISUAL_GRAMMAR[skill.type];
  return {
    id: `skill:${skill.id}`, skillId: skill.id, element: skill.type, tier, delivery,
    impact: impactFor(skill, delivery),
    camera: tier === 'finisher' ? 'finisher' : delivery === 'projectile' || delivery === 'beam' ? 'track' : delivery === 'area' ? 'impact' : 'light',
    environmentReaction: grammar.reaction,
    variant: SIGNATURE_VARIANTS[skill.id] ?? 'default',
    particleBudget: budgetFor(tier, delivery),
  };
}

/** Every playable skill has a deterministic config recipe. Signature entries
 * override only a generic renderer motif, never renderer-side skill IDs. */
export const SKILL_VISUAL_RECIPES: readonly SkillVisualRecipe[] = SKILLS.map(recipeFor);
export const SKILL_VISUAL_RECIPE_MAP: Readonly<Record<string, SkillVisualRecipe>> = Object.fromEntries(SKILL_VISUAL_RECIPES.map((recipe) => [recipe.skillId, recipe]));
export function skillVisualRecipeFor(skillId: string): SkillVisualRecipe | undefined { return SKILL_VISUAL_RECIPE_MAP[skillId]; }

export interface SkillVisualValidationReport { missingSkillIds: readonly string[]; duplicateSkillIds: readonly string[]; overBudgetRecipeIds: readonly string[]; invalidSignatureSkillIds: readonly string[]; }
export const SKILL_VISUAL_PARTICLE_BUDGET = 36;
export function validateSkillVisualRecipes(recipes: readonly SkillVisualRecipe[] = SKILL_VISUAL_RECIPES): SkillVisualValidationReport {
  const knownSkillIds = new Set(SKILLS.map((skill) => skill.id));
  const seen = new Set<string>();
  const duplicateSkillIds: string[] = [];
  for (const recipe of recipes) { if (seen.has(recipe.skillId)) duplicateSkillIds.push(recipe.skillId); seen.add(recipe.skillId); }
  return {
    missingSkillIds: SKILLS.filter((skill) => !seen.has(skill.id)).map((skill) => skill.id),
    duplicateSkillIds,
    overBudgetRecipeIds: recipes.filter((recipe) => recipe.particleBudget > SKILL_VISUAL_PARTICLE_BUDGET).map((recipe) => recipe.id),
    invalidSignatureSkillIds: Object.keys(SIGNATURE_VARIANTS).filter((skillId) => !knownSkillIds.has(skillId)),
  };
}
