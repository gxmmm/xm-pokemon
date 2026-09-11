import { BattleSim, createWildInstance } from '@pokemon-online/engine';
import { BATTLE_BODY_DISPLAY } from '@pokemon-online/config';
import { BattleStage } from '../packages/renderer-pixi/src/BattleStage.ts';
import { BattleDirector } from '../packages/presentation/src/director.ts';
import { toBattlePresentationEvent } from '../packages/presentation/src/battle.ts';
import type { CombatantView } from '../packages/renderer-pixi/src/CombatantView.ts';
import type { CombatantSprite } from '../packages/renderer-pixi/src/CombatantSprite.ts';

/** Same deterministic engine snapshots for every spectator-camera candidate. */
export async function createBattleSpacingFixture() {
  const host = document.createElement('div');
  Object.assign(host.style, { position: 'fixed', inset: '0', zIndex: '9999' });
  document.body.append(host);
  const stage = new BattleStage(); await stage.mount(host);
  const originalBudget = { ...BATTLE_BODY_DISPLAY };
  const team = (ids: number[], side: string) => ids.map((id, i) => ({ ...createWildInstance(id, 100, { rng: () => 0.5 }), uid: `${side}${i}` }));
  const sim = new BattleSim({ mode: 'pvp', player: team([6, 25, 94], 'p'), enemy: team([3, 9, 143], 'e'), seed: 904 });
  const frames = [structuredClone(sim.state)];
  for (let i = 0; i < 120; i++) { sim.tick(0.05); frames.push(structuredClone(sim.state)); }
  const views = () => (stage as unknown as { combatants: { views: Map<string, CombatantView> } }).combatants.views;
  return {
    async show(tick: number) {
      const frame = frames[tick]!;
      await stage.enterBattle({ biomeId: 'grass', combatants: frame.combatants });
      return { time: frame.time, positions: frame.combatants.map(c => ({ uid: c.uid, position: c.position, pixel: c.pixel })), events: frame.events };
    },
    async flame(phase: 'windup' | 'release' | 'interrupt') {
      const demo = new BattleSim({ mode: 'pvp', player: team([6, 68, 65], 'p'), enemy: team([143, 9, 94], 'e'), seed: 904 });
      const points = [[5,7],[8,4],[4,11],[10,7],[10,10],[13,3]];
      demo.state.combatants.forEach((c,i) => { c.position = { x: points[i]![0]!, y: points[i]![1]! }; c.pixel = { ...c.position }; });
      const actor = demo.state.combatants[0]!;
      actor.currentTargetUid = demo.state.combatants[3]!.uid;
      const engine = demo as unknown as { startCast(c: typeof actor, id: string): boolean; resolveSkill(c: typeof actor, id: string): void; interruptCast(c: typeof actor): void };
      engine.startCast(actor, 'flamethrower');
      await stage.enterBattle({ biomeId: 'grass', combatants: structuredClone(demo.state.combatants) });
      if (phase === 'release') {
        const offset = demo.state.events.length;
        engine.resolveSkill(actor, 'flamethrower'); actor.castProgress = null;
        stage.applyBattleSnapshot({ time: demo.state.time, combatants: demo.state.combatants });
        await stage.playBattleCues(new BattleDirector().direct(demo.state.events.slice(offset).map(toBattlePresentationEvent)).map(c => c.cue));
      } else if (phase === 'interrupt') {
        engine.interruptCast(actor);
        stage.applyBattleSnapshot({ time: demo.state.time, combatants: demo.state.combatants });
      }
      return { zoneCount: (stage as unknown as { castZones: { container: { children: unknown[] } } }).castZones.container.children.length,
        release: demo.state.events.findLast(e => e.type === 'skill' && e.vfx?.to) };
    },
    read() {
      return { ...stage.getDiagnostics(), bodies: [...views()].map(([uid, view]) => {
        const body = view.children[1]!;
        const bounds = body.getBounds();
        const internals = view as unknown as { sprite: CombatantSprite; baseScale: number; presentation: { profile: { scale: number } } };
        const opaque = internals.sprite.getBodyBounds(true);
        const authored = internals.presentation.profile.scale;
        return { uid, ready: view.getDiagnostics().spriteReady, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
          bodyHeight: opaque.height * internals.baseScale, bodyWidth: opaque.width * internals.baseScale,
          small: opaque.height * authored <= originalBudget.maxHeight && opaque.width * authored <= originalBudget.maxWidth,
          sizeRatio: internals.baseScale / authored };
      }) };
    },
    destroy() { stage.unmount(); host.remove(); },
  };
}
