/**
 * @canvas-archive-only
 * Archived Canvas compatibility/regression source. It must remain in the
 * repository, but must not be imported, mounted, dynamically loaded, offered
 * as a fallback, or extended by official GPU/Pixi world or battle runtime code.
 */
import type { CanvasEffect } from './types.ts';
import { getCanvasFxImage } from './assets.ts';

/** Procedural Canvas 2D primitives. They intentionally know nothing about
 * BattleEvent, BattleDirector, engine state, Pinia, or Vue. */
export class CanvasVfxPrimitives {
  draw(ctx: CanvasRenderingContext2D, effects: readonly CanvasEffect[]): void {
    for (const effect of effects) {
      const progress = effect.t / effect.life;
      switch (effect.kind) {
        case 'projectile': this.drawProjectile(ctx, effect, progress); break;
        case 'slash': this.drawSlash(ctx, effect, progress); break;
        case 'burst': this.drawBurst(ctx, effect, progress); break;
        case 'beam': this.drawBeam(ctx, effect, progress); break;
        case 'cast': this.drawCast(ctx, effect, progress); break;
        case 'number': this.drawNumber(ctx, effect, progress); break;
        case 'heal': this.drawHeal(ctx, effect, progress); break;
        case 'status': this.drawStatus(ctx, effect, progress); break;
        case 'faint': this.drawFaint(ctx, effect, progress); break;
        case 'shield': this.drawShield(ctx, effect, progress); break;
        case 'arrow': this.drawArrow(ctx, effect, progress); break;
        case 'dust': this.drawDust(ctx, effect, progress); break;
      }
    }
  }

