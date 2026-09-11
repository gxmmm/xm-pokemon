import { BATTLE_HIT_REACTION, BATTLE_VISUAL_THEMES, battleArtMotionForAnimation, resolveBattleArtAnchor, resolveBattleArtPresentation, type BattleArtAnchorId, type BattleArtLayerSpec, type BattleArtLocomotionMode, type BattleArtMotionId, type BattleVisualTheme, type ResolvedBattleArtPresentation } from '@pokemon-online/config';
import type { BattleActorChoreography, BattleCombatant, TypeName } from '@pokemon-online/shared';
import { Container } from 'pixi.js';
import { PixelGraphics as Graphics } from './PixelGraphics.ts';
import type { BattleArtAssetLoader } from './BattleArtAssets.ts';
import { BATTLE_SPRITE_DISPLAY_HEIGHT, CombatantSprite } from './CombatantSprite.ts';
import { CombatantStatusLayer, type CombatantStatusVisual } from './CombatantStatusLayer.ts';
import { parseHexColor } from './pixi-color.ts';
import { groundShadowPlan } from './terrain-contact-plan.ts';
import { sampleBattleMotionPose } from './battle-motion.ts';
import { drawBodyFlames, drawElementMotes, moteSite } from './natural-effect-shapes.ts';
import { BATTLE_FOOT_CONTACT, BATTLE_BODY_DISPLAY } from '@pokemon-online/config';

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
  queuedMotionCount: number;
  hitReacting: boolean;
  facing: 1 | -1;
  casting: boolean;
  /** True while delayed battle snapshots indicate locomotion. */
  moving: boolean;
  /** Normalized cast windup currently shown by the generic charge halo. */
  chargeProgress: number;
  /** Child bitmap sign must match parent facing to preserve the selected source view. */
  bitmapFacing: 1 | -1;
  transitioning: boolean;
  spriteReady: boolean;
  locomotionMode: BattleArtLocomotionMode;
  /** Negative values lift the model above its root/ground plane. */
  visualHoverOffsetY: number;
  movementBobOffsetY: number;
  movementTiltDeg: number;
  movementSpeed: number;
  projectedLiftPixels: number;
  shadowAlpha: number;
  statusVisual: CombatantStatusVisual;
}

export class CombatantView extends Container {
  /** Sorted with this actor, so rear terrain cannot cover nearer actors. */
  readonly footOcclusion = new Container();
  private readonly body = new Container();
  private readonly behindLayers = new Container();
  private readonly frontLayers = new Container();
  private readonly shadow = new Graphics();
  /** Generic casting halo driven by castProgress; no model or skill branches. */
  private readonly chargeAura = new Graphics({ blendMode: 'add' });
  /** Generic element-tinted outline used by configuration-owned actor travel. */
  private readonly choreographyOutline = new Graphics({ blendMode: 'normal' });
  private readonly statusLayer = new CombatantStatusLayer();
  private readonly fallback = new Graphics();
  private readonly decorations = new Map<string, { graphic: Graphics; spec: BattleArtLayerSpec }>();
  private readonly sprite: CombatantSprite;
  private presentation: ResolvedBattleArtPresentation;
  private motionElapsedMs = 0;
  private bodyEffectSeconds = 0;
  private motion: BattleArtMotionId;
  private spriteMotion: BattleArtMotionId = 'idle';
  private motionDurationOverrideMs: number | null = null;
  private activeChoreography: ActiveActorChoreography | null = null;
  private queuedMotions: QueuedMotion[] = [];
  private hitReactionElapsedMs: number | null = null;
  private hitOffsetX = 0;
  private transitionElapsedMs = 0;
  private transitionDurationMs = 0;
  private transitionFrom: MotionTransform | null = null;
  /** Renderer-facing direction comes from the battle snapshot, never model IDs. */
  private facing: 1 | -1 = 1;
  private alive = true;
  private casting = false;
  /** Latest delayed-snapshot position, used only to select the generic locomotion clip. */
  private snapshotPosition: { x: number; y: number } | null = null;
  private locomotionHoldSeconds = 0;
  private moving = false;
  /** Normalized engine-authoritative windup progress for the persistent charge halo. */
  private chargeProgress = 0;
  private visualHoverOffsetY = 0;
  private hoverPhase = 0;
  private movementVelocity = { x: 0, y: 0 };
  private movementSpeed = 0;
  private movementBobOffsetY = 0;
  private movementTiltRad = 0;
  private movementPhase = 0;
  private groundingOffset = { x: 0, y: 0 };
  private projectedLiftPixels = 0;
  private terrainShadowAlphaMultiplier = 1;
  private terrainShadowScaleMultiplier = 1;
  private baseScale: number;

