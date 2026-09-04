import type { BattleArtMotionKeyframe, BattleArtMotionPose } from '@pokemon-online/config';

const POSE_DEFAULTS: Required<BattleArtMotionPose> = { offsetX: 0, offsetY: 0, rotationDeg: 0, scaleX: 1, scaleY: 1, glowAlpha: 0, glowScale: 1 };

/** Smoothly sample authored poses without affecting the duration of a cue. */
export function sampleBattleMotionPose(base: BattleArtMotionPose, frames: readonly BattleArtMotionKeyframe[] | undefined, progress: number): BattleArtMotionPose {
  if (!frames?.length) return base;
  const t = Math.max(0, Math.min(1, progress));
  const next = frames.findIndex((frame) => frame.at >= t);
  const right = frames[next < 0 ? frames.length - 1 : next]!;
  const left = frames[Math.max(0, next - 1)]!;
  const fraction = right.at > left.at ? (t - left.at) / (right.at - left.at) : 1;
  const amount = fraction * fraction * (3 - 2 * fraction);
  const pose = { ...POSE_DEFAULTS, ...base };
  for (const key of Object.keys(POSE_DEFAULTS) as (keyof BattleArtMotionPose)[]) {
    const from = left[key] ?? pose[key];
    pose[key] = from + ((right[key] ?? pose[key]) - from) * amount;
  }
  return pose;
}

export interface DampedAxisState {
  value: number;
  velocity: number;
}

/** Stable critically damped axis integration for presentation-space motion.
 * Velocity is returned to the caller so a redirected target keeps momentum
 * without overshooting like an under-damped spring. */
export function smoothBattlePresentationAxis(
  current: number,
  target: number,
  velocity: number,
  smoothTime: number,
  dt: number,
): DampedAxisState {
  const safeTime = Math.max(0.001, smoothTime);
  const omega = 2 / safeTime;
  const x = omega * dt;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (velocity + omega * change) * dt;
  return {
    value: target + (change + temp) * decay,
    velocity: (velocity - omega * temp) * decay,
  };
}
