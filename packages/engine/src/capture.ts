import type { PokemonInstance, PokedexEntry, PlayerSave } from '@pokemon-online/shared';
import { getSpecies } from '@pokemon-online/config';
import { toCaught } from './instance.ts';
import { ROSTER_MAX } from '@pokemon-online/shared';

/**
 * Capture is 100% successful by frozen design - the long-term goal is raising,
 * not obtaining. This module finalizes a wild instance as a caught Pokemon and
 * updates the Pokedex. Release keeps the dex record (seen + released flag).
 */

export function captureWild(wild: PokemonInstance, mapId?: string): PokemonInstance {
  return toCaught(wild, mapId);
}

export function ensureDexEntry(save: PlayerSave, speciesId: number): PokedexEntry {
  if (!save.pokedex[speciesId]) {
    save.pokedex[speciesId] = {
      speciesId,
      seen: false,
      caught: false,
      firstSeenAt: Date.now(),
      count: 0,
    };
  }
  return save.pokedex[speciesId];
}

export function markSeen(save: PlayerSave, speciesId: number): void {
  const e = ensureDexEntry(save, speciesId);
  e.seen = true;
}

export function markCaught(save: PlayerSave, speciesId: number): void {
  const e = ensureDexEntry(save, speciesId);
  e.seen = true;
  e.caught = true;
  e.released = false;
  if (!e.firstCaughtAt) e.firstCaughtAt = Date.now();
  e.count += 1;
  save.stats.caught += 1;
}

/** Add an instance to the carried roster (no warehouse yet). */
export function addInstanceToSave(save: PlayerSave, inst: PokemonInstance): boolean {
  save.instances[inst.uid] = inst;
  if (!save.roster.includes(inst.uid)) {
    if (save.roster.length >= ROSTER_MAX) {
      delete save.instances[inst.uid];
      return false;
    }
    save.roster.push(inst.uid);
  }
  markCaught(save, inst.speciesId);
  void getSpecies;
  return true;
}

/** Release: remove the instance but keep the dex record (released flag set). */
export function releaseInstance(save: PlayerSave, uid: string): { speciesId: number; nickname?: string } | null {
  const inst = save.instances[uid];
  if (!inst) return null;
  const speciesId = inst.speciesId;
  const nickname = inst.nickname;
  const e = ensureDexEntry(save, speciesId);
  e.seen = true;
  e.released = true;
  // remove from roster + both loadouts
  save.roster = save.roster.filter((u) => u !== uid);
  save.pveTeam = save.pveTeam.filter((u) => u !== uid);
  save.pvpTeam = save.pvpTeam.filter((u) => u !== uid);
  delete save.instances[uid];
  return { speciesId, nickname };
}

