import type { GameMap, Rarity } from '@pokemon-online/shared';
import { SPECIES_LIST } from './pokemon.ts';

/**
 * The explorable world. Per Principle 5 (world first) Pokemon live in maps,
 * not menus. Encounters are ecological weighted tables, optionally time-gated.
 * Maps connect via edge exits / door tiles to form one continuous world with
 * the town and the training tower.
 *
 * Crossing between maps NEVER teleports instantly: each exit carries a
 * `transition` (fade/cave/door) played by the world view. To reach another
 * map the player walks to the edge exit - there is no "jump" button.
 *
 * Tile codes:
 *  0 grass(walk) 1 tree(block) 2 water(block) 3 tall-grass(encounter)
 *  4 path(walk)  5 sand(walk)   6 rock(block)  7 door(building)
 *  8 flower(walk) 9 building(block) 10 sign(walk) 11 water-edge(walk)
 *  12 cave-entrance(walk, exit) 13 dock(walk, exit)
 */

const LEGEND: Record<string, number> = {
  '.': 0, 'T': 1, 'W': 2, '"': 3, ',': 4, 'S': 5, 'R': 6,
  'D': 7, 'F': 8, 'B': 9, 's': 10, 'E': 11, 'C': 12, 'K': 13,
};

/** Parse ascii rows into a tile grid, padded/sliced to exactly `width` cols.
 *  Unknown chars become tree (blocked) so a typo can never open a hole. */
function tiles(rows: string[], width: number): number[][] {
  return rows.map((r) => {
    const cells = r.split('');
    while (cells.length < width) cells.push('T');
    return cells.slice(0, width).map((c) => (c in LEGEND ? LEGEND[c] : 1));
  });
}



const ILLUSION_TOWER_TILES = tiles([
  'TTTTTTTTCTTTTTTT',
  'T.....RR.R.....T',
  'T..............T',
  'T..RR......RR..T',
  'T..............T',
  'T....RR..RR....T',
  'T..............T',
  'T..RR......RR..T',
  'T..............T',
  'T....RR..RR....T',
  'T..............T',
  'T.....RR.R.....T',
  'T..............T',
  'TTTTTTTTCTTTTTTT',
], 16);

const ILLUSION_TOWER_SUMMIT_TILES = tiles([
  'TTTTTTTTTTTTTTTT',
  'T.....RR.R.....T',
  'T..............T',
  'T..RR......RR..T',
  'T..............T',
  'T....RR..RR....T',
  'T..............T',
  'T..RR......RR..T',
  'T..............T',
  'T....RR..RR....T',
  'T..............T',
  'T.....RR.R.....T',
  'T..............T',
  'TTTTTTTTCTTTTTTT',
], 16);

/**
 * The training tower is a complete capture/test sandbox. Every species in the
 * Pokedex appears on exactly one of its five floors; the floor controls the
 * level band while each species keeps its configured rarity for encounter rolls.
 */
const TOWER_LEVEL_BANDS: readonly [number, number][] = [
  [5, 10], [12, 18], [20, 28], [30, 40], [45, 55],
];
const TOWER_FLOOR_LABELS = ['一', '二', '三', '四', '五'] as const;
const TOWER_RARITY_WEIGHT: Record<Rarity, number> = {
  common: 12, uncommon: 10, rare: 7, legendary: 3, mythical: 2,
};

function towerEncounters(floor: number) {
  const [minLevel, maxLevel] = TOWER_LEVEL_BANDS[floor]!;
  return SPECIES_LIST
    .filter((species) => (species.id - 1) % TOWER_LEVEL_BANDS.length === floor)
    .map((species) => ({
      speciesId: species.id,
      weight: TOWER_RARITY_WEIGHT[species.rarity],
      minLevel,
      maxLevel,
      rarity: species.rarity,
    }));
}

