import type { BattleState, BattleCombatant, BattleEvent, BattleVfx, PokemonInstance, StatusKind, TypeName, TimedEffect } from '@pokemon-online/shared';
import { BATTLE_GRID, BATTLE_TICK } from '@pokemon-online/shared';
import { SKILL_MAP, NORMAL_ATTACK, ABILITY_MAP, PASSIVE_MAP, getSpecies, typeMultiplier } from '@pokemon-online/config';
import { mulberry32, hashSeed, type RNG } from './rng.ts';
import { computeStats, effectiveStat } from './stats.ts';
import { computeDamage } from './damage.ts';
import { decide, isHardCc } from './ai.ts';
import { rangeInCells, distCells, MELEE_RANGE_CELLS, MOVE_BUFFER, isCellInArena } from './grid.ts';

export interface BattleSimOptions {
  mode: 'pve' | 'pvp';
  player: PokemonInstance[];
  enemy: PokemonInstance[];
  /** simultaneous = all active at once (PVE & PVP both use this now). */
  deployment?: 'sequential' | 'simultaneous';
  /** Player's 3-slot starting formation (阵型). Slot i -> player[i]. Omit for default. */
  formation?: { x: number; y: number }[];
  isWild?: boolean;
  speed?: number;
  seed?: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function dist(a: BattleCombatant, b: BattleCombatant): number {
  return distCells(a.position, b.position);
}

function instanceToCombatant(inst: PokemonInstance, side: 'player' | 'enemy', index: number, total: number, formPos?: { x: number; y: number }): BattleCombatant {
  const species = getSpecies(inst.speciesId);
  const stats = computeStats(inst);
  const cols = BATTLE_GRID.cols;
  const rows = BATTLE_GRID.rows;
  // Player uses the save's formation slot (if valid); otherwise the default
  // left-side spread. Enemy always uses the right-side default spread.
  let gx: number;
  let gy: number;
  if (side === 'player' && formPos && isCellInArena(formPos.x, formPos.y)) {
    gx = formPos.x;
    gy = formPos.y;
  } else {
    gx = side === 'player' ? Math.floor(cols * 0.2) : Math.floor(cols * 0.8);
    gy = clamp(Math.round(rows / 2 + (index - (total - 1) / 2) * 2), 1, rows - 2);
  }
  // Active skills start at a PARTIAL cooldown (40%) rather than ready, so the
  // opening is normal-attack-only and abilities ramp up as their CDs elapse --
  // but they come online fast enough to interleave with normal attacks during
  // the fight (a full starting CD meant short fights never saw skills at all).
  // Normal attack stays ready. "处于CD中" (countdown shows) is preserved.
  const cooldowns: Record<string, number> = {};
  const activeSkills = [...inst.activeSkills];
  for (const sid of activeSkills) {
    const sk = SKILL_MAP[sid];
    if (sk) cooldowns[sid] = sk.cooldown * 0.4;
  }
  // A ranged-type pokemon (owns any ranged skill) also fires its normal attack
  // from range, so it keeps dealing damage while kiting at range -- otherwise a
  // ranged fighter only acts when a skill is off CD and looks idle between CDs.
  // Melee-only pokemon keep the 1.5-cell melee reach. This is the per-combatant
  // "合适施法距离" for the normal attack; skill ranges still come from config.
  const rangedSkills = activeSkills.map((id) => SKILL_MAP[id]).filter((s) => s?.range === 'ranged');
  const normalIsRanged = rangedSkills.length > 0;
  const normalRangeCells = normalIsRanged
    ? Math.max(...rangedSkills.map((s) => rangeInCells(s!)))
    : MELEE_RANGE_CELLS;
  return {
    uid: inst.uid,
    side,
    speciesId: inst.speciesId,
    types: species.types,
    level: inst.level,
    name: inst.nickname || species.name,
    personality: inst.personality,
    ability: inst.ability,
    activeSkills,
    passiveSkills: [...inst.passiveSkills],
    stats,
    maxHp: stats.hp,
    currentHp: inst.currentHp > 0 ? Math.min(inst.currentHp, stats.hp) : stats.hp,
    position: { x: gx, y: gy },
    pixel: { x: gx, y: gy },
    facing: side === 'player' ? 1 : -1,
    cooldowns,
    normalAttackCd: 0,
    normalRangeCells,
    normalIsRanged,
    status: inst.status ?? null,
    statusTimer: 0,
    statStages: { atk: 0, def: 0, spd: 0 },
    shields: 0,
    buffs: [],
    castProgress: null,
    alive: true,
    iv: inst.iv,
    growth: inst.growth,
    currentTargetUid: undefined,
    nextDecisionAt: 0,
    plan: null,
    dotAccumulator: 0,
    flinchUntil: 0,
    moveCd: 0,
  };
}

/**
 * Real-time auto-battle simulator. Both sides are AI-controlled (players train,
 * not operate - frozen design). Deterministic from a seed so a battle can be
 * replayed. The frontend drives `tick(dt)` each animation frame and renders the
 * resulting state.
 */
export class BattleSim {
  state: BattleState;
  rng: RNG;
  deployment: 'sequential' | 'simultaneous';
  playerTeamUids: string[];
  enemyTeamUids: string[];
  playerBench: PokemonInstance[] = [];
  enemyBench: PokemonInstance[] = [];
  private ended = false;
  private seqCounter = 0;

