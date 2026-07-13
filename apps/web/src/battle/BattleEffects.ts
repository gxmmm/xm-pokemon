/**
 * BattleEffects - effect manager that consumes BattleEvents (by monotonic seq)
 * and spawns/draws transient pixel-art visual effects: projectiles, melee
 * slashes, hit bursts, floating damage/heal numbers, status auras, shields,
 * faint bursts, buff arrows. Themed by skill type via TYPE_COLORS.
 *
 * Optional 1:1 effect sprites can be dropped in at /sprites/effects/... (see
 * sprites/effects/README.md); when absent everything is drawn procedurally so
 * the battle always has VFX offline. All particles are pixel rects - no
 * smoothing - to match the pixel-art style.
 *
 * Beyond spawned effects, this manager also tracks three render-side signals
 * consumed by BattleCanvas:
 *  - impulses: a short forward lunge applied to a combatant when it attacks
 *    (gives melee/ranged casts "commitment"). Queried via impulseOf(uid).
 *  - pendingImpact: the heaviest damage event this frame (position + color +
 *    intensity + heavy flag) -> drives localized impact feedback
 *    flash. Queried (and cleared) via impact().
 *  - focal: the "featured exchange" the director camera tracks (decays over
 *    ~1.4s, refreshed by hits/skill casts). Queried via focalOf().
 *  - spawnDust(): movement footstep puffs, called by the canvas.
 */
import type { BattleEvent, BattleVfx, StatusKind, TypeName } from '@pokemon-online/shared';
import { TYPE_COLORS } from '@pokemon-online/config';

type Pt = { x: number; y: number };

type FxFamily = 'orb' | 'bolt' | 'beam' | 'wave' | 'storm' | 'meteor' | 'blade' | 'dash' | 'fang' | 'drain' | 'curse' | 'guard' | 'heal' | 'powder' | 'rune';
interface SkillFxProfile { family: FxFamily; accent?: string; trail?: string; scale?: number; spin?: number; }

/**
 * Skill-level visual direction. Every configured skill has a distinct family
 * plus a small palette/scale variation; unknown future skills fall back to a
 * type-aware family, so adding a move never removes battle readability.
 */
/** Every current active move receives an entry here. Keep this exhaustive so a
 * new skill must consciously choose a visual family instead of inheriting an
 * anonymous generic effect. */
const SKILL_FX: Record<string, SkillFxProfile> = {
  'body-slam': { family: 'dash', scale: 1.15 }, 'take-down': { family: 'dash', accent: '#ffffff', scale: 1.32 }, 'double-edge': { family: 'dash', accent: '#ffd24a', scale: 1.58 }, 'swift': { family: 'meteor', accent: '#fff2a8', scale: 0.82, spin: 5 }, 'hyper-beam': { family: 'beam', accent: '#ffffff', scale: 1.7 },
  ember: { family: 'orb', accent: '#fff09b', scale: 0.68 }, 'flame-wheel': { family: 'dash', accent: '#ffb347', scale: 1.12, spin: 5 }, 'flamethrower': { family: 'beam', accent: '#fff09b', scale: 1.18 }, 'fire-blast': { family: 'meteor', accent: '#fff6c2', scale: 1.55, spin: 2 }, 'fire-fang': { family: 'fang', accent: '#fff09b', scale: 1.0 },
  'water-gun': { family: 'bolt', accent: '#d8f5ff', scale: 0.75 }, bubble: { family: 'orb', accent: '#ffffff', scale: 0.9, spin: 3 }, 'aqua-tail': { family: 'blade', accent: '#d8f5ff', scale: 1.08 }, surf: { family: 'wave', accent: '#e8fbff', scale: 1.45 }, 'hydro-pump': { family: 'beam', accent: '#d8f5ff', scale: 1.55 },
  'vine-whip': { family: 'blade', accent: '#d4ff9f', scale: 0.92 }, 'razor-leaf': { family: 'blade', accent: '#eaffbd', scale: 0.78, spin: 4 }, 'mega-drain': { family: 'drain', accent: '#d4ff9f', scale: 0.95 }, 'petal-dance': { family: 'storm', accent: '#ffb4d8', scale: 1.25, spin: 4 }, 'solar-beam': { family: 'beam', accent: '#fff7a8', scale: 1.8 },
  'thunder-shock': { family: 'bolt', accent: '#fff4a1', scale: 0.75 }, spark: { family: 'dash', accent: '#fff4a1', scale: 0.95 }, thunderbolt: { family: 'bolt', accent: '#fffbd0', scale: 1.12 }, thunder: { family: 'bolt', accent: '#ffffff', scale: 1.72 },
  'powder-snow': { family: 'storm', accent: '#ffffff', scale: 0.7 }, 'ice-fang': { family: 'fang', accent: '#eaffff', scale: 1.0 }, 'ice-beam': { family: 'beam', accent: '#eaffff', scale: 1.1 }, blizzard: { family: 'storm', accent: '#ffffff', scale: 1.55 },
  'karate-chop': { family: 'blade', accent: '#fff5df', scale: 0.8 }, 'brick-break': { family: 'blade', accent: '#ffc78f', scale: 1.12 }, 'close-combat': { family: 'dash', accent: '#fff5df', scale: 1.42 },
  'poison-sting': { family: 'bolt', accent: '#f2b3ff', scale: 0.68 }, 'sludge-bomb': { family: 'orb', accent: '#e7a3ff', scale: 1.28 }, toxic: { family: 'curse', accent: '#e7a3ff', scale: 1.22 },
  'mud-slap': { family: 'orb', accent: '#e5c17b', scale: 0.86 }, 'bone-club': { family: 'blade', accent: '#fff0cc', scale: 1.0 }, earthquake: { family: 'wave', accent: '#ffe0a3', scale: 1.62 }, dig: { family: 'dash', accent: '#e5c17b', scale: 1.1 },
  'wing-attack': { family: 'blade', accent: '#eef8ff', scale: 0.9 }, 'drill-peck': { family: 'dash', accent: '#eef8ff', scale: 1.18, spin: 6 }, 'air-cutter': { family: 'blade', accent: '#eef8ff', scale: 1.18, spin: 3 }, 'brave-bird': { family: 'dash', accent: '#dff4ff', scale: 1.55 },
  confusion: { family: 'rune', accent: '#ffc7f4', scale: 0.86, spin: 2 }, psybeam: { family: 'beam', accent: '#ffd4f7', scale: 0.92 }, psychic: { family: 'rune', accent: '#ffc7f4', scale: 1.45, spin: 4 }, 'dream-eater': { family: 'drain', accent: '#d6a8ff', scale: 1.2 },
  'bug-bite': { family: 'fang', accent: '#e5ff9c', scale: 0.82 }, 'pin-missile': { family: 'bolt', accent: '#f4ffbc', scale: 0.84, spin: 5 }, 'x-scissor': { family: 'blade', accent: '#f4ffbc', scale: 1.24 }, 'silver-wind': { family: 'storm', accent: '#f3f6ff', scale: 1.08, spin: 5 },
  'rock-throw': { family: 'meteor', accent: '#f3d7a4', scale: 0.85 }, 'rock-tomb': { family: 'meteor', accent: '#f3d7a4', scale: 1.05 }, 'rock-slide': { family: 'meteor', accent: '#fff0c4', scale: 1.28 }, 'stone-edge': { family: 'blade', accent: '#fff0c4', scale: 1.42 },
  lick: { family: 'fang', accent: '#dca8ff', scale: 0.72 }, 'shadow-ball': { family: 'orb', accent: '#dca8ff', scale: 1.1 }, 'shadow-claw': { family: 'blade', accent: '#ead1ff', scale: 1.05 },
  'dragon-rage': { family: 'orb', accent: '#b9ffff', scale: 0.96 }, 'dragon-claw': { family: 'blade', accent: '#c7ffff', scale: 1.14 }, outrage: { family: 'dash', accent: '#c7ffff', scale: 1.55 }, 'draco-meteor': { family: 'meteor', accent: '#e3d1ff', scale: 1.75 },
  bite: { family: 'fang', accent: '#c8b6ff', scale: 0.78 }, crunch: { family: 'fang', accent: '#e2d9ff', scale: 1.13 }, 'dark-pulse': { family: 'wave', accent: '#d9c3ff', scale: 1.12 },
  'metal-claw': { family: 'blade', accent: '#f2fbff', scale: 0.94 }, 'iron-head': { family: 'dash', accent: '#f2fbff', scale: 1.16 }, 'flash-cannon': { family: 'beam', accent: '#ffffff', scale: 1.12 },
  'fairy-wind': { family: 'storm', accent: '#ffe2fa', scale: 0.86, spin: 4 }, 'draining-kiss': { family: 'drain', accent: '#ffd4ef', scale: 0.95 }, moonblast: { family: 'orb', accent: '#fff6d3', scale: 1.38 },
  'swords-dance': { family: 'rune', accent: '#fff0a3', scale: 1.0 }, harden: { family: 'guard', accent: '#d9e5ff', scale: 0.92 }, withdraw: { family: 'guard', accent: '#bceaff', scale: 1.0 }, agility: { family: 'dash', accent: '#d9f7ff', scale: 0.72 }, growth: { family: 'rune', accent: '#d6ffaf', scale: 0.9 }, recover: { family: 'heal', accent: '#d8ffda', scale: 1.1 }, synthesis: { family: 'heal', accent: '#fff6a8', scale: 1.18 }, rest: { family: 'heal', accent: '#c9d3ff', scale: 1.24 },
  'sleep-powder': { family: 'powder', accent: '#d9f2a6', scale: 1.0 }, 'stun-spore': { family: 'powder', accent: '#fff4a1', scale: 1.0 }, 'poison-powder': { family: 'powder', accent: '#efb3ff', scale: 1.0 }, hypnosis: { family: 'rune', accent: '#cfa7ff', scale: 1.1, spin: 5 }, 'thunder-wave': { family: 'bolt', accent: '#fffbd0', scale: 0.92 }, 'will-o-wisp': { family: 'curse', accent: '#d5c4ff', scale: 0.95 }, 'confuse-ray': { family: 'rune', accent: '#f5c2ff', scale: 1.08, spin: 4 }, 'leech-seed': { family: 'drain', accent: '#d5ff9f', scale: 1.0 }, protect: { family: 'guard', accent: '#c5f5ff', scale: 1.25 }, reflect: { family: 'guard', accent: '#e1d6ff', scale: 1.45 },
};

