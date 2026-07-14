import { BattleSim, createWildInstance, maxHp } from '@pokemon-online/engine';
import { toBattlePresentationEvent, type BattlePresentationEvent } from '@pokemon-online/presentation';
import type { PokemonInstance } from '@pokemon-online/shared';

export interface VisualRuntimeBattleFixture {
  id: 'pve-3v1' | 'pvp-3v3';
  seed: number;
  mode: 'pve' | 'pvp';
  player: readonly { speciesId: number; level: number; uid: string }[];
  enemy: readonly { speciesId: number; level: number; uid: string }[];
}

export interface VisualRuntimeFixtureResult {
  fixture: VisualRuntimeBattleFixture;
  eventSignature: readonly string[];
  presentationEvents: readonly BattlePresentationEvent[];
}

export const VISUAL_RUNTIME_BATTLE_FIXTURES: readonly VisualRuntimeBattleFixture[] = [
  {
    id: 'pve-3v1', seed: 140714, mode: 'pve',
    player: [{ speciesId: 6, level: 18, uid: 'fixture-pve-player-1' }, { speciesId: 25, level: 17, uid: 'fixture-pve-player-2' }, { speciesId: 1, level: 16, uid: 'fixture-pve-player-3' }],
    enemy: [{ speciesId: 143, level: 20, uid: 'fixture-pve-enemy-1' }],
  },
  {
    id: 'pvp-3v3', seed: 140715, mode: 'pvp',
    player: [{ speciesId: 6, level: 24, uid: 'fixture-pvp-player-1' }, { speciesId: 25, level: 23, uid: 'fixture-pvp-player-2' }, { speciesId: 131, level: 22, uid: 'fixture-pvp-player-3' }],
    enemy: [{ speciesId: 3, level: 24, uid: 'fixture-pvp-enemy-1' }, { speciesId: 94, level: 23, uid: 'fixture-pvp-enemy-2' }, { speciesId: 143, level: 22, uid: 'fixture-pvp-enemy-3' }],
  },
] as const;

function instanceOf(spec: { speciesId: number; level: number; uid: string }): PokemonInstance {
  // createWildInstance supplies the stable static skill/ability defaults. All
  // random instance fields are normalized below so fixture inputs stay fixed.
  const instance = createWildInstance(spec.speciesId, spec.level);
  instance.uid = spec.uid;
  instance.iv = { hp: 20, atk: 20, def: 20, spd: 20 };
  instance.growth = 1;
  instance.personality = 'brave';
  instance.passiveSkills = [];
  instance.currentHp = maxHp(instance);
  return instance;
}

/** A fixed simulator input for presentation / renderer regressions. It exposes
 * only engine DTO results and serializable presentation events, never renderer state. */
export function runVisualRuntimeFixture(fixture: VisualRuntimeBattleFixture): VisualRuntimeFixtureResult {
  const sim = new BattleSim({ mode: fixture.mode, player: fixture.player.map(instanceOf), enemy: fixture.enemy.map(instanceOf), isWild: fixture.mode === 'pve', seed: fixture.seed });
  sim.resolve(180);
  const presentationEvents = sim.state.events.map(toBattlePresentationEvent);
  const eventSignature = presentationEvents.map((event) => [event.sequence, event.type, event.actorId ?? '-', event.targetIds?.join(',') ?? '-', event.skillId ?? '-', event.outcome?.damage ?? '-', event.outcome?.critical ? 'crit' : '-', event.outcome?.ko ? 'ko' : '-'].join('|'));
  return { fixture, eventSignature, presentationEvents };
}