  private px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, alpha = 1): void {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
    ctx.globalAlpha = 1;
  }

  private drawProjectile(ctx: CanvasRenderingContext2D, e: Extract<CanvasEffect, { kind: 'projectile' }>, k: number): void {
    const x = e.x + (e.tx - e.x) * k;
    const y = e.y + (e.ty - e.y) * k;
    const p = e.profile;
    const scale = p.scale ?? 1;
    const accent = p.accent ?? '#ffffff';
    const dx = e.tx - e.x, dy = e.ty - e.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const px = -uy, py = ux;
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
      for (let i = 1; i <= 4; i++) this.px(ctx, x - ux * i * 7 - px * Math.sin(k * 8 + i) * 3 - 2, y - uy * i * 7 - py * Math.sin(k * 8 + i) * 3 - 2, (7 - i) * scale, (7 - i) * scale, i % 2 ? accent : e.color, 0.9 - i * 0.12);
      this.px(ctx, x - 4 * scale, y - 4 * scale, 8 * scale, 8 * scale, accent); return;
    }
    if (p.family === 'dash' || p.family === 'fang') {
      ctx.strokeStyle = accent; ctx.lineWidth = 3 * scale; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.moveTo(x - ux * 15, y - uy * 15); ctx.lineTo(x + ux * 7, y + uy * 7); ctx.stroke();
      if (p.family === 'fang') { ctx.beginPath(); ctx.arc(x, y, 7 * scale, 0.25, Math.PI - 0.25); ctx.stroke(); }
      ctx.globalAlpha = 1; return;
    }
    if (p.family === 'rune' || p.family === 'curse') {
      ctx.save(); ctx.translate(x, y); ctx.rotate(k * (p.spin ?? 3) * Math.PI);
      ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.globalAlpha = 0.9;
      const r = 7 * scale, sides = p.family === 'curse' ? 3 : 6;
      ctx.beginPath(); for (let i = 0; i <= sides; i++) { const a = i / sides * Math.PI * 2; const xx = Math.cos(a) * r, yy = Math.sin(a) * r; if (i) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); } ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1; return;
    }
    if (p.family === 'drain') {
      for (let i = 0; i < 5; i++) { const off = (i - 2) * 4; this.px(ctx, x - ux * (i * 4) + px * off - 2, y - uy * (i * 4) + py * off - 2, 4 * scale, 4 * scale, accent, 0.85 - i * 0.12); }
      return;
    }
    const img = e.imgName ? getCanvasFxImage(e.imgName) : null;
    if (img) { const size = 20 * scale; ctx.globalAlpha = 1 - k * 0.25; ctx.drawImage(img, x - size / 2, y - size / 2, size, size); ctx.globalAlpha = 1; return; }
    ctx.globalCompositeOperation = 'lighter';
    this.px(ctx, x - 4 * scale, y - 4 * scale, 8 * scale, 8 * scale, e.color, 0.9);
    this.px(ctx, x - 2 * scale, y - 2 * scale, 4 * scale, 4 * scale, accent, 1);
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawSlash(ctx: CanvasRenderingContext2D, e: Extract<CanvasEffect, { kind: 'slash' }>, k: number): void {
    const p = e.profile, scale = p.scale ?? 1, accent = p.accent ?? '#ffffff';
    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.ang + (p.spin ?? 0) * k * Math.PI);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1 - k; ctx.strokeStyle = e.color; ctx.lineWidth = 5 * scale;
    ctx.beginPath(); ctx.arc(0, 0, 15 * scale, -0.7, 0.9); ctx.stroke();
    ctx.strokeStyle = accent; ctx.lineWidth = 2 * scale; ctx.beginPath(); ctx.arc(0, 0, 18 * scale, -0.45, 1.1); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over'; ctx.restore(); ctx.globalAlpha = 1;
  }

  private drawBurst(ctx: CanvasRenderingContext2D, e: Extract<CanvasEffect, { kind: 'burst' }>, _k: number): void {
    const delay = e.delay ?? 0;
    if (e.t < delay) return;
    const k = Math.min(1, (e.t - delay) / Math.max(0.001, e.life - delay));
    const p = e.profile ?? { family: 'orb' as const };
    const scale = p.scale ?? 1, accent = p.accent ?? '#ffffff';
    const img = e.imgName ? getCanvasFxImage(e.imgName) : null;
    if (img && p.family === 'orb') { const size = e.r * (1 + k) * 1.4; ctx.globalAlpha = (1 - k) * 0.62; ctx.drawImage(img, e.x - size / 2, e.y - size / 2, size, size); ctx.globalAlpha = 1; }
    const r = e.r * (0.4 + k * 1.3) * scale;
    if (p.family === 'wave') { ctx.strokeStyle = accent; ctx.lineWidth = Math.max(2, 6 * (1 - k)); ctx.globalAlpha = (1 - k) * 0.9; for (let i = 0; i < 3; i++) { const rr = r * (0.55 + i * 0.34); ctx.beginPath(); ctx.ellipse(e.x, e.y + r * 0.16, rr, rr * (0.22 + i * 0.06), 0, 0, Math.PI * 2); ctx.stroke(); } ctx.globalAlpha = 1; return; }
    if (p.family === 'storm') { ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2 + k * (p.spin ?? 4); const rr = r * (0.3 + (i % 5) / 7); this.px(ctx, e.x + Math.cos(a) * rr - 2, e.y + Math.sin(a) * rr * 0.62 - 2, 4, 4, i % 3 ? e.color : accent, (1 - k) * 0.85); } ctx.globalCompositeOperation = 'source-over'; return; }
    if (p.family === 'meteor') { for (let i = 0; i < 9; i++) { const a = i * 2.4 + 0.4; const rr = r * (0.25 + (i % 4) * 0.18); this.px(ctx, e.x + Math.cos(a) * rr - 3, e.y + Math.sin(a) * rr - 3, 6 * scale, 6 * scale, i % 2 ? e.color : accent, (1 - k) * 0.9); } ctx.strokeStyle = accent; ctx.globalAlpha = (1 - k) * 0.65; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; return; }
    if (p.family === 'rune' || p.family === 'curse') { ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(k * (p.spin ?? 3) * Math.PI); ctx.strokeStyle = accent; ctx.globalAlpha = (1 - k) * 0.85; ctx.lineWidth = 2; const sides = p.family === 'curse' ? 3 : 6; ctx.beginPath(); for (let i = 0; i <= sides; i++) { const a = i / sides * Math.PI * 2; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1; return; }
    if (p.family === 'drain') { for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + k * 3; const rr = r * (1 - k * 0.55); this.px(ctx, e.x + Math.cos(a) * rr - 2, e.y + Math.sin(a) * rr - 2, 4, 4, accent, (1 - k) * 0.8); } return; }
    if (p.family === 'guard') { ctx.strokeStyle = accent; ctx.globalAlpha = (1 - k) * 0.85; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(e.x, e.y, r * 0.85, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; return; }
    ctx.globalCompositeOperation = 'lighter'; const sr = e.r * (0.3 + k * 2.2) * scale; ctx.globalAlpha = (1 - k) * 0.7; ctx.strokeStyle = accent; ctx.lineWidth = Math.max(1, 4 * (1 - k)); ctx.beginPath(); ctx.arc(e.x, e.y, sr, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = (1 - k) * 0.75; ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(e.x, e.y, r * 0.45 * (1 - k * 0.5), 0, Math.PI * 2); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1 - k; ctx.strokeStyle = e.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.stroke(); for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; const d = r * (0.7 + 0.3 * ((i * 13) % 7) / 7); this.px(ctx, e.x + Math.cos(a) * d - 1.5, e.y + Math.sin(a) * d - 1.5, 3, 3, i % 4 ? e.color : accent, 1 - k); } ctx.globalAlpha = 1;
  }

  private drawBeam(ctx: CanvasRenderingContext2D, e: Extract<CanvasEffect, { kind: 'beam' }>, k: number): void {
    const p = e.profile, scale = p.scale ?? 1, accent = p.accent ?? '#ffffff';
    const a = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    const dx = e.tx - e.x, dy = e.ty - e.y, len = Math.hypot(dx, dy) || 1, px = -dy / len, py = dx / len;
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = e.color; ctx.globalAlpha = a * 0.35; ctx.lineWidth = 14 * scale;
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.tx, e.ty); ctx.stroke();
    if (p.family === 'beam') { ctx.strokeStyle = accent; ctx.globalAlpha = a * 0.85; ctx.lineWidth = 3 * scale; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.tx, e.ty); ctx.stroke(); for (let i = 0; i < 5; i++) { const q = (i + k * 2) / 5; this.px(ctx, e.x + dx * q + px * Math.sin(q * 15) * 5, e.y + dy * q + py * Math.sin(q * 15) * 5, 3, 3, accent, a * 0.8); } } else { ctx.strokeStyle = accent; ctx.globalAlpha = a * 0.7; ctx.lineWidth = 2 * scale; ctx.beginPath(); ctx.moveTo(e.x + px * 6, e.y + py * 6); ctx.lineTo(e.tx + px * 6, e.ty + py * 6); ctx.stroke(); ctx.beginPath(); ctx.moveTo(e.x - px * 6, e.y - py * 6); ctx.lineTo(e.tx - px * 6, e.ty - py * 6); ctx.stroke(); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  private drawCast(ctx: CanvasRenderingContext2D, e: Extract<CanvasEffect, { kind: 'cast' }>, k: number): void {
    const p = e.profile, scale = p.scale ?? 1, accent = p.accent ?? '#ffffff';
    const pulse = Math.sin(k * Math.PI);
    if (p.family === 'rune' || p.family === 'curse') { ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(k * (p.spin ?? 2) * Math.PI); ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.globalAlpha = pulse; const r = (14 + k * 9) * scale; ctx.beginPath(); for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI * 2; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1; return; }
    const r = (16 + pulse * 7) * scale, n = 6; ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + k * (p.spin ?? 2) * Math.PI; this.px(ctx, e.x + Math.cos(a) * r - 1.5, e.y + Math.sin(a) * r - 1.5, 3, 3, accent, pulse); } ctx.globalCompositeOperation = 'source-over';
  }

  private drawNumber(ctx: CanvasRenderingContext2D, e: Extract<CanvasEffect, { kind: 'number' }>, _k: number): void {
    const delay = e.delay ?? 0;
    if (e.t < delay) return;
    const k = Math.min(1, (e.t - delay) / Math.max(0.001, e.life - delay));
    const y = e.y - k * 22;
    ctx.globalAlpha = k < 0.15 ? k / 0.15 : 1 - (k - 0.7) / 0.3;
    ctx.font = `bold ${e.size}px "Courier New", monospace`;
    ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(e.text, e.x, y); ctx.fillStyle = e.color; ctx.fillText(e.text, e.x, y); ctx.globalAlpha = 1;
  }

  private drawHeal(ctx: CanvasRenderingContext2D, e: Extract<CanvasEffect, { kind: 'heal' }>, k: number): void {
    const img = e.imgName ? getCanvasFxImage(e.imgName) : null;
    if (img) { const s = 20 + Math.sin(k * Math.PI) * 6; ctx.globalAlpha = Math.sin(k * Math.PI); ctx.drawImage(img, e.x - s / 2, e.y - s / 2, s, s); ctx.globalAlpha = 1; return; }
    for (let i = 0; i < 6; i++) { const off = (i / 6) * Math.PI * 2; const yy = e.y + 10 - k * 24 + Math.sin(off) * 8; const xx = e.x + Math.cos(off) * 10; this.px(ctx, xx - 1, yy, 2, 4, '#4cd964', Math.sin(k * Math.PI)); this.px(ctx, xx - 2, yy + 1, 4, 2, '#4cd964', Math.sin(k * Math.PI) * 0.7); }
  }

  private drawStatus(ctx: CanvasRenderingContext2D, e: Extract<CanvasEffect, { kind: 'status' }>, k: number): void {
    ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + k * 2; const r = 6 + k * 16; this.px(ctx, e.x + Math.cos(a) * r - 1, e.y + Math.sin(a) * r - 1, 3, 3, e.color, 1 - k); } ctx.globalCompositeOperation = 'source-over';
  }

  private drawFaint(ctx: CanvasRenderingContext2D, e: Extract<CanvasEffect, { kind: 'faint' }>, k: number): void {
    const ring = 10 + k * 32; ctx.strokeStyle = '#e6edf7'; ctx.lineWidth = 2; ctx.globalAlpha = (1 - k) * 0.36; ctx.beginPath(); ctx.ellipse(e.x, e.y + 10, ring, ring * 0.32, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2 + 0.2; const d = 6 + k * 30; const rise = k * 12 * (0.4 + (i % 3) * 0.2); this.px(ctx, e.x + Math.cos(a) * d - 1, e.y + Math.sin(a) * d - rise - 1, 3, 3, i % 3 === 0 ? '#ffffff' : '#cfcfcf', (1 - k) * 0.9); }
  }

  private drawShield(ctx: CanvasRenderingContext2D, e: Extract<CanvasEffect, { kind: 'shield' }>, k: number): void {
    const img = e.imgName ? getCanvasFxImage(e.imgName) : null, a = Math.sin(k * Math.PI);
    if (img) { const s = 44; ctx.globalAlpha = a; ctx.drawImage(img, e.x - s / 2, e.y - s / 2, s, s); ctx.globalAlpha = 1; return; }
    ctx.strokeStyle = '#9fd6f5'; ctx.globalAlpha = a; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, 22, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
  }

  private drawArrow(ctx: CanvasRenderingContext2D, e: Extract<CanvasEffect, { kind: 'arrow' }>, k: number): void {
    const y = e.y - k * 14; ctx.globalAlpha = k < 0.2 ? k / 0.2 : 1 - (k - 0.7) / 0.3; ctx.fillStyle = e.color; ctx.beginPath(); if (e.up) { ctx.moveTo(e.x, y - 6); ctx.lineTo(e.x - 5, y + 2); ctx.lineTo(e.x + 5, y + 2); } else { ctx.moveTo(e.x, y + 6); ctx.lineTo(e.x - 5, y - 2); ctx.lineTo(e.x + 5, y - 2); } ctx.fill(); ctx.fillRect(e.x - 2, y - 4, 4, 8); ctx.globalAlpha = 1;
  }

  private drawDust(ctx: CanvasRenderingContext2D, e: Extract<CanvasEffect, { kind: 'dust' }>, k: number): void {
    const r = 2 + k * 6; ctx.globalAlpha = (1 - k) * 0.5; ctx.fillStyle = e.color; for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + e.t * 4; ctx.beginPath(); ctx.arc(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r * 0.4, 1.5 + k * 1.5, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1;
  }
}