export function skillFxProfile(skillId: string | undefined, type?: TypeName): SkillFxProfile {
  if (skillId && SKILL_FX[skillId]) return SKILL_FX[skillId];
  const fallback: Record<TypeName, FxFamily> = { normal: 'dash', fire: 'orb', water: 'bolt', grass: 'blade', electric: 'bolt', ice: 'storm', fighting: 'blade', poison: 'orb', ground: 'wave', flying: 'blade', psychic: 'rune', bug: 'bolt', rock: 'meteor', ghost: 'orb', dragon: 'meteor', dark: 'wave', steel: 'blade', fairy: 'storm' };
  return { family: fallback[type ?? 'normal'], scale: 1 };
}

// ── optional effect sprite assets ───────────────────────────────────────────
// The renderer is fully procedural by default. Drop a manifest at
// /sprites/effects/atlas.json ({ "images": ["type/fire", "shared/heal", ...] })
// plus matching <name>.png files to override specific VFX with 1:1 pixel art.
// Missing/failed loads silently fall back to procedural. See
// sprites/effects/README.md for the naming convention.
const fxImages = new Map<string, HTMLImageElement>();
let fxAtlasPromise: Promise<void> | null = null;

export function loadFxAssets(): Promise<void> {
  if (fxAtlasPromise) return fxAtlasPromise;
  fxAtlasPromise = (async () => {
    try {
      const res = await fetch('/sprites/effects/atlas.json', { cache: 'force-cache' });
      if (!res.ok) return;
      const data = (await res.json()) as { images?: string[] };
      await Promise.all((data.images ?? []).map((n) => loadOne(n)));
    } catch {
      /* procedural only */
    }
  })();
  return fxAtlasPromise;
}

function loadOne(name: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = `/sprites/effects/${name}.png`;
    img.onload = () => { fxImages.set(name, img); resolve(); };
    img.onerror = () => resolve();
  });
}

export function getFxImage(name: string): HTMLImageElement | null {
  return fxImages.get(name) ?? null;
}

type Effect =
  | { kind: 'projectile'; x: number; y: number; tx: number; ty: number; t: number; life: number; color: string; profile: SkillFxProfile; imgName?: string; }
  | { kind: 'slash'; x: number; y: number; ang: number; t: number; life: number; color: string; profile: SkillFxProfile; }
  | { kind: 'burst'; x: number; y: number; t: number; life: number; color: string; r: number; profile?: SkillFxProfile; delay?: number; imgName?: string; }
  | { kind: 'beam'; x: number; y: number; tx: number; ty: number; t: number; life: number; color: string; profile: SkillFxProfile; }
  | { kind: 'cast'; x: number; y: number; t: number; life: number; color: string; profile: SkillFxProfile; }
  | { kind: 'number'; x: number; y: number; t: number; life: number; text: string; color: string; size: number; delay?: number; }
  | { kind: 'heal'; x: number; y: number; t: number; life: number; imgName?: string; }
  | { kind: 'status'; x: number; y: number; t: number; life: number; color: string; }
  | { kind: 'faint'; x: number; y: number; t: number; life: number; }
  | { kind: 'shield'; x: number; y: number; t: number; life: number; imgName?: string; }
  | { kind: 'arrow'; x: number; y: number; t: number; life: number; up: boolean; color: string; }
  | { kind: 'dust'; x: number; y: number; t: number; life: number; color: string; };

