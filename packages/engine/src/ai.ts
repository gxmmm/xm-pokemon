import type { BattleCombatant, BattleState, Skill, CombatRole } from '@pokemon-online/shared';
import { PERSONALITY_MAP, SKILL_MAP, NORMAL_ATTACK, getSpecies, typeMultiplier, PASSIVE_MAP, ABILITY_MAP, dmgTypeMult } from '@pokemon-online/config';
import type { RNG } from './rng.ts';
import { effectiveStat } from './stats.ts';
import { rangeInCells, distCells, MELEE_DESIRED_CELLS } from './grid.ts';

export type PositioningIntent = 'frontline' | 'backline' | 'skirmish';

export interface AiPlan {
  targetUid: string;
  /** Desired engagement distance in grid-cell units. */
  desiredRangeCells: number;
  preferredSkillId: string | null; // null => use normal attack / reposition
  /** Spatial role for movement: block ahead, hold cover, or skirmish normally. */
  positioning: PositioningIntent;
  /** A nearby enemy that should drive retreat distance even when action target differs. */
  movementTargetUid?: string;
  /** Allied frontline used as a cover anchor for a backline combatant. */
  coverAllyUid?: string;
  /** Ally a frontline combatant should move in front of during a protect call. */
  protectAllyUid?: string;
}

function dist(a: BattleCombatant, b: BattleCombatant): number {
  return distCells(a.position, b.position);
}

/** Deterministic expected damage for AI scoring. Mirrors computeDamage but
 *  without the rng rolls: instead of a crit/random draw it uses the expected
 *  crit multiplier and the accuracy hit-chance, so low-accuracy nukes (hydro-
 *  pump/thunder/blizzard) and high-crit moves score appropriately. Burn/paralyze
 *  and battle stat-stages (buffs/debuffs) come for free via effectiveStat.
 *  Type effectiveness is applied (computeDamage was fixed to apply it too). */
function expectedDamage(attacker: BattleCombatant, defender: BattleCombatant, skill: Skill): number {
  const t = skill.type;
  // effectiveness + defender typeResist passives + thick-fat
  let eff = typeMultiplier(t, defender.types);
  if (eff === 0) return 0;
  for (const pid of defender.passiveSkills) {
    const p = PASSIVE_MAP[pid];
    if (p?.effect.kind === 'typeResist' && p.effect.type === t && p.effect.mult) eff *= p.effect.mult;
  }
  if (defender.ability === 'thick-fat' && (t === 'fire' || t === 'ice')) eff *= 0.5;
  // type-immunity abilities (water/volt absorb, flash fire, levitate, lightning-rod)
  const dab = ABILITY_MAP[defender.ability];
  if (dab?.effect.kind === 'typeImmunity' && dab.effect.type === t) return 0;
  if (eff === 0) return 0;

  // Base damage (mirrors computeDamage; deterministic - no random/crit-roll).
  // Normal attacks have their own stable formula and intentionally skip all
  // type/STAB-related bonus layers.
  const atk = effectiveStat(attacker, 'atk');
  const def = Math.max(1, effectiveStat(defender, 'def'));
  const isNormalAttack = skill.id === NORMAL_ATTACK.id;
  let dmg = isNormalAttack
    ? Math.max(1, atk * 0.38 - def * 0.22 + 4 + attacker.level * 0.16)
    : Math.max(1, atk * 0.42 + skill.power * 0.24 - def * 0.26 + 4 + attacker.level * 0.16);
  if (!isNormalAttack) {
    // STAB (+ adaptability stronger STAB)
    const stab = attacker.types?.includes(t) ?? false;
    if (stab) dmg *= 1.5;
    if (attacker.ability === 'adaptability' && stab) dmg *= 1.33;
    // attacker typeBoost passives
    for (const pid of attacker.passiveSkills) {
      const p = PASSIVE_MAP[pid];
      if (p?.effect.kind === 'typeBoost' && (!p.effect.type || p.effect.type === t) && p.effect.mult) dmg *= p.effect.mult;
    }
    // attacker ability typeBoost at low HP (blaze/overgrow/torrent/swarm)
    const aab = ABILITY_MAP[attacker.ability];
    if (aab?.effect.kind === 'typeBoost' && aab.effect.type === t && aab.effect.mult && attacker.currentHp / attacker.maxHp <= 1 / 3) dmg *= aab.effect.mult;
    // flash-fire boost (immune to fire earlier -> own fire moves stronger)
    if (attacker.flashFireBoost && t === 'fire') dmg *= 1.5;
    // F: dream-eater combo - bonus on a sleeping target (mirrors computeDamage)
    if (skill.id === 'dream-eater' && defender.status === 'sleep') dmg *= 1.5;
  }
  // expected crit: E[multiplier] = 1 + critChance * 0.5 (a crit deals x1.5)
  let critChance = 0.0625;
  for (const pid of attacker.passiveSkills) {
    const p = PASSIVE_MAP[pid];
    if (p?.effect.kind === 'crit' && p.effect.chance) critChance += p.effect.chance;
  }
  dmg *= 1 + critChance * 0.5;
  // multiscale (defender at full HP halves damage)
  if (defender.ability === 'multiscale' && defender.currentHp >= defender.maxHp) dmg *= 0.5;
  // Type effectiveness is an active-skill-only modifier.
  if (!isNormalAttack) dmg *= dmgTypeMult(eff);
  // accuracy / evasion: expected hit chance (noGuard bypasses evasion)
  const noGuard = ABILITY_MAP[attacker.ability]?.effect.kind === 'custom' && attacker.ability === 'no-guard';
  const acc = skill.accuracy === 0 ? 1 : skill.accuracy / 100;
  let evasion = 0;
  for (const pid of defender.passiveSkills) {
    const p = PASSIVE_MAP[pid];
    if (p?.effect.kind === 'evasion' && p.effect.chance) evasion += p.effect.chance;
  }
  if (dab?.effect.kind === 'custom' && dab.effect.chance && (defender.ability === 'sand-veil' || defender.ability === 'snow-cloak')) evasion += dab.effect.chance;
  const hitChance = noGuard ? 1 : Math.min(1, Math.max(0, acc * (1 - evasion)));
  return dmg * hitChance;
}