  constructor(opts: BattleSimOptions) {
    const seed = opts.seed ?? hashSeed(opts.player.map((p) => p.uid).join(',') + '|' + opts.enemy.map((p) => p.uid).join(','));
    this.rng = mulberry32(seed);
    this.deployment = opts.deployment ?? 'simultaneous';
    this.playerTeamUids = opts.player.map((p) => p.uid);
    this.enemyTeamUids = opts.enemy.map((p) => p.uid);

    let activePlayer: PokemonInstance[];
    let activeEnemy: PokemonInstance[];
    if (this.deployment === 'sequential') {
      activePlayer = opts.player.slice(0, 1);
      this.playerBench = opts.player.slice(1);
      activeEnemy = opts.enemy.slice(0, 1);
      this.enemyBench = opts.enemy.slice(1);
    } else {
      activePlayer = opts.player;
      activeEnemy = opts.enemy;
      this.playerBench = [];
      this.enemyBench = [];
    }
    const player = activePlayer.map((p, i) => instanceToCombatant(p, 'player', i, activePlayer.length, opts.formation?.[i]));
    const enemy = activeEnemy.map((p, i) => instanceToCombatant(p, 'enemy', i, activeEnemy.length));
    this.state = {
      mode: opts.mode,
      arena: { cols: BATTLE_GRID.cols, rows: BATTLE_GRID.rows },
      combatants: [...player, ...enemy],
      events: [],
      time: 0,
      ended: false,
      tickRate: BATTLE_TICK,
      speedMultiplier: opts.speed ?? 1,
      isWild: opts.isWild ?? false,
    };
    this.applyOnEnter();
    this.emit('info', undefined, undefined, undefined, undefined, `战斗开始！`);
  }

  static fromInstances(opts: BattleSimOptions): BattleSim {
    return new BattleSim(opts);
  }

  get isOver(): boolean {
    return this.state.ended;
  }

  private emit(type: BattleEvent['type'], actor?: string, target?: string, skillId?: string, amount?: number, message?: string, vfx?: BattleVfx): void {
    this.state.events.push({ t: +this.state.time.toFixed(2), seq: ++this.seqCounter, type, actor, target, skillId, amount, message, vfx });
    if (this.state.events.length > 400) this.state.events.splice(0, this.state.events.length - 400);
  }

  private find(uid?: string): BattleCombatant | undefined {
    return this.state.combatants.find((c) => c.uid === uid);
  }

  // ── abilities on battle start / enter ──
  private applyOnEnter(): void {
    for (const c of this.state.combatants) this.applyOnEnterOne(c);
  }

  private applyOnEnterOne(c: BattleCombatant): void {
    const ab = ABILITY_MAP[c.ability];
    if (!ab || ab.trigger !== 'onEnter') return;
    if (ab.effect.kind === 'statBoost' && ab.effect.stat === 'atk' && (ab.effect.stages ?? 0) < 0) {
      // intimidate: lower opponents' atk
      for (const e of this.state.combatants) {
        if (e.side !== c.side && e.alive) {
          e.statStages.atk = clamp(e.statStages.atk + (ab.effect.stages ?? -1), -6, 6);
        }
      }
      this.emit('info', c.uid, undefined, undefined, undefined, `${c.name} 的威吓降低了对手的攻击！`);
    }
  }

  /** Deploy the next benched Pokemon for a side whose active has fainted. */
  private deployNext(side: 'player' | 'enemy'): boolean {
    const bench = side === 'player' ? this.playerBench : this.enemyBench;
    if (bench.length === 0) return false;
    const inst = bench.shift()!;
    const com = instanceToCombatant(inst, side, 0, 1);
    this.state.combatants.push(com);
    this.applyOnEnterOne(com);
    this.emit('enter', com.uid, undefined, undefined, undefined, `${com.name} 上场了！`);
    return true;
  }

