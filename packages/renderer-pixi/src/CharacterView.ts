import type { Container, Graphics } from 'pixi.js';
import { Graphics as PixiGraphics, Container as PixiContainer } from 'pixi.js';

export type { WorldCharacterAppearance as CharacterAppearance, WorldCharacterBehavior as CharacterBehavior } from '@pokemon-online/config';
import type { WorldCharacterAppearance as CharacterAppearance, WorldCharacterBehavior as CharacterBehavior } from '@pokemon-online/config';

interface Palette { skin: number; hair: number; shirt: number; trim: number; pants: number; }
const PALETTES: Record<CharacterAppearance, Palette> = {
  hero: { skin: 0xf2c79a, hair: 0x5a3a1a, shirt: 0x3a6ea5, trim: 0x2c5279, pants: 0x2a2a3a },
  fisher: { skin: 0xc98f68, hair: 0x4e3324, shirt: 0x5a8d62, trim: 0x365d43, pants: 0x2e3c37 },
};

/** Renderer-local procedural world character. It owns no app state or world
 * facts; appearance and behavior arrive through renderer DTOs. */
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
    this.arm.rotation = this.behavior === 'sort-nets' ? Math.sin(this.phase * 1.7) * 0.62 : 0;
    this.drawBehaviorFx();
  }

  destroy(): void { this.container.destroy({ children: true }); }

  private drawBehaviorFx(): void {
    this.behaviorFx.clear();
    if (this.behavior === 'sort-nets') {
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
    if (this.behavior === 'sort-nets') this.prop.circle(18, 8, 8).stroke({ color: 0xd7c28f, alpha: 0.9, width: 2 }).moveTo(12, 2).lineTo(24, 14).stroke({ color: 0xd7c28f, alpha: 0.7, width: 1 });
  }
}
