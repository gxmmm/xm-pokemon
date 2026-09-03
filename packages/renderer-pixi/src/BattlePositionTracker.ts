import type { BattleStagePoint } from './battle-stage-layout.ts';
import { smoothBattlePresentationAxis } from './battle-motion.ts';

export interface BattlePositionTarget {
  point: BattleStagePoint;
  groundPoint: BattleStagePoint;
  scale: number;
  groundScale: number;
}

export interface BattlePositionFrame extends BattlePositionTarget {
  uid: string;
}

interface BattlePositionState extends BattlePositionTarget {
  uid: string;
  targetPoint: BattleStagePoint;
  velocity: BattleStagePoint;
  targetGroundPoint: BattleStagePoint;
  groundVelocity: BattleStagePoint;
  targetScale: number;
  targetGroundScale: number;
}

/** Keeps one coherent motion record per combatant instead of parallel maps. */
export class BattlePositionTracker {
  private readonly states = new Map<string, BattlePositionState>();

  get size(): number {
    return this.states.size;
  }

  setTarget(uid: string, target: BattlePositionTarget, snap = false): BattlePositionFrame {
    let state = this.states.get(uid);
    if (!state) {
      state = {
        uid,
        point: { ...target.point },
        targetPoint: { ...target.point },
        velocity: { x: 0, y: 0 },
        groundPoint: { ...target.groundPoint },
        targetGroundPoint: { ...target.groundPoint },
        groundVelocity: { x: 0, y: 0 },
        scale: target.scale,
        targetScale: target.scale,
        groundScale: target.groundScale,
        targetGroundScale: target.groundScale,
      };
      this.states.set(uid, state);
    } else {
      state.targetPoint = { ...target.point };
      state.targetGroundPoint = { ...target.groundPoint };
      state.targetScale = target.scale;
      state.targetGroundScale = target.groundScale;
      if (snap) {
        state.point = { ...target.point };
        state.velocity = { x: 0, y: 0 };
        state.groundPoint = { ...target.groundPoint };
        state.groundVelocity = { x: 0, y: 0 };
        state.scale = target.scale;
        state.groundScale = target.groundScale;
      }
    }
    return this.frameFor(state);
  }

  getPosition(uid: string): BattleStagePoint | undefined {
    const point = this.states.get(uid)?.point;
    return point ? { ...point } : undefined;
  }

  getFrame(uid: string): BattlePositionFrame | undefined {
    const state = this.states.get(uid);
    return state ? this.frameFor(state) : undefined;
  }

  update(dt: number): readonly BattlePositionFrame[] {
    const scaleBlend = 1 - Math.exp(-dt * 12);
    const frames: BattlePositionFrame[] = [];
    for (const state of this.states.values()) {
      const horizontal = smoothBattlePresentationAxis(state.point.x, state.targetPoint.x, state.velocity.x, 0.11, dt);
      const vertical = smoothBattlePresentationAxis(state.point.y, state.targetPoint.y, state.velocity.y, 0.13, dt);
      state.point.x = horizontal.value;
      state.point.y = vertical.value;
      state.velocity.x = horizontal.velocity;
      state.velocity.y = vertical.velocity;

      const groundHorizontal = smoothBattlePresentationAxis(state.groundPoint.x, state.targetGroundPoint.x, state.groundVelocity.x, 0.11, dt);
      const groundVertical = smoothBattlePresentationAxis(state.groundPoint.y, state.targetGroundPoint.y, state.groundVelocity.y, 0.13, dt);
      state.groundPoint.x = groundHorizontal.value;
      state.groundPoint.y = groundVertical.value;
      state.groundVelocity.x = groundHorizontal.velocity;
      state.groundVelocity.y = groundVertical.velocity;

      state.scale += (state.targetScale - state.scale) * scaleBlend;
      state.groundScale += (state.targetGroundScale - state.groundScale) * scaleBlend;
      frames.push(this.frameFor(state));
    }
    return frames;
  }

  remove(uid: string): void {
    this.states.delete(uid);
  }

  clear(): void {
    this.states.clear();
  }

  private frameFor(state: BattlePositionState): BattlePositionFrame {
    return {
      uid: state.uid,
      point: { ...state.point },
      groundPoint: { ...state.groundPoint },
      scale: state.scale,
      groundScale: state.groundScale,
    };
  }
}
