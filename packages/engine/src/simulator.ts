import type { BattleState, BattleCombatant, BattleEvent, BattleVfx, PokemonInstance, StatusKind, TypeName, TimedEffect, TeamTactic } from '@pokemon-online/shared';
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

// Presentation-paced combat: skills are deliberate beats rather than a constant
// stream. Taking a hit advances only the next skill in line, so reactive casts
// are distributed over time instead of every cooldown becoming ready together.
const SKILL_COOLDOWN_SCALE = 1.35;
const OPENING_SKILL_COOLDOWN_FRACTION = 0.55;
const HIT_CD_RELIEF_MIN = 0.10;
const HIT_CD_RELIEF_MAX = 0.38;

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
  // Active skills start partway through a longer presentation-paced cooldown.
  // The opening still uses normal attacks, then skills arrive as readable beats.
  // Normal attack stays ready. "处于CD中" (countdown shows) is preserved.
  const cooldowns: Record<string, number> = {};
  const activeSkills = [...inst.activeSkills];
  for (const sid of activeSkills) {
    const sk = SKILL_MAP[sid];
    if (sk) cooldowns[sid] = sk.cooldown * SKILL_COOLDOWN_SCALE * OPENING_SKILL_COOLDOWN_FRACTION;
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
    abilityCooldowns: {},
    pressureUntil: 0,
    sturdyUsed: false,
    normalAttackCd: 0,
    normalRangeCells,
    normalIsRanged,
    status: inst.status ?? null,
    statusTimer: 0,
    statStages: { atk: 0, def: 0, spd: 0 },
    shields: 0,
    damageDealt: 0,
    damageTaken: 0,
    normalDamage: 0,
    skillDamage: 0,
    healingDone: 0,
    shieldAbsorbed: 0,
    controlSeconds: 0,
    interrupts: 0,
    knockouts: 0,
    skillCasts: 0,
    normalAttacks: 0,
    hits: 0,
    misses: 0,
    skillStats: {},
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
      teamTactics: {},
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
    } else if (ab.effect.kind === 'cooldownPressure') {
      const until = this.state.time + (ab.effect.duration ?? 8);
      for (const e of this.state.combatants) {
        if (e.side !== c.side && e.alive) e.pressureUntil = Math.max(e.pressureUntil ?? 0, until);
      }
      this.emit('info', c.uid, undefined, undefined, undefined, `${c.name} 的压迫感笼罩战场！`);
    } else if (ab.effect.kind === 'openingSpeed' && ab.effect.stat === 'spd') {
      this.addStatStage(c, 'spd', ab.effect.stages ?? 1);
      c.buffs.push({ id: 'opening-speed', kind: 'opening-speed', stat: 'spd', stages: ab.effect.stages ?? 1, remaining: ab.effect.duration ?? 6 });
      this.emit('info', c.uid, undefined, undefined, undefined, `${c.name} 抢得了先机！`);
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
    // Timed growth effects are intentionally battle-local. A growth skill
    // creates a short “training window” that raises a stat at fixed intervals;
    // its earned stages remain until the battle ends, while the window itself
    // expires normally. Recasting refreshes the window instead of duplicating it.
    for (const b of c.buffs) {
      if (b.kind === 'ramp' && b.stat && b.stages) {
        b.elapsed = (b.elapsed ?? 0) + dt;
        const interval = b.interval ?? 5;
        while (b.elapsed >= interval && b.remaining > 0) {
          b.elapsed -= interval;
          this.addStatStage(c, b.stat as 'atk' | 'def' | 'spd', b.stages);
        }
      }
      b.remaining -= dt;
      if (b.kind === 'shield' && b.remaining <= 0 && b.magnitude) {
        c.shields = Math.max(0, c.shields - b.magnitude);
      }
      if (b.kind === 'opening-speed' && b.remaining <= 0 && b.stat && b.stages) {
        this.addStatStage(c, b.stat as 'atk' | 'def' | 'spd', -b.stages);
        this.emit('info', c.uid, undefined, undefined, undefined, `${c.name} 的先机节奏平复了。`);
      }
    }
    c.buffs = c.buffs.filter((b) => b.remaining > 0);
    // dot from buffs (leech-seed / toxic)
    c.dotAccumulator = (c.dotAccumulator ?? 0) + dt;
    if (c.dotAccumulator >= 1) {
      c.dotAccumulator = 0;
      const immuneIndirect = ABILITY_MAP[c.ability]?.effect.kind === 'indirectImmunity';
      // poison/burn status dot
      if (!immuneIndirect && (c.status === 'poison' || c.status === 'burn')) {
        const dmg = Math.max(1, Math.floor(c.maxHp * 0.0625));
        c.currentHp -= dmg;
        this.emit('damage', undefined, c.uid, undefined, dmg, `${c.name} 受到${c.status === 'burn' ? '灼伤' : '中毒'}伤害`, { kind: 'impact', type: c.status === 'burn' ? 'fire' : 'poison', amount: dmg });
      }
      // dot buffs
      if (!immuneIndirect) for (const b of c.buffs) {
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
        const ab = ABILITY_MAP[c.ability];
        if (ab?.effect.kind === 'statusRecovery') {
          const cds = c.abilityCooldowns ??= {};
          if ((cds['natural-cure'] ?? 0) <= 0) {
            const healed = Math.max(0, Math.min(Math.floor(c.maxHp * (ab.effect.magnitude ?? 0.12)), c.maxHp - c.currentHp));
            c.currentHp += healed;
            c.healingDone += healed;
            cds['natural-cure'] = ab.effect.cooldown ?? 8;
            this.emit('heal', c.uid, c.uid, undefined, healed, `${c.name} 的自然回复恢复了HP！`, { kind: 'heal', amount: healed });
          }
        }
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

  /** Smooth the render position toward the logical cell center (visual only).
   * A slightly longer easing window avoids units looking as if they blink between
   * adjacent cells when several fighters reposition at once. */
  private updatePixel(c: BattleCombatant, dt: number): void {
    const k = 1 - Math.exp(-dt * 9);
    c.pixel.x += (c.position.x - c.pixel.x) * k;
    c.pixel.y += (c.position.y - c.pixel.y) * k;
  }

  /** Step one grid cell only when a fighter must close distance or a ranged
   * fighter must retreat. Holding an effective range is intentionally stable:
   * constant strafing in a 3v3 made the field read as jittery rather than tactical. */
  private stepMove(c: BattleCombatant, target: BattleCombatant, desiredRangeCells: number): void {
    const plan = c.plan;
    const movementTarget = plan?.movementTargetUid ? this.find(plan.movementTargetUid) ?? target : target;
    const coverAlly = plan?.coverAllyUid ? this.find(plan.coverAllyUid) : undefined;
    const protectAlly = plan?.protectAllyUid ? this.find(plan.protectAllyUid) : undefined;
    c.facing = target.position.x >= c.position.x ? 1 : -1;
    if ((c.moveCd ?? 0) > 0) return;

    // A frontline protector moves to the segment between a threatened ally and
    // the hostile caster, while still keeping the action target in front of it.
    if (plan?.positioning === 'frontline' && protectAlly?.alive) {
      const blocker = {
        x: Math.round((protectAlly.position.x + target.position.x) / 2),
        y: Math.round((protectAlly.position.y + target.position.y) / 2),
      };
      if (this.tryStepToward(c, blocker, false)) return;
    }

    // Backliners use a durable ally as cover: when they drift in front of that
    // ally, take a step back toward their own deployment side before resuming
    // normal range logic. This turns protection into readable body-blocking.
    if (plan?.positioning === 'backline' && coverAlly?.alive && this.isAheadOf(c, coverAlly)) {
      if (this.tryStepToward(c, { x: c.position.x - c.facing, y: c.position.y }, false)) return;
    }

    const dx = movementTarget.position.x - c.position.x;
    const dy = movementTarget.position.y - c.position.y;
    const d = Math.hypot(dx, dy);
    const wantKite = desiredRangeCells >= 3;
    const tooFar = d > desiredRangeCells + MOVE_BUFFER;
    const tooClose = wantKite && d < desiredRangeCells - 1;
    // In a valid attack band, stand your ground. Skill casts and local VFX are
    // easier to read when the whole squad does not orbit every decision cycle.
    if (!tooFar && !tooClose) return;
    this.tryStepToward(c, movementTarget.position, tooClose);
  }

  /** Is a combatant closer to the enemy side than its intended cover ally? */
  private isAheadOf(c: BattleCombatant, cover: BattleCombatant): boolean {
    return c.side === 'player' ? c.position.x > cover.position.x : c.position.x < cover.position.x;
  }

  /** Take one deterministic lane-aware step toward a point, or away when retreating. */
  private tryStepToward(c: BattleCombatant, point: { x: number; y: number }, retreat: boolean): boolean {
    const dx = point.x - c.position.x;
    const dy = point.y - c.position.y;
    const bx = (retreat ? -1 : 1) * Math.sign(dx);
    const by = (retreat ? -1 : 1) * Math.sign(dy);
    if (bx === 0 && by === 0) return false;
    // Deterministic per-unit lane preference: direct approach first, then step
    // around a teammate instead of waiting behind it and forming a static pile.
    const lane = (c.uid.charCodeAt(c.uid.length - 1) & 1) === 0 ? 1 : -1;
    const candidates: { x: number; y: number }[] = [];
    const add = (x: number, y: number) => {
      if (!candidates.some((cell) => cell.x === x && cell.y === y)) candidates.push({ x, y });
    };
    if (bx !== 0 && by !== 0) {
      add(c.position.x + bx, c.position.y + by);
      add(c.position.x + bx, c.position.y);
      add(c.position.x, c.position.y + by);
    } else if (bx !== 0) {
      add(c.position.x + bx, c.position.y);
      add(c.position.x + bx, c.position.y + lane);
      add(c.position.x + bx, c.position.y - lane);
      add(c.position.x, c.position.y + lane);
      add(c.position.x, c.position.y - lane);
    } else {
      add(c.position.x, c.position.y + by);
      add(c.position.x + lane, c.position.y + by);
      add(c.position.x - lane, c.position.y + by);
      add(c.position.x + lane, c.position.y);
      add(c.position.x - lane, c.position.y);
    }
    for (const cell of candidates) {
      if (this.isCellFree(cell, c.uid)) {
        c.position.x = cell.x;
        c.position.y = cell.y;
        c.moveCd = this.stepDelay(c);
        return true;
      }
    }
    return false;
  }

  private startCast(c: BattleCombatant, skillId: string): void {
    const skill = SKILL_MAP[skillId];
    if (!skill) return;
    const cast = skill.castTime ?? 0;
    if (cast > 0) {
      // A windup commits the combatant to its current cell. Snapping the visual
      // position here also prevents it from gliding after the cast bar appears.
      c.pixel.x = c.position.x;
      c.pixel.y = c.position.y;
      c.plan = null;
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

  private inflictStatus(target: BattleCombatant, status: StatusKind, duration: number, source?: BattleCombatant): boolean {
    // immunities via ability
    if (status === 'paralyze' && target.ability === 'limber') return false;
    if (status === 'poison' && target.ability === 'immunity') return false;
    if (target.status) return false; // one status at a time
    // All statuses are FINITE now (control nerf): no permanent burn/poison/paralyze.
    // Caller may pass an explicit duration; otherwise use the per-status default.
    const DEFAULT_DUR: Record<StatusKind, number> = { burn: 5, poison: 5, paralyze: 3, freeze: 2.5, sleep: 2, confuse: 2.5 };
    const appliedDuration = duration > 0 ? duration : DEFAULT_DUR[status];
    target.status = status;
    target.statusTimer = appliedDuration;
    if (source && source.uid !== target.uid && ['paralyze', 'freeze', 'sleep', 'confuse'].includes(status)) source.controlSeconds += appliedDuration;
    const label: Record<StatusKind, string> = { burn: '灼伤', poison: '中毒', paralyze: '麻痹', freeze: '冰冻', sleep: '睡眠', confuse: '混乱' };
    this.emit('status', source?.uid, target.uid, undefined, undefined, `${target.name} 陷入了${label[status]}！`, { kind: 'status', status });
    if (source && source.uid !== target.uid && ABILITY_MAP[target.ability]?.effect.kind === 'statusReflect') {
      const reflectKey = `synchronize_${source.uid}`;
      const cds = target.abilityCooldowns ??= {};
      if ((cds[reflectKey] ?? 0) <= 0 && !source.status) {
        cds[reflectKey] = 9999;
        if (this.inflictStatus(source, status, appliedDuration, target)) {
          this.emit('info', target.uid, source.uid, undefined, undefined, `${target.name} 的同步反射了异常！`);
        }
      }
    }
    return true;
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
          const requested = Math.floor(self.maxHp * (e.magnitude ?? 0.5));
          const amt = Math.max(0, Math.min(requested, self.maxHp - self.currentHp));
          self.currentHp += amt;
          caster.healingDone += amt;
          this.emit('heal', caster.uid, self.uid, undefined, amt, `${self.name} 回复了HP`, { kind: 'heal', amount: amt });
          if (e.status === 'sleep') this.inflictStatus(self, 'sleep', e.duration ?? 2, caster);
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
        if (self && e.status) {
          const wasCasting = !!self.castProgress;
          const applied = this.inflictStatus(self, e.status, e.duration ?? 0, caster);
          if (applied && wasCasting && ['sleep', 'freeze'].includes(e.status)) caster.interrupts += 1;
        }
        break;
      case 'dot':
        if (self && e.magnitude) {
          self.buffs.push({ id: 'dot_' + Date.now(), kind: 'dot', remaining: e.duration ?? 6, magnitude: e.magnitude, from: caster.uid });
          this.emit('status', undefined, self.uid, undefined, undefined, `${self.name} 被施加了持续伤害`, { kind: 'status', status: e.status });
        }
        break;
      case 'ramp':
        if (self && e.stat && e.stages) {
          // One active ramp per move prevents a short cooldown from creating
          // overlapping timers; a new cast starts a fresh growth window.
          self.buffs = self.buffs.filter((b) => b.id !== `ramp_${skillId}`);
          self.buffs.push({
            id: `ramp_${skillId}`,
            kind: 'ramp',
            stat: e.stat,
            stages: e.stages,
            remaining: e.duration ?? 15,
            interval: e.interval ?? 5,
            elapsed: 0,
          });
          this.emit('buff', self.uid, undefined, skillId, undefined, `${self.name} 进入了成长节奏`, { kind: 'buff' });
        }
        break;
      case 'stun':
        if (self) {
          if (ABILITY_MAP[self.ability]?.effect.kind === 'flinchImmunity') {
            this.emit('info', self.uid, undefined, skillId, undefined, `${self.name} 的精神力稳住了心神！`);
            break;
          }
          if (self.castProgress) caster.interrupts += 1;
          self.flinchUntil = this.state.time + (e.duration ?? 1);
          self.plan = null;
          self.nextDecisionAt = this.state.time + (e.duration ?? 1);
          if (self.uid !== caster.uid) caster.controlSeconds += e.duration ?? 1;
          this.emit('status', undefined, self.uid, undefined, undefined, `${self.name} 畏缩了`, { kind: 'status', status: 'paralyze' });
        }
        break;
      case 'lifesteal':
        if (damageDealt > 0 && e.magnitude) {
          const requested = Math.floor(damageDealt * e.magnitude);
          const heal = Math.max(0, Math.min(requested, caster.maxHp - caster.currentHp));
          caster.currentHp += heal;
          caster.healingDone += heal;
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
      if (defender.ability === 'static') this.inflictStatus(attacker, 'paralyze', -1, defender);
      else if (defender.ability === 'flame-body') this.inflictStatus(attacker, 'burn', -1, defender);
      else if (defender.ability === 'poison-point') this.inflictStatus(attacker, 'poison', -1, defender);
    }
  }

  /** Damage advances only the currently nearest-ready active skill. This gives a
   * defender a reactive answer without synchronizing every skill cooldown into
   * one noisy burst. */
  private recoverCooldownFromHit(c: BattleCombatant, damage: number): void {
    const next = Object.entries(c.cooldowns)
      .filter(([, cd]) => cd > 0.04)
      .sort((a, b) => a[1] - b[1])[0];
    if (!next) return;
    const relief = clamp(HIT_CD_RELIEF_MIN + (damage / Math.max(1, c.maxHp)) * 0.9, HIT_CD_RELIEF_MIN, HIT_CD_RELIEF_MAX);
    c.cooldowns[next[0]] = Math.max(0, next[1] - relief);
  }

  private skillRecap(c: BattleCombatant, skillId: string): { casts: number; hits: number; misses: number; damage: number } {
    return (c.skillStats[skillId] ??= { casts: 0, hits: 0, misses: 0, damage: 0 });
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
      attacker.misses += 1;
      this.skillRecap(attacker, skillId).misses += 1;
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
        const healed = Math.max(0, Math.min(res.healed, defender.maxHp - defender.currentHp));
        defender.currentHp += healed;
        defender.healingDone += healed;
        this.emit('heal', defender.uid, undefined, undefined, healed, `${defender.name} 回复了HP`, { kind: 'heal', amount: healed });
      }
      if (defender.ability === 'flash-fire') defender.flashFireBoost = true;
      return { dealt: 0, immune: true };
    }
    attacker.hits += 1;
    this.skillRecap(attacker, skillId).hits += 1;
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
    const shieldBefore = defender.shields;
    if (defender.shields > 0) {
      const absorbed = Math.min(defender.shields, dmg);
      defender.shields -= absorbed;
      defender.shieldAbsorbed += absorbed;
      dmg -= absorbed;
    }
    const defenderAbilityBeforeHit = ABILITY_MAP[defender.ability];
    if (shieldBefore > 0 && defender.shields <= 0 && defenderAbilityBeforeHit?.effect.kind === 'shieldRecovery') {
      const cds = defender.abilityCooldowns ??= {};
      if ((cds['shield-recovery'] ?? 0) <= 0) {
        const healed = Math.max(0, Math.min(Math.floor(defender.maxHp * (defenderAbilityBeforeHit.effect.magnitude ?? 0.06)), defender.maxHp - defender.currentHp));
        defender.currentHp += healed;
        defender.healingDone += healed;
        cds['shield-recovery'] = defenderAbilityBeforeHit.effect.cooldown ?? 6;
        this.emit('heal', defender.uid, defender.uid, undefined, healed, `${defender.name} 的余韧恢复了HP！`, { kind: 'heal', amount: healed });
      }
    }
    const sturdy = ABILITY_MAP[defender.ability]?.effect.kind === 'endure';
    if (sturdy && !defender.sturdyUsed && defender.currentHp >= defender.maxHp && dmg >= defender.currentHp) {
      dmg = Math.max(0, defender.currentHp - 1);
      defender.sturdyUsed = true;
      this.emit('info', defender.uid, undefined, undefined, undefined, `${defender.name} 的结实撑住了！`);
    }
    defender.currentHp -= dmg;
    const defenderAbility = ABILITY_MAP[defender.ability];
    if (dmg > 0 && defenderAbility?.effect.kind === 'counterInstinct' && (skill.power >= 85 || (skill.castTime ?? 0) > 0)) {
      const cds = defender.abilityCooldowns ??= {};
      if ((cds['counter-instinct'] ?? 0) <= 0) {
        defender.counterInstinctUntil = this.state.time + (defenderAbility.effect.duration ?? 8);
        cds['counter-instinct'] = defenderAbility.effect.cooldown ?? 5;
        this.emit('info', defender.uid, attacker.uid, skillId, undefined, `${defender.name} 激起了反制本能！`);
      }
    }
    if (dmg > 0 && defenderAbility?.effect.kind === 'lowHpDefense' && defender.currentHp / defender.maxHp <= (defenderAbility.effect.magnitude ?? 0.35)) {
      const cds = defender.abilityCooldowns ??= {};
      if ((cds['low-hp-defense'] ?? 0) <= 0) {
        cds['low-hp-defense'] = 9999;
        this.addStatStage(defender, 'def', defenderAbility.effect.stages ?? 1);
        this.emit('info', defender.uid, undefined, undefined, undefined, `${defender.name} 临危不乱，防御提升了！`);
      }
    }
    // Track real HP damage on the combatant itself so the post-battle report
    // remains complete even when the presentation event log is trimmed.
    attacker.damageDealt += dmg;
    this.skillRecap(attacker, skillId).damage += dmg;
    defender.damageTaken += dmg;
    if (skillId === NORMAL_ATTACK.id) attacker.normalDamage += dmg;
    else attacker.skillDamage += dmg;
    const ko = defender.currentHp <= 0;
    if (!ko && dmg > 0) this.recoverCooldownFromHit(defender, dmg);
    this.emit('damage', attacker.uid, defender.uid, skillId, dmg, undefined, {
      kind: 'impact', type: skill.type, amount: dmg,
      crit: res.crit, effectiveness: res.effectiveness, ko,
      targetUids: spread?.targetUids,
      hitIndex: spread?.hitIndex,
      hitCount: spread?.targetUids.length,
      secondary: spread ? spread.hitIndex > 0 : undefined,
      impactDelay: spread ? spread.hitIndex * 0.055 : undefined,
    });
    const attackerAbility = ABILITY_MAP[attacker.ability];
    if (skillId !== NORMAL_ATTACK.id && skill.range === 'melee' && attackerAbility?.effect.kind === 'contactShield' && dmg > 0) {
      const cds = attacker.abilityCooldowns ??= {};
      if ((cds['rock-head'] ?? 0) <= 0) {
        const shield = Math.floor(attacker.maxHp * (attackerAbility.effect.magnitude ?? 0.04));
        attacker.shields += shield;
        attacker.buffs.push({ id: 'rock-head_' + Date.now(), kind: 'shield', remaining: attackerAbility.effect.duration ?? 2.5, magnitude: shield });
        cds['rock-head'] = attackerAbility.effect.cooldown ?? 4;
        this.emit('buff', attacker.uid, undefined, undefined, undefined, `${attacker.name} 的坚硬脑袋形成了护盾！`, { kind: 'shield' });
      }
    }
    const attackerAbilityForRhythm = ABILITY_MAP[attacker.ability];
    if (skillId !== NORMAL_ATTACK.id && dmg > 0 && attackerAbilityForRhythm?.effect.kind === 'cooldownRhythm') {
      const cds = attacker.abilityCooldowns ??= {};
      if ((cds['cooldown-rhythm'] ?? 0) <= 0) {
        const next = Object.entries(attacker.cooldowns)
          .filter(([id, cd]) => id !== skillId && cd > 0.04)
          .sort((a, b) => a[1] - b[1])[0];
        if (next) {
          attacker.cooldowns[next[0]] = Math.max(0, next[1] - (attackerAbilityForRhythm.effect.magnitude ?? 0.35));
          this.emit('info', attacker.uid, undefined, skillId, undefined, `${attacker.name} 把握住了战斗节奏！`);
        }
        cds['cooldown-rhythm'] = attackerAbilityForRhythm.effect.cooldown ?? 3;
      }
    }
    if (skillId !== NORMAL_ATTACK.id && (attacker.counterInstinctUntil ?? 0) > this.state.time && dmg > 0) {
      attacker.counterInstinctUntil = 0;
      this.emit('info', attacker.uid, undefined, skillId, undefined, `${attacker.name} 释放了反制本能！`);
    }
    if (ko) {
      attacker.knockouts += 1;
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
    c.skillCasts += 1;
    this.skillRecap(c, skillId).casts += 1;
    c.cooldowns[skillId] = skill.cooldown * SKILL_COOLDOWN_SCALE;
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
          const ability = ABILITY_MAP[c.ability];
          const secondaryChance = ability?.effect.kind === 'secondaryBoost'
            ? Math.min(ability.effect.magnitude ?? 0.7, (e.chance ?? 1) * (ability.effect.mult ?? 1.75))
            : e.chance ?? 1;
          if (this.rng() < secondaryChance) this.applyEffect(c, e.target === 'self' ? c : victim, skillId, dealt);
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
          c.misses += 1;
          this.skillRecap(c, skillId).misses += 1;
          this.emit('info', c.uid, tgt.uid, skillId, undefined, `但是没有命中...`, { kind: 'miss', type: skill.type, missed: true });
          return;
        }
      }
      if (tgt) {
        c.hits += 1;
        this.skillRecap(c, skillId).hits += 1;
        this.applyEffect(c, e?.target === 'self' ? c : tgt, skillId, 0);
      }
    }
  }

  private normalAttack(c: BattleCombatant, target: BattleCombatant): void {
    c.normalAttacks += 1;
    this.skillRecap(c, NORMAL_ATTACK.id).casts += 1;
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

/** Recompute each side's shared tactical intention before individual decisions.
   * The intent is deliberately short-lived: hard interrupts and executes override
   * it per Pokemon, while ordinary turns coordinate around a readable team plan. */
  private refreshTeamTactics(): void {
    const now = this.state.time;
    for (const side of ['player', 'enemy'] as const) {
      const allies = this.state.combatants.filter((c) => c.side === side && c.alive);
      const opponents = this.state.combatants.filter((c) => c.side !== side && c.alive);
      if (allies.length === 0 || opponents.length === 0) {
        delete this.state.teamTactics[side];
        continue;
      }
      const active = this.state.teamTactics[side];
      if (active && active.expiresAt > now && (!active.targetUid || opponents.some((c) => c.uid === active.targetUid))) continue;

      const threatenedAlly = allies
        .filter((ally) => opponents.some((enemy) => enemy.currentTargetUid === ally.uid && enemy.castProgress && (SKILL_MAP[enemy.castProgress.skillId]?.power ?? 0) >= 80))
        .sort((a, b) => a.currentHp / a.maxHp - b.currentHp / b.maxHp)[0];
      if (threatenedAlly) {
        const caster = opponents
          .filter((enemy) => enemy.currentTargetUid === threatenedAlly.uid && enemy.castProgress && (SKILL_MAP[enemy.castProgress.skillId]?.power ?? 0) >= 80)
          .sort((a, b) => (SKILL_MAP[b.castProgress!.skillId]?.power ?? 0) - (SKILL_MAP[a.castProgress!.skillId]?.power ?? 0))[0];
        const tactic: TeamTactic = { kind: 'protect', targetUid: caster?.uid, protectUid: threatenedAlly.uid, expiresAt: now + 0.45 };
        this.state.teamTactics[side] = tactic;
        continue;
      }

      const finishTarget = opponents
        .filter((enemy) => enemy.currentHp / enemy.maxHp <= 0.3)
        .sort((a, b) => a.currentHp / a.maxHp - b.currentHp / b.maxHp)[0];
      if (finishTarget) {
        this.state.teamTactics[side] = { kind: 'finish', targetUid: finishTarget.uid, expiresAt: now + 0.6 };
        continue;
      }

      if (allies.length >= 2 && opponents.length >= 2) {
        const pressureTarget = opponents.reduce((best, enemy) => {
          const score = effectiveStat(enemy, 'atk') * (0.7 + enemy.currentHp / enemy.maxHp);
          const bestScore = effectiveStat(best, 'atk') * (0.7 + best.currentHp / best.maxHp);
          return score > bestScore ? enemy : best;
        });
        this.state.teamTactics[side] = { kind: 'pressure', targetUid: pressureTarget.uid, expiresAt: now + 0.75 };
      } else {
        this.state.teamTactics[side] = { kind: 'split', expiresAt: now + 0.75 };
      }
    }
  }
  /** Advance the simulation by dt seconds (already scaled by speed). */
  tick(dt: number): void {
    if (this.ended) return;
    if (dt <= 0) return;
    this.state.time += dt;
    this.refreshTeamTactics();
    // global cooldown speed-up from passives (灵巧)
    for (const c of this.state.combatants) {
      if (!c.alive) continue;
      let cdr = 1;
      for (const pid of c.passiveSkills) {
        const p = PASSIVE_MAP[pid];
        if (p?.effect.kind === 'cdReduction' && p.effect.mult) cdr *= p.effect.mult;
      }
      const pressured = (c.pressureUntil ?? 0) > this.state.time;
      const pressureMult = pressured ? 0.85 : 1;
      for (const id of Object.keys(c.cooldowns)) c.cooldowns[id] = Math.max(0, c.cooldowns[id]! - dt * (2 - cdr) * pressureMult);
      for (const id of Object.keys(c.abilityCooldowns ?? {})) c.abilityCooldowns![id] = Math.max(0, c.abilityCooldowns![id]! - dt);
      c.normalAttackCd = Math.max(0, c.normalAttackCd - dt);
      c.moveCd = Math.max(0, (c.moveCd ?? 0) - dt);
      this.statusTick(c, dt);
      if ((c.counterInstinctUntil ?? 0) <= this.state.time) c.counterInstinctUntil = 0;
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
          const dmg = ABILITY_MAP[c.ability]?.effect.kind === 'indirectImmunity' ? 0 : Math.max(1, Math.floor(c.maxHp * 0.08));
          if (dmg > 0) {
            c.currentHp -= dmg;
            this.emit('damage', c.uid, c.uid, undefined, dmg, `${c.name} 因混乱攻击了自己`, { kind: 'impact', amount: dmg });
          } else {
            this.emit('info', c.uid, undefined, undefined, undefined, `${c.name} 的魔法防守抵消了混乱伤害！`);
          }
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
