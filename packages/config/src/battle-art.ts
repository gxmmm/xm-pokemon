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
export type BattleArtAssetKind = 'static-sprite' | 'sprite-sheet' | 'fallback-shape';
export type BattleAssetSourceReviewStatus = 'recorded-existing' | 'procedural' | 'code-authored';
export type BattleArtImportStatus = 'awaiting-art-direction-and-source-approval' | 'ready-for-ai-generation' | 'ready-for-manifest-import' | 'integrated';
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

/** Auditable source and rights record. A record documents provenance; it does
 * not itself grant rights beyond the linked upstream terms or project policy. */
export interface BattleAssetSourceRecord {
  id: string;
  label: string;
  sourceUrl: string;
  licenseLabel: string;
  licenseEvidenceUrl: string;
  attribution: string;
  reviewStatus: BattleAssetSourceReviewStatus;
}

export interface BattleAssetManifestEntry {
  id: string;
  kind: BattleArtAssetKind;
  /** Public asset URL. Only the manifest owns concrete resource paths. */
  url: string;
  /** Only sprite-sheet assets provide clip/frame metadata. */
  metadataUrl?: string;
  /** Must identify an entry in BATTLE_ASSET_SOURCES; paths never imply provenance. */
  sourceId: string;
  quality: 'all';
}

/** Production specification for a generated bitmap sequence. The final JSON
 * metadata must use these clip names; renderer code never names a model. */
export interface BattleArtFrameTransitionSpec {
  from: BattleArtMotionId;
  to: BattleArtMotionId;
  durationMs: number;
  easing: 'cubic-in-out';
}

/** JSON metadata next to a sprite sheet. It is renderer-neutral and contains
 * no species or skill identifiers. */
export interface BattleArtSpriteSheetClip {
  frames: readonly number[];
  loop: boolean;
}

export interface BattleArtSpriteSheetMetadata {
  schemaVersion: 1;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  fps: number;
  clips: Partial<Readonly<Record<BattleArtMotionId, BattleArtSpriteSheetClip>>>;
  transitions: readonly BattleArtFrameTransitionSpec[];
}

export interface BattleArtFrameSequenceSpec {
  frameWidth: number;
  frameHeight: number;
  fps: number;
  chromaKey: string;
  requiredClips: readonly BattleArtMotionId[];
  /** Asset-level continuity requirements. The generic player cross-fades/tweens
   * these clips; no model-specific renderer transition code is allowed. */
  transitions: readonly BattleArtFrameTransitionSpec[];
}

/** Design-time contract for a future production asset. It intentionally has no
 * URL or manifest entry until art direction and source rights are confirmed. */
