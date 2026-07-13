import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import type { PokemonInstance } from '@pokemon-online/shared';
import { BattleSim, createPvpBattle, createWildInstance } from '@pokemon-online/engine';
import { useGameStore } from './game.ts';

export type BattlePhase = 'fighting' | 'result';

export const useBattleStore = defineStore('battle', () => {
  const sim = shallowRef<BattleSim | null>(null);
  const mode = ref<'pve' | 'pvp'>('pve');
  /** Wild group (1~3) for PVE; empty for PVP. */
  const wild = ref<PokemonInstance[]>([]);
  const mapId = ref<string | undefined>(undefined);
  const opponentName = ref<string | undefined>(undefined);
  const storyBattleId = ref<string | undefined>(undefined);
  const phase = ref<BattlePhase>('fighting');

  /**
   * PVE: pveTeam (up to 3) deploys all at once (simultaneous) vs a wild group of
   * 1~3. No sequential rotation anymore (design change).
   */
  function startWild(insts: PokemonInstance[], mId?: string): boolean {
    const game = useGameStore();
    const team = game.pveTeamInstances.filter((p) => p.currentHp > 0);
    const playerTeam = team.length ? team : game.rosterInstances.filter((p) => p.currentHp > 0).slice(0, 3);
    if (playerTeam.length === 0) return false;
    for (const inst of insts) game.see(inst.speciesId);
    wild.value = insts;
    mapId.value = mId;
    mode.value = 'pve';
    opponentName.value = undefined;
    storyBattleId.value = undefined;
    phase.value = 'fighting';
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

  /** Scripted trainer battle. It uses the same simultaneous battle presentation,
   * but never opens the wild-capture result flow. */
  function startStoryTrainer(teamSpec: { speciesId: number; level: number }[], name: string, battleId: string): boolean {
    const game = useGameStore();
    const team = game.pveTeamInstances.filter((p) => p.currentHp > 0);
    const playerTeam = team.length ? team : game.rosterInstances.filter((p) => p.currentHp > 0).slice(0, 3);
    if (playerTeam.length === 0) return false;
    const enemy = teamSpec.map((entry) => createWildInstance(entry.speciesId, entry.level));
    wild.value = [];
    mapId.value = game.save?.currentMapId;
    mode.value = 'pvp';
    opponentName.value = name;
    storyBattleId.value = battleId;
    phase.value = 'fighting';
    sim.value = BattleSim.fromInstances({
      mode: 'pvp', player: playerTeam, enemy, deployment: 'simultaneous', isWild: false,
      speed: game.save?.settings.battleSpeed ?? 1, formation: game.save?.formation,
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
    storyBattleId.value = undefined;
    phase.value = 'fighting';
    sim.value = createPvpBattle(team, opponentTeam, game.save?.settings.battleSpeed ?? 1, game.save?.formation);
    return true;
  }

  function clear(): void {
    sim.value = null;
    wild.value = [];
    phase.value = 'fighting';
    storyBattleId.value = undefined;
  }

  return { sim, mode, wild, mapId, opponentName, storyBattleId, phase, startWild, startStoryTrainer, startPvp, clear };
});
