/**
 * @canvas-archive-only
 * Archived Canvas compatibility/regression source. It must remain in the
 * repository, but must not be imported, mounted, dynamically loaded, offered
 * as a fallback, or extended by official GPU/Pixi world or battle runtime code.
 */
import type { StatusKind, TypeName } from '@pokemon-online/shared';
import { TYPE_COLORS } from '@pokemon-online/config';

export type FxFamily = 'orb' | 'bolt' | 'beam' | 'wave' | 'storm' | 'meteor' | 'blade' | 'dash' | 'fang' | 'drain' | 'curse' | 'guard' | 'heal' | 'powder' | 'rune';
export interface SkillFxProfile { family: FxFamily; accent?: string; trail?: string; scale?: number; spin?: number; }

/** Canvas compatibility VFX data shared by the event adapter and drawing primitives. */
export type CanvasEffect =
  | { kind: 'projectile'; x: number; y: number; tx: number; ty: number; t: number; life: number; color: string; profile: SkillFxProfile; imgName?: string; }
  | { kind: 'slash'; x: number; y: number; ang: number; t: number; life: number; color: string; profile: SkillFxProfile; }
  | { kind: 'burst'; x: number; y: number; t: number; life: number; color: string; r: number; profile?: SkillFxProfile; delay?: number; imgName?: string; }
  | { kind: 'beam'; x: number; y: number; tx: number; ty: number; t: number; life: number; color: string; profile: SkillFxProfile; }
  | { kind: 'cast'; x: number; y: number; t: number; life: number; color: string; profile: SkillFxProfile; }
  | { kind: 'number'; x: number; y: number; t: number; life: number; text: string; color: string; size: number; delay?: number; }
  | { kind: 'heal'; x: number; y: number; t: number; life: number; imgName?: string; }
  | { kind: 'status'; x: number; y: number; t: number; life: number; color: string; }
  | { kind: 'faint'; x: number; y: number; t: number; life: number; }
  | { kind: 'shield'; x: number; y: number; t: number; life: number; imgName?: string; }
  | { kind: 'arrow'; x: number; y: number; t: number; life: number; up: boolean; color: string; }
  | { kind: 'dust'; x: number; y: number; t: number; life: number; color: string; };

export const STATUS_COLOR: Record<StatusKind, string> = {
  burn: '#ff5a2a', poison: '#a33ea1', paralyze: '#f7d02c',
  freeze: '#9fd8ff', sleep: '#8888aa', confuse: '#f95587',
};

export function typeColor(type?: TypeName): string {
  return (type && TYPE_COLORS[type]) || '#f2f2f2';
}
