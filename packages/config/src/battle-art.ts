import type { Ability, PassiveSkill, Skill, Species, StatusKind, TypeName } from '@pokemon-online/shared';
import { ABILITIES } from './abilities.ts';
import { PASSIVE_SKILLS } from './passive-skills.ts';
import { SPECIES_LIST } from './pokemon.ts';
import { NORMAL_ATTACK, SKILL_MAP, SKILLS } from './skills.ts';
import { SKILL_VISUAL_RECIPE_MAP } from './skill-visuals.ts';
import type { DeliveryKind, SkillVisualRecipe } from './visuals.ts';

/**
 * Battle art is static presentation configuration. It deliberately contains no
 * Pixi objects, DOM state, battle results, or save data. Renderer consumers
 * receive the resolved DTO and must not add species / skill branches of their
 * own.
 */
export type BattleArtAssetKind = 'static-sprite' | 'fallback-shape';
export type BattleArtAnchorId = 'root' | 'center' | 'body' | 'head' | 'muzzle' | 'ground';
export type BattleArtMotionId =
  | 'idle' | 'locomotion' | 'enter' | 'exit' | 'attack' | 'cast'
  | 'charge' | 'channel' | 'recover' | 'hit' | 'faint';
export type BattleArtPaletteMode = 'element' | 'profile' | 'hybrid';
export type BattleArtSide = 'player' | 'enemy';
/** Generic GPU decoration primitives. Their shapes are renderer capabilities;
 * profile data decides which ones a model uses. */
export type BattleArtLayerKind = 'aura' | 'halo';
export type BattleArtLayerColor = 'primary' | 'secondary' | 'highlight';
export type BattleArtLayerDepth = 'behind' | 'front';

export interface BattleAssetManifestEntry {
  id: string;
  kind: BattleArtAssetKind;
  /** Public asset URL. Only the manifest owns concrete resource paths. */
  url: string;
  source: 'pokeapi-sprites' | 'procedural-fallback';
  quality: 'all';
}

export interface BattleArtAnchor {
  id: BattleArtAnchorId;
  x: number;
  y: number;
}

/** Reusable 2.5D decoration. A layer never identifies a species or skill. */
export interface BattleArtLayerSpec {
  id: string;
  kind: BattleArtLayerKind;
  color: BattleArtLayerColor;
  depth: BattleArtLayerDepth;
  alpha: number;
  scale: number;
  /** Optional normalized breathing amount for idle / charge / channel. */
  pulse?: number;
}

/** Motion-transform data for a model. The renderer interpolates these generic
 * values; gameplay timing and outcomes stay in engine/presentation. */
export interface BattleArtMotionPose {
  offsetX?: number;
  offsetY?: number;
  rotationDeg?: number;
  scaleX?: number;
  scaleY?: number;
  glowAlpha?: number;
  glowScale?: number;
}

export interface BattleMotionMarker {
  id: 'prepare' | 'release' | 'impact-ready' | 'recover';
  at: number;
  anchor?: BattleArtAnchorId;
}

export interface BattleMotionClip {
  id: BattleArtMotionId;
  durationMs: number;
  loop: boolean;
  blendInMs: number;
  blendOutMs: number;
  /** Normalized point at which a higher-priority reaction may replace the clip. */
  interruptibleAt: number;
  markers: readonly BattleMotionMarker[];
}

export type BattleMotionSet = Readonly<Record<BattleArtMotionId, BattleMotionClip>>;

export interface BattleVisualTheme {
  id: string;
  primary: string;
  secondary: string;
  highlight: string;
}

export interface BattleArtProfile {
  id: string;
  speciesId?: number;
  modelId: string;
  frontAssetId: string;
  backAssetId: string;
  fallbackAssetId: string;
  themeId: string;
  paletteMode: BattleArtPaletteMode;
  anchors: readonly BattleArtAnchor[];
  motions: BattleMotionSet;
  layers: readonly BattleArtLayerSpec[];
  motionPoses: Partial<Readonly<Record<BattleArtMotionId, BattleArtMotionPose>>>;
  scale: number;
  shadowScale: number;
}

