import type { GrowthRate } from '@pokemon-online/shared';
import { MAX_LEVEL } from '@pokemon-online/shared';

/**
 * Experience curves (standard Pokemon formulas). `expForLevel` returns total
 * EXP required to *reach* a level; `levelForExp` inverts it.
 */

function fluctuating(level: number): number {
  const n = level;
  if (n <= 1) return 0;
  if (n < 15) return Math.floor((n * n * n * (Math.floor((n + 1) / 3) + 8)) / 8);
  if (n < 36) return Math.floor((n * n * n * (n + 14)) / 8);
  return Math.floor((n * n * n * (Math.floor(n / 2) + 32)) / 8);
}

export function expForLevel(growth: GrowthRate, level: number): number {
  if (level <= 1) return 0;
  const n = level;
  switch (growth) {
    case 'fast':
      return Math.floor((4 * n * n * n) / 5);
    case 'medium-fast':
      return n * n * n;
    case 'medium-slow':
      return Math.floor((6 / 5) * n * n * n - 15 * n * n + 100 * n - 140);
    case 'slow':
      return Math.floor((5 * n * n * n) / 4);
    case 'fluctuating':
      return fluctuating(n);
    default:
      return n * n * n;
  }
}

export function levelForExp(growth: GrowthRate, exp: number): number {
  let level = 1;
  for (let l = 1; l <= MAX_LEVEL; l++) {
    if (expForLevel(growth, l + 1) <= exp) level = l + 1;
    else break;
  }
  return Math.min(level, MAX_LEVEL);
}

/** EXP needed to go from current level to next. */
export function expToNext(growth: GrowthRate, level: number): number {
  if (level >= MAX_LEVEL) return 0;
  return expForLevel(growth, level + 1) - expForLevel(growth, level);
}

/** EXP progress within the current level (0..1). */
export function levelProgress(growth: GrowthRate, level: number, exp: number): number {
  if (level >= MAX_LEVEL) return 1;
  const cur = expForLevel(growth, level);
  const next = expForLevel(growth, level + 1);
  if (next <= cur) return 0;
  return Math.max(0, Math.min(1, (exp - cur) / (next - cur)));
}
