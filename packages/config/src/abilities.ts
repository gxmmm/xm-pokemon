import type { Ability } from '@pokemon-online/shared';

/**
 * Abilities (宝可梦特性). Kept through breeding; very low chance to mutate into
 * another of the species' abilities. Effects are interpreted by the engine.
 */
export const ABILITIES: Ability[] = [
  { id: 'overgrow', name: '茂盛', description: 'HP低于1/3时，草属性招式威力提升。', trigger: 'onLowHp', effect: { kind: 'typeBoost', type: 'grass', mult: 1.5 } },
  { id: 'blaze', name: '猛火', description: 'HP低于1/3时，火属性招式威力提升。', trigger: 'onLowHp', effect: { kind: 'typeBoost', type: 'fire', mult: 1.5 } },
  { id: 'torrent', name: '激流', description: 'HP低于1/3时，水属性招式威力提升。', trigger: 'onLowHp', effect: { kind: 'typeBoost', type: 'water', mult: 1.5 } },
  { id: 'static', name: '静电', description: '被近身攻击时，有概率使攻击者麻痹。', trigger: 'onHit', effect: { kind: 'custom', status: 'paralyze', chance: 0.3 } },
  { id: 'flame-body', name: '火焰之躯', description: '被近身攻击时，有概率使攻击者灼伤。', trigger: 'onHit', effect: { kind: 'custom', status: 'burn', chance: 0.3 } },
  { id: 'poison-point', name: '毒刺', description: '被近身攻击时，有概率使攻击者中毒。', trigger: 'onHit', effect: { kind: 'custom', status: 'poison', chance: 0.3 } },
  { id: 'water-absorb', name: '储水', description: '受到水属性招式时回复HP而非受伤。', trigger: 'passive', effect: { kind: 'typeImmunity', type: 'water', magnitude: 0.25 } },
  { id: 'volt-absorb', name: '蓄电', description: '受到电属性招式时回复HP而非受伤。', trigger: 'passive', effect: { kind: 'typeImmunity', type: 'electric', magnitude: 0.25 } },
  { id: 'flash-fire', name: '引火', description: '受到火属性招式时免疫并提升自身火招威力。', trigger: 'passive', effect: { kind: 'typeImmunity', type: 'fire', magnitude: 1.5 } },
  { id: 'levitate', name: '飘浮', description: '免疫地面属性招式。', trigger: 'passive', effect: { kind: 'typeImmunity', type: 'ground', magnitude: 0 } },
  { id: 'intimidate', name: '威吓', description: '登场时降低对手攻击。', trigger: 'onEnter', effect: { kind: 'statBoost', stat: 'atk', stages: -1, chance: 1 } },
  { id: 'thick-fat', name: '厚脂肪', description: '受到火与冰属性招式伤害减半。', trigger: 'passive', effect: { kind: 'damageReduction', mult: 0.5 } },
  { id: 'huge-power', name: '大力', description: '攻击力提升50%。', trigger: 'passive', effect: { kind: 'statBoost', stat: 'atk', mult: 1.5 } },
  { id: 'speed-boost', name: '加速', description: '每过一段时间速度提升。', trigger: 'onTurnStart', effect: { kind: 'speedBoost', stat: 'spd', stages: 1, chance: 1 } },
  { id: 'rain-dish', name: '雨盘', description: '持续缓慢回复HP。', trigger: 'passive', effect: { kind: 'hpRegen', magnitude: 0.0625 } },
  { id: 'sturdy', name: '结实', description: '满血时受到致命的直接伤害，会保留1点生命；每场战斗限一次。', trigger: 'passive', effect: { kind: 'endure' } },
  { id: 'rock-head', name: '坚硬脑袋', description: '近战主动技能造成伤害后，获得相当于最大生命4%的护盾；每4秒最多一次。', trigger: 'onAttack', effect: { kind: 'contactShield', magnitude: 0.04, duration: 2.5, cooldown: 4 } },
  { id: 'keen-eye', name: '锐利目光', description: '自身技能命中率提高12%，且无视目标50%的闪避加成。', trigger: 'passive', effect: { kind: 'accuracyBoost', magnitude: 0.12, mult: 0.5 } },
  { id: 'guts', name: '毅力', description: '异常状态时攻击提升50%。', trigger: 'passive', effect: { kind: 'statBoost', stat: 'atk', mult: 1.5 } },
  { id: 'swarm', name: '虫之预感', description: 'HP低于1/3时虫属性招式威力提升。', trigger: 'onLowHp', effect: { kind: 'typeBoost', type: 'bug', mult: 1.5 } },
  { id: 'sand-veil', name: '沙隐', description: '闪避率提升。', trigger: 'passive', effect: { kind: 'custom', chance: 0.2 } },
  { id: 'dry-skin', name: '干燥肌肤', description: '晴天受伤增加，雨天回血。', trigger: 'passive', effect: { kind: 'hpRegen', magnitude: 0.0625 } },
  { id: 'adaptability', name: '适应力', description: '同属性招式威力进一步提升。', trigger: 'passive', effect: { kind: 'typeBoost', mult: 1.33 } },
  { id: 'serene-grace', name: '天之恩惠', description: '伤害招式的追加效果触发率提高至1.75倍，最高70%。', trigger: 'passive', effect: { kind: 'secondaryBoost', mult: 1.75, magnitude: 0.7 } },
  { id: 'pressure', name: '压迫感', description: '登场时压制敌方全体8秒，使其技能冷却回复速度降低15%；同类效果不叠加。', trigger: 'onEnter', effect: { kind: 'cooldownPressure', mult: 0.85, duration: 8 } },
  { id: 'multiscale', name: '多重鳞片', description: '满血时受到的伤害减半。', trigger: 'passive', effect: { kind: 'damageReduction', mult: 0.5 } },
  { id: 'marvel-scale', name: '神奇鳞片', description: '异常状态时防御提升50%。', trigger: 'passive', effect: { kind: 'statBoost', stat: 'def', mult: 1.5 } },
  { id: 'natural-cure', name: '自然回复', description: '自身异常状态结束时回复12%最大生命；每8秒最多触发一次。', trigger: 'passive', effect: { kind: 'statusRecovery', magnitude: 0.12, cooldown: 8 } },
  { id: 'illuminate', name: '发光', description: '更容易遇见野生宝可梦。', trigger: 'passive', effect: { kind: 'custom' } },
  { id: 'shell-armor', name: '硬壳盔甲', description: '不会受到暴击伤害。', trigger: 'passive', effect: { kind: 'critImmunity' } },
  { id: 'inner-focus', name: '精神力', description: '免疫畏缩，且畏缩不会打断蓄力。', trigger: 'passive', effect: { kind: 'flinchImmunity' } },
  { id: 'cloud-nine', name: '气象台', description: '无视天气影响。', trigger: 'passive', effect: { kind: 'custom' } },
  // ── extra abilities referenced by species overrides ──
  { id: 'chlorophyll', name: '叶绿素', description: '晴天时速度提升。', trigger: 'passive', effect: { kind: 'speedBoost', stat: 'spd', mult: 1.5 } },
  { id: 'solar-power', name: '太阳之力', description: '晴天特攻提升但持续掉血。', trigger: 'passive', effect: { kind: 'statBoost', stat: 'atk', mult: 1.5 } },
  { id: 'lightning-rod', name: '避雷针', description: '免疫电属性并提升攻击。', trigger: 'passive', effect: { kind: 'typeImmunity', type: 'electric', magnitude: 1.5 } },
  { id: 'cute-charm', name: '迷人之躯', description: '被近身攻击时可能使攻击者着迷。', trigger: 'onHit', effect: { kind: 'custom', chance: 0.3 } },
  { id: 'magic-guard', name: '魔法防守', description: '免疫灼伤、中毒、持续伤害与混乱自伤造成的间接伤害。', trigger: 'passive', effect: { kind: 'indirectImmunity' } },
  { id: 'limber', name: '柔软', description: '免疫麻痹。', trigger: 'passive', effect: { kind: 'custom' } },
  { id: 'damp', name: '潮湿', description: '阻止自爆类招式。', trigger: 'passive', effect: { kind: 'custom' } },
  { id: 'synchronize', name: '同步', description: '首次被敌方施加异常时，将同种异常反射给来源；每个目标每场最多一次。', trigger: 'passive', effect: { kind: 'statusReflect' } },
  { id: 'no-guard', name: '无防守', description: '双方的招式必定命中。', trigger: 'passive', effect: { kind: 'custom' } },
  { id: 'cursed-body', name: '诅咒之躯', description: '被攻击时可能封印对手招式。', trigger: 'onHit', effect: { kind: 'custom', chance: 0.3 } },
  { id: 'moxie', name: '自信过度', description: '击倒对手时攻击提升。', trigger: 'onFaint', effect: { kind: 'statBoost', stat: 'atk', stages: 1, chance: 1 } },
  { id: 'imposter', name: '变身者', description: '登场时变为对手的样子。', trigger: 'onEnter', effect: { kind: 'custom' } },
  { id: 'immunity', name: '免疫', description: '免疫中毒。', trigger: 'passive', effect: { kind: 'custom' } },
  { id: 'magnet-pull', name: '磁力', description: '使钢属性无法逃脱。', trigger: 'passive', effect: { kind: 'custom' } },
  { id: 'skill-link', name: '连续攻击', description: '连续招式必定命中最大次数。', trigger: 'passive', effect: { kind: 'custom' } },
  { id: 'snow-cloak', name: '雪隐', description: '雪天闪避率提升。', trigger: 'passive', effect: { kind: 'custom', chance: 0.2 } },
  { id: 'unnerve', name: '紧张感', description: '使对手紧张无法使用道具。', trigger: 'onEnter', effect: { kind: 'custom' } },
  { id: 'run-away', name: '逃跑', description: '一定能从野生宝可梦处逃走。', trigger: 'passive', effect: { kind: 'custom' } },
  { id: 'drought', name: '日照', description: '登场时召唤强烈阳光。', trigger: 'onEnter', effect: { kind: 'weather' } },
  // ── Project-original ordinary abilities ──
  // New IDs intentionally keep legacy ability IDs stable in existing saves.
  { id: 'steady-nerves', name: '临危不乱', description: '生命低于35%后首次受到直接伤害时，防御提升1级；每场战斗一次。', trigger: 'onHit', effect: { kind: 'lowHpDefense', stat: 'def', stages: 1, magnitude: 0.35 } },
  { id: 'combat-rhythm', name: '节奏感', description: '主动伤害技能命中后，使另一项冷却中的主动技能额外减少0.35秒冷却；每3秒最多一次。', trigger: 'onAttack', effect: { kind: 'cooldownRhythm', magnitude: 0.35, cooldown: 3 } },
  { id: 'lasting-grit', name: '余韧', description: '自身护盾被完全打破时，回复6%最大生命；每6秒最多一次。', trigger: 'onHit', effect: { kind: 'shieldRecovery', magnitude: 0.06, cooldown: 6 } },
  { id: 'counter-instinct', name: '反制本能', description: '被威力85以上或带蓄力的技能命中后，下一次主动伤害技能最终伤害提高15%；持续8秒，每5秒最多触发一次。', trigger: 'onHit', effect: { kind: 'counterInstinct', mult: 1.15, duration: 8, cooldown: 5 } },
  { id: 'opening-initiative', name: '先机', description: '战斗开始后的前6秒，速度提升1级；效果结束后恢复。', trigger: 'onEnter', effect: { kind: 'openingSpeed', stat: 'spd', stages: 1, duration: 6 } },
];

export const ABILITY_MAP: Record<string, Ability> = Object.fromEntries(
  ABILITIES.map((a) => [a.id, a]),
);