export interface BattleArtImportContract {
  id: string;
  profileId: string;
  modelId: string;
  status: BattleArtImportStatus;
  sourceId: string;
  format: 'png-sequence-json';
  sequence: BattleArtFrameSequenceSpec;
  generationPromptRevision: string;
  plannedFrontAssetId: string;
  plannedBackAssetId: string;
  fallbackAssetId: string;
  requiredMotions: readonly BattleArtMotionId[];
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
  /** A short visual prepare used only when gameplay has no timed cast. */
  visualWindupMs: number;
  releaseAt: number;
  charge: boolean;
  channel: boolean;
  /** Presentation-only finite hold for looped channel clips before recovery. */
  channelMs: number;
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
  /** Runtime target direction selects the corresponding front/back source view.
   * Omitted inputs retain the deployment-side default for config/preload callers. */
  facing?: 1 | -1;
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

/** All production manifest entries must point here for provenance and licence
 * review. The PokeAPI record preserves the existing project's attribution and
 * deliberately does not claim a new licence for Pokémon IP. */
export const BATTLE_ASSET_SOURCES: readonly BattleAssetSourceRecord[] = [
  {
    id: 'pokeapi-sprites',
    label: 'PokeAPI Sprites repository',
    sourceUrl: 'https://github.com/PokeAPI/sprites',
    licenseLabel: 'Upstream repository terms and Pokémon IP rights; use remains non-commercial fan-project use.',
    licenseEvidenceUrl: 'https://github.com/PokeAPI/sprites',
    attribution: 'Sprites © PokeAPI / Pokémon rights holders. Used by this non-commercial fan project.',
    reviewStatus: 'recorded-existing',
  },
  {
    id: 'procedural-fallback',
    label: 'Pokemon Online procedural fallback',
    sourceUrl: 'internal://pokemon-online/renderer-pixi',
    licenseLabel: 'Project code licence (MIT); generated fallback geometry contains no imported character art.',
    licenseEvidenceUrl: 'LICENSE',
    attribution: 'Generated at runtime by Pokemon Online.',
    reviewStatus: 'procedural',
  },
  {
    id: 'pokemon-online-code-authored-flame-wing-v1',
    label: 'Pokemon Online 代码生成 — #006 B-3 火翼飞龙 v1 试验切片',
    sourceUrl: 'internal://pokemon-online/scripts/generate-flame-wing-sequence.py',
    licenseLabel: '项目自制程序化像素资产，适用项目代码的 MIT 许可；角色相关 Pokémon IP 仍归其权利人，项目仅作非商业同人使用。',
    licenseEvidenceUrl: 'scripts/generate-flame-wing-sequence.py',
    attribution: '由 Pokemon Online 的代码生成脚本产生；v1 保留为未验收的历史候选，参数、文件校验和与审核记录见 doc/BATTLE_ASSET_SOURCES.md。',
    reviewStatus: 'code-authored',
  },
  {
    id: 'pokemon-online-code-authored-flame-wing-v2',
    label: 'Pokemon Online 代码生成 — #006 B-3 火翼飞龙 v2 未验收候选',
    sourceUrl: 'internal://pokemon-online/scripts/generate-flame-wing-v2-sequence.py',
    licenseLabel: '项目自制程序化像素资产，适用项目代码的 MIT 许可；角色相关 Pokémon IP 仍归其权利人，项目仅作非商业同人使用。',
    licenseEvidenceUrl: 'scripts/generate-flame-wing-v2-sequence.py',
    attribution: '由 Pokemon Online 的代码生成脚本产生；v2 保留为未验收历史候选，参数、文件校验和与审核记录见 doc/BATTLE_ASSET_SOURCES.md。',
    reviewStatus: 'code-authored',
  },
  {
    id: 'pokemon-online-code-authored-flame-wing-v3',
    label: 'Pokemon Online 代码生成 — #006 B-3 火翼飞龙 v3 未验收候选',
    sourceUrl: 'internal://pokemon-online/scripts/generate-flame-wing-v3-sequence.py',
    licenseLabel: '项目自制程序化像素资产，适用项目代码的 MIT 许可；角色相关 Pokémon IP 仍归其权利人，项目仅作非商业同人使用。',
    licenseEvidenceUrl: 'scripts/generate-flame-wing-v3-sequence.py',
    attribution: '由 Pokemon Online 的代码生成脚本产生；v3 保留为未验收历史候选，参数、文件校验和与审核记录见 doc/BATTLE_ASSET_SOURCES.md。',
    reviewStatus: 'code-authored',
  },
  {
    id: 'pokemon-online-pokeapi-derived-flame-wing-v4',
    label: 'Pokemon Online 序列帧封装 — #006 PokeAPI 静态 sprite v4 审核候选',
    sourceUrl: 'https://github.com/PokeAPI/sprites',
    licenseLabel: '基于项目已记录的 PokeAPI 静态 sprite 逐像素复制生成序列帧封装；适用上游仓库条款与 Pokémon IP 权利，项目仅作非商业同人使用。',
    licenseEvidenceUrl: 'https://github.com/PokeAPI/sprites',
    attribution: 'Sprites © PokeAPI / Pokémon rights holders；由 Pokemon Online 脚本以无损帧封装形式生成。',
    reviewStatus: 'recorded-existing',
  },
  {
    id: 'pokemon-online-pokeapi-derived-spectral-caster-v1',
    label: 'Pokemon Online 序列帧封装 — #094 PokeAPI 静态 sprite v1 审核候选',
    sourceUrl: 'https://github.com/PokeAPI/sprites',
    licenseLabel: '基于项目已记录的 PokeAPI 静态 sprite 逐像素复制生成序列帧封装；适用上游仓库条款与 Pokémon IP 权利，项目仅作非商业同人使用。',
    licenseEvidenceUrl: 'https://github.com/PokeAPI/sprites',
    attribution: 'Sprites © PokeAPI / Pokémon rights holders；由 Pokemon Online 脚本以无损帧封装形式生成。',
    reviewStatus: 'recorded-existing',
  },
  {
    id: 'pokemon-online-code-authored-flame-wing-v5-motion',
    label: 'Pokemon Online 关键帧运动封装 — #006 火翼飞龙 v5',
    sourceUrl: 'internal://pokemon-online/scripts/generate-showcase-motion-sequences.py',
    licenseLabel: '项目脚本基于已记录来源的本地 PokeAPI 静态 sprite，以 nearest-neighbour 位移、缩放、旋转和压缩生成关键帧；不导入外部动画 sheet。角色相关 Pokémon IP 仍归其权利人，项目仅作非商业同人使用。',
    licenseEvidenceUrl: 'scripts/generate-showcase-motion-sequences.py',
    attribution: 'Sprites © PokeAPI / Pokémon rights holders；动作关键帧由 Pokemon Online 离线脚本从已记录本地基底派生。',
    reviewStatus: 'code-authored',
  },
  {
    id: 'pokemon-online-code-authored-spectral-caster-v2-motion',
    label: 'Pokemon Online 关键帧运动封装 — #094 幽影施法者 v2',
    sourceUrl: 'internal://pokemon-online/scripts/generate-showcase-motion-sequences.py',
    licenseLabel: '项目脚本基于已记录来源的本地 PokeAPI 静态 sprite，以 nearest-neighbour 位移、缩放、旋转和压缩生成关键帧；不导入外部动画 sheet。角色相关 Pokémon IP 仍归其权利人，项目仅作非商业同人使用。',
    licenseEvidenceUrl: 'scripts/generate-showcase-motion-sequences.py',
    attribution: 'Sprites © PokeAPI / Pokémon rights holders；动作关键帧由 Pokemon Online 离线脚本从已记录本地基底派生。',
    reviewStatus: 'code-authored',
  },
];

export const BATTLE_ASSET_SOURCE_BY_ID: Readonly<Record<string, BattleAssetSourceRecord>> = Object.fromEntries(
  BATTLE_ASSET_SOURCES.map((source) => [source.id, source]),
);

export const BATTLE_ASSET_MANIFEST: readonly BattleAssetManifestEntry[] = [
  { id: FALLBACK_ASSET_ID, kind: 'fallback-shape', url: '', sourceId: 'procedural-fallback', quality: 'all' },
  {
    id: 'battle:flame-wing:v1:front:sequence',
    kind: 'sprite-sheet',
    url: '/sprites/battle/flame-wing/front-sheet.png',
    metadataUrl: '/sprites/battle/flame-wing/front-sheet.json',
    sourceId: 'pokemon-online-code-authored-flame-wing-v1',
    quality: 'all',
  },
  {
    id: 'battle:flame-wing:v1:back:sequence',
    kind: 'sprite-sheet',
    url: '/sprites/battle/flame-wing/back-sheet.png',
    metadataUrl: '/sprites/battle/flame-wing/back-sheet.json',
    sourceId: 'pokemon-online-code-authored-flame-wing-v1',
    quality: 'all',
  },
  {
    id: 'battle:flame-wing:v2:front:sequence',
    kind: 'sprite-sheet',
    url: '/sprites/battle/flame-wing-v2/front-sheet.png',
    metadataUrl: '/sprites/battle/flame-wing-v2/front-sheet.json',
    sourceId: 'pokemon-online-code-authored-flame-wing-v2',
    quality: 'all',
  },
  {
    id: 'battle:flame-wing:v2:back:sequence',
    kind: 'sprite-sheet',
    url: '/sprites/battle/flame-wing-v2/back-sheet.png',
    metadataUrl: '/sprites/battle/flame-wing-v2/back-sheet.json',
    sourceId: 'pokemon-online-code-authored-flame-wing-v2',
    quality: 'all',
  },
  {
    id: 'battle:flame-wing:v3:front:sequence',
    kind: 'sprite-sheet',
    url: '/sprites/battle/flame-wing-v3/front-sheet.png',
    metadataUrl: '/sprites/battle/flame-wing-v3/front-sheet.json',
    sourceId: 'pokemon-online-code-authored-flame-wing-v3',
    quality: 'all',
  },
  {
    id: 'battle:flame-wing:v3:back:sequence',
    kind: 'sprite-sheet',
    url: '/sprites/battle/flame-wing-v3/back-sheet.png',
    metadataUrl: '/sprites/battle/flame-wing-v3/back-sheet.json',
    sourceId: 'pokemon-online-code-authored-flame-wing-v3',
    quality: 'all',
  },
  {
    id: 'battle:flame-wing:v4:front:sequence',
    kind: 'sprite-sheet',
    url: '/sprites/battle/flame-wing-v4/front-sheet.png',
    metadataUrl: '/sprites/battle/flame-wing-v4/front-sheet.json',
    sourceId: 'pokemon-online-pokeapi-derived-flame-wing-v4',
    quality: 'all',
  },
  {
    id: 'battle:flame-wing:v4:back:sequence',
    kind: 'sprite-sheet',
    url: '/sprites/battle/flame-wing-v4/back-sheet.png',
    metadataUrl: '/sprites/battle/flame-wing-v4/back-sheet.json',
    sourceId: 'pokemon-online-pokeapi-derived-flame-wing-v4',
    quality: 'all',
  },
  {
    id: 'battle:spectral-caster:v1:front:sequence',
    kind: 'sprite-sheet',
    url: '/sprites/battle/spectral-caster-v1/front-sheet.png',
    metadataUrl: '/sprites/battle/spectral-caster-v1/front-sheet.json',
    sourceId: 'pokemon-online-pokeapi-derived-spectral-caster-v1',
    quality: 'all',
  },
  {
    id: 'battle:spectral-caster:v1:back:sequence',
    kind: 'sprite-sheet',
    url: '/sprites/battle/spectral-caster-v1/back-sheet.png',
    metadataUrl: '/sprites/battle/spectral-caster-v1/back-sheet.json',
    sourceId: 'pokemon-online-pokeapi-derived-spectral-caster-v1',
    quality: 'all',
  },
  {
    id: 'battle:flame-wing:v5:front:sequence',
    kind: 'sprite-sheet',
    url: '/sprites/battle/flame-wing-v5/front-sheet.png',
    metadataUrl: '/sprites/battle/flame-wing-v5/front-sheet.json',
    sourceId: 'pokemon-online-code-authored-flame-wing-v5-motion',
    quality: 'all',
  },
  {
    id: 'battle:flame-wing:v5:back:sequence',
    kind: 'sprite-sheet',
    url: '/sprites/battle/flame-wing-v5/back-sheet.png',
    metadataUrl: '/sprites/battle/flame-wing-v5/back-sheet.json',
    sourceId: 'pokemon-online-code-authored-flame-wing-v5-motion',
    quality: 'all',
  },
  {
    id: 'battle:spectral-caster:v2:front:sequence',
    kind: 'sprite-sheet',
    url: '/sprites/battle/spectral-caster-v2/front-sheet.png',
    metadataUrl: '/sprites/battle/spectral-caster-v2/front-sheet.json',
    sourceId: 'pokemon-online-code-authored-spectral-caster-v2-motion',
    quality: 'all',
  },
  {
    id: 'battle:spectral-caster:v2:back:sequence',
    kind: 'sprite-sheet',
    url: '/sprites/battle/spectral-caster-v2/back-sheet.png',
    metadataUrl: '/sprites/battle/spectral-caster-v2/back-sheet.json',
    sourceId: 'pokemon-online-code-authored-spectral-caster-v2-motion',
    quality: 'all',
  },
  ...SPECIES_LIST.flatMap((species) => [
    { id: `pokemon:${species.id}:front`, kind: 'static-sprite' as const, url: `/sprites/pokemon/${species.id}.png`, sourceId: 'pokeapi-sprites', quality: 'all' as const },
    { id: `pokemon:${species.id}:back`, kind: 'static-sprite' as const, url: `/sprites/pokemon/back/${species.id}.png`, sourceId: 'pokeapi-sprites', quality: 'all' as const },
  ]),
];

export const BATTLE_ASSET_BY_ID: Readonly<Record<string, BattleAssetManifestEntry>> = Object.fromEntries(
  BATTLE_ASSET_MANIFEST.map((asset) => [asset.id, asset]),
);

interface RepresentativeBattleArtTuning {
  modelId: string;
  frontAssetId?: string;
  backAssetId?: string;
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

/** B-3 is intentionally blocked before any unapproved character bitmap is
 * added. Once a source is approved, create the two declared manifest entries,
 * switch this profile's asset IDs atomically, and retain this fallback. */
export const BATTLE_ART_IMPORT_CONTRACTS: readonly BattleArtImportContract[] = [
  {
    id: 'vertical-slice:flame-wing-2d-sequence',
    profileId: 'species:6',
    modelId: 'showcase:flame-wing',
    status: 'integrated',
    sourceId: 'pokemon-online-code-authored-flame-wing-v5-motion',
    format: 'png-sequence-json',
    sequence: {
      frameWidth: 96,
      frameHeight: 96,
      fps: 16,
      chromaKey: 'transparent-alpha',
      requiredClips: ['idle', 'locomotion', 'attack', 'cast', 'charge', 'channel', 'recover', 'hit', 'faint'],
      transitions: [
        { from: 'idle', to: 'locomotion', durationMs: 90, easing: 'cubic-in-out' },
        { from: 'locomotion', to: 'idle', durationMs: 110, easing: 'cubic-in-out' },
        { from: 'idle', to: 'attack', durationMs: 100, easing: 'cubic-in-out' },
        { from: 'attack', to: 'recover', durationMs: 70, easing: 'cubic-in-out' },
        { from: 'recover', to: 'idle', durationMs: 120, easing: 'cubic-in-out' },
        { from: 'idle', to: 'cast', durationMs: 120, easing: 'cubic-in-out' },
        { from: 'cast', to: 'recover', durationMs: 90, easing: 'cubic-in-out' },
        { from: 'idle', to: 'charge', durationMs: 160, easing: 'cubic-in-out' },
        { from: 'charge', to: 'attack', durationMs: 80, easing: 'cubic-in-out' },
        { from: 'charge', to: 'cast', durationMs: 90, easing: 'cubic-in-out' },
        { from: 'charge', to: 'channel', durationMs: 100, easing: 'cubic-in-out' },
        { from: 'channel', to: 'recover', durationMs: 110, easing: 'cubic-in-out' },
        { from: 'idle', to: 'hit', durationMs: 60, easing: 'cubic-in-out' },
        { from: 'hit', to: 'idle', durationMs: 130, easing: 'cubic-in-out' },
        { from: 'hit', to: 'faint', durationMs: 40, easing: 'cubic-in-out' },
      ],
    },
    generationPromptRevision: 'showcase-motion-v1-nearest-neighbour-keyframe-derivation',
    plannedFrontAssetId: 'battle:flame-wing:v5:front:sequence',
    plannedBackAssetId: 'battle:flame-wing:v5:back:sequence',
    fallbackAssetId: FALLBACK_ASSET_ID,
    requiredMotions: ['idle', 'locomotion', 'attack', 'cast', 'charge', 'channel', 'recover', 'hit', 'faint'],
  },
  {
    id: 'vertical-slice:spectral-caster-2d-sequence',
    profileId: 'species:94',
    modelId: 'showcase:spectral-caster',
    status: 'integrated',
    sourceId: 'pokemon-online-code-authored-spectral-caster-v2-motion',
    format: 'png-sequence-json',
    sequence: {
      frameWidth: 96,
      frameHeight: 96,
      fps: 16,
      chromaKey: 'transparent-alpha',
      requiredClips: ['idle', 'locomotion', 'attack', 'cast', 'charge', 'channel', 'recover', 'hit', 'faint'],
      transitions: [
        { from: 'idle', to: 'locomotion', durationMs: 90, easing: 'cubic-in-out' },
        { from: 'locomotion', to: 'idle', durationMs: 110, easing: 'cubic-in-out' },
        { from: 'idle', to: 'attack', durationMs: 100, easing: 'cubic-in-out' },
        { from: 'attack', to: 'recover', durationMs: 70, easing: 'cubic-in-out' },
        { from: 'recover', to: 'idle', durationMs: 120, easing: 'cubic-in-out' },
        { from: 'idle', to: 'cast', durationMs: 120, easing: 'cubic-in-out' },
        { from: 'cast', to: 'recover', durationMs: 90, easing: 'cubic-in-out' },
        { from: 'idle', to: 'charge', durationMs: 160, easing: 'cubic-in-out' },
        { from: 'charge', to: 'attack', durationMs: 80, easing: 'cubic-in-out' },
        { from: 'charge', to: 'cast', durationMs: 90, easing: 'cubic-in-out' },
        { from: 'charge', to: 'channel', durationMs: 100, easing: 'cubic-in-out' },
        { from: 'channel', to: 'recover', durationMs: 110, easing: 'cubic-in-out' },
        { from: 'idle', to: 'hit', durationMs: 60, easing: 'cubic-in-out' },
        { from: 'hit', to: 'idle', durationMs: 130, easing: 'cubic-in-out' },
        { from: 'hit', to: 'faint', durationMs: 40, easing: 'cubic-in-out' },
      ],
    },
    generationPromptRevision: 'showcase-motion-v1-nearest-neighbour-keyframe-derivation',
    plannedFrontAssetId: 'battle:spectral-caster:v2:front:sequence',
    plannedBackAssetId: 'battle:spectral-caster:v2:back:sequence',
    fallbackAssetId: FALLBACK_ASSET_ID,
    requiredMotions: ['idle', 'locomotion', 'attack', 'cast', 'charge', 'channel', 'recover', 'hit', 'faint'],
  },
];

const REPRESENTATIVE_BATTLE_ART_TUNINGS: Readonly<Record<number, RepresentativeBattleArtTuning>> = {
  6: {
    modelId: 'showcase:flame-wing',
    frontAssetId: 'battle:flame-wing:v5:front:sequence',
    backAssetId: 'battle:flame-wing:v5:back:sequence',
    scale: 1.16, shadowScale: 1.22,
    layers: [
      { id: 'ember-aura', kind: 'aura', color: 'secondary', depth: 'behind', alpha: 0.20, scale: 1.15, pulse: 0.18 },
      { id: 'wing-halo', kind: 'halo', color: 'highlight', depth: 'front', alpha: 0.16, scale: 0.92, pulse: 0.12 },
    ],
    motionPoses: {
      idle: { offsetY: -8, glowAlpha: 0.20, glowScale: 1.04 },
      locomotion: { offsetY: -10, rotationDeg: -3, scaleX: 1.04, scaleY: 0.96, glowAlpha: 0.30, glowScale: 1.16 },
      attack: { offsetX: 21, offsetY: 4, rotationDeg: 15, scaleX: 1.12, scaleY: 0.90 },
      cast: { offsetX: 10, offsetY: 3, rotationDeg: 11, scaleX: 1.08, scaleY: 0.94, glowAlpha: 0.35, glowScale: 1.22 },
      charge: { offsetY: -7, glowAlpha: 0.46, glowScale: 1.30 },
      channel: { offsetY: -6, glowAlpha: 0.42, glowScale: 1.24 },
      recover: { offsetX: -7, offsetY: -2, rotationDeg: -4, scaleX: 0.96, scaleY: 1.04, glowAlpha: 0.12, glowScale: 0.98 },
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
    modelId: 'showcase:spectral-caster',
    frontAssetId: 'battle:spectral-caster:v2:front:sequence',
    backAssetId: 'battle:spectral-caster:v2:back:sequence',
    scale: 1.04, shadowScale: 0.92,
    layers: [
      { id: 'spectral-mist', kind: 'aura', color: 'secondary', depth: 'behind', alpha: 0.26, scale: 1.22, pulse: 0.20 },
      { id: 'rune-halo', kind: 'halo', color: 'highlight', depth: 'front', alpha: 0.14, scale: 1.02, pulse: 0.18 },
    ],
    motionPoses: {
      idle: { offsetY: -7, rotationDeg: -2, glowAlpha: 0.28, glowScale: 1.12 },
      locomotion: { offsetY: -10, rotationDeg: 3, scaleX: 1.05, scaleY: 0.95, glowAlpha: 0.34, glowScale: 1.20 },
      cast: { offsetY: -10, rotationDeg: 7, glowAlpha: 0.48, glowScale: 1.42 },
      charge: { offsetY: -12, glowAlpha: 0.54, glowScale: 1.48 },
      channel: { offsetY: -11, rotationDeg: 4, glowAlpha: 0.46, glowScale: 1.40 },
      recover: { offsetY: -5, rotationDeg: -3, scaleX: 0.97, scaleY: 1.03, glowAlpha: 0.14, glowScale: 1.02 },
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
    frontAssetId: tuning?.frontAssetId ?? `pokemon:${species.id}:front`,
    backAssetId: tuning?.backAssetId ?? `pokemon:${species.id}:back`,
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
export const BATTLE_ART_PROFILE_BY_ID: Readonly<Record<string, BattleArtProfile>> = Object.fromEntries(
  BATTLE_ART_PROFILES.map((profile) => [profile.id, profile]),
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
    visualWindupMs: windupMs > 0 ? windupMs : delivery === 'melee' ? 100 : 130,
    releaseAt: charge ? 1 : 0.48,
    charge,
    channel,
    channelMs: channel ? 520 : 0,
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
    case 'melee':
    case 'dive': return 'attack';
    case 'beam': return 'channel';
    case 'projectile':
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
  // A source view represents whether the combatant faces toward (+1, back) or
  // away from (-1, front) the viewer. Renderer mirroring remains independent,
  // so this works for either deployment side and never identifies a species.
  const facing = input.facing ?? (input.side === 'player' ? 1 : -1);
  const assetId = facing === 1 ? profile.backAssetId : profile.frontAssetId;
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
  duplicateAssetIds: readonly string[];
  invalidAssetIds: readonly string[];
  invalidAssetSourceIds: readonly string[];
  invalidImportContractIds: readonly string[];
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
  const sourceIds = new Set(BATTLE_ASSET_SOURCES.map((source) => source.id));
  const duplicateAssetIds = assets.filter((asset, index) => assets.findIndex((candidate) => candidate.id === asset.id) !== index).map((asset) => asset.id);
  const invalidAssetIds = assets.filter((asset) => !asset.id || (asset.kind === 'fallback-shape' ? !!asset.url : !asset.url) || (asset.kind === 'sprite-sheet' && !asset.metadataUrl)).map((asset) => asset.id);
  const invalidAssetSourceIds = [
    ...BATTLE_ASSET_SOURCES.filter((source) => !source.id || !source.sourceUrl || !source.licenseLabel || !source.licenseEvidenceUrl || !source.attribution).map((source) => source.id),
    ...assets.filter((asset) => !sourceIds.has(asset.sourceId)).map((asset) => asset.id),
  ];
  const invalidImportContractIds = BATTLE_ART_IMPORT_CONTRACTS.filter((contract) => {
    const profile = profiles.find((candidate) => candidate.id === contract.profileId);
    return !profile
      || profile.modelId !== contract.modelId
      || !sourceIds.has(contract.sourceId)
      || !assetIds.has(contract.fallbackAssetId)
      || contract.requiredMotions.length === 0
      || contract.requiredMotions.some((motion) => !profile.motions[motion])
      || contract.sequence.frameWidth <= 0
      || contract.sequence.frameHeight <= 0
      || contract.sequence.fps <= 0
      || !contract.sequence.chromaKey
      || contract.sequence.requiredClips.length === 0
      || contract.sequence.requiredClips.some((motion) => !contract.requiredMotions.includes(motion))
      || contract.sequence.transitions.length === 0
      || contract.sequence.transitions.some((transition) => transition.durationMs <= 0 || transition.easing !== 'cubic-in-out' || !contract.requiredMotions.includes(transition.from) || !contract.requiredMotions.includes(transition.to))
      || new Set(contract.sequence.transitions.map((transition) => `${transition.from}:${transition.to}`)).size !== contract.sequence.transitions.length
      || (contract.status === 'integrated'
        && (!assetIds.has(contract.plannedFrontAssetId) || !assetIds.has(contract.plannedBackAssetId)
          || profile.frontAssetId !== contract.plannedFrontAssetId || profile.backAssetId !== contract.plannedBackAssetId))
      || (contract.status !== 'integrated'
        && (assetIds.has(contract.plannedFrontAssetId) || assetIds.has(contract.plannedBackAssetId)));
  }).map((contract) => contract.id);
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
    duplicateAssetIds,
    invalidAssetIds,
    invalidAssetSourceIds,
    invalidImportContractIds,
    missingSkillCastIds: SKILLS.filter((skill) => !SKILL_CAST_PRESENTATION_BY_SKILL_ID[skill.id]).map((skill) => skill.id),
    missingAbilityRecipeIds: ABILITIES.filter((ability) => !abilityIds.has(ability.id)).map((ability) => ability.id),
    missingPassiveRecipeIds: PASSIVE_SKILLS.filter((passive) => !passiveIds.has(passive.id)).map((passive) => passive.id),
    missingStatusRecipeIds: (Object.keys(STATUS_VISUAL_RECIPES) as StatusKind[]).length === 6 ? [] : ['status-catalog'],
  };
}