  constructor(
    combatant: BattleCombatant,
    assets: BattleArtAssetLoader,
  ) {
    super();
    this.sprite = new CombatantSprite(assets, this.fallback, () => this.destroyed);
    this.presentation = resolveBattleArtPresentation({ speciesId: combatant.speciesId, side: combatant.side, facing: combatant.facing });
    // Resolver defaults describe a potential skill cast; a newly mounted
    // combatant must always begin from the neutral visual state.
    this.motion = 'idle';
    this.baseScale = this.presentation.profile.scale;
    this.drawFallback();
    this.rebuildLayers();
    this.body.addChild(this.behindLayers, this.chargeAura, this.fallback, this.sprite, this.choreographyOutline, this.statusLayer, this.frontLayers);
    // The contact shadow belongs to the projected ground root, not the animated
    // body. Attacks, recoil, tilt, hover, and future world-z motion must not drag
    // it away from the terrain.
    this.addChild(this.shadow, this.body, this.footOcclusion);
    this.refresh(combatant);
    void this.sprite.setAsset(this.presentation.asset, this.motion);
  }

  refresh(combatant: BattleCombatant): void {
    const resolved = resolveBattleArtPresentation({ speciesId: combatant.speciesId, side: combatant.side, facing: combatant.facing });
    const changedAsset = this.presentation.asset.id !== resolved.asset.id;
    const changedProfile = this.presentation.profile.id !== resolved.profile.id;
    this.presentation = resolved;
    this.baseScale = this.displayScale();
    this.facing = combatant.facing;
    this.alive = combatant.alive;
    this.statusLayer.refresh(combatant);
    this.updateLocomotionIntent(combatant);
    const beganCasting = !!combatant.castProgress && !this.casting;
    this.casting = !!combatant.castProgress;
    if (combatant.castProgress) {
      // Resolve only through the configuration authority. The simulator owns
      // remaining time; the renderer merely turns that DTO into a readable halo.
      const cast = resolveBattleArtPresentation({
        speciesId: combatant.speciesId,
        side: combatant.side,
        facing: combatant.facing,
        skillId: combatant.castProgress.skillId,
      }).cast;
      const totalSeconds = Math.max(0.001, cast.windupMs / 1000);
      this.chargeProgress = clamp01(1 - combatant.castProgress.remaining / totalSeconds);
    } else {
      this.chargeProgress = 0;
    }
    // castProgress is an authoritative, renderer-facing DTO. Enter charge as
    // soon as it appears so the visual front swing cannot be skipped by a
    // delayed event batch or snapshot interpolation.
    if (beganCasting && this.motion !== 'faint') {
      this.queuedMotions = [];
      this.setMotion('charge');
    } else if (!this.casting) {
      // An interrupted cast has no release cue by design. Return its persistent
      // charge clip to the neutral movement lane as soon as castProgress clears;
      // a resolved cast cue arriving in the same presentation batch can still
      // immediately replace this neutral pose with its configured action.
      if (this.motion === 'charge' && this.queuedMotions.length === 0) {
        this.setMotion(this.moving && this.alive ? 'locomotion' : 'idle');
      } else {
        this.syncLocomotionMotion();
      }
    }
    if (changedProfile) this.rebuildLayers();
    if (changedAsset) {
      this.drawFallback();
      void this.sprite.setAsset(this.presentation.asset, this.spriteMotion, !changedProfile);
    }
  }

