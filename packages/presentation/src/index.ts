/** Renderer-independent battle presentation vocabulary.
 *
 * This package intentionally contains serializable data and deterministic
 * timeline utilities only. It must never import Vue, Canvas, Pixi, DOM APIs,
 * Pinia, or engine internals.
 */
export * from './battle.ts';
export * from './timeline.ts';
export * from './director.ts';