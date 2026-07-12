/**
 * Map-crossing transitions. Replaces instant teleporting: when the player
 * steps on an exit tile, the screen is covered, the map is swapped under the
 * cover, then revealed. `fade`/`cave`/`door` are quick dark wipes; `boat`
 * is a longer letterboxed "sailing" beat with a destination caption.
 *
 * The state is reactive so a Vue overlay can bind to `active`/`kind`/`progress`.
 */
import type { TransitionType } from '@pokemon-online/shared';

export interface TransitionState {
  active: boolean;
  kind: TransitionType;
  phase: 'out' | 'hold' | 'in';
  /** 0..1 progress within the current phase (out: 0->1 cover, in: 1->0 reveal). */
  progress: number;
  label: string;
}

export function createTransitionState(): TransitionState {
  return { active: false, kind: 'fade', phase: 'out', progress: 0, label: '' };
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function animatePhase(state: TransitionState, phase: 'out' | 'in', durMs: number): Promise<void> {
  state.phase = phase;
  const steps = Math.max(1, Math.round(durMs / 16));
  for (let i = 0; i <= steps; i++) {
    state.progress = i / steps;
    await wait(durMs / steps);
  }
  state.progress = phase === 'out' ? 1 : 0;
}

/**
 * Run a full crossing. `switchMap` is invoked during the dark hold to actually
 * swap the map. Resolves once the new map is fully revealed.
 */
export async function runTransition(
  state: TransitionState,
  kind: TransitionType,
  label: string,
  switchMap: () => void,
): Promise<void> {
  if (state.active) return;
  state.active = true;
  state.kind = kind;
  state.label = label;
  const outMs = kind === 'boat' ? 700 : 320;
  const holdMs = kind === 'boat' ? 900 : 140;
  const inMs = kind === 'boat' ? 600 : 280;
  await animatePhase(state, 'out', outMs);
  state.phase = 'hold';
  state.progress = 1;
  switchMap();
  await wait(holdMs);
  await animatePhase(state, 'in', inMs);
  state.active = false;
}
