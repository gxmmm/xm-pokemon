import { skillHitChance, secondaryEffectChance, basicTempoMultiplier } from './combat-modifiers.ts';
import type { WeatherKind } from '@pokemon-online/shared';
import { BATTLE_WEATHER, BATTLE_WEATHER_DURATION, TACTICAL_COOLDOWN_SCALE } from '@pokemon-online/config';
import { BattleEvasion } from './evasion.ts';
import type { BattleState, BattleCombatant, BattleEvent, BattleVfx, PokemonInstance, StatusKind, TeamTactic } from '@pokemon-online/shared';
import { BATTLE_GRID, BATTLE_TICK } from '@pokemon-online/shared';
import { SKILL_MAP, ABILITY_MAP, PASSIVE_MAP, getSpecies, typeMultiplier, RANGED_ENGAGEMENT_CELLS, BATTLE_MOVEMENT, battleActionTiming, actionGapForSpeed, skillCooldownRate } from '@pokemon-online/config';
import { mulberry32, hashSeed, type RNG } from './rng.ts';
import { computeStats, effectiveStat } from './stats.ts';
import { tacticalSkillsForInstance } from './instance.ts';
import { computeDamage } from './damage.ts';
import { clampCombatAmount, roundCombatAmount } from './combat-numbers.ts';
import { skillVictims } from './skill-space.ts';
import { decide, isHardCc } from './ai.ts';
import { rangeInCells, distCells, MELEE_RANGE_CELLS, MOVE_BUFFER, isCellInArena, travelPathDistance, findGridApproachStep } from './grid.ts';

