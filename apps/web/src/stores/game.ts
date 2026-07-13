import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { PlayerSave, PokemonInstance, PokedexEntry, PlayerSettings, BattleResult } from '@pokemon-online/shared';
import { SAVE_VERSION, ROSTER_MAX, PVE_TEAM_SIZE, PVP_TEAM_SIZE } from '@pokemon-online/shared';
import { getSpecies, getMap, ITEM_MAP, MAP_MAP, expForLevel } from '@pokemon-online/config';
import {
  createStarter, applyExp, evolve, heal, revive, cureStatus, maxHp,
  markSeen, markCaught, addInstanceToSave, releaseInstance, breed as doBreed,
  defaultFormation,
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
    pokedex: {
      [starterId]: { speciesId: starterId, seen: true, caught: true, firstSeenAt: now, firstCaughtAt: now, count: 1 },
    },
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
    story: { flags: [], activeQuest: 'meet-professor', completedQuests: [], tide: 'high' },
  };
}

/** Migrate older save shapes (party+box+battleTeam) to the roster + dual-loadout model. */
function migrateSave(s: PlayerSave): PlayerSave {
  const old = s as unknown as { party?: string[]; box?: string[]; battleTeam?: string[] };
  if (Array.isArray(old.party) && !Array.isArray(s.roster)) {
    s.roster = [...(old.party ?? []), ...(old.box ?? [])];
    const bt = old.battleTeam ?? [];
    s.pveTeam = bt.length ? bt.slice(0, PVE_TEAM_SIZE) : s.roster.slice(0, PVE_TEAM_SIZE);
    s.pvpTeam = bt.length ? bt.slice(0, PVP_TEAM_SIZE) : s.roster.slice(0, PVP_TEAM_SIZE);
    delete old.party;
    delete old.box;
    delete old.battleTeam;
  }
  if (!Array.isArray(s.roster)) s.roster = [];
  if (!Array.isArray(s.pveTeam)) s.pveTeam = [];
  if (!Array.isArray(s.pvpTeam)) s.pvpTeam = [];
  // v5: original story state. Old free-exploration saves enter at the opening
  // objective without losing any captured Pokemon or map progress.
  if (!s.story) s.story = { flags: [], activeQuest: 'meet-professor', completedQuests: [], tide: 'high' };
  if (!Array.isArray(s.story.flags)) s.story.flags = [];
  if (!Array.isArray(s.story.completedQuests)) s.story.completedQuests = [];
  if (s.story.tide !== 'high' && s.story.tide !== 'low') s.story.tide = 'high';
  if (!s.story.activeQuest) s.story.activeQuest = 'meet-professor';
  // v4: free-placement formation (阵型). Missing/short -> default.
  if (!Array.isArray(s.formation) || s.formation.length < 3) s.formation = defaultFormation();
  // prune loadout uids no longer in roster
  s.pveTeam = s.pveTeam.filter((u) => s.instances[u]);
  s.pvpTeam = s.pvpTeam.filter((u) => s.instances[u]);
  // v3: player facing on the world map + visited-maps discovery
  if (!s.position) s.position = { x: 8, y: 6, facing: 'down' };
  if (!s.position.facing) s.position.facing = 'down';
  if (!Array.isArray(s.visitedMaps) || s.visitedMaps.length === 0) {
    s.visitedMaps = [s.currentMapId];
  } else if (!s.visitedMaps.includes(s.currentMapId)) {
    s.visitedMaps.push(s.currentMapId);
  }
  s.version = SAVE_VERSION;
  return s;
}

export interface ExpGainResult {
  uid: string;
  fromLevel: number;
  toLevel: number;
  learnedSkills: string[];
  evolutions: number[];
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useGameStore = defineStore('game', () => {
  const auth = useAuthStore();
  const save = ref<PlayerSave | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const saving = ref(false);
  const lastSavedAt = ref<number | null>(null);

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

  async function load(): Promise<void> {
    loading.value = true; error.value = null;
    try {
      const s = await api.getSave();
      save.value = s ? migrateSave(s) : s;
    } catch (e) {
      error.value = e instanceof Error ? e.message : '加载存档失败';
    } finally {
      loading.value = false;
    }
  }

  async function startWithStarter(starterId: number): Promise<void> {
    if (!auth.playerId || !auth.username) throw new Error('未登录');
    save.value = freshSave(auth.playerId, auth.username, starterId);
    markSeen(save.value, starterId);
    markCaught(save.value, starterId);
    await persist(true);
  }

  function persist(immediate = false): Promise<void> {
    if (!save.value) return Promise.resolve();
    save.value.updatedAt = Date.now();
    if (immediate) return doPersist();
    if (saveTimer) clearTimeout(saveTimer);
    return new Promise((resolve) => {
      saveTimer = setTimeout(async () => { await doPersist(); resolve(); }, 1200);
    });
  }

  async function doPersist(): Promise<void> {
    if (!save.value) return;
    saving.value = true;
    try {
      const r = await api.putSave(save.value);
      lastSavedAt.value = r.savedAt;
    } catch (e) {
      error.value = e instanceof Error ? e.message : '保存失败';
    } finally {
      saving.value = false;
    }
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
      if (e.magnitude === -1) {
        // rare candy: level up by 1
        target.level += 1;
        target.exp = expForLevel(getSpecies(target.speciesId).growthRate, target.level);
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
    if (!inst) return;
    evolve(inst, toSpeciesId);
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

  function hasStoryFlag(flag: string): boolean {
    return !!save.value?.story.flags.includes(flag);
  }

  function advanceStory(flags: string[] = [], activeQuest?: string): void {
    if (!save.value) return;
    for (const flag of flags) if (!save.value.story.flags.includes(flag)) save.value.story.flags.push(flag);
    if (activeQuest) save.value.story.activeQuest = activeQuest;
    void persist();
  }

  function setTide(tide: 'high' | 'low'): void {
    if (!save.value || save.value.story.tide === tide) return;
    save.value.story.tide = tide;
    void persist();
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
    save.value = null;
  }

  return {
    save, loading, error, saving, lastSavedAt,
    hasSave, rosterInstances, pveTeamInstances, pvpTeamInstances, dexCount, dexSeen, rosterFull,
    ROSTER_MAX, PVE_TEAM_SIZE, PVP_TEAM_SIZE,
    getInstance, load, startWithStarter, persist,
    see, caught, addCaughtInstance, release, setPveTeam, setPvpTeam, setFormation,
    healAll, useItem, buyItem, grantExp, doEvolve, breed, recordBattle, addFriend,
    hasStoryFlag, advanceStory, setTide, travelTo, updateSettings, reset,
  };
});

export { getMap, MAP_MAP, getSpecies };
