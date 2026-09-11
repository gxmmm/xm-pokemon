import assert from 'node:assert/strict';
import { Application, Graphics, Texture, type Container } from 'pixi.js';
import { BattleSim, createWildInstance } from '@pokemon-online/engine';
import { WORLD_SCENES } from '@pokemon-online/config';
import { BattleStage } from '../packages/renderer-pixi/src/BattleStage.ts';
import { WorldStage } from '../packages/renderer-pixi/src/WorldStage.ts';
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
      assert.deepEqual(_rendererOptions, { removeView: true, releaseGlobalResources: false }, 'scene teardown must not destroy pools shared by another renderer');
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
    const combatantLayer = (stage as unknown as { combatants: { container: Container } }).combatants.container;
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
    const waitingArt = deferred();
    preloadQueue.push(waitingArt);
    const waitingScene = stage.enterBattle({ biomeId: 'grass', combatants: [{ ...actor, speciesId: -1 }] });
    assert.equal(stage.getDiagnostics().combatantCount, 1, 'fallback actors exist before art finishes');
    const loadingActor = combatantLayer.children[0];
    stage.applyBattleSnapshot({ time: 2, combatants: [{ ...actor, speciesId: -1, currentHp: 0, alive: false }] });
    await stage.playBattleCues([{ type: 'environment', reaction: 'splash', anchors: { targetIds: [actor.uid] } }]);
    const loadingEffects = stage.getDiagnostics().activeEffectCount;
    assert(loadingEffects > 0, 'cues play while scene art is pending');
    waitingArt.resolve();
    await waitingScene;
    assert.equal(combatantLayer.children[0], loadingActor, 'late art must preserve the updated actor instance');
    assert.equal(stage.getDiagnostics().activeEffectCount, loadingEffects, 'late art must preserve pending effects');
    assert.equal((loadingActor as unknown as { alive: boolean }).alive, false, 'late art must not restore initial life state');
    await stage.enterBattle({ biomeId: 'water', combatants: [] });
    stage.applyBattleSnapshot({ time: 0, combatants: [{ ...actor, speciesId: -1 }] });
    const descendants = (node: Container): Container[] => [node, ...node.children.flatMap(descendants)];
    const actorNodes = descendants(combatantLayer.children[0]!);
    stage.applyBattleSnapshot({ time: 1, combatants: [{ ...actor, speciesId: -1, currentHp: 0, alive: false }] });
    await stage.playBattleCues([
      { type: 'vfx', recipe: { id: 'impact:normal', delivery: 'aura' }, anchors: { targetIds: [actor.uid] }, intensity: 1 },
      { type: 'animation', subjectId: actor.uid, animation: 'faint' },
      { type: 'hit-stop', milliseconds: 70 },
      { type: 'camera', plan: { style: 'finisher', focusIds: [actor.uid], durationMs: 360, zoom: 1.07 } },
      { type: 'environment', reaction: 'splash', anchors: { targetIds: [actor.uid] } },
    ]);
    tickers.get(currentApp)!({ deltaTime: 1 });
    const impact = reusableLayers[8]!.children[0]!;
    const impactWidth = impact.getLocalBounds().width;
    const cameraAtImpact = stage.getDiagnostics().camera;
    assert.equal(reusableLayers[4]!.children.length, 1, 'ground response is below the actor layer');
    assert.equal(stage.getDiagnostics().effectChildCount, 2, 'stage diagnostics include ground and front effects');
    assert(impactWidth > 0 && combatantLayer.children[0]!.alpha === 0.25, 'KO graphics and life state draw before the first hit-stop frame');
    tickers.get(currentApp)!({ deltaTime: 1 });
    assert.equal(impact.getLocalBounds().width, impactWidth, 'hit-stop holds the rendered impact instead of an empty graphic');
    assert.deepEqual(stage.getDiagnostics().camera, cameraAtImpact, 'the shared hit-stop clock holds the camera with the impact');

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

    const world = new WorldStage();
    const lateWorldInit = deferred();
    initQueue.push(lateWorldInit);
    const worldMount = world.mount(host as unknown as HTMLElement);
    world.unmount();
    const hostAfterWorldExit = [...host.nodes];
    lateWorldInit.resolve();
    await worldMount;
    assert.deepEqual(host.nodes, hostAfterWorldExit, 'late world initialization cannot restore a departed canvas');
    const worldOverlay = new Graphics();
    Object.assign(world, { transitionGraphic: worldOverlay });
    const oldWorldTransition = world.transition({ kind: 'fade' });
    const worldTransition = world.transition({ kind: 'fade' });
    await oldWorldTransition;
    assert.equal(frames.size, 1, 'world transition replacement cancels the previous frame');
    const staleWorldDraw = [...frames.values()][0]!;
    world.unmount();
    worldOverlay.destroy();
    await worldTransition;
    staleWorldDraw(performance.now() + 1000);
    assert.equal(frames.size, 0, 'world exit cancels transition and a stale frame never touches destroyed graphics');

    await world.mount(host as unknown as HTMLElement);
    await world.enterWorld({ sceneId: 'viewport-test', biomeId: 'grass' });
    const worldInternals = world as unknown as { root: Container; scenery: Container; occlusion: Container; basePaint: { sky: Graphics }; resize(): void };
    for (const scene of [null, ...WORLD_SCENES]) {
      if (scene) await world.enterScene({ sceneId: scene.id, biomeId: scene.biome }, scene);
      for (const [width, height] of [[1366, 768], [1440, 900], [1920, 1080], [1920, 800]]) {
        host.clientWidth = width!; host.clientHeight = height!;
        worldInternals.resize();
        const root = worldInternals.root;
        assert.equal(root.scale.x, root.scale.y, 'world resizing preserves character proportions');
        const first = root.toGlobal({ x: 0, y: 0 }), last = root.toGlobal({ x: 1280, y: 720 });
        assert(first.x >= -0.01 && first.y >= -0.01 && last.x <= width! + 0.01 && last.y <= height! + 0.01, 'the entire authored map remains visible');
        const sky = worldInternals.basePaint.sky.getBounds();
        assert(Math.abs(sky.x) < 0.01 && Math.abs(sky.y) < 0.01 && Math.abs(sky.width - width!) < 0.01 && Math.abs(sky.height - height!) < 0.01, 'environment reaches every window edge without a letterbox');
        for (const layer of [worldInternals.scenery, worldInternals.occlusion]) {
          if (!layer.children.length) continue;
          const bounds = layer.getBounds();
          assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width! + 0.01 && bounds.y + bounds.height <= height! + 0.01,
            `${scene?.id}: full building geometry, including roofs and lights, stays inside the viewport`);
        }
      }
    }
    world.unmount();
    host.clientWidth = 1280; host.clientHeight = 720;

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
