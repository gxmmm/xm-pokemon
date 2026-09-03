import type { BattleEnvironmentSpec } from '@pokemon-online/config';
import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { BATTLE_DESIGN_HEIGHT as DESIGN_HEIGHT, BATTLE_DESIGN_WIDTH as DESIGN_WIDTH } from './battle-stage-layout.ts';

const DETAIL_DENSITY = 0.62;

/** Owns the ordered Pixi layers and reusable drawing grammar for one battle biome. */
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

  /** Draws the configured biome and returns whether formal bitmap art was used. */
  draw(spec: BattleEnvironmentSpec, texture: Texture | null): boolean {
    this.clear();
    const { palette } = spec;
    const o = spec.overscan;
    // Every camera-reactive layer has a configuration-owned safety margin, so
    // bounded pan/zoom never reveals the renderer's unpainted design edge.
    this.background.addChild(new Graphics().rect(-o, -o, DESIGN_WIDTH + o * 2, DESIGN_HEIGHT + o * 2).fill({ color: palette.sky }));
    const formalBackground = texture && spec.art
      ? this.drawFormalEnvironmentBackground(texture, spec)
      : false;
    if (!formalBackground) {
      this.drawBackdropGrammar(spec);
      this.drawHorizonGrammar(spec);
    }
    this.drawPerspectiveGround(spec, !formalBackground);
    this.drawAmbientGrammar(spec);
    this.drawForegroundGrammar(spec);
    return formalBackground;
  }

  clear(): void {
    for (const layer of this.layers) layer.removeChildren().forEach((child) => child.destroy());
  }

  private drawFormalEnvironmentBackground(texture: Texture, spec: BattleEnvironmentSpec): boolean {
    if (texture.width <= 0 || texture.height <= 0 || !spec.art) return false;
    const sprite = new Sprite(texture);
    const scale = Math.max(DESIGN_WIDTH / texture.width, DESIGN_HEIGHT / texture.height);
    sprite.scale.set(scale);
    sprite.position.set((DESIGN_WIDTH - texture.width * scale) / 2, (DESIGN_HEIGHT - texture.height * scale) / 2);
    this.background.addChild(sprite);
    this.background.addChild(new Graphics().rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT).fill({ color: spec.palette.sky, alpha: spec.art.toneAlpha }));
    return true;
  }

  private drawBackdropGrammar(spec: BattleEnvironmentSpec): void {
    const { horizon, groundDetail, accent } = spec.palette;
    const graphic = new Graphics();
    const light = spec.atmosphere.keyLight;
    graphic.circle(light.x, light.y, light.radius).fill({ color: accent, alpha: light.alpha * 0.55 });
    graphic.circle(light.x, light.y, light.radius * 0.56).fill({ color: spec.palette.mote, alpha: light.alpha * 0.72 });
    graphic.circle(light.x, light.y, light.radius * 0.24).fill({ color: accent, alpha: light.alpha * 0.82 });
    if (spec.backdrop === 'forest-canopy') {
      // Forest benchmark: broad atmospheric silhouettes establish depth first;
      // smaller trunks and canopy clusters then break the repeated-oval look.
      graphic.poly([-80, 292, 150, 194, 318, 270, 480, 176, 690, 285, 870, 205, 1080, 278, 1360, 184, 1360, 306, -80, 306])
        .fill({ color: horizon, alpha: 0.34 });
      for (let index = -2; index < 14; index++) {
        const x = index * 112 - 34;
        const trunkHeight = 70 + (index * 37 + 90) % 74;
        const crownY = 251 - trunkHeight * 0.42;
        graphic.rect(x + 50, crownY + 18, 12 + index % 3 * 3, 292 - crownY).fill({ color: groundDetail, alpha: 0.16 });
        graphic.ellipse(x + 42, crownY, 72 + index % 4 * 15, 28 + index % 3 * 9).fill({ color: horizon, alpha: 0.72 });
        graphic.ellipse(x + 88, crownY - 13, 58 + index % 3 * 13, 25 + index % 2 * 8).fill({ color: groundDetail, alpha: 0.18 });
      }
      graphic.moveTo(-120, 286).bezierCurveTo(250, 255, 448, 304, 700, 274).bezierCurveTo(930, 248, 1120, 282, 1400, 258)
        .stroke({ color: spec.palette.mote, alpha: 0.09, width: 3 });
    } else if (spec.backdrop === 'cave-pillars') {
      graphic.poly([-120, -40, 1400, -40, 1400, 68, 1250, 48, 1128, 116, 980, 70, 820, 132, 670, 82, 520, 126, 360, 64, 186, 118, -120, 62])
        .fill({ color: horizon, alpha: 0.76 });
      for (let index = 0; index < 8; index++) {
        const x = index * 184 - 42;
        const shoulder = 146 + (index % 3) * 28;
        graphic.poly([x, 298, x + 28, shoulder, x + 54, 112 + index % 2 * 34, x + 82, shoulder + 12, x + 116, 298])
          .fill({ color: index % 2 ? horizon : groundDetail, alpha: index % 2 ? 0.80 : 0.36 });
        graphic.moveTo(x + 54, 126).lineTo(x + 54, 266).stroke({ color: accent, alpha: 0.08, width: 3 });
      }
      graphic.ellipse(1035, 246, 172, 54).fill({ color: accent, alpha: 0.055 });
      graphic.moveTo(-80, 282).bezierCurveTo(260, 252, 430, 300, 710, 270).bezierCurveTo(930, 244, 1130, 284, 1380, 250)
        .stroke({ color: spec.palette.mote, alpha: 0.07, width: 2 });
    } else if (spec.backdrop === 'tide-cliffs') {
      graphic.moveTo(-80, 248).bezierCurveTo(250, 224, 460, 268, 710, 236).bezierCurveTo(930, 208, 1130, 252, 1380, 220)
        .lineTo(1380, 302).lineTo(-80, 302).closePath().fill({ color: horizon, alpha: 0.34 });
      for (let index = 0; index < 7; index++) {
        const x = index * 214 - 62;
        const h = 42 + (index * 29) % 76;
        graphic.poly([x, 293, x + 24, 278 - h * 0.35, x + 62, 291 - h, x + 106, 282 - h * 0.42, x + 168, 293])
          .fill({ color: horizon, alpha: 0.72 });
        graphic.poly([x + 38, 291 - h * 0.42, x + 62, 291 - h, x + 76, 290 - h * 0.48])
          .fill({ color: groundDetail, alpha: 0.24 });
      }
      graphic.moveTo(-80, 289).bezierCurveTo(280, 282, 510, 300, 760, 287).bezierCurveTo(980, 276, 1160, 296, 1380, 284)
        .stroke({ color: accent, alpha: 0.28, width: 3 });
      graphic.moveTo(850, 174).lineTo(1010, 292).stroke({ color: spec.palette.mote, alpha: 0.055, width: 44 });
    } else if (spec.backdrop === 'dragon-rift') {
      graphic.poly([566, 294, 606, 210, 620, 78, 647, 146, 676, 52, 694, 214, 728, 294])
        .fill({ color: accent, alpha: 0.095 });
      graphic.moveTo(653, 40).bezierCurveTo(618, 102, 690, 146, 642, 214).bezierCurveTo(622, 244, 664, 266, 650, 298)
        .stroke({ color: spec.palette.mote, alpha: 0.34, width: 5 });
      for (let index = 0; index < 11; index++) {
        const x = index * 126 - 38;
        const h = 54 + (index * 23) % 112;
        graphic.poly([x, 296, x + 18, 284 - h * 0.34, x + 38, 294 - h, x + 60, 279 - h * 0.38, x + 92, 296])
          .fill({ color: horizon, alpha: 0.78 });
        graphic.moveTo(x + 38, 294 - h).lineTo(x + 48, 284 - h * 0.38).stroke({ color: accent, alpha: 0.28, width: 2 });
      }
    } else {
      graphic.ellipse(DESIGN_WIDTH / 2, 306, 790, 190).fill({ color: horizon, alpha: 0.58 });
      graphic.ellipse(DESIGN_WIDTH / 2, 286, 666, 105).fill({ color: spec.palette.sky, alpha: 0.92 });
      graphic.rect(-80, 228, 1440, 72).fill({ color: horizon, alpha: 0.52 });
      for (let index = 0; index < 11; index++) {
        const x = index * 126 - 22;
        graphic.roundRect(x, 242, 72, 58, 30).fill({ color: spec.palette.sky, alpha: 0.56 });
        graphic.rect(x + 33, 178 + index % 2 * 14, 7, 122 - index % 3 * 12).fill({ color: groundDetail, alpha: 0.34 });
        graphic.poly([x + 8, 205, x + 36, 182, x + 64, 205]).fill({ color: accent, alpha: 0.15 });
      }
    }
    this.farBackdrop.addChild(graphic);
  }

  private drawHorizonGrammar(spec: BattleEnvironmentSpec): void {
    const { horizon, mote } = spec.palette;
    const o = spec.overscan;
    const graphic = new Graphics();
    graphic.ellipse(DESIGN_WIDTH / 2, 300, 660 + o, 82 + o * 0.16).fill({ color: horizon, alpha: 0.38 });
    graphic.ellipse(DESIGN_WIDTH / 2, 294, 610 + o, 42 + o * 0.08).fill({ color: mote, alpha: spec.atmosphere.horizonHaze });
    if (spec.backdrop === 'forest-canopy') {
      graphic.ellipse(DESIGN_WIDTH / 2, 304, 590, 42).fill({ color: mote, alpha: 0.055 });
      graphic.ellipse(DESIGN_WIDTH / 2, 316, 510, 25).fill({ color: spec.palette.sky, alpha: 0.16 });
    }
    graphic.ellipse(DESIGN_WIDTH / 2, 306, 520 + o, 24).fill({ color: spec.palette.sky, alpha: spec.atmosphere.horizonHaze * 0.42 });
    this.horizonLayer.addChild(graphic);
  }

  private drawPerspectiveGround(spec: BattleEnvironmentSpec, paintBase = true): void {
    const { groundDetail, accent } = spec.palette;
    const o = spec.overscan;
    const ground = new Graphics();
    const topY = 294;
    if (paintBase) {
      ground.poly([-o, topY, DESIGN_WIDTH + o, topY, DESIGN_WIDTH + o, DESIGN_HEIGHT + o, -o, DESIGN_HEIGHT + o]).fill({ color: spec.palette.ground });
      ground.ellipse(DESIGN_WIDTH / 2, DESIGN_HEIGHT + 54, 820 + o, 176).fill({ color: spec.palette.sky, alpha: spec.atmosphere.groundShade });
    }
    // Broad irregular value shapes communicate depth without drawing a board.
    // The old evenly-spaced horizontal/radial strokes read as tactical cells
    // even though they were presentation-only.
    if (paintBase && spec.groundPattern === 'grass-lanes') {
      ground.ellipse(356, 430, 360, 72).fill({ color: groundDetail, alpha: 0.035 });
      ground.ellipse(930, 520, 510, 118).fill({ color: spec.palette.sky, alpha: 0.055 });
      ground.ellipse(566, 665, 680, 126).fill({ color: accent, alpha: 0.025 });
      ground.moveTo(-80, 482).bezierCurveTo(250, 444, 430, 520, 720, 484).bezierCurveTo(980, 452, 1130, 520, 1380, 474)
        .stroke({ color: groundDetail, alpha: 0.065, width: 7 });
    } else if (paintBase && spec.groundPattern === 'shallow-ripples') {
      for (let index = 0; index < 5; index++) {
        const t = (index + 1) / 6;
        ground.ellipse(DESIGN_WIDTH / 2, topY + 72 + t * t * 330, 340 + t * 420, 18 + t * 16)
          .stroke({ color: groundDetail, alpha: 0.05 + t * 0.06, width: 1.5 });
      }
    } else if (paintBase && spec.groundPattern === 'stone-terraces') {
      for (let index = 0; index < 4; index++) {
        const y = topY + 84 + index * 104;
        ground.moveTo(-o, y + index % 2 * 17).bezierCurveTo(310, y - 12, 770, y + 24, DESIGN_WIDTH + o, y - 5)
          .stroke({ color: groundDetail, alpha: 0.08 + index * 0.025, width: 2 + index * 0.5 });
      }
    } else if (paintBase && spec.groundPattern === 'rune-rings') {
      ground.ellipse(DESIGN_WIDTH / 2, 520, 480, 128).stroke({ color: accent, alpha: 0.065, width: 2 });
      ground.ellipse(DESIGN_WIDTH / 2, 520, 250, 68).stroke({ color: groundDetail, alpha: 0.08, width: 1 });
    } else if (paintBase) {
      // Arena paving remains architectural, but uses staggered seams rather
      // than a navigation-grid projection.
      for (let index = 0; index < 5; index++) {
        const y = topY + 70 + index * 86;
        ground.moveTo(-o, y).lineTo(DESIGN_WIDTH + o, y + (index % 2 ? 10 : -8)).stroke({ color: groundDetail, alpha: 0.08, width: 2 });
      }
    }
    this.groundLayer.addChild(ground);

    const detailDensity = paintBase ? 1 : (spec.art?.detailDensity ?? 0);
    const count = spec.groundPattern === 'grass-lanes'
      ? Math.round(96 * spec.density * DETAIL_DENSITY * detailDensity)
      : Math.round(42 * spec.density * DETAIL_DENSITY * detailDensity);
    for (let index = 0; index < count; index++) {
      const depth = ((index * 37) % 100) / 100;
      const y = topY + 42 + depth * depth * (DESIGN_HEIGHT - topY - 54);
      const spread = 130 + depth * 570;
      const x = DESIGN_WIDTH / 2 + (((index * 97) % 100) / 100 - 0.5) * 2 * spread;
      const size = 1.5 + depth * 9;
      const detail = new Graphics();
      if (spec.groundPattern === 'grass-lanes') {
        const bladeAlpha = 0.22 + depth * 0.30;
        for (let blade = -1; blade <= 1; blade++) {
          const baseX = x + blade * size * 0.55;
          detail.moveTo(baseX, y).lineTo(baseX + blade * size * 0.18, y - size * (1.45 + (blade + 1) * 0.28))
            .stroke({ color: blade === 0 ? accent : groundDetail, alpha: bladeAlpha, width: Math.max(1, size * 0.20) });
        }
      } else if (spec.groundPattern === 'stone-terraces') {
        detail.poly([x - size, y + size * 0.4, x - size * 0.32, y - size, x + size, y - size * 0.3, x + size * 0.62, y + size * 0.55]).fill({ color: groundDetail, alpha: 0.14 + depth * 0.20 });
      } else if (spec.groundPattern === 'shallow-ripples') {
        detail.ellipse(x, y, size * 2.6, Math.max(1, size * 0.42)).stroke({ color: groundDetail, alpha: 0.18 + depth * 0.18, width: 1 });
      } else if (spec.groundPattern === 'rune-rings') {
        detail.circle(x, y, size * 1.35).stroke({ color: index % 3 ? groundDetail : accent, alpha: 0.12 + depth * 0.18, width: 1 });
      } else {
        detail.rect(x - size, y - size * 0.28, size * 2, Math.max(1, size * 0.48)).fill({ color: groundDetail, alpha: 0.16 + depth * 0.18 });
      }
      this.groundLayer.addChild(detail);
    }
  }

  private drawAmbientGrammar(spec: BattleEnvironmentSpec): void {
    const count = Math.max(4, Math.round(22 * spec.density * DETAIL_DENSITY));
    for (let index = 0; index < count; index++) {
      const x = (index * 131 + 47) % DESIGN_WIDTH;
      const y = 108 + ((index * 71) % 224);
      const graphic = new Graphics({ blendMode: spec.ambience === 'dust' ? 'normal' : 'add' });
      if (spec.ambience === 'dust') graphic.ellipse(x, y, 4 + index % 3 * 2, 2).fill({ color: spec.palette.mote, alpha: 0.2 });
      else if (spec.ambience === 'spray') graphic.circle(x, y, 2 + index % 2).fill({ color: spec.palette.mote, alpha: 0.56 }).moveTo(x, y + 3).lineTo(x - 3, y + 10).stroke({ color: spec.palette.mote, alpha: 0.24, width: 1 });
      else if (spec.ambience === 'rune') graphic.star(x, y, 4, 4 + index % 4, 1.5).fill({ color: spec.palette.mote, alpha: 0.38 });
      else if (spec.ambience === 'sparks') graphic.rect(x, y, 2, 6 + index % 5).fill({ color: spec.palette.mote, alpha: 0.34 });
      else graphic.circle(x, y, 1.5 + index % 2).fill({ color: spec.palette.mote, alpha: 0.55 });
      this.horizonLayer.addChild(graphic);
    }
  }

  private drawForegroundGrammar(spec: BattleEnvironmentSpec): void {
    const { groundDetail, accent, mote } = spec.palette;
    const graphic = new Graphics();
    if (spec.foregroundFrame === 'ferns') {
      for (let index = 0; index < 18; index++) {
        const x = index * 78 - 22;
        const h = 20 + (index % 5) * 8;
        graphic.moveTo(x, DESIGN_HEIGHT).lineTo(x + 10, DESIGN_HEIGHT - h).stroke({ color: groundDetail, alpha: 0.42, width: 3 });
        graphic.moveTo(x + 9, DESIGN_HEIGHT - h * 0.6).lineTo(x + 26, DESIGN_HEIGHT - h * 0.82).stroke({ color: accent, alpha: 0.25, width: 2 });
      }
    } else if (spec.foregroundFrame === 'rock-ledge') {
      graphic.poly([0, DESIGN_HEIGHT, 0, 548, 42, 566, 92, 542, 134, 606, 192, DESIGN_HEIGHT]).fill({ color: groundDetail, alpha: 0.38 });
      graphic.poly([DESIGN_WIDTH, DESIGN_HEIGHT, DESIGN_WIDTH, 532, DESIGN_WIDTH - 42, 570, DESIGN_WIDTH - 96, 548, DESIGN_WIDTH - 142, 610, DESIGN_WIDTH - 196, DESIGN_HEIGHT]).fill({ color: groundDetail, alpha: 0.38 });
      graphic.moveTo(18, 570).lineTo(92, 542).lineTo(148, 616).stroke({ color: accent, alpha: 0.12, width: 3 });
      graphic.moveTo(DESIGN_WIDTH - 18, 554).lineTo(DESIGN_WIDTH - 96, 548).lineTo(DESIGN_WIDTH - 154, 620).stroke({ color: accent, alpha: 0.12, width: 3 });
    } else if (spec.foregroundFrame === 'spray') {
      for (let index = 0; index < 14; index++) {
        const x = index * 102 - 18;
        const y = 694 - index % 3 * 7;
        graphic.ellipse(x, y, 42, 8).stroke({ color: mote, alpha: 0.20, width: 2 });
        if (index % 3 === 0) graphic.moveTo(x, y - 5).bezierCurveTo(x - 12, y - 28, x + 16, y - 34, x + 26, y - 11).stroke({ color: mote, alpha: 0.11, width: 2 });
      }
    } else if (spec.foregroundFrame === 'crystal-veils') {
      for (const [index, x] of [0, 68, 1122, 1200].entries()) {
        const tipY = 548 + index % 2 * 34;
        graphic.poly([x, DESIGN_HEIGHT, x + 22, tipY, x + 62, DESIGN_HEIGHT]).fill({ color: accent, alpha: 0.24 });
        graphic.poly([x + 22, tipY, x + 34, DESIGN_HEIGHT, x + 48, DESIGN_HEIGHT]).fill({ color: mote, alpha: 0.09 });
      }
    } else {
      for (let index = 0; index < 6; index++) {
        const x = 74 + index * 220;
        graphic.poly([x - 42, DESIGN_HEIGHT, x - 12, 606 + index % 2 * 12, x + 18, DESIGN_HEIGHT]).fill({ color: groundDetail, alpha: 0.18 });
        graphic.rect(x, 606 + index % 2 * 12, 8, 114).fill({ color: groundDetail, alpha: 0.30 });
        graphic.poly([x - 26, 622, x + 4, 590, x + 34, 622]).fill({ color: accent, alpha: 0.16 });
      }
    }
    this.foreground.addChild(graphic);
  }

}