export interface SkillCastPresentationSpec {
  skillId: string;
  delivery: DeliveryKind;
  /** Gameplay remains authoritative: this mirrors Skill.castTime for presentation planning only. */
  windupMs: number;
  releaseAt: number;
  charge: boolean;
  channel: boolean;
  recoveryMs: number;
  actorMotion: BattleArtMotionId;
  projectileAnchor: BattleArtAnchorId;
}

export interface ReactiveVisualRecipe {
  id: string;
  subject: 'ability' | 'passive' | 'status';
  trigger: string;
  themeType?: TypeName;
  motif: 'aura' | 'spark' | 'shield' | 'heal' | 'status';
}

export interface BattleArtResolutionInput {
  speciesId: number;
  side: BattleArtSide;
  skillId?: string;
  motion?: BattleArtMotionId;
}

export interface ResolvedBattleArtPresentation {
  profile: BattleArtProfile;
  asset: BattleAssetManifestEntry;
  theme: BattleVisualTheme;
  motion: BattleMotionClip;
  cast: SkillCastPresentationSpec;
  skillRecipe?: SkillVisualRecipe;
  projectileAnchor: BattleArtAnchor;
}

const TYPE_THEME_COLORS: Readonly<Record<TypeName, readonly [primary: string, secondary: string, highlight: string]>> = {
  normal: ['#e5e7eb', '#aeb7c5', '#ffffff'],
  fire: ['#ff824e', '#d94735', '#ffe3a3'],
  water: ['#69c8ff', '#387fc7', '#d9fbff'],
  grass: ['#86dc78', '#3d9f61', '#efffb2'],
  electric: ['#ffdf58', '#e5a72b', '#fff7b3'],
  ice: ['#b7edff', '#65b6da', '#efffff'],
  fighting: ['#ee7e64', '#ad3c4e', '#ffd0ae'],
  poison: ['#c787e8', '#7d4da1', '#f4c2ff'],
  ground: ['#ca8b52', '#8c5b42', '#ffe1a5'],
  flying: ['#9ebcf6', '#6679cb', '#f0f4ff'],
  psychic: ['#fb8bd1', '#b954ad', '#ffe1fb'],
  bug: ['#b5d45f', '#718d3e', '#f5ffb6'],
  rock: ['#c4a16d', '#806448', '#f9dfaa'],
  ghost: ['#a98ae7', '#69529f', '#eadbff'],
  dragon: ['#ae8dff', '#694ac5', '#f0dcff'],
  dark: ['#7b7692', '#423f58', '#d8d5ec'],
  steel: ['#a7b5c6', '#697b91', '#edf8ff'],
  fairy: ['#f5a8d0', '#d873ad', '#ffe7f4'],
};

export const BATTLE_VISUAL_THEMES: Readonly<Record<string, BattleVisualTheme>> = Object.fromEntries(
  Object.entries(TYPE_THEME_COLORS).map(([type, [primary, secondary, highlight]]) => [
    `type:${type}`,
    { id: `type:${type}`, primary, secondary, highlight },
  ]),
);

const DEFAULT_ANCHORS: readonly BattleArtAnchor[] = [
  { id: 'root', x: 0, y: 0 },
  { id: 'center', x: 0, y: -0.18 },
  { id: 'body', x: 0, y: -0.1 },
  { id: 'head', x: 0.08, y: -0.48 },
  { id: 'muzzle', x: 0.34, y: -0.24 },
  { id: 'ground', x: 0, y: 0.28 },
];

const DEFAULT_LAYERS: readonly BattleArtLayerSpec[] = [];
const DEFAULT_MOTION_POSES: Partial<Readonly<Record<BattleArtMotionId, BattleArtMotionPose>>> = {};

