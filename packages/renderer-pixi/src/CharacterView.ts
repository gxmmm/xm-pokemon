import type { Container, Graphics } from 'pixi.js';
import { Graphics as PixiGraphics, Container as PixiContainer } from 'pixi.js';

export type CharacterAppearance = 'hero' | 'researcher' | 'villager' | 'fisher' | 'scout';
export type CharacterBehavior = 'idle' | 'study-tide' | 'look-out' | 'sort-nets' | 'tend-lantern' | 'trace-stars';

interface Palette { skin: number; hair: number; shirt: number; trim: number; pants: number; }
const PALETTES: Record<CharacterAppearance, Palette> = {
  hero: { skin: 0xf2c79a, hair: 0x5a3a1a, shirt: 0x3a6ea5, trim: 0x2c5279, pants: 0x2a2a3a },
  researcher: { skin: 0xf0c59b, hair: 0xd9e9f7, shirt: 0xf4f5ea, trim: 0x91b7d1, pants: 0x33415c },
  villager: { skin: 0xe7b987, hair: 0x6e4a2a, shirt: 0xd5a15d, trim: 0x9b7041, pants: 0x4d4a5b },
  fisher: { skin: 0xc98f68, hair: 0x4e3324, shirt: 0x5a8d62, trim: 0x365d43, pants: 0x2e3c37 },
  scout: { skin: 0xd7aa7d, hair: 0x304c48, shirt: 0x607f5b, trim: 0xa8cc72, pants: 0x293b36 },
};

/** Renderer-local procedural character. It intentionally shares the palette and
 * silhouette language of the legacy Canvas character fallback without importing
 * app code or owning any world facts. */
export class CharacterView {
  readonly container: Container;
  private readonly body: Graphics;
  private readonly arm: Graphics;
  private readonly prop: Graphics;
  private readonly behaviorFx: Graphics;
  private behavior: CharacterBehavior;
  private appearance: CharacterAppearance;
  private phase = 0;
  private lastX = Number.NaN;
  private lastY = Number.NaN;

  constructor(appearance: CharacterAppearance, behavior: CharacterBehavior = 'idle') {
    this.container = new PixiContainer();
    this.body = new PixiGraphics();
    this.arm = new PixiGraphics();
    this.prop = new PixiGraphics();
    this.behaviorFx = new PixiGraphics({ blendMode: 'add' });
    this.container.addChild(this.body, this.arm, this.prop, this.behaviorFx);
    this.container.scale.set(1.28);
    this.appearance = appearance;
    this.behavior = behavior;
    this.draw();
  }

  setStyle(appearance: CharacterAppearance, behavior: CharacterBehavior): void {
    if (appearance === this.appearance && behavior === this.behavior) return;
    this.appearance = appearance;
    this.behavior = behavior;
    this.draw();
  }

  setWorldPosition(x: number, y: number): void {
    if (Number.isFinite(this.lastX)) this.phase += Math.hypot(x - this.lastX, y - this.lastY) * 0.7;
    this.lastX = x;
    this.lastY = y;
    this.container.position.set(x, y);
  }

  update(dt: number): void {
    this.phase += dt * (this.behavior === 'sort-nets' ? 3.5 : 1.5);
    const bob = this.behavior === 'idle' ? Math.sin(this.phase) * 0.7 : Math.sin(this.phase * 0.8) * 1.4;
    this.body.y = bob;
    this.arm.y = bob;
    this.prop.y = bob;
    this.behaviorFx.y = bob;
    if (this.behavior === 'study-tide') this.arm.rotation = Math.sin(this.phase * 1.4) * 0.22 - 0.28;
    else if (this.behavior === 'sort-nets') this.arm.rotation = Math.sin(this.phase * 1.7) * 0.62;
    else if (this.behavior === 'look-out') this.arm.rotation = -0.32 + Math.sin(this.phase * 0.75) * 0.14;
    else if (this.behavior === 'tend-lantern') this.arm.rotation = -0.14 + Math.sin(this.phase * 1.25) * 0.16;
    else if (this.behavior === 'trace-stars') this.arm.rotation = -0.52 + Math.sin(this.phase * 1.1) * 0.26;
    else this.arm.rotation = 0;
    this.body.rotation = this.behavior === 'look-out' ? Math.sin(this.phase * 0.45) * 0.055 : 0;
    this.drawBehaviorFx();
  }

  destroy(): void { this.container.destroy({ children: true }); }

