import type { GameMap, Rarity } from '@pokemon-online/shared';
import { SPECIES_LIST } from './pokemon.ts';

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


// Development sandbox switch. Set false for a story-focused release to hide the tower and every floor without migrating saves.
export const ILLUSION_TOWER_ENABLED = true;

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
      'TTTTTTTT,TTTTTTT',
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
      { to: 'route1', x: 8, y: 0, label: '萤火林道', direction: 'up' },
      ...(ILLUSION_TOWER_ENABLED ? [{ to: 'illusion-tower-1', x: 7, y: 4, label: '幻境之塔', direction: 'right' as const }] : []),
    ],
    warps: [
      { x: 8, y: 0, toMapId: 'route1', toX: 8, toY: 12, transition: 'fade', label: '萤火林道', direction: 'up' },
      ...(ILLUSION_TOWER_ENABLED ? [{ x: 7, y: 4, toMapId: 'illusion-tower-1', toX: 8, toY: 12, transition: 'door' as const, label: '幻境之塔', direction: 'right' as const }] : []),
    ],
    ambient: '潮雾擦过石阶，灯塔的铜铃在远处轻响；研究所西侧多出一座映着紫光的训练高塔。',
  },
  ...(ILLUSION_TOWER_ENABLED ? illusionTowerMaps : []),
  {
    id: 'route1',
    name: '萤火林道',
    description: '连接雾湾与雾林的夜光草径，蓝色孢子在树影间浮动。',
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
      { to: 'pallet', x: 8, y: 13, label: '雾湾镇', direction: 'down' },
      { to: 'viridian-forest', x: 8, y: 0, label: '迷雾林境', direction: 'up' },
    ],
    warps: [
      { x: 8, y: 0, toMapId: 'viridian-forest', toX: 8, toY: 12, transition: 'fade', label: '迷雾林境', direction: 'up' },
      { x: 8, y: 13, toMapId: 'pallet', toX: 8, toY: 1, transition: 'fade', label: '雾湾镇', direction: 'down' },
    ],
  },
  {
    id: 'viridian-forest',
    name: '迷雾林境',
    description: '被蓝雾包围的密林，古老根系在地下聆听潮汐。',
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
    name: '星陨高径',
    description: '通向高原观测所的断崖古道，石面留着从天外坠落的星痕。',
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
      { to: 'viridian-forest', x: 8, y: 13, label: '迷雾林境', direction: 'down' },
      { to: 'mt-moon', x: 8, y: 0, label: '星陨观测所', direction: 'up' },
    ],
    warps: [
      { x: 8, y: 0, toMapId: 'mt-moon', toX: 8, toY: 12, transition: 'cave', label: '星陨观测所', direction: 'up' },
      { x: 8, y: 13, toMapId: 'viridian-forest', toX: 8, toY: 1, transition: 'fade', label: '迷雾林境', direction: 'down' },
    ],
  },
  {
    id: 'mt-moon',
    name: '星陨观测所',
    description: '建在陨石裂谷中的古老观测所，穹顶下的星图仍在自行转动。',
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
      { to: 'route3', x: 8, y: 13, label: '星陨高径', direction: 'down' },
      { to: 'rock-tunnel', x: 8, y: 0, label: '裂谷深层', direction: 'up' },
    ],
    warps: [
      { x: 8, y: 0, toMapId: 'rock-tunnel', toX: 8, toY: 12, transition: 'cave', label: '裂谷深层', direction: 'up' },
      { x: 8, y: 13, toMapId: 'route3', toX: 8, toY: 1, transition: 'cave', label: '星陨高径', direction: 'down' },
    ],
    ambient: '穹顶裂缝漏下星光，旧仪器在无人触碰时缓慢转动。',
  },
  {
    id: 'rock-tunnel',
    name: '赤砾裂谷',
    description: '连接高原与东海的赤色裂谷，风沙与矿脉在岩壁间交错。',
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
      { to: 'mt-moon', x: 8, y: 13, label: '星陨观测所', direction: 'down' },
      { to: 'sea-route', x: 8, y: 0, label: '静潮群岛', direction: 'up' },
    ],
    warps: [
      { x: 8, y: 0, toMapId: 'sea-route', toX: 8, toY: 12, transition: 'cave', label: '静潮群岛', direction: 'up' },
      { x: 8, y: 13, toMapId: 'mt-moon', toX: 8, toY: 1, transition: 'cave', label: '星陨观测所', direction: 'down' },
    ],
  },
  {
    id: 'sea-route',
    name: '静潮群岛',
    description: '潮位每日翻转的礁石群岛，低潮时沉船与潮洞入口会从浅海露出。',
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
      { to: 'rock-tunnel', x: 8, y: 13, label: '赤砾裂谷', direction: 'down' },
      { to: 'dragon-den', x: 8, y: 0, label: '潮洞', direction: 'up' },
    ],
    warps: [
      { x: 8, y: 0, toMapId: 'dragon-den', toX: 8, toY: 12, transition: 'boat', label: '潮洞', direction: 'up' },
      { x: 8, y: 13, toMapId: 'rock-tunnel', toX: 8, toY: 1, transition: 'cave', label: '赤砾裂谷', direction: 'down' },
    ],
    ambient: '潮声在礁石间回旋，退潮后偶尔能听见沉船木板的轻响。',
  },
  {
    id: 'dragon-den',
    name: '潮洞',
    description: '被静潮长期雕刻出的海蚀洞，洞底藏着与天空坐标共鸣的锚印。',
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
    connected: [{ to: 'sea-route', x: 8, y: 13, label: '静潮群岛', direction: 'down' }],
    warps: [{ x: 8, y: 13, toMapId: 'sea-route', toX: 8, toY: 1, transition: 'boat', label: '静潮群岛', direction: 'down' }],
    hidden: true,
    ambient: '洞壁上的盐晶反射紫色潮光，越往深处越像站在倒悬的星海。',
    unlockHint: '低潮时沿礁石路前行，可抵达潮洞。',
  },
  {
    id: 'deep-space',
    name: '深空遗址',
    description: '悬浮在无星裂隙中的古代遗址，紫蓝晶体、失重石台与沉睡终端漂浮在寂静里。',
    encounterFloor: true,
    width: 16, height: 14,
    tiles: tiles([
      'TTTTTTTTTTTTTTTT',
      'TRRRR.,.,.RRRRT',
      'TR.,.,.,.,.,.RT',
      'TR.,R.RRR.R.,RT',
      'TR.,R.R.R.R.,RT',
      'TR.,.,.,.,.,.RT',
      'TRRR.,.,.,.RRRRT',
      'TR.,.,RR.,.,.RT',
      'TR.,.,.,.,.,.RT',
      'TR.RRR.,.RRR.RT',
      'TR.,.,.,.,.,.RT',
      'TR.,.,.,.,.,.RT',
      'TR.,.,.,.,.,.RT',
      'TTTTTTTTCTTTTTTT',
    ], 16),
    encounters: [
      { speciesId: 81, weight: 20, minLevel: 18, maxLevel: 24 },
      { speciesId: 120, weight: 18, minLevel: 18, maxLevel: 24 },
      { speciesId: 137, weight: 15, minLevel: 19, maxLevel: 25 },
      { speciesId: 35, weight: 12, minLevel: 19, maxLevel: 24 },
      { speciesId: 142, weight: 5, minLevel: 22, maxLevel: 28, rarity: 'rare' },
    ],
    connected: [{ to: 'dragon-den', x: 8, y: 13, label: '潮洞', direction: 'down' }],
    warps: [{ x: 8, y: 13, toMapId: 'dragon-den', toX: 8, toY: 2, transition: 'cave', label: '潮洞', direction: 'down' }],
    hidden: true,
    ambient: '晶体在无风中缓慢漂浮，远处像有巨大的机械心跳。',
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
