import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import type { PokemonInstance } from '@pokemon-online/shared';
import { BattleSim, createPvpBattle } from '@pokemon-online/engine';
import { useGameStore, type ExpGainResult } from './game.ts';

export type BattlePhase = 'loading' | 'fighting' | 'result';

export const useBattleStore = defineStore('battle', () => {
  const sim = shallowRef<BattleSim | null>(null);
  const mode = ref<'pve' | 'pvp'>('pve');
  /** Wild group (1~3) for PVE; empty for PVP. */
  const wild = ref<PokemonInstance[]>([]);
  const mapId = ref<string | undefined>(undefined);
  const opponentName = ref<string | undefined>(undefined);
  const phase = ref<BattlePhase>('fighting');
  const assetsReady = ref(false);
  let rewardsGranted = false;

  /**
   * PVE: pveTeam (up to 3) deploys all at once (simultaneous) vs a wild group of
   * 1~3. No sequential rotation anymore (design change).
   */
  function startWild(insts: PokemonInstance[], mId?: string): boolean {
    const game = useGameStore();
    const team = game.pveTeamInstances.filter((p) => p.currentHp > 0);
    const playerTeam = team.length ? team : game.rosterInstances.filter((p) => p.currentHp > 0).slice(0, 3);
    if (playerTeam.length === 0) return false;
    wild.value = insts;
    mapId.value = mId;
    mode.value = 'pve';
    opponentName.value = undefined;
    phase.value = 'loading';
    assetsReady.value = false;
    rewardsGranted = false;
    sim.value = BattleSim.fromInstances({
      mode: 'pve',
      player: playerTeam,
      enemy: insts,
      deployment: 'simultaneous',
      isWild: true,
      speed: game.save?.settings.battleSpeed ?? 1,
      formation: game.save?.formation,
    });
    return true;
  }

  /** PVP: pvpTeam (3) vs opponent team, all simultaneous 3v3. */
  function startPvp(opponentTeam: PokemonInstance[], name: string): boolean {
    const game = useGameStore();
    const team = game.pvpTeamInstances.filter((p) => p.currentHp > 0);
    if (team.length === 0) return false;
    wild.value = [];
    mapId.value = undefined;
    mode.value = 'pvp';
    opponentName.value = name;
    phase.value = 'loading';
    assetsReady.value = false;
    rewardsGranted = false;
    sim.value = createPvpBattle(team, opponentTeam, game.save?.settings.battleSpeed ?? 1, game.save?.formation);
    return true;
  }

  function grantVictoryExp(total: number): ExpGainResult[] {
    if (!sim.value?.isOver || sim.value.state.winner !== 'player' || rewardsGranted) return [];
    rewardsGranted = true;
    const game = useGameStore();
    // The simulation retains all participants, including allies who fainted.
    const uids = [...new Set(sim.value.state.combatants.filter((c) => c.side === 'player').map((c) => c.uid))];
    const amount = mode.value === 'pve' ? total : Math.floor(total / Math.max(1, uids.length));
    return uids.filter((uid) => game.getInstance(uid)).map((uid) => game.grantExp(uid, amount));
  }

  function clear(): void {
    assetsReady.value = false;
    sim.value = null;
    wild.value = [];
    phase.value = 'fighting';
    rewardsGranted = false;
  }

  function begin(): void {
    if (!sim.value || phase.value !== 'loading' || !assetsReady.value) return;
    phase.value = 'fighting';
    if (mode.value === 'pve') for (const instance of wild.value) useGameStore().see(instance.speciesId);
  }

  return { sim, mode, wild, mapId, opponentName, phase, assetsReady, begin, startWild, startPvp, grantVictoryExp, clear };
});