  playAnimation(
    animation: string,
    schedule: 'immediate' | 'after-current-motion' = 'immediate',
    durationMs?: number,
    choreography?: BattleActorChoreography,
    target?: { x: number; y: number },
    element?: TypeName,
  ): void {
    if (this.motion === 'faint' || (!this.alive && animation !== 'faint')) return;
    if (animation === 'interrupt') {
      this.casting = false;
      this.chargeProgress = 0;
      this.chargeAura.clear();
      this.queuedMotions = this.queuedMotions.filter((entry) => entry.motion !== 'charge');
      if (this.motion === 'charge') this.setMotion(this.moving && this.alive ? 'locomotion' : 'idle');
      return;
    }
    const motion = battleArtMotionForAnimation(animation);
    if (motion === 'hit') {
      if (this.motion === 'hit') return;
      if (isActionMotion(this.motion) || this.motion === 'recover') {
        // Coalesce concurrent damage into one bounded accent. Do not rewind the
        // primary clip, its asset, choreography, or queued recovery.
        this.hitReactionElapsedMs ??= 0;
        return;
      }
    }
    const entry = { motion, durationMs, choreography, target, element };
    if (schedule === 'after-current-motion') {
      this.queuedMotions.push(entry);
      return;
    }
    // Auto battles may produce several ready skills in adjacent simulation
    // frames. Serialize their visible actions behind the current action and its
    // already-queued recover instead of replacing that recovery. A windup is
    // deliberately pre-emptible by its own release action, while faint remains
    // authoritative and clears cosmetic work that can no longer be observed.
    if (isActionMotion(motion) && this.shouldQueueAction()) {
      this.queuedMotions.push(entry);
      return;
    }
    if (motion === 'faint') {
      this.queuedMotions = [];
      this.hitReactionElapsedMs = null;
    }
    this.setMotion(motion, durationMs, choreography, target, element);
  }

  isSettled(): boolean {
    if (this.hitReactionElapsedMs !== null) return false;
    if (this.transitionFrom || this.queuedMotions.length > 0) return false;
    if (this.motion === 'idle' || this.motion === 'locomotion') return true;
    if (this.motion !== 'faint') return false;
    return this.motionElapsedMs >= this.activeMotionDurationMs();
  }

  private displayScale(): number {
    const authored = this.presentation.profile.scale;
    if (!this.sprite.visible) return authored;
    // Use the stable contact frame, so animated frame silhouettes never pump
    // the body size. Pose, status, shadow and anchors share this same scale.
    const body = this.sprite.getBodyBounds(true);
    return authored * Math.min(1, BATTLE_BODY_DISPLAY.maxWidth / Math.max(1, body.width * authored),
      BATTLE_BODY_DISPLAY.maxHeight / Math.max(1, body.height * authored));
  }

  setGrounding(
    offset: { x: number; y: number },
    projectedLiftPixels: number,
    shadowAlphaMultiplier = 1,
    shadowScaleMultiplier = 1,
  ): void {
    this.groundingOffset = offset;
    this.projectedLiftPixels = Math.max(0, projectedLiftPixels);
    this.terrainShadowAlphaMultiplier = shadowAlphaMultiplier;
    this.terrainShadowScaleMultiplier = shadowScaleMultiplier;
  }

  /** Stage-plane coordinates, excluding camera transforms shared by the VFX layer. */
  getFootContactFrame() {
    const anchor = resolveBattleArtAnchor(this.presentation.profile, 'ground');
    const body = this.sprite.visible ? this.sprite.getBodyBounds(true) : { x: 0, y: -8, width: 64, height: 76 };
    return {
      container: this.footOcclusion,
      x: this.groundingOffset.x + (body.x + anchor.x * body.width) * this.baseScale,
      y: this.groundingOffset.y + (body.y + body.height / 2) * this.baseScale + (this.presentation.profile.motionPoses.idle?.offsetY ?? 0),
      width: body.width * this.baseScale * BATTLE_FOOT_CONTACT.widthRatio,
      height: body.height * this.baseScale * BATTLE_FOOT_CONTACT.heightRatio,
      scale: this.scale.y,
      grounded: this.alive && this.projectedLiftPixels < 2,
    };
  }

