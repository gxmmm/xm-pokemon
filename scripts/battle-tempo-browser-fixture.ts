import { BattleSim, createWildInstance } from '@pokemon-online/engine';
import { BattleStage } from '../packages/renderer-pixi/src/BattleStage.ts';
import { BattleDirector } from '../packages/presentation/src/director.ts';
import { toBattlePresentationEvent } from '../packages/presentation/src/battle.ts';
import type { CombatantView } from '../packages/renderer-pixi/src/CombatantView.ts';
import { combatHud } from '../apps/web/src/battle/CombatHud.ts';

export async function createBattleTempoFixture() {
  const host = document.createElement('div'); Object.assign(host.style, { position: 'fixed', inset: '0', zIndex: '9999' }); document.body.append(host);
  const stage = new BattleStage(); await stage.mount(host);
  const make = (id: number, uid: string, activeSkills: string[]) => ({ ...createWildInstance(id, 50, { rng: () => .5 }), uid, activeSkills, passiveSkills: [], ability: 'keen-eye', personality: 'cool' as const });
  let sim: BattleSim, director: BattleDirector, cursor = 0;
  return {
    async start(id: number, skill: string) {
      sim = new BattleSim({ mode: 'pvp', player: [make(id, 'actor', [skill]), ...(id === 113 ? [make(68, 'patient', [])] : [])], enemy: [make(143, 'target', [])], seed: 41 });
      director = new BattleDirector(); cursor = sim.state.events.length;
      const actor = sim.state.combatants[0]!;
      actor.position = actor.pixel = { x: 5, y: 7 }; actor.stats.spd = 200;
      actor.cooldowns[skill] = 1.7;
      const target = sim.state.combatants.find(c => c.uid === 'target')!;
      target.position = target.pixel = { x: actor.rangedRole ? 9 : 7, y: 7 };
      target.currentHp = target.maxHp = 100000; target.status = 'sleep'; target.statusTimer = 100;
      const patient = sim.state.combatants.find(c => c.uid === 'patient');
      if (patient) { patient.position = patient.pixel = { x: 8, y: 10 }; patient.currentHp *= .3; patient.status = 'sleep'; patient.statusTimer = 100; }
      await stage.enterBattle({ biomeId: 'grass', combatants: sim.state.combatants });
    },
    async step() {
      sim.tick(.05);
      stage.applyBattleSnapshot({ time: sim.state.time, combatants: sim.state.combatants });
      await stage.playBattleCues(director.direct(sim.state.events.slice(cursor).map(toBattlePresentationEvent)).map(c => c.cue));
      cursor = sim.state.events.length;
    },
    read() {
      const views = (stage as unknown as { combatants: { views: Map<string, CombatantView> } }).combatants.views;
      return { time: sim.state.time, actor: views.get('actor')!.getDiagnostics(), hud: combatHud(sim.state.combatants[0]!, sim.state.time), events: sim.state.events.filter(e => e.actor === 'actor' && e.type === 'skill' && e.vfx?.kind !== 'cast').map(e => ({ t: e.t, skillId: e.skillId })) };
    },
    destroy() { stage.unmount(); host.remove(); },
  };
}