const DEFAULT_MOTIONS: BattleMotionSet = {
  idle: { id: 'idle', durationMs: 1400, loop: true, blendInMs: 120, blendOutMs: 120, interruptibleAt: 0, markers: [] },
  locomotion: { id: 'locomotion', durationMs: 620, loop: true, blendInMs: 90, blendOutMs: 100, interruptibleAt: 0, markers: [] },
  enter: { id: 'enter', durationMs: 360, loop: false, blendInMs: 0, blendOutMs: 90, interruptibleAt: 0.65, markers: [{ id: 'prepare', at: 0.15, anchor: 'ground' }] },
  exit: { id: 'exit', durationMs: 280, loop: false, blendInMs: 60, blendOutMs: 0, interruptibleAt: 0.4, markers: [{ id: 'recover', at: 0.6, anchor: 'ground' }] },
  attack: { id: 'attack', durationMs: 360, loop: false, blendInMs: 70, blendOutMs: 110, interruptibleAt: 0.62, markers: [{ id: 'prepare', at: 0.08 }, { id: 'release', at: 0.48, anchor: 'muzzle' }, { id: 'recover', at: 0.78 }] },
  cast: { id: 'cast', durationMs: 460, loop: false, blendInMs: 80, blendOutMs: 130, interruptibleAt: 0.58, markers: [{ id: 'prepare', at: 0.1 }, { id: 'release', at: 0.54, anchor: 'muzzle' }, { id: 'recover', at: 0.82 }] },
  charge: { id: 'charge', durationMs: 720, loop: true, blendInMs: 100, blendOutMs: 100, interruptibleAt: 0.12, markers: [{ id: 'prepare', at: 0.1, anchor: 'body' }] },
  channel: { id: 'channel', durationMs: 840, loop: true, blendInMs: 100, blendOutMs: 120, interruptibleAt: 0.1, markers: [{ id: 'release', at: 0.18, anchor: 'muzzle' }] },
  recover: { id: 'recover', durationMs: 240, loop: false, blendInMs: 70, blendOutMs: 90, interruptibleAt: 0.65, markers: [{ id: 'recover', at: 0.25 }] },
  hit: { id: 'hit', durationMs: 220, loop: false, blendInMs: 30, blendOutMs: 100, interruptibleAt: 0.48, markers: [{ id: 'impact-ready', at: 0.08, anchor: 'body' }] },
  faint: { id: 'faint', durationMs: 620, loop: false, blendInMs: 50, blendOutMs: 0, interruptibleAt: 1, markers: [{ id: 'impact-ready', at: 0.1, anchor: 'body' }] },
};

const FALLBACK_ASSET_ID = 'battle:fallback-shape';

export const BATTLE_ASSET_MANIFEST: readonly BattleAssetManifestEntry[] = [
  { id: FALLBACK_ASSET_ID, kind: 'fallback-shape', url: '', source: 'procedural-fallback', quality: 'all' },
  ...SPECIES_LIST.flatMap((species) => [
    { id: `pokemon:${species.id}:front`, kind: 'static-sprite' as const, url: `/sprites/pokemon/${species.id}.png`, source: 'pokeapi-sprites' as const, quality: 'all' as const },
    { id: `pokemon:${species.id}:back`, kind: 'static-sprite' as const, url: `/sprites/pokemon/back/${species.id}.png`, source: 'pokeapi-sprites' as const, quality: 'all' as const },
  ]),
];

export const BATTLE_ASSET_BY_ID: Readonly<Record<string, BattleAssetManifestEntry>> = Object.fromEntries(
  BATTLE_ASSET_MANIFEST.map((asset) => [asset.id, asset]),
);

interface RepresentativeBattleArtTuning {
  modelId: string;
  scale: number;
  shadowScale: number;
  layers: readonly BattleArtLayerSpec[];
  motionPoses: Partial<Readonly<Record<BattleArtMotionId, BattleArtMotionPose>>>;
}

/** The first six representative models cover aerial burst, small agile,
 * spectral caster, broad water support, heavy tank, and aerial dragon roles.
 * They intentionally reuse the legal existing sprite base while exercising the
 * same layer/motion contract future skeletal or sequence-frame assets use. */
export const REPRESENTATIVE_BATTLE_ART_SPECIES = [6, 25, 94, 131, 143, 149] as const;

