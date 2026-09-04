import { BATTLE_CAMERA_MOTION as MOTION, type BattleCameraSpec } from '@pokemon-online/config';
import type { BattleCameraPlan as CameraPlan } from '@pokemon-online/shared';
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
  focusIds: readonly string[];
  style: CameraPlan['style'];
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
  private pending: CameraPlan[] = [];
  private active: { plan: CameraPlan; ageMs: number } | null = null;

  constructor(private readonly resolvePosition: (uid: string) => BattleStagePoint | undefined,
    private readonly cameraSpec: () => BattleCameraSpec) {}

  get isSettled(): boolean {
    return !this.pending.length && !this.active && this.scale === 1 && this.offset.x === 0 && this.offset.y === 0 && this.shake === 0;
  }

  setIntensity(intensity: CameraIntensity): void {
    const previous = this.intensityFactor();
    this.intensity = intensity;
    if (intensity === 'off') this.reset();
    else if (previous > 0) this.shake *= this.intensityFactor() / previous;
  }

  focus(plan: CameraPlan): void {
    if (this.intensity === 'off' || !Object.prototype.hasOwnProperty.call(MOTION.priority, plan.style)
      || !Number.isFinite(plan.durationMs) || plan.durationMs <= 0) return;
    this.pending.push({ ...plan, focusIds: [...plan.focusIds],
      zoom: Number.isFinite(plan.zoom) ? plan.zoom : 1,
      shake: Number.isFinite(plan.shake) ? Math.max(0, plan.shake!) : 0 });
  }

  private selectShot(dt: number): void {
    if (this.active) {
      this.active.ageMs += dt * 1000;
      if (this.active.ageMs >= this.active.plan.durationMs) this.active = null;
    }
    // Resolve before ranking: a missing finisher target cannot steal a valid shot.
    const valid = this.pending.map((plan) => ({ ...plan, focusIds: plan.focusIds.filter((id) => !!this.resolvePosition(id)) }))
      .filter((plan) => plan.style === 'neutral' || plan.focusIds.length > 0);
    this.pending = [];
    if (!valid.length) return;
    const priority = Math.max(...valid.map((plan) => MOTION.priority[plan.style]));
    const peers = valid.filter((plan) => MOTION.priority[plan.style] === priority);
    const first = peers[0]!;
    if (first.style === 'neutral') { this.active = null; return; }
    if (this.active && (priority < MOTION.priority[this.active.plan.style]
      || (priority === MOTION.priority[this.active.plan.style] && this.active.ageMs < MOTION.minHoldMs))) return;
    this.active = { ageMs: 0, plan: {
      style: first.style,
      focusIds: [...new Set(peers.flatMap((plan) => plan.focusIds))].sort(),
      durationMs: Math.max(0, Math.min(MOTION.maxShotMs, Math.max(...peers.map((plan) => plan.durationMs)))),
      zoom: Math.min(...peers.map((plan) => plan.zoom ?? 1)),
      shake: Math.max(...peers.map((plan) => plan.shake ?? 0)),
    } };
    this.shake = Math.max(this.shake, Math.min(2.5, this.active.plan.shake! * 2.5) * this.intensityFactor());
  }

  private updateTarget(camera: BattleCameraSpec): void {
    const points = this.active?.plan.focusIds.map(this.resolvePosition).filter((point): point is BattleStagePoint => !!point) ?? [];
    if (!points.length) {
      this.active = null;
      this.targetOffset = { x: 0, y: 0 };
      this.targetScale = 1;
      return;
    }
    const intensity = this.intensityFactor();
    const decisiveZoom = Math.max(camera.framing.minZoom, Math.min(camera.framing.maxZoom, this.active!.plan.zoom ?? 1));
    const center = {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    };
    const rawOffset = {
      x: Math.max(-camera.framing.maxPanX, Math.min(camera.framing.maxPanX, (DESIGN_WIDTH / 2 - center.x) * 0.18)),
      y: Math.max(-camera.framing.maxPanY, Math.min(camera.framing.maxPanY, (DESIGN_HEIGHT * camera.framing.focusY - center.y) * 0.14)),
    };
    this.targetOffset = { x: rawOffset.x * intensity, y: rawOffset.y * intensity };
    this.targetScale = 1 + (decisiveZoom - 1) * intensity;
  }

  update(dt: number, layers: readonly BattleCameraLayer[], nowMs = performance.now()): void {
    this.boundLayers = layers;
    if (dt <= 0) return;
    this.selectShot(dt);
    const camera = this.cameraSpec();
    this.updateTarget(camera);
    this.scale = damp(this.scale, this.targetScale, dt, MOTION.scaleDamping);
    this.offset.x = damp(this.offset.x, this.targetOffset.x, dt, MOTION.panDamping);
    this.offset.y = damp(this.offset.y, this.targetOffset.y, dt, MOTION.panDamping);
    this.shake = Math.max(0, this.shake - dt * 30);
    const shakeX = this.shake ? Math.sin(nowMs * 0.05) * this.shake : 0;
    const shakeY = this.shake ? Math.cos(nowMs * 0.07) * this.shake * 0.5 : 0;
    for (const { layer, factor, shake } of layers) {
      const scale = 1 + (this.scale - 1) * factor;
      layer.scale.set(scale);
      layer.position.set((1 - scale) * DESIGN_WIDTH / 2 + this.offset.x * factor + (shake ? shakeX : 0),
        (1 - scale) * DESIGN_HEIGHT * camera.framing.focusY + this.offset.y * factor + (shake ? shakeY : 0));
    }
  }

  reset(): void {
    this.pending = [];
    this.active = null;
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
      focusIds: [...this.active?.plan.focusIds ?? []],
      style: this.active?.plan.style ?? 'neutral',
    };
  }

  private intensityFactor(): number {
    return this.intensity === 'full' ? 1 : this.intensity === 'reduced' ? 0.45 : 0;
  }
}

function damp(value: number, target: number, dt: number, rate: number): number {
  const next = target + (value - target) * Math.exp(-dt * rate);
  return Math.abs(next - target) < MOTION.settleEpsilon ? target : next;
}
