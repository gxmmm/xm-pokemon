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
  { id: 'tackle', name: '撞击', type: 'normal', category: 'physical', power: 35, accuracy: 100, cooldown: 0.8, range: 'melee', rangeTiles: 60, description: '基础近身冲撞。' },
  { id: 'body-slam', name: '泰山压顶', type: 'normal', category: 'physical', power: 65, accuracy: 100, cooldown: 3, range: 'melee', rangeTiles: 60, effect: { kind: 'status', target: 'enemy', status: 'paralyze', chance: 0.3 }, description: '可能使对手麻痹。' },
  { id: 'take-down', name: '舍身冲撞', type: 'normal', category: 'physical', power: 90, accuracy: 95, cooldown: 5, range: 'melee', rangeTiles: 70, description: '强力冲撞，有反作用力。' },
  { id: 'double-edge', name: '舍身一击', type: 'normal', category: 'physical', power: 120, accuracy: 100, cooldown: 7, range: 'melee', rangeTiles: 70, description: '全力一击，反伤较多。' },
  { id: 'swift', name: '高速星星', type: 'normal', category: 'special', power: 60, accuracy: 0, cooldown: 2.5, range: 'ranged', rangeTiles: 400, priority: 1, description: '必定命中。' },
  { id: 'hyper-beam', name: '破坏光线', type: 'normal', category: 'special', power: 150, accuracy: 90, cooldown: 10, range: 'ranged', rangeTiles: 450, castTime: 0.6, description: '强力光束，冷却很长。' },

  // ── Fire ──
  { id: 'ember', name: '火花', type: 'fire', category: 'special', power: 40, accuracy: 100, cooldown: 1.2, range: 'ranged', rangeTiles: 300, effect: { kind: 'status', target: 'enemy', status: 'burn', chance: 0.1 }, description: '小火花，可能灼伤。' },
  { id: 'flame-wheel', name: '火焰轮', type: 'fire', category: 'physical', power: 60, accuracy: 100, cooldown: 3, range: 'melee', rangeTiles: 80, effect: { kind: 'status', target: 'enemy', status: 'burn', chance: 0.1 }, description: '包裹火焰冲撞。' },
  { id: 'flamethrower', name: '喷射火焰', type: 'fire', category: 'special', power: 90, accuracy: 100, cooldown: 5, range: 'ranged', rangeTiles: 380, effect: { kind: 'status', target: 'enemy', status: 'burn', chance: 0.1 }, description: '强力火焰。' },
  { id: 'fire-blast', name: '大字爆炎', type: 'fire', category: 'special', power: 110, accuracy: 85, cooldown: 8, range: 'ranged', rangeTiles: 400, effect: { kind: 'status', target: 'enemy', status: 'burn', chance: 0.3 }, description: '大字形火焰。' },
  { id: 'fire-fang', name: '火焰牙', type: 'fire', category: 'physical', power: 65, accuracy: 95, cooldown: 3.5, range: 'melee', rangeTiles: 60, effect: { kind: 'status', target: 'enemy', status: 'burn', chance: 0.1 }, description: '带火焰的撕咬。' },

  // ── Water ──
  { id: 'water-gun', name: '水枪', type: 'water', category: 'special', power: 40, accuracy: 100, cooldown: 1.2, range: 'ranged', rangeTiles: 300, description: '射出水柱。' },
  { id: 'bubble', name: '泡泡', type: 'water', category: 'special', power: 40, accuracy: 100, cooldown: 2, range: 'ranged', rangeTiles: 320, effect: { kind: 'debuff', target: 'enemy', stat: 'spd', stages: -1, chance: 0.3 }, description: '可能降低对手速度。' },
  { id: 'aqua-tail', name: '水之尾', type: 'water', category: 'physical', power: 80, accuracy: 90, cooldown: 4, range: 'melee', rangeTiles: 70, description: '用水之尾抽打。' },
  { id: 'surf', name: '冲浪', type: 'water', category: 'special', power: 90, accuracy: 100, cooldown: 5, range: 'ranged', rangeTiles: 350, description: '掀起巨浪。' },
  { id: 'hydro-pump', name: '水炮', type: 'water', category: 'special', power: 110, accuracy: 80, cooldown: 8, range: 'ranged', rangeTiles: 420, description: '强力水炮。' },

  // ── Grass ──
  { id: 'vine-whip', name: '藤鞭', type: 'grass', category: 'physical', power: 45, accuracy: 100, cooldown: 1.3, range: 'melee', rangeTiles: 90, description: '用藤蔓抽打。' },
  { id: 'razor-leaf', name: '飞叶快刀', type: 'grass', category: 'physical', power: 55, accuracy: 95, cooldown: 2.5, range: 'ranged', rangeTiles: 300, priority: 1, effect: { kind: 'status', chance: 0.1 }, description: '锋利叶片，易击中要害。' },
  { id: 'mega-drain', name: '超级吸取', type: 'grass', category: 'special', power: 50, accuracy: 100, cooldown: 3, range: 'ranged', rangeTiles: 320, effect: { kind: 'lifesteal', magnitude: 0.5 }, description: '吸取对手生命回复自身。' },
  { id: 'petal-dance', name: '花瓣舞', type: 'grass', category: 'special', power: 100, accuracy: 100, cooldown: 7, range: 'ranged', rangeTiles: 340, description: '花瓣旋风攻击。' },
  { id: 'solar-beam', name: '日光束', type: 'grass', category: 'special', power: 120, accuracy: 100, cooldown: 9, range: 'ranged', rangeTiles: 450, castTime: 0.8, description: '蓄力后发出光束。' },

  // ── Electric ──
  { id: 'thunder-shock', name: '电击', type: 'electric', category: 'special', power: 40, accuracy: 100, cooldown: 1.2, range: 'ranged', rangeTiles: 300, effect: { kind: 'status', target: 'enemy', status: 'paralyze', chance: 0.1 }, description: '可能使对手麻痹。' },
  { id: 'spark', name: '电光', type: 'electric', category: 'physical', power: 65, accuracy: 100, cooldown: 3, range: 'melee', rangeTiles: 80, effect: { kind: 'status', target: 'enemy', status: 'paralyze', chance: 0.1 }, description: '带电冲撞。' },
  { id: 'thunderbolt', name: '十万伏特', type: 'electric', category: 'special', power: 90, accuracy: 100, cooldown: 5, range: 'ranged', rangeTiles: 380, effect: { kind: 'status', target: 'enemy', status: 'paralyze', chance: 0.1 }, description: '强力电击。' },
  { id: 'thunder', name: '打雷', type: 'electric', category: 'special', power: 110, accuracy: 70, cooldown: 8, range: 'ranged', rangeTiles: 450, effect: { kind: 'status', target: 'enemy', status: 'paralyze', chance: 0.3 }, description: '落雷攻击。' },

  // ── Ice ──
  { id: 'powder-snow', name: '细雪', type: 'ice', category: 'special', power: 40, accuracy: 100, cooldown: 1.5, range: 'ranged', rangeTiles: 300, effect: { kind: 'status', target: 'enemy', status: 'freeze', chance: 0.1 }, description: '可能冻结对手。' },
  { id: 'ice-fang', name: '冰牙', type: 'ice', category: 'physical', power: 65, accuracy: 95, cooldown: 3.5, range: 'melee', rangeTiles: 60, effect: { kind: 'status', target: 'enemy', status: 'freeze', chance: 0.1 }, description: '冰冻撕咬。' },
  { id: 'ice-beam', name: '冰冻光束', type: 'ice', category: 'special', power: 90, accuracy: 100, cooldown: 5, range: 'ranged', rangeTiles: 380, effect: { kind: 'status', target: 'enemy', status: 'freeze', chance: 0.1 }, description: '可能冻结对手。' },
  { id: 'blizzard', name: '暴风雪', type: 'ice', category: 'special', power: 110, accuracy: 70, cooldown: 8, range: 'ranged', rangeTiles: 420, effect: { kind: 'status', target: 'enemy', status: 'freeze', chance: 0.3 }, description: '猛烈暴风雪。' },

  // ── Fighting ──
  { id: 'karate-chop', name: '空手劈', type: 'fighting', category: 'physical', power: 50, accuracy: 100, cooldown: 1.5, range: 'melee', rangeTiles: 60, priority: 1, description: '手刀劈砍。' },
  { id: 'brick-break', name: '瓦割', type: 'fighting', category: 'physical', power: 75, accuracy: 100, cooldown: 4, range: 'melee', rangeTiles: 70, description: '破坏护盾的掌击。' },
  { id: 'close-combat', name: '近身战', type: 'fighting', category: 'physical', power: 120, accuracy: 100, cooldown: 7, range: 'melee', rangeTiles: 70, effect: { kind: 'debuff', target: 'self', stat: 'def', stages: -1, chance: 1 }, description: '猛攻但降低自身防御。' },

  // ── Poison ──
  { id: 'poison-sting', name: '毒针', type: 'poison', category: 'physical', power: 30, accuracy: 100, cooldown: 1, range: 'ranged', rangeTiles: 280, effect: { kind: 'status', target: 'enemy', status: 'poison', chance: 0.3 }, description: '可能使对手中毒。' },
  { id: 'sludge-bomb', name: '污泥炸弹', type: 'poison', category: 'special', power: 80, accuracy: 100, cooldown: 4, range: 'ranged', rangeTiles: 340, effect: { kind: 'status', target: 'enemy', status: 'poison', chance: 0.3 }, description: '可能使对手中毒。' },
  { id: 'toxic', name: '剧毒', type: 'poison', category: 'status', power: 0, accuracy: 90, cooldown: 6, range: 'ranged', rangeTiles: 320, effect: { kind: 'dot', target: 'enemy', status: 'poison', duration: 12, magnitude: 0.0625 }, description: '使对手中剧毒，持续掉血。' },

  // ── Ground ──
  { id: 'mud-slap', name: '泥巴攻击', type: 'ground', category: 'special', power: 40, accuracy: 100, cooldown: 2, range: 'ranged', rangeTiles: 300, description: '泼泥巴。' },
  { id: 'bone-club', name: '骨棒乱打', type: 'ground', category: 'physical', power: 65, accuracy: 85, cooldown: 3, range: 'melee', rangeTiles: 80, effect: { kind: 'stun', target: 'enemy', chance: 0.1, duration: 1 }, description: '可能使对手畏缩。' },
  { id: 'earthquake', name: '地震', type: 'ground', category: 'physical', power: 100, accuracy: 100, cooldown: 7, range: 'ranged', rangeTiles: 360, description: '大范围地震。' },
  { id: 'dig', name: '挖洞', type: 'ground', category: 'physical', power: 80, accuracy: 100, cooldown: 5, range: 'melee', rangeTiles: 80, castTime: 0.5, description: '钻入地下再突袭。' },

  // ── Flying ──
  { id: 'wing-attack', name: '翅膀攻击', type: 'flying', category: 'physical', power: 60, accuracy: 100, cooldown: 2.5, range: 'melee', rangeTiles: 90, description: '用翅膀拍击。' },
  { id: 'drill-peck', name: '啄钻', type: 'flying', category: 'physical', power: 80, accuracy: 100, cooldown: 4, range: 'melee', rangeTiles: 80, description: '旋转喙啄击。' },
  { id: 'air-cutter', name: '空气利刃', type: 'flying', category: 'special', power: 75, accuracy: 95, cooldown: 4, range: 'ranged', rangeTiles: 340, effect: { kind: 'status', chance: 0.1 }, description: '锋利风刃，易击中要害。' },
  { id: 'brave-bird', name: '勇鸟猛击', type: 'flying', category: 'physical', power: 120, accuracy: 100, cooldown: 7, range: 'melee', rangeTiles: 100, description: '猛烈俯冲，有反伤。' },

  // ── Psychic ──
  { id: 'confusion', name: '念力', type: 'psychic', category: 'special', power: 50, accuracy: 100, cooldown: 1.5, range: 'ranged', rangeTiles: 320, description: '念力攻击。' },
  { id: 'psybeam', name: '幻象光线', type: 'psychic', category: 'special', power: 65, accuracy: 100, cooldown: 3, range: 'ranged', rangeTiles: 340, effect: { kind: 'status', target: 'enemy', status: 'confuse', chance: 0.1 }, description: '可能使对手混乱。' },
  { id: 'psychic', name: '精神强念', type: 'psychic', category: 'special', power: 90, accuracy: 100, cooldown: 5, range: 'ranged', rangeTiles: 380, effect: { kind: 'debuff', target: 'enemy', stat: 'def', stages: -1, chance: 0.3 }, description: '强力念力，可能降低防御。' },
  { id: 'dream-eater', name: '食梦', type: 'psychic', category: 'special', power: 100, accuracy: 100, cooldown: 6, range: 'ranged', rangeTiles: 360, effect: { kind: 'lifesteal', magnitude: 0.5 }, description: '对睡眠对手有效并吸取生命。' },

  // ── Bug ──
  { id: 'bug-bite', name: '虫咬', type: 'bug', category: 'physical', power: 60, accuracy: 100, cooldown: 2, range: 'melee', rangeTiles: 60, description: '虫咬攻击。' },
  { id: 'pin-missile', name: '飞弹针', type: 'bug', category: 'physical', power: 50, accuracy: 95, cooldown: 3, range: 'ranged', rangeTiles: 300, description: '发射针刺。' },
  { id: 'x-scissor', name: '十字剪', type: 'bug', category: 'physical', power: 80, accuracy: 100, cooldown: 4, range: 'melee', rangeTiles: 70, description: '交叉剪击。' },
  { id: 'silver-wind', name: '银色旋风', type: 'bug', category: 'special', power: 60, accuracy: 100, cooldown: 4, range: 'ranged', rangeTiles: 320, effect: { kind: 'buff', target: 'self', stat: 'atk', stages: 1, chance: 0.1 }, description: '可能提升自身攻击。' },

  // ── Rock ──
  { id: 'rock-throw', name: '落石', type: 'rock', category: 'physical', power: 50, accuracy: 90, cooldown: 2, range: 'ranged', rangeTiles: 300, description: '投掷岩石。' },
  { id: 'rock-tomb', name: '岩石封锁', type: 'rock', category: 'physical', power: 60, accuracy: 95, cooldown: 3.5, range: 'ranged', rangeTiles: 320, effect: { kind: 'debuff', target: 'enemy', stat: 'spd', stages: -1, chance: 1 }, description: '降低对手速度。' },
  { id: 'rock-slide', name: '岩崩', type: 'rock', category: 'physical', power: 75, accuracy: 90, cooldown: 4, range: 'ranged', rangeTiles: 340, effect: { kind: 'stun', target: 'enemy', chance: 0.3, duration: 1 }, description: '可能使对手畏缩。' },
  { id: 'stone-edge', name: '尖石攻击', type: 'rock', category: 'physical', power: 100, accuracy: 80, cooldown: 6, range: 'melee', rangeTiles: 80, effect: { kind: 'status', chance: 0.15 }, description: '高要害率。' },

  // ── Ghost ──
  { id: 'lick', name: '舌舔', type: 'ghost', category: 'physical', power: 50, accuracy: 100, cooldown: 2, range: 'melee', rangeTiles: 70, effect: { kind: 'stun', target: 'enemy', chance: 0.3, duration: 1 }, description: '可能使对手麻痹。' },
  { id: 'shadow-ball', name: '暗影球', type: 'ghost', category: 'special', power: 80, accuracy: 100, cooldown: 4, range: 'ranged', rangeTiles: 360, effect: { kind: 'debuff', target: 'enemy', stat: 'def', stages: -1, chance: 0.2 }, description: '可能降低对手防御。' },
  { id: 'shadow-claw', name: '暗影爪', type: 'ghost', category: 'physical', power: 70, accuracy: 100, cooldown: 3, range: 'melee', rangeTiles: 70, effect: { kind: 'status', chance: 0.1 }, description: '易击中要害。' },

  // ── Dragon ──
  { id: 'dragon-rage', name: '龙之怒', type: 'dragon', category: 'special', power: 60, accuracy: 100, cooldown: 3, range: 'ranged', rangeTiles: 340, description: '龙之冲击波。' },
  { id: 'dragon-claw', name: '龙爪', type: 'dragon', category: 'physical', power: 80, accuracy: 100, cooldown: 4, range: 'melee', rangeTiles: 80, description: '锋利龙爪。' },
  { id: 'outrage', name: '逆鳞', type: 'dragon', category: 'physical', power: 120, accuracy: 100, cooldown: 8, range: 'melee', rangeTiles: 90, description: '狂暴连续攻击。' },
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
  { id: 'fairy-wind', name: '妖精之风', type: 'fairy', category: 'special', power: 60, accuracy: 100, cooldown: 2.5, range: 'ranged', rangeTiles: 320, description: '妖精之风攻击。' },
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
  { id: 'sleep-powder', name: '催眠粉', type: 'grass', category: 'status', power: 0, accuracy: 75, cooldown: 6, range: 'ranged', rangeTiles: 300, effect: { kind: 'status', target: 'enemy', status: 'sleep', chance: 1, duration: 3 }, description: '使对手睡眠。' },
  { id: 'stun-spore', name: '麻痹粉', type: 'grass', category: 'status', power: 0, accuracy: 75, cooldown: 6, range: 'ranged', rangeTiles: 300, effect: { kind: 'status', target: 'enemy', status: 'paralyze', chance: 1 }, description: '使对手麻痹。' },
  { id: 'poison-powder', name: '毒粉', type: 'poison', category: 'status', power: 0, accuracy: 75, cooldown: 6, range: 'ranged', rangeTiles: 300, effect: { kind: 'status', target: 'enemy', status: 'poison', chance: 1 }, description: '使对手中毒。' },
  { id: 'hypnosis', name: '催眠术', type: 'psychic', category: 'status', power: 0, accuracy: 60, cooldown: 7, range: 'ranged', rangeTiles: 320, effect: { kind: 'status', target: 'enemy', status: 'sleep', chance: 1, duration: 3 }, description: '催眠对手。' },
  { id: 'thunder-wave', name: '电磁波', type: 'electric', category: 'status', power: 0, accuracy: 90, cooldown: 6, range: 'ranged', rangeTiles: 320, effect: { kind: 'status', target: 'enemy', status: 'paralyze', chance: 1 }, description: '使对手麻痹。' },
  { id: 'will-o-wisp', name: '鬼火', type: 'fire', category: 'status', power: 0, accuracy: 85, cooldown: 6, range: 'ranged', rangeTiles: 320, effect: { kind: 'status', target: 'enemy', status: 'burn', chance: 1 }, description: '使对手灼伤。' },
  { id: 'confuse-ray', name: '奇异光线', type: 'ghost', category: 'status', power: 0, accuracy: 100, cooldown: 6, range: 'ranged', rangeTiles: 320, effect: { kind: 'status', target: 'enemy', status: 'confuse', chance: 1, duration: 4 }, description: '使对手混乱。' },
  { id: 'leech-seed', name: '寄生种子', type: 'grass', category: 'status', power: 0, accuracy: 90, cooldown: 8, range: 'ranged', rangeTiles: 300, effect: { kind: 'dot', target: 'enemy', status: 'poison', duration: 10, magnitude: 0.0625 }, description: '每秒吸取对手生命。' },
  { id: 'protect', name: '守住', type: 'normal', category: 'status', power: 0, accuracy: 0, cooldown: 6, range: 'ranged', rangeTiles: 0, effect: { kind: 'shield', target: 'self', magnitude: 200, duration: 1.5 }, description: '短暂格挡伤害。' },
  { id: 'reflect', name: '反射壁', type: 'psychic', category: 'status', power: 0, accuracy: 0, cooldown: 10, range: 'ranged', rangeTiles: 0, effect: { kind: 'shield', target: 'self', magnitude: 150, duration: 6 }, description: '生成护盾减免伤害。' },
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
  cooldown: 1.0,
  range: 'melee',
  rangeTiles: 70,
  description: '无冷却消耗的普通攻击，保证持续输出。',
};

/** Moves a species of a given primary type tends to learn (for learnset gen). */
export const TYPE_LEARNSET: Record<string, string[]> = {
  normal: ['tackle', 'swift', 'body-slam', 'take-down', 'double-edge', 'swords-dance', 'hyper-beam'],
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