const REPRESENTATIVE_BATTLE_ART_TUNINGS: Readonly<Record<number, RepresentativeBattleArtTuning>> = {
  6: {
    modelId: 'showcase:flame-wing', scale: 1.16, shadowScale: 1.22,
    layers: [
      { id: 'ember-aura', kind: 'aura', color: 'secondary', depth: 'behind', alpha: 0.20, scale: 1.15, pulse: 0.18 },
      { id: 'wing-halo', kind: 'halo', color: 'highlight', depth: 'front', alpha: 0.16, scale: 0.92, pulse: 0.12 },
    ],
    motionPoses: {
      idle: { offsetY: -5, glowAlpha: 0.20, glowScale: 1.04 },
      attack: { offsetX: 19, offsetY: -3, rotationDeg: 8, scaleX: 1.10, scaleY: 0.92 },
      cast: { offsetX: 8, offsetY: -6, rotationDeg: -5, glowAlpha: 0.35, glowScale: 1.22 },
      charge: { offsetY: -7, glowAlpha: 0.46, glowScale: 1.30 },
      channel: { offsetY: -6, glowAlpha: 0.42, glowScale: 1.24 },
      hit: { offsetX: -12, rotationDeg: -8, scaleX: 0.92 },
      faint: { offsetY: 10, rotationDeg: 18, scaleY: 0.72 },
    },
  },
  25: {
    modelId: 'showcase:volt-scout', scale: 0.96, shadowScale: 0.86,
    layers: [
      { id: 'spark-aura', kind: 'aura', color: 'highlight', depth: 'behind', alpha: 0.18, scale: 0.82, pulse: 0.26 },
    ],
    motionPoses: {
      idle: { offsetY: -3, glowAlpha: 0.16, glowScale: 1.08 },
      locomotion: { offsetX: 5, offsetY: -2, rotationDeg: 4, scaleX: 1.05, scaleY: 0.94 },
      attack: { offsetX: 24, offsetY: -2, rotationDeg: 12, scaleX: 1.16, scaleY: 0.86 },
      cast: { offsetY: -5, rotationDeg: -6, glowAlpha: 0.38, glowScale: 1.32 },
      charge: { offsetY: -4, glowAlpha: 0.50, glowScale: 1.38 },
      hit: { offsetX: -14, rotationDeg: -12, scaleX: 0.88 },
      faint: { offsetY: 9, rotationDeg: 24, scaleY: 0.70 },
    },
  },
  94: {
    modelId: 'showcase:spectral-caster', scale: 1.04, shadowScale: 0.92,
    layers: [
      { id: 'spectral-mist', kind: 'aura', color: 'secondary', depth: 'behind', alpha: 0.26, scale: 1.22, pulse: 0.20 },
      { id: 'rune-halo', kind: 'halo', color: 'highlight', depth: 'front', alpha: 0.14, scale: 1.02, pulse: 0.18 },
    ],
    motionPoses: {
      idle: { offsetY: -7, rotationDeg: -2, glowAlpha: 0.28, glowScale: 1.12 },
      cast: { offsetY: -10, rotationDeg: 7, glowAlpha: 0.48, glowScale: 1.42 },
      charge: { offsetY: -12, glowAlpha: 0.54, glowScale: 1.48 },
      channel: { offsetY: -11, rotationDeg: 4, glowAlpha: 0.46, glowScale: 1.40 },
      hit: { offsetX: -10, rotationDeg: -9, scaleX: 0.90 },
      faint: { offsetY: 14, rotationDeg: 20, scaleY: 0.68 },
    },
  },
  131: {
    modelId: 'showcase:tide-guardian', scale: 1.14, shadowScale: 1.34,
    layers: [
      { id: 'tide-aura', kind: 'aura', color: 'secondary', depth: 'behind', alpha: 0.22, scale: 1.34, pulse: 0.16 },
      { id: 'foam-halo', kind: 'halo', color: 'highlight', depth: 'front', alpha: 0.13, scale: 1.12, pulse: 0.10 },
    ],
    motionPoses: {
      idle: { offsetY: -4, glowAlpha: 0.20, glowScale: 1.08 },
      attack: { offsetX: 14, offsetY: -2, rotationDeg: 5, scaleX: 1.08, scaleY: 0.94 },
      cast: { offsetY: -5, glowAlpha: 0.34, glowScale: 1.26 },
      charge: { offsetY: -6, glowAlpha: 0.42, glowScale: 1.34 },
      channel: { offsetY: -5, glowAlpha: 0.38, glowScale: 1.30 },
      hit: { offsetX: -8, rotationDeg: -5, scaleX: 0.95 },
      faint: { offsetY: 12, rotationDeg: 12, scaleY: 0.76 },
    },
  },
  143: {
    modelId: 'showcase:fortress-tank', scale: 1.20, shadowScale: 1.42,
    layers: [
      { id: 'fortress-halo', kind: 'halo', color: 'primary', depth: 'behind', alpha: 0.14, scale: 1.30, pulse: 0.08 },
    ],
    motionPoses: {
      idle: { offsetY: -2, glowAlpha: 0.12, glowScale: 1.02 },
      attack: { offsetX: 16, rotationDeg: 5, scaleX: 1.12, scaleY: 0.90 },
      cast: { offsetY: -3, glowAlpha: 0.24, glowScale: 1.16 },
      charge: { offsetY: -3, scaleX: 1.04, scaleY: 0.94, glowAlpha: 0.30, glowScale: 1.18 },
      hit: { offsetX: -6, rotationDeg: -3, scaleX: 0.97 },
      faint: { offsetY: 10, rotationDeg: 10, scaleY: 0.82 },
    },
  },
  149: {
    modelId: 'showcase:sky-dragon', scale: 1.13, shadowScale: 1.18,
    layers: [
      { id: 'dragon-aura', kind: 'aura', color: 'secondary', depth: 'behind', alpha: 0.22, scale: 1.20, pulse: 0.18 },
      { id: 'sky-halo', kind: 'halo', color: 'highlight', depth: 'front', alpha: 0.15, scale: 1.00, pulse: 0.14 },
    ],
    motionPoses: {
      idle: { offsetY: -6, glowAlpha: 0.22, glowScale: 1.08 },
      attack: { offsetX: 20, offsetY: -4, rotationDeg: 7, scaleX: 1.11, scaleY: 0.90 },
      cast: { offsetY: -7, rotationDeg: -4, glowAlpha: 0.36, glowScale: 1.26 },
      charge: { offsetY: -9, glowAlpha: 0.46, glowScale: 1.36 },
      channel: { offsetY: -8, glowAlpha: 0.40, glowScale: 1.30 },
      hit: { offsetX: -11, rotationDeg: -7, scaleX: 0.92 },
      faint: { offsetY: 13, rotationDeg: 16, scaleY: 0.72 },
    },
  },
};