  /** After actions, send in benched Pokemon for any side with no active fighter. */
  private handleBenches(): void {
    for (const side of ['player', 'enemy'] as const) {
      const hasAlive = this.state.combatants.some((c) => c.side === side && c.alive);
      if (!hasAlive) this.deployNext(side);
    }
  }

  // ── per-combatant status / regen ticks ──
  private statusTick(c: BattleCombatant, dt: number): void {
    // buff timers
    for (const b of c.buffs) b.remaining -= dt;
    c.buffs = c.buffs.filter((b) => b.remaining > 0);
    // dot from buffs (leech-seed / toxic)
    c.dotAccumulator = (c.dotAccumulator ?? 0) + dt;
    if (c.dotAccumulator >= 1) {
      c.dotAccumulator = 0;
      // poison/burn status dot
      if (c.status === 'poison' || c.status === 'burn') {
        const dmg = Math.max(1, Math.floor(c.maxHp * 0.0625));
        c.currentHp -= dmg;
        this.emit('damage', undefined, c.uid, undefined, dmg, `${c.name} 受到${c.status === 'burn' ? '灼伤' : '中毒'}伤害`, { kind: 'impact', type: c.status === 'burn' ? 'fire' : 'poison', amount: dmg });
      }
      // dot buffs
      for (const b of c.buffs) {
        if (b.kind === 'dot' && b.magnitude) {
          const dmg = Math.max(1, Math.floor(c.maxHp * b.magnitude));
          c.currentHp -= dmg;
          this.emit('damage', undefined, c.uid, undefined, dmg, `${c.name} 受到持续伤害`, { kind: 'impact', amount: dmg });
        }
      }
      if (c.currentHp <= 0) this.faint(c);
    }
    // status timer: all statuses are finite now (control nerf - no permanent
    // burn/poison/paralyze, no random freeze). They all tick down and clear.
    if (c.status && c.statusTimer > 0) {
      c.statusTimer -= dt;
      if (c.statusTimer <= 0) {
        const label: Record<StatusKind, string> = { burn: '灼伤', poison: '中毒', paralyze: '麻痹', freeze: '冰冻', sleep: '睡眠', confuse: '混乱' };
        this.emit('info', c.uid, undefined, undefined, undefined, `${c.name} 从${label[c.status]}中恢复`);
        c.status = null;
      }
    }
  }

  private passiveRegen(c: BattleCombatant, dt: number): void {
    // hpRegen passives & abilities (rain-dish, dry-skin, p-regen)
    let frac = 0;
    for (const pid of c.passiveSkills) {
      const p = PASSIVE_MAP[pid];
      if (p?.effect.kind === 'hpRegen' && p.effect.magnitude) frac += p.effect.magnitude;
    }
    const ab = ABILITY_MAP[c.ability];
    if (ab?.effect.kind === 'hpRegen' && ab.effect.magnitude) frac += ab.effect.magnitude;
    if (frac > 0 && c.alive && c.currentHp > 0) {
      c.currentHp = Math.min(c.maxHp, c.currentHp + c.maxHp * frac * dt);
    }
  }

  private speedBoost(c: BattleCombatant, dt: number): void {
    if (c.ability !== 'speed-boost') return;
    c.speedBoostTimer = (c.speedBoostTimer ?? 0) + dt;
    if (c.speedBoostTimer >= 4) {
      c.speedBoostTimer = 0;
      if (c.statStages.spd < 6) {
        c.statStages.spd += 1;
        this.emit('buff', c.uid, undefined, undefined, undefined, `${c.name} 加速了！`);
      }
    }
  }

  private stepDelay(c: BattleCombatant): number {
    // seconds per grid step; faster Pokemon step sooner
    return clamp(0.28 - effectiveStat(c, 'spd') * 0.0006, 0.12, 0.28);
  }

  private isCellFree(cell: { x: number; y: number }, exceptUid: string): boolean {
    if (!isCellInArena(cell.x, cell.y)) return false; // outside the oval = stands
    return !this.state.combatants.some((o) => o.alive && o.uid !== exceptUid && o.position.x === cell.x && o.position.y === cell.y);
  }

  /** Smooth the render position toward the logical cell center (visual only). */
  private updatePixel(c: BattleCombatant, dt: number): void {
    const k = 1 - Math.exp(-dt * 14);
    c.pixel.x += (c.position.x - c.pixel.x) * k;
    c.pixel.y += (c.position.y - c.pixel.y) * k;
  }

