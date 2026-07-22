/**
 * Pokemon Online - Shared Types
 *
 * All types shared between the Vue frontend, the Cloudflare Worker backend,
 * and the game engine. Static config types (Species, Skill, ...) describe the
 * game world; dynamic types (PokemonInstance, PlayerSave) describe player data.
 *
 * Design rule (frozen): static config is never written into player saves.
 * The PokemonInstance model keeps Species (template) and instance (player data)
 * strictly separated.
 */

// ───────────────────────────── Primitives ─────────────────────────────

export const TYPE_NAMES = [
  'normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison',
  'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
] as const;
export type TypeName = (typeof TYPE_NAMES)[number];

export type StatKey = 'hp' | 'atk' | 'def' | 'spd';

export interface Stats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
}

export type StatusKind = 'burn' | 'poison' | 'paralyze' | 'freeze' | 'sleep' | 'confuse';

export type GrowthRate = 'fast' | 'medium-fast' | 'medium-slow' | 'slow' | 'fluctuating';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary' | 'mythical';

// ───────────────────────────── Static config ─────────────────────────────

export interface LearnsetEntry {
  level: number;
  skill: string;
}

export interface Evolution {
  to: number;
  level?: number;
  item?: string;
}

/**
 * Species - the static template for a kind of Pokemon (e.g. #006 Charizard).
 * There are 151 of these (Gen 1). Each is configuration only.
 *
 * The unified 4-stat system (Principle: unify atk/spAtk -> atk, def/spDef -> def)
 * means `base` already holds HP / Attack / Defense / Speed.
 */
export type NormalAttackDelivery = 'melee' | 'ranged';

export interface Species {
  id: number;
  name: string; // Chinese name
  enName: string; // english lowercase slug
  types: TypeName[];
  base: Stats; // unified 4 base stats
  expYield: number;
  growthRate: GrowthRate;
  abilities: string[]; // ability ids, [0] = default
  hiddenAbility?: string;
  learnset: LearnsetEntry[]; // active skills learned by level
  /** Optional species-exclusive active skill, learned through the normal level path. */
  signatureSkill?: string;
  /** Broad battlefield identity; purely static species configuration. */
  combatRole?: CombatRole;
  /** Fixed basic-attack delivery shown in the Pokédex and used by every instance. */
  normalAttackDelivery: NormalAttackDelivery;
  /** Model-owned base seconds between normal attacks before temporary attack-speed effects. */
  normalAttackInterval: number;
  intrinsic: string[];
  passivePool: string[]; // passives this species may roll (梦幻式 pool)
  intrinsicPassives: string[]; // 天生必带 passives (always held by wild / 100% retained when bred, 1~2)
  evolution?: Evolution[];
  rarity: Rarity;
  dex: string;
  height: number; // meters
  weight: number; // kg
  catchFlavor?: string;
}

export type SkillCategory = 'physical' | 'special' | 'status';

/** Broad battlefield identity used for player-facing species guidance and future AI. */
export type CombatRole = 'burst' | 'bruiser' | 'tank' | 'control' | 'support' | 'kite' | 'area' | 'balanced' | 'growth';

export interface SkillEffect {
  kind: 'dot' | 'heal' | 'buff' | 'debuff' | 'stun' | 'lifesteal' | 'shield' | 'status' | 'ramp';
  target?: 'self' | 'enemy';
  stat?: StatKey;
  stages?: number; // -6..6
  chance?: number; // 0..1
  duration?: number; // seconds
  /** Seconds between repeated effects, currently used by battle-growth (ramp) skills. */
  interval?: number;
  magnitude?: number; // heal / dot dmg / shield hp
  status?: StatusKind;
}

/**
 * Skill - an active move. Per frozen design: independent cooldown, NO MP/PP.
 * A normal attack (id 'struggle'/'tackle-ish') is always available so output
 * never stops when every skill is on cooldown.
 */
/** Target pattern for an active move. `all-enemies` is a 3v3 spread attack:
 * every opposing active combatant is hit, with the move's `areaMultiplier`
 * applied to each target's final damage. */
export type SkillTargetMode = 'single' | 'all-enemies';

/** Renderer-neutral actor choreography selected by a static visual recipe.
 * It describes presentation only: BattleSim still owns all movement, damage,
 * targeting and timing facts. */
