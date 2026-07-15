export type BattleEnvironmentId = 'grass' | 'cave' | 'water' | 'dragon' | 'arena';

export interface BattleEnvironmentSpec {
  id: BattleEnvironmentId;
  palette: { sky: string; horizon: string; ground: string; groundDetail: string; accent: string; mote: string };
  terrain: 'grass' | 'stone' | 'water' | 'rune' | 'arena';
  ambience: 'pollen' | 'dust' | 'spray' | 'rune' | 'sparks';
  density: number;
  reactions: readonly ('scorch' | 'frost' | 'spark' | 'splash' | 'spore' | 'debris' | 'rune-pulse')[];
}

/** Renderer-ready battle space vocabulary. These describe environment grammar,
 * not map state or simulation rules. */
export const BATTLE_ENVIRONMENTS: Readonly<Record<BattleEnvironmentId, BattleEnvironmentSpec>> = {
  grass: {
    id: 'grass',
    palette: { sky: '#173b42', horizon: '#497952', ground: '#376b46', groundDetail: '#9ccd6f', accent: '#d7ee7b', mote: '#b8f0d5' },
    terrain: 'grass', ambience: 'pollen', density: 0.62, reactions: ['scorch', 'frost', 'spark', 'splash', 'spore', 'debris', 'rune-pulse'],
  },
  cave: {
    id: 'cave',
    palette: { sky: '#171625', horizon: '#40364a', ground: '#514856', groundDetail: '#877260', accent: '#f5b76d', mote: '#e2c9a3' },
    terrain: 'stone', ambience: 'dust', density: 0.4, reactions: ['scorch', 'frost', 'spark', 'splash', 'debris', 'rune-pulse'],
  },
  water: {
    id: 'water',
    palette: { sky: '#173a57', horizon: '#3c8390', ground: '#225c72', groundDetail: '#72c8dc', accent: '#f7db83', mote: '#d2f8ff' },
    terrain: 'water', ambience: 'spray', density: 0.56, reactions: ['scorch', 'frost', 'spark', 'splash', 'spore', 'rune-pulse'],
  },
  dragon: {
    id: 'dragon',
    palette: { sky: '#120e2b', horizon: '#4a2866', ground: '#513562', groundDetail: '#8154a0', accent: '#ffcf74', mote: '#efb8ff' },
    terrain: 'rune', ambience: 'rune', density: 0.48, reactions: ['scorch', 'frost', 'spark', 'splash', 'debris', 'rune-pulse'],
  },
  arena: {
    id: 'arena',
    palette: { sky: '#20283b', horizon: '#657287', ground: '#585852', groundDetail: '#aaa28b', accent: '#e8c96a', mote: '#edf2ff' },
    terrain: 'arena', ambience: 'sparks', density: 0.28, reactions: ['scorch', 'frost', 'spark', 'splash', 'debris', 'rune-pulse'],
  },
};

export function battleEnvironmentFor(biomeId: string): BattleEnvironmentSpec {
  return BATTLE_ENVIRONMENTS[biomeId as BattleEnvironmentId] ?? BATTLE_ENVIRONMENTS.grass;
}
