import type { BattleEvent, BattleVfx } from '@pokemon-online/shared';

export type BattleActionKind = 'melee' | 'projectile' | 'beam' | 'burst';
export interface ActionPose { dx: number; dy: number; tilt: number; scale: number; }
interface ActionState {
  uid: string;
  skillId?: string;
  kind: BattleActionKind;
  t: number;
  life: number;
  nx: number;
  ny: number;
  namedSkill: boolean;
}

type Pt = { x: number; y: number };

/**
 * Short, event-driven body actions for static battle sprites. This deliberately
 * has no idle loop: a unit stays still until it commits to a real attack, then
 * follows one readable anticipation → release → recovery curve.
 */
export class BattleActionTimeline {
  private actions = new Map<string, ActionState>();
  private lastSeq = 0;

  consume(events: readonly BattleEvent[], cellOf: (uid?: string) => Pt | null): void {
    for (const event of events) {
      const seq = event.seq ?? 0;
      if (seq <= this.lastSeq) continue;
      this.lastSeq = Math.max(this.lastSeq, seq);
      if ((event.type !== 'attack' && event.type !== 'skill') || !event.actor || !event.vfx) continue;
      if (event.vfx.kind === 'cast') continue; // castProgress owns the persistent windup pose
      const kind = event.vfx.kind;
      if (kind !== 'melee' && kind !== 'projectile' && kind !== 'beam' && kind !== 'burst') continue;
      const from = cellOf(event.actor);
      const to = cellOf(event.target);
      const dx = (to?.x ?? from?.x ?? 0) - (from?.x ?? 0);
      const dy = (to?.y ?? from?.y ?? 0) - (from?.y ?? 0);
      const length = Math.hypot(dx, dy) || 1;
      const life = kind === 'melee' ? 0.34 : kind === 'beam' ? 0.42 : 0.30;
      this.actions.set(event.actor, {
        uid: event.actor,
        skillId: event.skillId,
        kind,
        t: 0,
        life,
        nx: dx / length,
        ny: dy / length,
        namedSkill: event.type === 'skill' && event.skillId !== '__normal__',
      });
    }
  }

  update(dt: number): void {
    for (const [uid, action] of this.actions) {
      action.t += dt;
      if (action.t >= action.life) this.actions.delete(uid);
    }
  }

  poseOf(uid: string): ActionPose {
    const action = this.actions.get(uid);
    if (!action) return { dx: 0, dy: 0, tilt: 0, scale: 1 };
    const k = Math.min(1, action.t / action.life);
    const facing = action.nx >= 0 ? 1 : -1;
    if (action.kind === 'melee') {
      if (k < 0.22) {
        const p = k / 0.22;
        return { dx: -action.nx * 5 * p, dy: -action.ny * 3 * p, tilt: -facing * 0.07 * p, scale: 0.98 };
      }
      const p = (k - 0.22) / 0.78;
      const lunge = Math.sin(Math.PI * p);
      return { dx: action.nx * 13 * lunge, dy: action.ny * 8 * lunge, tilt: facing * 0.10 * lunge, scale: 1 + lunge * 0.035 };
    }
    if (action.kind === 'beam') {
      const lean = k < 0.28 ? -Math.sin((k / 0.28) * Math.PI * 0.5) : Math.sin(((k - 0.28) / 0.72) * Math.PI) * 0.32;
      return { dx: action.nx * lean * 6, dy: action.ny * lean * 3, tilt: -facing * lean * 0.07, scale: 1 };
    }
    const p = Math.sin(Math.PI * k);
    return { dx: -action.nx * p * 4, dy: -action.ny * p * 2, tilt: -facing * p * 0.045, scale: 1 };
  }

  /** Skill projectiles originate at a readable body anchor rather than sprite center. */
  anchorOf(uid: string, kind: BattleVfx['kind'], center: Pt | null): Pt | null {
    if (!center) return null;
    const action = this.actions.get(uid);
    const nx = action?.nx ?? 1;
    const ny = action?.ny ?? 0;
    if (kind === 'melee') return { x: center.x + nx * 17, y: center.y + ny * 8 + 4 };
    if (kind === 'projectile' || kind === 'beam') return { x: center.x + nx * 14, y: center.y - 11 + ny * 4 };
    return { x: center.x + nx * 7, y: center.y - 5 };
  }

  labelOf(uid: string): { skillId?: string; progress: number } | null {
    const action = this.actions.get(uid);
    if (!action?.namedSkill) return null;
    return { skillId: action.skillId, progress: Math.min(1, action.t / action.life) };
  }

  isActive(): boolean { return this.actions.size > 0; }

  clear(): void { this.actions.clear(); this.lastSeq = 0; }
}
