import assert from 'node:assert/strict';
import { BattleSim, createWildInstance } from '@pokemon-online/engine';
import { combatHud } from '../apps/web/src/battle/CombatHud.ts';
import { CombatantStatusLayer } from '../packages/renderer-pixi/src/CombatantStatusLayer.ts';

export function testBattleHud(): void {
  const sim = new BattleSim({ mode: 'pvp', player: [createWildInstance(6, 70)], enemy: [createWildInstance(9, 70)], seed: 73 });
  const c = sim.state.combatants[0]!;
  Object.assign(c, { maxHp: 100, currentHp: 20, status: 'burn', statusTimer: 4, flinchUntil: 3, castProgress: { skillId: 'hyper-beam', remaining: 0.3 } });
  sim.state.time = 7;
  const controlled = combatHud(c, 2);
  assert(controlled.critical && controlled.controlled && !controlled.cast);
  assert.deepEqual(controlled.statuses.map((s) => s.id), ['stun', 'burn'], 'simulator time must not expire the delayed HUD stun');
  const resumed = combatHud(c, 3);
  assert(!resumed.controlled && resumed.cast && resumed.progress === 0.5);
  assert.equal(combatHud(c, 3, true).action, '施法被打断');
  c.currentHp = 21;
  for (const status of ['paralyze', 'confuse'] as const) {
    c.status = status;
    assert(!combatHud(c, 3).controlled, 'chance-based abnormalities do not claim constant inability to act');
  }
  assert(!combatHud(c, 3).critical);
  c.activeSkills = ['recover', 'swords-dance', 'rest', 'surf', 'close-combat', 'silver-wind'];
  const targets = combatHud(c, 3).skills;
  assert(targets.slice(0, 3).every((s) => s.detail.includes(' · 自身 · ')));
  assert(targets[3]!.detail.includes('覆盖区内敌人'));
  assert(targets.slice(4).every((s) => s.detail.includes('敌方单体')), 'damaging moves with a self effect still attack enemies');
  c.alive = false;
  const fainted = combatHud(c, 2, true);
  assert.equal(fainted.action, '已倒下');
  assert(!fainted.critical && !fainted.cast && fainted.statuses.length === 0 && fainted.skills.every((s) => !s.ready && s.state === '—'));

  const layer = new CombatantStatusLayer();
  layer.refresh({ alive: true, status: 'burn', stunActive: false });
  layer.render(0.3);
  const flameGeometry = layer.context.instructions.length;
  layer.refresh({ alive: true, status: 'burn', stunActive: true });
  layer.render(0.3);
  assert.equal(layer.statusVisual, 'burn');
  assert.equal(layer.headIndicator, 'stun');
  assert(layer.context.instructions.length > flameGeometry, 'burn geometry and overhead stars coexist');
  layer.refresh({ alive: true, status: 'burn', stunActive: false });
  layer.render(0.3);
  assert.equal(layer.headIndicator, 'none');
  assert.equal(layer.context.instructions.length, flameGeometry, 'stun clears without removing remaining flames');
  layer.refresh({ alive: false, status: 'burn', stunActive: true });
  layer.render(0.3);
  assert.equal(layer.headIndicator, 'none');
  assert.equal(layer.context.instructions.length, 0);
  layer.destroy();
}