  getAnchorPosition(id: BattleArtAnchorId): { x: number; y: number } {
    const anchor = resolveBattleArtAnchor(this.presentation.profile, id);
    const width = this.sprite.visible ? this.sprite.width : BATTLE_SPRITE_DISPLAY_HEIGHT;
    const height = this.sprite.visible ? this.sprite.height : BATTLE_SPRITE_DISPLAY_HEIGHT;
    this.body.updateLocalTransform();
    this.updateLocalTransform();
    const bodyPoint = this.body.localTransform.apply(this.sprite.getFrameAnchor(id) ?? { x: anchor.x * width, y: anchor.y * height });
    return this.localTransform.apply(bodyPoint);
  }

  getDiagnostics(): CombatantViewDiagnostics {
    return {
      modelId: this.presentation.profile.modelId,
      profileId: this.presentation.profile.id,
      layerCount: this.decorations.size,
      motion: this.motion,
      queuedMotionCount: this.queuedMotions.length,
      hitReacting: this.hitReactionElapsedMs !== null,
      facing: this.facing,
      casting: this.casting,
      moving: this.moving,
      chargeProgress: this.chargeProgress,
      bitmapFacing: this.sprite.scale.x < 0 ? -1 : 1,
      transitioning: this.transitionFrom !== null,
      spriteReady: this.sprite.visible,
      locomotionMode: this.presentation.profile.locomotionMode,
      visualHoverOffsetY: this.visualHoverOffsetY,
      movementBobOffsetY: this.movementBobOffsetY,
      movementTiltDeg: this.movementTiltRad * 180 / Math.PI,
      movementSpeed: this.movementSpeed,
      projectedLiftPixels: this.projectedLiftPixels,
      shadowAlpha: this.shadow.alpha,
      statusVisual: this.statusLayer.statusVisual,
    };
  }