const STATUS_COLOR: Record<StatusKind, string> = {
  burn: '#ff5a2a', poison: '#a33ea1', paralyze: '#f7d02c',
  freeze: '#9fd8ff', sleep: '#8888aa', confuse: '#f95587',
};

function typeColor(t?: TypeName): string {
  return (t && TYPE_COLORS[t]) || '#f2f2f2';
}

/** Forward-lunge impulse applied to the attacker when it commits to an
 *  attack/skill. ax/ay is the peak pixel offset (direction = toward target). */
interface Impulse { t: number; life: number; ax: number; ay: number; }

/** Director focal point: the "featured exchange" the camera tracks. Intensity
 *  decays over ~1.4s; refreshed by real hits (scaled by damage share of maxHp)
 *  and skill casts. x/y lerp toward the live pair midpoint each frame so the
 *  camera follows the continuing exchange, not just the hit spot. */
interface Focal {
  actorUid: string; targetUid: string; targetUids?: string[]; x: number; y: number; intensity: number;
  /** A knockout locks the first decisive exchange briefly, preventing a
   * same-frame multi-KO from yanking the camera across a 3v3 battlefield. */
  koHold: number;
}

/** Per-frame heaviest impact signal (read once, then cleared). Drives a
 * localized impact flash only; the arena camera never shakes. `heavy` = a real
 * heavy hit (≥8% maxHp). */
interface Impact { x: number; y: number; targetUid: string; color: string; intensity: number; heavy: boolean; ko: boolean; secondary: boolean; delay: number; }

export class EffectManager {
  private effects: Effect[] = [];
  private lastSeq = 0;
  private impulses = new Map<string, Impulse>();
  private pendingImpact: Impact | null = null;
  private focal: Focal | null = null;
  private cellOfCb: ((uid?: string) => Pt | null) | null = null;

  /** Process new events. `cellOf(uid)` returns the screen-px center of a
   *  combatant (or null). `combatantOf(uid)` returns its maxHp (for damage-share
   *  -> focal/impact intensity). Spawns VFX for events with seq > lastSeq.
   *  Per-frame spawn count is capped so a skip/resolve burst (hundreds of events
   *  at once) doesn't flood the screen with overlapping effects. */
  consume(
    events: BattleEvent[],
    cellOf: (uid?: string) => Pt | null,
    combatantOf?: (uid?: string) => { maxHp: number } | null,
    originOf?: (uid: string | undefined, kind: BattleVfx['kind']) => Pt | null,
  ): void {
    this.cellOfCb = cellOf;
    const fresh: BattleEvent[] = [];
    for (const ev of events) {
      const seq = ev.seq ?? 0;
      if (seq <= this.lastSeq) continue;
      fresh.push(ev);
    }
    if (fresh.length === 0) return;
    const CAP = 40;
    let toSpawn = fresh;
    if (fresh.length > CAP) {
      // advance past the older burst, keep only the most recent CAP to animate
      this.lastSeq = fresh[fresh.length - CAP - 1]?.seq ?? this.lastSeq;
      toSpawn = fresh.slice(fresh.length - CAP);
    }
    for (const ev of toSpawn) {
      this.lastSeq = Math.max(this.lastSeq, ev.seq ?? 0);
      this.spawn(ev, cellOf, combatantOf, originOf);
    }
  }

  private pos(ev: BattleEvent, cellOf: (uid?: string) => Pt | null, prefer: 'actor' | 'target'): Pt | null {
    const uid = prefer === 'actor' ? ev.actor : ev.target;
    const p = cellOf(uid);
    if (p) return p;
    // fall back to the other end
    const alt = cellOf(prefer === 'actor' ? ev.target : ev.actor);
    return alt ?? cellOf(ev.target) ?? cellOf(ev.actor);
  }

