import { GlProgram, Mesh, MeshGeometry, Shader, UniformGroup } from 'pixi.js';
import type { BattleEffectPool } from './BattleEffectPool.ts';
import type { BattleStagePoint } from './battle-stage-layout.ts';

const vertex = `
in vec2 aPosition;
in vec2 aUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform vec4 uWorldColorAlpha;
uniform vec4 uColor;
out vec2 vUV;
out vec4 vColor;
void main() {
  vUV = aUV;
  vColor = uWorldColorAlpha * uColor;
  vec3 position = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix * vec3(aPosition, 1.0);
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// An advected heat field, not overlapping particle silhouettes. Domain warping
// breaks the boundary into tongues and holes while the hot core keeps flowing.
const fragment = `
in vec2 vUV;
in vec4 vColor;
uniform float uTime;
uniform float uOpacity;
uniform vec3 uTint;
out vec4 finalColor;
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), f.x),
    mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0)), f.x), f.y);
}
float turbulence(vec2 p) {
  return noise(p) * 0.57 + noise(p * 2.03 + 7.1) * 0.28 + noise(p * 4.07 + 19.3) * 0.15;
}
void main() {
  float x = vUV.x;
  float y = vUV.y * 2.0 - 1.0;
  vec2 flow = vec2(x * 6.5 - uTime * 4.8, y * 3.2);
  vec2 warp = vec2(turbulence(flow * 0.65 + 3.1), turbulence(flow * 0.65 + 17.4)) - 0.5;
  float detail = turbulence(flow + warp * 2.8);
  float width = 0.055 + pow(x, 0.72) * 0.62;
  float center = y + warp.y * (0.10 + x * 0.48);
  float heat = 1.0 - abs(center) / width + (detail - 0.5) * (0.7 + x * 1.1);
  heat -= x * 0.18;
  float edge = smoothstep(0.06, 0.24, heat);
  float ends = smoothstep(0.0, 0.018, x) * (1.0 - smoothstep(0.85, 1.0, x));
  float opacity = edge * ends * uOpacity;
  vec3 color = mix(vec3(0.86, 0.12, 0.015), uTint, smoothstep(0.15, 0.46, heat));
  color = mix(color, vec3(1.0, 0.71, 0.10), smoothstep(0.42, 0.76, heat));
  color = mix(color, vec3(1.0, 0.94, 0.62), smoothstep(0.76, 1.12, heat));
  finalColor = vec4(color * opacity, opacity) * vColor;
}`;

/** One quad/one pass; BattleStage explicitly uses WebGL. No textures or timers. */
export function spawnFlameStream(runtime: BattleEffectPool, from: BattleStagePoint, to: BattleStagePoint, color: number, intensity: number, resolveSource?: () => BattleStagePoint | undefined): void {
  from = { ...from };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.001) return;
  const halfHeight = 60 + intensity * 30;
  const px = -dy / length * halfHeight;
  const py = dx / length * halfHeight;
  const geometry = new MeshGeometry({
    positions: new Float32Array([from.x - px, from.y - py, to.x - px, to.y - py, to.x + px, to.y + py, from.x + px, from.y + py]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  });
  const uniforms = new UniformGroup({
    uTime: { value: 0, type: 'f32' },
    uOpacity: { value: 0, type: 'f32' },
    uTint: { value: new Float32Array([(color >> 16 & 255) / 255, (color >> 8 & 255) / 255, (color & 255) / 255]), type: 'vec3<f32>' },
  });
  const shader = new Shader({
    glProgram: GlProgram.from({ vertex, fragment, name: 'battle-flame-stream', preferredFragmentPrecision: 'highp' }),
    resources: { flameUniforms: uniforms },
  });
  const mesh = new Mesh({ geometry, shader, blendMode: 'normal' });
  mesh.on('destroyed', () => { shader.destroy(); geometry.destroy(true); });
  const duration = 0.38 + intensity * 0.18;
  runtime.add(mesh, duration, (progress) => {
    const source = resolveSource ? resolveSource() : from;
    const distance = source ? Math.hypot(to.x - source.x, to.y - source.y) : 0;
    mesh.visible = !!source && distance >= 0.001;
    if (!source || !mesh.visible) return;
    if (source.x !== from.x || source.y !== from.y) {
      const offsetX = -(to.y - source.y) / distance * halfHeight;
      const offsetY = (to.x - source.x) / distance * halfHeight;
      geometry.positions.set([source.x - offsetX, source.y - offsetY, to.x - offsetX, to.y - offsetY,
        to.x + offsetX, to.y + offsetY, source.x + offsetX, source.y + offsetY]);
      geometry.getBuffer('aPosition').update();
      from = { ...source };
    }
    uniforms.uniforms.uTime = progress * duration;
    uniforms.uniforms.uOpacity = Math.sin(Math.PI * progress) * 0.94;
  });
}
