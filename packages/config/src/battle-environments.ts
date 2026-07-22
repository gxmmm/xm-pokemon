export type BattleEnvironmentId = 'grass' | 'cave' | 'water' | 'dragon' | 'arena';

export type BattleTerrainContactVisual = 'grass-clumps' | 'dust' | 'ripples' | 'rune-sparks' | 'none';
export type BattleBackdropGrammar = 'forest-canopy' | 'cave-pillars' | 'tide-cliffs' | 'dragon-rift' | 'colosseum';
export type BattleGroundPattern = 'grass-lanes' | 'stone-terraces' | 'shallow-ripples' | 'rune-rings' | 'arena-tiles';
export type BattleForegroundFrame = 'ferns' | 'rock-ledge' | 'spray' | 'crystal-veils' | 'banner-shadows';

/** Tunable 2.5D spectator camera. World units are battle-cell sized; the
 * camera looks from positive ground-depth toward `target` with z as height. */
export interface BattleCameraSpec {
  height: number;
  pitchDegrees: number;
  focalLength: number;
  principal: { x: number; y: number };
  target: { x: number; y: number; z: number };
  framing: { maxPanX: number; maxPanY: number; minZoom: number; maxZoom: number; focusY: number };
}

export interface BattleAtmosphereSpec {
  keyLight: { x: number; y: number; radius: number; alpha: number };
  horizonHaze: number;
  groundShade: number;
}

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
  camera: BattleCameraSpec;
  atmosphere: BattleAtmosphereSpec;
  /** Optional production bitmap. Procedural grammar remains the compatibility
   * fallback and supplies lightweight contact/foreground overlays. */
  art?: { backgroundAssetId: string; toneAlpha: number; detailDensity: number };
  /** Extra pixels drawn past the nominal 1280×720 stage for camera motion. */
  overscan: number;
  reactions: readonly ('scorch' | 'frost' | 'spark' | 'splash' | 'spore' | 'debris' | 'rune-pulse')[];
}

function spectatorCamera(height: number, pitchDegrees: number, focalLength: number, principalY: number): BattleCameraSpec {
  return {
    height,
    pitchDegrees,
    focalLength,
    principal: { x: 640, y: principalY },
    target: { x: 0, y: 0, z: 0 },
    framing: { maxPanX: 54, maxPanY: 30, minZoom: 1, maxZoom: 1.10, focusY: 0.56 },
  };
}

/** Renderer-ready battle space vocabulary. These describe environment grammar,
 * not map state or simulation rules. */
export const BATTLE_ENVIRONMENTS: Readonly<Record<BattleEnvironmentId, BattleEnvironmentSpec>> = {
  grass: {
    id: 'grass',
    palette: { sky: '#173b42', horizon: '#497952', ground: '#376b46', groundDetail: '#9ccd6f', accent: '#d7ee7b', mote: '#b8f0d5' },
    terrain: 'grass', ambience: 'pollen', density: 0.72, contactVisual: 'grass-clumps', backdrop: 'forest-canopy', groundPattern: 'grass-lanes', foregroundFrame: 'ferns', parallax: { far: 0.20, horizon: 0.45, ground: 0.85, foreground: 1.12 }, camera: spectatorCamera(15, 36, 900, 448), atmosphere: { keyLight: { x: 1010, y: 116, radius: 96, alpha: 0.10 }, horizonHaze: 0.10, groundShade: 0.055 }, art: { backgroundAssetId: 'battle:environment:grass-clearing:v1', toneAlpha: 0.12, detailDensity: 0.28 }, overscan: 220, reactions: ['scorch', 'frost', 'spark', 'splash', 'spore', 'debris', 'rune-pulse'],
  },
  cave: {
    id: 'cave',
    palette: { sky: '#171625', horizon: '#40364a', ground: '#514856', groundDetail: '#877260', accent: '#f5b76d', mote: '#e2c9a3' },
    terrain: 'stone', ambience: 'dust', density: 0.4, contactVisual: 'dust', backdrop: 'cave-pillars', groundPattern: 'stone-terraces', foregroundFrame: 'rock-ledge', parallax: { far: 0.18, horizon: 0.40, ground: 0.86, foreground: 1.10 }, camera: spectatorCamera(14, 38, 880, 452), atmosphere: { keyLight: { x: 1035, y: 190, radius: 128, alpha: 0.12 }, horizonHaze: 0.065, groundShade: 0.085 }, overscan: 220, reactions: ['scorch', 'frost', 'spark', 'splash', 'debris', 'rune-pulse'],
  },
  water: {
    id: 'water',
    palette: { sky: '#173a57', horizon: '#3c8390', ground: '#225c72', groundDetail: '#72c8dc', accent: '#f7db83', mote: '#d2f8ff' },
    terrain: 'water', ambience: 'spray', density: 0.56, contactVisual: 'ripples', backdrop: 'tide-cliffs', groundPattern: 'shallow-ripples', foregroundFrame: 'spray', parallax: { far: 0.22, horizon: 0.46, ground: 0.84, foreground: 1.14 }, camera: spectatorCamera(16, 34, 930, 442), atmosphere: { keyLight: { x: 930, y: 104, radius: 82, alpha: 0.13 }, horizonHaze: 0.15, groundShade: 0.04 }, overscan: 220, reactions: ['scorch', 'frost', 'spark', 'splash', 'spore', 'rune-pulse'],
  },
  dragon: {
    id: 'dragon',
    palette: { sky: '#120e2b', horizon: '#4a2866', ground: '#513562', groundDetail: '#8154a0', accent: '#ffcf74', mote: '#efb8ff' },
    terrain: 'rune', ambience: 'rune', density: 0.48, contactVisual: 'rune-sparks', backdrop: 'dragon-rift', groundPattern: 'rune-rings', foregroundFrame: 'crystal-veils', parallax: { far: 0.20, horizon: 0.44, ground: 0.86, foreground: 1.12 }, camera: spectatorCamera(14.5, 37, 900, 450), atmosphere: { keyLight: { x: 642, y: 148, radius: 108, alpha: 0.14 }, horizonHaze: 0.11, groundShade: 0.09 }, overscan: 220, reactions: ['scorch', 'frost', 'spark', 'splash', 'debris', 'rune-pulse'],
  },
  arena: {
    id: 'arena',
    palette: { sky: '#20283b', horizon: '#657287', ground: '#585852', groundDetail: '#aaa28b', accent: '#e8c96a', mote: '#edf2ff' },
    terrain: 'arena', ambience: 'sparks', density: 0.28, contactVisual: 'dust', backdrop: 'colosseum', groundPattern: 'arena-tiles', foregroundFrame: 'banner-shadows', parallax: { far: 0.16, horizon: 0.36, ground: 0.88, foreground: 1.06 }, camera: spectatorCamera(17, 39, 940, 454), atmosphere: { keyLight: { x: 640, y: 104, radius: 140, alpha: 0.10 }, horizonHaze: 0.075, groundShade: 0.07 }, overscan: 220, reactions: ['scorch', 'frost', 'spark', 'splash', 'debris', 'rune-pulse'],
  },
};

export function battleEnvironmentFor(biomeId: string): BattleEnvironmentSpec {
  return BATTLE_ENVIRONMENTS[biomeId as BattleEnvironmentId] ?? BATTLE_ENVIRONMENTS.grass;
}