export interface TargetDiveActorChoreography {
  kind: 'target-dive';
  /** Full local-model traversal, including the visible return before recovery. */
  durationMs: number;
  /** Normalized traversal point at which the actor reaches the target approach. */
  arrivalAt: number;
  /** Model becomes readable again before the delayed impact. */
  revealAt: number;
  /** Target hit/VFX delay relative to the release of the actor traversal. */
  impactAt: number;
  /** Local traversal begins returning to the snapshot-owned position. */
  returnAt: number;
  /** Pixels kept between the local model and the target center at arrival. */
  approachDistance: number;
  /** Generic element-tinted contour; never identifies a model or skill. */
  silhouette: 'element-outline';
}

export type BattleActorChoreography = TargetDiveActorChoreography;

export interface Skill {
  id: string;
  name: string;
  type: TypeName;
  category: SkillCategory;
  power: number; // 0 for status moves
  accuracy: number; // 0..100, 0 means always hits
  cooldown: number; // seconds (independent CD)
  range: 'melee' | 'ranged';
  rangeTiles: number; // effective distance in arena units
  castTime?: number; // windup seconds (default 0)
  targetMode?: SkillTargetMode; // default single-target
  /** Per-target final-damage multiplier for an all-enemies move (usually < 1). */
  areaMultiplier?: number;
  effect?: SkillEffect;
  priority?: number; // AI tie-breaker, higher = preferred
  description: string;
}

export type PassiveKind =
  | 'stat' | 'typeBoost' | 'typeResist' | 'crit' | 'speed'
  | 'hpRegen' | 'lifesteal' | 'cdReduction' | 'evasion' | 'accuracy';

export interface PassiveEffect {
  kind: PassiveKind;
  stat?: StatKey;
  mult?: number; // e.g. 1.1 = +10%
  add?: number; // flat add (per level)
  type?: TypeName;
  chance?: number;
  magnitude?: number; // for hpRegen fraction, lifesteal, etc.
}

/**
 * PassiveSkill - 梦幻西游-style passive. Inherited through breeding with a
 * multi-skill cap. These modify stats/elements rather than being actively cast.
 */
export interface PassiveSkill {
  id: string;
  name: string;
  description: string;
  effect: PassiveEffect;
  tier: 1 | 2 | 3; // power tier for pool selection
}

export type AbilityTrigger =
  | 'onEnter' | 'onAttack' | 'onHit' | 'onLowHp' | 'passive'
  | 'onFaint' | 'onSwitch' | 'onTurnStart';

export type AbilityKind =
  | 'weather' | 'statBoost' | 'typeImmunity' | 'typeBoost' | 'hpRegen'
  | 'shield' | 'counter' | 'speedBoost' | 'critBoost' | 'damageReduction'
  | 'statusRecovery' | 'critImmunity' | 'flinchImmunity' | 'endure' | 'accuracyBoost'
  | 'contactShield' | 'secondaryBoost' | 'indirectImmunity' | 'statusReflect'
  | 'cooldownPressure' | 'lowHpDefense' | 'cooldownRhythm' | 'openingSpeed'
  | 'shieldRecovery' | 'counterInstinct' | 'custom';

export interface AbilityEffect {
  kind: AbilityKind;
  stat?: StatKey;
  mult?: number;
  type?: TypeName;
  magnitude?: number;
  chance?: number;
  stages?: number;
  status?: StatusKind;
  /** Generic timed-effect duration, in seconds. */
  duration?: number;
  /** Per-ability internal cooldown, in seconds. */
  cooldown?: number;
}

/**
 * Ability - 宝可梦特性. Kept through breeding; very low chance to mutate into
 * another of the species' abilities.
 */
export interface Ability {
  id: string;
  name: string;
  description: string;
  trigger: AbilityTrigger;
  effect: AbilityEffect;
}

export type TargetPriority = 'nearest' | 'weakest' | 'threat' | 'random';
export type SkillBias = 'power' | 'speed' | 'utility' | 'balanced';
export type RangePreference = 'melee' | 'ranged' | 'adaptive';

/**
 * Personality - replaces 梦幻's five-element system. Per frozen design it
 * changes AI behavior, NOT raw stats, so the same species can fight in totally
 * different styles. This is a core source of depth and variety.
 */
export interface Personality {
  id: string;
  name: string;
  description: string;
  aggression: number; // 0..1, higher prefers aggressive plays
  rangePreference: RangePreference; // desired engagement distance
  riskTolerance: number; // 0..1, higher uses high-cd/high-power skills eagerly
  targetPriority: TargetPriority;
  skillBias: SkillBias; // which skills the AI gravitates to
  defensiveThreshold: number; // HP fraction below which AI plays defensively
  fleeChance?: number; // PVE wild pokemon flee tendency
}

// ───────────────────────────── Maps & items ─────────────────────────────