  update(dtSeconds: number): void {
    this.baseScale = this.displayScale();
    this.bodyEffectSeconds += dtSeconds;
    this.locomotionHoldSeconds = Math.max(0, this.locomotionHoldSeconds - dtSeconds);
    this.updateMovementFeel(dtSeconds);
    let clip = this.presentation.profile.motions[this.motion];
    const elapsedMs = dtSeconds * 1000;
    this.motionElapsedMs += elapsedMs;
    let beganNextMotion = false;
    while ((!clip.loop || this.motionDurationOverrideMs !== null)
      && this.motionElapsedMs >= this.activeMotionDurationMs() && this.motion !== 'faint') {
      const remainder = this.motionElapsedMs - this.activeMotionDurationMs();
      const next = this.queuedMotions.shift();
      this.setMotion(next?.motion ?? (this.moving && this.alive && !this.casting ? 'locomotion' : 'idle'), next?.durationMs, next?.choreography, next?.target, next?.element);
      this.motionElapsedMs = remainder;
      clip = this.presentation.profile.motions[this.motion];
      beganNextMotion = true;
    }
    const durationMs = this.activeMotionDurationMs();
    const finite = !clip.loop || this.motionDurationOverrideMs !== null;
    const progress = finite ? Math.min(1, this.motionElapsedMs / durationMs) : (this.motionElapsedMs % durationMs) / durationMs;

    const authored = this.presentation.profile.authoredFrames;
    const pulse = authored ? 0 : this.motion === 'idle' ? Math.sin(progress * Math.PI * 2) * 0.025
      : this.motion === 'locomotion' ? Math.sin(progress * Math.PI * 2) * 0.05
      : this.motion === 'charge' || this.motion === 'channel' ? Math.sin(progress * Math.PI * 2) * 0.035
      : 0;
    const recoil = !authored && this.motion === 'hit' ? Math.sin(progress * Math.PI) * -12 : 0;
    const track = this.presentation.profile.motionTracks?.[this.motion];
    // 横向轨道已经描述完整的前冲与后坐；再叠加通用位移会使脚点滑动。
    // 仅有纵向、缩放等轨道的角色仍使用通用横向动作。
    const authoredAdvance = track?.some((frame) => frame.offsetX !== undefined);
    const actionAdvance = authored || authoredAdvance ? 0 : this.motion === 'attack' ? Math.sin(progress * Math.PI) * 22
      : this.motion === 'cast' ? Math.sin(progress * Math.PI) * 10
        : this.motion === 'channel' ? 5
          : this.motion === 'recover' ? -Math.sin(progress * Math.PI) * 8
            : 0;
    const faintScale = !authored && (this.motion === 'faint' || !this.alive) ? 1 - Math.min(0.3, progress * 0.3) : 1;
    const pose = sampleBattleMotionPose(this.presentation.profile.motionPoses[this.motion] ?? {}, track, progress);
    const choreography = this.choreographyTransform(progress);
    const target: MotionTransform = {
      // The resolver has already selected the source view for facing (+1 back,
      // -1 front). Keep the complete hierarchy mirrored for directional pose
      // math, then counter-mirror the bitmap below so a front/back source is
      // never flipped into the opposite head direction. Offsets, recoil and
      // tilt still follow the current target direction.
      scaleX: this.facing * this.baseScale * (pose.scaleX ?? 1) * (1 + pulse) * faintScale,
      scaleY: this.baseScale * (pose.scaleY ?? 1) * (1 - pulse * 0.6) * faintScale,
      x: this.facing * ((pose.offsetX ?? 0) + recoil + actionAdvance) + choreography.x,
      y: (pose.offsetY ?? 0) + choreography.y + (authored ? 0 : this.movementBobOffsetY),
      rotation: this.facing * (pose.rotationDeg ?? 0) * Math.PI / 180 + (authored ? 0 : this.movementTiltRad),
    };
    const timedClip = !clip.loop || this.motionDurationOverrideMs !== null;
    this.sprite.advance(beganNextMotion ? this.motionElapsedMs : elapsedMs, !timedClip, timedClip ? this.activeMotionDurationMs() : undefined);
    const transform = this.interpolateTransition(target, beganNextMotion ? 0 : elapsedMs);
    const hover = this.hoverTransform(elapsedMs);
    this.visualHoverOffsetY = hover.offsetY;
    this.body.scale.set(transform.scaleX, transform.scaleY);
    // Parent scale still mirrors generic layers and pose geometry. Applying the
    // same sign on the selected bitmap cancels that mirror only for the source
    // sprite sheet, preserving its authored front/back head direction.
    this.sprite.scale.x = Math.abs(this.sprite.scale.x) * this.facing;
    if (this.hitReactionElapsedMs !== null) {
      this.hitReactionElapsedMs += elapsedMs;
      if (this.hitReactionElapsedMs >= BATTLE_HIT_REACTION.durationMs) this.hitReactionElapsedMs = null;
    }
    this.hitOffsetX = this.hitReactionElapsedMs === null ? 0
      : -this.facing * BATTLE_HIT_REACTION.offsetX * Math.sin(this.hitReactionElapsedMs / BATTLE_HIT_REACTION.durationMs * Math.PI);
    this.body.position.set(transform.x + this.hitOffsetX, transform.y + hover.offsetY);
    this.body.rotation = transform.rotation;
    this.updateShadowForHover(hover.heightRatio);
    this.updateLayers(progress, pose.glowAlpha, pose.glowScale);
    this.updateChargeAura();
    const bodyBounds = this.sprite.visible ? this.sprite.getBodyBounds() : { x: 0, y: -8, width: 64, height: 76 };
    this.statusLayer.position.set(bodyBounds.x, bodyBounds.y + 8);
    this.statusLayer.scale.x = this.facing;
    this.statusLayer.render(this.bodyEffectSeconds, bodyBounds.width, bodyBounds.height, Math.abs(this.body.scale.y * this.scale.y));
    this.updateChoreographyOutline(progress);
    this.alpha = this.alive ? 1 : 0.25;
  }

