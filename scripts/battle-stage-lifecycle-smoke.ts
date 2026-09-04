import assert from 'node:assert/strict';
import { Application, Texture, type Container } from 'pixi.js';
import { BattleSim, createWildInstance } from '@pokemon-online/engine';
import { BattleStage } from '../packages/renderer-pixi/src/BattleStage.ts';
import { BattleArtAssetLoader } from '../packages/renderer-pixi/src/BattleArtAssets.ts';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

/** Real BattleStage/Pixi containers with only GPU, DOM and frame scheduling replaced. */
export async function testBattleStageLifecycle(): Promise<void> {
  const originalInit = Application.prototype.init;
  const originalDestroy = Application.prototype.destroy;
  const originalLoad = BattleArtAssetLoader.prototype.load;
  const originalPreload = BattleArtAssetLoader.prototype.preload;
  const globals = ['window', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame'] as const;
  const descriptors = globals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  const apps: Application[] = [];
  const destroyed: Application[] = [];
  const initQueue: ReturnType<typeof deferred>[] = [];
  const preloadQueue: ReturnType<typeof deferred>[] = [];
  const frames = new Map<number, FrameRequestCallback>();
  const tickers = new Map<Application, (ticker: { deltaTime: number }) => void>();
  let frameId = 0;
  let observers = 0;
  const host = {
    clientWidth: 1280, clientHeight: 720, nodes: [] as unknown[],
    replaceChildren(...nodes: unknown[]) { this.nodes = nodes; },
  };
  const stage = new BattleStage();
  const mount = () => stage.mount(host as unknown as HTMLElement);
  const installGlobal = (name: string, value: unknown) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  try {
    installGlobal('window', { devicePixelRatio: 1 });
    installGlobal('ResizeObserver', class {
      active = false;
      observe() { this.active = true; observers++; }
      disconnect() { if (this.active) observers--; this.active = false; }
    });
    installGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; });
    installGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
    Application.prototype.init = async function () {
      apps.push(this);
      await initQueue.shift()?.promise;
      this.renderer = { canvas: { style: {}, width: 1280, height: 720 }, resize() {} } as unknown as Application['renderer'];
      this.ticker = { add: (tick: (ticker: { deltaTime: number }) => void) => tickers.set(this, tick) } as unknown as Application['ticker'];
    };
    Application.prototype.destroy = function (_rendererOptions, options) {
      assert(!destroyed.includes(this), 'application must be destroyed once');
      destroyed.push(this);
      this.stage.destroy(options);
    };
    BattleArtAssetLoader.prototype.load = async () => Texture.EMPTY;
    BattleArtAssetLoader.prototype.preload = async () => { await preloadQueue.shift()?.promise; };

    const lateInit = deferred();
    initQueue.push(lateInit);
    const abandonedMount = mount();
    stage.unmount();
    lateInit.resolve();
    await abandonedMount;
    assert.equal(host.nodes.length, 0, 'init completion after unmount cannot reattach a canvas');
    assert.equal(observers, 0, 'abandoned mount cannot install a ResizeObserver');
    assert(destroyed.includes(apps[0]!), 'abandoned initialized application is disposed');

    const firstInit = deferred();
    initQueue.push(firstInit);
    const obsoleteMount = mount();
    await mount();
    const currentCanvas = host.nodes[0];
    firstInit.resolve();
    await obsoleteMount;
    assert.equal(host.nodes[0], currentCanvas, 'older mount cannot replace the current canvas');
    assert.equal(observers, 1);

    const currentApp = apps.at(-1)!;
    const reusableLayers = [...currentApp.stage.children[0]!.children];
    const oldBattle = deferred();
    preloadQueue.push(oldBattle);
    const grass = stage.enterBattle({ biomeId: 'grass', combatants: [] });
    await stage.enterBattle({ biomeId: 'water', combatants: [] });
    const waterChildren = stage.getDiagnostics().environmentChildCount;
    oldBattle.resolve();
    await grass;
    assert.equal(stage.getDiagnostics().biomeId, 'water', 'latest requested biome wins');
    assert.equal(stage.getDiagnostics().environmentChildCount, waterChildren, 'old background cannot redraw the new biome');
    const actor = new BattleSim({ mode: 'pve', player: [createWildInstance(25, 10)], enemy: [createWildInstance(143, 10)], seed: 904 }).state.combatants[0]!;
    stage.applyBattleSnapshot({ time: 0, combatants: [{ ...actor, speciesId: -1 }] });
    const descendants = (node: Container): Container[] => [node, ...node.children.flatMap(descendants)];
    const actorNodes = descendants(reusableLayers[5]!.children[0]!);
    stage.applyBattleSnapshot({ time: 1, combatants: [{ ...actor, speciesId: -1, currentHp: 0, alive: false }] });
    await stage.playBattleCues([
      { type: 'vfx', recipe: { id: 'impact:normal', delivery: 'aura' }, anchors: { targetIds: [actor.uid] }, intensity: 1 },
      { type: 'animation', subjectId: actor.uid, animation: 'faint' },
      { type: 'hit-stop', milliseconds: 70 },
      { type: 'environment', reaction: 'splash', anchors: { targetIds: [actor.uid] } },
    ]);
    tickers.get(currentApp)!({ deltaTime: 1 });
    const impact = reusableLayers[8]!.children[0]!;
    const impactWidth = impact.getLocalBounds().width;
    assert.equal(reusableLayers[4]!.children.length, 1, 'ground response is below the actor layer');
    assert.equal(stage.getDiagnostics().effectChildCount, 2, 'stage diagnostics include ground and front effects');
    assert(impactWidth > 0 && reusableLayers[5]!.children[0]!.alpha === 0.25, 'KO graphics and life state draw before the first hit-stop frame');
    tickers.get(currentApp)!({ deltaTime: 1 });
    assert.equal(impact.getLocalBounds().width, impactWidth, 'hit-stop holds the rendered impact instead of an empty graphic');

    const transition = stage.transition({ kind: 'fade', durationMs: 100 });
    const cancelledDraw = [...frames.values()][0]!;
    stage.unmount();
    await transition;
    assert.equal(frames.size, 0, 'unmount cancels the pending transition frame');
    cancelledDraw(performance.now() + 200);
    assert.equal(frames.size, 0, 'even an already-queued cancelled callback stays inert');
    assert(reusableLayers.every((layer) => !layer.destroyed && layer.children.length === 0), 'unmount clears but preserves reusable layer containers');
    assert(actorNodes.every((node) => node.destroyed), 'actor removal destroys all owned child graphics and sprites');
    assert(!Texture.EMPTY.destroyed, 'unmount must not destroy shared asset textures');
    assert.equal(observers, 0);
    assert.equal(stage.getDiagnostics().totalChildCount, 0);
    stage.unmount();

    await mount();
    await stage.enterBattle({ biomeId: 'grass', combatants: [] });
    const supersededTransition = stage.transition({ kind: 'fade' });
    const latestTransition = stage.transition({ kind: 'fade', durationMs: 1 });
    await supersededTransition;
    assert.equal(frames.size, 1, 'a replacement transition cancels its predecessor');
    const [id, draw] = [...frames.entries()][0]!;
    frames.delete(id);
    draw(performance.now() + 1000);
    await latestTransition;
    assert.equal(frames.size, 0, 'completed transition leaves no queued frame');

    const abandonedBattle = deferred();
    preloadQueue.push(abandonedBattle);
    const loading = stage.enterBattle({ biomeId: 'dragon', combatants: [] });
    stage.unmount();
    abandonedBattle.resolve();
    await loading;
    await stage.playBattleCues([{ type: 'vfx', recipe: { id: 'impact:fire' }, anchors: {}, intensity: 1 }]);
    assert.equal(stage.getDiagnostics().totalChildCount, 0, 'late scene loads and cues cannot populate an unmounted stage');

    await mount();
    const previousSession = deferred();
    preloadQueue.push(previousSession);
    const previousLoad = stage.enterBattle({ biomeId: 'cave', combatants: [] });
    await mount();
    await stage.enterBattle({ biomeId: 'arena', combatants: [] });
    previousSession.resolve();
    await previousLoad;
    assert.equal(stage.getDiagnostics().biomeId, 'arena', 'a previous mount cannot replace the next session scene');

    const failure = deferred();
    initQueue.push(failure);
    const failedMount = mount();
    const rejection = assert.rejects(failedMount, /init failed/);
    failure.reject(new Error('init failed'));
    await rejection;
    assert(apps.at(-1)!.stage.destroyed, 'failed initialization releases its root container');
    await mount();
    await stage.enterBattle({ biomeId: 'arena', combatants: [] });
    assert.equal(stage.getDiagnostics().canvasCount, 1, 'mount can recover after an initialization failure');
    assert.equal(observers, 1);
  } finally {
    stage.unmount();
    Application.prototype.init = originalInit;
    Application.prototype.destroy = originalDestroy;
    BattleArtAssetLoader.prototype.load = originalLoad;
    BattleArtAssetLoader.prototype.preload = originalPreload;
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
  console.log('✓ battle stage mount, scene replacement, transition cancellation, and teardown contracts');
}
