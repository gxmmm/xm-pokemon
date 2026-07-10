import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import type { PokemonInstance } from '@pokemon-online/shared';
import { BattleSim, createPvpBattle } from '@pokemon-online/engine';
import { useGameStore } from './game.ts';

export type BattlePhase = 'fighting' | 'result';

export const useBattleStore = defineStore('battle', () => {
  const sim = shallowRef<BattleSim | null>(null);
  const mode = ref<'pve' | 'pvp'>('pve');
  const wild = ref<PokemonInstance | null>(null);
  const mapId = ref<string | undefined>(undefined);
  const opponentName = ref<string | undefined>(undefined);
  const phase = ref<BattlePhase>('fighting');

  /**
   * PVE: ordered pveTeam (up to 3) deploys sequentially - 1v1 on field, next
   * comes in when the active faints. The wild is a single opponent.
   */
  function startWild(inst: PokemonInstance, mId?: string): boolean {
    const game = useGameStore();
    const team = game.pveTeamInstances.filter((p) => p.currentHp > 0);
    const playerTeam = team.length ? team : game.rosterInstances.filter((p) => p.currentHp > 0).slice(0, 3);
    if (playerTeam.length === 0) return false;
    game.see(inst.speciesId);
    wild.value = inst;
    mapId.value = mId;
    mode.value = 'pve';
    opponentName.value = undefined;
    phase.value = 'fighting';
    sim.value = BattleSim.fromInstances({
      mode: 'pve',
      player: playerTeam,
      enemy: [inst],
      deployment: 'sequential',
      isWild: true,
      speed: game.save?.settings.battleSpeed ?? 1,
    });
    return true;
  }

  /** PVP: pvpTeam (3) vs opponent team, all simultaneous 3v3. */
  function startPvp(opponentTeam: PokemonInstance[], name: string): boolean {
    const game = useGameStore();
    const team = game.pvpTeamInstances.filter((p) => p.currentHp > 0);
    if (team.length === 0) return false;
    wild.value = null;
    mapId.value = undefined;
    mode.value = 'pvp';
    opponentName.value = name;
    phase.value = 'fighting';
    sim.value = createPvpBattle(team, opponentTeam, game.save?.settings.battleSpeed ?? 1);
    return true;
  }

  function clear(): void {
    sim.value = null;
    wild.value = null;
    phase.value = 'fighting';
  }

  return { sim, mode, wild, mapId, opponentName, phase, startWild, startPvp, clear };
});
