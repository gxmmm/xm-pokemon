import type { BattleCombatant, Skill, TypeName } from '@pokemon-online/shared';
import { typeMultiplier, SKILL_MAP, ABILITY_MAP, PASSIVE_MAP } from '@pokemon-online/config';
import type { RNG } from './rng.ts';
import { effectiveStat } from './stats.ts';

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

  // accuracy / evasion
  const acc = skill.accuracy === 0 ? 1 : skill.accuracy / 100;
  let evasion = 0;
  for (const pid of defender.passiveSkills) {
    const p = PASSIVE_MAP[pid];
    if (p?.effect.kind === 'evasion' && p.effect.chance) evasion += p.effect.chance;
  }
  const dab = ABILITY_MAP[defender.ability];
  if (dab?.effect.kind === 'custom' && dab.effect.chance && (defender.ability === 'sand-veil' || defender.ability === 'snow-cloak')) {
    evasion += dab.effect.chance;
  }
  const noGuard = ABILITY_MAP[attacker.ability]?.effect.kind === 'custom' && attacker.ability === 'no-guard';
  if (!noGuard && rng() > acc * (1 - evasion)) {
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
      result.healed = Math.floor(defender.maxHp * immuneAbility.effect.magnitude);
      log.push(`${defender.name} 吸收了${t}属性攻击，回复了HP！`);
    } else {
      log.push(`${defender.name} 免疫了${t}属性攻击！`);
    }
    return result;
  }

  // effectiveness
  let eff = typeMultiplier(t, defender.types as TypeName[]);
  // passives: typeResist on defender
  for (const pid of defender.passiveSkills) {
    const p = PASSIVE_MAP[pid];
    if (p?.effect.kind === 'typeResist' && p.effect.type === t && p.effect.mult) eff *= p.effect.mult;
  }
  // ability: thick-fat halves fire/ice
  if (defender.ability === 'thick-fat' && (t === 'fire' || t === 'ice')) eff *= 0.5;
  result.effectiveness = eff;
  if (eff === 0) {
    log.push(`对${defender.name}没有效果...`);
    return result;
  }

  // base damage
  const level = attacker.level;
  const levelFactor = Math.floor((2 * level) / 5) + 2;
  const atk = effectiveStat(attacker, 'atk');
  const def = Math.max(1, effectiveStat(defender, 'def'));
  let dmg = Math.floor((Math.floor(levelFactor * skill.power) * atk) / def / 50) + 2;

  // STAB
  if (attacker.types?.includes(t)) dmg = Math.floor(dmg * 1.5);

  // passive typeBoost on attacker
  let typeBoost = 1;
  for (const pid of attacker.passiveSkills) {
    const p = PASSIVE_MAP[pid];
    if (!p) continue;
    if (p.effect.kind === 'typeBoost') {
      if (!p.effect.type || p.effect.type === t) typeBoost *= p.effect.mult ?? 1;
    }
  }
  dmg = Math.floor(dmg * typeBoost);

  // ability: onLowHp type boost (blaze/overgrow/torrent/swarm)
  const aab = ABILITY_MAP[attacker.ability];
  if (aab?.effect.kind === 'typeBoost' && aab.effect.type === t && aab.effect.mult) {
    if (attacker.currentHp / attacker.maxHp <= 1 / 3) dmg = Math.floor(dmg * aab.effect.mult);
  }
  // flash-fire boost (immune to fire earlier -> own fire moves stronger)
  if (attacker.flashFireBoost && t === 'fire') dmg = Math.floor(dmg * 1.5);
  // adaptability: stronger STAB
  if (attacker.ability === 'adaptability' && attacker.types?.includes(t)) dmg = Math.floor(dmg * 1.33);

  // crit
  let critChance = 0.0625;
  for (const pid of attacker.passiveSkills) {
    const p = PASSIVE_MAP[pid];
    if (p?.effect.kind === 'crit' && p.effect.chance) critChance += p.effect.chance;
  }
  if (rng() < critChance) {
    result.crit = true;
    dmg = Math.floor(dmg * 1.5);
  }

  // burn halves (unified: treat as attacker atk halved already; apply no extra)
  // random factor
  dmg = Math.floor(dmg * (0.85 + rng() * 0.15));

  // defender damage reduction: multiscale at full hp
  if (defender.ability === 'multiscale' && defender.currentHp >= defender.maxHp) dmg = Math.floor(dmg * 0.5);

  result.damage = Math.max(1, dmg);
  if (eff > 1) log.push(`效果绝佳！`);
  else if (eff < 1 && eff > 0) log.push(`效果不太好...`);
  if (result.crit) log.push(`击中要害！`);
  return result;
}

export function getSkill(id: string): Skill {
  return SKILL_MAP[id] ?? SKILL_MAP['tackle'];
}
