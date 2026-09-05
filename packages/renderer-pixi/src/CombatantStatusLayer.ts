import type { BattleCombatant } from '@pokemon-online/shared';
import { BATTLE_BODY_EFFECTS } from '@pokemon-online/config';
import { Graphics } from 'pixi.js';
import { drawBodyFlames } from './natural-effect-shapes.ts';

export type CombatantStatusVisual = 'none' | 'sleep' | 'freeze' | 'stun' | 'paralyze' | 'confuse' | 'burn' | 'poison';
type CombatantStatusState = Pick<BattleCombatant, 'alive' | 'status' | 'stunActive'>;
const GLYPHS = {
  sleep: ['1111', '0001', '0010', '0100', '1111'],
  confuse: ['0110', '1001', '0010', '0000', '0010'],
  stun: ['00100', '10101', '01110', '10101', '00100'],
} as const;

/** Restrained sprite-like details; state comes exclusively from delayed DTOs. */
export class CombatantStatusLayer extends Graphics {
  private visual: CombatantStatusVisual = 'none';
  constructor() { super({ blendMode: 'normal' }); }
  get statusVisual(): CombatantStatusVisual { return this.visual; }

  refresh(combatant: CombatantStatusState): void {
    this.visual = !combatant.alive ? 'none' : combatant.status ?? (combatant.stunActive ? 'stun' : 'none');
    if (this.visual === 'none') this.clear();
  }

  render(seconds: number, width = 106, height = 106, displayScale = 1): void {
    this.clear();
    const palette = BATTLE_BODY_EFFECTS.palette;
    const scale = Math.max(0.2, displayScale);
    const pixel = Math.max(0.9, Math.min(1.35, height / 60), BATTLE_BODY_EFFECTS.minimumScreenPixel.body / scale);
    if (this.visual === 'burn') {
      drawBodyFlames(this, seconds, width, height, palette.fire, palette.fireTip, scale);
    } else if (this.visual === 'sleep' || this.visual === 'confuse' || this.visual === 'stun') {
      const count = this.visual === 'stun' ? 3 : 2;
      const color = this.visual === 'sleep' ? palette.sleep : this.visual === 'confuse' ? palette.confuse : palette.electric;
      const glyphPixel = Math.max(pixel, BATTLE_BODY_EFFECTS.minimumScreenPixel.glyph / scale);
      const pattern = GLYPHS[this.visual];
      for (let i = 0; i < count; i++) {
        const drift = Math.sin(seconds * 1.8 + i * 1.7) * 2;
        const x = (i - (count - 1) / 2) * (pattern[0].length * glyphPixel + 4 / scale) - pattern[0].length * glyphPixel / 2;
        const y = -height / 2 - pattern.length * glyphPixel - 5 / scale + drift - i % 2 * 3;
        pattern.forEach((row, py) => [...row].forEach((cell, px) => {
          if (cell !== '1') return;
          this.rect(x + px * glyphPixel + 1 / scale, y + py * glyphPixel + 1 / scale, glyphPixel, glyphPixel).fill({ color: palette.shadow, alpha: 0.8 })
            .rect(x + px * glyphPixel, y + py * glyphPixel, glyphPixel, glyphPixel).fill({ color, alpha: 0.95 });
        }));
      }
    } else if (this.visual === 'poison') {
      const smokePixel = Math.max(pixel, 1.2 / scale);
      for (let i = 0; i < 4; i++) {
        const life = (seconds * 0.3 + i * 0.237) % 1;
        const x = (i % 2 ? 0.25 : -0.35) * width;
        const y = height * (0.22 - life * 0.40);
        const alpha = 0.35 + Math.sin(life * Math.PI) * 0.50;
        this.rect(x - smokePixel, y, 5 * smokePixel, 3 * smokePixel).fill({ color: palette.poison, alpha })
          .rect(x, y - 2 * smokePixel, 3 * smokePixel, 2 * smokePixel).fill({ color: palette.poisonLight, alpha: alpha * 0.85 })
          .rect(x, y, 2 * smokePixel, 2 * smokePixel).fill({ color: palette.poisonCore, alpha: 0.65 + Math.sin(life * Math.PI) * 0.25 });
      }
    } else if (this.visual === 'paralyze') {
      const arcPixel = Math.max(pixel, 1.25 / scale);
      for (let i = 0; i < 2; i++) {
        const x = (i ? 0.30 : -0.30) * width, y = (i ? 0.12 : -0.12) * height;
        const alpha = 0.60 + Math.max(0, Math.sin(seconds * 4 + i * Math.PI)) * 0.35;
        const path = () => this.moveTo(x - 2 * arcPixel, y - 4 * arcPixel).lineTo(x, y - arcPixel)
          .lineTo(x - 2 * arcPixel, y + arcPixel).lineTo(x + 2 * arcPixel, y + 4 * arcPixel);
        path().stroke({ color: palette.shadow, alpha: alpha * 0.9, width: 3.5 / scale });
        path().stroke({ color: palette.electric, alpha, width: 1.8 / scale });
        path().stroke({ color: palette.iceLight, alpha: alpha * 0.85, width: 0.65 / scale });
      }
    } else if (this.visual === 'freeze') {
      for (const [ax, ay] of [[-0.25, 0.25], [0.20, 0.28], [-0.30, -0.05], [0.29, -0.16], [-0.12, 0.12]] as const) {
        const x = ax * width, y = ay * height;
        this.poly([x - 3 * pixel, y + 2 * pixel, x - 4 * pixel, y - 4 * pixel, x, y - 9 * pixel, x + 3 * pixel, y - 4 * pixel, x + 2 * pixel, y + 2 * pixel])
          .fill({ color: palette.ice, alpha: 0.65 })
          .moveTo(x, y - 7 * pixel).lineTo(x, y).stroke({ color: palette.iceLight, alpha: 0.82, width: pixel });
      }
    }
  }
}
