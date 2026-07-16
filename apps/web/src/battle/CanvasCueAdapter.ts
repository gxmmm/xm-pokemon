/**
 * @canvas-archive-only
 * Archived Canvas compatibility/regression source. It must remain in the
 * repository, but must not be imported, mounted, dynamically loaded, offered
 * as a fallback, or extended by official GPU/Pixi world or battle runtime code.
 */
import type { BattleEvent, BattleVfx } from '@pokemon-online/shared';
import type { DirectedBattleCue } from '@pokemon-online/presentation';

/** Canvas compatibility adapter.
 *
 * BattleDirector is now the only event→cue interpreter. This adapter translates
 * those renderer-neutral cues into the pre-existing Canvas VFX event shape, so
 * the legacy EffectManager can keep drawing while its input no longer comes
 * directly from engine events.
 */
export class CanvasCueAdapter {
  private consumed = new Set<string>();
  private sequence = 0;

  consume(cues: readonly DirectedBattleCue[]): BattleEvent[] {
    const events: BattleEvent[] = [];
    for (const directed of cues) {
      if (this.consumed.has(directed.id)) continue;
      this.consumed.add(directed.id);
      const cue = directed.cue;
      if (cue.type !== 'vfx') continue;
      const target = cue.anchors.targetIds?.[0];
      const vfx = this.vfxFor(cue);
      events.push({
        t: directed.at,
        seq: ++this.sequence,
        type: legacyTypeFor(cue.eventType),
        actor: cue.anchors.actorId,
        target,
        skillId: cue.skillId,
        amount: cue.outcome?.damage,
        vfx,
      });
    }
    return events;
  }

  clear(): void {
    this.consumed.clear();
    this.sequence = 0;
  }

  private vfxFor(cue: Extract<DirectedBattleCue['cue'], { type: 'vfx' }>): BattleVfx {
    const deliveryKind: BattleVfx['kind'] = cue.vfxKind
      ?? (cue.recipe.delivery === 'melee' ? 'melee'
        : cue.recipe.delivery === 'beam' ? 'beam'
          : cue.recipe.delivery === 'area' ? 'burst'
            : cue.eventType === 'damage' ? 'impact'
              : cue.eventType === 'heal' ? 'heal'
                : cue.eventType === 'status' ? 'status'
                  : cue.eventType === 'faint' ? 'faint'
                    : cue.recipe.delivery === 'aura' ? 'cast' : 'projectile');
    return {
      kind: deliveryKind,
      type: cue.recipe.element,
      amount: cue.outcome?.damage,
      status: cue.status,
      crit: cue.outcome?.critical,
      effectiveness: cue.outcome?.effectiveness,
      missed: cue.outcome?.missed,
      ko: cue.outcome?.ko,
      targetUids: cue.anchors.targetIds ? [...cue.anchors.targetIds] : undefined,
    };
  }
}

function legacyTypeFor(type: Extract<DirectedBattleCue['cue'], { type: 'vfx' }>['eventType']): BattleEvent['type'] {
  if (type === 'move') return 'attack';
  if (type === 'cast-start' || type === 'skill') return 'skill';
  return type === 'battle-end' ? 'end' : type;
}