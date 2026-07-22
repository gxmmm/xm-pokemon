import { SKILL_MAP } from '@pokemon-online/config';
import type { BattleCombatant, StatusKind } from '@pokemon-online/shared';
import type { BattlePresentationEvent } from '@pokemon-online/presentation';

export interface VfxLabEventInput {
  actorId: string;
  targetId: string;
  skillId: string;
  sequence: number;
}

export type VfxLabForcedStatus = 'none' | 'stun' | StatusKind;

export function vfxLabTargetState(status: VfxLabForcedStatus): Pick<BattleCombatant, 'status' | 'statusTimer' | 'flinchUntil'> {
  if (status === 'none') return { status: null, statusTimer: 0, flinchUntil: 0 };
  if (status === 'stun') return { status: null, statusTimer: 0, flinchUntil: 9999 };
  const duration: Record<StatusKind, number> = { burn: 5, poison: 5, paralyze: 3, freeze: 2.5, sleep: 2, confuse: 2.5 };
  return { status, statusTimer: duration[status], flinchUntil: 0 };
}


export function buildVfxLabEvents(input: VfxLabEventInput): readonly BattlePresentationEvent[] {
  const skill = SKILL_MAP[input.skillId];
  if (!skill) return [];
  const selfTarget = skill.effect?.target === 'self' || skill.effect?.kind === 'heal';
  const targetId = selfTarget ? input.actorId : input.targetId;
  const at = performance.now() / 1000;
  const base = {
    actorId: input.actorId,
    targetIds: [targetId],
    skillId: skill.id,
    element: skill.type,
  };
  const cast: BattlePresentationEvent = {
    id: `vfx-lab:${input.sequence}:skill`, sequence: input.sequence, type: 'skill', at, ...base,
    vfxKind: skill.range === 'melee' ? 'melee' : skill.range === 'ranged' ? 'projectile' : 'burst',
  };
  const impactType = selfTarget ? (skill.effect?.kind === 'heal' ? 'heal' : 'status') : 'damage';
  const impact: BattlePresentationEvent = {
    id: `vfx-lab:${input.sequence}:${impactType}`, sequence: input.sequence + 1, type: impactType, at: at + 0.32, ...base,
    vfxKind: cast.vfxKind,
    outcome: impactType === 'damage' ? { damage: Math.max(1, Math.round(skill.power || 1)) } : undefined,
  };
  return [cast, impact];
}
