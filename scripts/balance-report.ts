import { BattleSim, createWildInstance, maxHp, mulberry32 } from '@pokemon-online/engine';
import { SKILL_MAP, SKILLS, skillRoleOf, type SkillRole } from '@pokemon-online/config';
import type { IV, PokemonInstance } from '@pokemon-online/shared';

type Quality = '野生基准' | '培养基准' | '炼妖基准';
interface QualityProfile { label: Quality; iv: number; growth: number; }
interface Matchup { id: string; label: string; player: number[]; enemy: number[]; }
interface SkillAggregate { casts: number; hits: number; misses: number; damage: number; }

const LEVELS = [5, 20, 40, 55] as const;
const QUALITIES: QualityProfile[] = [
  { label: '野生基准', iv: 10, growth: 0.95 },
  { label: '培养基准', iv: 22, growth: 1.05 },
  { label: '炼妖基准', iv: 45, growth: 1.18 },
];

// Each matchup is run in both directions so side placement cannot inflate one
// faction's win rate. The suite covers common type advantages and a mixed baseline.
const BASELINE_TEAM: number[] = [6, 9, 3];

const MATCHUPS: Matchup[] = [
  { id: 'fire-grass', label: '火系 vs 草系', player: [6, 59, 126], enemy: [3, 71, 114] },
  { id: 'grass-water', label: '草系 vs 水系', player: [3, 71, 114], enemy: [9, 131, 134] },
  { id: 'water-fire', label: '水系 vs 火系', player: [9, 131, 134], enemy: [6, 59, 126] },
  { id: 'electric-water', label: '电系 vs 水系', player: [25, 135, 145], enemy: [9, 131, 134] },
  { id: 'mixed-neutral', label: '混合均势', player: [143, 65, 121], enemy: [112, 94, 68] },
];
const ROLE_ORDER: SkillRole[] = ['fill', 'main', 'burst', 'area', 'control', 'support'];

function fixedIv(value: number): IV { return { hp: value, atk: value, def: value, spd: value }; }
function makeInstance(speciesId: number, level: number, profile: QualityProfile, seed: number): PokemonInstance {
  const instance = createWildInstance(speciesId, level, { rng: mulberry32(seed) });
  instance.iv = fixedIv(profile.iv);
  instance.growth = profile.growth;
  instance.currentHp = maxHp(instance);
  return instance;
}
function addSkill(target: Map<string, SkillAggregate>, id: string, value: SkillAggregate): void {
  const current = target.get(id) ?? { casts: 0, hits: 0, misses: 0, damage: 0 };
  current.casts += value.casts; current.hits += value.hits; current.misses += value.misses; current.damage += value.damage;
  target.set(id, current);
}
function percent(numerator: number, denominator: number): string { return denominator > 0 ? `${(numerator / denominator * 100).toFixed(1)}%` : '—'; }
function pad(text: string, width: number): string { return text.length >= width ? text : text + ' '.repeat(width - text.length); }

const skillTotals = new Map<string, SkillAggregate>();
const roleTotals = new Map<SkillRole, SkillAggregate>();
const matchupTotals = new Map<string, { label: string; firstWins: number; secondWins: number; draws: number; battles: number }>();
const baselineTotals = new Map<Quality, { battles: number; duration: number; normalDamage: number; totalDamage: number }>();
const qualityTotals = new Map<Quality, { battles: number; duration: number; normalDamage: number; totalDamage: number }>();
const durations: number[] = [];
let battles = 0;
let totalDamage = 0;
let normalDamage = 0;

