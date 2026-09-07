import { BattleSim, createWildInstance } from '@pokemon-online/engine';
import { BATTLE_ENVIRONMENTS, BATTLE_BODY_DISPLAY } from '@pokemon-online/config';
import { BattleStage } from '../packages/renderer-pixi/src/BattleStage.ts';
import type { CombatantView } from '../packages/renderer-pixi/src/CombatantView.ts';
import type { CombatantSprite } from '../packages/renderer-pixi/src/CombatantSprite.ts';

/** Same deterministic engine snapshots for every spectator-camera candidate. */
export async function createBattleSpacingFixture() {
  const host = document.createElement('div');
  Object.assign(host.style, { position: 'fixed', inset: '0', zIndex: '9999' });
  document.body.append(host);
  const stage = new BattleStage(); await stage.mount(host);
  const camera = BATTLE_ENVIRONMENTS.grass.camera;
  const originalYaw = camera.yawDegrees;
  const originalCameraHeight = camera.height;
  const originalBudget = { ...BATTLE_BODY_DISPLAY };
  const team = (ids: number[], side: string) => ids.map((id, i) => ({ ...createWildInstance(id, 100, { rng: () => 0.5 }), uid: `${side}${i}` }));
  const sim = new BattleSim({ mode: 'pvp', player: team([6, 25, 94], 'p'), enemy: team([3, 9, 143], 'e'), seed: 904 });
  const frames = [structuredClone(sim.state)];
  for (let i = 0; i < 60; i++) { sim.tick(0.05); frames.push(structuredClone(sim.state)); }
  const views = () => (stage as unknown as { combatants: { views: Map<string, CombatantView> } }).combatants.views;
  return {
    async show(tick: number, baseline = false) {
      camera.yawDegrees = baseline ? 0 : originalYaw;
      camera.height = baseline ? 21 : originalCameraHeight;
      Object.assign(BATTLE_BODY_DISPLAY, baseline ? { maxWidth: Infinity, maxHeight: Infinity } : originalBudget);
      const frame = frames[tick]!;
      await stage.enterBattle({ biomeId: 'grass', combatants: frame.combatants.map((c) => ({ ...c, castProgress: null })) });
      return { time: frame.time, positions: frame.combatants.map((c) => ({ uid: c.uid, position: c.position, pixel: c.pixel })), events: frame.events };
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
    destroy() { camera.yawDegrees = originalYaw; camera.height = originalCameraHeight; Object.assign(BATTLE_BODY_DISPLAY, originalBudget); stage.unmount(); host.remove(); },
  };
}
