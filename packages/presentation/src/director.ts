import { DEFAULT_SKILL_CAST_PRESENTATION, SKILL_CAST_PRESENTATION_BY_SKILL_ID, SKILL_VISUAL_RECIPE_MAP } from '@pokemon-online/config';
import type { BattleEvent, TypeName } from '@pokemon-online/shared';
import {
  type BattleCue,
  type BattlePresentationEvent,
  type CombatantAnimation,
  type EnvironmentReaction,
  toBattlePresentationEvent,
} from './battle.ts';

/** Serializable envelope that lets any renderer deduplicate and schedule cues
 * without reaching into a BattleSim or relying on a DOM timestamp. */
export interface DirectedBattleCue {
  id: string;
  eventId: string;
  sequence: number;
  at: number;
  cue: BattleCue;
}

export interface VisualScore {
  intensity: number;
  decisive: boolean;
  area: boolean;
  critical: boolean;
  knockout: boolean;
}

export function scoreBattlePresentation(event: BattlePresentationEvent): VisualScore {
  const outcome = event.outcome;
  const area = (event.targetIds?.length ?? 0) > 1;
  const critical = !!outcome?.critical;
  const knockout = !!outcome?.ko || event.type === 'faint';
  const effective = outcome?.effectiveness ?? 1;
  const damageWeight = outcome?.damage ? Math.min(0.32, outcome.damage / 400) : 0;
  const intensity = Math.min(1, 0.24 + damageWeight + (area ? 0.12 : 0) + (effective > 1 ? 0.14 : 0) + (critical ? 0.18 : 0) + (knockout ? 0.32 : 0));
  return { intensity, decisive: knockout || critical || effective > 1, area, critical, knockout };
}

/** Converts structured battle facts into renderer-neutral cues. It never
 * calculates damage, hits, misses, status, or victory; those facts already
 * exist in the event DTO supplied by the pure engine. */
export class BattleDirector {
  private consumed = new Set<number>();

  direct(events: readonly BattlePresentationEvent[]): DirectedBattleCue[] {
    const result: DirectedBattleCue[] = [];
    for (const event of events) {
      if (this.consumed.has(event.sequence)) continue;
      this.consumed.add(event.sequence);
      result.push(...this.cuesFor(event));
    }
    return result;
  }

  reset(): void { this.consumed.clear(); }

