import type { BattleEnvironmentSpec } from '@pokemon-online/config';
import { Container } from 'pixi.js';
import { drawBattleRelief } from './BattleRelief.ts';

/** 单一像素 2.5D 环境；拥有固定层级及场景切换时的资源释放。 */
export class BattleEnvironmentView {
  readonly background = new Container();
  readonly farBackdrop = new Container();
  readonly horizonLayer = new Container();
  readonly groundLayer = new Container();
  readonly terrainOcclusion = new Container();
  readonly foreground = new Container();
  readonly layers: ReadonlyArray<Container> = [this.background, this.farBackdrop, this.horizonLayer, this.groundLayer, this.terrainOcclusion, this.foreground];

  get childCount(): number {
    return this.layers.reduce((sum, layer) => sum + layer.children.length, 0);
  }

  draw(spec: BattleEnvironmentSpec): void {
    this.clear();
    drawBattleRelief(this, spec);
  }

  clear(): void {
    for (const layer of this.layers) layer.removeChildren().forEach(child => child.destroy());
  }
}
