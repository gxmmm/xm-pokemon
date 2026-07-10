import type { GameMap } from '@pokemon-online/shared';

/**
 * The explorable world. Per Principle 5 (world first) Pokemon live in maps,
 * not menus. Encounters are ecological weighted tables, optionally time-gated.
 * Maps connect via door/warp tiles (code 7) to form one continuous world with
 * hidden areas rewarding exploration.
 *
 * Tile codes:
 *  0 grass(walk) 1 tree(block) 2 water(block) 3 tall-grass(encounter)
 *  4 path(walk)  5 sand(walk)   6 rock(block)  7 door/warp
 *  8 flower(walk) 9 building(block) 10 sign(walk) 11 water-edge(walk)
 */

const LEGEND: Record<string, number> = {
  '.': 0, 'T': 1, 'W': 2, '"': 3, ',': 4, 'S': 5, 'R': 6,
  'D': 7, 'F': 8, 'B': 9, 's': 10, 'E': 11,
};

function tiles(rows: string[]): number[][] {
  return rows.map((r) => r.split('').map((c) => (c in LEGEND ? LEGEND[c] : 0)));
}

export const MAPS: GameMap[] = [
  {
    id: 'pallet',
    name: '真新镇',
    description: '一切开始的地方，宁静的海边小镇。',
    width: 16, height: 12,
    tiles: tiles([
      'TTTTTTTTTTTTTTTT',
      'T..............T',
      'T.BB...,,......T',
      'T.BB...,,...FF.T',
      'T......,,......T',
      'T..,,..,,......T',
      'T..,,..........T',
      'T......""......T',
      'T....."""".....T',
      'T......""......T',
      'T.............sT',
      'TTTTTTTTD TTTTTT',
    ]),
    encounters: [],
    connected: [{ to: 'route1', x: 8, y: 1, label: '1号道路' }],
    warps: [{ x: 7, y: 11, toMapId: 'route1', toX: 7, toY: 1 }],
    ambient: '海风轻拂的宁静小镇。',
  },
  {
    id: 'route1',
    name: '1号道路',
    description: '真新镇与常磐市之间的草丛小径。',
    width: 16, height: 14,
    tiles: tiles([
      'TTTTTTTDTTTTTTTT',
      'T......,.......T',
      'T..,,..,..""...T',
      'T..,,..,..""...T',
      'T......,.......T',
      'T..."".,...,,..T',
      'T..."".,...,,..T',
      'T......,.......T',
      'T..,,..,..""...T',
      'T..,,..,.......T',
      'T......,..""...T',
      'T......,.......T',
      'T......,.......T',
      'TTTTTTTTDTTTTTTT',
    ]),
    encounters: [
      { speciesId: 16, weight: 30, minLevel: 2, maxLevel: 5 },
      { speciesId: 19, weight: 30, minLevel: 2, maxLevel: 5 },
      { speciesId: 10, weight: 15, minLevel: 2, maxLevel: 4 },
      { speciesId: 13, weight: 15, minLevel: 2, maxLevel: 4 },
      { speciesId: 25, weight: 5, minLevel: 3, maxLevel: 5, rarity: 'uncommon' },
    ],
    connected: [
      { to: 'pallet', x: 7, y: 12, label: '真新镇' },
      { to: 'viridian-forest', x: 7, y: 1, label: '常磐森林' },
    ],
    warps: [
      { x: 7, y: 0, toMapId: 'viridian-forest', toX: 7, toY: 12 },
      { x: 7, y: 13, toMapId: 'pallet', toX: 7, toY: 10 },
    ],
  },
  {
    id: 'viridian-forest',
    name: '常磐森林',
    description: '虫属性宝可梦栖息的幽暗森林。',
    width: 16, height: 14,
    tiles: tiles([
      'TTTTTTTTDTTTTTTT',
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
      'TTTTTTTTD TTTTTT',
    ]),
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
      { to: 'route1', x: 7, y: 12, label: '1号道路' },
      { to: 'route3', x: 7, y: 1, label: '3号道路' },
    ],
    warps: [
      { x: 7, y: 0, toMapId: 'route3', toX: 7, toY: 12 },
      { x: 7, y: 13, toMapId: 'route1', toX: 7, toY: 1 },
    ],
    ambient: '树叶沙沙作响，似乎有什么在草丛里。',
  },
  {
    id: 'route3',
    name: '3号道路',
    description: '通往月见山的崎岖山路。',
    width: 16, height: 14,
    tiles: tiles([
      'TTTTTTTTDTTTTTTT',
      'T.,.,.,.,.,.,..T',
      'T."".,.,."",..T',
      'T.,.,.,.,.,.,..T',
      'T.."".,.,.,.,.T',
      'T.,.,.,.,.,.,..T',
      'T.,.,.RRR.,.,..T',
      'T.,.,.R.R.,.,..T',
      'T.,.,.R.R.,.,..T',
      'T.,.,.RRR.,.,..T',
      'T.,.,.,.,.,.,..T',
      'T.."",.,.,."",T',
      'T.,.,.,.,.,.,..T',
      'TTTTTTTTD TTTTTT',
    ]),
    encounters: [
      { speciesId: 21, weight: 30, minLevel: 6, maxLevel: 10 },
      { speciesId: 32, weight: 20, minLevel: 6, maxLevel: 10 },
      { speciesId: 29, weight: 20, minLevel: 6, maxLevel: 10 },
      { speciesId: 56, weight: 15, minLevel: 7, maxLevel: 11 },
      { speciesId: 39, weight: 8, minLevel: 8, maxLevel: 12, rarity: 'uncommon' },
      { speciesId: 74, weight: 12, minLevel: 7, maxLevel: 11 },
    ],
    connected: [
      { to: 'viridian-forest', x: 7, y: 12, label: '常磐森林' },
      { to: 'mt-moon', x: 7, y: 1, label: '月见山' },
    ],
    warps: [
      { x: 7, y: 0, toMapId: 'mt-moon', toX: 7, toY: 12 },
      { x: 7, y: 13, toMapId: 'viridian-forest', toX: 7, toY: 1 },
    ],
  },
  {
    id: 'mt-moon',
    name: '月见山',
    description: '神秘的洞穴，传说有稀有宝可梦沉睡其中。',
    width: 16, height: 14,
    tiles: tiles([
      'TTTTTTTTDTTTTTTT',
      'TRRRRRRRRRRRRRRT',
      'TR.,.,.,.,.,.RT',
      'TR.,RRR.,.RRR.RT',
      'TR.,R.R.,.R.R.RT',
      'TR.,R.R.,.R.R.RT',
      'TR.,RRR.,.RRR.RT',
      'TR.,.,.,.,.,.RT',
      'TRRR.,.,.,.RRRRT',
      'TR.,.,.,.,.,.RT',
      'TR.,RR.,.,RRR.RT',
      'TR.,.,.,.,.,.RT',
      'TR.,.,.,.,.,.RT',
      'TTTTTTTTD TTTTTT',
    ]),
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
      { to: 'route3', x: 7, y: 12, label: '3号道路' },
      { to: 'rock-tunnel', x: 7, y: 1, label: '岩石隧道' },
    ],
    warps: [
      { x: 7, y: 0, toMapId: 'rock-tunnel', toX: 7, toY: 12 },
      { x: 7, y: 13, toMapId: 'route3', toX: 7, toY: 1 },
    ],
    ambient: '洞顶滴水的回声在黑暗中回荡。',
  },
  {
    id: 'rock-tunnel',
    name: '岩石隧道',
    description: '布满岩石的深邃隧道，电系与格斗系宝可梦出没。',
    width: 16, height: 14,
    tiles: tiles([
      'TTTTTTTTDTTTTTTT',
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
      'TTTTTTTTD TTTTTT',
    ]),
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
      { to: 'mt-moon', x: 7, y: 12, label: '月见山' },
      { to: 'sea-route', x: 7, y: 1, label: '海路' },
    ],
    warps: [
      { x: 7, y: 0, toMapId: 'sea-route', toX: 7, toY: 12 },
      { x: 7, y: 13, toMapId: 'mt-moon', toX: 7, toY: 1 },
    ],
  },
  {
    id: 'sea-route',
    name: '海路',
    description: '通往未知之地的海滨水域。',
    width: 16, height: 14,
    tiles: tiles([
      'TTTTTTTTDTTTTTTT',
      'T.,.,.,.,.,.,..T',
      'T.,.,.,.,.,.,..T',
      'TWWWWWWWWWWWWWWT',
      'TWWWWWWWWWWWWWWT',
      'TWWWWWWEEWWWWWWT',
      'TWWWWWEEEEWWWWWT',
      'TWWWWWEEEEWWWWWT',
      'TWWWWWWEEWWWWWWT',
      'TWWWWWWWWWWWWWWT',
      'TWWWWWWWWWWWWWWT',
      'T.,.,.,.,.,.,..T',
      'T.,.,.,.,.,.,..T',
      'TTTTTTTTD TTTTTT',
    ]),
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
      { to: 'rock-tunnel', x: 7, y: 12, label: '岩石隧道' },
      { to: 'dragon-den', x: 7, y: 1, label: '???隐藏洞穴' },
    ],
    warps: [
      { x: 7, y: 0, toMapId: 'dragon-den', toX: 7, toY: 12 },
      { x: 7, y: 13, toMapId: 'rock-tunnel', toX: 7, toY: 1 },
    ],
    ambient: '海浪拍岸，远处似有龙的咆哮。',
  },
  {
    id: 'dragon-den',
    name: '龙之秘境',
    description: '隐藏的洞穴，龙系宝可梦与传说守护此地。',
    width: 16, height: 14,
    tiles: tiles([
      'TTTTTTTTDTTTTTTT',
      'TRRRRRRRRRRRRRRT',
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
      'TTTTTTTTD TTTTTT',
    ]),
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
    connected: [{ to: 'sea-route', x: 7, y: 12, label: '海路' }],
    warps: [{ x: 7, y: 13, toMapId: 'sea-route', toX: 7, toY: 1 }],
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
  // tall grass (3) and door (7) and sign (10) and flower(8) and path/grass/sand/edge are walkable
  return tile === 0 || tile === 3 || tile === 4 || tile === 5 || tile === 7 || tile === 8 || tile === 10 || tile === 11;
}

/** Tile triggers a wild encounter. */
export function isEncounterTile(tile: number): boolean {
  return tile === 3;
}