export interface BattleSimOptions {
  weather?: WeatherKind;
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

// Presentation-paced combat: skills are deliberate beats rather than a constant
// stream. Taking a hit advances only the next skill in line, so reactive casts
// are distributed over time instead of every cooldown becoming ready together.
const SKILL_COOLDOWN_SCALE = TACTICAL_COOLDOWN_SCALE;
const OPENING_SKILL_COOLDOWN_FRACTION = 0.55;
const STATUS_DURATION: Record<StatusKind, number> = { burn: 5, poison: 5, paralyze: 3, freeze: 2.5, sleep: 2, confuse: 2.5 };

/** Seconds per grid cell from the effective speed stat. The expanded curve
 * makes a 15-speed heavy model visibly lumber (0.32s) while a 150-speed model
 * crosses cells in 0.14s; buffs can reach, but never exceed, a 0.10s floor. */
export function movementStepIntervalForSpeed(speed: number): number {
  return Math.round(clamp(0.34 - Math.max(0, speed) * 0.00135, 0.10, 0.34) * 100) / 100;
}
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
    gx = side === 'player' ? Math.floor(cols * 0.25) : cols - 1 - Math.floor(cols * 0.25);
    gy = clamp(Math.round(rows / 2 + (index - (total - 1) / 2) * BATTLE_MOVEMENT.allyDestinationClearance), 1, rows - 2);
  }
  // Active skills start partway through a longer presentation-paced cooldown.
  // The basic move starts ready; tactical moves arrive as readable beats.
  const cooldowns: Record<string, number> = {};
  const activeSkills = [...new Set([species.basicSkillId, ...tacticalSkillsForInstance(inst)])];
  for (const sid of activeSkills) {
    const sk = SKILL_MAP[sid];
    if (sk) cooldowns[sid] = sk.cooldown * SKILL_COOLDOWN_SCALE * OPENING_SKILL_COOLDOWN_FRACTION;
  }
  cooldowns[species.basicSkillId] = 0;
  // Combat delivery is fixed on the Species record. A newly caught or
  // bred model keeps its own reach even when its temporary active skill loadout
  // changes; active skills retain their independently configured ranges.
  const rangedRole = species.combatDelivery === 'ranged' || SKILL_MAP[species.basicSkillId]!.effect?.target === 'ally';
  const engagementRangeCells = rangedRole ? RANGED_ENGAGEMENT_CELLS : MELEE_RANGE_CELLS;
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
    basicSkillId: species.basicSkillId,
    cooldownRates: {},
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
    regenAccumulator: 0,
    engagementRangeCells,
    rangedRole,
    status: inst.status ?? null,
    statusTimer: inst.status ? STATUS_DURATION[inst.status] : 0,
    statStages: { atk: 0, def: 0, spd: 0 },
    shields: 0,
    damageDealt: 0,
    damageTaken: 0,
    basicDamage: 0,
    skillDamage: 0,
    healingDone: 0,
    shieldAbsorbed: 0,
    controlSeconds: 0,
    interrupts: 0,
    knockouts: 0,
    skillCasts: 0,
    basicCasts: 0,
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
  private effectSequence = 0;
  private readonly evasion = new BattleEvasion();
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
    if (opts.weather) this.setWeather(opts.weather, '遭遇天气');
    this.applyOnEnter();
    this.refreshWeather();
    this.emit('info', undefined, undefined, undefined, undefined, `战斗开始！`);
  }

  static fromInstances(opts: BattleSimOptions): BattleSim {
    return new BattleSim(opts);
  }

  get isOver(): boolean {
    return this.state.ended;
  }

  private emit(type: BattleEvent['type'], actor?: string, target?: string, skillId?: string, amount?: number, message?: string, vfx?: BattleVfx): void {
    const subject = type === 'damage' ? this.find(target) : type === 'heal' || type === 'faint' ? this.find(target ?? actor) : undefined;
    const health = subject ? { uid: subject.uid, currentHp: subject.currentHp, alive: subject.alive, at: this.state.time } : undefined;
    const controlled = type === 'status' ? this.find(target) : vfx?.kind === 'interrupt' ? this.find(actor) : undefined;
    const control = controlled ? { uid: controlled.uid, at: this.state.time, status: controlled.status, statusTimer: controlled.statusTimer,
      flinchUntil: controlled.flinchUntil ?? 0, ...(vfx?.kind === 'interrupt' ? { castProgress: null } : {}) } : undefined;
    this.state.events.push({ t: +this.state.time.toFixed(2), seq: ++this.seqCounter, type, actor, target, skillId, amount, message, vfx, health, control });
    if (this.state.events.length > 400) this.state.events.splice(0, this.state.events.length - 400);
    if (!vfx?.notice && (type === 'status' || type === 'damage' || type === 'heal' || type === 'faint')) this.refreshWeather();
  }

  private readonly conditionLabels = new Map<string, string>();
  private readonly weatherLoss = new Map<string, number>();
  setWeather(kind: WeatherKind, source = '天气变化', duration = BATTLE_WEATHER_DURATION): void {
    if (this.ended) return;
    this.state.weather = { kind, source, remaining: Math.max(0, duration), suppressed: false };
    this.refreshWeather();
    this.emit('info', undefined, undefined, undefined, undefined, `${source}：${BATTLE_WEATHER[kind].name}`);
  }

  private refreshWeather(): void {
    const weather = this.state.weather;
    if (weather) weather.suppressed = this.state.combatants.some(c => c.alive && c.ability === 'cloud-nine');
    for (const c of this.state.combatants) {
      c.effectiveWeather = c.alive && weather && !weather.suppressed ? weather.kind : undefined;
      const ab = ABILITY_MAP[c.ability], e = ab?.effect;
      const active = !this.ended && c.alive && (e?.requiresStatus ? !!c.status : e?.requiresWeather ? e.requiresWeather === c.effectiveWeather : false);
      const statLabel = e?.stat === 'atk' ? '攻击提升' : e?.stat === 'def' ? '防御提升' : e?.stat === 'spd' ? '速度提升' : e?.kind === 'hpRegen' ? '持续回复' : '闪避提升';
      const label = active ? `${ab!.name}·${statLabel}` : '';
      const previous = this.conditionLabels.get(c.uid) ?? '';
      if (label === previous) continue;
      this.conditionLabels.set(c.uid, label);
      if (previous) this.emit('info', c.uid, c.uid, undefined, undefined, `${ab?.name}·效果结束`, { kind:'buff',notice:{text:`${ab?.name}·效果结束`,active:false} });
      if (label) this.emit('info', c.uid, c.uid, undefined, undefined, label, { kind:'buff',notice:{text:label,active:true} });
    }
  }

  private weatherTick(dt: number): void {
    if (this.state.weather) {
      this.state.weather.remaining = Math.max(0, this.state.weather.remaining - dt);
      if (this.state.weather.remaining <= 0) {
        this.state.weather = undefined;
        this.emit('info', undefined, undefined, undefined, undefined, '天气恢复平静');
      }
    }
    this.refreshWeather();
    for (const c of this.state.combatants) {
      const e = ABILITY_MAP[c.ability]?.effect;
      if (!c.alive || !e?.weatherHpLoss || c.effectiveWeather !== e.requiresWeather) { this.weatherLoss.delete(c.uid); continue; }
      const accumulated = (this.weatherLoss.get(c.uid) ?? 0) + c.maxHp * e.weatherHpLoss * dt;
      const loss = Math.min(c.currentHp, Math.floor(accumulated));
      this.weatherLoss.set(c.uid, accumulated - loss);
      if (loss <= 0) continue;
      c.currentHp -= loss;
      this.emit('damage', undefined, c.uid, undefined, loss, `${c.name} 受到太阳之力消耗`, {kind:'impact',amount:loss,selfCost:true});
      if (c.currentHp <= 0) this.faint(c);
    }
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
      this.emit('info', c.uid, undefined, undefined, undefined, `${c.name} 的${ab.name}影响了敌方冷却！`);
    } else if (ab.effect.kind === 'weather' && ab.effect.weather) {
      this.setWeather(ab.effect.weather, `${c.name}·${ab.name}`, ab.effect.duration);
    } else if (ab.effect.kind === 'openingSpeed' && ab.effect.stat === 'spd') {
      c.buffs.push({ id: 'opening-speed', kind: 'opening-speed', stat: 'spd', stages: ab.effect.stages ?? 1, remaining: ab.effect.duration ?? 6 });
      this.emit('info', c.uid, undefined, undefined, undefined, `${c.name} 的${ab.name}提升了速度！`);
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
        this.emit('info', c.uid, undefined, undefined, undefined, `${c.name} 的临时速度强化结束了。`);
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
        const dmg = roundCombatAmount(c.maxHp * 0.0625);
        c.currentHp -= dmg;
        this.emit('damage', undefined, c.uid, undefined, dmg, `${c.name} 受到${c.status === 'burn' ? '灼伤' : '中毒'}伤害`, { kind: 'impact', type: c.status === 'burn' ? 'fire' : 'poison', amount: dmg });
      }
      // dot buffs
      if (!immuneIndirect) for (const b of c.buffs) {
        if (b.kind === 'dot' && b.magnitude) {
          const dmg = roundCombatAmount(c.maxHp * b.magnitude);
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
            const healed = clampCombatAmount(c.maxHp * (ab.effect.magnitude ?? 0.12), c.maxHp - c.currentHp);
            c.currentHp += healed;
            c.healingDone += healed;
            cds['natural-cure'] = ab.effect.cooldown ?? 8;
            this.emit('heal', c.uid, c.uid, undefined, healed, `${c.name} 的自然回复恢复了生命！`, { kind: 'heal', amount: healed });
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
    if (ab?.effect.kind === 'hpRegen' && (!ab.effect.requiresWeather || ab.effect.requiresWeather === c.effectiveWeather) && ab.effect.magnitude) frac += ab.effect.magnitude;
    if (frac > 0 && c.alive && c.currentHp > 0) {
      if (c.currentHp >= c.maxHp) { c.regenAccumulator = 0; return; }
      c.regenAccumulator += effectiveStat(c, 'atk') * 4 * frac * dt;
      const heal = Math.min(Math.max(0, Math.floor(c.regenAccumulator)), Math.max(0, c.maxHp - c.currentHp));
      if (heal > 0) {
        c.currentHp += heal;
        c.healingDone += heal;
        c.regenAccumulator = c.currentHp >= c.maxHp ? 0 : c.regenAccumulator - heal;
      }
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
    return movementStepIntervalForSpeed(effectiveStat(c, 'spd'));
  }

  private canStepTo(c: BattleCombatant, cell: { x: number; y: number }): boolean {
    return isCellInArena(cell.x, cell.y) && !this.state.combatants.some((other) => {
      if (!other.alive || other.uid === c.uid) return false;
      if (other.position.x === cell.x && other.position.y === cell.y) return true;
      const destinationGap = distCells(cell, other.position);
      const stopClearance = other.side === c.side ? BATTLE_MOVEMENT.allyDestinationClearance : BATTLE_MOVEMENT.enemyDestinationClearance;
      if (destinationGap < stopClearance && destinationGap <= distCells(c.position, other.position)) return true;
      const gap = travelPathDistance(c.pixel, c.pixel, other.pixel, other.position);
      const clearance = Math.min(BATTLE_MOVEMENT.pathClearance, gap);
      if (travelPathDistance(c.pixel, cell, other.pixel, other.position) < clearance - 1e-9) return true;
      // Legacy/custom formations can already overlap. Allow only escape that
      // increases clearance without squeezing closer along the way.
      return gap < BATTLE_MOVEMENT.pathClearance - 1e-9
        && travelPathDistance(cell, cell, other.pixel, other.position) <= gap + 1e-9;
    });
  }

  /** Ease engine-owned travel coordinates toward the logical cell center.
   * Swept-path occupancy and release coverage use these continuous coordinates.
   * Presentation consumes them without inventing a separate avoidance path. */
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
    if ((c.moveCd ?? 0) > 0) return;

    // 保护通过选敌和可达接敌位实现；不再强制跑向同一个队友/目标中点。
    const dx = movementTarget.position.x - c.position.x;
    const dy = movementTarget.position.y - c.position.y;
    const d = Math.hypot(dx, dy);
    const wantKite = desiredRangeCells >= 3;
    const tooFar = d > desiredRangeCells + MOVE_BUFFER;
    const tooClose = wantKite && d < desiredRangeCells - 1;
    if (tooClose && this.state.time < (c.nextRetreatAt ?? 0)) return;
    // In a valid attack band, stand your ground. Skill casts and local VFX are
    // easier to read when the whole squad does not orbit every decision cycle.
    if (!tooFar && !tooClose) {
      const crowdedAlly = this.state.combatants.find(ally => ally.alive && ally.uid !== c.uid && ally.side === c.side && distCells(c.position, ally.position) < BATTLE_MOVEMENT.allyDestinationClearance);
      if (crowdedAlly) this.tryStepToward(c, crowdedAlly.position, true);
      return;
    }
    if (tooFar && !c.rangedRole && desiredRangeCells < 3) {
      const reach = desiredRangeCells + MOVE_BUFFER;
      const reserved = c.attackSlot;
      const valid = (point: { x: number; y: number }) => isCellInArena(point.x, point.y)
        && distCells(point, target.position) <= reach
        && !this.state.combatants.some(ally => ally.uid !== c.uid && ally.alive && ally.attackSlot && ally.attackSlot.until > this.state.time && distCells(point, ally.attackSlot) < BATTLE_MOVEMENT.allyDestinationClearance)
        && this.canStepTo({ ...c, position: point, pixel: point }, point);
      let slot = reserved && reserved.targetUid === target.uid && reserved.until > this.state.time && valid(reserved) ? reserved : undefined;
      if (!slot) {
        const candidates: { x: number; y: number }[] = [];
        for (let x = Math.ceil(target.position.x - reach); x <= target.position.x + reach; x++)
          for (let y = Math.ceil(target.position.y - reach); y <= target.position.y + reach; y++) if (valid({ x, y })) candidates.push({ x, y });
        candidates.sort((a, b) => distCells(c.position, a) - distCells(c.position, b) || Math.abs(a.y - c.position.y) - Math.abs(b.y - c.position.y) || a.y - b.y);
        const point = candidates[0];
        if (point) slot = c.attackSlot = { ...point, targetUid: target.uid, until: this.state.time + BATTLE_MOVEMENT.formationHold };
      }
      if (slot && this.tryStepToward(c, slot, false, .1)) return;
    }
    if (this.tryStepToward(c, movementTarget.position, tooClose, tooFar ? desiredRangeCells + MOVE_BUFFER : undefined) && tooClose) c.nextRetreatAt = this.state.time + BATTLE_MOVEMENT.retreatCooldown;
  }

  /** Take one deterministic lane-aware step toward a point, or away when retreating. */
  private tryStepToward(c: BattleCombatant, point: { x: number; y: number }, retreat: boolean, approachRange?: number): boolean {
    const dx = point.x - c.position.x;
    const dy = point.y - c.position.y;
    const bx = (retreat ? -1 : 1) * Math.sign(dx);
    const by = (retreat ? -1 : 1) * Math.sign(dy);
    if (bx === 0 && by === 0) return false;
    // Approach searches to the attack band; retreat and tactical positioning
    // retain their local candidates. Both share occupancy and step timing.
    const lane = (c.uid.charCodeAt(c.uid.length - 1) & 1) === 0 ? 1 : -1;
    const candidates: { x: number; y: number }[] = [];
    const add = (x: number, y: number) => {
      if (!candidates.some((cell) => cell.x === x && cell.y === y)) candidates.push({ x, y });
    };
    if (approachRange !== undefined) {
      const approach = findGridApproachStep(c.position, point, approachRange, lane, (from, to) =>
        this.canStepTo(from === c.position ? c : { ...c, position: from, pixel: from }, to));
      if (approach) candidates.push(approach);
    } else if (bx !== 0 && by !== 0) {
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
    const cell = candidates.find((candidate) => this.canStepTo(c, candidate));
    if (!cell) return false;
    c.position.x = cell.x;
    c.position.y = cell.y;
    c.moveCd = this.stepDelay(c);
    return true;
  }

  private startCast(c: BattleCombatant, skillId: string): boolean {
    const skill = SKILL_MAP[skillId];
    if (!skill || (c.actionReadyRemaining ?? 0) > 0 || distCells(c.pixel, c.position) > .05) return false;
    c.castSupportUid = skill.effect?.target === 'ally' ? c.plan?.supportTargetUid : undefined;
    c.castAim = this.find(c.currentTargetUid) ? { ...this.find(c.currentTargetUid)!.pixel } : undefined;
    const displayTarget = this.find(c.castSupportUid ?? c.currentTargetUid);
    c.actionAim = displayTarget ? { ...displayTarget.pixel } : undefined;
    const cast = skill.castTime ?? 0;
    if (cast > 0) {
      // 完成当前一步才起手，避免蓄力将角色瞬移到下一落点。
      c.pixel.x = c.position.x;
      c.pixel.y = c.position.y;
      c.plan = null;
      c.castProgress = { skillId, remaining: cast };
      this.emit('skill', c.uid, undefined, skillId, undefined, `${c.name} 开始蓄力 ${skill.name}...`, { kind: 'cast', type: skill.type });
    } else {
      this.resolveSkill(c, skillId);
    }
    return true;
  }

  /** A windup (castProgress) is interrupted by hard control (flinch/sleep/freeze):
   *  the cast is cancelled, the skill does NOT fire, and the combatant must
   *  re-decide. Emits a "被打断" info so the UI can flash the avatar. */
  private interruptCast(c: BattleCombatant): void {
    if (!c.castProgress) return;
    const skillId = c.castProgress.skillId;
    const skill = SKILL_MAP[skillId];
    c.castProgress = null;
    c.castAim = undefined;
    c.castSupportUid = undefined;
    c.plan = null;
    c.nextDecisionAt = this.state.time + 0.3;
    this.emit('info', c.uid, undefined, skillId, undefined, `${c.name} 的${skill?.name ?? '蓄力'}被打断！`, { kind: 'interrupt' });
  }

  private inflictStatus(target: BattleCombatant, status: StatusKind, duration: number, source?: BattleCombatant, skillId?: string): boolean {
    // immunities via ability
    if (status === 'paralyze' && target.ability === 'limber') return false;
    if (status === 'poison' && target.ability === 'immunity') return false;
    if (target.status) return false; // one status at a time
    // All statuses are FINITE now (control nerf): no permanent burn/poison/paralyze.
    // Caller may pass an explicit duration; otherwise use the per-status default.
    const appliedDuration = duration > 0 ? duration : STATUS_DURATION[status];
    target.status = status;
    target.statusTimer = appliedDuration;
    if (source && source.uid !== target.uid && ['paralyze', 'freeze', 'sleep', 'confuse'].includes(status)) source.controlSeconds += appliedDuration;
    const label: Record<StatusKind, string> = { burn: '灼伤', poison: '中毒', paralyze: '麻痹', freeze: '冰冻', sleep: '睡眠', confuse: '混乱' };
    this.emit('status', source?.uid, target.uid, skillId, undefined, `${target.name} 陷入了${label[status]}！`, { kind: 'status', status });
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
          const requested = roundCombatAmount(effectiveStat(caster, 'atk') * (e.healingPower ?? 100) / 100);
          const amt = clampCombatAmount(requested, self.maxHp - self.currentHp);
          self.currentHp += amt;
          caster.healingDone += amt;
          this.emit('heal', caster.uid, self.uid, skillId, amt, `${self.name} 回复了生命`, { kind: 'heal', amount: amt });
          if (e.status === 'sleep') this.inflictStatus(self, 'sleep', e.duration ?? 2, caster, skillId);
        }
        break;
      case 'shield':
        if (self) {
          const shield = roundCombatAmount(e.magnitude ?? 100);
          self.shields += shield;
          self.buffs.push({ id: 'shield_' + (++this.effectSequence), kind: 'shield', remaining: e.duration ?? 3, magnitude: shield });
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
          const applied = this.inflictStatus(self, e.status, e.duration ?? 0, caster, skillId);
          if (applied && wasCasting && ['sleep', 'freeze'].includes(e.status)) caster.interrupts += 1;
        }
        break;
      case 'dot':
        if (self && e.magnitude) {
          self.buffs.push({ id: 'dot_' + (++this.effectSequence), kind: 'dot', remaining: e.duration ?? 6, magnitude: e.magnitude, from: caster.uid });
          this.emit('status', caster.uid, self.uid, skillId, undefined, `${self.name} 被施加了持续伤害`, { kind: 'status', status: e.status });
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
          this.emit('status', caster.uid, self.uid, skillId, undefined, `${self.name} 畏缩了`, { kind: 'status', status: 'paralyze' });
        }
        break;
      case 'lifesteal':
        if (damageDealt > 0 && e.magnitude) {
          const requested = roundCombatAmount(damageDealt * e.magnitude);
          const heal = clampCombatAmount(requested, caster.maxHp - caster.currentHp);
          caster.currentHp += heal;
          caster.healingDone += heal;
          this.emit('heal', caster.uid, undefined, undefined, heal, `${caster.name} 吸取了生命`, { kind: 'heal', amount: heal });
        }
        break;
    }
  }

  private applyOnHitAbilities(attacker: BattleCombatant, defender: BattleCombatant, contact: boolean): void {
    if (!attacker.alive || !defender.alive) return;
    const ab = ABILITY_MAP[defender.ability];
    if (!ab || ab.trigger !== 'onHit') return;
    if (ab.effect.kind === 'hitWeaken') {
      const e = ab.effect, key = e.stat as 'atk'|'def'|'spd';
      if (!key || e.contactOnly && !contact || (defender.abilityCooldowns?.['hit-weaken'] ?? 0) > 0 || attacker.statStages[key] <= -6) return;
      if (this.rng() >= (e.chance ?? 1)) return;
      this.addStatStage(attacker, key, e.stages ?? -1);
      (defender.abilityCooldowns ??= {})['hit-weaken'] = e.cooldown ?? 6;
      const text = `${ab.name}·${key === 'atk' ? '攻击' : key === 'def' ? '防御' : '速度'}下降`;
      this.emit('info', defender.uid, attacker.uid, undefined, undefined, text, {kind:'debuff',notice:{text,active:false}});
      return;
    }
    if (!contact) return;
    const chance = ab.effect.chance ?? 0;
    if (this.rng() >= chance) return;
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
  ): { dealt: number; immune: boolean; missed?: boolean } {
    const skill = SKILL_MAP[skillId];
    if (!skill) throw new Error(`未知招式：${skillId}`);
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
      return { dealt: 0, immune: false, missed: true };
    }
    if (res.immune) {
      if (res.healed && res.healed > 0) {
        const healed = clampCombatAmount(res.healed, defender.maxHp - defender.currentHp);
        defender.currentHp += healed;
        defender.healingDone += healed;
        this.emit('heal', defender.uid, undefined, undefined, healed, `${defender.name} 回复了生命`, { kind: 'heal', amount: healed });
      }
      if (defender.ability === 'flash-fire' && skill.type === 'fire') defender.flashFireBoost = true;
      if (defender.ability === 'lightning-rod' && skill.type === 'electric') this.addStatStage(defender, 'atk', 1);
      return { dealt: 0, immune: true };
    }
    attacker.hits += 1;
    this.skillRecap(attacker, skillId).hits += 1;
    let dmg = res.damage;
    // Spread moves trade per-target damage for pressure across the opposing
    // formation. The multiplier is applied before shields, so protection still
    // absorbs the actual incoming hit correctly.
    if (areaMultiplier !== 1) dmg = roundCombatAmount(dmg * areaMultiplier);
    // shield absorb
    const shieldBefore = defender.shields;
    if (defender.shields > 0) {
      const absorbed = Math.min(defender.shields, dmg);
      defender.shields -= absorbed;
      let remaining = absorbed;
      // 先消耗最早到期的护盾；到期只移除这一层尚未被消耗的量。
      for (const shield of defender.buffs.filter(b => b.kind === 'shield').sort((a,b) => a.remaining - b.remaining)) {
        const used = Math.min(remaining, shield.magnitude ?? 0);
        shield.magnitude = (shield.magnitude ?? 0) - used; remaining -= used;
        if (remaining <= 0) break;
      }
      defender.shieldAbsorbed += absorbed;
      dmg -= absorbed;
    }
    const defenderAbilityBeforeHit = ABILITY_MAP[defender.ability];
    if (shieldBefore > 0 && defender.shields <= 0 && defenderAbilityBeforeHit?.effect.kind === 'shieldRecovery') {
      const cds = defender.abilityCooldowns ??= {};
      if ((cds['shield-recovery'] ?? 0) <= 0) {
        const healed = clampCombatAmount(defender.maxHp * (defenderAbilityBeforeHit.effect.magnitude ?? 0.06), defender.maxHp - defender.currentHp);
        defender.currentHp += healed;
        defender.healingDone += healed;
        cds['shield-recovery'] = defenderAbilityBeforeHit.effect.cooldown ?? 6;
        this.emit('heal', defender.uid, defender.uid, undefined, healed, `${defender.name} 的余韧恢复了生命！`, { kind: 'heal', amount: healed });
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
    if (skillId === attacker.basicSkillId) attacker.basicDamage += dmg;
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
    if (skill.range === 'melee' && attackerAbility?.effect.kind === 'contactShield' && dmg > 0) {
      const cds = attacker.abilityCooldowns ??= {};
      if ((cds['rock-head'] ?? 0) <= 0) {
        const shield = roundCombatAmount(attacker.maxHp * (attackerAbility.effect.magnitude ?? 0.04));
        attacker.shields += shield;
        attacker.buffs.push({ id: 'rock-head_' + (++this.effectSequence), kind: 'shield', remaining: attackerAbility.effect.duration ?? 2.5, magnitude: shield });
        cds['rock-head'] = attackerAbility.effect.cooldown ?? 4;
        this.emit('buff', attacker.uid, undefined, undefined, undefined, `${attacker.name} 的坚硬脑袋形成了护盾！`, { kind: 'shield' });
      }
    }
    const attackerAbilityForRhythm = ABILITY_MAP[attacker.ability];
    if (dmg > 0 && attackerAbilityForRhythm?.effect.kind === 'cooldownRhythm') {
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
    if ((attacker.counterInstinctUntil ?? 0) > this.state.time && dmg > 0) {
      attacker.counterInstinctUntil = 0;
      this.emit('info', attacker.uid, undefined, skillId, undefined, `${attacker.name} 释放了反制本能！`);
    }
    if (ko) {
      attacker.knockouts += 1;
      this.faint(defender);
      // moxie
      if (attacker.ability === 'moxie' && attacker.alive) this.addStatStage(attacker, 'atk', 1);
    } else {
      // Contact on-hit abilities apply only to melee skill delivery.
      const contact = skill.range === 'melee';
      if (dmg > 0) this.applyOnHitAbilities(attacker, defender, contact);
    }
    return { dealt: dmg, immune: false };
  }

  private faint(c: BattleCombatant): void {
    if (!c.alive) return;
    c.alive = false;
    c.currentHp = 0;
    c.status = null;
    c.castProgress = null; c.actionAim = undefined;
    this.emit('faint', c.uid, undefined, undefined, undefined, `${c.name} 倒下了！`, { kind: 'faint' });
  }

  private resolveSkill(c: BattleCombatant, skillId: string): void {
    const skill = SKILL_MAP[skillId];
    if (!skill) return;
    this.occupyAction(c, skillId);
    c.skillCasts += 1;
    this.skillRecap(c, skillId).casts += 1;
    const basic = skillId === c.basicSkillId;
    if (basic) c.basicCasts++;
    const rate = this.cooldownRate(c, basic);
    (c.cooldownRates ??= {})[skillId] = rate;
    c.cooldowns[skillId] = (basic ? getSpecies(c.speciesId).basicSkillCooldown : skill.cooldown * SKILL_COOLDOWN_SCALE) / rate;
    const target = this.find(c.currentTargetUid);
    const aim = c.castAim ?? target?.pixel;
    const targets = skillVictims(skill, c, target, this.state.combatants.filter(x => x.side !== c.side), aim);
    c.actionAim ??= aim ? { ...aim } : undefined;
    c.castAim = undefined;
    const primary = targets.includes(target as BattleCombatant) ? target : targets[0];
    const targetUids = targets.map((x) => x.uid);

    // Mark every potential victim of a spread hard-CC so allied AI does not
    // pile redundant crowd-control onto the same incoming area cast.
    if (skill.effect?.target === 'enemy' && isHardCc(skill)) {
      for (const victim of targets) victim.ccIncomingUntil = this.state.time + 0.6;
    }
    if (skill.power > 0) {
      if (!aim) return;
      let visualAim = { ...aim };
      if (skill.space?.shape === 'radial') visualAim = { ...c.position };
      if (skill.space?.shape === 'cone' || skill.space?.shape === 'line') {
        const dx = aim.x - c.position.x, dy = aim.y - c.position.y, length = Math.max(.001, Math.hypot(dx, dy));
        visualAim = { x: c.position.x + dx / length * skill.space.reach, y: c.position.y + dy / length * skill.space.reach };
      }
      const vfxKind = skill.targetMode === 'all-enemies' ? 'burst' : skill.range === 'ranged' ? 'projectile' : 'melee';
      this.emit('skill', c.uid, primary?.uid ?? target?.uid, skillId, undefined, `${c.name} 使用了 ${skill.name}！`, {
        kind: vfxKind, type: skill.type, to: skill.space ? visualAim : undefined, targetUids: skill.targetMode === 'all-enemies' ? targetUids : undefined,
      });
      if (!targets.length) { c.misses++; this.skillRecap(c, skillId).misses++; this.emit('info', c.uid, target?.uid, skillId, undefined, '目标离开了技能覆盖区域', { kind: 'miss', missed: true }); }
      const areaMultiplier = skill.targetMode === 'all-enemies' ? skill.areaMultiplier ?? 0.7 : 1;
      let totalDealt = 0, landed = false;
      for (let hitIndex = 0; hitIndex < targets.length; hitIndex++) {
        const victim = targets[hitIndex]!;
        const { dealt, immune, missed } = this.dealDamage(c, victim, skillId, areaMultiplier,
          skill.targetMode === 'all-enemies' ? { targetUids, hitIndex } : undefined);
        // Secondary effects roll once per hit target, matching the damage event.
        if (!immune && !missed) { totalDealt += dealt; landed = true; }
        if (skill.effect && victim.alive && !immune && !missed && skill.effect.target !== 'self') {
          const e = skill.effect;
          const secondaryChance = secondaryEffectChance(c, skill);
          if (this.rng() < secondaryChance) this.applyEffect(c, e.target === 'self' ? c : victim, skillId, dealt);
        }
      }
      if (landed && c.alive && skill.effect?.target === 'self' && this.rng() < secondaryEffectChance(c, skill)) this.applyEffect(c, c, skillId, totalDealt);
    } else {
      // Status / utility skills remain single-target or self-target.
      const e = skill.effect;
      const patient = this.find(c.castSupportUid);
      const tgt = e?.target === 'ally' ? patient && patient.alive && patient.side === c.side && distCells(c.pixel, patient.pixel) <= rangeInCells(skill) ? patient : undefined : e?.target === 'enemy' ? targets[0] : c;
      c.castSupportUid = undefined;
      this.emit('skill', c.uid, tgt?.uid, skillId, undefined, `${c.name} 使用了 ${skill.name}！`, { kind: 'burst', type: skill.type });
      if (e?.target === 'enemy' && tgt) {
        const acc = skillHitChance(c, tgt, skill);
        if (this.rng() >= acc) {
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

  private occupyAction(c: BattleCombatant, skillId?: string): void {
    const timing = battleActionTiming(skillId, !!c.rangedRole);
    c.actionLockRemaining = timing.totalMs / 1000;
    c.actionReadyRemaining = c.actionLockRemaining + actionGapForSpeed(effectiveStat(c, 'spd'));
    c.plan = null;
  }

  private cooldownRate(c: BattleCombatant, basic: boolean): number {
    let passive = 1;
    for (const id of c.passiveSkills) {
      const effect = PASSIVE_MAP[id]?.effect;
      if (effect?.kind === 'cdReduction' && effect.mult) passive *= effect.mult;
    }
    return Math.min(2.5, skillCooldownRate(effectiveStat(c, 'spd'), basic) * (2 - passive) * basicTempoMultiplier(c,basic)) * ((c.pressureUntil ?? 0) > this.state.time ? .85 : 1);
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
      this.clearFinishedActions();
      this.state.winner = playerLost && enemyLost ? 'draw' : !enemyLost ? 'enemy' : 'player';
      this.emit('end', undefined, undefined, undefined, undefined, this.state.winner === 'player' ? '你赢了！' : this.state.winner === 'enemy' ? '你输了...' : '平局');
    }
  }

  /** 终局不再推进模拟，撤销尚未释放的动作，允许表现正常收尾。 */
  private clearFinishedActions(): void {
    this.state.weather = undefined;
    this.refreshWeather();
    for (const c of this.state.combatants) {
      c.castProgress = null; c.castAim = undefined; c.actionAim = undefined; c.castSupportUid = undefined;
      c.plan = null; c.actionLockRemaining = 0; c.actionReadyRemaining = 0;
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
    this.weatherTick(dt);
    this.refreshTeamTactics();
    // global cooldown speed-up from passives (灵巧)
    for (const c of this.state.combatants) {
      if (!c.alive) continue;
      for (const id of Object.keys(c.cooldowns)) {
        const rate = this.cooldownRate(c, id === c.basicSkillId);
        const rates = c.cooldownRates ??= {};
        c.cooldowns[id] = Math.max(0, c.cooldowns[id]! * (rates[id] ?? 1) / rate - dt);
        rates[id] = rate;
      }
      for (const id of Object.keys(c.abilityCooldowns ?? {})) c.abilityCooldowns![id] = Math.max(0, c.abilityCooldowns![id]! - dt);
      c.actionLockRemaining = Math.max(0, (c.actionLockRemaining ?? 0) - dt);
      if (!c.castProgress && c.actionLockRemaining <= 0) c.actionAim = undefined;
      c.actionReadyRemaining = Math.max(0, (c.actionReadyRemaining ?? 0) - dt);
      c.moveCd = Math.max(0, (c.moveCd ?? 0) - dt);
      this.statusTick(c, dt);
      this.refreshWeather();
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
      if (c.status === 'sleep' || c.status === 'freeze' || (c.actionLockRemaining ?? 0) > 0) continue;
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
          const dmg = ABILITY_MAP[c.ability]?.effect.kind === 'indirectImmunity' ? 0 : roundCombatAmount(c.maxHp * 0.08);
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
      const facingDelta = target.pixel.x - c.pixel.x;
      c.facing = Math.abs(facingDelta) > .01 ? (facingDelta > 0 ? 1 : -1) : (c.side === 'player' ? 1 : -1);
      if (this.evasion.step(c, this.state, this.stepDelay(c), (unit, cell) => this.canStepTo(unit, cell), this.rng)) continue;
      // movement (grid step)
      const readySkill = c.plan.preferredSkillId && (c.cooldowns[c.plan.preferredSkillId] ?? 0) <= 0 ? SKILL_MAP[c.plan.preferredSkillId] : undefined;
      const preparing = (c.actionReadyRemaining ?? 0) <= 0 && readySkill && (readySkill.power === 0 && readySkill.effect?.target !== 'enemy' || distCells(c.pixel, target.pixel) <= rangeInCells(readySkill));
      const needsSpace = c.rangedRole && distCells(c.position, target.position) < c.plan.desiredRangeCells - 1
        || this.state.combatants.some(ally => ally.alive && ally.uid !== c.uid && ally.side === c.side && distCells(c.position, ally.position) < BATTLE_MOVEMENT.allyDestinationClearance);
      const supportTarget = c.plan.supportTargetUid ? this.find(c.plan.supportTargetUid) : undefined;
      if (supportTarget && readySkill && distCells(c.pixel, supportTarget.pixel) > rangeInCells(readySkill)) {
        if ((c.moveCd ?? 0) <= 0) this.tryStepToward(c, supportTarget.position, false, rangeInCells(readySkill) - .5);
      } else if (!preparing || needsSpace) this.stepMove(c, target, c.plan.desiredRangeCells);
      // action
      if (c.plan.preferredSkillId && (c.cooldowns[c.plan.preferredSkillId] ?? 0) <= 0) {
        const skill = SKILL_MAP[c.plan.preferredSkillId];
        if (skill) {
          const selfCast = skill.power === 0 && skill.effect?.target !== 'enemy';
          const allyReady = skill.effect?.target !== 'ally' || supportTarget?.alive && distCells(c.pixel, supportTarget.pixel) <= rangeInCells(skill);
          if (allyReady && (selfCast || distCells(c.pixel, target.pixel) <= rangeInCells(skill)) && this.startCast(c, c.plan.preferredSkillId)) {
            c.plan = null;
            continue;
          }
        }
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
      this.clearFinishedActions();
      this.state.winner = ph === eh ? 'draw' : ph > eh ? 'player' : 'enemy';
      this.emit('end', undefined, undefined, undefined, undefined, '时间到');
    }
  }
}

void typeMultiplier;