  private cuesFor(event: BattlePresentationEvent): DirectedBattleCue[] {
    const score = scoreBattlePresentation(event);
    const recipe = recipeFor(event);
    const targets = event.targetIds ?? [];
    const output: BattleCue[] = [];

    if (event.type === 'cast-start') {
      output.push(
        { type: 'animation', subjectId: event.actorId ?? '', animation: 'windup', skillId: event.skillId, targetIds: targets, delivery: recipe.delivery },
        { type: 'camera', plan: { style: 'anticipate', focusIds: compactIds([event.actorId, ...targets]), durationMs: 180, zoom: 1.03 } },
        // Windup energy belongs to the caster; release/status feedback may target
        // opponents separately. Leaving targetIds empty makes the generic aura plan
        // resolve to actorId without a skill- or model-specific renderer branch.
        { type: 'vfx', recipe: vfxRecipeFor(recipe, 'aura'), anchors: { actorId: event.actorId }, intensity: 0.36, eventType: event.type, skillId: event.skillId, vfxKind: event.vfxKind, outcome: event.outcome, status: event.status },
      );
    } else if (event.type === 'move' || event.type === 'skill') {
      const animation = animationFor(recipe);
      const cast = castPresentationFor(event.skillId);
      const needsVisualWindup = event.type === 'move' || !cast.charge;
      const actorChoreography = recipe.actorChoreography;
      const actionDurationMs = actionPlaybackDurationMs(animation, cast, needsVisualWindup, actorChoreography);
      const releaseDelayMs = needsVisualWindup ? cast.visualWindupMs : 0;
      output.push(
        ...(needsVisualWindup ? [{ type: 'animation' as const, subjectId: event.actorId ?? '', animation: 'windup' as const, skillId: event.skillId, targetIds: targets, delivery: recipe.delivery, durationMs: cast.visualWindupMs }] : []),
        {
          type: 'animation', subjectId: event.actorId ?? '', animation, skillId: event.skillId,
          targetIds: targets, delivery: recipe.delivery, actorChoreography, element: recipe.element,
          schedule: needsVisualWindup ? 'after-current-motion' : undefined,
          durationMs: actorChoreography?.durationMs ?? (cast.channel ? cast.channelMs : undefined),
        },
        // Target impact belongs to the authoritative damage event below. A dive
        // action itself only drives its actor-side contour/traversal, preventing
        // a duplicate explosion before the model has reached the opponent.
        ...(actorChoreography ? [] : [{ type: 'vfx' as const, recipe: vfxRecipeFor(recipe), anchors: { actorId: event.actorId, targetIds: targets }, intensity: score.intensity, eventType: event.type, skillId: event.skillId, vfxKind: event.vfxKind, outcome: event.outcome, status: event.status, delayMs: releaseDelayMs || undefined }]),
        { type: 'animation', subjectId: event.actorId ?? '', animation: 'recoil', skillId: event.skillId, targetIds: targets, delivery: recipe.delivery, schedule: 'after-current-motion', durationMs: cast.recoveryMs },
        { type: 'action-window', milliseconds: actionDurationMs },
      );
      const camera = cameraPlanFor(recipe.camera, compactIds([event.actorId, ...targets]));
      if (camera) output.push({ type: 'camera', plan: camera });
      else if (score.area) output.push({ type: 'camera', plan: { style: 'impact', focusIds: compactIds([event.actorId, ...targets]), durationMs: 240, zoom: 1.04 } });
    } else if (event.type === 'damage') {
      const sourceRecipe = recipeFor(event);
      const actorChoreography = sourceRecipe.actorChoreography;
      const cast = castPresentationFor(event.skillId);
      // A gameplay-timed cast has already held the actor through cast-start;
      // instant actions require their configuration-owned visual prepare.
      const actionLeadMs = actorChoreography ? (cast.charge ? 0 : cast.visualWindupMs) : 0;
      const impactDelayMs = actorChoreography
        ? actionLeadMs + Math.round(actorChoreography.durationMs * actorChoreography.impactAt)
        : undefined;
      output.push(
        { type: 'animation', subjectId: targets[0] ?? '', animation: 'hit', targetIds: targets, element: sourceRecipe.element, delayMs: impactDelayMs },
        { type: 'vfx', recipe: { ...vfxRecipeFor(sourceRecipe, 'aura'), id: `impact:${event.element ?? 'normal'}` }, anchors: { actorId: event.actorId, targetIds: targets }, intensity: score.intensity, eventType: event.type, skillId: event.skillId, vfxKind: event.vfxKind, outcome: event.outcome, status: event.status, delayMs: impactDelayMs },
        ...(score.knockout ? [{ type: 'camera' as const, plan: { style: 'finisher' as const, focusIds: compactIds([event.actorId, ...targets]), durationMs: 360, zoom: 1.07, shake: 0.45 } }] : []),
      );
      if (score.knockout) output.push({ type: 'hit-stop', milliseconds: 70 });
      const reaction = reactionFor(event.element);
      if (reaction !== 'none') output.push({ type: 'environment', reaction });
    } else if (event.type === 'heal' || event.type === 'status') {
      const sourceRecipe = recipeFor(event);
      output.push({ type: 'vfx', recipe: { ...vfxRecipeFor(sourceRecipe, 'aura'), id: event.type === 'heal' ? 'heal' : `status:${event.status ?? 'generic'}` }, anchors: { actorId: event.actorId, targetIds: targets }, intensity: Math.max(0.3, score.intensity * 0.75), eventType: event.type, skillId: event.skillId, vfxKind: event.vfxKind, outcome: event.outcome, status: event.status });
    } else if (event.type === 'faint') {
      output.push(
        { type: 'animation', subjectId: targets[0] ?? event.actorId ?? '', animation: 'faint', targetIds: targets },
        { type: 'vfx', recipe: { id: 'faint', element: event.element, delivery: 'aura' }, anchors: { actorId: event.actorId, targetIds: targets }, intensity: 1, eventType: event.type, skillId: event.skillId, vfxKind: event.vfxKind, outcome: { ...event.outcome, ko: true }, status: event.status },
        { type: 'camera', plan: { style: 'finisher', focusIds: compactIds([event.actorId, ...targets]), durationMs: 360, zoom: 1.07, shake: 0.45 } },
        { type: 'hit-stop', milliseconds: 70 },
      );
    } else if (event.type === 'capture' || event.type === 'battle-end') {
      output.push({ type: 'sound', cue: { id: event.type === 'capture' ? 'capture' : 'battle-end', volume: 0.7 } });
    }

    return output.filter((cue) => !('subjectId' in cue) || cue.subjectId.length > 0)
      .map((cue, index) => ({ id: `${event.id}:cue:${index}`, eventId: event.id, sequence: event.sequence, at: event.at, cue }));
  }
}

