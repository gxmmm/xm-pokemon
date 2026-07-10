import type { BattleState, BattleCombatant, BattleEvent, PokemonInstance, StatusKind, TypeName, TimedEffect } from '@pokemon-online/shared';
import { ARENA, BATTLE_TICK } from '@pokemon-online/shared';
import { SKILL_MAP, NORMAL_ATTACK, ABILITY_MAP, PASSIVE_MAP, getSpecies, typeMultiplier } from '@pokemon-online/config';
import { mulberry32, hashSeed, type RNG } from './rng.ts';
import { computeStats, effectiveStat } from './stats.ts';
import { computeDamage } from './damage.ts';
import { decide } from './ai.ts';

export interface BattleSimOptions {
  mode: 'pve' | 'pvp';
  player: PokemonInstance[];
  enemy: PokemonInstance[];
  /** sequential = 1 active per side + bench, deploy next on faint (PVE).
   *  simultaneous = all active at once (PVP 3v3). Defaults from mode. */
  deployment?: 'sequential' | 'simultaneous';
  isWild?: boolean;
  speed?: number;
  seed?: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function dist(a: BattleCombatant, b: BattleCombatant): number {
  return Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
}

function instanceToCombatant(inst: PokemonInstance, side: 'player' | 'enemy', index: number, total: number): BattleCombatant {
  const species = getSpecies(inst.speciesId);
  const stats = computeStats(inst);
  const x = side === 'player' ? 140 : ARENA.width - 140;
  const spacing = total > 1 ? 80 : 0;
  const y = ARENA.height / 2 + (index - (total - 1) / 2) * spacing;
  return {
    uid: inst.uid,
    side,
    speciesId: inst.speciesId,
    types: species.types,
    level: inst.level,
    name: inst.nickname || species.name,
    personality: inst.personality,
    ability: inst.ability,
    activeSkills: [...inst.activeSkills],
    passiveSkills: [...inst.passiveSkills],
    stats,
    maxHp: stats.hp,
    currentHp: inst.currentHp > 0 ? Math.min(inst.currentHp, stats.hp) : stats.hp,
    position: { x, y: clamp(y, 50, ARENA.height - 50) },
    facing: side === 'player' ? 1 : -1,
    cooldowns: {},
    normalAttackCd: 0,
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

  constructor(opts: BattleSimOptions) {
    const seed = opts.seed ?? hashSeed(opts.player.map((p) => p.uid).join(',') + '|' + opts.enemy.map((p) => p.uid).join(','));
    this.rng = mulberry32(seed);
    this.deployment = opts.deployment ?? (opts.mode === 'pve' ? 'sequential' : 'simultaneous');
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
    const player = activePlayer.map((p, i) => instanceToCombatant(p, 'player', i, activePlayer.length));
    const enemy = activeEnemy.map((p, i) => instanceToCombatant(p, 'enemy', i, activeEnemy.length));
    this.state = {
      mode: opts.mode,
      arena: { width: ARENA.width, height: ARENA.height },
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

  private emit(type: BattleEvent['type'], actor?: string, target?: string, skillId?: string, amount?: number, message?: string): void {
    this.state.events.push({ t: +this.state.time.toFixed(2), type, actor, target, skillId, amount, message });
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
        this.emit('damage', undefined, c.uid, undefined, dmg, `${c.name} 受到${c.status === 'burn' ? '灼伤' : '中毒'}伤害`);
      }
      // dot buffs
      for (const b of c.buffs) {
        if (b.kind === 'dot' && b.magnitude) {
          const dmg = Math.max(1, Math.floor(c.maxHp * b.magnitude));
          c.currentHp -= dmg;
          this.emit('damage', undefined, c.uid, undefined, dmg, `${c.name} 受到持续伤害`);
        }
      }
      if (c.currentHp <= 0) this.faint(c);
    }
    // timed status
    if (c.status === 'sleep' || c.status === 'confuse') {
      c.statusTimer -= dt;
      if (c.statusTimer <= 0) {
        this.emit('info', c.uid, undefined, undefined, undefined, `${c.name} 从${c.status === 'sleep' ? '睡眠' : '混乱'}中恢复`);
        c.status = null;
      }
    } else if (c.status === 'freeze') {
      if (this.rng() < 0.2 * dt) {
        c.status = null;
        this.emit('info', c.uid, undefined, undefined, undefined, `${c.name} 解除了冰冻`);
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

  private moveToward(c: BattleCombatant, target: BattleCombatant, desiredRange: number, dt: number): void {
    const dx = target.position.x - c.position.x;
    const dy = target.position.y - c.position.y;
    const d = Math.hypot(dx, dy) || 0.001;
    const speed = (30 + effectiveStat(c, 'spd') * 0.5);
    if (d > desiredRange + 6) {
      c.position.x += (dx / d) * speed * dt;
      c.position.y += (dy / d) * speed * dt;
      c.facing = dx >= 0 ? 1 : -1;
    } else if (desiredRange >= 150 && d < desiredRange - 6) {
      // kite away to keep range
      c.position.x -= (dx / d) * speed * dt;
      c.position.y -= (dy / d) * speed * 0.5 * dt;
      c.facing = dx >= 0 ? 1 : -1;
    }
    c.position.x = clamp(c.position.x, 30, ARENA.width - 30);
    c.position.y = clamp(c.position.y, 40, ARENA.height - 40);
  }

  private startCast(c: BattleCombatant, skillId: string): void {
    const skill = SKILL_MAP[skillId];
    if (!skill) return;
    const cast = skill.castTime ?? 0;
    if (cast > 0) {
      c.castProgress = { skillId, remaining: cast };
      this.emit('skill', c.uid, undefined, skillId, undefined, `${c.name} 开始蓄力 ${skill.name}...`);
    } else {
      this.resolveSkill(c, skillId);
    }
  }

  private inflictStatus(target: BattleCombatant, status: StatusKind, duration: number): void {
    // immunities via ability
    if (status === 'paralyze' && (target.ability === 'limber')) return;
    if (status === 'poison' && (target.ability === 'immunity')) return;
    if (target.status) return; // one status at a time
    if (status === 'sleep' || status === 'confuse' || status === 'freeze') {
      target.status = status;
      target.statusTimer = duration;
    } else {
      target.status = status;
      target.statusTimer = -1;
    }
    const label: Record<StatusKind, string> = { burn: '灼伤', poison: '中毒', paralyze: '麻痹', freeze: '冰冻', sleep: '睡眠', confuse: '混乱' };
    this.emit('status', undefined, target.uid, undefined, undefined, `${target.name} 陷入了${label[status]}！`);
  }

  private addStatStage(c: BattleCombatant, stat: 'atk' | 'def' | 'spd', stages: number): void {
    c.statStages[stat] = clamp(c.statStages[stat] + stages, -6, 6);
    this.emit(stages >= 0 ? 'buff' : 'debuff', c.uid, undefined, undefined, undefined, `${c.name} 的${stat === 'atk' ? '攻击' : stat === 'def' ? '防御' : '速度'}${stages >= 0 ? '提升' : '下降'}了！`);
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
          this.emit('heal', self.uid, undefined, undefined, amt, `${self.name} 回复了HP`);
          if (e.status === 'sleep') this.inflictStatus(self, 'sleep', e.duration ?? 2);
        }
        break;
      case 'shield':
        if (self) {
          self.shields += e.magnitude ?? 100;
          self.buffs.push({ id: 'shield_' + Date.now(), kind: 'shield', remaining: e.duration ?? 3, magnitude: e.magnitude });
          this.emit('buff', self.uid, undefined, undefined, undefined, `${self.name} 张开了护盾`);
        }
        break;
      case 'buff':
        if (self && e.stat) this.addStatStage(self, e.stat as 'atk' | 'def' | 'spd', e.stages ?? 1);
        break;
      case 'debuff':
        if (self && e.stat) this.addStatStage(self, e.stat as 'atk' | 'def' | 'spd', e.stages ?? -1);
        break;
      case 'status':
        if (self && e.status) this.inflictStatus(self, e.status, e.duration ?? 3);
        break;
      case 'dot':
        if (self && e.magnitude) {
          self.buffs.push({ id: 'dot_' + Date.now(), kind: 'dot', remaining: e.duration ?? 6, magnitude: e.magnitude, from: caster.uid });
          this.emit('status', undefined, self.uid, undefined, undefined, `${self.name} 被施加了持续伤害`);
        }
        break;
      case 'stun':
        if (self) {
          self.flinchUntil = this.state.time + (e.duration ?? 1);
          self.plan = null;
          self.nextDecisionAt = this.state.time + (e.duration ?? 1);
          this.emit('status', undefined, self.uid, undefined, undefined, `${self.name} 畏缩了`);
        }
        break;
      case 'lifesteal':
        if (damageDealt > 0 && e.magnitude) {
          const heal = Math.floor(damageDealt * e.magnitude);
          caster.currentHp = Math.min(caster.maxHp, caster.currentHp + heal);
          this.emit('heal', caster.uid, undefined, undefined, heal, `${caster.name} 吸取了生命`);
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

  private dealDamage(attacker: BattleCombatant, defender: BattleCombatant, skillId: string): { dealt: number; immune: boolean } {
    const skill = SKILL_MAP[skillId] ?? NORMAL_ATTACK;
    const res = computeDamage(attacker, defender, skill, this.rng);
    for (const m of res.log) this.emit('info', attacker.uid, defender.uid, skillId, undefined, m);
    if (res.missed) return { dealt: 0, immune: false };
    if (res.immune) {
      if (res.healed && res.healed > 0) {
        defender.currentHp = Math.min(defender.maxHp, defender.currentHp + res.healed);
        this.emit('heal', defender.uid, undefined, undefined, res.healed, `${defender.name} 回复了HP`);
      }
      if (defender.ability === 'flash-fire') defender.flashFireBoost = true;
      return { dealt: 0, immune: true };
    }
    let dmg = res.damage;
    // shield absorb
    if (defender.shields > 0) {
      const absorbed = Math.min(defender.shields, dmg);
      defender.shields -= absorbed;
      dmg -= absorbed;
    }
    defender.currentHp -= dmg;
    this.emit('damage', attacker.uid, defender.uid, skillId, dmg, undefined);
    if (defender.currentHp <= 0) {
      this.faint(defender);
      // moxie
      if (attacker.ability === 'moxie' && attacker.alive) this.addStatStage(attacker, 'atk', 1);
    } else {
      // contact on-hit abilities
      this.applyOnHitAbilities(attacker, defender, skill.range === 'melee');
    }
    return { dealt: dmg, immune: false };
  }

  private faint(c: BattleCombatant): void {
    if (!c.alive) return;
    c.alive = false;
    c.currentHp = 0;
    c.status = null;
    c.castProgress = null;
    this.emit('faint', c.uid, undefined, undefined, undefined, `${c.name} 倒下了！`);
  }

  private resolveSkill(c: BattleCombatant, skillId: string): void {
    const skill = SKILL_MAP[skillId];
    if (!skill) return;
    c.cooldowns[skillId] = skill.cooldown;
    const target = this.find(c.currentTargetUid);
    if (skill.power > 0) {
      if (!target || !target.alive) return;
      this.emit('skill', c.uid, target.uid, skillId, undefined, `${c.name} 使用了 ${skill.name}！`);
      const { dealt } = this.dealDamage(c, target, skillId);
      // secondary effect on damage skills
      if (skill.effect && target.alive) {
        const e = skill.effect;
        const applyChance = e.chance ?? 1;
        if (this.rng() < applyChance) {
          this.applyEffect(c, e.target === 'self' ? c : target, skillId, dealt);
        }
      }
    } else {
      // status / utility
      this.emit('skill', c.uid, target?.uid, skillId, undefined, `${c.name} 使用了 ${skill.name}！`);
      const e = skill.effect;
      const tgt = e?.target === 'enemy' ? target : c;
      // accuracy for enemy-target status
      if (e?.target === 'enemy' && tgt) {
        const acc = skill.accuracy === 0 ? 1 : skill.accuracy / 100;
        if (this.rng() > acc) {
          this.emit('info', c.uid, tgt.uid, skillId, undefined, `但是没有命中...`);
          return;
        }
      }
      if (tgt) this.applyEffect(c, e?.target === 'self' ? c : tgt, skillId, 0);
    }
  }

  private normalAttack(c: BattleCombatant, target: BattleCombatant): void {
    c.normalAttackCd = NORMAL_ATTACK.cooldown;
    this.emit('attack', c.uid, target.uid, NORMAL_ATTACK.id, undefined, `${c.name} 使用了普通攻击！`);
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
      this.statusTick(c, dt);
      this.passiveRegen(c, dt);
      this.speedBoost(c, dt);
    }
    for (const c of this.state.combatants) {
      if (!c.alive) continue;
      if (this.state.time < (c.flinchUntil ?? 0)) continue;
      // casting
      if (c.castProgress) {
        c.castProgress.remaining -= dt;
        if (c.castProgress.remaining <= 0) {
          const sid = c.castProgress.skillId;
          c.castProgress = null;
          this.resolveSkill(c, sid);
        }
        continue;
      }
      // status that blocks action
      if (c.status === 'sleep' || c.status === 'freeze') continue;
      if (c.status === 'paralyze' && this.rng() < 0.25) {
        this.emit('info', c.uid, undefined, undefined, undefined, `${c.name} 因麻痹无法行动`);
        c.nextDecisionAt = this.state.time + 0.3;
        continue;
      }
      if (c.status === 'confuse' && this.rng() < 0.33) {
        // self hit
        const dmg = Math.max(1, Math.floor(c.maxHp * 0.08));
        c.currentHp -= dmg;
        this.emit('damage', c.uid, c.uid, undefined, dmg, `${c.name} 因混乱攻击了自己`);
        if (c.currentHp <= 0) this.faint(c);
        c.nextDecisionAt = this.state.time + 0.3;
        continue;
      }
      // decision refresh
      if (this.state.time >= (c.nextDecisionAt ?? 0)) {
        c.plan = decide(c, this.state, this.rng);
        c.currentTargetUid = c.plan?.targetUid;
        c.nextDecisionAt = this.state.time + 0.3;
      }
      if (!c.plan) continue;
      const target = this.find(c.plan.targetUid);
      if (!target || !target.alive) { c.plan = null; continue; }
      // movement
      this.moveToward(c, target, c.plan.desiredRange, dt);
      // action
      if (c.plan.preferredSkillId && (c.cooldowns[c.plan.preferredSkillId] ?? 0) <= 0) {
        const skill = SKILL_MAP[c.plan.preferredSkillId];
        if (skill) {
          const selfCast = skill.effect?.target === 'self' || skill.power === 0 && skill.effect?.target !== 'enemy';
          if (selfCast || dist(c, target) <= skill.rangeTiles) {
            this.startCast(c, c.plan.preferredSkillId);
            c.plan = null;
            continue;
          }
        }
      }
      // normal attack fallback
      if (dist(c, target) <= NORMAL_ATTACK.rangeTiles && c.normalAttackCd <= 0) {
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
