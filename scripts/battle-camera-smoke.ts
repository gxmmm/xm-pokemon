import assert from 'node:assert/strict';
import { Container } from 'pixi.js';
import { BATTLE_ENVIRONMENTS, BATTLE_CAMERA_MOTION } from '@pokemon-online/config';
import type { BattleCameraPlan } from '@pokemon-online/shared';
import { BattleCameraController } from '../packages/renderer-pixi/src/BattleCameraController.ts';
import { projectBattleGroundPoint } from '../packages/renderer-pixi/src/battle-ground.ts';
import { isCellInArena } from '../packages/engine/src/grid.ts';

export function testBattleCamera(): void {
  const previousCameras = { grass: [15, 36, 448], cave: [14, 38, 452], water: [16, 34, 442], dragon: [14.5, 37, 450], arena: [17, 39, 454] } as const;
  for (const environment of Object.values(BATTLE_ENVIRONMENTS)) {
    const camera = environment.camera;
    const [height, pitchDegrees, principalY] = previousCameras[environment.id];
    const previous = { ...camera, height, pitchDegrees, principal: { x: 640, y: principalY } };
    const depthGap = (spec: typeof camera) => projectBattleGroundPoint(10, 9, spec).y - projectBattleGroundPoint(10, 7, spec).y;
    assert(depthGap(camera) > depthGap(previous) * 1.05, `${environment.id}: central depth is visibly expanded`);
    if (environment.id === 'grass') assert(depthGap(camera) > depthGap(previous) * 1.15);
    for (let x = 0; x < 20; x++) for (let y = 0; y < 14; y++) {
      if (!isCellInArena(x, y)) continue;
      const point = projectBattleGroundPoint(x, y, camera);
      assert(Object.values(point).every(Number.isFinite));
      assert(point.x >= 280 && point.x <= 1000 && point.y >= 294 && point.y <= 670,
        `${environment.id}: playable feet stay on the ground plane with a foreground margin`);
      assert(point.scale >= 0.76 && point.scale <= 1.16, 'existing model perspective limits remain intact');
      if (isCellInArena(x, y + 1)) assert(projectBattleGroundPoint(x, y + 1, camera).y > point.y, 'depth order never folds');
    }
  }
  assert(projectBattleGroundPoint(10, 0, BATTLE_ENVIRONMENTS.grass.camera).y >= 325, 'grass far edge stays aligned with the bitmap clearing');
  const spec = BATTLE_ENVIRONMENTS.grass.camera;
  const points = new Map([['left', { x: 100, y: 200 }], ['right', { x: 1000, y: 400 }]]);
  const camera = new BattleCameraController((uid) => points.get(uid), () => spec);
  const background = new Container(), distant = new Container(), actors = new Container(), effects = new Container();
  const layers = [{ layer: background, factor: 0, shake: false }, { layer: distant, factor: 0.2, shake: false },
    { layer: actors, factor: 1, shake: true }, { layer: effects, factor: 1, shake: true }];
  const plan = (style: BattleCameraPlan['style'], id = 'left', durationMs = 400): BattleCameraPlan => ({ style, focusIds: [id], durationMs, zoom: 1.1 });
  const tick = (dt: number) => camera.update(dt, layers, 0);
  camera.focus({ ...plan('track'), zoom: 4, shake: 2 });
  tick(0.01);
  let state = camera.getDiagnostics();
  assert.equal(state.targetScale, spec.framing.maxZoom);
  assert.equal(state.targetOffset.x, spec.framing.maxPanX);
  assert(state.shake > 0 && state.shake <= 2.5);
  assert.equal(background.scale.x, 1); assert.equal(background.x, 0);
  assert(distant.scale.x > 1 && distant.scale.x < actors.scale.x);
  assert.equal(actors.x, effects.x); assert.equal(actors.y, effects.y);
  const frozen = JSON.stringify([state, actors.x, actors.y]);
  tick(0);
  assert.equal(JSON.stringify([camera.getDiagnostics(), actors.x, actors.y]), frozen, 'hit-stop freezes the camera too');
  camera.reset();
  camera.focus(plan('track')); camera.focus(plan('track', 'right')); tick(0.05);
  const combined = camera.getDiagnostics();
  camera.reset();
  camera.focus(plan('track', 'right')); camera.focus(plan('track')); tick(0.05);
  assert.deepEqual(camera.getDiagnostics(), combined, 'same-frame order cannot decide the focus');
  assert.deepEqual(combined.focusIds, ['left', 'right']);
  assert(Math.abs(actors.x + actors.scale.x * 640 - 640 - combined.offset.x) < 1e-9, 'zoom pivots around the framing center, not top-left');
  camera.focus(plan('track', 'right')); tick(0.04);
  assert.deepEqual(camera.getDiagnostics().focusIds, ['left', 'right'], 'short hold prevents adjacent equal-priority shots from stealing focus');
  camera.focus(plan('finisher', 'right')); camera.focus(plan('anticipate')); tick(0.01);
  assert.equal(camera.getDiagnostics().style, 'finisher');
  camera.focus(plan('track')); tick(0.2);
  assert.equal(camera.getDiagnostics().style, 'finisher', 'lower priority cannot overwrite a decisive shot');
  points.set('right', { x: 800, y: 350 }); tick(0.01);
  assert(Math.abs(camera.getDiagnostics().targetOffset.x - (640 - 800) * 0.18) < 1e-9, 'focus follows live presentation positions');
  tick(0.25);
  assert.equal(camera.getDiagnostics().style, 'neutral', 'duration expires without another camera event');
  for (let index = 0; index < 150; index++) tick(1 / 60);
  assert(camera.isSettled); assert.equal(actors.scale.x, 1); assert.equal(actors.x, 0);
  camera.focus(plan('track')); camera.focus(plan('finisher', 'missing')); tick(0.01);
  assert.equal(camera.getDiagnostics().style, 'track', 'missing targets cannot steal valid focus');
  points.delete('left'); tick(0.01);
  assert.equal(camera.getDiagnostics().style, 'neutral');
  points.set('left', { x: 100, y: 200 });
  camera.reset(); camera.setIntensity('reduced'); camera.focus(plan('track')); tick(0.01);
  assert(Math.abs(camera.getDiagnostics().targetScale - 1.045) < 1e-9);
  assert(Math.abs(camera.getDiagnostics().targetOffset.x - 24.3) < 1e-9);
  camera.setIntensity('off'); camera.focus(plan('finisher')); tick(0.1);
  assert(camera.isSettled && actors.scale.x === 1 && actors.x === 0, 'off resets immediately and does not queue hidden shots');
  camera.setIntensity('full'); tick(0.1); assert(camera.isSettled);
  const sample = (hz: number) => {
    camera.reset(); camera.focus(plan('track', 'left', BATTLE_CAMERA_MOTION.maxShotMs));
    for (let index = 0; index < hz / 2; index++) tick(1 / hz);
    return camera.getDiagnostics();
  };
  const a = sample(30), b = sample(60);
  assert(Math.abs(a.scale - b.scale) < 1e-9 && Math.abs(a.offset.x - b.offset.x) < 1e-9, 'damping is frame-rate independent');
  camera.reset();
  for (const durationMs of [NaN, Infinity, -1, 0]) camera.focus(plan('track', 'left', durationMs));
  assert(camera.isSettled, 'invalid durations cannot leave pending shots');
  camera.focus({ ...plan('track'), zoom: NaN, shake: NaN }); tick(0.01);
  assert.equal(camera.getDiagnostics().targetScale, 1);
  assert.equal(camera.getDiagnostics().shake, 0, 'invalid optional values cannot poison transforms');
  camera.reset(); camera.focus(plan('track', 'left', BATTLE_CAMERA_MOTION.maxShotMs * 10)); tick(0.01);
  tick(BATTLE_CAMERA_MOTION.maxShotMs / 1000 + 0.01);
  assert.equal(camera.getDiagnostics().style, 'neutral', 'long requests are bounded by the configured maximum');
  camera.focus(plan('finisher')); camera.reset(); tick(0.01);
  assert(camera.isSettled, 'reset discards pending shots and transforms');
  layers.forEach(({ layer }) => layer.destroy());
  console.log('✓ camera arbitration, live focus, hold/expiry, centered zoom, hit-stop and reset');
}