  /** Step one grid cell. Outside the desired band it closes in / kites away;
   *  inside the band it strafes perpendicular to the target (circling), which
   *  produces vertical (up/down) movement instead of a flat left-right march.
   *  No-op while the step cooldown is running. */
  private stepMove(c: BattleCombatant, target: BattleCombatant, desiredRangeCells: number): void {
    c.facing = target.position.x >= c.position.x ? 1 : -1;
    if ((c.moveCd ?? 0) > 0) return;
    const dx = target.position.x - c.position.x;
    const dy = target.position.y - c.position.y;
    const d = Math.hypot(dx, dy);
    const wantKite = desiredRangeCells >= 3; // ranged keep-distance band
    const tooFar = d > desiredRangeCells + MOVE_BUFFER;
    const tooClose = wantKite && d < desiredRangeCells - 1;
    const inBand = !tooFar && !tooClose;

    let bx = 0; let by = 0;
    if (tooFar) { bx = Math.sign(dx); by = Math.sign(dy); }          // close in
    else if (tooClose) { bx = -Math.sign(dx); by = -Math.sign(dy); } // back off
    else {
      // in band: strafe perpendicular to the target line (circle it)
      c.strafeDir = (c.strafeDir ?? 1);
      bx = Math.sign(-dy) * c.strafeDir;
      by = Math.sign(dx) * c.strafeDir;
      c.strafeCount = (c.strafeCount ?? 0) + 1;
      if (c.strafeCount >= 3) { c.strafeCount = 0; c.strafeDir *= -1; } // oscillate -> up/down pacing
    }

    // candidate neighbor cells, king-move preferred (diagonal closes fastest)
    const candidates: { x: number; y: number }[] = [];
    if (bx !== 0 && by !== 0) {
      candidates.push({ x: c.position.x + bx, y: c.position.y + by });
      candidates.push({ x: c.position.x + bx, y: c.position.y });
      candidates.push({ x: c.position.x, y: c.position.y + by });
    } else if (bx !== 0) {
      candidates.push({ x: c.position.x + bx, y: c.position.y });
    } else if (by !== 0) {
      candidates.push({ x: c.position.x, y: c.position.y + by });
    }
    for (const cell of candidates) {
      if (this.isCellFree(cell, c.uid)) {
        c.position.x = cell.x;
        c.position.y = cell.y;
        c.moveCd = this.stepDelay(c);
        return;
      }
    }
    // strafe blocked -> flip and retry once, else drift toward target so we
    // never get stuck motionless (preserves the no-stall invariant).
    if (inBand) {
      c.strafeDir = -((c.strafeDir ?? 1));
      const fx = Math.sign(dx), fy = Math.sign(dy);
      for (const cell of [{ x: c.position.x + fx, y: c.position.y + fy }, { x: c.position.x + fx, y: c.position.y }, { x: c.position.x, y: c.position.y + fy }]) {
        if (this.isCellFree(cell, c.uid)) { c.position.x = cell.x; c.position.y = cell.y; c.moveCd = this.stepDelay(c); return; }
      }
    }
  }

  private startCast(c: BattleCombatant, skillId: string): void {
    const skill = SKILL_MAP[skillId];
    if (!skill) return;
    const cast = skill.castTime ?? 0;
    if (cast > 0) {
      c.castProgress = { skillId, remaining: cast };
      this.emit('skill', c.uid, undefined, skillId, undefined, `${c.name} 开始蓄力 ${skill.name}...`, { kind: 'cast', type: skill.type });
    } else {
      this.resolveSkill(c, skillId);
    }
  }

  /** A windup (castProgress) is interrupted by hard control (flinch/sleep/freeze):
   *  the cast is cancelled, the skill does NOT fire, and the combatant must
   *  re-decide. Emits a "被打断" info so the UI can flash the avatar. */
  private interruptCast(c: BattleCombatant): void {
    if (!c.castProgress) return;
    const skill = SKILL_MAP[c.castProgress.skillId];
    c.castProgress = null;
    c.plan = null;
    c.nextDecisionAt = this.state.time + 0.3;
    this.emit('info', c.uid, undefined, undefined, undefined, `${c.name} 的${skill?.name ?? '蓄力'}被打断！`);
  }