function profileFor(species: Species): BattleArtProfile {
  const type = species.types[0] ?? 'normal';
  const tuning = REPRESENTATIVE_BATTLE_ART_TUNINGS[species.id];
  return {
    id: `species:${species.id}`,
    speciesId: species.id,
    modelId: tuning?.modelId ?? `pokemon:${species.id}`,
    frontAssetId: `pokemon:${species.id}:front`,
    backAssetId: `pokemon:${species.id}:back`,
    fallbackAssetId: FALLBACK_ASSET_ID,
    themeId: `type:${type}`,
    /** The profile palette lets a shared move inherit model identity without cloning the skill. */
    paletteMode: 'hybrid',
    anchors: DEFAULT_ANCHORS,
    motions: DEFAULT_MOTIONS,
    layers: tuning?.layers ?? DEFAULT_LAYERS,
    motionPoses: tuning?.motionPoses ?? DEFAULT_MOTION_POSES,
    scale: tuning?.scale ?? 1,
    shadowScale: tuning?.shadowScale ?? 1,
  };
}

export const BATTLE_ART_PROFILES: readonly BattleArtProfile[] = SPECIES_LIST.map(profileFor);
export const BATTLE_ART_PROFILE_BY_SPECIES_ID: Readonly<Record<number, BattleArtProfile>> = Object.fromEntries(
  BATTLE_ART_PROFILES.map((profile) => [profile.speciesId!, profile]),
);

