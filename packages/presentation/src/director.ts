import { SKILL_VISUAL_RECIPE_MAP } from '@pokemon-online/config';
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
        { type: 'vfx', recipe: { id: recipe.id, element: recipe.element, delivery: 'aura' }, anchors: { actorId: event.actorId, targetIds: targets }, intensity: 0.28, eventType: event.type, skillId: event.skillId, vfxKind: event.vfxKind, outcome: event.outcome, status: event.status },
      );
    } else if (event.type === 'move' || event.type === 'skill') {
      output.push(
        { type: 'animation', subjectId: event.actorId ?? '', animation: animationFor(recipe), skillId: event.skillId, targetIds: targets, delivery: recipe.delivery },
        { type: 'vfx', recipe: { id: recipe.id, element: recipe.element, delivery: recipe.delivery }, anchors: { actorId: event.actorId, targetIds: targets }, intensity: score.intensity, eventType: event.type, skillId: event.skillId, vfxKind: event.vfxKind, outcome: event.outcome, status: event.status },
      );
      if (recipe.delivery === 'beam' || recipe.delivery === 'projectile' || score.area) {
        output.push({ type: 'camera', plan: { style: score.area ? 'impact' : 'track', focusIds: compactIds([event.actorId, ...targets]), durationMs: score.area ? 240 : 180, zoom: score.area ? 1.06 : 1.035 } });
      }
    } else if (event.type === 'damage') {
      output.push(
        { type: 'animation', subjectId: targets[0] ?? '', animation: 'hit', targetIds: targets },
        { type: 'vfx', recipe: { id: `impact:${event.element ?? 'normal'}`, element: event.element, delivery: 'aura' }, anchors: { actorId: event.actorId, targetIds: targets }, intensity: score.intensity, eventType: event.type, skillId: event.skillId, vfxKind: event.vfxKind, outcome: event.outcome, status: event.status },
        { type: 'camera', plan: { style: score.knockout ? 'finisher' : 'impact', focusIds: compactIds([event.actorId, ...targets]), durationMs: score.knockout ? 420 : 160, zoom: score.knockout ? 1.13 : 1.055, shake: score.decisive ? score.intensity : 0 } },
      );
      if (score.intensity >= 0.42) output.push({ type: 'hit-stop', milliseconds: Math.round(30 + score.intensity * 70) });
      const reaction = reactionFor(event.element);
      if (reaction !== 'none') output.push({ type: 'environment', reaction });
    } else if (event.type === 'heal' || event.type === 'status') {
      output.push({ type: 'vfx', recipe: { id: event.type === 'heal' ? 'heal' : `status:${event.status ?? 'generic'}`, element: event.element, delivery: 'aura' }, anchors: { actorId: event.actorId, targetIds: targets }, intensity: Math.max(0.3, score.intensity * 0.75), eventType: event.type, skillId: event.skillId, vfxKind: event.vfxKind, outcome: event.outcome, status: event.status });
    } else if (event.type === 'faint') {
      output.push(
        { type: 'animation', subjectId: targets[0] ?? event.actorId ?? '', animation: 'faint', targetIds: targets },
        { type: 'vfx', recipe: { id: 'faint', element: event.element, delivery: 'aura' }, anchors: { actorId: event.actorId, targetIds: targets }, intensity: 1, eventType: event.type, skillId: event.skillId, vfxKind: event.vfxKind, outcome: { ...event.outcome, ko: true }, status: event.status },
        { type: 'camera', plan: { style: 'finisher', focusIds: compactIds([event.actorId, ...targets]), durationMs: 420, zoom: 1.12 } },
        { type: 'hit-stop', milliseconds: 100 },
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

interface RecipeLike { id: string; element?: TypeName; delivery: 'melee' | 'projectile' | 'beam' | 'area' | 'aura'; }
function recipeFor(event: BattlePresentationEvent): RecipeLike {
  if (event.skillId && SKILL_VISUAL_RECIPE_MAP[event.skillId]) return SKILL_VISUAL_RECIPE_MAP[event.skillId]!;
  const delivery = event.vfxKind === 'melee' ? 'melee' : event.vfxKind === 'beam' ? 'beam' : event.vfxKind === 'burst' ? 'area' : event.vfxKind === 'cast' ? 'aura' : 'projectile';
  return { id: event.skillId === '__normal__' ? 'normal-attack' : `fallback:${event.element ?? 'normal'}`, element: event.element, delivery };
}
function animationFor(recipe: RecipeLike): CombatantAnimation {
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