  private spawn(
    ev: BattleEvent,
    cellOf: (uid?: string) => Pt | null,
    combatantOf?: (uid?: string) => { maxHp: number } | null,
    originOf?: (uid: string | undefined, kind: BattleVfx['kind']) => Pt | null,
  ): void {
    const v = ev.vfx;
    switch (ev.type) {
      case 'attack':
      case 'skill': {
        if (!v) break;
        const from = originOf?.(ev.actor, v.kind) ?? this.pos(ev, cellOf, 'actor');
        const to = this.pos(ev, cellOf, 'target');
        const normalAttack = ev.skillId === '__normal__';
        // Body anticipation/release is handled by BattleActionTimeline. Effects
        // only own the local projectile, slash, beam and impact layers.
        // skill casts (not routine normal attacks) earn a mild focal so the
        // camera begins tracking the windup before the hit lands. intensity
        // stays below the zoom/dim thresholds -- it only pre-aims the camera.
        if (ev.type === 'skill' && ev.actor && ev.target) {
          if (v.targetUids && v.targetUids.length > 1) this.nudgeAreaFocal(ev.actor, v.targetUids, 0.28);
          else this.nudgeFocal(ev.actor, ev.target, 0.18);
        }
        if (!from || !to) break;
        const color = typeColor(v.type);
        const profile = skillFxProfile(ev.skillId, v.type);
        // Spread skills are emitted once with all target ids. Draw one readable
        // field marker per victim rather than three overlapping projectiles.
        if (v.targetUids?.length) {
          for (let i = 0; i < v.targetUids.length; i++) {
            const at = cellOf(v.targetUids[i]);
            if (at) this.push({ kind: 'burst', x: at.x, y: at.y, t: 0, life: 0.62, color, r: 28 * (profile.scale ?? 1), profile, delay: i * 0.055, imgName: v.type ? `type/${v.type}` : undefined });
          }
          break;
        }
        const typeImg = v.type ? `type/${v.type}` : undefined;
        if (normalAttack) {
          // Baseline attacks remain visible, but stay local and brief: no long
          // projectile stream across the whole field between named skills.
          if (v.kind === 'melee') {
            const ang = Math.atan2(to.y - from.y, to.x - from.x);
            this.push({ kind: 'slash', x: to.x, y: to.y, ang, t: 0, life: 0.16, color: '#dce6f4', profile: { family: 'blade', scale: 0.52 } });
          } else {
            this.push({ kind: 'burst', x: to.x, y: to.y, t: 0, life: 0.18, color: '#dce6f4', r: 8, profile: { family: 'bolt', scale: 0.45 } });
          }
          break;
        }
        if (v.kind === 'projectile') this.push({ kind: 'projectile', x: from.x, y: from.y, tx: to.x, ty: to.y, t: 0, life: 0.32, color, profile, imgName: typeImg });
        else if (v.kind === 'melee') {
          const ang = Math.atan2(to.y - from.y, to.x - from.x);
          this.push({ kind: 'slash', x: to.x, y: to.y, ang, t: 0, life: 0.22, color, profile });
        } else if (v.kind === 'beam') this.push({ kind: 'beam', x: from.x, y: from.y, tx: to.x, ty: to.y, t: 0, life: 0.3, color, profile });
        else if (v.kind === 'cast') this.push({ kind: 'cast', x: from.x, y: from.y, t: 0, life: 0.6, color, profile });
        else this.push({ kind: 'burst', x: to.x, y: to.y, t: 0, life: 0.4, color, r: 22 * (profile.scale ?? 1), profile, imgName: typeImg }); // burst / status utility
        break;
      }
      case 'damage': {
        const at = this.pos(ev, cellOf, 'target');
        if (!at) break;
        const dmg = ev.amount ?? 0;
        if (v?.missed) { this.push({ kind: 'number', x: at.x, y: at.y - 14, t: 0, life: 0.8, text: '闪避', color: '#cfcfcf', size: 13 }); break; }
        // real hits (actor present, not DOT) scale the burst by damage and feed
        // the focal + impact (shake/flash) signals. DOT/miss stay small.
        const normalAttack = ev.skillId === '__normal__';
        const realHit = !!ev.actor && dmg > 0;
        const r = normalAttack ? 9 : realHit ? 14 + Math.min(22, dmg * 0.45) : 18;
        const ko = !!v?.ko;
        const profile = skillFxProfile(ev.skillId, v?.type);
        // The attack event above already supplies a compact normal-attack mark.
        // Damage still yields a number, but only skills (and a normal-attack KO)
        // add a second impact burst.
        if (!normalAttack || ko) this.push({
          kind: 'burst', x: at.x, y: at.y, t: 0, life: ko ? 0.56 : 0.4,
          color: typeColor(v?.type), r: (ko ? r + 14 : r) * (profile.scale ?? 1), profile,
          delay: v?.impactDelay,
          imgName: v?.type ? `type/${v.type}` : undefined,
        });
        if (dmg > 0) this.push({ kind: 'number', x: at.x, y: at.y - 14, t: 0, life: normalAttack ? 0.5 : 0.85, delay: v?.impactDelay, text: String(dmg), color: normalAttack ? '#f3f6fb' : typeColor(v?.type), size: normalAttack ? 11 : 13 });
        if (realHit) {
          const tMax = combatantOf?.(ev.target)?.maxHp ?? 0;
          const frac = tMax > 0 ? dmg / tMax : 0;
          const highlight = !!v?.crit || (v?.effectiveness ?? 1) > 1;
          // Critical / super-effective outcomes raise the director score even
          // for modest raw damage. A knockout is always a featured moment.
          const inten = Math.min(1, Math.max(ko ? 0.88 : 0.3, frac * 4 + (highlight ? 0.16 : 0)));
          const heavy = frac >= 0.08 || highlight || ko;
          // The first knockout in a batch owns the spotlight. This avoids a
          // simultaneous 3v3 cleanup turning into camera ping-pong.
          const focalLocked = this.focal?.koHold && this.focal.koHold > 0;
          // A spread's first target is the main impact. Later targets still
          // receive delayed bursts/numbers, but they do not repeatedly shake or
          // reframe the entire 3v3 composition.
          const secondary = !!v?.secondary;
          if (!secondary && (!this.pendingImpact || (!this.pendingImpact.ko && (ko || inten > this.pendingImpact.intensity)))) {
            this.pendingImpact = { x: at.x, y: at.y, targetUid: ev.target!, color: typeColor(v?.type), intensity: inten, heavy, ko, secondary, delay: v?.impactDelay ?? 0 };
          }
          // Keep the first KO in a same-frame batch as the sole featured exchange.
          if (ev.target && !secondary && !(ko && focalLocked)) {
            if (!ko && v?.targetUids && v.targetUids.length > 1) this.nudgeAreaFocal(ev.actor!, v.targetUids, Math.max(0.28, inten));
            else this.nudgeFocal(ev.actor!, ev.target, Math.max(0.1, inten), ko);
          }
        }
        break;
      }
      case 'heal': {
        const at = this.pos(ev, cellOf, 'target');
        if (!at) break;
        this.push({ kind: 'heal', x: at.x, y: at.y, t: 0, life: 0.7, imgName: 'shared/heal' });
        const amt = ev.amount ?? 0;
        if (amt > 0) this.push({ kind: 'number', x: at.x, y: at.y - 14, t: 0, life: 0.85, text: '+' + amt, color: '#4cd964', size: 13 });
        break;
      }
      case 'status': {
        const at = this.pos(ev, cellOf, 'target');
        if (!at) break;
        const color = (v?.status && STATUS_COLOR[v.status]) || '#cfcfcf';
        this.push({ kind: 'status', x: at.x, y: at.y, t: 0, life: 0.6, color });
        break;
      }
      case 'faint': {
        const at = this.pos(ev, cellOf, 'target');
        if (!at) break;
        this.push({ kind: 'faint', x: at.x, y: at.y, t: 0, life: 0.85 });
        break;
      }
      case 'buff':
      case 'debuff': {
        const at = this.pos(ev, cellOf, 'target');
        if (!at) break;
        if (v?.kind === 'shield') this.push({ kind: 'shield', x: at.x, y: at.y, t: 0, life: 0.5, imgName: 'shared/shield' });
        else this.push({ kind: 'arrow', x: at.x, y: at.y - 16, t: 0, life: 0.7, up: ev.type === 'buff', color: ev.type === 'buff' ? '#4cd964' : '#ff5a5a' });
        break;
      }
      case 'info': {
        // These labels remain log-driven for localization, while the director
        // itself consumes the structured result fields on the damage event.
        const at = this.pos(ev, cellOf, 'target');
        if (!at || !ev.message) break;
        if (ev.message.includes('效果绝佳')) this.push({ kind: 'number', x: at.x, y: at.y - 30, t: 0, life: 0.9, text: '效果绝佳!', color: '#ffd24a', size: 15 });
        else if (ev.message.includes('击中要害')) this.push({ kind: 'number', x: at.x, y: at.y - 30, t: 0, life: 0.9, text: '要害!', color: '#ff7a3a', size: 15 });
        break;
      }
      default: break;
    }
  }