export const GENERIC_BATTLE_ART_PROFILE: BattleArtProfile = {
  id: 'generic:fallback',
  modelId: 'generic:fallback',
  frontAssetId: FALLBACK_ASSET_ID,
  backAssetId: FALLBACK_ASSET_ID,
  fallbackAssetId: FALLBACK_ASSET_ID,
  themeId: 'type:normal',
  paletteMode: 'element',
  anchors: DEFAULT_ANCHORS,
  motions: DEFAULT_MOTIONS,
  layers: DEFAULT_LAYERS,
  motionPoses: DEFAULT_MOTION_POSES,
  scale: 1,
  shadowScale: 1,
};

function castPresentationFor(skill: Skill, recipe: SkillVisualRecipe | undefined): SkillCastPresentationSpec {
  const delivery = recipe?.delivery ?? (skill.range === 'melee' ? 'melee' : 'projectile');
  const windupMs = Math.round((skill.castTime ?? 0) * 1000);
  const charge = windupMs > 0;
  const channel = delivery === 'beam';
  return {
    skillId: skill.id,
    delivery,
    windupMs,
    releaseAt: charge ? 1 : 0.48,
    charge,
    channel,
    recoveryMs: delivery === 'melee' ? 180 : channel ? 240 : 160,
    actorMotion: delivery === 'melee' ? 'attack' : 'cast',
    projectileAnchor: delivery === 'melee' ? 'body' : 'muzzle',
  };
}

export const SKILL_CAST_PRESENTATIONS: readonly SkillCastPresentationSpec[] = SKILLS.map((skill) => castPresentationFor(skill, SKILL_VISUAL_RECIPE_MAP[skill.id]));
export const SKILL_CAST_PRESENTATION_BY_SKILL_ID: Readonly<Record<string, SkillCastPresentationSpec>> = Object.fromEntries(
  SKILL_CAST_PRESENTATIONS.map((presentation) => [presentation.skillId, presentation]),
);
export const DEFAULT_SKILL_CAST_PRESENTATION: SkillCastPresentationSpec = castPresentationFor(NORMAL_ATTACK, undefined);

/** Legacy/presentation animation labels map to the configuration-owned motion
 * vocabulary here. Renderers never need to know whether a label originated
 * from a basic attack, a named skill, or a particular species. */
export function battleArtMotionForAnimation(animation: string): BattleArtMotionId {
  switch (animation) {
    case 'windup': return 'charge';
    case 'melee': return 'attack';
    case 'projectile':
    case 'beam':
    case 'burst':
    case 'cast': return 'cast';
    case 'recoil': return 'recover';
    case 'hit': return 'hit';
    case 'faint': return 'faint';
    case 'enter': return 'enter';
    case 'exit': return 'exit';
    case 'move': return 'locomotion';
    default: return 'idle';
  }
}

function motifForEffect(kind: string): ReactiveVisualRecipe['motif'] {
  if (kind === 'shield' || kind === 'contactShield') return 'shield';
  if (kind === 'heal' || kind === 'hpRegen' || kind === 'lifesteal' || kind === 'statusRecovery') return 'heal';
  if (kind === 'status' || kind === 'stun' || kind === 'debuff' || kind === 'statusReflect') return 'status';
  if (kind === 'crit') return 'spark';
  return 'aura';
}

function abilityRecipeFor(ability: Ability): ReactiveVisualRecipe {
  return { id: ability.id, subject: 'ability', trigger: ability.trigger, themeType: ability.effect.type, motif: motifForEffect(ability.effect.kind) };
}
function passiveRecipeFor(passive: PassiveSkill): ReactiveVisualRecipe {
  return { id: passive.id, subject: 'passive', trigger: passive.effect.kind, themeType: passive.effect.type, motif: motifForEffect(passive.effect.kind) };
}

