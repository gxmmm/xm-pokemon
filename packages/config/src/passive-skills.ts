import type { PassiveSkill, TypeName } from '@pokemon-online/shared';

/**
 * Passive skills - 梦幻西游-style passives inherited through breeding with a
 * multi-skill cap (PASSIVE_SKILL_MAX). They modify stats/elements rather than
 * being actively cast. Tier drives pool selection during breeding.
 */
const MISSING_ELEMENTAL_PASSIVES: PassiveSkill[] = (
  [
    ['normal', '常之力', '常之抗'], ['ice', '冰之力', '冰之抗'],
    ['fighting', '斗之力', '斗之抗'], ['poison', '毒之力', '毒之抗'],
    ['ground', '地之力', '地之抗'], ['flying', '风之力', '风之抗'],
    ['psychic', '念之力', '念之抗'], ['bug', '虫之力', '虫之抗'],
    ['rock', '岩之力', '岩之抗'], ['ghost', '灵之力', '灵之抗'],
    ['dragon', '龙之力', '龙之抗'], ['dark', '暗之力', '暗之抗'],
    ['steel', '钢之力', '钢之抗'], ['fairy', '妖精之力', '妖精之抗'],
  ] as const satisfies readonly (readonly [TypeName, string, string])[]
).flatMap(([type, boostName, resistName]) => [
  { id: `p-${type}power`, name: boostName, description: `${boostName}：${type}属性招式威力 +15%。`, tier: 2, effect: { kind: 'typeBoost', type, mult: 1.15 } },
  { id: `p-${type}res`, name: resistName, description: `${resistName}：受到${type}属性伤害 -20%。`, tier: 2, effect: { kind: 'typeResist', type, mult: 0.8 } },
] satisfies PassiveSkill[]);

export const PASSIVE_SKILLS: PassiveSkill[] = [
  // tier 1 - stat passives
  { id: 'p-strong', name: '强壮', description: '生命上限 +8%。', tier: 1, effect: { kind: 'stat', stat: 'hp', mult: 1.08 } },
  { id: 'p-power', name: '力量', description: '攻击 +8%。', tier: 1, effect: { kind: 'stat', stat: 'atk', mult: 1.08 } },
  { id: 'p-iron', name: '铁壁', description: '防御 +8%。', tier: 1, effect: { kind: 'stat', stat: 'def', mult: 1.08 } },
  { id: 'p-swift', name: '神速', description: '速度 +8%。', tier: 1, effect: { kind: 'stat', stat: 'spd', mult: 1.08 } },
  // tier 2 - element / utility
  { id: 'p-firepower', name: '炎之力', description: '火属性招式威力 +15%。', tier: 2, effect: { kind: 'typeBoost', type: 'fire', mult: 1.15 } },
  { id: 'p-aquapower', name: '水之力', description: '水属性招式威力 +15%。', tier: 2, effect: { kind: 'typeBoost', type: 'water', mult: 1.15 } },
  { id: 'p-leafpower', name: '叶之力', description: '草属性招式威力 +15%。', tier: 2, effect: { kind: 'typeBoost', type: 'grass', mult: 1.15 } },
  { id: 'p-thunderpower', name: '雷之力', description: '电之力：电属性招式威力 +15%。', tier: 2, effect: { kind: 'typeBoost', type: 'electric', mult: 1.15 } },
  { id: 'p-fireres', name: '炎之抗', description: '受到火属性伤害 -20%。', tier: 2, effect: { kind: 'typeResist', type: 'fire', mult: 0.8 } },
  { id: 'p-waterres', name: '水之抗', description: '受到水属性伤害 -20%。', tier: 2, effect: { kind: 'typeResist', type: 'water', mult: 0.8 } },
  ...MISSING_ELEMENTAL_PASSIVES,
  { id: 'p-crit', name: '锐利', description: '要害率 +10%。', tier: 2, effect: { kind: 'crit', mult: 1.1, chance: 0.1 } },
  { id: 'p-cdr', name: '灵巧', description: '技能冷却速度 +12%。', tier: 2, effect: { kind: 'cdReduction', mult: 0.88 } },
  { id: 'p-regen', name: '回复', description: '每秒回复少量生命。', tier: 2, effect: { kind: 'hpRegen', magnitude: 0.01 } },
  { id: 'p-lifesteal', name: '吸血', description: '造成伤害的6%转化为生命。', tier: 2, effect: { kind: 'lifesteal', mult: 0.06 } },
  { id: 'p-evasion', name: '闪避', description: '闪避率 +8%。', tier: 2, effect: { kind: 'evasion', chance: 0.08 } },
  // tier 3 - powerful
  { id: 'p-might', name: '蛮力', description: '攻击 +16%，但速度 -5%。', tier: 3, effect: { kind: 'stat', stat: 'atk', mult: 1.16 } },
  { id: 'p-fortress', name: '要塞', description: '防御 +16%。', tier: 3, effect: { kind: 'stat', stat: 'def', mult: 1.16 } },
  { id: 'p-vitality', name: '生机', description: '生命上限 +16%。', tier: 3, effect: { kind: 'stat', stat: 'hp', mult: 1.16 } },
  { id: 'p-omnielement', name: '万灵', description: '所有属性招式威力 +10%。', tier: 3, effect: { kind: 'typeBoost', mult: 1.1 } },
  { id: 'p-adapt', name: '适应', description: '同属性招式威力 +20%。', tier: 3, effect: { kind: 'typeBoost', mult: 1.2 } },
];

