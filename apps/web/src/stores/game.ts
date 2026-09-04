import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { PlayerSave, PokemonInstance, PlayerSettings, BattleResult } from '@pokemon-online/shared';
import { SAVE_VERSION, ROSTER_MAX, PVE_TEAM_SIZE, PVP_TEAM_SIZE, MAX_LEVEL } from '@pokemon-online/shared';
import { getSpecies, getMap, ITEM_MAP, MAP_MAP, expForLevel } from '@pokemon-online/config';
import {
  createStarter, applyExp, evolve, heal, revive, cureStatus, maxHp,
  markSeen, markCaught, markOwned, addInstanceToSave, releaseInstance, breed as doBreed,
  defaultFormation, getAvailableEvolutions,
} from '@pokemon-online/engine';
import { api } from '../api/client.ts';
import { useAuthStore } from './auth.ts';

function freshSave(playerId: string, username: string, starterId: number): PlayerSave {
  const starter = createStarter(starterId);
  const now = Date.now();
  return {
    version: SAVE_VERSION,
    playerId,
    username,
    createdAt: now,
    updatedAt: now,
    playtime: 0,
    currentMapId: 'pallet',
    position: { x: 8, y: 6, facing: 'down' },
    roster: [starter.uid],
    instances: { [starter.uid]: starter },
    pokedex: {},
    items: { 'poke-ball': 10, 'full-heal': 1 },
    money: 1500,
    pveTeam: [starter.uid],
    pvpTeam: [starter.uid],
    formation: defaultFormation(),
    friends: [],
    badges: [],
    settings: { music: true, sfx: true, battleSpeed: 1 },
    lastBattleResult: undefined,
    stats: { battles: 0, wins: 0, caught: 0, bred: 0 },
    visitedMaps: ['pallet'],
  };
}

export interface ExpGainResult {
  uid: string;
  fromLevel: number;
  toLevel: number;
  learnedSkills: string[];
  evolutions: number[];
}

