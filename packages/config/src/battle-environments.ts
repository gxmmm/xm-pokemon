export type BattleEnvironmentId = 'grass' | 'cave' | 'water' | 'dragon' | 'arena';

export type BattleTerrainContactVisual = 'grass-clumps' | 'dust' | 'ripples' | 'rune-sparks' | 'none';
export type BattleBackdropGrammar = 'forest-canopy' | 'cave-pillars' | 'tide-cliffs' | 'dragon-rift' | 'colosseum';
export type BattleGroundPattern = 'grass-lanes' | 'stone-terraces' | 'shallow-ripples' | 'rune-rings' | 'arena-tiles';
export type BattleForegroundFrame = 'ferns' | 'rock-ledge' | 'spray' | 'crystal-veils' | 'banner-shadows';

export interface BattleEnvironmentSpec {
  id: BattleEnvironmentId;
  palette: { sky: string; horizon: string; ground: string; groundDetail: string; accent: string; mote: string };
  terrain: 'grass' | 'stone' | 'water' | 'rune' | 'arena';
  ambience: 'pollen' | 'dust' | 'spray' | 'rune' | 'sparks';
  density: number;
  contactVisual: BattleTerrainContactVisual;
  backdrop: BattleBackdropGrammar;
  groundPattern: BattleGroundPattern;
  foregroundFrame: BattleForegroundFrame;
  parallax: { far: number; horizon: number; ground: number; foreground: number };
  /** Extra pixels drawn past the nominal 1280×720 stage for camera motion. */
  overscan: number;
  reactions: readonly ('scorch' | 'frost' | 'spark' | 'splash' | 'spore' | 'debris' | 'rune-pulse')[];
}

/** Renderer-ready battle space vocabulary. These describe environment grammar,
 * not map state or simulation rules. */
export const BATTLE_ENVIRONMENTS: Readonly<Record<BattleEnvironmentId, BattleEnvironmentSpec>> = {
  grass: {
    id: 'grass',
    palette: { sky: '#173b42', horizon: '#497952', ground: '#376b46', groundDetail: '#9ccd6f', accent: '#d7ee7b', mote: '#b8f0d5' },
    terrain: 'grass', ambience: 'pollen', density: 0.62, contactVisual: 'grass-clumps', backdrop: 'forest-canopy', groundPattern: 'grass-lanes', foregroundFrame: 'ferns', parallax: { far: 0.20, horizon: 0.45, ground: 0.85, foreground: 1.12 }, overscan: 220, reactions: ['scorch', 'frost', 'spark', 'splash', 'spore', 'debris', 'rune-pulse'],
  },
  cave: {
    id: 'cave',
    palette: { sky: '#171625', horizon: '#40364a', ground: '#514856', groundDetail: '#877260', accent: '#f5b76d', mote: '#e2c9a3' },
    terrain: 'stone', ambience: 'dust', density: 0.4, contactVisual: 'dust', backdrop: 'cave-pillars', groundPattern: 'stone-terraces', foregroundFrame: 'rock-ledge', parallax: { far: 0.18, horizon: 0.40, ground: 0.86, foreground: 1.10 }, overscan: 220, reactions: ['scorch', 'frost', 'spark', 'splash', 'debris', 'rune-pulse'],
  },
  water: {
    id: 'water',
    palette: { sky: '#173a57', horizon: '#3c8390', ground: '#225c72', groundDetail: '#72c8dc', accent: '#f7db83', mote: '#d2f8ff' },
    terrain: 'water', ambience: 'spray', density: 0.56, contactVisual: 'ripples', backdrop: 'tide-cliffs', groundPattern: 'shallow-ripples', foregroundFrame: 'spray', parallax: { far: 0.22, horizon: 0.46, ground: 0.84, foreground: 1.14 }, overscan: 220, reactions: ['scorch', 'frost', 'spark', 'splash', 'spore', 'rune-pulse'],
  },
  dragon: {
    id: 'dragon',
    palette: { sky: '#120e2b', horizon: '#4a2866', ground: '#513562', groundDetail: '#8154a0', accent: '#ffcf74', mote: '#efb8ff' },
    terrain: 'rune', ambience: 'rune', density: 0.48, contactVisual: 'rune-sparks', backdrop: 'dragon-rift', groundPattern: 'rune-rings', foregroundFrame: 'crystal-veils', parallax: { far: 0.20, horizon: 0.44, ground: 0.86, foreground: 1.12 }, overscan: 220, reactions: ['scorch', 'frost', 'spark', 'splash', 'debris', 'rune-pulse'],
  },
  arena: {
    id: 'arena',
    palette: { sky: '#20283b', horizon: '#657287', ground: '#585852', groundDetail: '#aaa28b', accent: '#e8c96a', mote: '#edf2ff' },
    terrain: 'arena', ambience: 'sparks', density: 0.28, contactVisual: 'dust', backdrop: 'colosseum', groundPattern: 'arena-tiles', foregroundFrame: 'banner-shadows', parallax: { far: 0.16, horizon: 0.36, ground: 0.88, foreground: 1.06 }, overscan: 220, reactions: ['scorch', 'frost', 'spark', 'splash', 'debris', 'rune-pulse'],
  },
};

export function battleEnvironmentFor(biomeId: string): BattleEnvironmentSpec {
  return BATTLE_ENVIRONMENTS[biomeId as BattleEnvironmentId] ?? BATTLE_ENVIRONMENTS.grass;
}