  private inflictStatus(target: BattleCombatant, status: StatusKind, duration: number): void {
    // immunities via ability
    if (status === 'paralyze' && target.ability === 'limber') return;
    if (status === 'poison' && target.ability === 'immunity') return;
    if (target.status) return; // one status at a time
    // All statuses are FINITE now (control nerf): no permanent burn/poison/paralyze.
    // Caller may pass an explicit duration; otherwise use the per-status default.
    const DEFAULT_DUR: Record<StatusKind, number> = { burn: 5, poison: 5, paralyze: 3, freeze: 2.5, sleep: 2, confuse: 2.5 };
    target.status = status;
    target.statusTimer = duration > 0 ? duration : DEFAULT_DUR[status];
    const label: Record<StatusKind, string> = { burn: '灼伤', poison: '中毒', paralyze: '麻痹', freeze: '冰冻', sleep: '睡眠', confuse: '混乱' };
    this.emit('status', undefined, target.uid, undefined, undefined, `${target.name} 陷入了${label[status]}！`, { kind: 'status', status });
  }

  private addStatStage(c: BattleCombatant, stat: 'atk' | 'def' | 'spd', stages: number): void {
    c.statStages[stat] = clamp(c.statStages[stat] + stages, -6, 6);
    const up = stages >= 0;
    this.emit(up ? 'buff' : 'debuff', c.uid, undefined, undefined, undefined, `${c.name} 的${stat === 'atk' ? '攻击' : stat === 'def' ? '防御' : '速度'}${up ? '提升' : '下降'}了！`, { kind: up ? 'buff' : 'debuff' });
  }

  private applyEffect(caster: BattleCombatant, target: BattleCombatant | undefined, skillId: string, damageDealt: number): void {
    const skill = SKILL_MAP[skillId];
    const e = skill?.effect;
    if (!e) return;
    const self = e.target === 'self' ? caster : target;
    switch (e.kind) {
      case 'heal':
        if (self) {
          const amt = Math.floor(self.maxHp * (e.magnitude ?? 0.5));
          self.currentHp = Math.min(self.maxHp, self.currentHp + amt);
          this.emit('heal', self.uid, undefined, undefined, amt, `${self.name} 回复了HP`, { kind: 'heal', amount: amt });
          if (e.status === 'sleep') this.inflictStatus(self, 'sleep', e.duration ?? 2);
        }
        break;
      case 'shield':
        if (self) {
          self.shields += e.magnitude ?? 100;
          self.buffs.push({ id: 'shield_' + Date.now(), kind: 'shield', remaining: e.duration ?? 3, magnitude: e.magnitude });
          this.emit('buff', self.uid, undefined, undefined, undefined, `${self.name} 张开了护盾`, { kind: 'shield' });
        }
        break;
      case 'buff':
        if (self && e.stat) this.addStatStage(self, e.stat as 'atk' | 'def' | 'spd', e.stages ?? 1);
        break;
      case 'debuff':
        if (self && e.stat) this.addStatStage(self, e.stat as 'atk' | 'def' | 'spd', e.stages ?? -1);
        break;
      case 'status':
        if (self && e.status) this.inflictStatus(self, e.status, e.duration ?? 0);
        break;
      case 'dot':
        if (self && e.magnitude) {
          self.buffs.push({ id: 'dot_' + Date.now(), kind: 'dot', remaining: e.duration ?? 6, magnitude: e.magnitude, from: caster.uid });
          this.emit('status', undefined, self.uid, undefined, undefined, `${self.name} 被施加了持续伤害`, { kind: 'status', status: e.status });
        }
        break;
      case 'stun':
        if (self) {
          self.flinchUntil = this.state.time + (e.duration ?? 1);
          self.plan = null;
          self.nextDecisionAt = this.state.time + (e.duration ?? 1);
          this.emit('status', undefined, self.uid, undefined, undefined, `${self.name} 畏缩了`, { kind: 'status', status: 'paralyze' });
        }
        break;
      case 'lifesteal':
        if (damageDealt > 0 && e.magnitude) {
          const heal = Math.floor(damageDealt * e.magnitude);
          caster.currentHp = Math.min(caster.maxHp, caster.currentHp + heal);
          this.emit('heal', caster.uid, undefined, undefined, heal, `${caster.name} 吸取了生命`, { kind: 'heal', amount: heal });
        }
        break;
    }
  }

  private applyOnHitAbilities(attacker: BattleCombatant, defender: BattleCombatant, contact: boolean): void {
    if (!contact) return;
    const ab = ABILITY_MAP[defender.ability];
    if (!ab || ab.trigger !== 'onHit') return;
    const chance = ab.effect.chance ?? 0;
    if (this.rng() > chance) return;
    if (ab.effect.kind === 'custom') {
      if (defender.ability === 'static') this.inflictStatus(attacker, 'paralyze', -1);
      else if (defender.ability === 'flame-body') this.inflictStatus(attacker, 'burn', -1);
      else if (defender.ability === 'poison-point') this.inflictStatus(attacker, 'poison', -1);
    }
  }