for (const level of LEVELS) {
  for (const profile of QUALITIES) {
    // Neutral mirror is the core pacing baseline: the two teams are identical,
    // so duration and normal-attack share are not distorted by type advantage.
    for (const mirrorSeed of [0, 1]) {
      const seed = 50_000 + level * 1_000 + QUALITIES.indexOf(profile) * 100 + mirrorSeed;
      const player = BASELINE_TEAM.map((id, index) => makeInstance(id, level, profile, seed + index * 7));
      const enemy = BASELINE_TEAM.map((id, index) => makeInstance(id, level, profile, seed + 50 + index * 7));
      const sim = new BattleSim({ mode: 'pvp', player, enemy, isWild: false, seed });
      sim.resolve(120);
      const baseline = baselineTotals.get(profile.label) ?? { battles: 0, duration: 0, normalDamage: 0, totalDamage: 0 };
      baseline.battles += 1; baseline.duration += sim.state.time;
      for (const combatant of sim.state.combatants) { baseline.normalDamage += combatant.normalDamage; baseline.totalDamage += combatant.damageDealt; }
      baselineTotals.set(profile.label, baseline);
    }
    for (let matchupIndex = 0; matchupIndex < MATCHUPS.length; matchupIndex++) {
      const matchup = MATCHUPS[matchupIndex]!;
      for (const mirror of [false, true]) {
        const playerIds = mirror ? matchup.enemy : matchup.player;
        const enemyIds = mirror ? matchup.player : matchup.enemy;
        const seed = 100_000 + level * 1_000 + QUALITIES.indexOf(profile) * 100 + matchupIndex * 10 + (mirror ? 1 : 0);
        const player = playerIds.map((id, index) => makeInstance(id, level, profile, seed + index * 7));
        const enemy = enemyIds.map((id, index) => makeInstance(id, level, profile, seed + 50 + index * 7));
        const sim = new BattleSim({ mode: 'pvp', player, enemy, isWild: false, seed });
        sim.resolve(120);

        battles += 1;
        durations.push(sim.state.time);
        const quality = qualityTotals.get(profile.label) ?? { battles: 0, duration: 0, normalDamage: 0, totalDamage: 0 };
        quality.battles += 1; quality.duration += sim.state.time;
        for (const combatant of sim.state.combatants) {
          totalDamage += combatant.damageDealt; normalDamage += combatant.normalDamage;
          quality.totalDamage += combatant.damageDealt; quality.normalDamage += combatant.normalDamage;
          for (const [skillId, stats] of Object.entries(combatant.skillStats)) {
            addSkill(skillTotals, skillId, stats);
            const skill = skillId === '__normal__' ? null : SKILL_MAP[skillId];
            const role: SkillRole = skill ? skillRoleOf(skill) : 'fill';
            const roleStat = roleTotals.get(role) ?? { casts: 0, hits: 0, misses: 0, damage: 0 };
            roleStat.casts += stats.casts; roleStat.hits += stats.hits; roleStat.misses += stats.misses; roleStat.damage += stats.damage;
            roleTotals.set(role, roleStat);
          }
        }
        qualityTotals.set(profile.label, quality);
        const match = matchupTotals.get(matchup.id) ?? { label: matchup.label, firstWins: 0, secondWins: 0, draws: 0, battles: 0 };
        match.battles += 1;
        const firstWon = mirror ? sim.state.winner === 'enemy' : sim.state.winner === 'player';
        const secondWon = mirror ? sim.state.winner === 'player' : sim.state.winner === 'enemy';
        if (firstWon) match.firstWins += 1; else if (secondWon) match.secondWins += 1; else match.draws += 1;
        matchupTotals.set(matchup.id, match);
      }
    }
  }
}

const averageDuration = durations.reduce((sum, value) => sum + value, 0) / Math.max(1, durations.length);
const normalRatio = normalDamage / Math.max(1, totalDamage);
const baselineDuration = [...baselineTotals.values()].reduce((sum, row) => sum + row.duration, 0) / Math.max(1, [...baselineTotals.values()].reduce((sum, row) => sum + row.battles, 0));
const baselineNormal = [...baselineTotals.values()].reduce((sum, row) => sum + row.normalDamage, 0);
const baselineTotal = [...baselineTotals.values()].reduce((sum, row) => sum + row.totalDamage, 0);
const warnings: string[] = [];
if (baselineNormal / Math.max(1, baselineTotal) < 0.20) warnings.push(`中性镜像普攻占比 ${percent(baselineNormal, baselineTotal)} 偏低，可能仍被技能循环压制。`);
if (baselineNormal / Math.max(1, baselineTotal) > 0.55) warnings.push(`中性镜像普攻占比 ${percent(baselineNormal, baselineTotal)} 偏高，技能的策略价值可能不足。`);
if (baselineDuration < 15) warnings.push(`中性镜像平均战斗时长 ${baselineDuration.toFixed(1)} 秒偏短，爆发或成长数值可能过高。`);
if (baselineDuration > 75) warnings.push(`中性镜像平均战斗时长 ${baselineDuration.toFixed(1)} 秒偏长，伤害或行动节奏可能不足。`);

