import { BattleSim, createWildInstance } from '@pokemon-online/engine';
import { BattleDirector, toBattlePresentationEvent } from '@pokemon-online/presentation';
import type { BattleEvent } from '@pokemon-online/shared';
import { BattleStage } from '../packages/renderer-pixi/src/BattleStage.ts';
import { BattlePresentationBridge } from '../apps/web/src/game/BattlePresentationBridge.ts';

/** Deterministic browser-only acceptance scene. Never imported by the app. */
export async function createBattleOutcomeFixture(mode: boolean | 'control') {
  const ko = mode === true;
  const controlScene = mode === 'control';
  const sim = new BattleSim({ mode: 'pvp', player: [createWildInstance(94, 100, { rng: () => 0.5 })],
    enemy: [createWildInstance(143, 100, { rng: () => 0.5 })], seed: 904 });
  const combatants = sim.state.combatants.map((combatant, index) => ({ ...combatant, uid: index ? 'victim' : 'actor',
    pixel: { x: index ? 15 : 5, y: 8 }, position: { x: index ? 15 : 5, y: 8 },
    currentHp: 100, maxHp: 100, alive: true,
    castProgress: controlScene && index ? { skillId: 'hyper-beam', remaining: 0.6 } : null,
    currentTargetUid: index ? 'actor' : 'victim' }));
  const source = { isOver: false, state: { time: 0, combatants, events: [] as BattleEvent[] } };
  const bridge = new BattlePresentationBridge({ presentationDelay: 0 });
  const section = document.createElement('section');
  section.id = 'outcome-fixture';
  Object.assign(section.style, { position: 'fixed', inset: '0', zIndex: '9999', background: '#10201d', color: 'white', padding: '20px' });
  const label = document.createElement('h2');
  const host = document.createElement('div');
  Object.assign(host.style, { width: '1120px', height: '630px' });
  section.append(label, host);
  document.body.append(section);
  const stage = new BattleStage();
  await stage.mount(host);
  await stage.enterBattle({ biomeId: 'grass', combatants });
  let current = bridge.reset(source)!;
  let raf = 0;
  let last = performance.now();
  const read = () => ({ hp: current.combatants[1]!.currentHp, alive: current.combatants[1]!.alive,
    status: current.combatants[1]!.status, casting: !!current.combatants[1]!.castProgress,
    interrupted: current.events.some((event) => event.vfx?.kind === 'interrupt'),
    caughtUp: bridge.isCaughtUp(source), settled: stage.isSettled(), effects: stage.getDiagnostics().activeEffectCount });
  const update = (simulationDelta: number, visualDelta: number) => {
    const frame = bridge.advance(source, simulationDelta, visualDelta);
    current = frame.presentation;
    stage.applyBattleSnapshot(current);
    void stage.playBattleCues(frame.cues.map((entry) => entry.cue));
    label.textContent = `训练假人 HP ${read().hp} / 100 · ${read().alive ? '存活' : '倒下'}${controlScene ? ` · ${read().casting ? '蓄力中' : read().status === 'sleep' ? '睡眠 · 蓄力停止' : '已恢复'}` : ''}`;
  };
  const tick = (now: number) => {
    const elapsed = Math.min(0.05, (now - last) / 1000);
    update(controlScene ? elapsed : 0, elapsed);
    last = now;
    raf = requestAnimationFrame(tick);
  };
  update(0, 0);
  raf = requestAnimationFrame(tick);
  return {
    read,
    release() {
      if (controlScene) {
        const control = { uid: 'victim', at: 0.1, status: 'sleep' as const, statusTimer: 2, flinchUntil: 0 };
        const events: BattleEvent[] = [
          { seq: 1, t: 0.1, type: 'skill', actor: 'actor', target: 'victim', skillId: 'hypnosis' },
          { seq: 2, t: 0.1, type: 'status', actor: 'actor', target: 'victim', skillId: 'hypnosis', vfx: { kind: 'status', status: 'sleep' }, control },
        ];
        source.state = { time: 0.1, combatants: [combatants[0]!, { ...combatants[1]!, ...control }], events };
        update(0.1, 0);
        return Math.max(...new BattleDirector().direct(events.map(toBattlePresentationEvent))
          .filter((entry) => entry.sequence === 2).map((entry) => entry.cue.delayMs ?? 0));
      }
      const hp = ko ? 0 : 37;
      const health = { uid: 'victim', currentHp: hp, alive: true, at: 0.1 };
      source.isOver = ko;
      source.state = { time: 0.1, combatants: [combatants[0]!, { ...combatants[1]!, currentHp: hp, alive: !ko }], events: [
        { seq: 1, t: 0.1, type: 'skill', actor: 'actor', target: 'victim', skillId: 'shadow-ball', vfx: { kind: 'projectile', type: 'ghost' } },
        { seq: 2, t: 0.1, type: 'damage', actor: 'actor', target: 'victim', skillId: 'shadow-ball', amount: 100 - hp,
          vfx: { kind: 'impact', type: 'ghost', ko }, health },
        ...(ko ? [{ seq: 3, t: 0.1, type: 'faint' as const, actor: 'victim', health: { ...health, alive: false } }] : []),
      ] };
      update(0.1, 0);
      return 0;
    },
    interrupt() {
      const victim = { ...source.state.combatants[1]!, castProgress: null };
      source.state = { time: 0.15, combatants: [combatants[0]!, victim], events: [...source.state.events,
        { seq: 3, t: 0.15, type: 'info', actor: 'victim', skillId: 'hyper-beam', vfx: { kind: 'interrupt' },
          control: { uid: 'victim', at: 0.15, status: victim.status, statusTimer: victim.statusTimer, flinchUntil: 0, castProgress: null } },
      ] };
    },
    recover() {
      source.state = { ...source.state, time: 3, combatants: [combatants[0]!, { ...combatants[1]!, castProgress: null, status: null, statusTimer: 0 }] };
      update(3, 0);
    },
    destroy() { cancelAnimationFrame(raf); stage.unmount(); section.remove(); },
  };
}