  private dealDamage(
    attacker: BattleCombatant,
    defender: BattleCombatant,
    skillId: string,
    areaMultiplier = 1,
    spread?: { targetUids: string[]; hitIndex: number },
  ): { dealt: number; immune: boolean } {
    const skill = SKILL_MAP[skillId] ?? NORMAL_ATTACK;
    const res = computeDamage(attacker, defender, skill, this.rng);
    for (const m of res.log) this.emit('info', attacker.uid, defender.uid, skillId, undefined, m);
    if (res.missed) {
      this.emit('damage', attacker.uid, defender.uid, skillId, 0, undefined, {
        kind: 'miss', type: skill.type, missed: true,
        targetUids: spread?.targetUids,
        hitIndex: spread?.hitIndex,
        hitCount: spread?.targetUids.length,
        secondary: spread ? spread.hitIndex > 0 : undefined,
        impactDelay: spread ? spread.hitIndex * 0.055 : undefined,
      });
      return { dealt: 0, immune: false };
    }
    if (res.immune) {
      if (res.healed && res.healed > 0) {
        defender.currentHp = Math.min(defender.maxHp, defender.currentHp + res.healed);
        this.emit('heal', defender.uid, undefined, undefined, res.healed, `${defender.name} 回复了HP`, { kind: 'heal', amount: res.healed });
      }
      if (defender.ability === 'flash-fire') defender.flashFireBoost = true;
      return { dealt: 0, immune: true };
    }
    let dmg = res.damage;
    // Spread moves trade per-target damage for pressure across the opposing
    // formation. The multiplier is applied before shields, so protection still
    // absorbs the actual incoming hit correctly.
    if (areaMultiplier !== 1) dmg = Math.max(1, Math.floor(dmg * areaMultiplier));
    // Ranged normal attacks fire from a safe distance, so they hit softer than
    // melee normal attacks -- a balance lever so kiting isn't free DPS. Skills
    // (the ranged type's real weapons, with CDs) are unaffected.
    if (skillId === NORMAL_ATTACK.id && attacker.normalIsRanged) {
      dmg = Math.max(1, Math.floor(dmg * 0.8));
    }
    // shield absorb
    if (defender.shields > 0) {
      const absorbed = Math.min(defender.shields, dmg);
      defender.shields -= absorbed;
      dmg -= absorbed;
    }
    defender.currentHp -= dmg;
    const ko = defender.currentHp <= 0;
    this.emit('damage', attacker.uid, defender.uid, skillId, dmg, undefined, {
      kind: 'impact', type: skill.type, amount: dmg,
      crit: res.crit, effectiveness: res.effectiveness, ko,
      targetUids: spread?.targetUids,
      hitIndex: spread?.hitIndex,
      hitCount: spread?.targetUids.length,
      secondary: spread ? spread.hitIndex > 0 : undefined,
      impactDelay: spread ? spread.hitIndex * 0.055 : undefined,
    });
    if (ko) {
      this.faint(defender);
      // moxie
      if (attacker.ability === 'moxie' && attacker.alive) this.addStatStage(attacker, 'atk', 1);
    } else {
      // contact on-hit abilities (a ranged normal attack does not make contact)
      const contact = skillId === NORMAL_ATTACK.id ? !attacker.normalIsRanged : skill.range === 'melee';
      this.applyOnHitAbilities(attacker, defender, contact);
    }
    return { dealt: dmg, immune: false };
  }

  private faint(c: BattleCombatant): void {
    if (!c.alive) return;
    c.alive = false;
    c.currentHp = 0;
    c.status = null;
    c.castProgress = null;
    this.emit('faint', c.uid, undefined, undefined, undefined, `${c.name} 倒下了！`, { kind: 'faint' });
  }

