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
 * Beyond spawned effects, this manager also tracks two render-side signals
 * consumed by BattleCanvas:
 *  - impulses: a short forward lunge applied to a combatant when it attacks
 *    (gives melee/ranged casts "commitment"). Queried via impulseOf(uid).
 *  - pendingImpact: screen-flash intensity/color from the heaviest damage
 *    event this frame. Queried (and cleared) via impact().
 *  - spawnDust(): movement footstep puffs, called by the canvas.
 */
import type { BattleEvent, StatusKind, TypeName } from '@pokemon-online/shared';
import { TYPE_COLORS } from '@pokemon-online/config';

type Pt = { x: number; y: number };

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
  | { kind: 'projectile'; x: number; y: number; tx: number; ty: number; t: number; life: number; color: string; imgName?: string; }
  | { kind: 'slash'; x: number; y: number; ang: number; t: number; life: number; color: string; }
  | { kind: 'burst'; x: number; y: number; t: number; life: number; color: string; r: number; imgName?: string; }
  | { kind: 'beam'; x: number; y: number; tx: number; ty: number; t: number; life: number; color: string; }
  | { kind: 'cast'; x: number; y: number; t: number; life: number; color: string; }
  | { kind: 'number'; x: number; y: number; t: number; life: number; text: string; color: string; size: number; }
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

export class EffectManager {
  private effects: Effect[] = [];
  private lastSeq = 0;
  private impulses = new Map<string, Impulse>();
  private pendingImpact: { color: string; intensity: number } | null = null;

