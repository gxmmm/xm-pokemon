import { BattleSim, createWildInstance } from '@pokemon-online/engine';
import { BattleDirector } from '@pokemon-online/presentation';
import { SKILL_MAP } from '@pokemon-online/config';
import { buildVfxLabCues } from '../apps/web/src/battle/VfxLab.ts';
import { BattleStage } from '../packages/renderer-pixi/src/BattleStage.ts';
import type { CombatantView } from '../packages/renderer-pixi/src/CombatantView.ts';

export const SKILL_SHOWCASES = [
  { id: 'flamethrower', species: 6 }, { id: 'water-gun', species: 9 },
  { id: 'thunderbolt', species: 25 }, { id: 'shadow-ball', species: 94 },
  { id: 'hyper-beam', species: 149 }, { id: 'karate-chop', species: 68 },
] as const;

/** Isolated inputs through the same director and stage used by the game. */
export async function createSkillShowcaseFixture() {
  const section = document.createElement('section');
  Object.assign(section.style, { position: 'fixed', inset: '0', zIndex: '9999', background: '#10201d', color: 'white', padding: '20px' });
  const label = document.createElement('h2');
  const host = document.createElement('div');
  Object.assign(host.style, { width: '1120px', height: '630px' });
  section.append(label, host); document.body.append(section);
  const stage = new BattleStage(); await stage.mount(host);

  return {
    async play(index: number, reverse: boolean) {
      const entry = SKILL_SHOWCASES[index]!;
      const melee = SKILL_MAP[entry.id]!.range === 'melee';
      const sim = new BattleSim({ mode: 'pvp', player: [createWildInstance(entry.species, 100, { rng: () => 0.5 })],
        enemy: [createWildInstance(143, 100, { rng: () => 0.5 })], seed: 904 });
      const cells = melee ? [{ x: 10, y: 7 }, { x: 12, y: 8 }] : [{ x: 5, y: 10 }, { x: 15, y: 5 }];
      const combatants = sim.state.combatants.map((c, i) => ({ ...c, uid: i ? 'target' : 'caster',
        facing: (reverse ? (i ? 1 : -1) : (i ? -1 : 1)) as 1 | -1,
        position: cells[reverse ? 1 - i : i]!, pixel: cells[reverse ? 1 - i : i]!, castProgress: null }));
      label.textContent = `${SKILL_MAP[entry.id]!.name} · ${reverse ? '反向' : '斜向'} · 标准 · 正式动作与命中链路`;
      await stage.enterBattle({ biomeId: 'grass', combatants });

      const cues = buildVfxLabCues(new BattleDirector(), { actorId: 'caster', targetId: 'target', skillId: entry.id, sequence: 1 }, 1, 1);
      const release = cues.find(({ cue }) => cue.type === 'vfx' && cue.eventType === 'skill')!.cue;
      const hit = cues.find(({ cue }) => cue.type === 'vfx' && cue.eventType === 'damage')!.cue;
      await stage.playBattleCues(cues.map(({ cue }) => cue).filter((cue) => cue.type !== 'camera'));
      return { id: entry.id, releaseMs: release.delayMs ?? 0, contactMs: hit.delayMs ?? 0 };
    },
    read: () => ({ ...stage.getDiagnostics(), settled: stage.isSettled(),
      bodyScaleRatios: [...(stage as unknown as { combatants: { views: Map<string, CombatantView> } }).combatants.views.values()]
        .map((view) => Math.abs(view.children[1]!.scale.x / view.children[1]!.scale.y)),
    }),
    destroy() { stage.unmount(); section.remove(); },
  };
}
