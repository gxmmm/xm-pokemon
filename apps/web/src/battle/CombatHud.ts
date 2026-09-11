import { BATTLE_HUD, BATTLE_STATUS_LABELS, SKILL_MAP, TYPE_COLORS } from '@pokemon-online/config';
import type { BattleCombatant } from '@pokemon-online/shared';

export function hudSeconds(seconds: number): string {
  return `${(Math.ceil(Math.max(0, seconds) * 10) / 10).toFixed(1)}秒`;
}

/** Read only the sampled presentation and its clock, never the live simulator. */
export function combatHud(c: BattleCombatant, time: number, interrupted = false) {
  const ratio = Math.min(1, Math.max(0, c.currentHp / Math.max(1, c.maxHp)));
  const stun = c.alive && (c.flinchUntil ?? 0) > time;
  const controlled = c.alive && (stun || c.status === 'sleep' || c.status === 'freeze');
  const cast = c.alive && !controlled && !interrupted ? c.castProgress : null;
  const castSkill = cast ? SKILL_MAP[cast.skillId] : undefined;
  const progress = cast ? Math.min(1, Math.max(0, 1 - cast.remaining / (castSkill?.castTime || 1))) : 0;
  const statuses: { id: string; text: string; control: boolean }[] = [];
  if (stun) statuses.push({ id: 'stun', text: `眩晕 ${hudSeconds((c.flinchUntil ?? time) - time)}`, control: true });
  if (c.alive && c.status) statuses.push({ id: c.status, text: `${BATTLE_STATUS_LABELS[c.status]} ${hudSeconds(c.statusTimer)}`, control: c.status === 'sleep' || c.status === 'freeze' });
  const action = !c.alive ? '已倒下' : controlled ? '暂时无法行动' : interrupted ? '施法被打断' : cast ? `施放 · ${castSkill?.name ?? cast.skillId}` : '自动战斗';
  const skills = [...new Set(c.activeSkills)].map((id) => {
    const basic = id === c.basicSkillId;
    const skill = SKILL_MAP[id];
    const name = `${basic ? '基础·' : ''}${skill?.name ?? id}`;
    const cd = c.cooldowns[id] ?? 0;
    const casting = cast?.skillId === id;
    const state = !c.alive ? '—' : casting ? '施放中' : cd > 0 ? hudSeconds(cd) : '就绪';
    const self = skill?.category === 'status' && skill.effect?.target === 'self';
    const target = skill?.effect?.target === 'ally' ? '友方单体（含自身）' : self ? '自身' : skill?.targetMode === 'all-enemies' ? `覆盖区内敌人（单目标伤害 ${Math.round((skill.areaMultiplier ?? 0.7) * 100)}%）` : '敌方单体';
    return { id, name, basic, state, casting, ready: c.alive && !casting && cd <= 0,
      color: TYPE_COLORS[skill?.type ?? 'normal'], detail: `${name} · ${target} · ${state}` };
  });
  return { ratio, critical: c.alive && ratio <= BATTLE_HUD.criticalHpRatio, stun, controlled, cast, progress, action, statuses, skills,
    hpColor: ratio > 0.5 ? '#79d5b0' : ratio > BATTLE_HUD.criticalHpRatio ? '#edc574' : '#ff9290' };
}
