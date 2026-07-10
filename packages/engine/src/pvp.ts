import type { PokemonInstance } from '@pokemon-online/shared';
import { PVP_TEAM_SIZE } from '@pokemon-online/shared';
import { BattleSim } from './simulator.ts';

/**
 * PVP 3v3 sparring (frozen design). Both teams are AI-controlled - the player
 * only chooses their team. The challenger's client simulates the whole battle
 * against the opponent's saved battle team (fetched from the Worker).
 */
export function createPvpBattle(playerTeam: PokemonInstance[], opponentTeam: PokemonInstance[], speed = 1): BattleSim {
  const p = playerTeam.slice(0, PVP_TEAM_SIZE);
  const e = opponentTeam.slice(0, PVP_TEAM_SIZE);
  return BattleSim.fromInstances({ mode: 'pvp', player: p, enemy: e, isWild: false, speed });
}

/** EXP reward for a friendly PVP spar (small, since PVP isn't a grind target). */
export function pvpExpReward(opponentLevel: number): number {
  return Math.max(10, Math.floor(opponentLevel * 6));
}
