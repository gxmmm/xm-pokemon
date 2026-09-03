import { Container, type Graphics } from 'pixi.js';

interface TimedEffect {
  graphic: Graphics;
  elapsed: number;
  duration: number;
  update(progress: number): void;
}

/** Owns transient battle graphics and their deterministic lifetime. */
export class BattleEffectPool {
  readonly container = new Container();
  private effects: TimedEffect[] = [];
  private reduceFlicker = false;

  get activeCount(): number {
    return this.effects.length;
  }

  setReduceFlicker(enabled: boolean): void {
    this.reduceFlicker = enabled;
    for (const effect of this.effects) effect.graphic.alpha = enabled ? 0.46 : 1;
  }

  add(graphic: Graphics, duration: number, update: (progress: number) => void): void {
    graphic.alpha = this.reduceFlicker ? 0.46 : 1;
    this.container.addChild(graphic);
    this.effects.push({ graphic, elapsed: 0, duration, update });
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
