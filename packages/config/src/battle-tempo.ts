import { DEFAULT_SKILL_CAST_PRESENTATION, SKILL_CAST_PRESENTATION_BY_SKILL_ID } from './battle-art.ts';
import { SKILL_VISUAL_RECIPE_MAP } from './skill-visuals.ts';
export const TACTICAL_COOLDOWN_SCALE = 1.35;

/** 引擎与表现共用动作占用，不允许高速省略起手、释放和收招。 */
export function battleActionTiming(skillId?: string, normalRanged = false) {
  const cast = skillId ? SKILL_CAST_PRESENTATION_BY_SKILL_ID[skillId] ?? DEFAULT_SKILL_CAST_PRESENTATION : DEFAULT_SKILL_CAST_PRESENTATION;
  const recipe = skillId ? SKILL_VISUAL_RECIPE_MAP[skillId] : undefined;
  const delivery = recipe?.delivery ?? (normalRanged ? 'projectile' : 'melee');
  const prepareMs = cast.charge ? 0 : cast.visualWindupMs;
  const mainMs = recipe?.actorChoreography?.durationMs ?? (delivery === 'melee' ? 360 : delivery === 'beam' ? cast.channelMs : 460);
  const recoveryMs = cast.recoveryMs;
  return { prepareMs, mainMs, recoveryMs, totalMs: prepareMs + mainMs + recoveryMs };
}

/** 速度收益递减；极端炼妖、加速及阶段叠加仍只能接近上限。 */
export function speedTempoRatio(speed: number): number {
  const value = Math.max(0, speed);
  return Number.isFinite(value) ? value / (value + 80) : 1;
}
export function actionGapForSpeed(speed: number): number { return .42 - .30 * speedTempoRatio(speed); }
export function skillCooldownRate(speed: number, basic: boolean): number {
  return 1 / (basic ? 1.20 - .65 * speedTempoRatio(speed) : 1.10 - .30 * speedTempoRatio(speed));
}
export const SPEED_VALUE_DESCRIPTION = '速度提高移动、缩短招式间休止；基础招式冷却收益较强，其它招式较温和，均有递减上限。蓄力和完整出招时间不压缩。';
