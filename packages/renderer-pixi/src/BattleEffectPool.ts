import { Container } from 'pixi.js';
import type { BattleEffectLayer } from '@pokemon-online/config';

interface TimedEffect {
  graphic: Container;
  elapsed: number;
  duration: number;
  opacity: number;
  update(progress: number): void;
}

/** Owns transient battle graphics and their deterministic lifetime. */
export class BattleEffectPool {
  readonly container = new Container();
  readonly groundContainer = new Container();
  private effects: TimedEffect[] = [];
  private reduceFlicker = false;

  get activeCount(): number {
    return this.effects.length;
  }

  get childCount(): number { return this.container.children.length + this.groundContainer.children.length; }

  get isReduceFlickerEnabled(): boolean {
    return this.reduceFlicker;
  }

  setReduceFlicker(enabled: boolean): void {
    this.reduceFlicker = enabled;
    for (const effect of this.effects) effect.graphic.alpha = effect.opacity * (enabled ? 0.46 : 1);
  }

  add(graphic: Container, duration: number, update: (progress: number) => void, layer: BattleEffectLayer = 'front', opacity = 1): void {
    graphic.alpha = opacity * (this.reduceFlicker ? 0.46 : 1);
    (layer === 'ground' ? this.groundContainer : this.container).addChild(graphic);
    this.effects.push({ graphic, elapsed: 0, duration, update, opacity });
  }

  update(dt: number): void {
    if (dt <= 0) return;
    this.effects = this.effects.filter((effect) => {
      effect.elapsed += dt;
      effect.update(Math.min(1, effect.elapsed / effect.duration));
      if (effect.elapsed < effect.duration) return true;
      effect.graphic.destroy();
      return false;
    });
  }

  clear(): void {
    for (const effect of this.effects) effect.graphic.destroy();
    this.effects = [];
  }
}