  /** Process new events. `cellOf(uid)` returns the screen-px center of a
   *  combatant (or null). Spawns VFX for events with seq > lastSeq. Per-frame
   *  spawn count is capped so a skip/resolve burst (hundreds of events at once)
   *  doesn't flood the screen with overlapping effects. */
  consume(events: BattleEvent[], cellOf: (uid?: string) => Pt | null): void {
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
      this.spawn(ev, cellOf);
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

  private spawn(ev: BattleEvent, cellOf: (uid?: string) => Pt | null): void {
    const v = ev.vfx;
    switch (ev.type) {
      case 'attack':
      case 'skill': {
        if (!v) break;
        const from = this.pos(ev, cellOf, 'actor');
        const to = this.pos(ev, cellOf, 'target');
        // attacker forward lunge (toward target). melee commits harder.
        if (from && to && ev.actor) {
          const dx = to.x - from.x, dy = to.y - from.y;
          const len = Math.hypot(dx, dy) || 1;
          const amp = v.kind === 'melee' ? 12 : (v.kind === 'projectile' || v.kind === 'beam') ? 5 : v.kind === 'cast' ? 4 : 6;
          this.impulses.set(ev.actor, { t: 0, life: 0.22, ax: (dx / len) * amp, ay: (dy / len) * amp });
        }
        if (!from || !to) break;
        const color = typeColor(v.type);
        const typeImg = v.type ? `type/${v.type}` : undefined;
        if (v.kind === 'projectile') this.push({ kind: 'projectile', x: from.x, y: from.y, tx: to.x, ty: to.y, t: 0, life: 0.26, color, imgName: typeImg });
        else if (v.kind === 'melee') {
          const ang = Math.atan2(to.y - from.y, to.x - from.x);
          this.push({ kind: 'slash', x: to.x, y: to.y, ang, t: 0, life: 0.22, color });
        } else if (v.kind === 'beam') this.push({ kind: 'beam', x: from.x, y: from.y, tx: to.x, ty: to.y, t: 0, life: 0.3, color });
        else if (v.kind === 'cast') this.push({ kind: 'cast', x: from.x, y: from.y, t: 0, life: 0.6, color });
        else this.push({ kind: 'burst', x: to.x, y: to.y, t: 0, life: 0.4, color, r: 22, imgName: typeImg }); // burst / status utility
        break;
      }
      case 'damage': {
        const at = this.pos(ev, cellOf, 'target');
        if (!at) break;
        const dmg = ev.amount ?? 0;
        if (v?.missed) { this.push({ kind: 'number', x: at.x, y: at.y - 14, t: 0, life: 0.8, text: '闪避', color: '#cfcfcf', size: 13 }); break; }
        // real hits (actor present, not DOT) scale the burst by damage and feed
        // the screen-flash signal. DOT/miss stay small and don't flash.
        const realHit = !!ev.actor && dmg > 0;
        const r = realHit ? 14 + Math.min(22, dmg * 0.45) : 18;
        this.push({ kind: 'burst', x: at.x, y: at.y, t: 0, life: 0.4, color: typeColor(v?.type), r, imgName: v?.type ? `type/${v.type}` : undefined });
        if (dmg > 0) this.push({ kind: 'number', x: at.x, y: at.y - 14, t: 0, life: 0.85, text: String(dmg), color: typeColor(v?.type), size: 13 });
        if (realHit) {
          const inten = Math.min(1, Math.max(0.3, dmg / 40));
          if (!this.pendingImpact || inten > this.pendingImpact.intensity) this.pendingImpact = { color: typeColor(v?.type), intensity: inten };
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
        this.push({ kind: 'faint', x: at.x, y: at.y, t: 0, life: 0.6 });
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
        // effectiveness / crit tags (stable strings from damage.ts)
        const at = this.pos(ev, cellOf, 'target');
        if (!at || !ev.message) break;
        if (ev.message.includes('效果绝佳')) this.push({ kind: 'number', x: at.x, y: at.y - 30, t: 0, life: 0.9, text: '效果绝佳!', color: '#ffd24a', size: 15 });
        else if (ev.message.includes('击中要害')) this.push({ kind: 'number', x: at.x, y: at.y - 30, t: 0, life: 0.9, text: '要害!', color: '#ff7a3a', size: 15 });
        break;
      }
      default: break;
    }
  }

  private push(e: Effect): void { this.effects.push(e); }

  /** Spawn a footstep dust puff (called by the canvas while a combatant moves). */
  spawnDust(x: number, y: number, color = '#cfcfcf'): void {
    this.push({ kind: 'dust', x, y, t: 0, life: 0.4, color });
  }

  /** Current lunge offset (px) for a combatant, or null. Eases out-and-back via
   *  sin(pi*k) so the sprite returns to rest. */
  impulseOf(uid: string): { dx: number; dy: number } | null {
    const im = this.impulses.get(uid);
    if (!im) return null;
    const k = Math.min(1, im.t / im.life);
    const s = Math.sin(Math.PI * k);
    return { dx: im.ax * s, dy: im.ay * s };
  }

  /** Heaviest damage-impact signal this frame (color + 0..1 intensity). Resets
   *  after read so the canvas can drive a decaying screen flash. */
  impact(): { color: string; intensity: number } | null {
    const r = this.pendingImpact;
    this.pendingImpact = null;
    return r;
  }

  update(dt: number): void {
    for (const e of this.effects) e.t += dt;
    this.effects = this.effects.filter((e) => e.t < e.life);
    for (const [uid, im] of this.impulses) {
      im.t += dt;
      if (im.t >= im.life) this.impulses.delete(uid);
    }
  }

  clear(): void { this.effects = []; this.lastSeq = 0; this.impulses.clear(); this.pendingImpact = null; }

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
    const img = e.imgName ? getFxImage(e.imgName) : null;
    if (img) {
      const s = 16;
      ctx.globalAlpha = 1;
      ctx.drawImage(img, x - s / 2, y - s / 2, s, s);
      return;
    }
    // additive glow halo (energy head)
    ctx.globalCompositeOperation = 'lighter';
    const grad = ctx.createRadialGradient(x, y, 0, x, y, 11);
    grad.addColorStop(0, e.color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    // pixel trail
    const dx = e.tx - e.x, dy = e.ty - e.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    for (let i = 1; i <= 4; i++) this.px(ctx, x - ux * i * 3, y - uy * i * 3, 4, 4, e.color, 0.5 - i * 0.1);
    // hard pixel core
    this.px(ctx, x - 2, y - 2, 6, 6, e.color, 1);
    this.px(ctx, x - 1, y - 1, 3, 3, '#ffffff', 0.9);
  }

  private drawSlash(ctx: CanvasRenderingContext2D, e: Extract<Effect, { kind: 'slash' }>, k: number): void {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.ang);
    const a = 1 - k;
    const span = 26 + k * 10;
    // additive glow underlay
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = e.color;
    ctx.globalAlpha = a * 0.6;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(0, 0, span, -0.9, 0.9);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = e.color;
    ctx.globalAlpha = a;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, span, -0.9, 0.9);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.globalAlpha = a * 0.8;
    ctx.beginPath();
    ctx.arc(0, 0, span - 3, -0.7, 0.7);
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawBurst(ctx: CanvasRenderingContext2D, e: Extract<Effect, { kind: 'burst' }>, k: number): void {
    const img = e.imgName ? getFxImage(e.imgName) : null;
    if (img) {
      const s = e.r * (1 + k) * 1.4;
      ctx.globalAlpha = 1 - k;
      ctx.drawImage(img, e.x - s / 2, e.y - s / 2, s, s);
      ctx.globalAlpha = 1;
      return;
    }
    const r = e.r * (0.4 + k * 1.3);
    // expanding shockwave ring (fast, white -> fades) - the "punch"
    ctx.globalCompositeOperation = 'lighter';
    const sr = e.r * (0.3 + k * 2.2);
    ctx.globalAlpha = (1 - k) * 0.7;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1, 4 * (1 - k));
    ctx.beginPath();
    ctx.arc(e.x, e.y, sr, 0, Math.PI * 2);
    ctx.stroke();
    // white center flash (pops on impact), additive
    ctx.globalAlpha = (1 - k) * 0.8;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(e.x, e.y, r * 0.5 * (1 - k * 0.5), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // type-colored ring
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
    ctx.stroke();
    // 16 pixel particles flying out
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const d = r * (0.7 + 0.3 * ((i * 13) % 7) / 7);
      this.px(ctx, e.x + Math.cos(a) * d - 1.5, e.y + Math.sin(a) * d - 1.5, 3, 3, e.color, 1 - k);
    }
    ctx.globalAlpha = 1;
  }