/** Convenience bridge for legacy callers while presentation is migrated. */
export function directBattleEvents(events: readonly BattleEvent[]): DirectedBattleCue[] {
  return new BattleDirector().direct(events.map(toBattlePresentationEvent));
}

interface RecipeLike { id: string; element?: TypeName; delivery: 'melee' | 'projectile' | 'beam' | 'area' | 'aura'; camera: 'light' | 'track' | 'impact' | 'finisher'; variant?: string; actorChoreography?: import('@pokemon-online/shared').BattleActorChoreography; particleBudget?: number; }
function recipeFor(event: BattlePresentationEvent): RecipeLike {
  if (event.skillId && SKILL_VISUAL_RECIPE_MAP[event.skillId]) return SKILL_VISUAL_RECIPE_MAP[event.skillId]!;
  const delivery = event.vfxKind === 'melee' ? 'melee' : event.vfxKind === 'beam' ? 'beam' : event.vfxKind === 'burst' ? 'area' : event.vfxKind === 'cast' ? 'aura' : 'projectile';
  const normalStyle = event.skillId === '__normal__' ? event.normalAttackStyle : undefined;
  return {
    id: event.skillId === '__normal__' ? `normal-attack:${normalStyle ?? 'claw'}` : `fallback:${event.element ?? 'normal'}`,
    element: event.element,
    delivery,
    camera: delivery === 'area' ? 'impact' : 'light',
    variant: normalStyle,
  };
}

function vfxRecipeFor(recipe: RecipeLike, delivery = recipe.delivery) {
  return { id: recipe.id, element: recipe.element, delivery, variant: recipe.variant, actorChoreography: recipe.actorChoreography, particleBudget: recipe.particleBudget };
}

function cameraPlanFor(style: RecipeLike['camera'], focusIds: readonly string[]) {
  if (style === 'light') return null;
  if (style === 'track') return { style: 'track' as const, focusIds, durationMs: 260, zoom: 1.035 };
  if (style === 'impact') return { style: 'impact' as const, focusIds, durationMs: 280, zoom: 1.045, shake: 0.12 };
  return { style: 'finisher' as const, focusIds, durationMs: 340, zoom: 1.065, shake: 0.28 };
}
function castPresentationFor(skillId?: string) {
  return skillId ? SKILL_CAST_PRESENTATION_BY_SKILL_ID[skillId] ?? DEFAULT_SKILL_CAST_PRESENTATION : DEFAULT_SKILL_CAST_PRESENTATION;
}
function actionPlaybackDurationMs(animation: CombatantAnimation, cast: ReturnType<typeof castPresentationFor>, hasVisualWindup: boolean, choreography?: import('@pokemon-online/shared').BattleActorChoreography): number {
  const mainMs = choreography?.durationMs ?? (animation === 'melee' ? 360 : animation === 'beam' ? cast.channelMs : 460);
  return (hasVisualWindup ? cast.visualWindupMs : 0) + mainMs + cast.recoveryMs;
}
function animationFor(recipe: RecipeLike): CombatantAnimation {
  if (recipe.actorChoreography?.kind === 'target-dive') return 'dive';
  if (recipe.delivery === 'melee') return 'melee';
  if (recipe.delivery === 'beam') return 'beam';
  if (recipe.delivery === 'area') return 'burst';
  if (recipe.delivery === 'aura') return 'cast';
  return 'projectile';
}
function reactionFor(element?: TypeName): EnvironmentReaction {
  const reactions: Partial<Record<TypeName, EnvironmentReaction>> = { fire: 'scorch', ice: 'frost', electric: 'spark', water: 'splash', grass: 'spore', ground: 'debris', rock: 'debris', psychic: 'rune-pulse', ghost: 'rune-pulse', dragon: 'rune-pulse' };
  return element ? reactions[element] ?? 'none' : 'none';
}
function compactIds(ids: readonly (string | undefined)[]): string[] { return ids.filter((id): id is string => !!id); }