  private push(e: Effect): void {
    const MAX_ACTIVE_EFFECTS = 72;
    if (this.effects.length >= MAX_ACTIVE_EFFECTS) {
      const dust = this.effects.findIndex((effect) => effect.kind === 'dust');
      if (dust >= 0) this.effects.splice(dust, 1);
      else if (e.kind === 'dust' || e.kind === 'number') return;
      else this.effects.shift();
    }
    this.effects.push(e);
  }

  /** Spawn a footstep dust puff (called by the canvas while a combatant moves). */
  spawnDust(x: number, y: number, color = '#cfcfcf'): void {
    this.push({ kind: 'dust', x, y, t: 0, life: 0.4, color });
  }

  /** Current lunge offset (px) for a combatant, or null. The curve has a short
   *  anticipation (first 22% winds back -35% of amp, ease-in) then a forward
   *  sin lunge that peaks and returns -- reads as windup -> commit -> settle. */
  impulseOf(uid: string): { dx: number; dy: number } | null {
    const im = this.impulses.get(uid);
    if (!im) return null;
    const k = Math.min(1, im.t / im.life);
    const ANTIC = 0.22;
    let s: number;
    if (k < ANTIC) {
      const kk = k / ANTIC;
      s = -0.35 * (1 - Math.pow(1 - kk, 3));
    } else {
      const kk = (k - ANTIC) / (1 - ANTIC);
      s = Math.sin(Math.PI * kk);
    }
    return { dx: im.ax * s, dy: im.ay * s };
  }

  /** Heaviest damage-impact signal this frame (color + 0..1 intensity + heavy
   *  flag + position). Resets after read so the canvas can drive a decaying
   *  localized flash. */
  impact(): Impact | null {
    const r = this.pendingImpact;
    this.pendingImpact = null;
    return r;
  }

  /** Current director focal (featured exchange), or null when idle. */
  focalOf(): Focal | null {
    return this.focal;
  }

  /** Refresh the director focal. `ni` is the candidate intensity; hysteresis
   *  keeps the current pair unless the new hit is comparably heavy (≥55% of
   *  current intensity), so a lighter exchange elsewhere can't yank focus.
   *  Position is NOT snapped on handoff -- update() lerps toward the live pair
   *  midpoint for a smooth camera handoff. */
  private nudgeFocal(actor: string, target: string, ni: number, ko = false): void {
    const cur = this.focal;
    const a = this.cellOfCb?.(actor);
    const b = this.cellOfCb?.(target);
    const mx = a && b ? (a.x + b.x) / 2 : a?.x ?? b?.x ?? 0;
    const my = a && b ? (a.y + b.y) / 2 : a?.y ?? b?.y ?? 0;
    if (ko) {
      if (cur?.koHold && cur.koHold > 0) return;
      this.focal = { actorUid: actor, targetUid: target, targetUids: [target], x: mx, y: my, intensity: Math.max(0.92, ni), koHold: 0.34 };
      return;
    }
    // A decisive knockout owns the camera until its short hold finishes.
    if (cur?.koHold && cur.koHold > 0) return;
    if (!cur || ni >= cur.intensity * 0.55) {
      this.focal = {
        actorUid: actor,
        targetUid: target,
        // First focus begins at the pair midpoint; handoffs keep the current
        // point so update() can smoothly steer the camera to the new exchange.
        x: cur?.x ?? mx,
        y: cur?.y ?? my,
        intensity: Math.max(cur?.intensity ?? 0, ni),
        targetUids: [target],
        koHold: 0,
      };
    } else {
      // a lighter hit elsewhere just sustains the current focal briefly
      cur.intensity = Math.max(cur.intensity, ni * 0.4);
    }
  }

  /** Area focus centers the camera on the caster plus the entire opposing
   * group, so a 3v3 spread move reads as one battlefield-scale action rather
   * than three unrelated single-target hits. */
  private nudgeAreaFocal(actor: string, targets: string[], ni: number): void {
    const cur = this.focal;
    if (cur?.koHold && cur.koHold > 0) return;
    const a = this.cellOfCb?.(actor);
    const pts = targets.map((uid) => this.cellOfCb?.(uid)).filter((p): p is Pt => !!p);
    if (!a || pts.length === 0) return;
    const gx = pts.reduce((sum, p) => sum + p.x, 0) / pts.length;
    const gy = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
    if (!cur || ni >= cur.intensity * 0.55) {
      this.focal = {
        actorUid: actor, targetUid: targets[0]!, targetUids: [...targets],
        x: cur?.x ?? (a.x + gx) / 2, y: cur?.y ?? (a.y + gy) / 2,
        intensity: Math.max(cur?.intensity ?? 0, ni), koHold: 0,
      };
    }
  }

  update(dt: number): void {
    for (const e of this.effects) e.t += dt;
    this.effects = this.effects.filter((e) => e.t < e.life);
    for (const [uid, im] of this.impulses) {
      im.t += dt;
      if (im.t >= im.life) this.impulses.delete(uid);
    }
    // director focal: decay intensity (~1.4s) and ease the point toward the
    // live pair midpoint so the camera tracks the continuing exchange.
    if (this.focal) {
      if (this.focal.koHold > 0) {
        this.focal.koHold = Math.max(0, this.focal.koHold - dt);
        // Keep a short composed hold while the faint burst and shrinking sprite
        // settle; normal focal decay resumes immediately afterwards.
        this.focal.intensity = Math.max(0.72, this.focal.intensity - dt * 0.18);
      } else {
        this.focal.intensity = Math.max(0, this.focal.intensity - dt / 1.4);
      }
      if (this.cellOfCb) {
        const a = this.cellOfCb(this.focal.actorUid);
        const targetPts = (this.focal.targetUids?.length ? this.focal.targetUids : [this.focal.targetUid])
          .map((uid) => this.cellOfCb!(uid)).filter((p): p is Pt => !!p);
        const gx = targetPts.length ? targetPts.reduce((sum, p) => sum + p.x, 0) / targetPts.length : undefined;
        const gy = targetPts.length ? targetPts.reduce((sum, p) => sum + p.y, 0) / targetPts.length : undefined;
        const tx = a && gx !== undefined ? (a.x + gx) / 2 : a?.x ?? gx ?? this.focal.x;
        const ty = a && gy !== undefined ? (a.y + gy) / 2 : a?.y ?? gy ?? this.focal.y;
        const k = 1 - Math.exp(-dt * 6);
        this.focal.x += (tx - this.focal.x) * k;
        this.focal.y += (ty - this.focal.y) * k;
      }
      if (this.focal.intensity <= 0) this.focal = null;
    }
  }

