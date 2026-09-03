import type { BattleCombatant } from '@pokemon-online/shared';
import { Graphics } from 'pixi.js';

export type CombatantStatusVisual = 'none' | 'sleep' | 'freeze' | 'stun' | 'paralyze' | 'confuse' | 'burn' | 'poison';

type CombatantStatusState = Pick<BattleCombatant, 'alive' | 'status' | 'stunActive'>;

/** Persistent, model-local status silhouettes driven only by renderer-facing combatant state. */
export class CombatantStatusLayer extends Graphics {
  private visual: CombatantStatusVisual = 'none';
  private alive = true;

  constructor() {
    super({ blendMode: 'add' });
  }

  get statusVisual(): CombatantStatusVisual {
    return this.visual;
  }

  refresh(combatant: CombatantStatusState): void {
    this.alive = combatant.alive;
    this.visual = combatant.status === 'sleep' || combatant.status === 'freeze' || combatant.status === 'paralyze' || combatant.status === 'confuse' || combatant.status === 'burn' || combatant.status === 'poison'
      ? combatant.status
      : combatant.stunActive ? 'stun' : 'none';
  }

  render(phaseSeconds: number): void {
    this.clear();
    if (!this.alive || this.visual === 'none') return;

    if (this.visual === 'sleep') {
      // Large drifting Z glyphs and a dim breathing halo remain readable under occlusion.
      const drift = Math.sin(phaseSeconds * 2.4) * 3;
      this.ellipse(0, -22, 44, 19).fill({ color: 0x596bdb, alpha: 0.18 + Math.sin(phaseSeconds * 2) * 0.05 });
      for (let index = 0; index < 3; index++) {
        const t = (phaseSeconds * 0.42 + index / 3) % 1;
        const x = 17 + index * 11;
        const y = -61 - t * 22 + drift;
        const size = 7 + index * 2;
        this.moveTo(x - size * 0.48, y - size * 0.52).lineTo(x + size * 0.48, y - size * 0.52).lineTo(x - size * 0.35, y + size * 0.54).lineTo(x + size * 0.48, y + size * 0.54)
          .stroke({ color: 0xd5e7ff, alpha: 0.88 - t * 0.32, width: 3 });
      }
    } else if (this.visual === 'freeze') {
      // A cyan body shell, cracks, and edge spikes make containment explicit.
      const pulse = 1 + Math.sin(phaseSeconds * 5) * 0.05;
      this.ellipse(0, -12, 46 * pulse, 61 * pulse).fill({ color: 0x83ddf6, alpha: 0.50 })
        .ellipse(0, -12, 43 * pulse, 57 * pulse).stroke({ color: 0x9feeff, alpha: 0.96, width: 5 })
        .ellipse(0, -12, 35 * pulse, 48 * pulse).stroke({ color: 0xe3fbff, alpha: 0.72, width: 2.2 });
      for (const [x1, y1, x2, y2] of [[-22, -48, -8, -20], [-8, -20, -22, 7], [18, -43, 6, -15], [6, -15, 23, 10], [-2, -55, 5, -32]] as const) {
        this.moveTo(x1, y1).lineTo(x2, y2).stroke({ color: 0xe9fdff, alpha: 0.78, width: 2.2 });
      }
      for (let index = -2; index <= 2; index++) {
        const x = index * 15;
        const height = 14 + (Math.abs(index) % 2) * 8;
        this.poly([x - 6, 24, x, 24 - height, x + 7, 24]).fill({ color: index === 0 ? 0xe4fbff : 0x72d8f4, alpha: 0.92 });
      }
      for (let index = 0; index < 4; index++) {
        const angle = phaseSeconds * 1.8 + index * Math.PI / 2;
        this.circle(Math.cos(angle) * 38, -13 + Math.sin(angle) * 32, 3.5).fill({ color: 0xffffff, alpha: 0.84 });
      }
    } else if (this.visual === 'paralyze') {
      // Thick intermittent arcs cross the body instead of reading as a foot effect.
      const flash = Math.sin(phaseSeconds * 16) > -0.2 ? 1 : 0.38;
      for (let bolt = 0; bolt < 4; bolt++) {
        const baseY = -45 + bolt * 20;
        const zig = (bolt % 2 ? 1 : -1) * 12;
        this.moveTo(-38, baseY).lineTo(-12, baseY + zig).lineTo(9, baseY - zig * 0.7).lineTo(39, baseY + 5)
          .stroke({ color: 0xffdf58, alpha: 0.90 * flash, width: 4.5 })
          .moveTo(-38, baseY).lineTo(-12, baseY + zig).lineTo(9, baseY - zig * 0.7).lineTo(39, baseY + 5)
          .stroke({ color: 0xffffff, alpha: 0.82 * flash, width: 1.5 });
      }
      this.circle(0, -12, 28).stroke({ color: 0xffdf58, alpha: 0.44 * flash, width: 3 });
    } else if (this.visual === 'confuse') {
      // Counter-rotating purple glyphs communicate loss of control without moving the root.
      for (let ring = 0; ring < 3; ring++) {
        const angle = phaseSeconds * (ring % 2 ? -4.8 : 4.2) + ring * 1.8;
        const radius = 28 + ring * 10;
        const x = Math.cos(angle) * radius;
        const y = -14 + Math.sin(angle) * radius * 0.45;
        this.star(x, y, 4, 8 + ring * 2, 3).stroke({ color: ring === 0 ? 0xffffff : 0xc787e8, alpha: 0.86, width: 2.4 });
      }
      this.ellipse(0, -13, 43, 17).stroke({ color: 0xc787e8, alpha: 0.70, width: 3 })
        .circle(0, -13, 5).fill({ color: 0xffffff, alpha: 0.86 });
    } else if (this.visual === 'burn') {
      // Low-frequency flames cling to the body for the full status duration.
      for (let flame = 0; flame < 6; flame++) {
        const phaseOffset = phaseSeconds * 3 + flame * 1.14;
        const x = Math.sin(phaseOffset) * (16 + flame % 3 * 8);
        const y = 20 - ((phaseSeconds * 20 + flame * 17) % 58);
        const size = 8 + flame % 3 * 3;
        this.poly([x - size * 0.45, y + size * 0.55, x + Math.sin(phaseOffset) * 4, y - size, x + size * 0.45, y + size * 0.55]).fill({ color: flame % 2 ? 0xff7448 : 0xffd36b, alpha: 0.82 });
        this.circle(x, y + 2, size * 0.22).fill({ color: 0xfff0ad, alpha: 0.88 });
      }
      this.ellipse(0, 16, 38, 10).fill({ color: 0xd94330, alpha: 0.18 });
    } else if (this.visual === 'poison') {
      // Heavy violet-green fumes stay visually distinct from upward orange burn embers.
      for (let bubble = 0; bubble < 7; bubble++) {
        const t = (phaseSeconds * 0.26 + bubble / 7) % 1;
        const x = Math.sin(phaseSeconds * 3 + bubble * 2.4) * (12 + bubble % 3 * 9);
        const y = 22 - t * 68;
        const radius = 6 + (1 - t) * (bubble % 2 ? 7 : 4);
        this.circle(x, y, radius).fill({ color: bubble % 2 ? 0xb65bd5 : 0x82c86a, alpha: 0.46 + (1 - t) * 0.28 })
          .circle(x - radius * 0.25, y - radius * 0.22, radius * 0.24).fill({ color: 0xe0b4f4, alpha: 0.72 });
      }
      this.ellipse(0, 15, 42, 14).fill({ color: 0x6c3f86, alpha: 0.24 });
    } else {
      const orbit = 31 + Math.sin(phaseSeconds * 7) * 3;
      for (let index = 0; index < 3; index++) {
        const angle = phaseSeconds * 5 + index * Math.PI * 2 / 3;
        const x = Math.cos(angle) * orbit;
        const y = -57 + Math.sin(angle) * 10;
        this.star(x, y, 5, 10, 4).fill({ color: index === 0 ? 0xffffff : 0xffdf58, alpha: 0.94 });
      }
      this.ellipse(0, -28, 38, 16).stroke({ color: 0xffdf58, alpha: 0.64, width: 2.4 });
    }
  }
}
