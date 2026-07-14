import type { Skill } from '@pokemon-online/shared';

/**
 * Active skills (moves). Per frozen design:
 *  - Independent cooldowns (no shared MP/PP resource).
 *  - A built-in normal attack (see engine) guarantees continuous output when
 *    every learned skill is on cooldown.
 *
 * `range`/`rangeTiles` drive the distance-based AI and movement. `castTime` is
 * an optional windup. Status/utility moves have power 0.
 */
export const SKILLS: Skill[] = [
  // ── Normal ──
  { id: 'body-slam', name: '泰山压顶', type: 'normal', category: 'physical', power: 65, accuracy: 100, cooldown: 3, range: 'melee', rangeTiles: 60, effect: { kind: 'status', target: 'enemy', status: 'paralyze', chance: 0.3 }, description: '可能使对手麻痹。' },
  { id: 'take-down', name: '舍身冲撞', type: 'normal', category: 'physical', power: 90, accuracy: 95, cooldown: 5, range: 'melee', rangeTiles: 70, description: '强力冲撞，有反作用力。' },
  { id: 'double-edge', name: '舍身一击', type: 'normal', category: 'physical', power: 120, accuracy: 100, cooldown: 7, range: 'melee', rangeTiles: 70, castTime: 0.4, description: '全力一击，反伤较多。' },
  { id: 'swift', name: '高速星星', type: 'normal', category: 'special', power: 60, accuracy: 0, cooldown: 2.5, range: 'ranged', rangeTiles: 400, priority: 1, targetMode: 'all-enemies', areaMultiplier: 0.70, description: '必中星光散射敌方全体；每个目标承受70%伤害。' },
  { id: 'hyper-beam', name: '破坏光线', type: 'normal', category: 'special', power: 150, accuracy: 90, cooldown: 10, range: 'ranged', rangeTiles: 450, castTime: 0.6, description: '强力光束，冷却很长。' },

  // ── Fire ──
  { id: 'ember', name: '火花', type: 'fire', category: 'special', power: 40, accuracy: 100, cooldown: 2.3, range: 'ranged', rangeTiles: 300, effect: { kind: 'status', target: 'enemy', status: 'burn', chance: 0.1 }, description: '小火花，可能灼伤。' },
  { id: 'flame-wheel', name: '火焰轮', type: 'fire', category: 'physical', power: 60, accuracy: 100, cooldown: 3, range: 'melee', rangeTiles: 80, effect: { kind: 'status', target: 'enemy', status: 'burn', chance: 0.1 }, description: '包裹火焰冲撞。' },
  { id: 'flamethrower', name: '喷射火焰', type: 'fire', category: 'special', power: 90, accuracy: 100, cooldown: 5, range: 'ranged', rangeTiles: 380, effect: { kind: 'status', target: 'enemy', status: 'burn', chance: 0.1 }, description: '强力火焰。' },
  { id: 'fire-blast', name: '大字爆炎', type: 'fire', category: 'special', power: 110, accuracy: 85, cooldown: 8, range: 'ranged', rangeTiles: 400, castTime: 0.5, effect: { kind: 'status', target: 'enemy', status: 'burn', chance: 0.3 }, description: '大字形火焰。' },
  { id: 'fire-fang', name: '火焰牙', type: 'fire', category: 'physical', power: 65, accuracy: 95, cooldown: 3.5, range: 'melee', rangeTiles: 60, effect: { kind: 'status', target: 'enemy', status: 'burn', chance: 0.1 }, description: '带火焰的撕咬。' },

  // ── Water ──
  { id: 'water-gun', name: '水枪', type: 'water', category: 'special', power: 40, accuracy: 100, cooldown: 2.3, range: 'ranged', rangeTiles: 300, description: '射出水柱。' },
  { id: 'bubble', name: '泡泡', type: 'water', category: 'special', power: 40, accuracy: 100, cooldown: 2, range: 'ranged', rangeTiles: 320, effect: { kind: 'debuff', target: 'enemy', stat: 'spd', stages: -1, chance: 0.3 }, description: '可能降低对手速度。' },
  { id: 'aqua-tail', name: '水之尾', type: 'water', category: 'physical', power: 80, accuracy: 90, cooldown: 4, range: 'melee', rangeTiles: 70, description: '用水之尾抽打。' },
  { id: 'surf', name: '冲浪', type: 'water', category: 'special', power: 90, accuracy: 100, cooldown: 5, range: 'ranged', rangeTiles: 350, targetMode: 'all-enemies', areaMultiplier: 0.70, description: '掀起巨浪冲击敌方全体；每个目标承受70%伤害。' },
  { id: 'hydro-pump', name: '水炮', type: 'water', category: 'special', power: 110, accuracy: 80, cooldown: 8, range: 'ranged', rangeTiles: 420, castTime: 0.5, description: '强力水炮。' },

  // ── Grass ──
  { id: 'vine-whip', name: '藤鞭', type: 'grass', category: 'physical', power: 45, accuracy: 100, cooldown: 2.4, range: 'melee', rangeTiles: 90, description: '用藤蔓抽打。' },
  { id: 'razor-leaf', name: '飞叶快刀', type: 'grass', category: 'physical', power: 55, accuracy: 95, cooldown: 2.5, range: 'ranged', rangeTiles: 300, priority: 1, effect: { kind: 'status', chance: 0.1 }, description: '锋利叶片，易击中要害。' },
  { id: 'mega-drain', name: '超级吸取', type: 'grass', category: 'special', power: 50, accuracy: 100, cooldown: 3, range: 'ranged', rangeTiles: 320, effect: { kind: 'lifesteal', magnitude: 0.5 }, description: '吸取对手生命回复自身。' },
  { id: 'petal-dance', name: '花瓣舞', type: 'grass', category: 'special', power: 100, accuracy: 100, cooldown: 7, range: 'ranged', rangeTiles: 340, castTime: 0.4, targetMode: 'all-enemies', areaMultiplier: 0.65, description: '花瓣旋风席卷敌方全体；每个目标承受65%伤害。' },
  { id: 'solar-beam', name: '日光束', type: 'grass', category: 'special', power: 120, accuracy: 100, cooldown: 9, range: 'ranged', rangeTiles: 450, castTime: 0.8, description: '蓄力后发出光束。' },

  // ── Electric ──
  { id: 'thunder-shock', name: '电击', type: 'electric', category: 'special', power: 40, accuracy: 100, cooldown: 2.3, range: 'ranged', rangeTiles: 300, effect: { kind: 'status', target: 'enemy', status: 'paralyze', chance: 0.1 }, description: '可能使对手麻痹。' },
  { id: 'spark', name: '电光', type: 'electric', category: 'physical', power: 65, accuracy: 100, cooldown: 3, range: 'melee', rangeTiles: 80, effect: { kind: 'status', target: 'enemy', status: 'paralyze', chance: 0.1 }, description: '带电冲撞。' },
  { id: 'thunderbolt', name: '十万伏特', type: 'electric', category: 'special', power: 90, accuracy: 100, cooldown: 5, range: 'ranged', rangeTiles: 380, effect: { kind: 'status', target: 'enemy', status: 'paralyze', chance: 0.1 }, description: '强力电击。' },
  { id: 'thunder', name: '打雷', type: 'electric', category: 'special', power: 110, accuracy: 70, cooldown: 8, range: 'ranged', rangeTiles: 450, castTime: 0.5, effect: { kind: 'status', target: 'enemy', status: 'paralyze', chance: 0.3 }, description: '落雷攻击。' },

  // ── Ice ──
  { id: 'powder-snow', name: '细雪', type: 'ice', category: 'special', power: 40, accuracy: 100, cooldown: 2.3, range: 'ranged', rangeTiles: 300, effect: { kind: 'status', target: 'enemy', status: 'freeze', chance: 0.1 }, description: '可能冻结对手。' },
  { id: 'ice-fang', name: '冰牙', type: 'ice', category: 'physical', power: 65, accuracy: 95, cooldown: 3.5, range: 'melee', rangeTiles: 60, effect: { kind: 'status', target: 'enemy', status: 'freeze', chance: 0.1 }, description: '冰冻撕咬。' },
  { id: 'ice-beam', name: '冰冻光束', type: 'ice', category: 'special', power: 90, accuracy: 100, cooldown: 5, range: 'ranged', rangeTiles: 380, effect: { kind: 'status', target: 'enemy', status: 'freeze', chance: 0.1 }, description: '可能冻结对手。' },
  { id: 'blizzard', name: '暴风雪', type: 'ice', category: 'special', power: 110, accuracy: 70, cooldown: 8, range: 'ranged', rangeTiles: 420, castTime: 0.5, targetMode: 'all-enemies', areaMultiplier: 0.65, effect: { kind: 'status', target: 'enemy', status: 'freeze', chance: 0.3 }, description: '猛烈暴风雪覆盖敌方全体；每个目标承受65%伤害，并可能冰冻。' },

  // ── Fighting ──
  { id: 'karate-chop', name: '空手劈', type: 'fighting', category: 'physical', power: 50, accuracy: 100, cooldown: 2.5, range: 'melee', rangeTiles: 60, priority: 1, description: '手刀劈砍。' },
  { id: 'brick-break', name: '瓦割', type: 'fighting', category: 'physical', power: 75, accuracy: 100, cooldown: 4, range: 'melee', rangeTiles: 70, description: '破坏护盾的掌击。' },
  { id: 'close-combat', name: '近身战', type: 'fighting', category: 'physical', power: 120, accuracy: 100, cooldown: 7, range: 'melee', rangeTiles: 70, castTime: 0.4, effect: { kind: 'debuff', target: 'self', stat: 'def', stages: -1, chance: 1 }, description: '猛攻但降低自身防御。' },

  // ── Poison ──
  { id: 'poison-sting', name: '毒针', type: 'poison', category: 'physical', power: 30, accuracy: 100, cooldown: 2.1, range: 'ranged', rangeTiles: 280, effect: { kind: 'status', target: 'enemy', status: 'poison', chance: 0.3 }, description: '可能使对手中毒。' },
  { id: 'sludge-bomb', name: '污泥炸弹', type: 'poison', category: 'special', power: 80, accuracy: 100, cooldown: 4, range: 'ranged', rangeTiles: 340, effect: { kind: 'status', target: 'enemy', status: 'poison', chance: 0.3 }, description: '可能使对手中毒。' },
  { id: 'toxic', name: '剧毒', type: 'poison', category: 'status', power: 0, accuracy: 90, cooldown: 6, range: 'ranged', rangeTiles: 320, effect: { kind: 'dot', target: 'enemy', status: 'poison', duration: 6, magnitude: 0.0625 }, description: '使对手中剧毒，持续掉血。' },

  // ── Ground ──
  { id: 'mud-slap', name: '泥巴攻击', type: 'ground', category: 'special', power: 40, accuracy: 100, cooldown: 2, range: 'ranged', rangeTiles: 300, description: '泼泥巴。' },
  { id: 'bone-club', name: '骨棒乱打', type: 'ground', category: 'physical', power: 65, accuracy: 85, cooldown: 3, range: 'melee', rangeTiles: 80, effect: { kind: 'stun', target: 'enemy', chance: 0.1, duration: 1 }, description: '可能使对手畏缩。' },
  { id: 'earthquake', name: '地震', type: 'ground', category: 'physical', power: 100, accuracy: 100, cooldown: 7, range: 'ranged', rangeTiles: 360, castTime: 0.4, targetMode: 'all-enemies', areaMultiplier: 0.70, description: '震动地面波及敌方全体；每个目标承受70%伤害。' },
  { id: 'dig', name: '挖洞', type: 'ground', category: 'physical', power: 80, accuracy: 100, cooldown: 5, range: 'melee', rangeTiles: 80, castTime: 0.5, description: '钻入地下再突袭。' },

  // ── Flying ──
  { id: 'wing-attack', name: '翅膀攻击', type: 'flying', category: 'physical', power: 60, accuracy: 100, cooldown: 2.5, range: 'melee', rangeTiles: 90, description: '用翅膀拍击。' },
  { id: 'drill-peck', name: '啄钻', type: 'flying', category: 'physical', power: 80, accuracy: 100, cooldown: 4, range: 'melee', rangeTiles: 80, description: '旋转喙啄击。' },
  { id: 'air-cutter', name: '空气利刃', type: 'flying', category: 'special', power: 75, accuracy: 95, cooldown: 4, range: 'ranged', rangeTiles: 340, targetMode: 'all-enemies', areaMultiplier: 0.70, effect: { kind: 'status', chance: 0.1 }, description: '风刃横扫敌方全体；每个目标承受70%伤害，且易击中要害。' },
  { id: 'brave-bird', name: '勇鸟猛击', type: 'flying', category: 'physical', power: 120, accuracy: 100, cooldown: 7, range: 'melee', rangeTiles: 100, castTime: 0.4, description: '猛烈俯冲，有反伤。' },

  // ── Psychic ──
  { id: 'confusion', name: '念力', type: 'psychic', category: 'special', power: 50, accuracy: 100, cooldown: 2.5, range: 'ranged', rangeTiles: 320, description: '念力攻击。' },
  { id: 'psybeam', name: '幻象光线', type: 'psychic', category: 'special', power: 65, accuracy: 100, cooldown: 3, range: 'ranged', rangeTiles: 340, effect: { kind: 'status', target: 'enemy', status: 'confuse', chance: 0.1 }, description: '可能使对手混乱。' },
  { id: 'psychic', name: '精神强念', type: 'psychic', category: 'special', power: 90, accuracy: 100, cooldown: 5, range: 'ranged', rangeTiles: 380, effect: { kind: 'debuff', target: 'enemy', stat: 'def', stages: -1, chance: 0.3 }, description: '强力念力，可能降低防御。' },
  { id: 'dream-eater', name: '食梦', type: 'psychic', category: 'special', power: 100, accuracy: 100, cooldown: 6, range: 'ranged', rangeTiles: 360, effect: { kind: 'lifesteal', magnitude: 0.5 }, description: '对睡眠对手有效并吸取生命。' },

  // ── Bug ──
  { id: 'bug-bite', name: '虫咬', type: 'bug', category: 'physical', power: 60, accuracy: 100, cooldown: 2, range: 'melee', rangeTiles: 60, description: '虫咬攻击。' },
  { id: 'pin-missile', name: '飞弹针', type: 'bug', category: 'physical', power: 50, accuracy: 95, cooldown: 3, range: 'ranged', rangeTiles: 300, description: '发射针刺。' },
  { id: 'x-scissor', name: '十字剪', type: 'bug', category: 'physical', power: 80, accuracy: 100, cooldown: 4, range: 'melee', rangeTiles: 70, description: '交叉剪击。' },
  { id: 'silver-wind', name: '银色旋风', type: 'bug', category: 'special', power: 60, accuracy: 100, cooldown: 4, range: 'ranged', rangeTiles: 320, effect: { kind: 'buff', target: 'self', stat: 'atk', stages: 1, chance: 0.1 }, description: '可能提升自身攻击。' },

  // ── Rock ──
  { id: 'rock-throw', name: '落石', type: 'rock', category: 'physical', power: 50, accuracy: 90, cooldown: 2.5, range: 'ranged', rangeTiles: 300, description: '投掷岩石。' },
  { id: 'rock-tomb', name: '岩石封锁', type: 'rock', category: 'physical', power: 60, accuracy: 95, cooldown: 3.5, range: 'ranged', rangeTiles: 320, effect: { kind: 'debuff', target: 'enemy', stat: 'spd', stages: -1, chance: 1 }, description: '降低对手速度。' },
  { id: 'rock-slide', name: '岩崩', type: 'rock', category: 'physical', power: 75, accuracy: 90, cooldown: 4, range: 'ranged', rangeTiles: 340, targetMode: 'all-enemies', areaMultiplier: 0.70, effect: { kind: 'stun', target: 'enemy', chance: 0.3, duration: 1 }, description: '落石轰击敌方全体；每个目标承受70%伤害，并可能畏缩。' },
  { id: 'stone-edge', name: '尖石攻击', type: 'rock', category: 'physical', power: 100, accuracy: 80, cooldown: 6, range: 'melee', rangeTiles: 80, castTime: 0.3, effect: { kind: 'status', chance: 0.15 }, description: '高要害率。' },

  // ── Ghost ──
  { id: 'lick', name: '舌舔', type: 'ghost', category: 'physical', power: 50, accuracy: 100, cooldown: 2, range: 'melee', rangeTiles: 70, effect: { kind: 'stun', target: 'enemy', chance: 0.3, duration: 1 }, description: '可能使对手麻痹。' },
  { id: 'shadow-ball', name: '暗影球', type: 'ghost', category: 'special', power: 80, accuracy: 100, cooldown: 4, range: 'ranged', rangeTiles: 360, effect: { kind: 'debuff', target: 'enemy', stat: 'def', stages: -1, chance: 0.2 }, description: '可能降低对手防御。' },
  { id: 'shadow-claw', name: '暗影爪', type: 'ghost', category: 'physical', power: 70, accuracy: 100, cooldown: 3, range: 'melee', rangeTiles: 70, effect: { kind: 'status', chance: 0.1 }, description: '易击中要害。' },

  // ── Dragon ──
  { id: 'dragon-rage', name: '龙之怒', type: 'dragon', category: 'special', power: 60, accuracy: 100, cooldown: 3, range: 'ranged', rangeTiles: 340, description: '龙之冲击波。' },
  { id: 'dragon-claw', name: '龙爪', type: 'dragon', category: 'physical', power: 80, accuracy: 100, cooldown: 4, range: 'melee', rangeTiles: 80, description: '锋利龙爪。' },
  { id: 'outrage', name: '逆鳞', type: 'dragon', category: 'physical', power: 120, accuracy: 100, cooldown: 8, range: 'melee', rangeTiles: 90, castTime: 0.4, description: '狂暴连续攻击。' },
  { id: 'draco-meteor', name: '流星群', type: 'dragon', category: 'special', power: 130, accuracy: 90, cooldown: 9, range: 'ranged', rangeTiles: 450, castTime: 0.6, effect: { kind: 'debuff', target: 'self', stat: 'atk', stages: -2, chance: 1 }, description: '强力但降低自身攻击。' },

  // ── Dark ──
  { id: 'bite', name: '咬住', type: 'dark', category: 'physical', power: 60, accuracy: 100, cooldown: 2.5, range: 'melee', rangeTiles: 60, effect: { kind: 'stun', target: 'enemy', chance: 0.3, duration: 1 }, description: '可能使对手畏缩。' },
  { id: 'crunch', name: '咬碎', type: 'dark', category: 'physical', power: 80, accuracy: 100, cooldown: 4, range: 'melee', rangeTiles: 70, effect: { kind: 'debuff', target: 'enemy', stat: 'def', stages: -1, chance: 0.2 }, description: '可能降低对手防御。' },
  { id: 'dark-pulse', name: '恶之波动', type: 'dark', category: 'special', power: 80, accuracy: 100, cooldown: 4, range: 'ranged', rangeTiles: 360, effect: { kind: 'stun', target: 'enemy', chance: 0.2, duration: 1 }, description: '可能使对手畏缩。' },

  // ── Steel ──
  { id: 'metal-claw', name: '金属爪', type: 'steel', category: 'physical', power: 70, accuracy: 95, cooldown: 3, range: 'melee', rangeTiles: 70, effect: { kind: 'buff', target: 'self', stat: 'atk', stages: 1, chance: 0.1 }, description: '可能提升自身攻击。' },
  { id: 'iron-head', name: '铁头', type: 'steel', category: 'physical', power: 90, accuracy: 100, cooldown: 5, range: 'melee', rangeTiles: 80, effect: { kind: 'stun', target: 'enemy', chance: 0.3, duration: 1 }, description: '可能使对手畏缩。' },
  { id: 'flash-cannon', name: '加农光炮', type: 'steel', category: 'special', power: 80, accuracy: 100, cooldown: 4, range: 'ranged', rangeTiles: 360, effect: { kind: 'debuff', target: 'enemy', stat: 'def', stages: -1, chance: 0.1 }, description: '可能降低对手防御。' },

  // ── Fairy ──
  { id: 'fairy-wind', name: '妖精之风', type: 'fairy', category: 'special', power: 60, accuracy: 100, cooldown: 3.2, range: 'ranged', rangeTiles: 320, description: '妖精之风攻击。' },
  { id: 'draining-kiss', name: '汲取之吻', type: 'fairy', category: 'special', power: 60, accuracy: 100, cooldown: 4, range: 'ranged', rangeTiles: 300, effect: { kind: 'lifesteal', magnitude: 0.75 }, description: '吸取生命大量回复。' },
  { id: 'moonblast', name: '月亮之力', type: 'fairy', category: 'special', power: 95, accuracy: 100, cooldown: 6, range: 'ranged', rangeTiles: 380, effect: { kind: 'debuff', target: 'enemy', stat: 'atk', stages: -1, chance: 0.3 }, description: '可能降低对手攻击。' },

  // ── Status / utility ──
  { id: 'swords-dance', name: '剑舞', type: 'normal', category: 'status', power: 0, accuracy: 0, cooldown: 8, range: 'ranged', rangeTiles: 0, effect: { kind: 'buff', target: 'self', stat: 'atk', stages: 2, chance: 1 }, description: '大幅提升攻击。' },
  { id: 'harden', name: '变硬', type: 'normal', category: 'status', power: 0, accuracy: 0, cooldown: 6, range: 'ranged', rangeTiles: 0, effect: { kind: 'buff', target: 'self', stat: 'def', stages: 1, chance: 1 }, description: '提升防御。' },
  { id: 'withdraw', name: '缩入壳中', type: 'water', category: 'status', power: 0, accuracy: 0, cooldown: 6, range: 'ranged', rangeTiles: 0, effect: { kind: 'buff', target: 'self', stat: 'def', stages: 2, chance: 1 }, description: '大幅提升防御。' },
  { id: 'agility', name: '高速移动', type: 'psychic', category: 'status', power: 0, accuracy: 0, cooldown: 7, range: 'ranged', rangeTiles: 0, effect: { kind: 'buff', target: 'self', stat: 'spd', stages: 2, chance: 1 }, description: '大幅提升速度。' },
  { id: 'growth', name: '生长', type: 'normal', category: 'status', power: 0, accuracy: 0, cooldown: 7, range: 'ranged', rangeTiles: 0, effect: { kind: 'buff', target: 'self', stat: 'atk', stages: 1, chance: 1 }, description: '提升攻击。' },
  { id: 'recover', name: '自我再生', type: 'normal', category: 'status', power: 0, accuracy: 0, cooldown: 10, range: 'ranged', rangeTiles: 0, effect: { kind: 'heal', target: 'self', magnitude: 0.5 }, description: '回复一半HP。' },
  { id: 'synthesis', name: '合成', type: 'grass', category: 'status', power: 0, accuracy: 0, cooldown: 9, range: 'ranged', rangeTiles: 0, effect: { kind: 'heal', target: 'self', magnitude: 0.4 }, description: '回复HP。' },
  { id: 'rest', name: '睡觉', type: 'psychic', category: 'status', power: 0, accuracy: 0, cooldown: 12, range: 'ranged', rangeTiles: 0, effect: { kind: 'heal', target: 'self', magnitude: 1, status: 'sleep', duration: 2 }, description: '回满HP但陷入睡眠。' },
  { id: 'sleep-powder', name: '催眠粉', type: 'grass', category: 'status', power: 0, accuracy: 75, cooldown: 6, range: 'ranged', rangeTiles: 300, effect: { kind: 'status', target: 'enemy', status: 'sleep', chance: 1, duration: 2 }, description: '使对手睡眠。' },
  { id: 'stun-spore', name: '麻痹粉', type: 'grass', category: 'status', power: 0, accuracy: 75, cooldown: 6, range: 'ranged', rangeTiles: 300, effect: { kind: 'status', target: 'enemy', status: 'paralyze', chance: 1 }, description: '使对手麻痹。' },
  { id: 'poison-powder', name: '毒粉', type: 'poison', category: 'status', power: 0, accuracy: 75, cooldown: 6, range: 'ranged', rangeTiles: 300, effect: { kind: 'status', target: 'enemy', status: 'poison', chance: 1 }, description: '使对手中毒。' },
  { id: 'hypnosis', name: '催眠术', type: 'psychic', category: 'status', power: 0, accuracy: 60, cooldown: 7, range: 'ranged', rangeTiles: 320, effect: { kind: 'status', target: 'enemy', status: 'sleep', chance: 1, duration: 2 }, description: '催眠对手。' },
  { id: 'thunder-wave', name: '电磁波', type: 'electric', category: 'status', power: 0, accuracy: 90, cooldown: 6, range: 'ranged', rangeTiles: 320, effect: { kind: 'status', target: 'enemy', status: 'paralyze', chance: 1 }, description: '使对手麻痹。' },
  { id: 'will-o-wisp', name: '鬼火', type: 'fire', category: 'status', power: 0, accuracy: 85, cooldown: 6, range: 'ranged', rangeTiles: 320, effect: { kind: 'status', target: 'enemy', status: 'burn', chance: 1 }, description: '使对手灼伤。' },
  { id: 'confuse-ray', name: '奇异光线', type: 'ghost', category: 'status', power: 0, accuracy: 100, cooldown: 6, range: 'ranged', rangeTiles: 320, effect: { kind: 'status', target: 'enemy', status: 'confuse', chance: 1, duration: 2.5 }, description: '使对手混乱。' },
  { id: 'leech-seed', name: '寄生种子', type: 'grass', category: 'status', power: 0, accuracy: 90, cooldown: 8, range: 'ranged', rangeTiles: 300, effect: { kind: 'dot', target: 'enemy', status: 'poison', duration: 6, magnitude: 0.0625 }, description: '每秒吸取对手生命。' },
  { id: 'protect', name: '守住', type: 'normal', category: 'status', power: 0, accuracy: 0, cooldown: 6, range: 'ranged', rangeTiles: 0, effect: { kind: 'shield', target: 'self', magnitude: 200, duration: 1.5 }, description: '短暂格挡伤害。' },
  { id: 'reflect', name: '反射壁', type: 'psychic', category: 'status', power: 0, accuracy: 0, cooldown: 10, range: 'ranged', rangeTiles: 0, effect: { kind: 'shield', target: 'self', magnitude: 150, duration: 6 }, description: '生成护盾减免伤害。' },

  // ── Role techniques ──
  // These are deliberately available across types. A species keeps its own
  // elemental attacks, while its battle role decides which tactical technique
  // rounds out the skill group.
  { id: 'battle-focus', name: '决胜蓄击', type: 'normal', category: 'physical', power: 100, accuracy: 90, cooldown: 7, range: 'melee', rangeTiles: 75, castTime: 0.4, description: '短暂蓄势后打出决定性一击。' },
  { id: 'relentless-strike', name: '连战猛攻', type: 'normal', category: 'physical', power: 72, accuracy: 100, cooldown: 5, range: 'melee', rangeTiles: 75, effect: { kind: 'buff', target: 'self', stat: 'atk', stages: 1 }, description: '贴身猛攻并提高自身攻击，适合持续推进。' },
  { id: 'iron-stance', name: '坚壁架势', type: 'steel', category: 'status', power: 0, accuracy: 0, cooldown: 8, range: 'ranged', rangeTiles: 0, effect: { kind: 'shield', target: 'self', magnitude: 220, duration: 4 }, description: '稳住阵脚，获得可持续的护盾。' },
  { id: 'binding-gaze', name: '束缚凝视', type: 'psychic', category: 'status', power: 0, accuracy: 90, cooldown: 7, range: 'ranged', rangeTiles: 340, effect: { kind: 'stun', target: 'enemy', duration: 0.9 }, description: '以压迫感打断目标行动。' },
  { id: 'restoring-light', name: '复苏之光', type: 'fairy', category: 'status', power: 0, accuracy: 0, cooldown: 9, range: 'ranged', rangeTiles: 0, effect: { kind: 'heal', target: 'self', magnitude: 0.28 }, description: '平复伤势，回复自身生命。' },
  { id: 'tailwind', name: '顺风', type: 'flying', category: 'status', power: 0, accuracy: 0, cooldown: 8, range: 'ranged', rangeTiles: 0, effect: { kind: 'buff', target: 'self', stat: 'spd', stages: 2 }, description: '借助风势大幅提升自身速度，拉开战斗距离。' },
  { id: 'resonance-wave', name: '共振冲击', type: 'normal', category: 'special', power: 72, accuracy: 100, cooldown: 6, range: 'ranged', rangeTiles: 360, targetMode: 'all-enemies', areaMultiplier: 0.58, description: '震荡波同时冲击敌方全体；每个目标承受58%伤害。' },
  { id: 'adaptive-guard', name: '应变守势', type: 'normal', category: 'status', power: 0, accuracy: 0, cooldown: 7, range: 'ranged', rangeTiles: 0, effect: { kind: 'buff', target: 'self', stat: 'def', stages: 1 }, description: '根据局势调整姿态，提高自身防御。' },
  { id: 'evolution-rhythm', name: '蜕变律动', type: 'dragon', category: 'status', power: 0, accuracy: 0, cooldown: 14, range: 'ranged', rangeTiles: 0, effect: { kind: 'ramp', target: 'self', stat: 'atk', stages: 1, duration: 18, interval: 5 }, description: '进入蜕变节奏：持续18秒，每5秒提升1级攻击，最多触发3次。' },
  { id: 'finishing-ray', name: '终结光束', type: 'normal', category: 'special', power: 115, accuracy: 85, cooldown: 8, range: 'ranged', rangeTiles: 420, castTime: 0.55, description: '凝聚能量后射出高威力终结光束。' },
  { id: 'pressure-point', name: '要害突击', type: 'fighting', category: 'physical', power: 88, accuracy: 95, cooldown: 6, range: 'melee', rangeTiles: 70, effect: { kind: 'buff', target: 'self', stat: 'atk', stages: 1 }, description: '瞄准破绽发动突击，并提升自身攻击。' },
  { id: 'drain-pummel', name: '汲能连拳', type: 'fighting', category: 'physical', power: 68, accuracy: 100, cooldown: 4.5, range: 'melee', rangeTiles: 70, effect: { kind: 'lifesteal', magnitude: 0.45 }, description: '连续压迫目标，吸取造成伤害的一部分回复自身。' },
  { id: 'grit-charge', name: '坚韧冲锋', type: 'normal', category: 'physical', power: 76, accuracy: 100, cooldown: 5, range: 'melee', rangeTiles: 75, effect: { kind: 'buff', target: 'self', stat: 'def', stages: 1 }, description: '顶住攻势冲锋，提升自身防御。' },
  { id: 'rooted-armor', name: '扎根甲壳', type: 'grass', category: 'status', power: 0, accuracy: 0, cooldown: 9, range: 'ranged', rangeTiles: 0, effect: { kind: 'buff', target: 'self', stat: 'def', stages: 2 }, description: '扎稳身形，大幅提高自身防御。' },
  { id: 'heavy-guard', name: '重岩壁垒', type: 'rock', category: 'status', power: 0, accuracy: 0, cooldown: 9, range: 'ranged', rangeTiles: 0, effect: { kind: 'shield', target: 'self', magnitude: 300, duration: 3.5 }, description: '凝结厚重壁垒，获得高额护盾。' },
  { id: 'chilling-snare', name: '寒意束缚', type: 'ice', category: 'special', power: 45, accuracy: 100, cooldown: 5, range: 'ranged', rangeTiles: 330, effect: { kind: 'debuff', target: 'enemy', stat: 'spd', stages: -2, chance: 1 }, description: '寒气缠住目标，显著降低其速度。' },
  { id: 'toxic-bind', name: '毒缚', type: 'poison', category: 'status', power: 0, accuracy: 90, cooldown: 7, range: 'ranged', rangeTiles: 320, effect: { kind: 'dot', target: 'enemy', status: 'poison', duration: 7, magnitude: 0.05 }, description: '以毒性束缚目标，持续造成伤害。' },
  { id: 'tide-ward', name: '潮汐守护', type: 'water', category: 'status', power: 0, accuracy: 0, cooldown: 8, range: 'ranged', rangeTiles: 0, effect: { kind: 'shield', target: 'self', magnitude: 180, duration: 5 }, description: '召来柔韧水幕，获得持续护盾。' },
  { id: 'renewal-chant', name: '新生咏唱', type: 'fairy', category: 'status', power: 0, accuracy: 0, cooldown: 10, range: 'ranged', rangeTiles: 0, effect: { kind: 'heal', target: 'self', magnitude: 0.34 }, description: '吟唱新生之歌，显著回复自身生命。' },
  { id: 'feint-star', name: '虚星弹', type: 'normal', category: 'special', power: 58, accuracy: 0, cooldown: 3, range: 'ranged', rangeTiles: 420, priority: 1, description: '发射难以捕捉的星光弹，从远距离抢占先机。' },
  { id: 'slipstream-dart', name: '流风飞矢', type: 'flying', category: 'special', power: 66, accuracy: 100, cooldown: 4, range: 'ranged', rangeTiles: 410, effect: { kind: 'buff', target: 'self', stat: 'spd', stages: 1 }, description: '借风势射出疾风飞矢，并提升自身速度。' },
  { id: 'ember-ring', name: '焰环震荡', type: 'fire', category: 'special', power: 70, accuracy: 100, cooldown: 6, range: 'ranged', rangeTiles: 350, targetMode: 'all-enemies', areaMultiplier: 0.6, effect: { kind: 'status', target: 'enemy', status: 'burn', chance: 0.15 }, description: '扩散火焰震荡敌方全体，每个目标承受60%伤害。' },
  { id: 'shock-field', name: '电场脉冲', type: 'electric', category: 'special', power: 68, accuracy: 100, cooldown: 6, range: 'ranged', rangeTiles: 360, targetMode: 'all-enemies', areaMultiplier: 0.6, effect: { kind: 'status', target: 'enemy', status: 'paralyze', chance: 0.15 }, description: '电场脉冲冲击敌方全体，每个目标承受60%伤害。' },
  { id: 'steady-strike', name: '沉着一击', type: 'normal', category: 'physical', power: 70, accuracy: 100, cooldown: 4.5, range: 'melee', rangeTiles: 75, effect: { kind: 'buff', target: 'self', stat: 'atk', stages: 1 }, description: '稳步进攻，在造成伤害后提升自身攻击。' },
  { id: 'measured-wave', name: '衡势波', type: 'psychic', category: 'special', power: 62, accuracy: 100, cooldown: 5.5, range: 'ranged', rangeTiles: 350, targetMode: 'all-enemies', areaMultiplier: 0.55, description: '释放均衡念波压制敌方全体；每个目标承受55%伤害。' },
  { id: 'shell-molt', name: '甲壳蜕变', type: 'bug', category: 'status', power: 0, accuracy: 0, cooldown: 14, range: 'ranged', rangeTiles: 0, effect: { kind: 'ramp', target: 'self', stat: 'def', stages: 1, duration: 18, interval: 5 }, description: '进入甲壳蜕变：持续18秒，每5秒提升1级防御，最多触发3次。' },
  { id: 'quickening-cycle', name: '疾行循环', type: 'electric', category: 'status', power: 0, accuracy: 0, cooldown: 14, range: 'ranged', rangeTiles: 0, effect: { kind: 'ramp', target: 'self', stat: 'spd', stages: 1, duration: 18, interval: 5 }, description: '进入疾行循环：持续18秒，每5秒提升1级速度，最多触发3次。' },

  // ── First-wave species signature skills ──
  { id: 'verdant-snare', name: '花海缠绕', type: 'grass', category: 'special', power: 70, accuracy: 95, cooldown: 6, range: 'ranged', rangeTiles: 340, effect: { kind: 'dot', target: 'enemy', status: 'poison', duration: 4, magnitude: 0.04 }, description: '妙蛙花的花海束缚目标，造成伤害并附加持续吸取。' },
  { id: 'blazing-dive', name: '炽焰俯冲', type: 'fire', category: 'physical', power: 110, accuracy: 90, cooldown: 8, range: 'melee', rangeTiles: 90, castTime: 0.5, effect: { kind: 'status', target: 'enemy', status: 'burn', chance: 0.5 }, description: '喷火龙短暂蓄力后从空中俯冲，造成高额火焰伤害。' },
  { id: 'fortress-cannon', name: '要塞水炮', type: 'water', category: 'special', power: 85, accuracy: 95, cooldown: 6, range: 'ranged', rangeTiles: 420, effect: { kind: 'debuff', target: 'enemy', stat: 'spd', stages: -1, chance: 0.5 }, description: '水箭龟以重炮水流压制目标，并可能降低其速度。' },
  { id: 'volt-chain', name: '伏特连锁', type: 'electric', category: 'special', power: 70, accuracy: 100, cooldown: 6, range: 'ranged', rangeTiles: 360, targetMode: 'all-enemies', areaMultiplier: 0.58, effect: { kind: 'status', target: 'enemy', status: 'paralyze', chance: 0.2 }, description: '皮卡丘放出弹跳电弧攻击敌方全体，每个目标承受58%伤害。' },
  { id: 'mind-lock', name: '念力封锁', type: 'psychic', category: 'special', power: 60, accuracy: 95, cooldown: 5, range: 'ranged', rangeTiles: 360, effect: { kind: 'stun', target: 'enemy', duration: 0.7, chance: 0.35 }, description: '胡地用念力束缚目标，造成伤害并有概率打断行动。' },
  { id: 'shadow-trap', name: '暗影禁锢', type: 'ghost', category: 'special', power: 70, accuracy: 90, cooldown: 6, range: 'ranged', rangeTiles: 340, effect: { kind: 'status', target: 'enemy', status: 'sleep', duration: 1.5, chance: 0.3 }, description: '耿鬼以暗影侵蚀目标，造成伤害并有概率使其短暂沉睡。' },
  { id: 'earth-shatter', name: '裂地重击', type: 'ground', category: 'physical', power: 85, accuracy: 95, cooldown: 7, range: 'ranged', rangeTiles: 260, targetMode: 'all-enemies', areaMultiplier: 0.60, effect: { kind: 'stun', target: 'enemy', duration: 0.55, chance: 0.2 }, description: '钻角犀兽震裂地面冲击敌方全体，每个目标承受60%伤害。' },
  { id: 'tidal-aegis', name: '潮汐庇护', type: 'water', category: 'status', power: 0, accuracy: 0, cooldown: 9, range: 'ranged', rangeTiles: 0, effect: { kind: 'shield', target: 'self', magnitude: 260, duration: 4 }, description: '拉普拉斯唤起潮汐护甲，获得持续护盾。' },
  { id: 'heavy-slam', name: '巨躯压制', type: 'normal', category: 'physical', power: 95, accuracy: 95, cooldown: 6, range: 'melee', rangeTiles: 75, effect: { kind: 'stun', target: 'enemy', duration: 0.8, chance: 0.35 }, description: '卡比兽以沉重身躯压制敌人，造成伤害并有概率使其畏缩。' },
  { id: 'dragon-surge', name: '龙舞突袭', type: 'dragon', category: 'physical', power: 105, accuracy: 90, cooldown: 8, range: 'melee', rangeTiles: 90, castTime: 0.45, effect: { kind: 'buff', target: 'self', stat: 'atk', stages: 1, chance: 1 }, description: '快龙凝聚龙之力突进，造成高额伤害并提升自身攻击。' },
  { id: 'psyonic-annihilation', name: '精神湮灭', type: 'psychic', category: 'special', power: 125, accuracy: 90, cooldown: 10, range: 'ranged', rangeTiles: 430, castTime: 0.7, targetMode: 'all-enemies', areaMultiplier: 0.56, description: '超梦蓄力释放毁灭性精神波，攻击敌方全体。' },
  { id: 'genesis-pulse', name: '创生脉冲', type: 'psychic', category: 'status', power: 0, accuracy: 0, cooldown: 10, range: 'ranged', rangeTiles: 0, effect: { kind: 'heal', target: 'self', magnitude: 0.38 }, description: '梦幻释放创生能量，大幅回复自身生命。' },
];

