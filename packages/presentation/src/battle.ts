import type { BattleActorChoreography, BattleCombatant, BattleEvent, BattleVfx, NormalAttackVisualStyle, StatusKind, TypeName } from '@pokemon-online/shared';

export type BattlePresentationEventType =
  | 'move'
  | 'cast-start'
  | 'skill'
  | 'damage'
  | 'heal'
  | 'status'
  | 'faint'
  | 'capture'
  | 'battle-end';

export interface BattlePresentationOutcome {
  damage?: number;
  critical?: boolean;
  effectiveness?: number;
  missed?: boolean;
  ko?: boolean;
}

/** Renderer-neutral projection of a core BattleEvent.
 *
 * It keeps presentation fields structured so neither the Canvas compatibility
 * implementation nor a future GPU renderer needs to infer meaning from logs.
 */
export interface BattlePresentationEvent {
  id: string;
  sequence: number;
  type: BattlePresentationEventType;
  actorId?: string;
  targetIds?: readonly string[];
  skillId?: string;
  element?: TypeName;
  vfxKind?: BattleVfx['kind'];
  normalAttackStyle?: NormalAttackVisualStyle;
  status?: StatusKind;
  outcome?: BattlePresentationOutcome;
  at: number;
}

export interface CameraPlan {
  style: 'neutral' | 'anticipate' | 'track' | 'impact' | 'finisher';
  focusIds: readonly string[];
  durationMs: number;
  zoom?: number;
  shake?: number;
}

/** Includes the legacy action forms so Canvas can remain a compatibility
 * consumer while a future renderer maps the same semantic action to its own
 * CombatantView animation system. */
export type CombatantAnimation = 'idle' | 'windup' | 'melee' | 'dive' | 'projectile' | 'beam' | 'burst' | 'cast' | 'recoil' | 'hit' | 'faint';

export interface VfxRecipeRef {
  id: string;
  element?: TypeName;
  delivery?: 'melee' | 'projectile' | 'beam' | 'area' | 'aura';
  /** Configuration-owned generic motif detail; never a renderer-side skill branch. */
  variant?: string;
  /** Configuration-owned actor-side traversal/contour choreography. */
  actorChoreography?: BattleActorChoreography;
  /** Configuration-owned ceiling for generic particle/shape density. */
  particleBudget?: number;
}

export interface VfxAnchors {
  actorId?: string;
  targetIds?: readonly string[];
}

export type EnvironmentReaction =
  | 'none'
  | 'scorch'
  | 'frost'
  | 'spark'
  | 'splash'
  | 'spore'
  | 'debris'
  | 'rune-pulse';

export interface SoundCue {
  id: string;
  volume?: number;
}

/** A renderer may schedule these cues but may not reinterpret battle rules. */
export type AnimationSchedule = 'immediate' | 'after-current-motion';

export type BattleCue =
  | { type: 'camera'; plan: CameraPlan }
  | { type: 'vfx'; recipe: VfxRecipeRef; anchors: VfxAnchors; intensity: number; eventType: BattlePresentationEventType; skillId?: string; vfxKind?: BattleVfx['kind']; outcome?: BattlePresentationOutcome; status?: StatusKind; /** Presentation-only delay used to release VFX after a visual windup. */ delayMs?: number }
  | { type: 'animation'; subjectId: string; animation: CombatantAnimation; skillId?: string; targetIds?: readonly string[]; delivery?: VfxRecipeRef['delivery']; actorChoreography?: BattleActorChoreography; element?: TypeName; schedule?: AnimationSchedule; /** Presentation-only clip hold; never changes simulation timing. */ durationMs?: number; /** Presentation-only release delay for impact reactions. */ delayMs?: number }
  /** Timeline-owned playback window. The bridge pauses its visual cursor while
   * renderer consumers play the matching action; no game facts are changed. */
  | { type: 'action-window'; milliseconds: number }
  | { type: 'hit-stop'; milliseconds: number }
  | { type: 'time-scale'; scale: number; durationMs: number }
  | { type: 'environment'; reaction: EnvironmentReaction }
  | { type: 'sound'; cue: SoundCue };

/** Converts the existing pure engine event DTO into the new presentation DTO.
 * The adapter is intentionally one-way; presentation never mutates core data. */
export function toBattlePresentationEvent(event: BattleEvent): BattlePresentationEvent {
  const vfx = event.vfx;
  const type = presentationTypeFor(event, vfx);
  const targetIds = vfx?.targetUids?.length
    ? [...vfx.targetUids]
    : event.target ? [event.target] : undefined;
  const outcome: BattlePresentationOutcome | undefined = (
    event.amount !== undefined || vfx?.crit || vfx?.effectiveness !== undefined || vfx?.missed || vfx?.ko
  ) ? {
    damage: event.type === 'damage' ? event.amount : undefined,
    critical: vfx?.crit,
    effectiveness: vfx?.effectiveness,
    missed: vfx?.missed,
    ko: vfx?.ko,
  } : undefined;
  return {
    id: `${event.seq ?? 0}:${event.t}:${event.type}:${event.actor ?? ''}:${event.target ?? ''}`,
    sequence: event.seq ?? 0,
    type,
    actorId: event.actor,
    targetIds,
    skillId: event.skillId,
    element: vfx?.type,
    vfxKind: vfx?.kind,
    normalAttackStyle: vfx?.normalAttackStyle,
    status: vfx?.status,
    outcome,
    at: event.t,
  };
}

function presentationTypeFor(event: BattleEvent, vfx?: BattleVfx): BattlePresentationEventType {
  if (event.type === 'attack' || event.type === 'move') return 'move';
  if (event.type === 'skill' && vfx?.kind === 'cast') return 'cast-start';
  if (event.type === 'skill') return 'skill';
  if (event.type === 'damage') return 'damage';
  if (event.type === 'heal') return 'heal';
  if (event.type === 'status' || event.type === 'buff' || event.type === 'debuff') return 'status';
  if (event.type === 'faint') return 'faint';
  if (event.type === 'capture') return 'capture';
  return 'battle-end';
}

/** Kept here as an explicit cross-package boundary for consumers that receive
 * snapshots from a bridge rather than a BattleSim instance. */
export interface BattleRenderSnapshot {
  time: number;
  combatants: readonly BattleCombatant[];
  events: readonly BattlePresentationEvent[];
}