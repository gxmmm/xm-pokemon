import assert from 'node:assert/strict';
import { createPinia, setActivePinia } from 'pinia';
import { createStarter, createWildInstance, applyExp, activeSkillsForLevel, breed, evolve, maxHp } from '@pokemon-online/engine';
import { getSpecies, expForLevel, PASSIVE_SKILLS, SKILLS } from '@pokemon-online/config';
import { MAX_LEVEL, ACTIVE_SKILL_MAX, PASSIVE_SKILL_MAX, type PlayerSave } from '@pokemon-online/shared';
import { api, ApiError } from '../apps/web/src/api/client.ts';
import { useAuthStore } from '../apps/web/src/stores/auth.ts';
import { useGameStore } from '../apps/web/src/stores/game.ts';
import { useBattleStore } from '../apps/web/src/stores/battle.ts';

export async function testProgress(): Promise<void> {
  const originalApi = { ...api };
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } });
  setActivePinia(createPinia());
  const auth = useAuthStore();
  const game = useGameStore();
  const battle = useBattleStore();
  let cloud: PlayerSave | null = null;
  let writes = 0;
  const saveOk = async (s: PlayerSave) => { writes++; cloud = structuredClone(s); return { savedAt: Date.now() }; };
  try {
    auth.token = 'isolated-test'; auth.playerId = 'test'; auth.username = '测试';
    api.me = async () => { throw new TypeError('network offline'); };
    assert.equal(await auth.restore(), false);
    assert.equal(auth.token, 'isolated-test');
    api.me = async () => ({ playerId: 'test', username: '测试', createdAt: 0 });
    assert.equal(await auth.restore(), true);
    api.getSave = async () => { throw new Error('load failed'); };
    assert.equal(await game.load(), false);
    assert.equal(game.loaded, false);
    assert.equal(await game.startWithStarter(1), false);
    api.getSave = async () => cloud;
    assert.equal(await game.load(), true);
    api.putSave = async () => { throw new Error('save failed'); };
    assert.equal(await game.startWithStarter(1), false);
    const starterUid = game.save!.roster[0];
    assert(game.saveError && game.unsaved);
    api.putSave = saveOk;
    assert.equal(await game.startWithStarter(4), true);
    assert.equal(game.save!.roster[0], starterUid, 'retry preserves the first starter');
    assert.equal(game.save!.pokedex[1].count, 1);
    assert.equal(game.saveError, null);
    assert.equal(game.unsaved, false);

    const beforeDebounce = writes;
    const debouncedA = game.persist();
    game.save!.money += 1;
    const debouncedB = game.persist();
    assert.deepEqual(await Promise.all([debouncedA, debouncedB, game.persist(true)]), [true, true, true]);
    assert.equal(writes, beforeDebounce + 1, 'manual save flushes pending callers once');

    let releaseFirst!: () => void;
    let enteredFirst!: () => void;
    const entered = new Promise<void>((resolve) => { enteredFirst = resolve; });
    const gate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let active = 0;
    api.putSave = async (s) => {
      assert.equal(++active, 1, 'writes cannot overlap');
      enteredFirst();
      await gate;
      const result = await saveOk(s);
      active--;
      return result;
    };
    game.save!.money = 2000;
    const first = game.persist(true);
    await entered;
    game.save!.money = 3000;
    const second = game.persist(true);
    releaseFirst();
    assert.deepEqual(await Promise.all([first, second]), [true, true]);
    assert.equal(cloud!.money, 3000);
    api.putSave = saveOk;

    const mon = game.getInstance(starterUid)!;
    const species = getSpecies(mon.speciesId);
    const learnAt = species.learnset.find((entry) => entry.level > 5 && entry.level < MAX_LEVEL)!;
    assert(learnAt, 'fixture must cross a learnset threshold');
    mon.level = learnAt.level - 1;
    mon.exp = expForLevel(species.growthRate, mon.level);
    mon.activeSkills = [];
    const expected = JSON.parse(JSON.stringify(mon));
    applyExp(expected, expForLevel(species.growthRate, learnAt.level) - mon.exp);
    game.save!.items['rare-candy'] = 3;
    assert(game.useItem('rare-candy', starterUid).ok);
    assert.equal(mon.level, learnAt.level);
    assert.deepEqual(mon.activeSkills, expected.activeSkills);
    assert(mon.activeSkills.includes(learnAt.skill));
    assert.equal(game.save!.items['rare-candy'], 2);
    mon.level = MAX_LEVEL - 1;
    mon.exp = expForLevel(species.growthRate, mon.level);
    assert(game.useItem('rare-candy', starterUid).ok);
    assert.equal(mon.level, MAX_LEVEL);
    assert.equal(game.useItem('rare-candy', starterUid).ok, false);
    assert.equal(game.save!.items['rare-candy'], 1);
    game.save!.items['exp-candy-s'] = 1;
    assert.equal(game.useItem('exp-candy-s', starterUid).ok, false);
    assert.equal(game.save!.items['exp-candy-s'], 1);

    const caughtBefore = game.save!.stats.caught;
    const expectedActives = activeSkillsForLevel(2, mon.level);
    const oldOnlySkills = SKILLS.filter((skill) => !expectedActives.includes(skill.id)).slice(0, ACTIVE_SKILL_MAX).map((skill) => skill.id);
    mon.activeSkills = oldOnlySkills;
    const expectedPassives = [...new Set([...mon.passiveSkills, ...getSpecies(2).intrinsicPassives])];
    game.doEvolve(starterUid, 2);
    assert.equal(mon.speciesId, 2);
    assert.deepEqual(mon.activeSkills, expectedActives, 'full active kit is replaced even when slots were full');
    assert.deepEqual(mon.passiveSkills, expectedPassives);
    assert(game.save!.pokedex[1].caught && game.save!.pokedex[2].caught);
    assert.equal(game.save!.stats.caught, caughtBefore);
    assert.equal(game.save!.pveTeam[0], starterUid);
    game.doEvolve(starterUid, 2);
    assert.equal(game.save!.pokedex[2].count, 1, 'repeated invalid evolution does not increment ownership');
    await game.persist(true);
    game.reset();
    await game.load();
    assert(game.save!.pokedex[2].caught);
    assert.deepEqual(game.getInstance(starterUid)!.activeSkills, expectedActives);
    assert.deepEqual(game.getInstance(starterUid)!.passiveSkills, expectedPassives);

    const offspring = breed(createStarter(1), createStarter(1)).offspring;
    offspring.level = 36;
    offspring.exp = expForLevel(getSpecies(1).growthRate, 36);
    offspring.iv = { hp: 45, atk: 50, def: 40, spd: 38 };
    const nextIntrinsics = getSpecies(2).intrinsicPassives;
    offspring.passiveSkills = PASSIVE_SKILLS.filter((skill) => !nextIntrinsics.includes(skill.id)).slice(0, PASSIVE_SKILL_MAX).map((skill) => skill.id);
    assert.equal(offspring.passiveSkills.length, PASSIVE_SKILL_MAX);
    const beforeEvolution = structuredClone(offspring);
    offspring.currentHp = Math.round(maxHp(offspring) / 2);
    const hpRatio = offspring.currentHp / maxHp(offspring);
    evolve(offspring, 2);
    assert(offspring.passiveSkills.length > PASSIVE_SKILL_MAX, 'full bred kit still gains all new intrinsic passives');
    for (const id of [...beforeEvolution.passiveSkills, ...nextIntrinsics]) assert(offspring.passiveSkills.includes(id));
    assert.equal(new Set(offspring.passiveSkills).size, offspring.passiveSkills.length);
    assert.deepEqual(offspring.activeSkills, activeSkillsForLevel(2, 36));
    assert.equal(offspring.currentHp, Math.max(1, Math.round(maxHp(offspring) * hpRatio)), 'HP ratio accounts for the new passive effects');
    const intermediatePassives = [...offspring.passiveSkills];
    evolve(offspring, 3);
    assert.deepEqual(offspring.passiveSkills, [...new Set([...intermediatePassives, ...getSpecies(3).intrinsicPassives])]);
    assert.deepEqual(offspring.activeSkills, activeSkillsForLevel(3, 36));
    for (const key of ['uid', 'iv', 'growth', 'lineage', 'level', 'exp', 'origin', 'personality'] as const) {
      assert.deepEqual(offspring[key], beforeEvolution[key], `evolution preserves ${key}`);
    }
    const lowerLevel = createStarter(1);
    lowerLevel.level = 16;
    evolve(lowerLevel, 2);
    assert.deepEqual(lowerLevel.activeSkills, activeSkillsForLevel(2, 16));
    assert(lowerLevel.activeSkills.length <= ACTIVE_SKILL_MAX);
    assert(lowerLevel.activeSkills.every((id) => getSpecies(2).intrinsic?.includes(id)
      || getSpecies(2).learnset.some((entry) => entry.skill === id && entry.level <= 16)), 'no early skill unlock');
    assert(breed(offspring, offspring).offspring.passiveSkills.length <= PASSIVE_SKILL_MAX, 'breeding output still respects its own cap');
    console.log('✓ evolution: replacement kit, preserved bred passives, intrinsic union beyond 24, sequential evolution and save reload');

    for (const id of [4, 7, 25]) game.addCaughtInstance(createStarter(id));
    game.setPveTeam([]);
    assert(battle.startWild([createWildInstance(10, 5)]));
    const participants = battle.sim!.state.combatants.filter((c) => c.side === 'player');
    assert.equal(participants.length, 3);
    // Isolate reward acceptance from battle balancing with a finished fixture.
    battle.sim!.resolve(180);
    battle.sim!.state.winner = 'player';
    participants[1].alive = false;
    const oldExp = new Map(game.rosterInstances.map((p) => [p.uid, p.exp]));
    const results = battle.grantVictoryExp(100);
    assert.equal(results.length, 3);
    assert.equal(game.getInstance(participants[1].uid)!.exp - oldExp.get(participants[1].uid)!, 100, 'fainted participant receives full EXP');
    for (const p of game.rosterInstances) {
      const participated = participants.some((c) => c.uid === p.uid);
      // The evolved starter is capped; other participants receive full EXP.
      if (p.level < MAX_LEVEL) assert.equal(p.exp - oldExp.get(p.uid)!, participated ? 100 : 0);
    }
    assert.equal(battle.grantVictoryExp(100).length, 0, 'rewards are idempotent');
    battle.startWild([createWildInstance(10, 5)]);
    battle.sim!.resolve(180);
    for (const winner of ['enemy', 'draw'] as const) {
      battle.sim!.state.winner = winner;
      assert.equal(battle.grantVictoryExp(100).length, 0);
    }

    const abandoned = game.persist();
    const beforeReset = writes;
    game.reset();
    assert.equal(await abandoned, false);
    await new Promise((resolve) => setTimeout(resolve, 1250));
    assert.equal(writes, beforeReset, 'reset cancels pending writes');
    api.me = async () => { throw new ApiError('未登录', 401); };
    assert.equal(await auth.restore(), true);
    assert.equal(auth.token, null);
    console.log('✓ progress: save failure/retry/order, starter identity, candy cap/skills, evolution dex, participant rewards');
  } finally {
    game.reset(); battle.clear();
    Object.assign(api, originalApi);
    if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}
