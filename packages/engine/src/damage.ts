import { skillHitChance, damageReduction, targetDamageBoost } from './combat-modifiers.ts';
import type { BattleCombatant, Skill, TypeName } from '@pokemon-online/shared';
import { typeMultiplier, SKILL_MAP, ABILITY_MAP, PASSIVE_MAP, dmgTypeMult } from '@pokemon-online/config';
import type { RNG } from './rng.ts';
import { effectiveStat } from './stats.ts';
import { roundCombatAmount } from './combat-numbers.ts';

export interface DamageResult {
  damage: number;
  effectiveness: number; // 0, 0.5, 1, 2, 4...
  crit: boolean;
  missed: boolean;
  immune: boolean;       // type-immunity ability absorbed it
  healed?: number;       // hp restored to defender (absorb abilities)
  log: string[];
}

/**
 * Compute damage for one skill hit. Unified 4-stat system, type chart, STAB,
 * crit, status, passives and abilities. Type-immunity abilities (Water Absorb,
 * Volt Absorb, Flash Fire, Levitate, Lightning Rod) negate damage and may heal.
 */
export function computeDamage(attacker: BattleCombatant, defender: BattleCombatant, skill: Skill, rng: RNG): DamageResult {
  const log: string[] = [];
  const result: DamageResult = { damage: 0, effectiveness: 1, crit: false, missed: false, immune: false, log };

  const aab = ABILITY_MAP[attacker.ability];
  if (rng() >= skillHitChance(attacker, defender, skill)) {
    result.missed = true;
    log.push(`${attacker.name} 的攻击没有命中！`);
    return result;
  }

  // type-immunity abilities
  const t = skill.type;
  const immuneAbility = (() => {
    const ab = ABILITY_MAP[defender.ability];
    if (!ab) return null;
    if (ab.effect.kind === 'typeImmunity' && ab.effect.type === t) return ab;
    return null;
  })();
  if (immuneAbility) {
    result.immune = true;
    result.effectiveness = 0;
    if (immuneAbility.effect.magnitude && immuneAbility.effect.magnitude > 0 && immuneAbility.effect.magnitude <= 1) {
      // absorb: heal defender by fraction of maxHp
      result.healed = roundCombatAmount(defender.maxHp * immuneAbility.effect.magnitude);
      log.push(`${defender.name} 吸收了${t}属性攻击，回复了生命！`);
    } else {
      log.push(`${defender.name} 免疫了${t}属性攻击！`);
    }
    return result;
  }

  // effectiveness
  let eff = typeMultiplier(t, defender.types as TypeName[]);
  result.effectiveness = eff;
  if (eff === 0) {
    result.immune = true;
    log.push(`对${defender.name}没有效果...`);
    return result;
  }

  // 基础与战术招式使用同一属性、威力、攻击/防御公式。
  const level = attacker.level;
  const atk = effectiveStat(attacker, 'atk');
  const def = Math.max(1, effectiveStat(defender, 'def'));
  let dmg = Math.round(atk * 0.42 + skill.power * 0.24 - def * 0.26 + 4 + level * 0.16);
  dmg = Math.max(Math.round(atk * 0.12), 1, dmg);

  if (attacker.types?.includes(t)) dmg = Math.round(dmg * 1.5);

  {
    // passive typeBoost on attacker
    let typeBoost = 1;
    for (const pid of attacker.passiveSkills) {
      const p = PASSIVE_MAP[pid];
      if (!p) continue;
      if (p.effect.kind === 'typeBoost' && (!p.effect.sameTypeOnly || attacker.types.includes(t))) {
        if (!p.effect.type || p.effect.type === t) typeBoost *= p.effect.mult ?? 1;
      }
    }
    dmg = Math.round(dmg * typeBoost);

    // ability: onLowHp type boost (blaze/overgrow/torrent/swarm)
    if (aab?.effect.kind === 'typeBoost' && aab.effect.type === t && aab.effect.mult) {
      if (attacker.currentHp / attacker.maxHp <= 1 / 3) dmg = Math.round(dmg * aab.effect.mult);
    }
    // flash-fire boost (immune to fire earlier -> own fire moves stronger)
    if (attacker.flashFireBoost && t === 'fire') dmg = Math.round(dmg * 1.5);
    // adaptability: stronger STAB
    if (attacker.ability === 'adaptability' && attacker.types?.includes(t)) dmg = Math.round(dmg * 1.33);
    // F: dream-eater is a setup finisher - bonus damage on a sleeping target
    // (combo with hypnosis / sleep-powder). No penalty off-sleep so it stays
    // usable, but sleeping first is the rewarding line.
    if (skill.id === 'dream-eater' && defender.status === 'sleep') dmg = Math.round(dmg * 1.5);
  }

  // crit
  let critChance = 0.0625;
  for (const pid of attacker.passiveSkills) {
    const p = PASSIVE_MAP[pid];
    if (p?.effect.kind === 'crit' && p.effect.chance) critChance += p.effect.chance;
  }
  if (ABILITY_MAP[defender.ability]?.effect.kind === 'critImmunity') critChance = 0;
  if (rng() < critChance) {
    result.crit = true;
    dmg = Math.round(dmg * 1.5);
  }

  // burn halves (unified: treat as attacker atk halved already; apply no extra)
  // random factor
  dmg = Math.round(dmg * (0.85 + rng() * 0.15));

  // defender damage reduction: multiscale at full hp
  if (defender.ability === 'multiscale' && defender.currentHp >= defender.maxHp) dmg = Math.round(dmg * 0.5);

  // 属性克制按统一曲线缩放，基础招式同样参与克制与免疫。
  dmg = Math.round(dmg * dmgTypeMult(eff) * damageReduction(defender, skill) * targetDamageBoost(attacker, defender));
  // Counter Instinct empowers only the next damaging active skill. The simulator
  // consumes the flag after a successful hit, keeping this function pure.
  if ((attacker.counterInstinctUntil ?? 0) > 0) dmg = Math.round(dmg * 1.15);

  result.damage = Math.max(1, dmg);
  if (eff > 1) log.push(`效果绝佳！`);
  else if (eff < 1 && eff > 0) log.push(`效果不太好...`);
  if (result.crit) log.push(`击中要害！`);
  return result;
}

export function getSkill(id: string): Skill {
  const skill = SKILL_MAP[id];
  if (!skill) throw new Error(`未知招式：${id}`);
  return skill;
}