export interface EncounterEntry {
  speciesId: number;
  weight: number;
  minLevel: number;
  maxLevel: number;
  time?: 'day' | 'night' | 'any';
  rarity?: Rarity;
}

/** Player facing direction on the world map. */
export type Facing = 'up' | 'down' | 'left' | 'right';

/** Cinematic transition played when crossing between maps. */
export type TransitionType = 'fade' | 'boat' | 'cave' | 'door';

/**
 * MapExit - a tile (edge or door) that, when stepped on, transitions the
 * player to another map. Replaces the old instant warp: crossings now play a
 * transition (fade/boat/cave/door) and never teleport instantly. `toll` is
 * reserved for a future road-toll/boat-fare mechanic (not charged yet).
 */
export interface MapExit {
  x: number;
  y: number;
  toMapId: string;
  toX: number;
  toY: number;
  /** transition animation; defaults to 'fade' when omitted */
  transition?: TransitionType;
  label?: string;
  /** direction the exit faces (world-map nav + signposting) */
  direction?: Facing;
  /** reserved: toll to pass (not enforced yet) */
  toll?: number;
}

/**
 * GameMap - the world Pokemon and NPC "live in" (Principle 5: world first).
 * Encounters are ecological (weighted tables, optionally time-gated) rather
 * than fixed single spawns. Maps connect to form an explorable world with
 * hidden areas.
 */
export interface GameMap {
  id: string;
  name: string;
  description: string;
  width: number;
  height: number;
  /** tile codes: 0 grass/walkable, 1 tree/blocked, 2 water, 3 tall-grass(encounter), 4 path, 5 sand, 6 rock, 7 door/warp */
  tiles: number[][];
  encounters: EncounterEntry[];
  connected: { to: string; x: number; y: number; label?: string; direction?: Facing }[];
  /** exit tiles (edge or door) -> destination; plays a transition, never instant. */
  warps: MapExit[];
  hidden?: boolean;
  ambient?: string;
  unlockHint?: string;
  music?: string;
  /** Maps where every natural-floor step can trigger an encounter (caves,
   *  water routes) rather than only tall-grass tiles. Towns/routes leave this
   *  off so encounters happen only on tall-grass (tile 3). */
  encounterFloor?: boolean;
}

export type ItemKind = 'consumable' | 'material' | 'key' | 'evolution' | 'ball';

export interface ItemEffect {
  kind: 'heal' | 'revive' | 'exp' | 'evolve' | 'buff' | 'cure';
  magnitude?: number;
  target?: 'pokemon' | 'team';
  statusCured?: StatusKind | 'all';
}

export interface Item {
  id: string;
  name: string;
  description: string;
  kind: ItemKind;
  effect?: ItemEffect;
  price?: number;
  icon?: string;
}

// ───────────────────────────── Dynamic (player) data ─────────────────────────────

export interface IV {
  hp: number;
  atk: number;
  def: number;
  spd: number;
} // each 0..31

/**
 * PokemonInstance - a specific Pokemon a player owns. The valuable thing is the
 * instance (unique growth history), not the species template. Everything that
 * varies per-mon lives here.
 */
export interface PokemonInstance {
  uid: string;
  speciesId: number;
  nickname?: string;
  level: number;
  exp: number;
  iv: IV;
  growth: number; // 0.8..1.2 multiplier, capped by species rarity
  personality: string;
  ability: string; // may differ from species default via mutation
  activeSkills: string[]; // up to 4
  passiveSkills: string[]; // inherited passives (梦幻式 multi-skill cap)
  currentHp: number;
  status?: StatusKind | null;
  friendship: number;
  origin: 'caught' | 'bred' | 'gift';
  lineage?: { parentA?: string; parentB?: string; speciesA?: number; speciesB?: number; at: number };
  caughtAt: number;
  caughtMapId?: string;
}

export interface PokedexEntry {
  speciesId: number;
  seen: boolean;
  caught: boolean;
  released?: boolean;
  firstSeenAt: number;
  firstCaughtAt?: number;
  count: number;
}

export interface PlayerSettings {
  music: boolean;
  sfx: boolean;
  battleSpeed: number; // 1, 2, 3
}

export type TideState = 'high' | 'low';

export interface StoryState {
  /** Monotonic world-story switches. They are deliberately generic so future
   * chapters can add content without migrating a rigid quest schema. */
  flags: string[];
  activeQuest: string;
  completedQuests: string[];
  /** Static tide phase for island puzzles; changed only at tide instruments. */
  tide: TideState;
}