  private drawBehaviorFx(): void {
    this.behaviorFx.clear();
    if (this.behavior === 'study-tide') {
      const pulse = (Math.sin(this.phase * 1.45) + 1) / 2;
      const radius = 18 + pulse * 13;
      this.behaviorFx.circle(21, 7, radius).stroke({ color: 0x79eaff, alpha: 0.56 - pulse * 0.18, width: 2 })
        .circle(21, 7, radius * 0.55).stroke({ color: 0xcffaff, alpha: 0.48, width: 1 })
        .moveTo(21 - radius, 7).lineTo(21 + radius, 7).stroke({ color: 0x9ff4ff, alpha: 0.34, width: 1 });
    } else if (this.behavior === 'look-out') {
      const scan = Math.sin(this.phase * 0.75) * 8;
      this.behaviorFx.circle(20, -7, 5).stroke({ color: 0x2d3749, width: 3 })
        .circle(30, -9, 5).stroke({ color: 0x2d3749, width: 3 })
        .moveTo(34, -10).lineTo(58, -16 + scan).stroke({ color: 0xffe29a, alpha: 0.58, width: 3 })
        .moveTo(34, -10).lineTo(58, -4 + scan).stroke({ color: 0xffe29a, alpha: 0.22, width: 1 });
    } else if (this.behavior === 'tend-lantern') {
      const pulse = (Math.sin(this.phase * 1.5) + 1) / 2;
      this.behaviorFx.circle(22, -2, 10 + pulse * 5).fill({ color: 0xd7ee7b, alpha: 0.1 + pulse * 0.09 })
        .circle(22, -2, 3 + pulse * 1.5).fill({ color: 0xeaffad, alpha: 0.82 })
        .circle(10 + Math.sin(this.phase * 1.1) * 12, -14, 2).fill({ color: 0xb9f7d1, alpha: 0.72 })
        .circle(29 + Math.cos(this.phase * 0.9) * 11, 9, 1.6).fill({ color: 0xb9f7d1, alpha: 0.58 });
    } else if (this.behavior === 'trace-stars') {
      const pulse = (Math.sin(this.phase * 1.1) + 1) / 2;
      this.behaviorFx.circle(20, -8, 12 + pulse * 9).stroke({ color: 0xd7e5ff, alpha: 0.48, width: 1.5 })
        .star(28, -20, 4, 4 + pulse * 3, 1.6).fill({ color: 0xeaf4ff, alpha: 0.78 })
        .moveTo(9, -5).lineTo(28, -20).stroke({ color: 0xaec9ff, alpha: 0.54, width: 1.5 });
    } else if (this.behavior === 'sort-nets') {
      const swing = Math.sin(this.phase * 1.7) * 6;
      this.behaviorFx.ellipse(20, 8 + swing, 17, 12).stroke({ color: 0xf4dda0, alpha: 0.88, width: 3 })
        .moveTo(5, -1 + swing).lineTo(34, 17 + swing).stroke({ color: 0xf4dda0, alpha: 0.55, width: 1 })
        .moveTo(34, -1 + swing).lineTo(5, 17 + swing).stroke({ color: 0xf4dda0, alpha: 0.55, width: 1 })
        .circle(20, 8 + swing, 23).stroke({ color: 0x8be2e8, alpha: 0.22, width: 2 });
    }
  }

  private draw(): void {
    const color = PALETTES[this.appearance];
    this.body.clear()
      .ellipse(0, 16, 16, 5).fill({ color: 0x10202a, alpha: 0.28 })
      .rect(-8, 6, 6, 13).fill({ color: color.pants })
      .rect(2, 6, 6, 13).fill({ color: color.pants })
      .rect(-10, -7, 20, 15).fill({ color: color.shirt })
      .rect(-10, 5, 20, 3).fill({ color: color.trim })
      .rect(-7, -22, 14, 15).fill({ color: color.skin })
      .rect(-9, -24, 18, 6).fill({ color: color.hair })
      .rect(-9, -24, 4, 11).fill({ color: color.hair })
      .rect(5, -24, 4, 11).fill({ color: color.hair })
      .rect(-4, -16, 2, 2).fill({ color: 0x242638 })
      .rect(2, -16, 2, 2).fill({ color: 0x242638 });
    this.arm.clear().rect(10, -5, 5, 13).fill({ color: color.shirt }).rect(10, 6, 5, 4).fill({ color: color.skin });
    this.prop.clear();
    if (this.behavior === 'study-tide') this.prop.rect(15, 3, 12, 8).fill({ color: 0xaad6df }).rect(17, 5, 8, 4).fill({ color: 0xeaf8f4 });
    if (this.behavior === 'sort-nets') this.prop.circle(18, 8, 8).stroke({ color: 0xd7c28f, alpha: 0.9, width: 2 }).moveTo(12, 2).lineTo(24, 14).stroke({ color: 0xd7c28f, alpha: 0.7, width: 1 });
    if (this.behavior === 'look-out') this.prop.moveTo(14, -3).lineTo(26, -7).stroke({ color: 0x6c4e31, width: 3 });
    if (this.behavior === 'tend-lantern') this.prop.moveTo(15, -4).lineTo(22, -9).stroke({ color: 0x5c4a31, width: 2 }).rect(19, -13, 7, 9).fill({ color: 0x9aa65c }).circle(22.5, -8.5, 2.4).fill({ color: 0xeaffad });
    if (this.behavior === 'trace-stars') this.prop.moveTo(13, -3).lineTo(28, -18).stroke({ color: 0x6d829d, width: 2 }).circle(30, -20, 4).stroke({ color: 0xd7e5ff, width: 1.5 });
  }
}
