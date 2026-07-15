type DrawCallMethod = 'drawArrays' | 'drawElements' | 'drawArraysInstanced' | 'drawElementsInstanced';
type ObservableGl = WebGLRenderingContext;
type GlMethod = (...args: unknown[]) => unknown;

export interface DrawCallObservation {
  total: number;
  sinceLastRead: number;
}

/** Renderer-local WebGL draw-call counter. It observes only the context owned
 * by a Stage and restores all patched methods before Pixi destroys that context. */
export class DrawCallObserver {
  private readonly originals = new Map<DrawCallMethod, GlMethod>();
  private total = 0;
  private checkpoint = 0;

  constructor(private readonly gl: ObservableGl | null) {
    if (!gl) return;
    for (const method of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced'] as const) {
      const original = (gl as unknown as Record<string, unknown>)[method];
      if (typeof original !== 'function') continue;
      const callable = original as GlMethod;
      this.originals.set(method, callable);
      (gl as unknown as Record<string, unknown>)[method] = (...args: unknown[]) => {
        this.total++;
        return callable.apply(gl, args);
      };
    }
  }

  read(): DrawCallObservation {
    const sinceLastRead = this.total - this.checkpoint;
    this.checkpoint = this.total;
    return { total: this.total, sinceLastRead };
  }

  destroy(): void {
    if (!this.gl) return;
    for (const [method, original] of this.originals) (this.gl as unknown as Record<string, unknown>)[method] = original;
    this.originals.clear();
  }
}
