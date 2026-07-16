import { battleArtMotionForAnimation, resolveBattleArtPresentation, type BattleArtLayerSpec, type BattleArtMotionId, type ResolvedBattleArtPresentation } from '@pokemon-online/config';
import type { BattleCombatant } from '@pokemon-online/shared';
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { BattleArtAssetLoader } from './BattleArtAssets.ts';

/**
 * GPU model view driven entirely by a resolved BattleArtProfile. It has no
 * species/skill/file-path branches: failed or unavailable assets retain the
 * configuration-owned procedural fallback so combat remains readable.
 */
export interface CombatantViewDiagnostics {
  modelId: string;
  profileId: string;
  layerCount: number;
  motion: BattleArtMotionId;
  spriteReady: boolean;
}

export class CombatantView extends Container {
  private readonly body = new Container();
  private readonly behindLayers = new Container();
  private readonly frontLayers = new Container();
  private readonly shadow = new Graphics();
  private readonly fallback = new Graphics();
  private readonly decorations = new Map<string, { graphic: Graphics; spec: BattleArtLayerSpec }>();
  private readonly sprite = new Sprite(Texture.EMPTY);
  private presentation: ResolvedBattleArtPresentation;
  private loadToken = 0;
  private motionElapsedMs = 0;
  private motion: BattleArtMotionId;
  private alive = true;
  private baseScale: number;

  constructor(
    combatant: BattleCombatant,
    private readonly assets: BattleArtAssetLoader,
  ) {
    super();
    this.presentation = resolveBattleArtPresentation({ speciesId: combatant.speciesId, side: combatant.side });
    this.motion = this.presentation.motion.id;
    this.baseScale = this.presentation.profile.scale;
    this.drawFallback();
    this.rebuildLayers();
    this.sprite.anchor.set(0.5, 0.58);
    this.sprite.visible = false;
    this.body.addChild(this.behindLayers, this.shadow, this.fallback, this.sprite, this.frontLayers);
    this.addChild(this.body);
    this.refresh(combatant);
    this.requestTexture();
  }

  refresh(combatant: BattleCombatant): void {
    const resolved = resolveBattleArtPresentation({ speciesId: combatant.speciesId, side: combatant.side });
    const changedAsset = this.presentation.asset.id !== resolved.asset.id;
    const changedProfile = this.presentation.profile.id !== resolved.profile.id;
    this.presentation = resolved;
    this.baseScale = resolved.profile.scale;
    this.alive = combatant.alive;
    if (changedProfile) this.rebuildLayers();
    if (changedAsset) this.requestTexture();
  }

  playAnimation(animation: string): void {
    this.setMotion(battleArtMotionForAnimation(animation));
  }

  getDiagnostics(): CombatantViewDiagnostics {
    return {
      modelId: this.presentation.profile.modelId,
      profileId: this.presentation.profile.id,
      layerCount: this.decorations.size,
      motion: this.motion,
      spriteReady: this.sprite.visible,
    };
  }

  update(dtSeconds: number): void {
    const clip = this.presentation.profile.motions[this.motion];
    this.motionElapsedMs += dtSeconds * 1000;
    const progress = clip.loop ? (this.motionElapsedMs % clip.durationMs) / clip.durationMs : Math.min(1, this.motionElapsedMs / clip.durationMs);
    if (!clip.loop && progress >= 1 && this.motion !== 'faint') this.setMotion('idle');

    const pulse = this.motion === 'idle' ? Math.sin(progress * Math.PI * 2) * 0.025
      : this.motion === 'locomotion' ? Math.sin(progress * Math.PI * 2) * 0.05
      : this.motion === 'charge' || this.motion === 'channel' ? Math.sin(progress * Math.PI * 2) * 0.035
      : 0;
    const recoil = this.motion === 'hit' ? Math.sin(progress * Math.PI) * -12 : 0;
    const faintScale = this.motion === 'faint' || !this.alive ? 1 - Math.min(0.3, progress * 0.3) : 1;
    const pose = this.presentation.profile.motionPoses[this.motion] ?? {};
    this.body.scale.set(
      this.baseScale * (pose.scaleX ?? 1) * (1 + pulse) * faintScale,
      this.baseScale * (pose.scaleY ?? 1) * (1 - pulse * 0.6) * faintScale,
    );
    this.body.position.set((pose.offsetX ?? 0) + recoil, pose.offsetY ?? 0);
    this.body.rotation = (pose.rotationDeg ?? 0) * Math.PI / 180;
    this.updateLayers(progress, pose.glowAlpha, pose.glowScale);
    this.alpha = this.alive ? 1 : 0.25;
  }

