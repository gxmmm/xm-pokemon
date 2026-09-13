import type { BattleCameraSpec } from '@pokemon-online/config';
import type { BattleCameraPlan as CameraPlan } from '@pokemon-online/shared';
import type { Container } from 'pixi.js';
import type { BattleStagePoint } from './battle-stage-layout.ts';

export interface BattleCameraLayer { layer: Container; factor: number; shake: boolean; }
export interface BattleCameraDiagnostics {
  scale: number; targetScale: number; offset: BattleStagePoint; targetOffset: BattleStagePoint;
  shake: number; focusIds: readonly string[]; style: CameraPlan['style'];
}

/** 战场统一固定全景；技能、暴击和倒下均不移动、缩放或震动镜头。 */
export class BattleCameraController {
  private boundLayers: readonly BattleCameraLayer[] = [];
  constructor(_resolvePosition: (uid: string) => BattleStagePoint | undefined, _cameraSpec: () => BattleCameraSpec) {}
  get isSettled(): boolean { return true; }
  focus(_plan: CameraPlan): void {}
  update(_dt: number, layers: readonly BattleCameraLayer[], _nowMs?: number): void {
    this.boundLayers = layers;
    for (const { layer } of layers) { layer.scale.set(1); layer.position.set(0, 0); }
  }
  reset(): void {
    for (const { layer } of this.boundLayers) { layer.scale.set(1); layer.position.set(0, 0); }
    this.boundLayers = [];
  }
  getDiagnostics(): BattleCameraDiagnostics {
    return { scale: 1, targetScale: 1, offset: { x: 0, y: 0 }, targetOffset: { x: 0, y: 0 }, shake: 0, focusIds: [], style: 'neutral' };
  }
}
