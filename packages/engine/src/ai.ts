import { skillHitChance, damageReduction, targetDamageBoost, basicTempoMultiplier } from './combat-modifiers.ts';
import { releaseReliability, usefulDamage, interruptChance, canInterruptCast } from './skill-opportunity.ts';
import { controlRemaining, selectHealingTarget, nearbyBacklineThreat, canUseControlWindow } from './cooperation.ts';
import type { BattleCombatant, BattleState, Skill, CombatRole } from '@pokemon-online/shared';
import { PERSONALITY_MAP, SKILL_MAP, getSpecies, typeMultiplier, PASSIVE_MAP, ABILITY_MAP, dmgTypeMult, BATTLE_MOVEMENT, BATTLE_COOPERATION, BATTLE_DECISION, skillCooldownRate, battleActionTiming, actionGapForSpeed } from '@pokemon-online/config';
import { skillVictims } from './skill-space.ts';
import type { RNG } from './rng.ts';
import { effectiveStat } from './stats.ts';
import { rangeInCells, distCells, MELEE_DESIRED_CELLS } from './grid.ts';

export type PositioningIntent = 'frontline' | 'backline' | 'skirmish';

export interface AiPlan {
  targetUid: string;
  /** Desired engagement distance in grid-cell units. */
  desiredRangeCells: number;
  supportTargetUid?: string;
  preferredSkillId: string | null; // null => 等待或调整站位
  /** 稳定的前排/后排定位；性格影响区间内的压力选择。 */
  positioning: PositioningIntent;
  /** A nearby enemy that should drive retreat distance even when action target differs. */
  movementTargetUid?: string;

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
  // type-immunity abilities (water/volt absorb, flash fire, levitate, lightning-rod)
  const dab = ABILITY_MAP[defender.ability];
  if (dab?.effect.kind === 'typeImmunity' && dab.effect.type === t) return 0;
  if (eff === 0) return 0;