export const useGameStore = defineStore('game', () => {
  const auth = useAuthStore();
  const save = ref<PlayerSave | null>(null);
  const loading = ref(false);
  const loaded = ref(false);
  const error = ref<string | null>(null);
  const saveError = ref<string | null>(null);
  const saving = ref(false);
  const unsaved = ref(false);
  const lastSavedAt = ref<number | null>(null);
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let waiters: Array<(ok: boolean) => void> = [];
  let writeQueue: Promise<unknown> = Promise.resolve();
  let loadRequest: Promise<boolean> | null = null;
  let generation = 0;
  let revision = 0;
  let pendingWrites = 0;

  const hasSave = computed(() => !!save.value);
  const rosterInstances = computed<PokemonInstance[]>(() =>
    (save.value?.roster ?? []).map((u) => save.value!.instances[u]).filter(Boolean),
  );
  const pveTeamInstances = computed<PokemonInstance[]>(() => {
    if (!save.value) return [];
    return save.value.pveTeam
      .map((u) => save.value!.instances[u])
      .filter((x): x is PokemonInstance => !!x);
  });
  const pvpTeamInstances = computed<PokemonInstance[]>(() => {
    if (!save.value) return [];
    return save.value.pvpTeam
      .map((u) => save.value!.instances[u])
      .filter((x): x is PokemonInstance => !!x);
  });
  const dexCount = computed(() => Object.values(save.value?.pokedex ?? {}).filter((e) => e.caught).length);
  const dexSeen = computed(() => Object.values(save.value?.pokedex ?? {}).filter((e) => e.seen).length);
  const rosterFull = computed(() => (save.value?.roster.length ?? 0) >= ROSTER_MAX);

  function getInstance(uid: string): PokemonInstance | undefined {
    return save.value?.instances[uid];
  }

  function load(): Promise<boolean> {
    if (loadRequest) return loadRequest;
    const request = loadSave();
    loadRequest = request;
    void request.finally(() => { if (loadRequest === request) loadRequest = null; });
    return request;
  }

  async function loadSave(): Promise<boolean> {
    const currentGeneration = generation;
    loading.value = true; error.value = null;
    try {
      const s = await api.getSave();
      if (currentGeneration !== generation) return false;
      save.value = s?.version === SAVE_VERSION ? s : null;
      loaded.value = true;
      return true;
    } catch (e) {
      if (currentGeneration === generation) error.value = e instanceof Error ? e.message : '加载存档失败';
      return false;
    } finally {
      if (currentGeneration === generation) loading.value = false;
    }
  }

  async function startWithStarter(starterId: number): Promise<boolean> {
    if (!auth.playerId || !auth.username) throw new Error('未登录');
    if (!loaded.value) return false;
    // A failed first save keeps the same starter for retry.
    if (!save.value) {
      save.value = freshSave(auth.playerId, auth.username, starterId);
      markCaught(save.value, starterId);
    }
    return persist(true);
  }

  function persist(immediate = false): Promise<boolean> {
    if (!save.value) return Promise.resolve(false);
    save.value.updatedAt = Date.now();
    unsaved.value = true;
    revision += 1;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    return new Promise((resolve) => {
      waiters.push(resolve);
      if (immediate) flushSave();
      else saveTimer = setTimeout(flushSave, 1200);
    });
  }

  function flushSave(): void {
    saveTimer = null;
    if (!save.value) return;
    const snapshot = JSON.parse(JSON.stringify(save.value)) as PlayerSave;
    const currentGeneration = generation;
    const currentRevision = revision;
    const callbacks = waiters.splice(0);
    pendingWrites += 1;
    saving.value = true;
    // Serialize snapshots: a slow earlier write must never overwrite a newer one.
    writeQueue = writeQueue.then(async () => {
      let ok = false;
      try {
        if (currentGeneration !== generation) return;
        const r = await api.putSave(snapshot);
        if (currentGeneration !== generation) return;
        lastSavedAt.value = r.savedAt;
        saveError.value = null;
        if (currentRevision === revision) unsaved.value = false;
        ok = true;
      } catch (e) {
        if (currentGeneration === generation) saveError.value = e instanceof Error ? e.message : '保存失败';
      } finally {
        if (currentGeneration === generation) saving.value = --pendingWrites > 0;
        callbacks.forEach((resolve) => resolve(ok));
      }
    });
  }

  // ── pokedex ──
  function see(speciesId: number): void {
    if (!save.value) return;
    markSeen(save.value, speciesId);
  }
  function caught(speciesId: number): void {
    if (!save.value) return;
    markCaught(save.value, speciesId);
  }

  // ── instances ──
  function addCaughtInstance(inst: PokemonInstance): void {
    if (!save.value) return;
    addInstanceToSave(save.value, inst);
  }

  function release(uid: string): { speciesId: number; nickname?: string } | null {
    if (!save.value) return null;
    const r = releaseInstance(save.value, uid);
    void persist();
    return r;
  }

  // ── loadouts (ordered teams of 3) ──
  function setPveTeam(uids: string[]): void {
    if (!save.value) return;
    save.value.pveTeam = uids.slice(0, PVE_TEAM_SIZE);
    void persist();
  }
  function setPvpTeam(uids: string[]): void {
    if (!save.value) return;
    save.value.pvpTeam = uids.slice(0, PVP_TEAM_SIZE);
    void persist();
  }
  /** Set the 3-slot starting formation (阵型) for the player's team. */
  function setFormation(cells: { x: number; y: number }[]): void {
    if (!save.value) return;
    save.value.formation = cells.slice(0, PVE_TEAM_SIZE);
    void persist();
  }

  // ── healing ──
  /** Heal the entire carried roster to full + clear status (auto after battle). */
  function healAll(): void {
    if (!save.value) return;
    for (const uid of save.value.roster) {
      const inst = save.value.instances[uid];
      if (inst) heal(inst);
    }
    void persist();
  }

  // ── items ──
  function useItem(itemId: string, targetUid?: string): { ok: boolean; msg: string } {
    if (!save.value) return { ok: false, msg: '无存档' };
    const item = ITEM_MAP[itemId];
    if (!item) return { ok: false, msg: '道具不存在' };
    if ((save.value.items[itemId] ?? 0) <= 0) return { ok: false, msg: '数量不足' };
    if (item.kind === 'ball') return { ok: false, msg: '精灵球在战斗中使用' };
    const e = item.effect;
    if (!e) return { ok: false, msg: '无法使用' };
    const target = targetUid ? save.value.instances[targetUid] : undefined;
    if (!target) return { ok: false, msg: '请选择目标宝可梦' };
    if (e.kind === 'heal') {
      if (target.currentHp <= 0) return { ok: false, msg: '该宝可梦已倒下，请使用复活道具' };
      heal(target, e.magnitude);
    } else if (e.kind === 'revive') {
      if (target.currentHp > 0) return { ok: false, msg: '该宝可梦未倒下' };
      revive(target, e.magnitude);
    } else if (e.kind === 'cure') {
      cureStatus(target, e.statusCured);
    } else if (e.kind === 'exp') {
      if (target.level >= MAX_LEVEL) return { ok: false, msg: '已达到等级上限，无需使用糖果' };
      if (e.magnitude === -1) {
        const nextExp = expForLevel(getSpecies(target.speciesId).growthRate, target.level + 1);
        applyExp(target, Math.max(0, nextExp - target.exp));
        target.currentHp = maxHp(target);
        target.status = null;
      } else {
        applyExp(target, e.magnitude ?? 0);
        target.currentHp = Math.min(maxHp(target), target.currentHp);
      }
    }
    save.value.items[itemId] = (save.value.items[itemId] ?? 1) - 1;
    void persist();
    return { ok: true, msg: `对${target.nickname || getSpecies(target.speciesId).name}使用了${item.name}` };
  }

  function buyItem(itemId: string, qty = 1): { ok: boolean; msg: string } {
    if (!save.value) return { ok: false, msg: '无存档' };
    const item = ITEM_MAP[itemId];
    if (!item || item.price === undefined) return { ok: false, msg: '不可购买' };
    const cost = item.price * qty;
    if (save.value.money < cost) return { ok: false, msg: '金币不足' };
    save.value.money -= cost;
    save.value.items[itemId] = (save.value.items[itemId] ?? 0) + qty;
    void persist();
    return { ok: true, msg: `购买 ${item.name} x${qty}` };
  }

  // ── exp / evolution ──
  function grantExp(uid: string, amount: number): ExpGainResult {
    const inst = save.value?.instances[uid];
    const res: ExpGainResult = { uid, fromLevel: inst?.level ?? 0, toLevel: inst?.level ?? 0, learnedSkills: [], evolutions: [] };
    if (!inst) return res;
    const r = applyExp(inst, amount);
    res.toLevel = inst.level;
    res.learnedSkills = r.learnedSkills;
    res.evolutions = r.evolutionsAvailable;
    return res;
  }

  function doEvolve(uid: string, toSpeciesId: number): void {
    const inst = save.value?.instances[uid];
    if (!inst || !getAvailableEvolutions(inst).includes(toSpeciesId)) return;
    evolve(inst, toSpeciesId);
    markOwned(save.value!, toSpeciesId);
    void persist();
  }

  // ── breeding ──
  function breed(aUid: string, bUid: string): { ok: boolean; msg: string; offspring?: PokemonInstance } {
    if (!save.value) return { ok: false, msg: '无存档' };
    const a = save.value.instances[aUid];
    const b = save.value.instances[bUid];
    if (!a || !b) return { ok: false, msg: '请选择两只宝可梦' };
    if (a.uid === b.uid) return { ok: false, msg: '不能选择同一只' };
    const result = doBreed(a, b);
    // consume parents from roster + both loadouts
    save.value.roster = save.value.roster.filter((u) => u !== aUid && u !== bUid);
    save.value.pveTeam = save.value.pveTeam.filter((u) => u !== aUid && u !== bUid);
    save.value.pvpTeam = save.value.pvpTeam.filter((u) => u !== aUid && u !== bUid);
    delete save.value.instances[aUid];
    delete save.value.instances[bUid];
    // add offspring (breeding frees a slot: -2 +1, so always room)
    addInstanceToSave(save.value, result.offspring);
    save.value.stats.bred += 1;
    void persist();
    return { ok: true, msg: result.info.join('\n'), offspring: result.offspring };
  }

  // ── battle result recording ──
  function recordBattle(result: BattleResult): void {
    if (!save.value) return;
    save.value.stats.battles += 1;
    if (result.win) save.value.stats.wins += 1;
    save.value.lastBattleResult = result;
    void persist();
  }

  // ── friends ──
  async function addFriend(username: string): Promise<void> {
    if (!save.value) return;
    await api.addFriend(username);
    if (!save.value.friends.includes(username)) save.value.friends.push(username);
  }

  function travelTo(mapId: string, x: number, y: number): void {
    if (!save.value) return;
    save.value.currentMapId = mapId;
    // keep current facing; crossing maps must never reset orientation abruptly
    save.value.position = { x, y, facing: save.value.position.facing };
    if (!save.value.visitedMaps.includes(mapId)) save.value.visitedMaps.push(mapId);
    void persist();
  }

  function updateSettings(s: Partial<PlayerSettings>): void {
    if (!save.value) return;
    save.value.settings = { ...save.value.settings, ...s };
    void persist();
  }

  function reset(): void {
    generation += 1;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    waiters.splice(0).forEach((resolve) => resolve(false));
    loadRequest = null;
    loaded.value = false; loading.value = false;
    error.value = null; saveError.value = null;
    lastSavedAt.value = null; unsaved.value = false;
    pendingWrites = 0; saving.value = false;
    save.value = null;
  }

  return {
    save, loading, loaded, error, saveError, saving, unsaved, lastSavedAt,
    hasSave, rosterInstances, pveTeamInstances, pvpTeamInstances, dexCount, dexSeen, rosterFull,
    ROSTER_MAX, PVE_TEAM_SIZE, PVP_TEAM_SIZE,
    getInstance, load, startWithStarter, persist,
    see, caught, addCaughtInstance, release, setPveTeam, setPvpTeam, setFormation,
    healAll, useItem, buyItem, grantExp, doEvolve, breed, recordBattle, addFriend,
    travelTo, updateSettings, reset,
  };
});

export { getMap, MAP_MAP, getSpecies };
