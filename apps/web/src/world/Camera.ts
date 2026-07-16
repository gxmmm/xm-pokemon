/**
 * @canvas-archive-only
 * Archived Canvas compatibility/regression source. It must remain in the
 * repository, but must not be imported, mounted, dynamically loaded, offered
 * as a fallback, or extended by official GPU/Pixi world or battle runtime code.
 */
/**
 * Camera - viewport-centered scrolling over a tile map. Keeps the player
 * centered when the map is larger than the viewport; centers the whole map
 * (with an empty border) when it is smaller. Tile culling is left to the
 * renderer, which only iterates the visible window returned here.
 */

export interface Viewport {
  tilesW: number;
  tilesH: number;
}

export interface CameraOrigin {
  /** top-left tile x in map space (may be negative when the map is smaller than the viewport) */
  ox: number;
  /** top-left tile y in map space */
  oy: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Compute the top-left tile of the visible window given the player position. */
export function cameraOrigin(
  px: number,
  py: number,
  mapW: number,
  mapH: number,
  vp: Viewport,
): CameraOrigin {
  let ox: number;
  let oy: number;
  if (mapW <= vp.tilesW) {
    ox = Math.floor((mapW - vp.tilesW) / 2);
  } else {
    // Math.round keeps the camera origin on an INTEGER tile. px is a float
    // (smooth move interpolation); a fractional ox would make map.tiles[oy+vy]
    // return undefined (JS arrays have no fractional keys) and the renderer
    // would skip every tile, flashing the background. This is the classic
    // tile camera: the sprite slides within the viewport, the camera snaps
    // per tile - no fractional lookups, no flashing.
    ox = clamp(Math.round(px - vp.tilesW / 2), 0, mapW - vp.tilesW);
  }
  if (mapH <= vp.tilesH) {
    oy = Math.floor((mapH - vp.tilesH) / 2);
  } else {
    oy = clamp(Math.round(py - vp.tilesH / 2), 0, mapH - vp.tilesH);
  }
  return { ox, oy };
}
