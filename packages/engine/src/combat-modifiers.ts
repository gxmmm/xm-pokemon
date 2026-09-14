import type { BattleCombatant, Skill } from '@pokemon-online/shared';
import { ABILITY_MAP, PASSIVE_MAP } from '@pokemon-online/config';

/** 命中与 AI 共用同一概率；无防守对交战双方有效。 */
export function skillHitChance(attacker: BattleCombatant, defender: BattleCombatant, skill: Skill): number {
  if (skill.accuracy === 0 || attacker.ability === 'no-guard' || defender.ability === 'no-guard') return 1;
  const ability = ABILITY_MAP[attacker.ability]?.effect, defense = ABILITY_MAP[defender.ability]?.effect;
  let evasion = defender.passiveSkills.reduce((sum,id) => sum + (PASSIVE_MAP[id]?.effect.kind === 'evasion' ? PASSIVE_MAP[id]!.effect.chance ?? 0 : 0), 0);
  if (defense?.kind === 'custom' && (!defense.requiresWeather || defense.requiresWeather === defender.effectiveWeather) && (defender.ability === 'sand-veil' || defender.ability === 'snow-cloak')) evasion += defense.chance ?? 0;
  if (ability?.kind === 'accuracyBoost') evasion *= ability.mult ?? 1;
  const accuracy = Math.min(1, (skill.accuracy === 0 ? 1 : skill.accuracy / 100) + (ability?.kind === 'accuracyBoost' ? ability.magnitude ?? 0 : 0));
  return Math.max(0, Math.min(1, accuracy * (1 - evasion)));
}

/** 减伤独立于克制曲线，保证“减少20%”在克制与抵抗时含义一致。 */
export function damageReduction(defender: BattleCombatant, skill: Skill): number {
  let multiplier = 1;
  for (const id of defender.passiveSkills) {
    const effect = PASSIVE_MAP[id]?.effect;
    if (effect?.kind === 'typeResist' && effect.type === skill.type) multiplier *= effect.mult ?? 1;
  }
  if (defender.ability === 'thick-fat' && (skill.type === 'fire' || skill.type === 'ice')) multiplier *= .5;
  if (defender.ability === 'dry-skin' && defender.effectiveWeather === 'sun') multiplier *= 1.25;
  const defense = ABILITY_MAP[defender.ability]?.effect;
  if (defense?.kind === 'damageReduction' && defense.type === skill.type) multiplier *= defense.mult ?? 1;
  return multiplier;
}

export function targetDamageBoost(attacker: BattleCombatant, defender: BattleCombatant): number {
  const e = ABILITY_MAP[attacker.ability]?.effect;
  return e?.kind === 'targetBoost' && e.type && defender.types.includes(e.type) ? e.mult ?? 1 : 1;
}

export function basicTempoMultiplier(c: BattleCombatant, basic: boolean): number {
  const e = ABILITY_MAP[c.ability]?.effect;
  return basic && e?.kind === 'basicTempo' ? e.mult ?? 1 : 1;
}

export function secondaryEffectChance(caster: BattleCombatant, skill: Skill): number {
  const base = skill.effect?.chance ?? 1, ability = ABILITY_MAP[caster.ability]?.effect;
  return ability?.kind === 'secondaryBoost' ? Math.max(base, Math.min(ability.magnitude ?? .7, base * (ability.mult ?? 1.75))) : base;
}