  /** Snapshot interpolation makes grid movement continuous. This generic detector
   * turns that already-rendered movement into a real locomotion clip instead of
   * visually sliding a static bitmap. It deliberately knows no model, species,
   * or terrain details; profiles/sequence assets define how locomotion looks. */
  private updateMovementFeel(dtSeconds: number): void {
    if (!this.casting) this.syncLocomotionMotion();
    const velocity = this.movementVelocity;
    const targetSpeed = Math.hypot(velocity.x, velocity.y);
    this.movementSpeed += (targetSpeed - this.movementSpeed) * Math.min(1, dtSeconds * 15);
    const active = this.moving && this.alive;
    const cadence = 7 + Math.min(11, this.movementSpeed * 5);
    this.movementPhase += dtSeconds * cadence;
    const amplitude = active ? 2 + Math.min(2, this.movementSpeed * 0.65) : 0;
    // The downward half of the cycle is slightly stronger, producing a readable
    // footfall compression rather than a neutral hover.
    const wave = Math.sin(this.movementPhase);
    this.movementBobOffsetY = active ? wave * amplitude + Math.max(0, -wave) * amplitude * 0.28 : 0;
    const directionTilt = active ? Math.max(-1, Math.min(1, velocity.x)) * -0.075 : 0;
    // Damped response provides the start/stop lag: initial motion leans back,
    // while deceleration carries the previous lean briefly into the stop.
    this.movementTiltRad += (directionTilt - this.movementTiltRad) * Math.min(1, dtSeconds * (active ? 10 : 5));
    this.movementVelocity.x *= Math.max(0, 1 - dtSeconds * 8);
    this.movementVelocity.y *= Math.max(0, 1 - dtSeconds * 8);
  }

  private hoverTransform(elapsedMs: number): { offsetY: number; heightRatio: number } {
    const profile = this.presentation.profile;
    if (profile.locomotionMode === 'grounded') return { offsetY: 0, heightRatio: 0 };
    this.hoverPhase += elapsedMs / 1000 * (this.moving ? 9 : 5.2);
    const bob = Math.sin(this.hoverPhase) * profile.hoverAmplitude;
    return { offsetY: -profile.hoverHeight + bob, heightRatio: Math.min(1, profile.hoverHeight / 14) };
  }

  private updateShadowForHover(heightRatio: number): void {
    const plan = groundShadowPlan(
      this.projectedLiftPixels,
      heightRatio,
      this.terrainShadowAlphaMultiplier,
      this.terrainShadowScaleMultiplier,
    );
    const foot = this.getFootContactFrame();
    this.shadow.clear().ellipse(0, 0, foot.width * 0.68, Math.max(2, foot.height * 0.7)).fill({ color: 0x07101a, alpha: 0.30 });
    this.shadow.position.set(foot.x, foot.y);
    this.shadow.scale.set(plan.scaleX, plan.scaleY);
    this.shadow.alpha = plan.alpha;
  }

  private updateLocomotionIntent(combatant: BattleCombatant): void {
    const point = combatant.pixel;
    if (this.snapshotPosition) {
      const dx = point.x - this.snapshotPosition.x;
      const dy = point.y - this.snapshotPosition.y;
      const travelled = Math.hypot(dx, dy);
      if (travelled > 0.012) {
        this.locomotionHoldSeconds = 0.15;
        // Snapshot cadence is deliberately normalized: this is a visual intent,
        // not simulation velocity, so renderer frame rate cannot alter gameplay.
        this.movementVelocity = { x: dx * 7, y: dy * 7 };
      }
    }
    this.snapshotPosition = { x: point.x, y: point.y };
    this.moving = this.locomotionHoldSeconds > 0;
  }

  private syncLocomotionMotion(): void {
    this.moving = this.locomotionHoldSeconds > 0;
    if (this.motion === 'faint' || this.casting || this.queuedMotions.length > 0) return;
    // Locomotion may only own the neutral visual lane. A cast, attack, recovery,
    // or hit cue remains readable until its configured duration is complete.
    if (this.motion !== 'idle' && this.motion !== 'locomotion') return;
    const desired: BattleArtMotionId = this.moving && this.alive ? 'locomotion' : 'idle';
    if (this.motion !== desired) this.setMotion(desired);
  }

