import { SKILL_MAP } from '@pokemon-online/config';
import type { BattleCombatant, StatusKind } from '@pokemon-online/shared';
import type { BattleDirector, BattlePresentationEvent, DirectedBattleCue } from '@pokemon-online/presentation';

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
  // Like engine facts, release and outcome share one instant. The director owns
  // visual contact timing; the lab must not add an unrelated fake flight time.
  const at = 0;
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
    id: `vfx-lab:${input.sequence}:${impactType}`, sequence: input.sequence + 1, type: impactType, at, ...base,
    vfxKind: cast.vfxKind,
    outcome: impactType === 'damage' ? { damage: Math.max(1, Math.round(skill.power || 1)) } : undefined,
  };
  return [cast, impact];
}

/** Entire cue batches share one offset, including camera, recovery and terrain. */
export function buildVfxLabCues(director: BattleDirector, input: VfxLabEventInput, count: number, intensity: number): DirectedBattleCue[] {
  const result: DirectedBattleCue[] = [];
  let offsetMs = 0;
  for (let index = 0; index < count; index++) {
    const events = buildVfxLabEvents({ ...input, sequence: input.sequence + index * 10 }).map((event) =>
      (event.type === 'damage' || event.type === 'skill') && event.outcome
        ? { ...event, outcome: { ...event.outcome, damage: Math.round((event.outcome.damage ?? 1) * intensity * 5), critical: intensity >= 1.5 } }
        : event);
    const batch = director.direct(events);
    result.push(...batch.map((entry) => ({ ...entry, cue: { ...entry.cue, delayMs: (entry.cue.delayMs ?? 0) + offsetMs } })));
    offsetMs += batch.reduce((duration, { cue }) => cue.type === 'action-window' ? Math.max(duration, cue.milliseconds) : duration, 720);
  }
  return result;
}
