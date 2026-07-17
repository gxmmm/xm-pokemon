import { BattleDirector, interpolateBattle, snapshotBattle, toBattlePresentationEvent, type BattlePresentation, type BattleSnapshot, type DirectedBattleCue } from '@pokemon-online/presentation';
import type { BattleCombatant, BattleEvent } from '@pokemon-online/shared';

/** The renderer-facing subset of a BattleSim. Keeping the bridge on structured
 * shared DTOs prevents it from depending on simulation internals or a concrete
 * Vue/Canvas/Pixi consumer. */
export interface BattlePresentationSource {
  readonly isOver: boolean;
  readonly state: {
    readonly time: number;
    readonly combatants: readonly BattleCombatant[];
    readonly events: readonly BattleEvent[];
  };
}

export interface BattlePresentationFrame {
  presentation: BattlePresentation;
  /** Newly directed cues since the previous advance. Consumers deduplicate by
   * cue id, so this remains safe across delayed Vue component updates. */
  cues: readonly DirectedBattleCue[];
  /** Events that crossed the delayed presentation cursor this advance. */
  newEvents: readonly BattleEvent[];
  isCaughtUp: boolean;
}

export interface BattlePresentationBridgeOptions {
  presentationDelay?: number;
  snapshotHistory?: number;
}

/**
 * Owns the non-authoritative, delayed battle presentation clock. The simulator
 * keeps advancing independently; hit-stop pauses only this bridge so renderers
 * can hold an impact frame without affecting rules, cooldowns, or AI.
 *
 * This is intentionally framework and renderer agnostic. BattleView supplies
 * the simulation DTO and passes the returned frame to the Canvas compatibility
 * renderer today; a future GPU BattleStage can consume the same frame.
 */
export class BattlePresentationBridge {
  private readonly presentationDelay: number;
  private readonly snapshotHistory: number;
  private readonly director = new BattleDirector();
  private snapshots: BattleSnapshot[] = [];
  private presentationTime = 0;
  private presentationHold = 0;
  private lastPresentationSequence = 0;
  private current: BattlePresentation | null = null;

  constructor(options: BattlePresentationBridgeOptions = {}) {
    this.presentationDelay = options.presentationDelay ?? 0.28;
    this.snapshotHistory = options.snapshotHistory ?? 30;
  }

  get frame(): BattlePresentation | null { return this.current; }
  get time(): number { return this.presentationTime; }

  reset(source?: BattlePresentationSource): BattlePresentation | null {
    this.snapshots = [];
    this.presentationTime = 0;
    this.presentationHold = 0;
    this.lastPresentationSequence = 0;
    this.current = null;
    this.director.reset();
    if (!source) return null;
    this.captureSnapshot(source);
    this.current = { time: 0, combatants: this.presentationCombatants(0), events: [] };
    return this.current;
  }

  /** Holds only the delayed visual cursor. The duration is clamped so a stream
   * of compatibility-renderer impact signals can never stall battle playback. */
  requestHitStop(intensity: number): void {
    this.presentationHold = Math.max(this.presentationHold, Math.min(0.20, 0.075 + intensity * 0.10));
  }

  private requestActionWindow(milliseconds: number): void {
    // The timeline, not the renderer queue, owns the wait. A cap prevents a
    // malformed DTO from stalling playback while preserving readable actions.
    this.presentationHold = Math.max(this.presentationHold, Math.min(1.3, milliseconds / 1000));
  }

  advance(source: BattlePresentationSource, dtScaled: number): BattlePresentationFrame {
    this.captureSnapshot(source);
    // Never snap presentation to a far-ahead simulation clock. Action windows
    // intentionally create a visible delay; snapshot history keeps the player
    // on a continuous earlier timeline until every shown action has played.
    const target = source.isOver ? source.state.time : Math.max(0, source.state.time - this.presentationDelay);
    if (this.presentationHold > 0) {
      this.presentationHold = Math.max(0, this.presentationHold - dtScaled);
    } else {
      const gap = Math.max(0, target - this.presentationTime);
      this.presentationTime = Math.min(target, this.presentationTime + dtScaled * (gap > 2 ? 1.18 : 1));
    }

    const events = source.state.events.filter((event) => event.t <= this.presentationTime + 0.001);
    const newEvents = events.filter((event) => (event.seq ?? 0) > this.lastPresentationSequence);
    if (events.length) this.lastPresentationSequence = Math.max(this.lastPresentationSequence, events[events.length - 1]!.seq ?? 0);

    const presentation: BattlePresentation = {
      time: this.presentationTime,
      combatants: this.presentationCombatants(this.presentationTime),
      events,
    };
    this.current = presentation;
    const cues = this.director.direct(events.map(toBattlePresentationEvent));
    const actionWindowMs = cues.reduce((longest, directed) => directed.cue.type === 'action-window' ? Math.max(longest, directed.cue.milliseconds) : longest, 0);
    if (actionWindowMs > 0) this.requestActionWindow(actionWindowMs);
    return {
      presentation,
      cues,
      newEvents,
      isCaughtUp: this.isCaughtUp(source),
    };
  }

  isCaughtUp(source: BattlePresentationSource): boolean {
    return this.presentationTime >= source.state.time - 0.001;
  }

  private captureSnapshot(source: BattlePresentationSource): void {
    const time = source.state.time;
    const last = this.snapshots[this.snapshots.length - 1];
    if (!last || time > last.time) this.snapshots.push(snapshotBattle(time, source.state.combatants));
    else if (last.time === time) this.snapshots[this.snapshots.length - 1] = snapshotBattle(time, source.state.combatants);
    // Never discard snapshots the delayed cursor has not reached. Action
    // windows can deliberately put the simulation far ahead of presentation;
    // pruning by real time alone would force interpolateBattle to jump to the
    // oldest remaining snapshot. Once the viewer has passed a snapshot, retain
    // only a short guard window behind it plus the normal history bound.
    const keepFrom = Math.max(0, Math.min(time - this.snapshotHistory, this.presentationTime - 1));
    while (this.snapshots.length > 2 && this.snapshots[1]!.time < keepFrom) this.snapshots.shift();
  }

  private presentationCombatants(at: number): BattleCombatant[] {
    if (this.snapshots.length === 0) return [];
    let before = this.snapshots[0]!;
    let after = this.snapshots[this.snapshots.length - 1]!;
    for (let index = 1; index < this.snapshots.length; index++) {
      if (this.snapshots[index]!.time >= at) {
        after = this.snapshots[index]!;
        before = this.snapshots[index - 1]!;
        break;
      }
    }
    return interpolateBattle(before, after, at);
  }
}
