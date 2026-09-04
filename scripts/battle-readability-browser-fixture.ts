import { BattleSim, createWildInstance } from '@pokemon-online/engine';
import type { BattleCue, CameraPlan } from '@pokemon-online/presentation';
import { BattleStage } from '../packages/renderer-pixi/src/BattleStage.ts';

/** Test-only dense 3v3 composition; no simulation, login or saved data is changed. */
export async function createBattleReadabilityFixture() {
  const sim = new BattleSim({ mode: 'pvp', player: [6, 9, 94].map((id) => createWildInstance(id, 100, { rng: () => 0.5 })),
    enemy: [3, 25, 143].map((id) => createWildInstance(id, 100, { rng: () => 0.5 })), seed: 904 });
  const combatants = sim.state.combatants.map((combatant, index) => ({ ...combatant,
    uid: `unit-${index}`, pixel: { x: index < 3 ? 5 + index * 1.6 : 13 + (index - 3) * 1.6, y: index % 3 === 1 ? 9 : 7.5 },
    status: index === 5 ? 'sleep' as const : null, statusTimer: index === 5 ? 2 : 0, castProgress: null }));
  const section = document.createElement('section');
  section.id = 'readability-fixture';
  Object.assign(section.style, { position: 'fixed', inset: '0', zIndex: '9999', background: '#10201d', color: 'white', padding: '20px' });
  const label = document.createElement('h2');
  label.textContent = '3v3 密集范围特效 · 地面光圈 / 角色 / 命中前景';
  const host = document.createElement('div');
  Object.assign(host.style, { width: '1120px', height: '630px' });
  section.append(label, host);
  document.body.append(section);
  const stage = new BattleStage();
  await stage.mount(host);
  await stage.enterBattle({ biomeId: 'grass', combatants });
  const targetIds = combatants.slice(3).map((combatant) => combatant.uid);
  return {
    read: () => ({ ...stage.getDiagnostics(), settled: stage.isSettled() }),
    async play(reduceFlicker = false) {
      stage.setVisualSettings({ reduceFlicker, cameraIntensity: 'reduced' });
      const cues: BattleCue[] = (['fire', 'water', 'psychic'] as const).flatMap((element, index) => [
        { type: 'vfx', recipe: { id: `readability:${element}`, delivery: 'area', element, particleBudget: 16 },
          anchors: { actorId: combatants[index]!.uid, targetIds }, intensity: 0.8, eventType: 'skill' },
        { type: 'environment', reaction: 'splash', anchors: { targetIds } },
      ]);
      await stage.playBattleCues(cues);
    },
    async focus(plans: readonly CameraPlan[]) {
      stage.setVisualSettings({ reduceFlicker: false, cameraIntensity: 'full' });
      label.textContent = '3v3 镜头验收 · 同帧合焦 / 关键目标 / 回归全景';
      await stage.playBattleCues(plans.map((plan) => ({ type: 'camera', plan })));
    },
    destroy() { stage.unmount(); section.remove(); },
  };
}
