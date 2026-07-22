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
