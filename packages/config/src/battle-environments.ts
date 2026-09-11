export type BattleEnvironmentId = 'grass' | 'cave' | 'water' | 'dragon' | 'arena';

/** Shared spectator policy; never affects simulation time or action priority. */
export const BATTLE_CAMERA_MOTION = {
  priority: { neutral: 0, anticipate: 1, track: 2, impact: 3, finisher: 4 },
  minHoldMs: 180,
  maxShotMs: 1300,
  scaleDamping: 8,
  panDamping: 7,
  settleEpsilon: 0.001,
} as const;

export type BattleTerrainContactVisual = 'grass-clumps' | 'dust' | 'ripples' | 'rune-sparks' | 'none';

/** Tunable 2.5D spectator camera. World units are battle-cell sized; the
 * camera looks from positive ground-depth toward `target` with z as height. */
export interface BattleCameraSpec {
  height: number;
  pitchDegrees: number;
  /** Horizontal spectator angle; shared by every world-space anchor. */
  yawDegrees?: number;
  focalLength: number;
  principal: { x: number; y: number };
  target: { x: number; y: number; z: number };
  framing: { maxPanX: number; maxPanY: number; minZoom: number; maxZoom: number; focusY: number };
}

export interface BattleEnvironmentSpec {
  id: BattleEnvironmentId;
  palette: { sky: string; horizon: string; ground: string; groundDetail: string; accent: string; mote: string };
  terrain: 'grass' | 'stone' | 'water' | 'rune' | 'arena';
  ambience: 'pollen' | 'dust' | 'spray' | 'rune' | 'sparks';
  density: number;
  contactVisual: BattleTerrainContactVisual;
  parallax: { far: number; horizon: number; ground: number; foreground: number };
  camera: BattleCameraSpec;
  /** Extra pixels drawn past the nominal 1280×720 stage for camera motion. */
  overscan: number;
  reactions: readonly ('scorch' | 'frost' | 'spark' | 'splash' | 'spore' | 'debris' | 'rune-pulse')[];
}

function spectatorCamera(height: number, pitchDegrees: number, focalLength: number, principalY: number): BattleCameraSpec {
  return {
    height,
    pitchDegrees,
    yawDegrees: 35,
    focalLength,
    principal: { x: 640, y: principalY },
    target: { x: 0, y: 0, z: 0 },
    framing: { maxPanX: 54, maxPanY: 30, minZoom: 1, maxZoom: 1.10, focusY: 0.56 },
  };
}

/** A shared oblique spectator view separates same-column silhouettes. Camera
 * heights keep the rotated field on the ground with space for body/status art. */
export const BATTLE_ENVIRONMENTS: Readonly<Record<BattleEnvironmentId, BattleEnvironmentSpec>> = {
  grass: {
    id: 'grass',
    palette: { sky: '#173b42', horizon: '#497952', ground: '#376b46', groundDetail: '#9ccd6f', accent: '#d7ee7b', mote: '#b8f0d5' },
    terrain: 'grass', ambience: 'pollen', density: 0.72, contactVisual: 'grass-clumps', parallax: { far: 0.20, horizon: 0.45, ground: 0.85, foreground: 1.12 }, camera: spectatorCamera(23.6, 50, 900, 470), overscan: 220, reactions: ['scorch', 'frost', 'spark', 'splash', 'spore', 'debris', 'rune-pulse'],
  },
  cave: {
    id: 'cave',
    palette: { sky: '#171625', horizon: '#40364a', ground: '#514856', groundDetail: '#877260', accent: '#f5b76d', mote: '#e2c9a3' },
    terrain: 'stone', ambience: 'dust', density: 0.4, contactVisual: 'dust', parallax: { far: 0.18, horizon: 0.40, ground: 0.86, foreground: 1.10 }, camera: spectatorCamera(22.1, 50, 880, 452), overscan: 220, reactions: ['scorch', 'frost', 'spark', 'splash', 'debris', 'rune-pulse'],
  },
  water: {
    id: 'water',
    palette: { sky: '#173a57', horizon: '#3c8390', ground: '#568b8c', groundDetail: '#90c6be', accent: '#f7db83', mote: '#d2f8ff' },
    terrain: 'water', ambience: 'spray', density: 0.56, contactVisual: 'ripples', parallax: { far: 0.22, horizon: 0.46, ground: 0.84, foreground: 1.14 }, camera: spectatorCamera(24.8, 50, 930, 442), overscan: 220, reactions: ['scorch', 'frost', 'spark', 'splash', 'spore', 'rune-pulse'],
  },
  dragon: {
    id: 'dragon',
    palette: { sky: '#120e2b', horizon: '#4a2866', ground: '#513562', groundDetail: '#8154a0', accent: '#ffcf74', mote: '#efb8ff' },
    terrain: 'rune', ambience: 'rune', density: 0.48, contactVisual: 'rune-sparks', parallax: { far: 0.20, horizon: 0.44, ground: 0.86, foreground: 1.12 }, camera: spectatorCamera(22.1, 50, 900, 450), overscan: 220, reactions: ['scorch', 'frost', 'spark', 'splash', 'debris', 'rune-pulse'],
  },
  arena: {
    id: 'arena',
    palette: { sky: '#20283b', horizon: '#657287', ground: '#585852', groundDetail: '#aaa28b', accent: '#e8c96a', mote: '#edf2ff' },
    terrain: 'arena', ambience: 'sparks', density: 0.28, contactVisual: 'dust', parallax: { far: 0.16, horizon: 0.36, ground: 0.88, foreground: 1.06 }, camera: spectatorCamera(23.4, 50, 940, 454), overscan: 220, reactions: ['scorch', 'frost', 'spark', 'splash', 'debris', 'rune-pulse'],
  },
};

export function battleEnvironmentFor(biomeId: string): BattleEnvironmentSpec {
  return BATTLE_ENVIRONMENTS[biomeId as BattleEnvironmentId] ?? BATTLE_ENVIRONMENTS.grass;
}