  private drawBeam(ctx: CanvasRenderingContext2D, e: Extract<Effect, { kind: 'beam' }>, k: number): void {
    const a = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    // additive glow halo
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = e.color;
    ctx.globalAlpha = a * 0.4;
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(e.x, e.y); ctx.lineTo(e.tx, e.ty);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = e.color;
    ctx.globalAlpha = a;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(e.x, e.y); ctx.lineTo(e.tx, e.ty);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.globalAlpha = a * 0.8;
    ctx.beginPath();
    ctx.moveTo(e.x, e.y); ctx.lineTo(e.tx, e.ty);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawCast(ctx: CanvasRenderingContext2D, e: Extract<Effect, { kind: 'cast' }>, k: number): void {
    const r = 16 + Math.sin(k * Math.PI) * 6;
    const n = 6;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + k * Math.PI * 2;
      this.px(ctx, e.x + Math.cos(a) * r - 1.5, e.y + Math.sin(a) * r - 1.5, 3, 3, e.color, Math.sin(k * Math.PI));
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawNumber(ctx: CanvasRenderingContext2D, e: Extract<Effect, { kind: 'number' }>, k: number): void {
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
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const d = 6 + k * 22;
      this.px(ctx, e.x + Math.cos(a) * d - 1, e.y + Math.sin(a) * d - 1, 3, 3, '#cfcfcf', 1 - k);
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
