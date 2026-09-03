import type { BattleCameraSpec } from '@pokemon-online/config';
import type { CameraIntensity } from '@pokemon-online/renderer';
import type { Container } from 'pixi.js';
import { BATTLE_DESIGN_HEIGHT as DESIGN_HEIGHT, BATTLE_DESIGN_WIDTH as DESIGN_WIDTH, type BattleStagePoint } from './battle-stage-layout.ts';

export interface BattleCameraLayer {
  layer: Container;
  factor: number;
  shake: boolean;
}

export interface BattleCameraDiagnostics {
  scale: number;
  targetScale: number;
  offset: BattleStagePoint;
  targetOffset: BattleStagePoint;
  shake: number;
}

/** Owns spectator focus, damping, shake, and per-layer parallax transforms. */
export class BattleCameraController {
  private scale = 1;
  private offset: BattleStagePoint = { x: 0, y: 0 };
  private targetScale = 1;
  private targetOffset: BattleStagePoint = { x: 0, y: 0 };
  private shake = 0;
  private intensity: CameraIntensity = 'full';
  private boundLayers: readonly BattleCameraLayer[] = [];

  setIntensity(intensity: CameraIntensity): void {
    this.intensity = intensity;
    if (intensity === 'off') {
      this.targetScale = 1;
      this.targetOffset = { x: 0, y: 0 };
      this.shake = 0;
    }
  }

  focus(points: readonly BattleStagePoint[], camera: BattleCameraSpec, zoom: number, shake: number): void {
    const intensity = this.intensityFactor();
    const decisiveZoom = Math.max(camera.framing.minZoom, Math.min(camera.framing.maxZoom, zoom));
    const center = points.length
      ? {
          x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
          y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
        }
      : { x: DESIGN_WIDTH / 2, y: DESIGN_HEIGHT / 2 };
    const rawOffset = {
      x: Math.max(-camera.framing.maxPanX, Math.min(camera.framing.maxPanX, (DESIGN_WIDTH / 2 - center.x) * 0.18)),
      y: Math.max(-camera.framing.maxPanY, Math.min(camera.framing.maxPanY, (DESIGN_HEIGHT * camera.framing.focusY - center.y) * 0.14)),
    };
    this.targetOffset = { x: rawOffset.x * intensity, y: rawOffset.y * intensity };
    this.targetScale = 1 + (decisiveZoom - 1) * intensity;
    this.shake = Math.max(this.shake, Math.min(2.5, shake * 2.5) * intensity);
  }

  update(dt: number, layers: readonly BattleCameraLayer[], nowMs = performance.now()): void {
    this.boundLayers = layers;
    this.scale += (this.targetScale - this.scale) * Math.min(1, dt * 8);
    this.offset.x += (this.targetOffset.x - this.offset.x) * Math.min(1, dt * 7);
    this.offset.y += (this.targetOffset.y - this.offset.y) * Math.min(1, dt * 7);
    this.shake = Math.max(0, this.shake - dt * 30);
    const shakeX = this.shake ? Math.sin(nowMs * 0.05) * this.shake : 0;
    const shakeY = this.shake ? Math.cos(nowMs * 0.07) * this.shake * 0.5 : 0;
    for (const { layer, factor, shake } of layers) {
      const scale = 1 + (this.scale - 1) * factor;
      layer.scale.set(scale);
      layer.position.set(this.offset.x * factor + (shake ? shakeX : 0), this.offset.y * factor + (shake ? shakeY : 0));
    }
  }

  reset(): void {
    this.scale = 1;
    this.offset = { x: 0, y: 0 };
    this.targetScale = 1;
    this.targetOffset = { x: 0, y: 0 };
    this.shake = 0;
    for (const { layer } of this.boundLayers) {
      layer.scale.set(1);
      layer.position.set(0, 0);
    }
    this.boundLayers = [];
  }

  getDiagnostics(): BattleCameraDiagnostics {
    return {
      scale: this.scale,
      targetScale: this.targetScale,
      offset: { ...this.offset },
      targetOffset: { ...this.targetOffset },
      shake: this.shake,
    };
  }

  private intensityFactor(): number {
    return this.intensity === 'full' ? 1 : this.intensity === 'reduced' ? 0.45 : 0;
  }
}