export const PASSIVE_MAP: Record<string, PassiveSkill> = Object.fromEntries(
  PASSIVE_SKILLS.map((p) => [p.id, p]),
);

/** Display label for each passive tier (低/中/高 级). Drives tooltip + color legend. */
export const PASSIVE_TIER_LABEL: Record<number, string> = { 1: '初级', 2: '中级', 3: '高级' };

/** Passives available to a given type pool (for species passivePool generation). */
export const TYPE_PASSIVE_POOL: Record<string, string[]> = {
  normal: ['p-strong', 'p-power', 'p-swift', 'p-iron', 'p-normalpower', 'p-normalres'],
  fire: ['p-power', 'p-firepower', 'p-fireres', 'p-crit', 'p-might'],
  water: ['p-strong', 'p-aquapower', 'p-waterres', 'p-regen', 'p-vitality'],
  grass: ['p-strong', 'p-leafpower', 'p-regen', 'p-lifesteal', 'p-vitality'],
  electric: ['p-swift', 'p-thunderpower', 'p-electricres', 'p-crit', 'p-cdr', 'p-might'],
  ice: ['p-iron', 'p-icepower', 'p-iceres', 'p-crit', 'p-fortress'],
  fighting: ['p-power', 'p-fightingpower', 'p-fightingres', 'p-might', 'p-crit', 'p-lifesteal'],
  poison: ['p-poisonpower', 'p-poisonres', 'p-lifesteal', 'p-regen', 'p-iron'],
  ground: ['p-groundpower', 'p-groundres', 'p-iron', 'p-fortress', 'p-power'],
  flying: ['p-flyingpower', 'p-flyingres', 'p-swift', 'p-crit', 'p-cdr'],
  psychic: ['p-psychicpower', 'p-psychicres', 'p-cdr', 'p-crit', 'p-regen', 'p-adapt'],
  bug: ['p-bugpower', 'p-bugres', 'p-swift', 'p-lifesteal', 'p-cdr'],
  rock: ['p-rockpower', 'p-rockres', 'p-iron', 'p-fortress', 'p-strong'],
  ghost: ['p-ghostpower', 'p-ghostres', 'p-lifesteal', 'p-evasion', 'p-cdr', 'p-adapt'],
  dragon: ['p-dragonpower', 'p-dragonres', 'p-might', 'p-fortress', 'p-vitality', 'p-omnielement', 'p-adapt'],
  dark: ['p-darkpower', 'p-darkres', 'p-crit', 'p-lifesteal', 'p-evasion'],
  steel: ['p-steelpower', 'p-steelres', 'p-iron', 'p-fortress', 'p-strong', 'p-vitality'],
  fairy: ['p-fairypower', 'p-fairyres', 'p-regen', 'p-vitality', 'p-adapt'],
};

/** Generic pool every species can roll from. */
export const GENERIC_PASSIVE_POOL = ['p-strong', 'p-power', 'p-iron', 'p-swift', 'p-crit', 'p-regen', 'p-lifesteal', 'p-cdr'];
