import type { CombatRole, TeamTactic, TeamTacticKind } from '@pokemon-online/shared';
import { COMBAT_ROLE_LABEL } from '@pokemon-online/config';

export interface TacticPresentation {
  label: string;
  description: string;
  tone: 'finish' | 'protect' | 'pressure' | 'split';
}

const TACTICS: Record<TeamTacticKind, TacticPresentation> = {
  finish: { label: '集火收割', description: '锁定残血目标，优先完成击倒。', tone: 'finish' },
  protect: { label: '保护反制', description: '前排拦截威胁，后排保持安全距离。', tone: 'protect' },
  pressure: { label: '压制威胁', description: '集中火力限制敌方关键输出。', tone: 'pressure' },
  split: { label: '分线周旋', description: '分散目标，避免健康敌方被无效围堵。', tone: 'split' },
};

export function tacticPresentation(tactic: TeamTactic | undefined): TacticPresentation | null {
  return tactic ? TACTICS[tactic.kind] : null;
}

export interface ContributionInput {
  role?: CombatRole;
  damage: number;
  damageTaken: number;
  healing: number;
  shield: number;
  control: number;
  interrupts: number;
  knockouts: number;
}

/** Compact player-facing explanation of how a combatant contributed to the team. */
export function contributionSummary(input: ContributionInput): string {
  const role = input.role;
  if (role === 'tank') {
    if (input.damageTaken > 0) return `前排承伤 ${input.damageTaken}${input.interrupts ? `，打断 ${input.interrupts} 次` : ''}`;
    return '负责前排拦截与保护后排';
  }
  if (role === 'support') {
    if (input.healing > 0 || input.shield > 0) return `续航支援：治疗 ${input.healing} · 护盾 ${input.shield}`;
    return '负责续航与安全距离';
  }
  if (role === 'control') {
    if (input.control > 0 || input.interrupts > 0) return `控制 ${input.control.toFixed(1)} 秒${input.interrupts ? ` · 打断 ${input.interrupts} 次` : ''}`;
    return '负责控制关键行动';
  }
  if (role === 'burst') return input.knockouts ? `完成 ${input.knockouts} 次收割` : '寻找关键爆发窗口';
  if (role === 'area') return '以范围压制多个目标';
  if (role === 'bruiser') return input.knockouts ? `近战推进并完成 ${input.knockouts} 次击倒` : '近战推进，争取击杀窗口';
  if (role === 'kite') return '保持距离，持续拉扯输出';
  if (input.healing > 0 || input.shield > 0) return `支援贡献：治疗 ${input.healing} · 护盾 ${input.shield}`;
  if (input.control > 0) return `控制 ${input.control.toFixed(1)} 秒`;
  if (input.knockouts > 0) return `完成 ${input.knockouts} 次击倒`;
  return '持续参与队伍输出';
}

export function roleLabel(role: CombatRole | undefined): string {
  return role ? COMBAT_ROLE_LABEL[role] : '均衡作战';
}