  private resolveSkill(c: BattleCombatant, skillId: string): void {
    const skill = SKILL_MAP[skillId];
    if (!skill) return;
    c.cooldowns[skillId] = skill.cooldown;
    const target = this.find(c.currentTargetUid);
    const targets = skill.targetMode === 'all-enemies'
      ? this.state.combatants.filter((x) => x.side !== c.side && x.alive)
      : target && target.alive ? [target] : [];
    const primary = targets.includes(target as BattleCombatant) ? target : targets[0];
    const targetUids = targets.map((x) => x.uid);

    // Mark every potential victim of a spread hard-CC so allied AI does not
    // pile redundant crowd-control onto the same incoming area cast.
    if (skill.effect?.target === 'enemy' && isHardCc(skill)) {
      for (const victim of targets) victim.ccIncomingUntil = this.state.time + 0.6;
    }
    if (skill.power > 0) {
      if (targets.length === 0 || !primary) return;
      const vfxKind = skill.targetMode === 'all-enemies' ? 'burst' : skill.range === 'ranged' ? 'projectile' : 'melee';
      this.emit('skill', c.uid, primary.uid, skillId, undefined, `${c.name} 使用了 ${skill.name}！`, {
        kind: vfxKind, type: skill.type, targetUids: skill.targetMode === 'all-enemies' ? targetUids : undefined,
      });
      const areaMultiplier = skill.targetMode === 'all-enemies' ? skill.areaMultiplier ?? 0.7 : 1;
      for (let hitIndex = 0; hitIndex < targets.length; hitIndex++) {
        const victim = targets[hitIndex]!;
        const { dealt } = this.dealDamage(c, victim, skillId, areaMultiplier,
          skill.targetMode === 'all-enemies' ? { targetUids, hitIndex } : undefined);
        // Secondary effects roll once per hit target, matching the damage event.
        if (skill.effect && victim.alive) {
          const e = skill.effect;
          if (this.rng() < (e.chance ?? 1)) this.applyEffect(c, e.target === 'self' ? c : victim, skillId, dealt);
        }
      }
    } else {
      // Status / utility skills remain single-target or self-target.
      this.emit('skill', c.uid, target?.uid, skillId, undefined, `${c.name} 使用了 ${skill.name}！`, { kind: 'burst', type: skill.type });
      const e = skill.effect;
      const tgt = e?.target === 'enemy' ? target : c;
      if (e?.target === 'enemy' && tgt) {
        const acc = skill.accuracy === 0 ? 1 : skill.accuracy / 100;
        if (this.rng() > acc) {
          this.emit('info', c.uid, tgt.uid, skillId, undefined, `但是没有命中...`, { kind: 'miss', type: skill.type, missed: true });
          return;
        }
      }
      if (tgt) this.applyEffect(c, e?.target === 'self' ? c : tgt, skillId, 0);
    }
  }

  private normalAttack(c: BattleCombatant, target: BattleCombatant): void {
    c.normalAttackCd = NORMAL_ATTACK.cooldown;
    const ranged = !!c.normalIsRanged;
    this.emit('attack', c.uid, target.uid, NORMAL_ATTACK.id, undefined, `${c.name} 使用了普通攻击！`, { kind: ranged ? 'projectile' : 'melee', type: NORMAL_ATTACK.type });
    this.dealDamage(c, target, NORMAL_ATTACK.id);
  }

  private checkWin(): void {
    if (this.ended) return;
    const playerAlive = this.state.combatants.some((c) => c.side === 'player' && c.alive);
    const enemyAlive = this.state.combatants.some((c) => c.side === 'enemy' && c.alive);
    // a side loses only when it has no alive fighter AND no one left on the bench
    const playerLost = !playerAlive && this.playerBench.length === 0;
    const enemyLost = !enemyAlive && this.enemyBench.length === 0;
    if (playerLost || enemyLost) {
      this.ended = true;
      this.state.ended = true;
      this.state.winner = playerLost && enemyLost ? 'draw' : !enemyLost ? 'enemy' : 'player';
      this.emit('end', undefined, undefined, undefined, undefined, this.state.winner === 'player' ? '你赢了！' : this.state.winner === 'enemy' ? '你输了...' : '平局');
    }
  }