  private setMotion(motion: BattleArtMotionId, durationMs?: number, choreography?: BattleActorChoreography, target?: { x: number; y: number }, element?: TypeName): void {
    if (this.motion === motion && durationMs === undefined && this.presentation.profile.motions[motion].loop) return;
    this.transitionFrom = {
      scaleX: this.body.scale.x,
      scaleY: this.body.scale.y,
      x: this.body.position.x - this.hitOffsetX,
      y: this.body.position.y - this.visualHoverOffsetY,
      rotation: this.body.rotation,
    };
    this.transitionElapsedMs = 0;
    this.transitionDurationMs = this.transitionDurationFor(this.motion, motion);
    this.spriteMotion = motion === 'recover' ? this.presentation.profile.recoverySources?.[this.motion] ?? motion : motion;
    this.motion = motion;
    this.motionDurationOverrideMs = durationMs ?? null;
    this.motionElapsedMs = 0;
    this.activeChoreography = choreography && target ? { spec: choreography, target, theme: choreographyThemeFor(element) } : null;
    void this.sprite.setMotion(this.presentation.asset, this.spriteMotion);
  }

  private shouldQueueAction(): boolean {
    if (this.motion === 'idle' || this.motion === 'locomotion' || this.motion === 'hit' || this.motion === 'faint') return false;
    // A gameplay-timed cast enters charge with no visual work behind it; its
    // release cue must replace charge immediately. A generic visual windup has
    // already queued action/recover, so later ready skills serialize after it.
    if (this.motion === 'charge') return this.queuedMotions.length > 0;
    return true;
  }

  private activeMotionDurationMs(): number {
    return this.motionDurationOverrideMs ?? this.presentation.profile.motions[this.motion].durationMs;
  }

  private transitionDurationFor(from: BattleArtMotionId, to: BattleArtMotionId): number {
    return this.sprite.transitionDuration(from, to) ?? this.presentation.profile.motions[to].blendInMs;
  }

  private interpolateTransition(target: MotionTransform, elapsedMs: number): MotionTransform {
    if (!this.transitionFrom || this.transitionDurationMs <= 0) {
      this.transitionFrom = null;
      return target;
    }
    this.transitionElapsedMs += elapsedMs;
    const progress = Math.min(1, this.transitionElapsedMs / this.transitionDurationMs);
    const amount = cubicInOut(progress);
    const from = this.transitionFrom;
    if (progress >= 1) this.transitionFrom = null;
    return {
      // Facing switches source views discretely; blending signed scales would
      // collapse the body through zero during a turn or an immediate first cue.
      scaleX: Math.sign(target.scaleX) * lerp(Math.abs(from.scaleX), Math.abs(target.scaleX), amount),
      scaleY: lerp(from.scaleY, target.scaleY, amount),
      x: lerp(from.x, target.x, amount),
      y: lerp(from.y, target.y, amount),
      rotation: lerp(from.rotation, target.rotation, amount),
    };
  }

  /** Local-only traversal: the snapshot container remains at the engine-owned
   * position while this body departs, approaches, reveals, and returns. */
  private choreographyTransform(progress: number): { x: number; y: number } {
    const active = this.activeChoreography;
    if (!active || active.spec.kind !== 'target-dive') return { x: 0, y: 0 };
    const spec = active.spec;
    const origin = this.position;
    const dx = active.target.x - origin.x;
    const dy = active.target.y - origin.y;
    const distance = Math.max(0.001, Math.hypot(dx, dy));
    const approach = Math.max(0, Math.min(distance, distance - spec.approachDistance));
    const nx = dx / distance;
    const ny = dy / distance;
    let travel = 0;
    if (progress < spec.arrivalAt) {
      travel = approach * cubicInOut(progress / spec.arrivalAt);
    } else if (progress < spec.returnAt) {
      travel = approach;
    } else {
      travel = approach * (1 - cubicInOut((progress - spec.returnAt) / Math.max(0.001, 1 - spec.returnAt)));
    }
    // A small generic arc reads as a plunge rather than a horizontal slide.
    const arc = Math.sin(Math.min(1, progress / spec.returnAt) * Math.PI) * Math.min(58, distance * 0.16);
    return { x: nx * travel, y: ny * travel - arc };
  }