export const ABILITY_VISUAL_RECIPES: readonly ReactiveVisualRecipe[] = ABILITIES.map(abilityRecipeFor);
export const PASSIVE_VISUAL_RECIPES: readonly ReactiveVisualRecipe[] = PASSIVE_SKILLS.map(passiveRecipeFor);
export const STATUS_VISUAL_RECIPES: Readonly<Record<StatusKind, ReactiveVisualRecipe>> = {
  burn: { id: 'burn', subject: 'status', trigger: 'active', themeType: 'fire', motif: 'status' },
  poison: { id: 'poison', subject: 'status', trigger: 'active', themeType: 'poison', motif: 'status' },
  paralyze: { id: 'paralyze', subject: 'status', trigger: 'active', themeType: 'electric', motif: 'spark' },
  freeze: { id: 'freeze', subject: 'status', trigger: 'active', themeType: 'ice', motif: 'status' },
  sleep: { id: 'sleep', subject: 'status', trigger: 'active', themeType: 'psychic', motif: 'status' },
  confuse: { id: 'confuse', subject: 'status', trigger: 'active', themeType: 'psychic', motif: 'status' },
};

function themeFor(profile: BattleArtProfile, recipe?: SkillVisualRecipe): BattleVisualTheme {
  const profileTheme = BATTLE_VISUAL_THEMES[profile.themeId] ?? BATTLE_VISUAL_THEMES['type:normal']!;
  const elementTheme = recipe ? BATTLE_VISUAL_THEMES[`type:${recipe.element}`] ?? profileTheme : profileTheme;
  if (profile.paletteMode === 'element') return elementTheme;
  if (profile.paletteMode === 'profile') return profileTheme;
  return {
    id: `${profileTheme.id}+${elementTheme.id}`,
    primary: profileTheme.primary,
    secondary: elementTheme.secondary,
    highlight: elementTheme.highlight,
  };
}

function anchorFor(profile: BattleArtProfile, id: BattleArtAnchorId): BattleArtAnchor {
  return profile.anchors.find((anchor) => anchor.id === id)
    ?? GENERIC_BATTLE_ART_PROFILE.anchors.find((anchor) => anchor.id === id)
    ?? DEFAULT_ANCHORS[0]!;
}

/** Pure configuration resolver. It is the only place that combines a shared
 * skill recipe with a model profile/theme; actual renderers consume its result. */
export function resolveBattleArtPresentation(input: BattleArtResolutionInput): ResolvedBattleArtPresentation {
  const profile = BATTLE_ART_PROFILE_BY_SPECIES_ID[input.speciesId] ?? GENERIC_BATTLE_ART_PROFILE;
  const skillRecipe = input.skillId ? SKILL_VISUAL_RECIPE_MAP[input.skillId] : undefined;
  const cast = input.skillId ? SKILL_CAST_PRESENTATION_BY_SKILL_ID[input.skillId] ?? DEFAULT_SKILL_CAST_PRESENTATION : DEFAULT_SKILL_CAST_PRESENTATION;
  const motionId = input.motion ?? (cast.charge ? 'charge' : cast.actorMotion);
  const assetId = input.side === 'player' ? profile.backAssetId : profile.frontAssetId;
  const asset = BATTLE_ASSET_BY_ID[assetId] ?? BATTLE_ASSET_BY_ID[profile.fallbackAssetId] ?? BATTLE_ASSET_BY_ID[FALLBACK_ASSET_ID]!;
  return {
    profile,
    asset,
    theme: themeFor(profile, skillRecipe),
    motion: profile.motions[motionId] ?? GENERIC_BATTLE_ART_PROFILE.motions.idle,
    cast,
    skillRecipe,
    projectileAnchor: anchorFor(profile, cast.projectileAnchor),
  };
}

export interface BattleArtValidationReport {
  missingSpeciesProfileIds: readonly number[];
  duplicateSpeciesProfileIds: readonly number[];
  missingAssetIds: readonly string[];
  invalidProfileIds: readonly string[];
  invalidMotionProfileIds: readonly string[];
  invalidAnchorProfileIds: readonly string[];
  invalidLayerProfileIds: readonly string[];
  missingSkillCastIds: readonly string[];
  missingAbilityRecipeIds: readonly string[];
  missingPassiveRecipeIds: readonly string[];
  missingStatusRecipeIds: readonly string[];
}

const REQUIRED_MOTIONS: readonly BattleArtMotionId[] = ['idle', 'locomotion', 'enter', 'exit', 'attack', 'cast', 'charge', 'channel', 'recover', 'hit', 'faint'];
const REQUIRED_ANCHORS: readonly BattleArtAnchorId[] = ['root', 'body', 'muzzle', 'ground'];

