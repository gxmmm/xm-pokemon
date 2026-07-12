export * from './types.ts';

/** App-wide constants shared across frontend and backend. */
export const SAVE_VERSION = 4;
/** Carried Pokemon (no warehouse yet; future `warehouse` field reserved). */
export const ROSTER_MAX = 20;
export const PVE_TEAM_SIZE = 3;
export const PVP_TEAM_SIZE = 3;
export const ACTIVE_SKILL_MAX = 4;
/** 梦幻式 multi-passive cap. Wild/caught are pool-limited (~5); breeding can
 *  accumulate up to this many across generations (24 slots). */
export const PASSIVE_SKILL_MAX = 24;
export const IV_MAX = 31;
export const GROWTH_MIN = 0.8;
/** Growth (成长) hard cap. Rarest wild species reach this; breeding fluctuates
 *  growth around the parents' average but can never exceed it (no breakthrough). */
export const GROWTH_MAX = 1.3;
export const MAX_LEVEL = 100;

/**
 * Arena dimensions for the real-time battle sim (in arbitrary units).
 * Kept as the "design unit" reference for converting legacy skill `rangeTiles`
 * (tuned against a 720-wide arena) into grid cells.
 */
export const ARENA = { width: 720, height: 360 };

/** Battle grid (cells). Top-down oval arena: combatants occupy integer cells
 *  and step cell-by-cell. 20 x 14 gives a large field (the play area is further
 *  restricted to an inscribed ellipse - see engine grid.isCellInArena - so the
 *  visible arena is an oval colosseum with stands outside). */
export const BATTLE_GRID = { cols: 20, rows: 14 };

/** Battle simulation tick rate (seconds per logical tick). */
export const BATTLE_TICK = 0.05; // 20 ticks/sec
