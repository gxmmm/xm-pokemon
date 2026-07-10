/**
 * RNG helpers. A seeded mulberry32 generator is used by the battle simulator
 * so a battle can be reproduced from its seed (useful for PVP logs/replays).
 * Breeding and other one-off rolls use Math.random for genuine variety.
 */

export type RNG = () => number;

export function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string into a 32-bit seed (deterministic from uids, etc). */
export function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function randomInt(rng: RNG, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function chance(rng: RNG, p: number): boolean {
  return rng() < p;
}

export function pick<T>(rng: RNG, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function weightedPick<T>(rng: RNG, arr: readonly T[], weights: (item: T) => number): T {
  const total = arr.reduce((s, x) => s + Math.max(0, weights(x)), 0);
  let r = rng() * total;
  for (const x of arr) {
    r -= Math.max(0, weights(x));
    if (r <= 0) return x;
  }
  return arr[arr.length - 1];
}

export function shuffle<T>(rng: RNG, arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Math.random-based helpers for non-deterministic rolls (breeding, encounters).
export const rand = {
  int(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },
  float(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  },
  chance(p: number): boolean {
    return Math.random() < p;
  },
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  },
  weighted<T>(arr: readonly T[], weights: (item: T) => number): T {
    const total = arr.reduce((s, x) => s + Math.max(0, weights(x)), 0);
    let r = Math.random() * total;
    for (const x of arr) {
      r -= Math.max(0, weights(x));
      if (r <= 0) return x;
    }
    return arr[arr.length - 1];
  },
  shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },
};
