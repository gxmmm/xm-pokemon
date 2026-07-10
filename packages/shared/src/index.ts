export * from './types.ts';

/** App-wide constants shared across frontend and backend. */
export const SAVE_VERSION = 2;
/** Carried Pokemon (no warehouse yet; future `warehouse` field reserved). */
export const ROSTER_MAX = 20;
export const PVE_TEAM_SIZE = 3;
export const PVP_TEAM_SIZE = 3;
export const ACTIVE_SKILL_MAX = 4;
/** 梦幻式 multi-passive cap: a bred/caught Pokemon can hold at most this many passives. */
export const PASSIVE_SKILL_MAX = 4;
export const IV_MAX = 31;
export const GROWTH_MIN = 0.8;
export const GROWTH_MAX = 1.2;
export const MAX_LEVEL = 100;

/** Arena dimensions for the real-time battle sim (in arbitrary units). */
export const ARENA = { width: 720, height: 360 };

/** Battle simulation tick rate (seconds per logical tick). */
export const BATTLE_TICK = 0.05; // 20 ticks/sec