  /** True only after presentation-blocking local effects and attacker impulses
   * finish. Footstep dust is ambient/travel feedback and can continue to spawn
   * while a final movement interpolation settles, so it must never hold the
   * victory/defeat result screen hostage. */
  hasBlockingVisuals(): boolean {
    return this.effects.some((effect) => effect.kind !== 'dust') || this.impulses.size > 0;
  }

  clear(): void { this.effects = []; this.lastSeq = 0; this.impulses.clear(); this.pendingImpact = null; this.focal = null; this.cellOfCb = null; }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const e of this.effects) {
      const k = e.t / e.life; // 0..1 progress
      switch (e.kind) {
        case 'projectile': this.drawProjectile(ctx, e, k); break;
        case 'slash': this.drawSlash(ctx, e, k); break;
        case 'burst': this.drawBurst(ctx, e, k); break;
        case 'beam': this.drawBeam(ctx, e, k); break;
        case 'cast': this.drawCast(ctx, e, k); break;
        case 'number': this.drawNumber(ctx, e, k); break;
        case 'heal': this.drawHeal(ctx, e, k); break;
        case 'status': this.drawStatus(ctx, e, k); break;
        case 'faint': this.drawFaint(ctx, e, k); break;
        case 'shield': this.drawShield(ctx, e, k); break;
        case 'arrow': this.drawArrow(ctx, e, k); break;
        case 'dust': this.drawDust(ctx, e, k); break;
      }
    }
  }

  private px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, alpha = 1): void {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
    ctx.globalAlpha = 1;
  }

  private drawProjectile(ctx: CanvasRenderingContext2D, e: Extract<Effect, { kind: 'projectile' }>, k: number): void {
    const x = e.x + (e.tx - e.x) * k;
    const y = e.y + (e.ty - e.y) * k;
    const p = e.profile;
    const scale = p.scale ?? 1;
    const accent = p.accent ?? '#ffffff';
    const dx = e.tx - e.x, dy = e.ty - e.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const px = -uy, py = ux;
    // Individual projectile families share the same deterministic path but draw
    // different silhouettes: sparks, droplets, seeds, sludge, stars and rocks.
    if (p.family === 'bolt') {
      ctx.strokeStyle = accent; ctx.lineWidth = 3 * scale; ctx.globalAlpha = 1 - k * 0.25;
      ctx.beginPath(); ctx.moveTo(x - ux * 13, y - uy * 13); ctx.lineTo(x - ux * 3 + px * 4, y - uy * 3 + py * 4); ctx.lineTo(x + ux * 4 - px * 3, y + uy * 4 - py * 3); ctx.stroke();
      this.px(ctx, x - 2, y - 2, 5 * scale, 5 * scale, accent, 1);
      ctx.globalAlpha = 1; return;
    }
    if (p.family === 'blade') {
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(dy, dx) + (p.spin ?? 0) * k * Math.PI);
      ctx.fillStyle = e.color; ctx.globalAlpha = 0.95;
      ctx.beginPath(); ctx.moveTo(9 * scale, 0); ctx.lineTo(-6 * scale, -4 * scale); ctx.lineTo(-2 * scale, 0); ctx.lineTo(-6 * scale, 4 * scale); ctx.closePath(); ctx.fill();
      ctx.fillStyle = accent; ctx.fillRect(-2 * scale, -1 * scale, 7 * scale, 2 * scale); ctx.restore(); ctx.globalAlpha = 1; return;
    }
    if (p.family === 'meteor') {
      for (let i = 1; i <= 4; i++) this.px(ctx, x - ux * i * 5 - 2, y - uy * i * 5 - 2, (7 - i) * scale, (7 - i) * scale, e.color, 0.45 - i * 0.07);
      this.px(ctx, x - 5 * scale, y - 5 * scale, 10 * scale, 10 * scale, e.color, 1);
      this.px(ctx, x - 2 * scale, y - 2 * scale, 4 * scale, 4 * scale, accent, 0.9); return;
    }
    if (p.family === 'drain') {
      for (let i = 0; i < 3; i++) {
        const a = k * 10 + i * 2.1;
        this.px(ctx, x + Math.cos(a) * 7 * scale - 2, y + Math.sin(a) * 7 * scale - 2, 4, 4, accent, 0.8);
      }
      this.px(ctx, x - 2, y - 2, 5 * scale, 5 * scale, e.color, 1); return;
    }
    if (p.family === 'orb' || p.family === 'storm') {
      const r = (p.family === 'storm' ? 9 : 7) * scale;
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.7);
      g.addColorStop(0, accent); g.addColorStop(0.45, e.color); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.8; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.7, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      this.px(ctx, x - r / 2, y - r / 2, r, r, e.color, 1); this.px(ctx, x - r / 4, y - r / 4, r / 2, r / 2, accent, 0.9); return;
    }
    // dash / fang / rune fallback: a hard pixel core with a color trail.
    for (let i = 1; i <= 4; i++) this.px(ctx, x - ux * i * 3, y - uy * i * 3, 4, 4, e.color, 0.5 - i * 0.1);
    this.px(ctx, x - 2, y - 2, 6 * scale, 6 * scale, e.color, 1);
    this.px(ctx, x - 1, y - 1, 3 * scale, 3 * scale, accent, 0.9);
  }

  private drawSlash(ctx: CanvasRenderingContext2D, e: Extract<Effect, { kind: 'slash' }>, k: number): void {
    const p = e.profile;
    const scale = p.scale ?? 1;
    const accent = p.accent ?? '#ffffff';
    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.ang + (p.spin ?? 0) * k * 0.3);
    const a = 1 - k;
    const span = (26 + k * 10) * scale;
    if (p.family === 'fang') {
      ctx.globalAlpha = a; ctx.fillStyle = e.color;
      for (const sign of [-1, 1]) { ctx.beginPath(); ctx.moveTo(4 * scale, 0); ctx.lineTo(-span * 0.55, sign * span * 0.28); ctx.lineTo(-span * 0.32, sign * span * 0.05); ctx.closePath(); ctx.fill(); }
      ctx.restore(); ctx.globalAlpha = 1; return;
    }
    if (p.family === 'dash') {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * 0.75; ctx.fillStyle = e.color;
      ctx.fillRect(-span * 0.7, -5 * scale, span * 1.35, 10 * scale);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a; ctx.fillStyle = accent; ctx.fillRect(-span * 0.45, -1 * scale, span * 0.9, 2 * scale);
      ctx.restore(); ctx.globalAlpha = 1; return;
    }
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = e.color; ctx.globalAlpha = a * 0.6; ctx.lineWidth = 7 * scale;
    ctx.beginPath(); ctx.arc(0, 0, span, -0.9, 0.9); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = e.color; ctx.globalAlpha = a; ctx.lineWidth = 3 * scale;
    ctx.beginPath(); ctx.arc(0, 0, span, -0.9, 0.9); ctx.stroke();
    ctx.strokeStyle = accent; ctx.lineWidth = 1; ctx.globalAlpha = a * 0.8;
    ctx.beginPath(); ctx.arc(0, 0, span - 3 * scale, -0.7, 0.7); ctx.stroke();
    if (p.family === 'blade' && p.spin) { ctx.rotate(Math.PI / 2); ctx.globalAlpha = a * 0.65; ctx.beginPath(); ctx.arc(0, 0, span * 0.8, -0.75, 0.75); ctx.stroke(); }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  private drawBurst(ctx: CanvasRenderingContext2D, e: Extract<Effect, { kind: 'burst' }>, _k: number): void {
    const delay = e.delay ?? 0;
    if (e.t < delay) return;
    const k = Math.min(1, (e.t - delay) / Math.max(0.001, e.life - delay));
    const p = e.profile ?? { family: 'orb' as FxFamily, scale: 1 };
    const scale = p.scale ?? 1;
    const accent = p.accent ?? '#ffffff';
    const img = e.imgName ? getFxImage(e.imgName) : null;
    // Skill assets remain optional overrides. Procedural silhouettes below are
    // still drawn so every named move retains a recognizable behavior offline.
    if (img && p.family === 'orb') {
      const size = e.r * (1 + k) * 1.4;
      ctx.globalAlpha = (1 - k) * 0.62;
      ctx.drawImage(img, e.x - size / 2, e.y - size / 2, size, size);
      ctx.globalAlpha = 1;
    }
    const r = e.r * (0.4 + k * 1.3) * scale;
    if (p.family === 'wave') {
      ctx.strokeStyle = accent; ctx.lineWidth = Math.max(2, 6 * (1 - k)); ctx.globalAlpha = (1 - k) * 0.9;
      for (let i = 0; i < 3; i++) { const rr = r * (0.55 + i * 0.34); ctx.beginPath(); ctx.ellipse(e.x, e.y + r * 0.16, rr, rr * (0.22 + i * 0.06), 0, 0, Math.PI * 2); ctx.stroke(); }
      ctx.globalAlpha = 1; return;
    }
    if (p.family === 'storm') {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2 + k * (p.spin ?? 4); const rr = r * (0.3 + (i % 5) / 7); this.px(ctx, e.x + Math.cos(a) * rr - 2, e.y + Math.sin(a) * rr * 0.62 - 2, 4, 4, i % 3 ? e.color : accent, (1 - k) * 0.85); }
      ctx.globalCompositeOperation = 'source-over'; return;
    }
    if (p.family === 'meteor') {
      for (let i = 0; i < 9; i++) { const a = i * 2.4 + 0.4; const rr = r * (0.25 + (i % 4) * 0.18); this.px(ctx, e.x + Math.cos(a) * rr - 3, e.y + Math.sin(a) * rr - 3, 6 * scale, 6 * scale, i % 2 ? e.color : accent, (1 - k) * 0.9); }
      ctx.strokeStyle = accent; ctx.globalAlpha = (1 - k) * 0.65; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; return;
    }
    if (p.family === 'rune' || p.family === 'curse') {
      ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(k * (p.spin ?? 3) * Math.PI);
      ctx.strokeStyle = accent; ctx.globalAlpha = (1 - k) * 0.85; ctx.lineWidth = 2; const sides = p.family === 'curse' ? 3 : 6;
      ctx.beginPath(); for (let i = 0; i <= sides; i++) { const a = i / sides * Math.PI * 2; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke();
      ctx.restore(); ctx.globalAlpha = 1; return;
    }
    if (p.family === 'drain') {
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + k * 3; const rr = r * (1 - k * 0.55); this.px(ctx, e.x + Math.cos(a) * rr - 2, e.y + Math.sin(a) * rr - 2, 4, 4, accent, (1 - k) * 0.8); }
      return;
    }
    if (p.family === 'guard') {
      ctx.strokeStyle = accent; ctx.globalAlpha = (1 - k) * 0.85; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(e.x, e.y, r * 0.85, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; return;
    }
    // Default impact: compact local flash + colored ring. It deliberately never
    // fills the screen, preserving readability for simultaneous 3v3 exchanges.
    ctx.globalCompositeOperation = 'lighter';
    const sr = e.r * (0.3 + k * 2.2) * scale;
    ctx.globalAlpha = (1 - k) * 0.7; ctx.strokeStyle = accent; ctx.lineWidth = Math.max(1, 4 * (1 - k));
    ctx.beginPath(); ctx.arc(e.x, e.y, sr, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = (1 - k) * 0.75; ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(e.x, e.y, r * 0.45 * (1 - k * 0.5), 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1 - k; ctx.strokeStyle = e.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; const d = r * (0.7 + 0.3 * ((i * 13) % 7) / 7); this.px(ctx, e.x + Math.cos(a) * d - 1.5, e.y + Math.sin(a) * d - 1.5, 3, 3, i % 4 ? e.color : accent, 1 - k); }
    ctx.globalAlpha = 1;
  }

  private drawBeam(ctx: CanvasRenderingContext2D, e: Extract<Effect, { kind: 'beam' }>, k: number): void {
    const p = e.profile, scale = p.scale ?? 1, accent = p.accent ?? '#ffffff';
    const a = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    const dx = e.tx - e.x, dy = e.ty - e.y, len = Math.hypot(dx, dy) || 1, px = -dy / len, py = dx / len;
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = e.color; ctx.globalAlpha = a * 0.35; ctx.lineWidth = 14 * scale;
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.tx, e.ty); ctx.stroke();
    if (p.family === 'beam') {
      ctx.strokeStyle = accent; ctx.globalAlpha = a * 0.85; ctx.lineWidth = 3 * scale;
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.tx, e.ty); ctx.stroke();
      for (let i = 0; i < 5; i++) { const q = (i + k * 2) / 5; this.px(ctx, e.x + dx * q + px * Math.sin(q * 15) * 5, e.y + dy * q + py * Math.sin(q * 15) * 5, 3, 3, accent, a * 0.8); }
    } else {
      ctx.strokeStyle = accent; ctx.globalAlpha = a * 0.7; ctx.lineWidth = 2 * scale;
      ctx.beginPath(); ctx.moveTo(e.x + px * 6, e.y + py * 6); ctx.lineTo(e.tx + px * 6, e.ty + py * 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(e.x - px * 6, e.y - py * 6); ctx.lineTo(e.tx - px * 6, e.ty - py * 6); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  private drawCast(ctx: CanvasRenderingContext2D, e: Extract<Effect, { kind: 'cast' }>, k: number): void {
    const p = e.profile, scale = p.scale ?? 1, accent = p.accent ?? '#ffffff';
    const pulse = Math.sin(k * Math.PI);
    if (p.family === 'guard') {
      ctx.strokeStyle = accent; ctx.globalAlpha = pulse * 0.9; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(e.x, e.y, (17 + k * 8) * scale, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; return;
    }
    if (p.family === 'heal') {
      for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; this.px(ctx, e.x + Math.cos(a) * 14 * scale - 2, e.y + 10 - k * 22 + Math.sin(a) * 8 - 2, 4, 4, accent, pulse); }
      return;
    }
    if (p.family === 'powder' || p.family === 'storm') {
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + k * (p.spin ?? 3); const r = (8 + k * 22) * scale; this.px(ctx, e.x + Math.cos(a) * r - 2, e.y + Math.sin(a) * r * 0.55 - 2, 4, 4, accent, pulse * 0.8); }
      return;
    }
    if (p.family === 'rune' || p.family === 'curse') {
      ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(k * (p.spin ?? 2) * Math.PI); ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.globalAlpha = pulse;
      const r = (14 + k * 9) * scale; ctx.beginPath(); for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI * 2; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1; return;
    }
    const r = (16 + pulse * 7) * scale, n = 6;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + k * (p.spin ?? 2) * Math.PI; this.px(ctx, e.x + Math.cos(a) * r - 1.5, e.y + Math.sin(a) * r - 1.5, 3, 3, accent, pulse); }
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawNumber(ctx: CanvasRenderingContext2D, e: Extract<Effect, { kind: 'number' }>, _k: number): void {
    const delay = e.delay ?? 0;
    if (e.t < delay) return;
    const k = Math.min(1, (e.t - delay) / Math.max(0.001, e.life - delay));
    const y = e.y - k * 22;
    ctx.globalAlpha = k < 0.15 ? k / 0.15 : 1 - (k - 0.7) / 0.3;
    ctx.font = `bold ${e.size}px "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(e.text, e.x, y);
    ctx.fillStyle = e.color;
    ctx.fillText(e.text, e.x, y);
    ctx.globalAlpha = 1;
  }

  private drawHeal(ctx: CanvasRenderingContext2D, e: Extract<Effect, { kind: 'heal' }>, k: number): void {
    const img = e.imgName ? getFxImage(e.imgName) : null;
    if (img) {
      const s = 20 + Math.sin(k * Math.PI) * 6;
      ctx.globalAlpha = Math.sin(k * Math.PI);
      ctx.drawImage(img, e.x - s / 2, e.y - s / 2, s, s);
      ctx.globalAlpha = 1;
      return;
    }
    for (let i = 0; i < 6; i++) {
      const off = (i / 6) * Math.PI * 2;
      const yy = e.y + 10 - k * 24 + Math.sin(off) * 8;
      const xx = e.x + Math.cos(off) * 10;
      this.px(ctx, xx - 1, yy, 2, 4, '#4cd964', Math.sin(k * Math.PI));
      this.px(ctx, xx - 2, yy + 1, 4, 2, '#4cd964', Math.sin(k * Math.PI) * 0.7);
    }
  }

  private drawStatus(ctx: CanvasRenderingContext2D, e: Extract<Effect, { kind: 'status' }>, k: number): void {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + k * 2;
      const r = 6 + k * 16;
      this.px(ctx, e.x + Math.cos(a) * r - 1, e.y + Math.sin(a) * r - 1, 3, 3, e.color, 1 - k);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawFaint(ctx: CanvasRenderingContext2D, e: Extract<Effect, { kind: 'faint' }>, k: number): void {
    // A low, fading ring keeps the aftermath localized at the fallen combatant
    // instead of flashing the entire 3v3 board.
    const ring = 10 + k * 32;
    ctx.strokeStyle = '#e6edf7';
    ctx.lineWidth = 2;
    ctx.globalAlpha = (1 - k) * 0.36;
    ctx.beginPath(); ctx.ellipse(e.x, e.y + 10, ring, ring * 0.32, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.2;
      const d = 6 + k * 30;
      const rise = k * 12 * (0.4 + (i % 3) * 0.2);
      this.px(ctx, e.x + Math.cos(a) * d - 1, e.y + Math.sin(a) * d - rise - 1, 3, 3, i % 3 === 0 ? '#ffffff' : '#cfcfcf', (1 - k) * 0.9);
    }
  }

  private drawShield(ctx: CanvasRenderingContext2D, e: Extract<Effect, { kind: 'shield' }>, k: number): void {
    const img = e.imgName ? getFxImage(e.imgName) : null;
    const a = Math.sin(k * Math.PI);
    if (img) {
      const s = 44;
      ctx.globalAlpha = a;
      ctx.drawImage(img, e.x - s / 2, e.y - s / 2, s, s);
      ctx.globalAlpha = 1;
      return;
    }
    ctx.strokeStyle = '#9fd6f5';
    ctx.globalAlpha = a;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawArrow(ctx: CanvasRenderingContext2D, e: Extract<Effect, { kind: 'arrow' }>, k: number): void {
    const y = e.y - k * 14;
    ctx.globalAlpha = k < 0.2 ? k / 0.2 : 1 - (k - 0.7) / 0.3;
    ctx.fillStyle = e.color;
    ctx.beginPath();
    if (e.up) {
      ctx.moveTo(e.x, y - 6); ctx.lineTo(e.x - 5, y + 2); ctx.lineTo(e.x + 5, y + 2);
    } else {
      ctx.moveTo(e.x, y + 6); ctx.lineTo(e.x - 5, y - 2); ctx.lineTo(e.x + 5, y - 2);
    }
    ctx.fill();
    ctx.fillRect(e.x - 2, y - 4, 4, 8);
    ctx.globalAlpha = 1;
  }

  private drawDust(ctx: CanvasRenderingContext2D, e: Extract<Effect, { kind: 'dust' }>, k: number): void {
    const r = 2 + k * 6;
    ctx.globalAlpha = (1 - k) * 0.5;
    ctx.fillStyle = e.color;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + e.t * 4;
      ctx.beginPath();
      ctx.arc(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r * 0.4, 1.5 + k * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
