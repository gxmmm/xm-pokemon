import type { Item } from '@pokemon-online/shared';

/**
 * Items. Capture is 100% by design (frozen), so balls are cosmetic flavor
 * rather than catch-probability modifiers. Consumables heal/cure; EXP candy
 * helps training without being a forced grind.
 */
export const ITEMS: Item[] = [
  { id: 'potion', name: '伤药', description: '回复一只宝可梦50HP。', kind: 'consumable', effect: { kind: 'heal', magnitude: 50, target: 'pokemon' }, price: 100 },
  { id: 'super-potion', name: '好伤药', description: '回复一只宝可梦120HP。', kind: 'consumable', effect: { kind: 'heal', magnitude: 120, target: 'pokemon' }, price: 300 },
  { id: 'hyper-potion', name: '厉害伤药', description: '回复一只宝可梦200HP。', kind: 'consumable', effect: { kind: 'heal', magnitude: 200, target: 'pokemon' }, price: 800 },
  { id: 'max-potion', name: '全满药', description: '回满一只宝可梦HP。', kind: 'consumable', effect: { kind: 'heal', magnitude: 9999, target: 'pokemon' }, price: 1500 },
  { id: 'revive', name: '活力碎片', description: '回复濒死宝可梦一半HP。', kind: 'consumable', effect: { kind: 'revive', magnitude: 0.5, target: 'pokemon' }, price: 500 },
  { id: 'antidote', name: '解毒药', description: '治愈中毒。', kind: 'consumable', effect: { kind: 'cure', statusCured: 'poison', target: 'pokemon' }, price: 50 },
  { id: 'paralyze-heal', name: '麻痹治愈药', description: '治愈麻痹。', kind: 'consumable', effect: { kind: 'cure', statusCured: 'paralyze', target: 'pokemon' }, price: 100 },
  { id: 'burn-heal', name: '灼伤治愈药', description: '治愈灼伤。', kind: 'consumable', effect: { kind: 'cure', statusCured: 'burn', target: 'pokemon' }, price: 100 },
  { id: 'ice-heal', name: '冰冻治愈药', description: '治愈冰冻。', kind: 'consumable', effect: { kind: 'cure', statusCured: 'freeze', target: 'pokemon' }, price: 100 },
  { id: 'awakening', name: '醒醒药', description: '治愈睡眠。', kind: 'consumable', effect: { kind: 'cure', statusCured: 'sleep', target: 'pokemon' }, price: 100 },
  { id: 'full-heal', name: '万能药', description: '治愈所有异常状态。', kind: 'consumable', effect: { kind: 'cure', statusCured: 'all', target: 'pokemon' }, price: 300 },
  { id: 'poke-ball', name: '精灵球', description: '捕捉宝可梦的道具（本作捕捉必定成功）。', kind: 'ball', price: 50 },
  { id: 'great-ball', name: '超级球', description: '更精致的精灵球（外观不同）。', kind: 'ball', price: 150 },
  { id: 'ultra-ball', name: '高级球', description: '高级精灵球（外观不同）。', kind: 'ball', price: 300 },
  { id: 'exp-candy-s', name: '经验糖果S', description: '使宝可梦获得300经验。', kind: 'consumable', effect: { kind: 'exp', magnitude: 300, target: 'pokemon' }, price: 200 },
  { id: 'exp-candy-m', name: '经验糖果M', description: '使宝可梦获得1000经验。', kind: 'consumable', effect: { kind: 'exp', magnitude: 1000, target: 'pokemon' }, price: 600 },
  { id: 'exp-candy-l', name: '经验糖果L', description: '使宝可梦获得3000经验。', kind: 'consumable', effect: { kind: 'exp', magnitude: 3000, target: 'pokemon' }, price: 1500 },
  { id: 'rare-candy', name: '神奇糖果', description: '使宝可梦提升1级。', kind: 'consumable', effect: { kind: 'exp', magnitude: -1, target: 'pokemon' }, price: 2000 },
];

export const ITEM_MAP: Record<string, Item> = Object.fromEntries(
  ITEMS.map((i) => [i.id, i]),
);

/**
 * Shop stock. Healing/revive/cure items are intentionally excluded: battles
 * auto full-heal the roster afterwards (frozen design), so they have no use.
 * Balls are cosmetic (capture is always 100%) and EXP candies aid training.
 */
export const SHOP_ITEMS = ['poke-ball', 'great-ball', 'ultra-ball', 'exp-candy-s', 'exp-candy-m', 'exp-candy-l', 'rare-candy'];
