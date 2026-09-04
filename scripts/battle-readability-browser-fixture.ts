import { BattleSim, createWildInstance } from '@pokemon-online/engine';
import { BATTLE_ENVIRONMENTS, type BattleEnvironmentId } from '@pokemon-online/config';
import { projectBattleGroundPoint } from '../packages/renderer-pixi/src/battle-ground.ts';
import type { BattleCue, CameraPlan } from '@pokemon-online/presentation';
import { BattleStage } from '../packages/renderer-pixi/src/BattleStage.ts';
import type { CombatantView } from '../packages/renderer-pixi/src/CombatantView.ts';

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
  // Test-only inspection keeps per-model diagnostic plumbing out of the app API.
  const views = (stage as unknown as { combatants: { views: Map<string, CombatantView> } }).combatants.views;
  return {
    read: () => ({ ...stage.getDiagnostics(), settled: stage.isSettled(),
      motions: Object.fromEntries([...views].map(([uid, view]) => [uid, view.getDiagnostics()])) }),
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
    async exchange(action: 'start' | 'hit' | 'interrupt') {
      if (action === 'start') {
        label.textContent = '3v3 连续受击验收 · 攻击 / 持续施法 / 蓄力';
        stage.setVisualSettings({ cameraIntensity: 'off' });
        stage.applyBattleSnapshot({ time: 0, combatants: combatants.map((combatant, index) => index === 2
          ? { ...combatant, castProgress: { skillId: 'hyper-beam', remaining: 0.6 } } : combatant) });
        await stage.playBattleCues((['beam', 'melee'] as const).flatMap((animation, index) => [
          { type: 'animation', subjectId: `unit-${index}`, animation, durationMs: 600 },
          { type: 'animation', subjectId: `unit-${index}`, animation: 'recoil', schedule: 'after-current-motion', durationMs: 160 },
        ]));
      } else if (action === 'hit') {
        await stage.playBattleCues([0, 1, 2].flatMap((index) => [
          { type: 'animation', subjectId: `unit-${index}`, animation: 'hit' },
          { type: 'vfx', recipe: { id: 'impact:normal', delivery: 'aura' }, anchors: { targetIds: [`unit-${index}`] }, intensity: 0.3 },
        ]));
      } else {
        stage.applyBattleSnapshot({ time: 0.3, combatants });
        await stage.playBattleCues([{ type: 'animation', subjectId: 'unit-2', animation: 'interrupt' }]);
      }
    },
    async movement(ticks = 11) {
      label.textContent = `移动与停靠间距验收 · 固定 3v3 / ${(ticks * 0.05).toFixed(2)} 秒 · 中性姿态`;
      const team = (ids: number[], side: string) => ids.map((id, index) => ({ ...createWildInstance(id, 100, { rng: () => 0.5 }), uid: `${side}${index}` }));
      const battle = new BattleSim({ mode: 'pvp', player: team([6, 25, 94], 'p'), enemy: team([3, 9, 143], 'e'), seed: 904 });
      let minimum = Infinity;
      let allyDestinationMinimum = Infinity;
      for (let tick = 0; tick < ticks; tick++) {
        battle.tick(0.05);
        const alive = battle.state.combatants.filter((c) => c.alive);
        alive.forEach((a, index) => alive.slice(index + 1).forEach((b) => {
          minimum = Math.min(minimum, Math.hypot(a.pixel.x - b.pixel.x, a.pixel.y - b.pixel.y));
          if (a.side === b.side) allyDestinationMinimum = Math.min(allyDestinationMinimum,
            Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y));
        }));
      }
      stage.setVisualSettings({ cameraIntensity: 'off' });
      // Keep authoritative positions; remove only charge poses to isolate spacing.
      await stage.enterBattle({ biomeId: 'grass', combatants: battle.state.combatants.map((c) => ({ ...c, castProgress: null })) });
      return { minimum, allyDestinationMinimum, time: battle.state.time };
    },
    async projection(biomeId: BattleEnvironmentId) {
      label.textContent = `投影边界验收 · ${biomeId} · 远端 / 近端 / 左右边缘 / 中央小体型`;
      const cells = [{ x: 1, y: 7 }, { x: 9, y: 0 }, { x: 18, y: 7 }, { x: 10, y: 13 }, { x: 10, y: 6 }, { x: 10, y: 8 }];
      stage.setVisualSettings({ cameraIntensity: 'off' });
      await stage.enterBattle({ biomeId, combatants: combatants.map((c, index) => ({ ...c,
        position: cells[index]!, pixel: cells[index]!, status: null, statusTimer: 0, castProgress: null })) });
      return cells.map((cell) => projectBattleGroundPoint(cell.x, cell.y, BATTLE_ENVIRONMENTS[biomeId].camera));
    },
    destroy() { stage.unmount(); section.remove(); },
  };
}