  /** Advance the simulation by dt seconds (already scaled by speed). */
  tick(dt: number): void {
    if (this.ended) return;
    if (dt <= 0) return;
    this.state.time += dt;
    // global cooldown speed-up from passives (灵巧)
    for (const c of this.state.combatants) {
      if (!c.alive) continue;
      let cdr = 1;
      for (const pid of c.passiveSkills) {
        const p = PASSIVE_MAP[pid];
        if (p?.effect.kind === 'cdReduction' && p.effect.mult) cdr *= p.effect.mult;
      }
      for (const id of Object.keys(c.cooldowns)) c.cooldowns[id] = Math.max(0, c.cooldowns[id]! - dt * (2 - cdr));
      c.normalAttackCd = Math.max(0, c.normalAttackCd - dt);
      c.moveCd = Math.max(0, (c.moveCd ?? 0) - dt);
      this.statusTick(c, dt);
      this.passiveRegen(c, dt);
      this.speedBoost(c, dt);
      this.updatePixel(c, dt);
    }
    for (const c of this.state.combatants) {
      if (!c.alive) continue;
      // flinch (畏缩): skips action AND interrupts any in-progress windup
      if (this.state.time < (c.flinchUntil ?? 0)) {
        if (c.castProgress) this.interruptCast(c);
        continue;
      }
      // casting
      if (c.castProgress) {
        // hard control (sleep/freeze) interrupts the windup
        if (c.status === 'sleep' || c.status === 'freeze') {
          this.interruptCast(c);
          continue;
        }
        c.castProgress.remaining -= dt;
        if (c.castProgress.remaining <= 0) {
          const sid = c.castProgress.skillId;
          c.castProgress = null;
          this.resolveSkill(c, sid);
        }
        continue;
      }
      // status that fully blocks action (no roll, just skip every frame)
      if (c.status === 'sleep' || c.status === 'freeze') continue;
      // decision refresh - paralyze/confuse only roll on a decision tick.
      // (Gating here is critical: rolling every frame at 60fps made confuse
      // self-hit ~20x/sec ~= 160% maxHp/sec -> instant suicide. Now ~once per
      // 0.3s, so ~2-3 self-hits over the confuse duration, non-lethal alone.)
      if (this.state.time >= (c.nextDecisionAt ?? 0)) {
        c.nextDecisionAt = this.state.time + 0.3;
        if (c.status === 'paralyze' && this.rng() < 0.25) {
          this.emit('info', c.uid, undefined, undefined, undefined, `${c.name} 因麻痹无法行动`);
          c.plan = null;
          continue;
        }
        if (c.status === 'confuse' && this.rng() < 0.33) {
          // self hit
          const dmg = Math.max(1, Math.floor(c.maxHp * 0.08));
          c.currentHp -= dmg;
          this.emit('damage', c.uid, c.uid, undefined, dmg, `${c.name} 因混乱攻击了自己`, { kind: 'impact', amount: dmg });
          if (c.currentHp <= 0) this.faint(c);
          c.plan = null;
          continue;
        }
        c.plan = decide(c, this.state, this.rng);
        c.currentTargetUid = c.plan?.targetUid;
      }
      if (!c.plan) continue;
      const target = this.find(c.plan.targetUid);
      if (!target || !target.alive) { c.plan = null; continue; }
      // movement (grid step)
      this.stepMove(c, target, c.plan.desiredRangeCells);
      // action
      if (c.plan.preferredSkillId && (c.cooldowns[c.plan.preferredSkillId] ?? 0) <= 0) {
        const skill = SKILL_MAP[c.plan.preferredSkillId];
        if (skill) {
          const selfCast = skill.effect?.target === 'self' || skill.power === 0 && skill.effect?.target !== 'enemy';
          if (selfCast || dist(c, target) <= rangeInCells(skill)) {
            this.startCast(c, c.plan.preferredSkillId);
            c.plan = null;
            continue;
          }
        }
      }
      // normal attack fallback. A ranged-type pokemon fires from range, so it
      // keeps dealing damage while kiting (advancing or backing off) between
      // skill CDs; the range is per-combatant (normalRangeCells). Direction of
      // the preceding stepMove is irrelevant -- in-range => can fire.
      if (dist(c, target) <= (c.normalRangeCells ?? MELEE_RANGE_CELLS) && c.normalAttackCd <= 0) {
        this.normalAttack(c, target);
      }
    }
    this.handleBenches();
    this.checkWin();
  }

  /** Run the entire battle to completion (for quick resolve without rendering). */
  resolve(maxSeconds = 300): void {
    while (!this.ended && this.state.time < maxSeconds) {
      this.tick(BATTLE_TICK * (this.state.speedMultiplier || 1));
    }
    if (!this.ended) {
      // time-out: decide by total HP%
      const ph = this.state.combatants.filter((c) => c.side === 'player').reduce((s, c) => s + c.currentHp / c.maxHp, 0);
      const eh = this.state.combatants.filter((c) => c.side === 'enemy').reduce((s, c) => s + c.currentHp / c.maxHp, 0);
      this.ended = true;
      this.state.ended = true;
      this.state.winner = ph === eh ? 'draw' : ph > eh ? 'player' : 'enemy';
      this.emit('end', undefined, undefined, undefined, undefined, '时间到');
    }
  }
}

void typeMultiplier;
