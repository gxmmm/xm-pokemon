import type { StatusKind } from '@pokemon-online/shared';

export const BATTLE_HUD = { criticalHpRatio: 0.2, interruptNoticeSeconds: 0.9 } as const;
export const BATTLE_STATUS_LABELS: Record<StatusKind, string> = {
  burn: '灼伤', poison: '中毒', paralyze: '麻痹', freeze: '冰冻', sleep: '睡眠', confuse: '混乱',
};