/**
 * PlayerSave - the entire player state. The Worker stores this (as a JSON blob)
 * because the backend is a save server, not a compute server. Static config is
 * referenced by id only, never duplicated in here.
 *
 * Carry model: a single `roster` of up to ROSTER_MAX (20) carried Pokemon. No
 * warehouse yet (a future `warehouse` field is reserved). Two ordered loadouts:
 * `pveTeam` (3, sequential deployment) and `pvpTeam` (3, simultaneous 3v3).
 */
export interface PlayerSave {
  version: number;
  playerId: string;
  username: string;
  createdAt: number;
  updatedAt: number;
  playtime: number;
  currentMapId: string;
  position: { x: number; y: number; facing: Facing };
  roster: string[]; // carried instance uids, up to ROSTER_MAX
  instances: Record<string, PokemonInstance>;
  pokedex: Record<number, PokedexEntry>;
  items: Record<string, number>;
  money: number;
  pveTeam: string[]; // ordered 3 for PVE (simultaneous)
  pvpTeam: string[]; // ordered 3 for PVP (simultaneous 3v3)
  /** Starting grid positions (3 slots) for the player's team in battle. Slot i
   *  maps to pveTeam[i]/pvpTeam[i]. Free-placement formation (阵型). */
  formation: { x: number; y: number }[];
  friends: string[]; // usernames
  badges: string[];
  settings: PlayerSettings;
  lastBattleResult?: BattleResult;
  stats: { battles: number; wins: number; caught: number; bred: number };
  /** map ids the player has visited (drives world-map navigation discovery). */
  visitedMaps: string[];
  /** Original story progress, NPC state, and current objective. */
  story: StoryState;
}

export interface BattleResult {
  win: boolean;
  expGained: number;
  caught?: PokemonInstance;
  releasedSpeciesId?: number;
  log: string[];
  opponent?: string;
}

// ───────────────────────────── Battle simulation ─────────────────────────────

export interface TimedEffect {
  id: string;
  kind: string;
  stat?: StatKey;
  stages?: number;
  remaining: number;
  magnitude?: number;
  /** Runtime accumulator for repeated timed effects such as `ramp`. */
  elapsed?: number;
  interval?: number;
  type?: TypeName;
  from?: string;
}

export interface BattleCombatant {
  uid: string;
  side: 'player' | 'enemy';
  speciesId: number;
  types: TypeName[];
  level: number;
  name: string;
  personality: string;
  ability: string;
  activeSkills: string[];
  passiveSkills: string[];
  // computed from species + iv + growth + level
  stats: Stats;
  maxHp: number;
  currentHp: number;
  /** Logical grid cell (integer coords). This is the authoritative position used
   *  for distance/range checks. `pixel` is the smoothed float the renderer reads. */
  position: { x: number; y: number };
  /** Smoothed render position (cell units); lerps toward `position` each tick. */
  pixel: { x: number; y: number };
  facing: 1 | -1;
  // runtime
  cooldowns: Record<string, number>; // skillId -> seconds remaining
  /** Battle-local ability cooldowns; never persisted in a PokemonInstance. */
  abilityCooldowns?: Record<string, number>;
  /** Timestamp until which an on-enter cooldown-pressure effect applies. */
  pressureUntil?: number;
  /** One-use full-HP survival flag for Sturdy-like effects. */
  sturdyUsed?: boolean;
  /** Timestamp for the next active skill empowered by Counter Instinct. */
  counterInstinctUntil?: number;
  normalAttackCd: number;
  /** Immutable per-species base interval; gameplay effects multiply its rate. */
  normalAttackInterval: number;
  /** Runtime attack-speed factor. Defaults to 1 and is reserved for future buffs/debuffs. */
  normalAttackSpeedMultiplier: number;
  /** Fractional passive regeneration accumulates until it resolves as whole HP. */
  regenAccumulator: number;
  /** Absolute simulator time at which a brief stun/flinch ends. */
  flinchUntil?: number;
  /** Presentation-only snapshot flag derived from flinchUntil and snapshot time. */
  stunActive?: boolean;
  status: StatusKind | null;
  statusTimer: number;
  statStages: { atk: number; def: number; spd: number };
  shields: number;
  /** Per-Pokemon combat recap counters. They are battle-local runtime state,
   * never persisted in a PokemonInstance save. */
  damageDealt: number;
  damageTaken: number;
  normalDamage: number;
  skillDamage: number;
  healingDone: number;
  shieldAbsorbed: number;
  controlSeconds: number;
  interrupts: number;
  knockouts: number;
  skillCasts: number;
  normalAttacks: number;
  hits: number;
  misses: number;
  /** Per-skill recap keyed by skill id (includes __normal__). */
  skillStats: Record<string, { casts: number; hits: number; misses: number; damage: number }>;
  buffs: TimedEffect[];
  castProgress: { skillId: string; remaining: number } | null;
  alive: boolean;
  iv: IV;
  growth: number;
  colorTint?: string;
  displayLabel?: string;
}