function isUtility(skill: Skill): boolean {
  return skill.category === 'status' || skill.power === 0;
}

/** A "hard CC" skill can interrupt a cast windup: flinch (stun), sleep, or
 *  freeze. Paralyze/confuse/burn/poison do NOT interrupt (only flinch/sleep/
 *  freeze cancel an in-progress windup - see simulator.tick). */
export function isHardCc(skill: Skill): boolean {
  const e = skill.effect;
  if (!e) return false;
  if (e.kind === 'stun') return true;
  if (e.kind === 'status' && (e.status === 'sleep' || e.status === 'freeze')) return true;
  return false;
}

/** Near-death threshold: below this HP% a target is "execute" range - the AI
 *  should finish it (damage boost) and stop wasting CC on it. */
const EXEC_THRESHOLD = 0.18;
const KEY_SKILL_WINDOW = 1.35;

/** A high-impact skill about to become available is a control priority even
 * before its owner starts a windup. This gives controllers a reason to reserve
 * their disable for the opponent's next meaningful action. */
function keySkillWindow(c: BattleCombatant): { remaining: number; power: number } | null {
  let best: { remaining: number; power: number } | null = null;
  for (const skillId of c.activeSkills) {
    const skill = SKILL_MAP[skillId];
    if (!skill || (skill.power < 90 && (skill.castTime ?? 0) < 0.45)) continue;
    const remaining = c.cooldowns[skillId] ?? 0;
    // This is a forecast window, not a currently-ready cast. Instant-ready windups
    // are handled by the explicit interrupt branch above.
    if (remaining <= 0.05 || remaining > KEY_SKILL_WINDOW) continue;
    if (!best || remaining < best.remaining || (remaining === best.remaining && skill.power > best.power)) {
      best = { remaining, power: skill.power };
    }
  }
  return best;
}

/** Remaining duration of an action-blocking control effect. Status controls
 * cannot be re-applied while active; flinch can be chained only near expiry. */
function hardControlRemaining(c: BattleCombatant, now: number): number {
  if (c.status === 'sleep' || c.status === 'freeze') return Math.max(0, c.statusTimer);
  return Math.max(0, (c.flinchUntil ?? 0) - now);
}

