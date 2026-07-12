import type { GameMap } from '@pokemon-online/shared';

/**
 * The explorable world. Per Principle 5 (world first) Pokemon live in maps,
 * not menus. Encounters are ecological weighted tables, optionally time-gated.
 * Maps connect via edge exits / door tiles to form one continuous world with
 * hidden areas rewarding exploration.
 *
 * Crossing between maps NEVER teleports instantly: each exit carries a
 * `transition` (fade/boat/cave/door) played by the world view. To reach another
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

export const MAPS: GameMap[] = [
  {
    id: 'pallet',
    name: '真新镇',
    description: '一切开始的地方，宁静的海边小镇。',
    width: 16, height: 14,
    tiles: tiles([
      'TTTTTTTT,TTTTTTT',
      'T.,,..,,..,,...T',
      'T.,,..BB..,,...T',
      'T.....BB..FF...T',
      'T.,,.....FF....T',
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
    connected: [{ to: 'route1', x: 8, y: 0, label: '1号道路', direction: 'up' }],
    warps: [{ x: 8, y: 0, toMapId: 'route1', toX: 8, toY: 12, transition: 'fade', label: '1号道路', direction: 'up' }],
    ambient: '海风轻拂的宁静小镇。',
  },
  {
    id: 'route1',
    name: '1号道路',
    description: '真新镇与常磐森林之间的草丛小径。',
    width: 16, height: 14,
    tiles: tiles([
      'TTTTTTTT,TTTTTTT',
      'T..............T',
      'T..""......""..T',
      'T..""......""..T',
      'T..............T',
      'T.,.,..........T',
      'T..""......""..T',
      'T..............T',
      'T.,.,..........T',
      'T..""......""..T',
      'T..............T',
      'T.,.,..........T',
      'T..""......""..T',
      'TTTTTTTT,TTTTTTT',
    ], 16),
    encounters: [
      { speciesId: 16, weight: 30, minLevel: 2, maxLevel: 5 },
      { speciesId: 19, weight: 30, minLevel: 2, maxLevel: 5 },
      { speciesId: 10, weight: 15, minLevel: 2, maxLevel: 4 },
      { speciesId: 13, weight: 15, minLevel: 2, maxLevel: 4 },
      { speciesId: 25, weight: 5, minLevel: 3, maxLevel: 5, rarity: 'uncommon' },
    ],
    connected: [
      { to: 'pallet', x: 8, y: 13, label: '真新镇', direction: 'down' },
      { to: 'viridian-forest', x: 8, y: 0, label: '常磐森林', direction: 'up' },
    ],
    warps: [
      { x: 8, y: 0, toMapId: 'viridian-forest', toX: 8, toY: 12, transition: 'fade', label: '常磐森林', direction: 'up' },
      { x: 8, y: 13, toMapId: 'pallet', toX: 8, toY: 1, transition: 'fade', label: '真新镇', direction: 'down' },
    ],
  },
  {
    id: 'viridian-forest',
    name: '常磐森林',
    description: '虫属性宝可梦栖息的幽暗森林。',
    width: 16, height: 14,
    tiles: tiles([
      'TTTTTTTT,TTTTTTT',
      'T"""""""""""""T',
      'T""""T""""T"""T',
      'T""""T""""T"""T',
      'T"""""""""""""T',
      'T"""T""T""T"""T',
      'T"""T""T""T"""T',
      'T"""""""""""""T',
      'T""""T""""T"""T',
      'T""""T""""T"""T',
      'T"""""""""""""T',
      'T"""T""T""T"""T',
      'T"""""""""""""T',
      'TTTTTTTT,TTTTTTT',
    ], 16),
    encounters: [
      { speciesId: 10, weight: 25, minLevel: 3, maxLevel: 6 },
      { speciesId: 13, weight: 25, minLevel: 3, maxLevel: 6 },
      { speciesId: 16, weight: 15, minLevel: 3, maxLevel: 6 },
      { speciesId: 48, weight: 10, minLevel: 4, maxLevel: 7 },
      { speciesId: 25, weight: 8, minLevel: 3, maxLevel: 5, rarity: 'uncommon' },
      { speciesId: 15, weight: 5, minLevel: 6, maxLevel: 9, rarity: 'uncommon' },
      { speciesId: 12, weight: 5, minLevel: 6, maxLevel: 9, rarity: 'uncommon' },
    ],
    connected: [
      { to: 'route1', x: 8, y: 13, label: '1号道路', direction: 'down' },
      { to: 'route3', x: 8, y: 0, label: '3号道路', direction: 'up' },
    ],
    warps: [
      { x: 8, y: 0, toMapId: 'route3', toX: 8, toY: 12, transition: 'fade', label: '3号道路', direction: 'up' },
      { x: 8, y: 13, toMapId: 'route1', toX: 8, toY: 1, transition: 'fade', label: '1号道路', direction: 'down' },
    ],
    ambient: '树叶沙沙作响，似乎有什么在草丛里。',
  },
  {
    id: 'route3',
    name: '3号道路',
    description: '通往月见山的崎岖山路。',
    width: 16, height: 14,
    tiles: tiles([
      'TTTTTTTTCTTTTTTT',
      'T.,.,.,.,.,.,.,T',
      'T."".,.,.,."",T',
      'T.,.,.,.,.,.,.,T',
      'T.."".,.,.,.,.T',
      'T.,.,.RRR.,.,.T',
      'T.,.,.R.R.,.,.T',
      'T.,.,.R.R.,.,.T',
      'T.,.,.RRR.,.,.T',
      'T.,.,.,.,.,.,.T',
      'T.."",.,.,."",T',
      'T.,.,.,.,.,.,.,T',
      'T.,.,.,.,.,.,.,T',
      'TTTTTTTT,TTTTTTT',
    ], 16),
    encounters: [
      { speciesId: 21, weight: 30, minLevel: 6, maxLevel: 10 },
      { speciesId: 32, weight: 20, minLevel: 6, maxLevel: 10 },
      { speciesId: 29, weight: 20, minLevel: 6, maxLevel: 10 },
      { speciesId: 56, weight: 15, minLevel: 7, maxLevel: 11 },
      { speciesId: 39, weight: 8, minLevel: 8, maxLevel: 12, rarity: 'uncommon' },
      { speciesId: 74, weight: 12, minLevel: 7, maxLevel: 11 },
    ],
    connected: [
      { to: 'viridian-forest', x: 8, y: 13, label: '常磐森林', direction: 'down' },
      { to: 'mt-moon', x: 8, y: 0, label: '月见山', direction: 'up' },
    ],
    warps: [
      { x: 8, y: 0, toMapId: 'mt-moon', toX: 8, toY: 12, transition: 'cave', label: '月见山', direction: 'up' },
      { x: 8, y: 13, toMapId: 'viridian-forest', toX: 8, toY: 1, transition: 'fade', label: '常磐森林', direction: 'down' },
    ],
  },
  {
    id: 'mt-moon',
    name: '月见山',
    description: '神秘的洞穴，传说有稀有宝可梦沉睡其中。',
    encounterFloor: true,
    width: 16, height: 14,
    tiles: tiles([
      'TTTTTTTTCTTTTTTT',
      'TR.,.,.,.,.,.RT',
      'TR.,RRR.,.RRR.RT',
      'TR.,R.R.,.R.R.RT',
      'TR.,R.R.,.R.R.RT',
      'TR.,RRR.,.RRR.RT',
      'TR.,.,.,.,.,.RT',
      'TRRR.,.,.,.RRRRT',
      'TR.,.,.,.,.,.RT',
      'TR.,RR.,.,RR.RT',
      'TR.,.,.,.,.,.RT',
      'TR.,.,.,.,.,.RT',
      'TR.,.,.,.,.,.RT',
      'TTTTTTTTCTTTTTTT',
    ], 16),
    encounters: [
      { speciesId: 74, weight: 25, minLevel: 8, maxLevel: 13 },
      { speciesId: 41, weight: 25, minLevel: 8, maxLevel: 13 },
      { speciesId: 46, weight: 12, minLevel: 9, maxLevel: 13 },
      { speciesId: 95, weight: 8, minLevel: 10, maxLevel: 14, rarity: 'uncommon' },
      { speciesId: 35, weight: 10, minLevel: 9, maxLevel: 13, rarity: 'uncommon' },
      { speciesId: 138, weight: 3, minLevel: 12, maxLevel: 15, rarity: 'rare' },
      { speciesId: 140, weight: 3, minLevel: 12, maxLevel: 15, rarity: 'rare' },
    ],
    connected: [
      { to: 'route3', x: 8, y: 13, label: '3号道路', direction: 'down' },
      { to: 'rock-tunnel', x: 8, y: 0, label: '岩石隧道', direction: 'up' },
    ],
    warps: [
      { x: 8, y: 0, toMapId: 'rock-tunnel', toX: 8, toY: 12, transition: 'cave', label: '岩石隧道', direction: 'up' },
      { x: 8, y: 13, toMapId: 'route3', toX: 8, toY: 1, transition: 'cave', label: '3号道路', direction: 'down' },
    ],
    ambient: '洞顶滴水的回声在黑暗中回荡。',
  },
  {
    id: 'rock-tunnel',
    name: '岩石隧道',
    description: '布满岩石的深邃隧道，电系与格斗系宝可梦出没。',
    encounterFloor: true,
    width: 16, height: 14,
    tiles: tiles([
      'TTTTTTTTCTTTTTTT',
      'TR.,.,.,.,.,.RT',
      'TR.RRR.,.RRR.RT',
      'TR.R.R.,.R.R.RT',
      'TR.R.R.,.R.R.RT',
      'TR.RRR.,.RRR.RT',
      'TR.,.,.,.,.,.RT',
      'TRRRR.,.,.RRRRT',
      'TR.,.,.,.,.,.RT',
      'TR.,RR.,.,RR.RT',
      'TR.,.,.,.,.,.RT',
      'TR.,.,.,.,.,.RT',
      'TR.,.,.,.,.,.RT',
      'TTTTTTTTCTTTTTTT',
    ], 16),
    encounters: [
      { speciesId: 74, weight: 20, minLevel: 12, maxLevel: 18 },
      { speciesId: 95, weight: 15, minLevel: 13, maxLevel: 19 },
      { speciesId: 66, weight: 15, minLevel: 12, maxLevel: 18 },
      { speciesId: 100, weight: 12, minLevel: 13, maxLevel: 18 },
      { speciesId: 109, weight: 10, minLevel: 13, maxLevel: 18 },
      { speciesId: 81, weight: 8, minLevel: 14, maxLevel: 19, rarity: 'uncommon' },
      { speciesId: 111, weight: 6, minLevel: 15, maxLevel: 20, rarity: 'uncommon' },
      { speciesId: 142, weight: 2, minLevel: 18, maxLevel: 22, rarity: 'rare' },
    ],
    connected: [
      { to: 'mt-moon', x: 8, y: 13, label: '月见山', direction: 'down' },
      { to: 'sea-route', x: 8, y: 0, label: '海路', direction: 'up' },
    ],
    warps: [
      { x: 8, y: 0, toMapId: 'sea-route', toX: 8, toY: 12, transition: 'cave', label: '海路', direction: 'up' },
      { x: 8, y: 13, toMapId: 'mt-moon', toX: 8, toY: 1, transition: 'cave', label: '月见山', direction: 'down' },
    ],
  },
  {
    id: 'sea-route',
    name: '海路',
    description: '通往未知之地的海滨水域。',
    encounterFloor: true,
    width: 16, height: 14,
    tiles: tiles([
      'TTTTTTTTKTTTTTTT',
      'T.,.,.,.,.,.,.,T',
      'T.,.,.,.,.,.,.,T',
      'TWWW.,.,.,.,.WWT',
      'TWWWW.,.,.WWWWT',
      'TWWWWWW.,.WWWWWT',
      'TWWWW.,.,.WWWWT',
      'TWWW.,.,.,.WWWT',
      'T.,.,.,.,.,.,.,T',
      'T.,.,.,.,.,.,.,T',
      'T.,.,.,.,.,.,.,T',
      'T.,.,.,.,.,.,.,T',
      'T.,.,.,.,.,.,.,T',
      'TTTTTTTTCTTTTTTT',
    ], 16),
    encounters: [
      { speciesId: 72, weight: 25, minLevel: 15, maxLevel: 22 },
      { speciesId: 90, weight: 15, minLevel: 15, maxLevel: 21 },
      { speciesId: 116, weight: 15, minLevel: 16, maxLevel: 22 },
      { speciesId: 120, weight: 12, minLevel: 16, maxLevel: 22 },
      { speciesId: 118, weight: 12, minLevel: 15, maxLevel: 21 },
      { speciesId: 54, weight: 10, minLevel: 16, maxLevel: 22 },
      { speciesId: 131, weight: 3, minLevel: 20, maxLevel: 25, rarity: 'rare' },
      { speciesId: 73, weight: 8, minLevel: 18, maxLevel: 24, rarity: 'uncommon' },
    ],
    connected: [
      { to: 'rock-tunnel', x: 8, y: 13, label: '岩石隧道', direction: 'down' },
      { to: 'dragon-den', x: 8, y: 0, label: '???隐藏洞穴', direction: 'up' },
    ],
    warps: [
      { x: 8, y: 0, toMapId: 'dragon-den', toX: 8, toY: 12, transition: 'boat', label: '龙之秘境', direction: 'up' },
      { x: 8, y: 13, toMapId: 'rock-tunnel', toX: 8, toY: 1, transition: 'cave', label: '岩石隧道', direction: 'down' },
    ],
    ambient: '海浪拍岸，远处似有龙的咆哮。',
  },
  {
    id: 'dragon-den',
    name: '龙之秘境',
    description: '隐藏的洞穴，龙系宝可梦与传说守护此地。',
    encounterFloor: true,
    width: 16, height: 14,
    tiles: tiles([
      'TTTTTTTTTTTTTTTT',
      'TRRRRRRRRRRRRRT',
      'TR.,.,.,.,.,.RT',
      'TR.,R.RRR.R.,RT',
      'TR.,R.R.R.R.,RT',
      'TR.,R.R.R.R.,RT',
      'TR.,R.RRR.R.,RT',
      'TR.,.,.,.,.,.RT',
      'TRRRR.,.,.RRRRT',
      'TR.,.,.,.,.,.RT',
      'TR.,RR.,.,RR.RT',
      'TR.,.,.,.,.,.RT',
      'TR.,.,.,.,.,.RT',
      'TTTTTTTTKTTTTTTT',
    ], 16),
    encounters: [
      { speciesId: 147, weight: 30, minLevel: 20, maxLevel: 30 },
      { speciesId: 148, weight: 20, minLevel: 25, maxLevel: 35 },
      { speciesId: 142, weight: 10, minLevel: 28, maxLevel: 38, rarity: 'rare' },
      { speciesId: 149, weight: 8, minLevel: 40, maxLevel: 55, rarity: 'rare' },
      { speciesId: 143, weight: 8, minLevel: 35, maxLevel: 50, rarity: 'rare' },
      { speciesId: 144, weight: 2, minLevel: 50, maxLevel: 60, rarity: 'legendary' },
      { speciesId: 145, weight: 2, minLevel: 50, maxLevel: 60, rarity: 'legendary' },
      { speciesId: 146, weight: 2, minLevel: 50, maxLevel: 60, rarity: 'legendary' },
      { speciesId: 150, weight: 1, minLevel: 70, maxLevel: 70, rarity: 'legendary' },
      { speciesId: 151, weight: 1, minLevel: 50, maxLevel: 50, rarity: 'mythical' },
    ],
    connected: [{ to: 'sea-route', x: 8, y: 13, label: '海路', direction: 'down' }],
    warps: [{ x: 8, y: 13, toMapId: 'sea-route', toX: 8, toY: 1, transition: 'boat', label: '海路', direction: 'down' }],
    hidden: true,
    ambient: '空气中弥漫着古老而强大的气息。',
    unlockHint: '穿过海路尽头的洞口即可发现。',
  },
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