export const SKILL_MAP: Record<string, Skill> = Object.fromEntries(
  SKILLS.map((s) => [s.id, s]),
);

/** A safe weak normal attack guaranteed available to every combatant. */
export const NORMAL_ATTACK: Skill = {
  id: '__normal__',
  name: '普通攻击',
  type: 'normal',
  category: 'physical',
  power: 28,
  accuracy: 100,
  cooldown: 1.35,
  range: 'melee',
  rangeTiles: 70,
  description: '快速稳定的基础攻击，不受属性克制影响，保证技能空档仍有可靠输出。',
};

/** Moves a species of a given primary type tends to learn (for learnset gen). */
export const TYPE_LEARNSET: Record<string, string[]> = {
  normal: ['swift', 'body-slam', 'take-down', 'double-edge', 'swords-dance', 'hyper-beam'],
  fire: ['ember', 'flame-wheel', 'fire-fang', 'flamethrower', 'fire-blast'],
  water: ['water-gun', 'bubble', 'aqua-tail', 'surf', 'hydro-pump', 'withdraw'],
  grass: ['vine-whip', 'razor-leaf', 'mega-drain', 'petal-dance', 'solar-beam', 'sleep-powder', 'leech-seed', 'synthesis'],
  electric: ['thunder-shock', 'spark', 'thunderbolt', 'thunder', 'thunder-wave'],
  ice: ['powder-snow', 'ice-fang', 'ice-beam', 'blizzard'],
  fighting: ['karate-chop', 'brick-break', 'close-combat'],
  poison: ['poison-sting', 'sludge-bomb', 'toxic', 'poison-powder'],
  ground: ['mud-slap', 'bone-club', 'dig', 'earthquake'],
  flying: ['wing-attack', 'drill-peck', 'air-cutter', 'brave-bird'],
  psychic: ['confusion', 'psybeam', 'psychic', 'dream-eater', 'agility', 'hypnosis', 'reflect', 'rest'],
  bug: ['bug-bite', 'pin-missile', 'x-scissor', 'silver-wind'],
  rock: ['rock-throw', 'rock-tomb', 'rock-slide', 'stone-edge'],
  ghost: ['lick', 'shadow-ball', 'shadow-claw', 'confuse-ray'],
  dragon: ['dragon-rage', 'dragon-claw', 'outrage', 'draco-meteor'],
  dark: ['bite', 'crunch', 'dark-pulse'],
  steel: ['metal-claw', 'iron-head', 'flash-cannon'],
  fairy: ['fairy-wind', 'draining-kiss', 'moonblast'],
};