  // Base damage (mirrors computeDamage; deterministic - no random/crit-roll).
  // 基础与战术招式采用同一套伤害收益计算。
  const atk = effectiveStat(attacker, 'atk');
  const def = Math.max(1, effectiveStat(defender, 'def'));
  let dmg = Math.max(1, atk * 0.42 + skill.power * 0.24 - def * 0.26 + 4 + attacker.level * 0.16);
  dmg = Math.max(atk * .12, dmg);
  {
    // STAB (+ adaptability stronger STAB)
    const stab = attacker.types?.includes(t) ?? false;
    if (stab) dmg *= 1.5;
    if (attacker.ability === 'adaptability' && stab) dmg *= 1.33;
    // attacker typeBoost passives
    for (const pid of attacker.passiveSkills) {
      const p = PASSIVE_MAP[pid];
      if (p?.effect.kind === 'typeBoost' && (!p.effect.type || p.effect.type === t) && (!p.effect.sameTypeOnly || attacker.types.includes(t)) && p.effect.mult) dmg *= p.effect.mult;
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
  if (ABILITY_MAP[defender.ability]?.effect.kind === 'critImmunity') critChance = 0;
  dmg *= 1 + critChance * 0.5;
  // multiscale (defender at full HP halves damage)
  if (defender.ability === 'multiscale' && defender.currentHp >= defender.maxHp) dmg *= 0.5;
  // Type effectiveness is an active-skill-only modifier.
  dmg *= dmgTypeMult(eff);
  return dmg * damageReduction(defender, skill) * targetDamageBoost(attacker, defender) * skillHitChance(attacker, defender, skill);
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
    const canInterrupt = c.activeSkills.some(id => { const move = SKILL_MAP[id]; return move && isHardCc(move) && (c.cooldowns[id] ?? 0) <= 0 && canInterruptCast(c, e, move, now); });
    if (canInterrupt && pw >= 80 && pw > interruptPower) { interruptPower = pw; interruptTarget = e; }
  }

  // ── target selection (by personality) ──
  let target = enemies[0]!;
  const cur = c.currentTargetUid ? state.combatants.find((x) => x.uid === c.currentTargetUid && x.alive) : null;
  // 性格与定位共同评分，移动成本限制跨场追杀；不再互相覆盖选敌。
  const guardTarget = nearbyBacklineThreat(c, state);
  const strongest = Math.max(...enemies.map(enemy => effectiveStat(enemy, 'atk')), 1);
  const attackKit = c.activeSkills.map(id=>SKILL_MAP[id]).filter(skill=>skill?.power > 0);
  const readyAttacks = attackKit.filter(skill=>(c.cooldowns[skill.id] ?? 0)<=BATTLE_DECISION.abilityReadyHorizon);
  const viableAttack = (enemy: BattleCombatant) => (readyAttacks.length ? readyAttacks : attackKit).some(skill=>expectedDamage(c,enemy,skill)>0);
  const targetScores = enemies.map(enemy => {
    const distance = dist(c, enemy), hp = enemy.currentHp / enemy.maxHp;
    let score = -Math.max(0, distance - (c.engagementRangeCells ?? 2.5)) * (1.6 - p.riskTolerance);
    if (attackKit.length && !viableAttack(enemy)) score -= BATTLE_DECISION.immuneTargetPenalty;
    score += (targetDamageBoost(c,enemy)-1)*BATTLE_DECISION.targetAbilityWeight;
    if (p.targetPriority === 'nearest') score -= distance * 1.4;
    if (p.targetPriority === 'weakest') score += (1 - hp) * 9;
    if (p.targetPriority === 'threat') score += effectiveStat(enemy, 'atk') / strongest * 6;
    if (p.targetPriority === 'random') score += rng() * 5;
    if (role === 'tank' || role === 'bruiser') score -= distance * .65;
    if (enemy.uid === guardTarget?.uid) score += BATTLE_COOPERATION.guardTargetBonus;
    if (role === 'burst') {
      score += (1 - hp) * 3;
      if (c.activeSkills.some(id => { const skill = SKILL_MAP[id]; return skill && !isHardCc(skill) && canUseControlWindow(c, enemy, skill, now); })) score += BATTLE_COOPERATION.controlTargetBonus;
    }
    if (role === 'control' && enemy.castProgress) score += 4;
    if (role === 'area') {
      score += Math.max(0, ...c.activeSkills.map(id => {
        const move = SKILL_MAP[id];
        return move?.targetMode === 'all-enemies' && (c.cooldowns[id] ?? 0) <= 0 ? skillVictims(move, c, enemy, enemies).filter(victim => expectedDamage(c, victim, move) > 0).length * 2 : 0;
      }));
    }
    return { enemy, score };
  });
  target = targetScores.reduce((best, candidate) => candidate.score > best.score ? candidate : best).enemy;
  // A: interrupt overrides target selection - the winding enemy is the target.
  const teamTactic = state.teamTactics[c.side];
  const tacticTarget = teamTactic?.targetUid
    ? enemies.find((enemy) => enemy.uid === teamTactic.targetUid)
    : undefined;
  if (interruptTarget) target = interruptTarget;
  else if (guardTarget) target = guardTarget;
  // A short shared intent coordinates ordinary decisions without overruling
  // interrupts, personal execute logic, or a stubborn combatant's commitment.
  else if (tacticTarget && dist(c, tacticTarget) <= (c.engagementRangeCells ?? 2.5) + 2 && (teamTactic?.kind === 'finish' || teamTactic?.kind === 'protect' || teamTactic?.kind === 'pressure')) target = tacticTarget;
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
  if (!interruptTarget && !guardTarget && cur && cur.uid !== target.uid) {
    const curRatio = cur.currentHp / cur.maxHp;
    const newRatio = target.currentHp / target.maxHp;
    const switchToExecute = newRatio < 0.25 && curRatio > 0.4;
    const proposedWindow = keySkillWindow(target);
    const currentWindow = keySkillWindow(cur);
    const switchToCounterWindow = proposedWindow
      && (!currentWindow || proposedWindow.power > currentWindow.power + 12 || proposedWindow.remaining + 0.25 < currentWindow.remaining);
    if (!switchToExecute && !switchToCounterWindow && now < (c.targetCommitUntil ?? 0)) target = cur;
  }

  // ── D: team focus with lane allocation ── focus fire is useful, but three
  // allies selecting the same healthy target creates a traffic jam at its melee
  // ring. Cap ordinary assignments at two; an execute or interrupt still wins.
  const allies = state.combatants.filter((ally) => ally.side === c.side && ally.alive && ally.uid !== c.uid);
  const assignments = (enemy: BattleCombatant) => allies.filter((ally) => ally.currentTargetUid === enemy.uid).length;
  const crowded = assignments(target) >= 2;
  if (!interruptTarget && !guardTarget && target.currentHp / target.maxHp >= EXEC_THRESHOLD && crowded && enemies.length > 1) {
    const alternatives = enemies.filter((enemy) => enemy.uid !== target.uid);
    target = alternatives.reduce((best, enemy) => {
      const enemyLoad = assignments(enemy);
      const bestLoad = assignments(best);
      if (enemyLoad !== bestLoad) return enemyLoad < bestLoad ? enemy : best;
      return dist(c, enemy) < dist(c, best) ? enemy : best;
    });
  }
  // 免疫不能被集火、护卫或目标黏性覆盖；仅在附近可达目标中调整。
  if (attackKit.length && !viableAttack(target)) {
    const alternative = targetScores.filter(({enemy})=>viableAttack(enemy) && dist(c,enemy)<=(c.engagementRangeCells ?? 2.5)+2)
      .sort((a,b)=>b.score-a.score)[0];
    if (alternative) target = alternative.enemy;
  }
  if (target.uid !== c.currentTargetUid) c.targetCommitUntil = now + BATTLE_MOVEMENT.targetCommitment * (c.personality === 'stubborn' ? 2 : 1);
  const focus = enemies.reduce((a, b) => (b.currentHp / b.maxHp < a.currentHp / a.maxHp ? b : a));
  let focusBoost = target.uid === focus.uid ? 1.08 : 1;
  if (!interruptTarget && tacticTarget?.uid === target.uid) {
    if (teamTactic?.kind === 'finish') focusBoost *= 1.28;
    else if (teamTactic?.kind === 'protect') focusBoost *= 1.22;
    else if (teamTactic?.kind === 'pressure') focusBoost *= 1.14;
  }

  const lowHp = c.currentHp / c.maxHp < p.defensiveThreshold;
  // 大招威胁下可提前开盾/治疗；实际命中仍服从释放时的覆盖区域。
  const threatened = enemies.some((e) => e.currentTargetUid === c.uid && e.castProgress && (SKILL_MAP[e.castProgress.skillId]?.power ?? 0) >= 80);
  const missingHp = 1 - c.currentHp / c.maxHp;
  const targetRatio = target.currentHp / target.maxHp;
  const targetExec = targetRatio < EXEC_THRESHOLD;
  const targetKeyWindow = keySkillWindow(target);
  const targetHardControl = controlRemaining(target, now);
  const ccReservationRemaining = Math.max(0, (target.ccIncomingUntil ?? 0) - now);
  // F: dream-eater combo setup - do I have dream-eater ready to follow up a sleep?
  const hasDreamEaterReady = c.activeSkills.includes('dream-eater') && (c.cooldowns['dream-eater'] ?? 0) <= 0;

  // ── skill scoring ──
  const candidates: { skill: Skill; score: number }[] = [];
  const basicId = c.basicSkillId ?? getSpecies(c.speciesId).basicSkillId;
  const healingTargets = new Map<string, BattleCombatant>();
  const offCd = [...new Set([basicId, ...c.activeSkills])].filter((id) => (c.cooldowns[id] ?? 0) <= 0).map((id) => SKILL_MAP[id]).filter(Boolean);

  const finishTimes = offCd.filter(skill => skill.power > 0 && distCells(c.pixel, target.pixel) <= rangeInCells(skill)
    && expectedDamage(c, target, skill) * (skill.targetMode === 'all-enemies' ? skill.areaMultiplier ?? .7 : 1) >= target.currentHp
    && releaseReliability(c, target, target, skill, now, p.riskTolerance) === 1).map(skill => skill.castTime ?? 0);
  const fastestFinish = Math.min(...finishTimes);

  for (const skill of offCd) {
    let score: number;
    if (isUtility(skill)) {
      score = 30; // baseline utility
      const e = skill.effect;
      if (e?.kind === 'heal' && e.target === 'ally') {
        const choice = selectHealingTarget(c, skill, state);
        if (choice) healingTargets.set(skill.id, choice.patient);
        score = choice?.score ?? -1;
      } else if (e?.kind === 'heal' && e.target === 'self') {
        score = missingHp < .05 ? -1 : lowHp ? 120 * missingHp : (threatened && missingHp > 0.3 ? 70 * missingHp + 20 : 10);
      } else if (e?.kind === 'shield' && e.target === 'self') {
        score = lowHp ? 80 : (threatened ? 90 : 15);
        const shielding = c.shields > 0 && c.buffs.some(buff => buff.kind === 'shield' && buff.remaining > .5 && (buff.magnitude ?? 0) > 0);
        // 已有保护或只剩低压消耗时，保留出手机会；不因残血循环开盾。
        const pressure = enemies.reduce((sum, enemy) => {
          if (distCells(c.pixel, enemy.pixel) > (enemy.engagementRangeCells ?? 2.5) + 1) return sum;
          const basic = SKILL_MAP[enemy.basicSkillId ?? getSpecies(enemy.speciesId).basicSkillId];
          if (!basic?.power) return sum;
          const speed = effectiveStat(enemy, 'spd');
          const rate = enemy.cooldownRates?.[basic.id] ?? Math.min(2.5,skillCooldownRate(speed, true)*basicTempoMultiplier(enemy,true));
          const interval = Math.max(getSpecies(enemy.speciesId).basicSkillCooldown / rate,
            (basic.castTime ?? 0) + battleActionTiming(basic.id, !!enemy.rangedRole).totalMs / 1000 + actionGapForSpeed(speed));
          return sum + expectedDamage(enemy, c, basic) * Math.max(1, (e.duration ?? 3) / interval);
        }, 0);
        if (shielding) score *= BATTLE_DECISION.existingShieldValue;
        else if (!threatened && pressure < Math.min(c.currentHp, e.magnitude ?? 100) * BATTLE_DECISION.shieldDangerRatio) score = -1;
      } else if (e?.kind === 'ramp' && e.target === 'self') {
        const alreadyRamping = c.buffs.some((b) => b.kind === 'ramp' && b.stat === e.stat && b.remaining > 1);
        score = alreadyRamping ? 8 : (lowHp || threatened ? 12 : 62);
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
          if (hard && interruptTarget && target.uid === interruptTarget.uid && canInterruptCast(c, target, skill, now)) score += (160 + interruptPower) * interruptChance(skill);
          // Reserve control for a nuke that is about to become ready, instead of
          // spending it on a harmless filler immediately beforehand.
          if (hard && targetKeyWindow) score += 68 + Math.max(0, KEY_SKILL_WINDOW - targetKeyWindow.remaining) * 24 + targetKeyWindow.power * 0.12;
          if (e.kind === 'debuff' && e.stat) {
            const stage = target.statStages[e.stat as 'atk' | 'def' | 'spd'];
            if (stage <= -2) score *= 0.3; // diminishing value after meaningful weakening
            else if (e.stat === 'atk') score += Math.min(55, effectiveStat(target, 'atk') * 0.22) + (targetKeyWindow ? 28 : 0);
            else if (e.stat === 'def') score += Math.min(36, (assignments(target) + 1) * 12);
            else if (e.stat === 'spd' && (!target.rangedRole || getSpecies(target.speciesId).combatRole === 'bruiser')) score += 24;
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
      if (role === 'growth' && e?.kind === 'ramp') score *= lowHp || threatened ? 0.7 : 1.42;
      if (role === 'control' && e?.target === 'enemy') score *= interruptTarget ? 1.45 : 1.18;
      // utility bias boosts non-damage moves (applies to every utility skill)
      if (p.skillBias === 'utility') score *= 1.6;
      else if (p.skillBias === 'power') score *= 0.5;
    } else {
      const victims = skill.targetMode === 'all-enemies' ? skillVictims(skill, c, target, enemies) : [target];
      const areaScale = skill.targetMode === 'all-enemies' ? (skill.areaMultiplier ?? .7) : 1;
      const covered = victims.filter(victim => expectedDamage(c, victim, skill) > 0);
      score = covered.reduce((sum, victim) => sum + usefulDamage(expectedDamage(c, victim, skill) * areaScale, victim.currentHp)
        * releaseReliability(c, target, victim, skill, now, p.riskTolerance), 0);
      // 长起手占用进攻机会；激进性格更愿意承担这项成本。
      score /= 1 + (skill.castTime ?? 0) * BATTLE_DECISION.windupCost * (1 - p.riskTolerance * .5);
      // 利用真实控制窗口；无法在控制结束前释放的大招没有额外优先级。
      if (!isHardCc(skill) && canUseControlWindow(c, target, skill, now)) score *= 1 + BATTLE_COOPERATION.controlDamageBonus;
      // B: execute - finish near-dead targets
      if (targetExec) score *= 1.5;
      // D: focus fire nudge toward the team focus target
      score *= focusBoost;
      // Species-role tactical preference. Signature skills receive a modest
      // preference rather than an unconditional cast, keeping matchups and
      // personality meaningful. Area users value multi-target pressure, burst
      // users value executes, and bruisers favor melee commitment.
      if (skill.id === signatureSkill) score *= role === 'support' ? 1.12 : 1.2;
      if (role === 'area' && skill.targetMode === 'all-enemies') score *= 1 + Math.min(0.24, Math.max(0, covered.length - 1) * 0.12);
      if (role === 'burst' && (skill.power >= 90 || (skill.castTime ?? 0) > 0)) score *= targetExec ? 1.35 : 1.12;
      if (role === 'bruiser' && skill.range === 'melee') score *= 1.16;
      if (role === 'tank' && (isHardCc(skill) || skill.range === 'melee')) score *= 1.12;
      if (role === 'control' && isHardCc(skill)) score *= interruptTarget && canInterruptCast(c, target, skill, now) ? 1 + .55 * interruptChance(skill) : 1.15;
      if (isHardCc(skill)) {
        const controlHeld = ccReservationRemaining > 0.45 || targetHardControl > 0.45;
        if (controlHeld) score *= 0.06;
        else if (targetHardControl > 0 && targetHardControl <= 0.35) score += 48;
        // A threatened enemy nuke only raises a fresh control. Do not let the
        // cooldown forecast overpower the existing-control reservation.
        if (targetKeyWindow && !controlHeld) score += 66 + Math.max(0, KEY_SKILL_WINDOW - targetKeyWindow.remaining) * 22 + targetKeyWindow.power * 0.1;
      }
      // 单目标已有更快的收尾方案时，不为溢出伤害承担长蓄力。
      if (covered.length === 1 && fastestFinish < (skill.castTime ?? 0)) {
        score *= (fastestFinish + BATTLE_DECISION.finishTimeFloor) / ((skill.castTime ?? 0) + BATTLE_DECISION.finishTimeFloor);
      }
      // skill bias
      if (p.skillBias === 'power') score *= 1.3;
      else if (p.skillBias === 'speed') score *= skill.cooldown <= 2 ? 1.3 : 0.8;
      else if (p.skillBias === 'utility') score *= 0.85;
      // Low-risk personalities slightly prefer shorter-cooldown damage moves.
      const cdPenalty = skill.cooldown * (1 - p.riskTolerance) * 2;
      score /= 1 + cdPenalty / 100;
      // aggression boosts damage scoring vs alternatives
      score *= 0.5 + p.aggression * 0.7;
      // A: a damage skill that also carries hard-CC (e.g. ice-beam freeze,
      // rock-slide flinch) gains interrupt value when aimed at a winding target.
      if (isHardCc(skill) && interruptTarget && target.uid === interruptTarget.uid && canInterruptCast(c, target, skill, now)) score += 80 * interruptChance(skill);
    }
    // 射手的近身技能作为被突入后的反制，不为冷却或高威力单独冲入人群。
    const hostile = skill.power > 0 || skill.effect?.target === 'enemy';
    if (hostile) {
      const travel = Math.max(0, dist(c, target) - rangeInCells(skill));
      score /= 1 + travel * (1.1 - p.riskTolerance * .5);
      if (c.rangedRole && skill.range === 'melee' && dist(c, target) > rangeInCells(skill)) score = -1;
      if (skill.effect?.kind === 'status' && ((skill.effect.status === 'paralyze' && target.ability === 'limber') || (skill.effect.status === 'poison' && target.ability === 'immunity'))) {
        if (!skill.power) score = -1;
      }
      if (!skill.power && skill.effect?.kind === 'status' && !isHardCc(skill) && ABILITY_MAP[target.ability]?.effect.requiresStatus && !target.status) score *= .15;
      if (!skill.power && ABILITY_MAP[target.ability]?.effect.kind === 'indirectImmunity'
        && (skill.effect?.kind === 'dot' || skill.effect?.kind === 'status' && ['burn','poison'].includes(skill.effect.status ?? ''))) score = -1;
      const retaliation = ABILITY_MAP[target.ability];
      const contactRisk = retaliation?.trigger === 'onHit' && (retaliation.effect.kind === 'hitWeaken'
        ? (!retaliation.effect.contactOnly || skill.range === 'melee') && (target.abilityCooldowns?.['hit-weaken'] ?? 0)<=0 && c.statStages[retaliation.effect.stat as 'atk'|'def'|'spd']>-6
        : retaliation.effect.kind === 'custom' && !!retaliation.effect.status && !c.status && skill.range === 'melee');
      if (contactRisk) score *= .65 + p.riskTolerance * .3;
      const ownContact = ABILITY_MAP[c.ability]?.effect.kind === 'contactShield';
      if (skill.range === 'melee' && ownContact && dist(c, target) <= rangeInCells(skill)) score *= 1.18;
    }
    const weatherEffect = ABILITY_MAP[c.ability]?.effect;
    if (weatherEffect?.weatherHpLoss && c.effectiveWeather === weatherEffect.requiresWeather) {
      const cost = c.maxHp * weatherEffect.weatherHpLoss * Math.min(state.weather?.remaining ?? 0, skill.castTime ?? 0);
      if (cost >= c.currentHp && (skill.castTime ?? 0)>0) score = -1;
    }
    candidates.push({ skill, score });
  }

  let preferredSkillId: string | null = null;
  let preferredSkill: Skill | null = null;
  let bestScore = 0;
  for (const cand of candidates) {
    if (cand.score > bestScore) {
      bestScore = cand.score;
      preferredSkillId = cand.skill.id;
      preferredSkill = cand.skill;
    }
  }

  // 定位保持稳定；技能、性格与优势仅在自身作战区间内改变压力。
  const maxRangedRangeCells = c.engagementRangeCells ?? 2.5;
  const enemyTargetSkill = preferredSkill && (preferredSkill.power > 0 || preferredSkill.effect?.target === 'enemy') ? preferredSkill : null;
  const targetHpRatio = target.currentHp / target.maxHp;
  const myHpRatio = c.currentHp / c.maxHp;
  const pressing = targetHpRatio < .4 || myHpRatio - targetHpRatio > .2;
  let desiredRangeCells = c.rangedRole
    ? BATTLE_MOVEMENT.rangedHold + (p.rangePreference === 'ranged' ? .4 : 0) - p.aggression * .4 - (pressing ? .4 : 0)
    : MELEE_DESIRED_CELLS;
  if (c.rangedRole && enemyTargetSkill?.range === 'ranged') desiredRangeCells = Math.min(desiredRangeCells, rangeInCells(enemyTargetSkill) - .5);
  if (c.rangedRole) desiredRangeCells = Math.max(3.5, Math.min(maxRangedRangeCells - .5, desiredRangeCells));
  if (!c.rangedRole && enemyTargetSkill?.range === 'melee') desiredRangeCells = rangeInCells(enemyTargetSkill) - .5;

  // 近处突入者决定撤步方向，持续进攻的目标可继续保持。
  const positioning: PositioningIntent = !c.rangedRole
    ? 'frontline'
    : 'backline';
  const meleeThreat = enemies
    .filter((enemy) => {
      const enemyRole = getSpecies(enemy.speciesId).combatRole;
      return !enemy.rangedRole || enemyRole === 'tank' || enemyRole === 'bruiser';
    })
    .reduce<BattleCombatant | null>((best, enemy) => !best || dist(c, enemy) < dist(c, best) ? enemy : best, null);
  let movementTargetUid: string | undefined;
  if (c.rangedRole && meleeThreat && dist(c, meleeThreat) < 3) movementTargetUid = meleeThreat.uid;

  return {
    targetUid: target.uid,
    desiredRangeCells,
    preferredSkillId,
    supportTargetUid: preferredSkillId ? healingTargets.get(preferredSkillId)?.uid : undefined,
    positioning,
    movementTargetUid,
  };
}

// extend combatant type usage at runtime (currentTargetUid stored on the object)
declare module '@pokemon-online/shared' {
  interface BattleCombatant {
    currentTargetUid?: string;
    nextDecisionAt?: number;
    targetCommitUntil?: number;
    nextRetreatAt?: number;
    attackSlot?: { x: number; y: number; targetUid: string; until: number };
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
    engagementRangeCells?: number;
    /** Whether this combatant holds a ranged combat position. */
    rangedRole?: boolean;
    /** Time until which an ally has already committed hard-CC on this combatant
     *  (team CC coordination): others avoid double-CCing in this window. */
    ccIncomingUntil?: number;
  }
}

void getSpecies;