/** Static config validation only. Loading/decoding resources belongs to the
 * future asset loader, while this check guarantees every reference is declared. */
export function validateBattleArtConfiguration(
  profiles: readonly BattleArtProfile[] = BATTLE_ART_PROFILES,
  assets: readonly BattleAssetManifestEntry[] = BATTLE_ASSET_MANIFEST,
): BattleArtValidationReport {
  const assetIds = new Set(assets.map((asset) => asset.id));
  const knownSpeciesIds = new Set(SPECIES_LIST.map((species) => species.id));
  const seenSpecies = new Set<number>();
  const duplicateSpeciesProfileIds: number[] = [];
  const invalidProfileIds: string[] = [];
  const invalidMotionProfileIds: string[] = [];
  const invalidAnchorProfileIds: string[] = [];
  const invalidLayerProfileIds: string[] = [];
  const missingAssetIds: string[] = [];

  for (const profile of profiles) {
    if (profile.speciesId !== undefined) {
      if (seenSpecies.has(profile.speciesId)) duplicateSpeciesProfileIds.push(profile.speciesId);
      seenSpecies.add(profile.speciesId);
      if (!knownSpeciesIds.has(profile.speciesId)) invalidProfileIds.push(profile.id);
    }
    if (!BATTLE_VISUAL_THEMES[profile.themeId] || profile.scale <= 0 || profile.shadowScale <= 0) invalidProfileIds.push(profile.id);
    for (const assetId of [profile.frontAssetId, profile.backAssetId, profile.fallbackAssetId]) if (!assetIds.has(assetId)) missingAssetIds.push(`${profile.id}:${assetId}`);
    const anchorIds = new Set(profile.anchors.map((anchor) => anchor.id));
    if (profile.layers.some((layer) => !layer.id || layer.alpha < 0 || layer.alpha > 1 || layer.scale <= 0 || (layer.pulse !== undefined && (layer.pulse < 0 || layer.pulse > 1)))) invalidLayerProfileIds.push(profile.id);
    if (Object.values(profile.motionPoses).some((pose) => Object.values(pose).some((value) => !Number.isFinite(value)))) invalidLayerProfileIds.push(profile.id);
    if (REQUIRED_ANCHORS.some((anchor) => !anchorIds.has(anchor))) invalidAnchorProfileIds.push(profile.id);
    for (const motion of REQUIRED_MOTIONS) {
      const clip = profile.motions[motion];
      if (!clip || clip.durationMs <= 0 || clip.interruptibleAt < 0 || clip.interruptibleAt > 1 || clip.markers.some((marker) => marker.at < 0 || marker.at > 1 || (marker.anchor && !anchorIds.has(marker.anchor)))) {
        invalidMotionProfileIds.push(profile.id);
        break;
      }
    }
  }

  const abilityIds = new Set(ABILITY_VISUAL_RECIPES.map((recipe) => recipe.id));
  const passiveIds = new Set(PASSIVE_VISUAL_RECIPES.map((recipe) => recipe.id));
  return {
    missingSpeciesProfileIds: SPECIES_LIST.filter((species) => !seenSpecies.has(species.id)).map((species) => species.id),
    duplicateSpeciesProfileIds,
    missingAssetIds,
    invalidProfileIds,
    invalidMotionProfileIds,
    invalidAnchorProfileIds,
    invalidLayerProfileIds,
    missingSkillCastIds: SKILLS.filter((skill) => !SKILL_CAST_PRESENTATION_BY_SKILL_ID[skill.id]).map((skill) => skill.id),
    missingAbilityRecipeIds: ABILITIES.filter((ability) => !abilityIds.has(ability.id)).map((ability) => ability.id),
    missingPassiveRecipeIds: PASSIVE_SKILLS.filter((passive) => !passiveIds.has(passive.id)).map((passive) => passive.id),
    missingStatusRecipeIds: (Object.keys(STATUS_VISUAL_RECIPES) as StatusKind[]).length === 6 ? [] : ['status-catalog'],
  };
}
