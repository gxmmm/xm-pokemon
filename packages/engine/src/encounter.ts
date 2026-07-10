import type { GameMap } from '@pokemon-online/shared';
import { rand } from './rng.ts';
import { createWildInstance } from './instance.ts';
import type { PokemonInstance } from '@pokemon-online/shared';

/** Determine day/night from the current hour (6:00-18:00 = day). */
export function dayNight(): 'day' | 'night' {
  const h = new Date().getHours();
  return h >= 6 && h < 18 ? 'day' : 'night';
}

export interface EncounterRoll {
  speciesId: number;
  level: number;
  rarity?: string;
  instance: PokemonInstance;
}

/**
 * Ecological encounter: weighted pick from the map's table, respecting
 * day/night gating. Returns a fresh wild instance ready for battle.
 */
export function rollEncounter(map: GameMap, opts: { force?: number; mapId?: string } = {}): EncounterRoll | null {
  if (!map.encounters.length) return null;
  const dn = dayNight();
  const eligible = map.encounters.filter((e) => !e.time || e.time === 'any' || e.time === dn);
  const pool = eligible.length ? eligible : map.encounters;
  const chosen = rand.weighted(pool, (e) => e.weight);
  const level = rand.int(chosen.minLevel, chosen.maxLevel);
  const instance = createWildInstance(chosen.speciesId, level, { mapId: opts.mapId ?? map.id });
  return { speciesId: chosen.speciesId, level, rarity: chosen.rarity, instance };
}

/** Encounter chance per step on tall grass. */
export const ENCOUNTER_CHANCE = 0.12;
