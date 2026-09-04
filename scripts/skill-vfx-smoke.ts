import assert from 'node:assert/strict';
import { SKILL_VISUAL_RECIPE_MAP } from '@pokemon-online/config';
import { BattleDirector } from '@pokemon-online/presentation';
import { DOMAdapter, Graphics, Mesh, type Shader } from 'pixi.js';
import { BattleEffectPool } from '../packages/renderer-pixi/src/BattleEffectPool.ts';
import { elementColor, planBattleCue } from '../packages/renderer-pixi/src/battle-plan.ts';
import { spawnBeam } from '../packages/renderer-pixi/src/beam-vfx.ts';
import { spawnImpact } from '../packages/renderer-pixi/src/impact-vfx.ts';
import { spawnProjectile } from '../packages/renderer-pixi/src/projectile-vfx.ts';

export function testSkillVfx(): void {
  for (const [skillId, element, variant, primitive] of [
    ['flamethrower', 'fire', 'flame-stream', 'beam'],
    ['shadow-ball', 'ghost', 'shadow-orb', 'projectile'],
  ] as const) {
    assert.equal(SKILL_VISUAL_RECIPE_MAP[skillId]?.variant, variant);
    const events = (['skill', 'damage'] as const).map((type, sequence) => ({
      id: `${skillId}:${type}`, type, sequence, at: 20,
      actorId: 'any-caster', targetIds: ['any-target'], skillId, element,
    }));
    const snapshot = JSON.stringify(events);
    const plans = new BattleDirector().direct(events).flatMap(({ cue }) => planBattleCue(cue));
    assert(plans.some((plan) => plan.primitive === primitive && plan.variant === variant && plan.element === element));
    assert(plans.some((plan) => plan.primitive === 'impact' && plan.variant === variant && plan.targetIds[0] === 'any-target'));
    assert.equal(JSON.stringify(events), snapshot, 'visual routing must not mutate battle facts');
  }

  const runtime = new BattleEffectPool();
  const from = { x: 360, y: 420 };
  const to = { x: 860, y: 350 };
  // CPU tests only stub Pixi's precision probe; GLSL compilation is checked in Chrome.
  const adapter = DOMAdapter.get();
  DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement });
  try {
    spawnBeam(runtime, from, to, elementColor('fire'), 1, 'flame-stream', 'fire');
    runtime.clear();
  } finally { DOMAdapter.set(adapter); }
  for (const reverse of [false, true]) {
    for (const intensity of [0.15, 1]) {
      for (const motif of ['flame-stream', 'shadow-orb'] as const) {
        const source = reverse ? to : from;
        const target = reverse ? from : to;
        const color = elementColor(motif === 'flame-stream' ? 'fire' : 'ghost');
        const duration = motif === 'flame-stream' ? 0.38 + intensity * 0.18 : 0.26 + (1 - intensity) * 0.1;
        if (motif === 'flame-stream') spawnBeam(runtime, source, target, color, intensity, motif, 'fire');
        else spawnProjectile(runtime, source, target, color, intensity, motif, 'ghost');
        const graphic = runtime.container.children[0] as Graphics | Mesh;
        const shader = graphic instanceof Mesh ? graphic.shader as Shader : undefined;
        const buffers = graphic instanceof Mesh ? [...graphic.geometry.buffers] : [];
        let releasedResources = 0;
        if (graphic instanceof Mesh) {
          shader!.once('destroy', () => { releasedResources++; });
          graphic.geometry.once('destroy', () => { releasedResources++; });
        }
        assert.equal(graphic.blendMode, 'normal', 'colored silhouettes must survive bright stages');
        runtime.setReduceFlicker(true);
        assert.equal(graphic.alpha, 0.46);
        for (let frame = 0; frame < 9; frame++) {
          runtime.update(duration / 10);
          const bounds = graphic.getLocalBounds();
          assert([bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite));
          assert(bounds.x > 250 && bounds.y > 250, 'effect must not connect to the canvas origin');
          if (graphic instanceof Mesh) {
            assert.equal(graphic.geometry.positions.length, 8, 'flame remains a single quad, not particle stacks');
            assert.equal(graphic.geometry.indices.length, 6);
            const uniforms = shader!.resources.flameUniforms.uniforms;
            assert(Math.abs(uniforms.uTime - duration * (frame + 1) / 10) < 0.00001);
            assert(uniforms.uOpacity > 0 && uniforms.uOpacity <= 0.94);
          } else {
            const instructions = graphic.context.instructions;
            assert(instructions.length > 0 && instructions.length <= 14, 'geometry stays bounded across frames');
            assert(instructions.some((item) => item.action === 'fill' && item.data.style.color === 0x190d2c), 'shadow keeps its dark core');
            assert(!instructions.some((item) => item.action === 'fill' && item.data.style.color === color && item.data.style.alpha === 0.9), 'generic light disc must not cover the motif');
          }
        }
        assert.equal(runtime.activeCount, 1);
        runtime.update(duration / 10 + 0.000001);
        assert.equal(runtime.activeCount, 0);
        assert(graphic.destroyed);
        if (shader) {
          assert.equal(releasedResources, 2, 'mesh releases both shader bindings and geometry');
          assert(buffers.every((buffer) => buffer.destroyed), 'mesh owns and releases its vertex buffers');
        }
        assert.equal(runtime.container.children.length, 0);

        spawnImpact(runtime, target, color, intensity, motif);
        const impact = runtime.container.children[0] as Graphics;
        assert.equal(impact.alpha, 0.46, 'new impact inherits reduced flicker');
        assert.equal(impact.blendMode, 'normal');
        runtime.update(0.27);
        assert.equal(runtime.activeCount, 1, 'impact survives until its existing 280ms deadline');
        assert(impact.context.instructions.length > 0 && impact.context.instructions.length <= 14);
        const impactBounds = impact.getLocalBounds();
        assert(impactBounds.x > target.x - 80 && impactBounds.y > target.y - 80, 'impact arcs stay local to the target');
        runtime.update(0.011);
        assert.equal(runtime.activeCount, 0);
        assert(impact.destroyed);
        runtime.setReduceFlicker(false);
      }
    }
  }
  for (const [variant, count] of [['default', 2], ['stone-shot', 1], ['neutral-star', 1]] as const) {
    spawnProjectile(runtime, from, to, 0xa98ae7, 0.7, variant, 'ghost');
    runtime.update(0.1);
    assert.equal((runtime.container.children[0] as Graphics).context.instructions.length, count, 'generic fallback is drawn only without a dedicated motif');
    runtime.clear();
  }
  runtime.container.destroy();
  console.log('✓ skill VFX: config routing, saturated silhouettes, bounded geometry, fallback isolation, and unchanged lifetimes');
}