const activeSkillRows = [...skillTotals.entries()].map(([id, stats]) => ({
  id, name: id === '__normal__' ? '普通攻击' : (SKILL_MAP[id]?.name ?? id),
  role: id === '__normal__' ? 'fill' as SkillRole : skillRoleOf(SKILL_MAP[id]!), ...stats,
})).sort((a, b) => b.damage - a.damage || b.casts - a.casts);
for (const row of activeSkillRows) {
  if (row.id === '__normal__' || row.casts < 10) continue;
  if (row.hits / Math.max(1, row.hits + row.misses) < 0.45) warnings.push(`${row.name} 命中率 ${percent(row.hits, row.hits + row.misses)} 偏低（样本 ${row.casts} 次）。`);
}

console.log('\n=== Pokémon Online 战斗平衡报告 ===');
console.log(`样本：${battles} 场 3v3（${LEVELS.join('/')}级 × ${QUALITIES.map((p) => p.label).join('/')} × ${MATCHUPS.length}组对局 × 镜像）`);
console.log(`属性矩阵平均时长：${averageDuration.toFixed(1)} 秒（最短 ${Math.min(...durations).toFixed(1)} / 最长 ${Math.max(...durations).toFixed(1)}）`);
console.log(`属性矩阵总伤害：${totalDamage}；普攻占比：${percent(normalDamage, totalDamage)}；技能占比：${percent(totalDamage - normalDamage, totalDamage)}`);
console.log(`中性镜像基线：${baselineDuration.toFixed(1)} 秒 · 普攻占比 ${percent(baselineNormal, baselineTotal)}`);
console.log('\n-- 品质档位 --');
for (const profile of QUALITIES) {
  const row = qualityTotals.get(profile.label)!;
  console.log(`${pad(profile.label, 8)} 平均时长 ${(row.duration / row.battles).toFixed(1)}s · 普攻占比 ${percent(row.normalDamage, row.totalDamage)}`);
}
console.log('\n-- 对局结果（前者胜率） --');
for (const row of matchupTotals.values()) console.log(`${pad(row.label, 12)} ${row.firstWins}-${row.secondWins}-${row.draws} · 前者胜率 ${percent(row.firstWins, row.battles)}`);
console.log('\n-- 技能定位表现 --');
for (const role of ROLE_ORDER) {
  const row = roleTotals.get(role) ?? { casts: 0, hits: 0, misses: 0, damage: 0 };
  console.log(`${pad(role, 8)} 施放 ${String(row.casts).padStart(4)} · 伤害 ${String(row.damage).padStart(6)} · 单次 ${row.casts ? (row.damage / row.casts).toFixed(1) : '—'} · 命中 ${percent(row.hits, row.hits + row.misses)}`);
}
console.log('\n-- 伤害最高技能 Top 12 --');
for (const row of activeSkillRows.slice(0, 12)) console.log(`${pad(row.name, 10)} [${pad(row.role, 7)}] 伤害 ${String(row.damage).padStart(6)} · 施放 ${String(row.casts).padStart(3)} · 命中 ${percent(row.hits, row.hits + row.misses)}`);
console.log('\n-- 预警 --');
if (warnings.length === 0) console.log('无硬性预警；建议以本次输出作为下一轮调参基线。');
else for (const warning of warnings) console.log(`⚠ ${warning}`);

// Ensure the imported list remains linked to config additions in this diagnostic script.
void SKILLS;
