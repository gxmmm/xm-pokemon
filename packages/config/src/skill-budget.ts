import type { Skill } from '@pokemon-online/shared';

/**
 * A compact balance budget shared by skill tooltips and smoke tests. Roles are
 * derived from existing configuration rather than duplicated per skill, keeping
 * the current skill list data-driven while giving future additions a clear lane.
 */
export type SkillRole = 'fill' | 'main' | 'burst' | 'area' | 'control' | 'support';

export interface SkillBudget {
  label: string;
  summary: string;
}

export const SKILL_BUDGETS: Record<SkillRole, SkillBudget> = {
  fill: { label: '填充', summary: '低威力、短冷却；与普攻共同填补技能空档。' },
  main: { label: '主力', summary: '稳定输出；在伤害、冷却与射程之间保持均衡。' },
  burst: { label: '爆发', summary: '高威力或蓄力技能；以更长冷却、命中风险或前摇换取单次爆发。' },
  area: { label: '群攻', summary: '同时压制敌方多人；以单目标伤害折减交换总压制力。' },
  control: { label: '控制', summary: '用异常、减益或打断创造战术窗口，直接伤害不是首要价值。' },
  support: { label: '辅助', summary: '治疗、护盾或自我强化；用生存和节奏价值支撑队伍。' },
};

const HARD_CONTROL = new Set(['sleep', 'freeze', 'paralyze', 'confuse']);

export function skillRoleOf(skill: Skill): SkillRole {
  if (skill.power === 0) {
    if (skill.effect?.target === 'enemy') return 'control';
    return 'support';
  }
  if (skill.targetMode === 'all-enemies') return 'area';
  // A small proc on a damaging move is a bonus, not its entire combat role.
  // Reserve the control budget for strong, reliable control attached to a
  // lower-damage move; ordinary starter attacks such as 电击 remain fillers.
  if (skill.power <= 55 && skill.cooldown <= 3) return 'fill';
  if ((skill.castTime ?? 0) > 0 || skill.power >= 100 || skill.cooldown >= 7) return 'burst';
  if (skill.effect?.kind === 'status' && skill.effect.status && HARD_CONTROL.has(skill.effect.status) && (skill.effect.chance ?? 0) >= 0.3) return 'control';
  return 'main';
}

export function skillBudgetLabel(skill: Skill): string {
  const role = skillRoleOf(skill);
  return `${SKILL_BUDGETS[role].label}：${SKILL_BUDGETS[role].summary}`;
}
