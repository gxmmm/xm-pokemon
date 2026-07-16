import { getSpecies } from '@pokemon-online/config';
import { createWildInstance } from '@pokemon-online/engine';
import type { PokemonInstance } from '@pokemon-online/shared';

/** Standalone front-end battle acceptance sandbox. It produces disposable wild
 * instances only; it never imports stores, save state, or account state. */
export const BATTLE_SANDBOX_LEVEL = 100;
export const BATTLE_SANDBOX_MIN_TEAM_SIZE = 1;
export const BATTLE_SANDBOX_MAX_TEAM_SIZE = 3;

export function isBattleSandboxTeamValid(speciesIds: readonly number[]): boolean {
  return speciesIds.length >= BATTLE_SANDBOX_MIN_TEAM_SIZE
    && speciesIds.length <= BATTLE_SANDBOX_MAX_TEAM_SIZE
    && speciesIds.every((speciesId) => Number.isInteger(speciesId) && speciesId > 0 && (() => {
      try { return !!getSpecies(speciesId); } catch { return false; }
    })());
}

/** Each selected entry rolls a fresh, max-level wild-style instance. The output
 * stays in memory and must never be written to a roster or save. */
export function createBattleSandboxTeam(
  speciesIds: readonly number[],
  rng?: () => number,
): PokemonInstance[] {
  if (!isBattleSandboxTeamValid(speciesIds)) throw new Error('战斗沙盒队伍必须包含 1 至 3 只有效宝可梦。');
  return speciesIds.map((speciesId) => createWildInstance(speciesId, BATTLE_SANDBOX_LEVEL, rng ? { rng } : undefined));
}
