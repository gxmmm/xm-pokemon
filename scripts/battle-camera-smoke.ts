import assert from 'node:assert/strict';
import { Container } from 'pixi.js';
import { BATTLE_ENVIRONMENTS } from '@pokemon-online/config';
import { BattleCameraController } from '../packages/renderer-pixi/src/BattleCameraController.ts';
export function testBattleCamera(): void {
  const camera = new BattleCameraController(() => ({ x: 100, y: 300 }), () => BATTLE_ENVIRONMENTS.grass.camera);
  const layer = new Container();
  for (const style of ['anticipate', 'track', 'impact', 'finisher'] as const) {
    camera.focus({ style, focusIds: ['actor'], zoom: 1.5, shake: 5, durationMs: 500 });
    for (let frame = 0; frame < 60; frame++) {
      camera.update(.016, [{ layer, factor: 1, shake: true }], frame * 16);
      assert.equal(layer.scale.x, 1); assert.equal(layer.scale.y, 1);
      assert.equal(layer.x, 0); assert.equal(layer.y, 0);
    }
    assert.equal(camera.getDiagnostics().shake, 0);
    assert(camera.isSettled, '镜头不会延迟战斗结算');
  }
  camera.reset(); layer.destroy();
  console.log('✓ 固定战场镜头：蓄力、追踪、命中和终结均不震屏、缩放或平移');
}