/**
 * Decide a combatant's plan: target, desired engagement range, and preferred
 * skill. Personality remains the main behavioural identity; an optional species
 * combat role adds a small tactical nudge so signature species do not all play
 * like generic users of their primary-type move pool.
 */
export function decide(c: BattleCombatant, state: BattleState, rng: RNG): AiPlan | null {
  const enemies = state.combatants.filter((x) => x.side !== c.side && x.alive);
  if (enemies.length === 0) return null;
  const p = PERSONALITY_MAP[c.personality] ?? PERSONALITY_MAP['cool']!;
  const role: CombatRole | undefined = getSpecies(c.speciesId).combatRole;
  const signatureSkill = getSpecies(c.speciesId).signatureSkill;
  const now = state.time;

  // ── A: interrupt opportunity ── an enemy mid-windup on a powerful skill is
  // the highest-priority tactical target. Rush + hard-CC it to cancel the cast.
  // (Windups are interruptible by flinch/sleep/freeze - see simulator.tick.)
  let interruptTarget: BattleCombatant | null = null;
  let interruptPower = 0;
  for (const e of enemies) {
    if (!e.castProgress) continue;
    const sk = SKILL_MAP[e.castProgress.skillId];
    const pw = sk?.power ?? 0;
    if (pw >= 80 && pw > interruptPower) { interruptPower = pw; interruptTarget = e; }
  }

  // ── target selection (by personality) ──
  let target = enemies[0]!;
  const cur = c.currentTargetUid ? state.combatants.find((x) => x.uid === c.currentTargetUid && x.alive) : null;
  if (p.targetPriority === 'random') {
    target = enemies[Math.floor(rng() * enemies.length)]!;
  } else if (p.targetPriority === 'nearest') {
    target = enemies.reduce((best, e) => (dist(c, e) < dist(c, best) ? e : best));
  } else if (p.targetPriority === 'weakest') {
    target = enemies.reduce((best, e) => (e.currentHp / e.maxHp < best.currentHp / best.maxHp ? e : best));
  } else if (p.targetPriority === 'threat') {
    target = enemies.reduce((best, e) => (effectiveStat(e, 'atk') * (e.currentHp / e.maxHp) > effectiveStat(best, 'atk') * (best.currentHp / best.maxHp) ? e : best));
  }
  // Species roles only nudge ordinary target selection. A hard interrupt still
  // overrides everything below, and personality stickiness remains intact.
  if (role === 'burst' || role === 'kite') {
    target = enemies.reduce((best, enemy) => {
      const enemyHp = enemy.currentHp / enemy.maxHp;
      const bestHp = best.currentHp / best.maxHp;
      if (enemyHp !== bestHp) return enemyHp < bestHp ? enemy : best;
      return effectiveStat(enemy, 'def') < effectiveStat(best, 'def') ? enemy : best;
    });
  } else if (role === 'tank' || role === 'bruiser') {
    // Frontline roles commit to the closest opponent rather than weaving past
    // it for a fragile backliner. This preserves a readable battle line.
    target = enemies.reduce((best, enemy) => dist(c, enemy) < dist(c, best) ? enemy : best);
  } else if (role === 'control') {
    target = enemies.reduce((best, enemy) => effectiveStat(enemy, 'atk') > effectiveStat(best, 'atk') ? enemy : best);
  } else if (role === 'area') {
    // AOE itself hits every opponent; choose the enemy closest to the opposing
    // cluster so the action plan and movement remain centered on the fight.
    target = enemies.reduce((best, enemy) => {
      const cluster = enemies.reduce((sum, other) => sum + dist(enemy, other), 0);
      const bestCluster = enemies.reduce((sum, other) => sum + dist(best, other), 0);
      return cluster < bestCluster ? enemy : best;
    });
  }
  // A: interrupt overrides target selection - the winding enemy is the target.
  const teamTactic = state.teamTactics[c.side];
  const tacticTarget = teamTactic?.targetUid
    ? enemies.find((enemy) => enemy.uid === teamTactic.targetUid)
    : undefined;
  if (interruptTarget) target = interruptTarget;
  // A short shared intent coordinates ordinary decisions without overruling
  // interrupts, personal execute logic, or a stubborn combatant's commitment.
  else if (tacticTarget && (teamTactic?.kind === 'finish' || teamTactic?.kind === 'protect' || teamTactic?.kind === 'pressure')) target = tacticTarget;
  // Controllers also reserve a ready hard disable for an opponent whose major
  // skill is nearly ready, rather than waiting until the cast animation begins.
  else {
    const readyHardCc = c.activeSkills.some((id) => {
      const skill = SKILL_MAP[id];
      return !!skill && isHardCc(skill) && (c.cooldowns[id] ?? 0) <= 0;
    });
    const looming = readyHardCc
      ? enemies.map((enemy) => ({ enemy, window: keySkillWindow(enemy) }))
        .filter((entry): entry is { enemy: BattleCombatant; window: { remaining: number; power: number } } => !!entry.window)
        // Prefer the most dangerous nuke inside the same short readiness window;
        // a 125-power cast in 0.5s matters more than a 95-power cast in 0s.
        .sort((a, b) => b.window.power - a.window.power || a.window.remaining - b.window.remaining)[0]
      : undefined;
    if (looming && teamTactic?.kind !== 'finish') target = looming.enemy;
    // stubborn: stick with current target if alive unless a key counter window appears
    else if (c.currentTargetUid && cur && p.targetPriority === 'threat') target = cur;
  }

  // ── C: target stickiness / hysteresis (non-random) ── keep the current
  // target unless a near-dead runner appears (switch to finish it). Stops the
  // flapping where 'weakest' re-picks every tick as HP oscillates by a few %,
  // so focus fire reads cleanly. Current basically-dead is always finished.
  if (!interruptTarget && p.targetPriority !== 'random' && cur && cur.uid !== target.uid) {
    const curRatio = cur.currentHp / cur.maxHp;
    const newRatio = target.currentHp / target.maxHp;
    const switchToExecute = newRatio < 0.25 && curRatio > 0.4;
    const proposedWindow = keySkillWindow(target);
    const currentWindow = keySkillWindow(cur);
    const switchToCounterWindow = proposedWindow
      && (!currentWindow || proposedWindow.power > currentWindow.power + 12 || proposedWindow.remaining + 0.25 < currentWindow.remaining);
    if (!switchToExecute && !switchToCounterWindow) target = cur;
  }

  // ── D: team focus with lane allocation ── focus fire is useful, but three
  // allies selecting the same healthy target creates a traffic jam at its melee
  // ring. Cap ordinary assignments at two; an execute or interrupt still wins.
  const allies = state.combatants.filter((ally) => ally.side === c.side && ally.alive && ally.uid !== c.uid);
  const assignments = (enemy: BattleCombatant) => allies.filter((ally) => ally.currentTargetUid === enemy.uid).length;
  const crowded = assignments(target) >= 2;
  if (!interruptTarget && target.currentHp / target.maxHp >= EXEC_THRESHOLD && crowded && enemies.length > 1) {
    const alternatives = enemies.filter((enemy) => enemy.uid !== target.uid);
    target = alternatives.reduce((best, enemy) => {
      const enemyLoad = assignments(enemy);
      const bestLoad = assignments(best);
      if (enemyLoad !== bestLoad) return enemyLoad < bestLoad ? enemy : best;
      return dist(c, enemy) < dist(c, best) ? enemy : best;
    });
  }
  const focus = enemies.reduce((a, b) => (b.currentHp / b.maxHp < a.currentHp / a.maxHp ? b : a));
  let focusBoost = target.uid === focus.uid ? 1.08 : 1;
  if (!interruptTarget && tacticTarget?.uid === target.uid) {
    if (teamTactic?.kind === 'finish') focusBoost *= 1.28;
    else if (teamTactic?.kind === 'protect') focusBoost *= 1.22;
    else if (teamTactic?.kind === 'pressure') focusBoost *= 1.14;
  }

  const lowHp = c.currentHp / c.maxHp < p.defensiveThreshold;
  // E: proactive defense - a big enemy windup is aimed at me. Skills are
  // lock-on + instant (no resolve-time range check, no in-flight travel), so
  // moving can't dodge a committed cast - shielding/healing is the only way to
  // survive a big nuke. Pop it NOW so it lands during their 0.3-0.6s windup.
  // Interrupting (A) or killing the caster (B execute) score higher, so the AI
  // prefers to STOP the threat; it shields when it can't.
  const threatened = enemies.some((e) => e.currentTargetUid === c.uid && e.castProgress && (SKILL_MAP[e.castProgress.skillId]?.power ?? 0) >= 80);
  const missingHp = 1 - c.currentHp / c.maxHp;
  const targetRatio = target.currentHp / target.maxHp;
  const targetExec = targetRatio < EXEC_THRESHOLD;
  const targetKeyWindow = keySkillWindow(target);
  const targetHardControl = hardControlRemaining(target, now);
  const ccReservationRemaining = Math.max(0, (target.ccIncomingUntil ?? 0) - now);
  // F: dream-eater combo setup - do I have dream-eater ready to follow up a sleep?
  const hasDreamEaterReady = c.activeSkills.includes('dream-eater') && (c.cooldowns['dream-eater'] ?? 0) <= 0;

  // ── skill scoring ──
  const candidates: { skill: Skill; score: number }[] = [];
  const offCd = c.activeSkills.filter((id) => (c.cooldowns[id] ?? 0) <= 0).map((id) => SKILL_MAP[id]).filter(Boolean);

  for (const skill of offCd) {
    let score: number;
    if (isUtility(skill)) {
      score = 30; // baseline utility
      const e = skill.effect;
      if (e?.kind === 'heal' && e.target === 'self') {
        score = lowHp ? 120 * missingHp : (threatened && missingHp > 0.3 ? 70 * missingHp + 20 : 10);
      } else if (e?.kind === 'shield' && e.target === 'self') {
        score = lowHp ? 80 : (threatened ? 90 : 15);
      } else if (e?.kind === 'buff' && e.target === 'self') {
        const alreadyBuffed = c.statStages[e.stat as 'atk' | 'def' | 'spd'] >= 2;
        if (alreadyBuffed) {
          score = 5;
        } else {
          score = 45;
          // F: setup-then-burst - a setup personality (not power-biased, not
          // hyper-aggressive) prefers to buff FIRST when a big nuke is ready,
          // so the nuke lands buffed next turn. Only when healthy (setup is a
          // luxury) and the target isn't dying (just kill it). Caps at stage 2.
          const bigNukeReady = offCd.some((s) => s.power >= 80);
          const setupPersona = p.skillBias !== 'power' && p.aggression < 0.75;
          if (bigNukeReady && setupPersona && missingHp < 0.5 && targetRatio > 0.3) score = Math.max(score, 80);
        }
      } else if (e?.target === 'enemy' && (e.kind === 'status' || e.kind === 'debuff' || e.kind === 'dot' || e.kind === 'stun')) {
        // CC / debuff aimed at the enemy
        const hard = isHardCc(skill);
        // B: don't waste CC on a near-dead target (just kill it) or an already-
        // statused one. DOT on a healthy tanky target is worthwhile, though.
        if (targetExec || (target.status && e.kind !== 'dot')) {
          score = 8;
        } else {
          score = 50;
          // threat bonus: CC is more valuable vs high-atk targets
          score += Math.min(40, effectiveStat(target, 'atk') * 0.15);
          // DOT scales with time/HP - prefer it on tanky high-HP targets
          if (e.kind === 'dot') score += Math.min(30, target.maxHp * 0.02);
          // D: do not overlap a teammate's incoming control. Once a flinch is
          // nearly over, however, a new hard CC may bridge the next action window.
          if (hard && (ccReservationRemaining > 0.45 || targetHardControl > 0.45)) score *= 0.12;
          else if (hard && targetHardControl > 0 && targetHardControl <= 0.35) score += 52;
          // A: interrupt - hard CC that can cancel a windup is urgent. This
          // dominates other options so the AI visibly "breaks" big casts.
          if (hard && interruptTarget && target.uid === interruptTarget.uid) score += 160 + interruptPower;
          // Reserve control for a nuke that is about to become ready, instead of
          // spending it on a harmless filler immediately beforehand.
          if (hard && targetKeyWindow) score += 68 + Math.max(0, KEY_SKILL_WINDOW - targetKeyWindow.remaining) * 24 + targetKeyWindow.power * 0.12;
          if (e.kind === 'debuff' && e.stat) {
            const stage = target.statStages[e.stat as 'atk' | 'def' | 'spd'];
            if (stage <= -2) score *= 0.3; // diminishing value after meaningful weakening
            else if (e.stat === 'atk') score += Math.min(55, effectiveStat(target, 'atk') * 0.22) + (targetKeyWindow ? 28 : 0);
            else if (e.stat === 'def') score += Math.min(36, (assignments(target) + 1) * 12);
            else if (e.stat === 'spd' && (!target.normalIsRanged || getSpecies(target.speciesId).combatRole === 'bruiser')) score += 24;
          }
          // F: deliberately sleep to set up a dream-eater follow-up. dream-eater
          // must be ready so the combo lands before the target wakes; setup
          // personalities only (power-biased just nukes).
          if (hasDreamEaterReady && e.kind === 'status' && e.status === 'sleep' && p.skillBias !== 'power') score += 40;
        }
      } else {
        score = 25;
      }
      // Species role values utility even when personality alone is less
      // utility-oriented: tanks preserve shields, supports preserve sustain,
      // and controllers preserve a ready interrupt/disable window.
      if (role === 'support' && (e?.kind === 'heal' || e?.kind === 'shield')) score *= lowHp || threatened ? 1.55 : 1.25;
      if (role === 'tank' && (e?.kind === 'shield' || e?.kind === 'buff')) score *= lowHp || threatened ? 1.5 : 1.2;
      if (role === 'control' && e?.target === 'enemy') score *= interruptTarget ? 1.45 : 1.18;
      // utility bias boosts non-damage moves (applies to every utility skill)
      if (p.skillBias === 'utility') score *= 1.6;
      else if (p.skillBias === 'power') score *= 0.5;
    } else {
      const ed = expectedDamage(c, target, skill);
      const spreadDamage = skill.targetMode === 'all-enemies'
        ? enemies.reduce((sum, enemy) => sum + expectedDamage(c, enemy, skill), 0) * (skill.areaMultiplier ?? 0.7)
        : ed;
      score = spreadDamage;
      // B: execute - finish near-dead targets
      if (targetExec) score *= 1.5;
      // D: focus fire nudge toward the team focus target
      score *= focusBoost;
      // Species-role tactical preference. Signature skills receive a modest
      // preference rather than an unconditional cast, keeping matchups and
      // personality meaningful. Area users value multi-target pressure, burst
      // users value executes, and bruisers favor melee commitment.
      if (skill.id === signatureSkill) score *= role === 'support' ? 1.12 : 1.2;
      if (role === 'area' && skill.targetMode === 'all-enemies') score *= 1 + Math.min(0.24, Math.max(0, enemies.length - 1) * 0.12);
      if (role === 'burst' && (skill.power >= 90 || (skill.castTime ?? 0) > 0)) score *= targetExec ? 1.35 : 1.12;
      if (role === 'bruiser' && skill.range === 'melee') score *= 1.16;
      if (role === 'tank' && (isHardCc(skill) || skill.range === 'melee')) score *= 1.12;
      if (role === 'control' && isHardCc(skill)) score *= interruptTarget ? 1.55 : 1.15;
      if (isHardCc(skill)) {
        const controlHeld = ccReservationRemaining > 0.45 || targetHardControl > 0.45;
        if (controlHeld) score *= 0.06;
        else if (targetHardControl > 0 && targetHardControl <= 0.35) score += 48;
        // A threatened enemy nuke only raises a fresh control. Do not let the
        // cooldown forecast overpower the existing-control reservation.
        if (targetKeyWindow && !controlHeld) score += 66 + Math.max(0, KEY_SKILL_WINDOW - targetKeyWindow.remaining) * 22 + targetKeyWindow.power * 0.1;
      }
      // skill bias
      if (p.skillBias === 'power') score *= 1.3;
      else if (p.skillBias === 'speed') score *= skill.cooldown <= 2 ? 1.3 : 0.8;
      else if (p.skillBias === 'utility') score *= 0.85;
      // risk tolerance: low risk slightly hoards high-cd skills (prefers cheaper
      // moves / normal attack) but the factor is small enough that a ready skill
      // still beats the normal attack -- otherwise cautious personalities would
      // never cast and fights degrade to normal-attack-only.
      const cdPenalty = skill.cooldown * (1 - p.riskTolerance) * 2;
      score -= cdPenalty;
      // aggression boosts damage scoring vs alternatives
      score *= 0.5 + p.aggression * 0.7;
      // A: a damage skill that also carries hard-CC (e.g. ice-beam freeze,
      // rock-slide flinch) gains interrupt value when aimed at a winding target.
      if (isHardCc(skill) && interruptTarget && target.uid === interruptTarget.uid) score += 80;
    }
    candidates.push({ skill, score });
  }

  // normal attack baseline
  const normalScore = expectedDamage(c, target, NORMAL_ATTACK) * (0.5 + p.aggression * 0.7) * (targetExec ? 1.5 : 1) * focusBoost;

  let preferredSkillId: string | null = null;
  let preferredSkill: Skill | null = null;
  let bestScore = normalScore;
  for (const cand of candidates) {
    if (cand.score > bestScore) {
      bestScore = cand.score;
      preferredSkillId = cand.skill.id;
      preferredSkill = cand.skill;
    }
  }

  // ── desired range (in grid cells) ── align with the chosen action so movement
  // supports it. A Pokemon only kites to ranged distance if it actually has a
  // ranged skill; otherwise (e.g. a melee-only tank) it must close in to melee.
  // Melee desiredRange is kept at 1.0 cell so the stop band (1.0 + MOVE_BUFFER =
  // 1.5) exactly equals the melee attack reach (1.5) - the fighter always lands
  // hits instead of stalling just out of range (grid version of the old bug).
  const rangedSkills = c.activeSkills.map((id) => SKILL_MAP[id]).filter((s) => s?.range === 'ranged');
  const hasRangedSkill = rangedSkills.length > 0;
  const maxRangedRangeCells = hasRangedSkill ? Math.max(...rangedSkills.map((s) => rangeInCells(s!))) : 0;
  let desiredRangeCells: number;
  const enemyTargetSkill = preferredSkill && preferredSkill.power > 0
    ? preferredSkill
    : preferredSkill && preferredSkill.effect?.target === 'enemy' ? preferredSkill : null;
  if (enemyTargetSkill) {
    desiredRangeCells = enemyTargetSkill.range === 'melee'
      ? MELEE_DESIRED_CELLS
      : Math.min(maxRangedRangeCells, rangeInCells(enemyTargetSkill) * 0.7);
  } else if ((lowHp || p.rangePreference === 'ranged') && hasRangedSkill) {
    desiredRangeCells = Math.min(maxRangedRangeCells * 0.7, maxRangedRangeCells); // kite within longest ranged skill
  } else {
    desiredRangeCells = MELEE_DESIRED_CELLS; // close in for normal attack / melee skills
  }

  // Species-positioning tendencies apply after the chosen skill range, so a
  // ranged skill can still be cast. Tanks/bruisers finish closer; kite/control
  // species keep a more defensive band whenever they actually have range.
  if ((role === 'tank' || role === 'bruiser') && enemyTargetSkill?.range !== 'ranged') desiredRangeCells = MELEE_DESIRED_CELLS;
  if ((role === 'kite' || role === 'control' || role === 'support') && hasRangedSkill && !targetExec) desiredRangeCells = Math.max(desiredRangeCells, Math.min(maxRangedRangeCells, Math.round(maxRangedRangeCells * 0.62)));
  if (role === 'area' && hasRangedSkill) desiredRangeCells = Math.max(desiredRangeCells, Math.min(maxRangedRangeCells, Math.round(maxRangedRangeCells * 0.55)));
  // During a teammate protection call, a frontline ally visibly steps in while
  // ranged allies hold their own safe band and pressure the threatening caster.
  if (!interruptTarget && teamTactic?.kind === 'protect' && tacticTarget && target.uid === tacticTarget.uid && (role === 'tank' || role === 'bruiser')) {
    desiredRangeCells = MELEE_DESIRED_CELLS;
  }

  // ── advantaged press (breaks infinite kiting) ──
  // A kiter that is clearly winning must stop running and CLOSE IN, otherwise a
  // disadvantaged melee chases forever and a symmetric ranged pair orbits at max
  // range forever. The disadvantaged side keeps kiting (runs); the advantaged
  // side approaches, so the fight resolves. Target low -> commit to melee to
  // finish; big HP lead (but target still healthy) -> press to ~half range so
  // the kiter engages closer without suicidally diving a healthy melee.
  const targetHpRatio = target.currentHp / target.maxHp;
  const myHpRatio = c.currentHp / c.maxHp;
  const pressing = targetHpRatio < 0.4 || (myHpRatio - targetHpRatio) > 0.2 || (p.aggression > 0.7 && myHpRatio > targetHpRatio + 0.05);
  if (pressing && hasRangedSkill && desiredRangeCells >= 3) {
    desiredRangeCells = targetHpRatio < 0.4 ? MELEE_DESIRED_CELLS : Math.max(MELEE_DESIRED_CELLS, Math.round(maxRangedRangeCells * 0.5));
  }

// ── positioning semantics ── Frontliners move to intercept; vulnerable
  // ranged/control roles work from behind the nearest durable teammate. When a
  // melee threat breaks through, movement is driven by that threat even if the
  // action target remains the team's focus target.
  const frontlineAlly = allies
    .filter((ally) => {
      const allyRole = getSpecies(ally.speciesId).combatRole;
      return allyRole === 'tank' || allyRole === 'bruiser';
    })
    .reduce<BattleCombatant | null>((best, ally) => !best || dist(c, ally) < dist(c, best) ? ally : best, null);
  const positioning: PositioningIntent = role === 'tank' || role === 'bruiser'
    ? 'frontline'
    : (role === 'support' || role === 'control' || role === 'kite' || (hasRangedSkill && p.rangePreference === 'ranged'))
      ? 'backline'
      : 'skirmish';
  const meleeThreat = enemies
    .filter((enemy) => {
      const enemyRole = getSpecies(enemy.speciesId).combatRole;
      return !enemy.normalIsRanged || enemyRole === 'tank' || enemyRole === 'bruiser';
    })
    .reduce<BattleCombatant | null>((best, enemy) => !best || dist(c, enemy) < dist(c, best) ? enemy : best, null);
  let movementTargetUid: string | undefined;
  if (positioning === 'backline' && meleeThreat) {
    const safeRange = hasRangedSkill ? Math.min(maxRangedRangeCells, Math.max(3, Math.round(maxRangedRangeCells * 0.6))) : 3;
    if (dist(c, meleeThreat) < safeRange) {
      desiredRangeCells = Math.max(desiredRangeCells, safeRange);
      movementTargetUid = meleeThreat.uid;
    }
  }

  return {
    targetUid: target.uid,
    desiredRangeCells,
    preferredSkillId,
    positioning,
    movementTargetUid,
    coverAllyUid: positioning === 'backline' ? frontlineAlly?.uid : undefined,
    protectAllyUid: positioning === 'frontline' && teamTactic?.kind === 'protect' ? teamTactic.protectUid : undefined,
  };
}

// extend combatant type usage at runtime (currentTargetUid stored on the object)
declare module '@pokemon-online/shared' {
  interface BattleCombatant {
    currentTargetUid?: string;
    nextDecisionAt?: number;
    flashFireBoost?: boolean;
    speedBoostTimer?: number;
    plan?: AiPlan | null;
    dotAccumulator?: number;
    flinchUntil?: number;
    /** Grid-step movement cooldown (seconds until next cell step). */
    moveCd?: number;
    /** Strafe direction (+1/-1) and step counter for circling behavior. */
    strafeDir?: number;
    strafeCount?: number;
    /** Normal-attack reach in cells (ranged-type pokemon attack from range). */
    normalRangeCells?: number;
    /** Whether this combatant's normal attack is ranged (no contact). */
    normalIsRanged?: boolean;
    /** Time until which an ally has already committed hard-CC on this combatant
     *  (team CC coordination): others avoid double-CCing in this window. */
    ccIncomingUntil?: number;
  }
}

void getSpecies;