  private setMotion(motion: BattleArtMotionId): void {
    if (this.motion === motion) return;
    this.motion = motion;
    this.motionElapsedMs = 0;
  }

  private rebuildLayers(): void {
    this.behindLayers.removeChildren().forEach((child) => child.destroy());
    this.frontLayers.removeChildren().forEach((child) => child.destroy());
    this.decorations.clear();
    for (const spec of this.presentation.profile.layers) {
      const graphic = new Graphics();
      const color = colorNumber(this.presentation.theme[spec.color], 0xffffff);
      if (spec.kind === 'aura') graphic.ellipse(0, -4, 34, 42).fill({ color, alpha: spec.alpha });
      else graphic.circle(0, -8, 39).stroke({ color, alpha: spec.alpha, width: 3 });
      if (spec.depth === 'behind') this.behindLayers.addChild(graphic);
      else this.frontLayers.addChild(graphic);
      this.decorations.set(spec.id, { graphic, spec });
    }
  }

  private updateLayers(progress: number, glowAlpha = 0, glowScale = 1): void {
    const motionPulse = this.motion === 'charge' || this.motion === 'channel'
      ? Math.sin(progress * Math.PI * 2)
      : Math.sin(progress * Math.PI);
    for (const { graphic, spec } of this.decorations.values()) {
      const pulse = motionPulse * (spec.pulse ?? 0);
      graphic.scale.set(spec.scale * glowScale * (1 + pulse));
      graphic.alpha = Math.min(1, spec.alpha + glowAlpha * 0.55 + Math.max(0, pulse) * 0.22);
    }
  }

  private drawFallback(): void {
    const theme = this.presentation.theme;
    const primary = colorNumber(theme.primary, 0x69d4e7);
    const secondary = colorNumber(theme.secondary, 0x7ee6ac);
    this.shadow.clear().ellipse(0, 22, 43 * this.presentation.profile.shadowScale, 14).fill({ color: 0x07101a, alpha: 0.34 });
    this.fallback.clear()
      .circle(0, -8, 25).fill({ color: primary, alpha: 0.94 })
      .circle(-8, -16, 8).fill({ color: 0xffffff, alpha: 0.35 })
      .rect(-26, 26, 52, 6).fill({ color: 0x172331, alpha: 0.9 })
      .rect(-25, 27, 50, 4).fill({ color: secondary });
  }

  private requestTexture(): void {
    const requestId = ++this.loadToken;
    this.sprite.visible = false;
    this.fallback.visible = true;
    this.drawFallback();
    void this.assets.load(this.presentation.asset).then((texture) => {
      if (requestId !== this.loadToken || this.destroyed || !texture) return;
      this.sprite.texture = texture;
      const ratio = texture.height > 0 ? texture.width / texture.height : 1;
      const height = 106;
      this.sprite.height = height;
      this.sprite.width = Math.max(54, Math.min(142, height * ratio));
      this.sprite.visible = true;
      this.fallback.visible = false;
    });
  }
}

function colorNumber(value: string, fallback: number): number {
  const normalized = value.replace('#', '');
  const parsed = Number.parseInt(normalized, 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}