const illusionTowerMaps: GameMap[] = TOWER_LEVEL_BANDS.map(([minLevel, maxLevel], floor) => {
  const index = floor + 1;
  const isSummit = index === TOWER_LEVEL_BANDS.length;
  return {
    id: `illusion-tower-${index}`,
    name: `幻境之塔·${TOWER_FLOOR_LABELS[floor]}层`,
    description: `完整图鉴训练层 ${index}/5。这里出现 Lv.${minLevel}–${maxLevel} 的投影宝可梦；五层合计覆盖全部151种。`,
    encounterFloor: true,
    width: 16,
    height: 14,
    tiles: isSummit ? ILLUSION_TOWER_SUMMIT_TILES : ILLUSION_TOWER_TILES,
    encounters: towerEncounters(floor),
    connected: [
      ...(floor > 0 ? [{ to: `illusion-tower-${index - 1}`, x: 8, y: 13, label: `${TOWER_FLOOR_LABELS[floor - 1]}层`, direction: 'down' as const }] : [{ to: 'pallet', x: 8, y: 13, label: '雾湾镇', direction: 'down' as const }]),
      ...(isSummit ? [] : [{ to: `illusion-tower-${index + 1}`, x: 8, y: 0, label: `${TOWER_FLOOR_LABELS[floor + 1]}层`, direction: 'up' as const }]),
    ],
    warps: [
      floor === 0
        ? { x: 8, y: 13, toMapId: 'pallet', toX: 7, toY: 5, transition: 'door' as const, label: '雾湾镇', direction: 'down' as const }
        : { x: 8, y: 13, toMapId: `illusion-tower-${index - 1}`, toX: 8, toY: 1, transition: 'cave' as const, label: `幻境之塔·${TOWER_FLOOR_LABELS[floor - 1]}层`, direction: 'down' as const },
      ...(isSummit ? [] : [{ x: 8, y: 0, toMapId: `illusion-tower-${index + 1}`, toX: 8, toY: 12, transition: 'cave' as const, label: `幻境之塔·${TOWER_FLOOR_LABELS[floor + 1]}层`, direction: 'up' as const }]),
    ],
    ambient: `紫色投影沿着石阶轮换显现，等级铭牌显示：推荐 Lv.${minLevel}–${maxLevel}。`,
  };
});

export const MAPS: GameMap[] = [
  {
    id: 'pallet',
    name: '雾湾镇',
    description: '澜潮群岛西岸的港湾小镇，灯塔与潮汐研究所守望着迷雾海。',
    width: 16, height: 14,
    tiles: tiles([
      'TTTTTTTTTTTTTTTT',
      'T.,,..,,..,,...T',
      'T.,,..BB..,,...T',
      'T.....BB..FF...T',
      'T.,,...D.FF....T',
      'T.,,..,....s...T',
      'T........,,,...T',
      'T..""..,.,,....T',
      'T.."".....,,...T',
      'T........,,,...T',
      'T.,,.,.........T',
      'T.,,.,..,.,.,..T',
      'T....EEEEEEEE..T',
      'T..WWWWWWWWWW..T',
    ], 16),
    encounters: [],
    connected: [
      { to: 'illusion-tower-1', x: 7, y: 4, label: '幻境之塔', direction: 'right' as const },
    ],
    warps: [
      { x: 7, y: 4, toMapId: 'illusion-tower-1', toX: 8, toY: 12, transition: 'door' as const, label: '幻境之塔', direction: 'right' as const },
    ],
    ambient: '潮雾擦过石阶，灯塔的铜铃在远处轻响；研究所西侧多出一座映着紫光的训练高塔。',
  },
  ...illusionTowerMaps,
];

export const MAP_MAP: Record<string, GameMap> = Object.fromEntries(
  MAPS.map((m) => [m.id, m]),
);

export function getMap(id: string): GameMap {
  const m = MAP_MAP[id];
  if (!m) throw new Error(`Unknown map id: ${id}`);
  return m;
}

/** Tile is walkable by the player. */
export function isWalkable(tile: number): boolean {
  // grass(0), tall-grass(3), path(4), sand(5), door(7), flower(8), sign(10),
  // water-edge(11), cave-entrance(12), dock(13)
  return tile === 0 || tile === 3 || tile === 4 || tile === 5 || tile === 7 || tile === 8 || tile === 10 || tile === 11 || tile === 12 || tile === 13;
}

/** Tile triggers a wild encounter. Tall-grass (3) always triggers; on
 *  `encounterFloor` maps (caves/water) natural floor tiles also trigger so
 *  those maps aren't encounter-dead zones (they have no tall-grass tiles). */
export function isEncounterTile(tile: number, map?: GameMap): boolean {
  if (tile === 3) return true;
  if (map?.encounterFloor && (tile === 0 || tile === 4 || tile === 5 || tile === 8 || tile === 11)) return true;
  return false;
}
