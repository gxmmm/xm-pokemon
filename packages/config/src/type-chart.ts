import type { TypeName } from '@pokemon-online/shared';

/**
 * Type effectiveness chart. Multiplier for [attacker][defender].
 * Standard Gen-1 style chart. 2 = super effective, 0.5 = not very effective,
 * 0 = no effect. Missing entries default to 1.
 */
export const TYPE_CHART: Record<TypeName, Partial<Record<TypeName, number>>> = {
  normal: { rock: 0.5, ghost: 0, steel: 0.5 },
  fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
  electric: { water: 2, grass: 0.5, electric: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
  fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: 0.5 },
  poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
  ground: { fire: 2, grass: 0.5, electric: 2, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
  flying: { grass: 2, electric: 0.5, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
  bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
  rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
  ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
  dragon: { dragon: 2, steel: 0.5, fairy: 0 },
  dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
  steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
  fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 },
};

export function typeMultiplier(attack: TypeName, defender: TypeName | TypeName[]): number {
  const types = Array.isArray(defender) ? defender : [defender];
  let mult = 1;
  for (const t of types) {
    mult *= TYPE_CHART[attack]?.[t] ?? 1;
  }
  return mult;
}

/** When attacking with `atk`, which defender types are strong (×2) / weak (×0.5) / immune (×0). */
export function offensiveMatchups(atk: TypeName): { strong: TypeName[]; weak: TypeName[]; immune: TypeName[] } {
  const strong: TypeName[] = [], weak: TypeName[] = [], immune: TypeName[] = [];
  const row = TYPE_CHART[atk] ?? {};
  for (const def of Object.keys(row) as TypeName[]) {
    const m = row[def]!;
    if (m === 2) strong.push(def);
    else if (m === 0.5) weak.push(def);
    else if (m === 0) immune.push(def);
  }
  return { strong, weak, immune };
}

/** When defending as `def`, which attacker types are super-effective (×2) / resisted (×0.5) / immune (×0). */
export function defensiveMatchups(def: TypeName): { weak: TypeName[]; resist: TypeName[]; immune: TypeName[] } {
  const weak: TypeName[] = [], resist: TypeName[] = [], immune: TypeName[] = [];
  for (const atk of Object.keys(TYPE_CHART) as TypeName[]) {
    const m = TYPE_CHART[atk]?.[def] ?? 1;
    if (m === 2) weak.push(atk);
    else if (m === 0.5) resist.push(atk);
    else if (m === 0) immune.push(atk);
  }
  return { weak, resist, immune };
}

/** Compact hover text for a type badge: offensive strengths + defensive matchups. */
export function typeTooltipText(t: TypeName): string {
  const o = offensiveMatchups(t);
  const d = defensiveMatchups(t);
  const join = (arr: TypeName[]) => arr.length ? arr.map((x) => TYPE_LABELS_CN[x]).join('·') : '无';
  return [
    TYPE_LABELS_CN[t],
    `克制(攻×2)：${join(o.strong)}`,
    `弱点(受×2)：${join(d.weak)}`,
    `抗性(受×0.5)：${join(d.resist)}`,
    `免疫(受×0)：${join(d.immune)}`,
  ].join('\n');
}

export const TYPE_COLORS: Record<TypeName, string> = {
  normal: '#A8A77A',
  fire: '#EE8130',
  water: '#6390F0',
  grass: '#7AC74C',
  electric: '#F7D02C',
  ice: '#96D9D6',
  fighting: '#C22E28',
  poison: '#A33EA1',
  ground: '#E2BF65',
  flying: '#A98FF3',
  psychic: '#F95587',
  bug: '#A6B91A',
  rock: '#B6A136',
  ghost: '#735797',
  dragon: '#6F35FC',
  dark: '#705746',
  steel: '#B7B7CE',
  fairy: '#D685AD',
};

export const TYPE_LABELS_CN: Record<TypeName, string> = {
  normal: '一般', fire: '火', water: '水', grass: '草', electric: '电', ice: '冰',
  fighting: '格斗', poison: '毒', ground: '地面', flying: '飞行', psychic: '超能',
  bug: '虫', rock: '岩石', ghost: '幽灵', dragon: '龙', dark: '恶', steel: '钢', fairy: '妖精',
};