  private updateChoreographyOutline(progress: number): void {
    const active = this.activeChoreography;
    if (!active || active.spec.kind !== 'target-dive') {
      this.choreographyOutline.clear();
      this.sprite.alpha = 1;
      this.fallback.alpha = 1;
      return;
    }
    const spec = active.spec;
    const wrapped = progress < spec.revealAt;
    this.sprite.alpha = 1;
    this.fallback.alpha = 1;
    const color = parseHexColor(active.theme.primary, 0xff824e);
    const highlight = parseHexColor(active.theme.highlight, 0xffeea8);
    this.choreographyOutline.clear();
    if (!wrapped) return;
    const body = this.sprite.visible ? this.sprite.getBodyBounds() : { x: 0, y: -8, width: 64, height: 76 };
    this.choreographyOutline.position.set(body.x, body.y + 8);
    drawBodyFlames(this.choreographyOutline, this.bodyEffectSeconds * 1.5, body.width, body.height, color, highlight, Math.abs(this.body.scale.y * this.scale.y));
  }

  private rebuildLayers(): void {
    this.behindLayers.removeChildren().forEach((child) => child.destroy());
    this.frontLayers.removeChildren().forEach((child) => child.destroy());
    this.decorations.clear();
    for (const spec of this.presentation.profile.layers) {
      const graphic = new Graphics();
      const color = parseHexColor(this.presentation.theme[spec.color], 0xffffff);
      drawElementMotes(graphic, 'generic', 0, -8, 0.3, color);
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

  /** Persistent, configuration-themed windup feedback. It makes a gameplay
   * castProgress visible for its entire lifetime rather than relying on one
   * brief cue at cast start. */
  private updateChargeAura(): void {
    if (!this.casting || !this.alive) {
      this.chargeAura.clear();
      return;
    }
    const progress = clamp01(this.chargeProgress);
    const primary = parseHexColor(this.presentation.theme.primary, 0xffe3a3);
    const highlight = parseHexColor(this.presentation.theme.highlight, 0xffffff);
    this.chargeAura.clear();
    for (let index = 0; index < 7; index++) {
      const site = moteSite(index);
      const phase = (this.bodyEffectSeconds * 0.8 + index * 0.17) % 1;
      const x = site.x * (42 - phase * 24);
      const y = -8 + site.y * (42 - phase * 24);
      this.chargeAura.moveTo(x, y).lineTo(x * 0.88, y * 0.88).stroke({ color: index % 2 ? primary : highlight, alpha: Math.sin(phase * Math.PI) * (0.35 + progress * 0.4), width: 1.6 });
    }
  }

  private drawFallback(): void {
    const theme = this.presentation.theme;
    const primary = parseHexColor(theme.primary, 0x69d4e7);
    const secondary = parseHexColor(theme.secondary, 0x7ee6ac);
    this.shadow.clear().ellipse(0, 22, 43, 14).fill({ color: 0x07101a, alpha: 0.34 });
    this.fallback.clear()
      .circle(0, -8, 25).fill({ color: primary, alpha: 0.94 })
      .circle(-8, -16, 8).fill({ color: 0xffffff, alpha: 0.35 })
      .rect(-26, 26, 52, 6).fill({ color: 0x172331, alpha: 0.9 })
      .rect(-25, 27, 50, 4).fill({ color: secondary });
  }
}

interface ActiveActorChoreography {
  spec: BattleActorChoreography;
  target: { x: number; y: number };
  theme: BattleVisualTheme;
}

interface QueuedMotion {
  motion: BattleArtMotionId;
  durationMs?: number;
  choreography?: BattleActorChoreography;
  target?: { x: number; y: number };
  element?: TypeName;
}

interface MotionTransform {
  scaleX: number;
  scaleY: number;
  x: number;
  y: number;
  rotation: number;
}

function isActionMotion(motion: BattleArtMotionId): boolean {
  return motion === 'attack' || motion === 'cast' || motion === 'charge' || motion === 'channel';
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function cubicInOut(value: number): number {
  return value < 0.5 ? 4 * value * value * value : 1 - ((-2 * value + 2) ** 3) / 2;
}

function choreographyThemeFor(element?: TypeName): BattleVisualTheme {
  return BATTLE_VISUAL_THEMES[`type:${element ?? 'normal'}`] ?? BATTLE_VISUAL_THEMES['type:normal']!;
}