/** Renderer-neutral position on the battle ground plane. `x` is horizontal,
 * `y` is ground depth, and `z` is elevation. The current simulator adapts its
 * authoritative grid cells into this space with z=0; future airborne or raised
 * presentation can use z without redefining screen coordinates as world data. */
export interface BattleWorldPosition {
  x: number;
  y: number;
  z: number;
}

export type NormalAttackVisualStyle =
  | 'fist' | 'claw' | 'bite' | 'horn' | 'tail' | 'body-slam' | 'wing-slap' | 'beak-peck' | 'tusk-gore' | 'pincer-snap' | 'whip-lash' | 'kick' | 'shell-bash'
  | 'flame-bolt' | 'water-shot' | 'spark-bolt' | 'leaf-shot' | 'ice-shard' | 'psychic-bolt' | 'shadow-orb' | 'stone-shot' | 'wind-cutter' | 'fairy-spark' | 'neutral-star';

/** Visual-effect hint attached to a BattleEvent so the frontend renderer can
 *  spawn the right animation (projectile / burst / aura / floating number ...)
 *  without re-parsing the text log. `from`/`to` are grid-cell coordinates. */
export interface BattleVfx {
  kind:
    | 'projectile' | 'melee' | 'burst' | 'beam'
    | 'heal' | 'shield' | 'buff' | 'debuff'
    | 'status' | 'faint' | 'impact' | 'cast' | 'miss';
  type?: TypeName; // skill/element type, for color theming
  /** Configuration-resolved motif for the always-available normal attack. */
  normalAttackStyle?: NormalAttackVisualStyle;
  from?: { x: number; y: number };
  to?: { x: number; y: number };
  amount?: number;
  status?: StatusKind;
  missed?: boolean;
  /** Structured combat outcomes used by the presentation director. These are
   * deliberately data, not log-text parsing, so localization cannot alter VFX. */
  crit?: boolean;
  effectiveness?: number;
  ko?: boolean;
  /** Spread-attack metadata used to keep the first target as the camera's main
   * impact while later targets land as short, readable secondary beats. */
  targetUids?: string[];
  hitIndex?: number;
  hitCount?: number;
  secondary?: boolean;
  impactDelay?: number;
}

export interface BattleEvent {
  t: number;
  /** Monotonic sequence number so the renderer can track which events it already
   *  consumed (splice-safe: events are trimmed from the front when >400). */
  seq?: number;
  type:
    | 'move' | 'attack' | 'skill' | 'damage' | 'heal' | 'status'
    | 'faint' | 'buff' | 'debuff' | 'info' | 'capture' | 'enter' | 'end';
  actor?: string;
  target?: string;
  skillId?: string;
  amount?: number;
  message?: string;
  vfx?: BattleVfx;
}

/** A brief, battle-local intent shared by one side's AI. It is recalculated by
 * the engine and is not persisted in player save data. */
export type TeamTacticKind = 'finish' | 'protect' | 'pressure' | 'split';

export interface TeamTactic {
  kind: TeamTacticKind;
  /** Opponent the side should finish, interrupt, or pressure. */
  targetUid?: string;
  /** Ally being protected from a committed high-impact cast, when applicable. */
  protectUid?: string;
  /** Simulation time at which this intent must be recalculated. */
  expiresAt: number;
}

export interface BattleState {
  mode: 'pve' | 'pvp';
  /** Grid dimensions (cells). Combatants move cell-by-cell on this grid. */
  arena: { cols: number; rows: number };
  combatants: BattleCombatant[];
  /** Short-lived team coordination intents, one per active side. */
  teamTactics: Partial<Record<'player' | 'enemy', TeamTactic>>;
  events: BattleEvent[];
  time: number;
  ended: boolean;
  winner?: 'player' | 'enemy' | 'draw';
  tickRate: number;
  speedMultiplier: number;
  isWild: boolean;
}

// ───────────────────────────── API ─────────────────────────────

export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface AuthResponse {
  token: string;
  username: string;
  playerId: string;
}

export interface PublicTeamMember {
  uid: string;
  speciesId: number;
  level: number;
  nickname?: string;
  personality: string;
}

export interface OpponentTeamResponse {
  username: string;
  team: PokemonInstance[];
}
