import type { StoryState } from '@pokemon-online/shared';

export type NpcPalette = 'researcher' | 'rival' | 'scout' | 'villager';
export interface StoryNpc {
  id: string;
  mapId: string;
  x: number;
  y: number;
  name: string;
  role: string;
  palette: NpcPalette;
  requires?: string[];
  hideWhen?: string[];
}

export interface StoryLine { speaker: string; role?: string; text: string; }
export interface StoryChoice { label: string; kind: 'close' | 'trainer-battle' | 'warp' | 'set-tide'; battleId?: string; mapId?: string; x?: number; y?: number; tide?: 'high' | 'low'; }
export type StoryObjectKind = 'signal' | 'core' | 'tablet' | 'star' | 'tide-gauge' | 'ship-log' | 'anchor' | 'gravity-node' | 'terminal' | 'legend-echo';
export interface StoryObject {
  id: string;
  mapId: string;
  x: number;
  y: number;
  name: string;
  kind: StoryObjectKind;
  requires?: string[];
  hideWhen?: string[];
  tide?: 'high' | 'low';
}
export interface StoryScene {
  lines: StoryLine[];
  choices?: StoryChoice[];
  grantFlags?: string[];
  activeQuest?: string;
  tide?: 'high' | 'low';
}
export interface StoryTrainer {
  id: string;
  name: string;
  team: { speciesId: number; level: number }[];
  winFlags: string[];
  questAfter: string;
  winText?: string;
  /** Friendly rematches never advance story or grant repeatable EXP. */
  repeatable?: boolean;
  rewardExp?: boolean;
}

/**
 * 「澜潮群岛」是项目自己的原创舞台：一场从潮汐信号开始的冒险。
 * 它只借鉴经典怪物收集 RPG 的探索节奏，不复用任何既有作品的剧情、
 * 地图、角色或文本。
 */
export const STORY_NPCS: StoryNpc[] = [
  { id: 'professor-lan', mapId: 'pallet', x: 6, y: 6, name: '澜博士', role: '潮汐研究员', palette: 'researcher' },
  { id: 'rival-baiye', mapId: 'pallet', x: 10, y: 8, name: '白夜', role: '你的劲敌', palette: 'rival', requires: ['professor_briefed'] },
  { id: 'lantern-scout', mapId: 'route1', x: 7, y: 5, name: '岚巡员', role: '萤火林道巡查员', palette: 'scout', requires: ['rival_defeated'] },
  { id: 'mist-runner', mapId: 'viridian-forest', x: 10, y: 9, name: '织羽', role: '雾行试炼者', palette: 'scout', requires: ['lumen_3'], hideWhen: ['mist_runner_defeated'] },
  { id: 'harbor-villager', mapId: 'pallet', x: 12, y: 5, name: '渔人阿澈', role: '雾湾镇居民', palette: 'villager' },
  { id: 'ridge-guide', mapId: 'route3', x: 6, y: 8, name: '陵导员 洛岩', role: '星陨高径向导', palette: 'scout', requires: ['chapter_one_complete'] },
  { id: 'sky-cartographer', mapId: 'mt-moon', x: 11, y: 8, name: '星图师 朔', role: '观测所守门人', palette: 'researcher', requires: ['star_3'], hideWhen: ['cartographer_defeated'] },
  { id: 'tide-captain', mapId: 'sea-route', x: 6, y: 10, name: '船长 赛岚', role: '静潮群岛船长', palette: 'villager', requires: ['lens_aligned'] },
  { id: 'chart-apprentice', mapId: 'sea-route', x: 11, y: 5, name: '海图学徒 宁墨', role: '沉船调查员', palette: 'researcher', requires: ['tide_low'] },
  { id: 'reef-keeper', mapId: 'dragon-den', x: 10, y: 8, name: '潮洞守望者 砾', role: '潮洞守望者', palette: 'scout', requires: ['ship_log_found'] },
];


export const STORY_OBJECTS: StoryObject[] = [
  { id: 'lumen-1', mapId: 'viridian-forest', x: 3, y: 4, name: '第一枚潮光孢子', kind: 'signal', requires: ['firefly_signal_found'], hideWhen: ['lumen_1'] },
  { id: 'lumen-2', mapId: 'viridian-forest', x: 12, y: 7, name: '第二枚潮光孢子', kind: 'signal', requires: ['lumen_1'], hideWhen: ['lumen_2'] },
  { id: 'lumen-3', mapId: 'viridian-forest', x: 4, y: 11, name: '第三枚潮光孢子', kind: 'signal', requires: ['lumen_2'], hideWhen: ['lumen_3'] },
  { id: 'anomaly-core', mapId: 'viridian-forest', x: 8, y: 5, name: '潮汐异相核', kind: 'core', requires: ['mist_runner_defeated'], hideWhen: ['anomaly_calm'] },
  { id: 'star-1', mapId: 'route3', x: 3, y: 4, name: '坠星刻痕·一', kind: 'star', requires: ['chapter_one_complete'], hideWhen: ['star_1'] },
  { id: 'star-2', mapId: 'route3', x: 12, y: 6, name: '坠星刻痕·二', kind: 'star', requires: ['star_1'], hideWhen: ['star_2'] },
  { id: 'star-3', mapId: 'route3', x: 5, y: 11, name: '坠星刻痕·三', kind: 'star', requires: ['star_2'], hideWhen: ['star_3'] },
  { id: 'observatory-lens', mapId: 'mt-moon', x: 8, y: 5, name: '失焦观星镜', kind: 'core', requires: ['cartographer_defeated'], hideWhen: ['lens_aligned'] },
  { id: 'tide-gauge', mapId: 'sea-route', x: 4, y: 10, name: '潮位仪', kind: 'tide-gauge', requires: ['tide_briefed'] },
  { id: 'ship-log', mapId: 'sea-route', x: 12, y: 4, name: '沉船航海日志', kind: 'ship-log', requires: ['tide_low'], hideWhen: ['ship_log_found'], tide: 'low' },
  { id: 'tide-anchor', mapId: 'dragon-den', x: 8, y: 5, name: '深潮锚印', kind: 'anchor', requires: ['reef_trial_won'], hideWhen: ['deep_anchor_calm'] },
  { id: 'deep-space-gate', mapId: 'dragon-den', x: 8, y: 2, name: '深空裂隙', kind: 'core', requires: ['deep_anchor_calm'] },
  { id: 'gravity-node-1', mapId: 'deep-space', x: 3, y: 2, name: '失重晶簇·一', kind: 'gravity-node', requires: ['deep_anchor_calm'], hideWhen: ['gravity_node_1'] },
  { id: 'gravity-node-2', mapId: 'deep-space', x: 12, y: 5, name: '失重晶簇·二', kind: 'gravity-node', requires: ['gravity_node_1'], hideWhen: ['gravity_node_2'] },
  { id: 'gravity-node-3', mapId: 'deep-space', x: 5, y: 10, name: '失重晶簇·三', kind: 'gravity-node', requires: ['gravity_node_2'], hideWhen: ['gravity_node_3'] },
  { id: 'ancient-terminal', mapId: 'deep-space', x: 8, y: 5, name: '古代终端', kind: 'terminal', requires: ['gravity_node_3'], hideWhen: ['terminal_awakened'] },
  { id: 'rift-heart', mapId: 'deep-space', x: 8, y: 9, name: '裂隙守卫核心', kind: 'core', requires: ['terminal_awakened'], hideWhen: ['rift_guardian_calm'] },
  { id: 'legend-echo', mapId: 'deep-space', x: 8, y: 2, name: '幻兽回响', kind: 'legend-echo', requires: ['rift_guardian_calm'], hideWhen: ['deep_space_chapter_complete'] },
];

export const STORY_TRAINERS: Record<string, StoryTrainer> = {
  'baiye-first': {
    id: 'baiye-first', name: '劲敌 白夜', team: [{ speciesId: 133, level: 7 }],
    winFlags: ['rival_defeated'], questAfter: 'investigate-firefly',
    winText: '白夜露出不甘心的笑容："这次算你赢。潮汐的谜团，我们各凭本事。"',
  },
  'baiye-rematch': {
    id: 'baiye-rematch', name: '劲敌 白夜（切磋）', team: [{ speciesId: 133, level: 7 }],
    winFlags: [], questAfter: '', repeatable: true, rewardExp: false,
    winText: '白夜收起精灵球："不错，再来一次也不会让你松懈。"',
  },
  'mist-runner-trial': {
    id: 'mist-runner-trial', name: '雾行试炼者 织羽', team: [{ speciesId: 48, level: 8 }],
    winFlags: ['mist_runner_defeated'], questAfter: 'confront-anomaly',
    winText: '织羽收起捕虫网："那团光果然在等你。它就在林子中央，别让它吞掉你的心跳。"',
  },
  'anomaly-core': {
    id: 'anomaly-core', name: '潮汐异相·海星星', team: [{ speciesId: 120, level: 9 }],
    winFlags: ['anomaly_calm'], questAfter: 'return-to-lan',
    winText: '蓝光终于安静下来，碎成一枚温暖的潮印。远处的潮汐仪也停止了尖鸣。',
  },
  'cartographer-trial': {
    id: 'cartographer-trial', name: '星图师 朔', team: [{ speciesId: 81, level: 12 }, { speciesId: 35, level: 11 }],
    winFlags: ['cartographer_defeated'], questAfter: 'align-lens',
    winText: '朔放下星盘："潮印并非来自海里——它在回应天空。去校准观星镜，看看是谁在向群岛投下影子。"',
  },
  'observatory-lens': {
    id: 'observatory-lens', name: '失焦星镜·皮可西', team: [{ speciesId: 36, level: 14 }],
    winFlags: ['lens_aligned'], questAfter: 'eastbound-signal',
    winText: '星镜重新对焦，一束银蓝色星光掠过东海。潮印上浮现新的坐标：断潮群岛。',
  },
  'reef-trial': {
    id: 'reef-trial', name: '礁石巡护员 沧汐', team: [{ speciesId: 116, level: 16 }, { speciesId: 90, level: 15 }],
    winFlags: ['reef_trial_won'], questAfter: 'enter-tide-cave',
    winText: '沧汐点亮潮灯："潮洞的门已经开了。那艘船留下的东西，不该继续沉在黑水里。"',
  },
  'tide-anchor': {
    id: 'tide-anchor', name: '深潮锚印·毒刺水母', team: [{ speciesId: 73, level: 18 }],
    winFlags: ['deep_anchor_calm'], questAfter: 'deep-space-gate',
    winText: '锚印碎裂成一道深紫色坐标。潮洞尽头的裂缝短暂露出无星的另一侧。',
  },
  'rift-heart': {
    id: 'rift-heart', name: '裂隙守卫·多边兽', team: [{ speciesId: 137, level: 21 }, { speciesId: 81, level: 20 }],
    winFlags: ['rift_guardian_calm'], questAfter: 'follow-legend-echo',
    winText: '守卫核心停止了警报。终端投出一段柔和的光谱，一道轻盈的幻兽身影正穿过裂隙。',
  },
};

/** Low tide exposes a narrow outer-reef shelf on 静潮群岛. The cells are
 * still visible at high tide, but the player cannot safely step across them. */
const LOW_TIDE_REEF = new Set(['10,4', '11,4', '12,4', '10,5', '11,5']);
export function isLowTideReefCell(mapId: string, x: number, y: number): boolean {
  return mapId === 'sea-route' && LOW_TIDE_REEF.has(`${x},${y}`);
}
export function isTideBlockedCell(mapId: string, x: number, y: number, tide: 'high' | 'low' | undefined): boolean {
  return isLowTideReefCell(mapId, x, y) && tide !== 'low';
}

export function hasStoryFlag(story: StoryState | undefined, flag: string): boolean {
  return !!story?.flags.includes(flag);
}
export function visibleStoryObjects(mapId: string, story: StoryState | undefined): StoryObject[] {
  return STORY_OBJECTS.filter((object) => object.mapId === mapId
    && !(object.requires ?? []).some((flag) => !hasStoryFlag(story, flag))
    && !(object.hideWhen ?? []).some((flag) => hasStoryFlag(story, flag))
    && (!object.tide || story?.tide === object.tide));
}
export function visibleStoryNpcs(mapId: string, story: StoryState | undefined): StoryNpc[] {
  return STORY_NPCS.filter((npc) => npc.mapId === mapId
    && !(npc.requires ?? []).some((flag) => !hasStoryFlag(story, flag))
    && !(npc.hideWhen ?? []).some((flag) => hasStoryFlag(story, flag)));
}
export function storyQuestLabel(id: string): string {
  const labels: Record<string, string> = {
    'meet-professor': '前往澜博士身边，听听她的委托。',
    'challenge-baiye': '和白夜切磋，证明你能照顾好伙伴。',
    'investigate-firefly': '前往萤火林道，寻找潮汐信号的源头。',
    'speak-scout': '向萤火林道的岚巡员询问异常光点。',
    'mistwood-open': '进入迷雾林境，寻找第一枚潮光孢子。',
    'follow-lumens': '依次追踪迷雾林境中的潮光孢子。',
    'confront-anomaly': '前往林境中央，面对潮汐异相核。',
    'return-to-lan': '带着潮印碎片返回雾湾镇，向澜博士报告。',
    'chapter-one-complete': '与澜博士交谈，确认潮印的下一处坐标。',
    'climb-starfell': '前往星陨高径，寻找三道坠星刻痕。',
    'read-stars': '依次调查星陨高径上的坠星刻痕。',
    'challenge-cartographer': '前往星陨观测所，接受星图师朔的试炼。',
    'align-lens': '调查观测所中央失焦的观星镜。',
    'eastbound-signal': '前往静潮群岛，寻找东海坐标的起点。',
    'read-tide': '与船长赛岚交谈，了解静潮群岛的潮位。',
    'find-ship-log': '将潮位调至低潮，前往礁石外侧寻找沉船航海日志。',
    'meet-reef-keeper': '带着航海日志进入潮洞，寻找守望者砾。',
    'enter-tide-cave': '接受礁石巡护员的试炼，打开潮洞深处。',
    'calm-deep-anchor': '调查潮洞中央的深潮锚印。',
    'deep-space-gate': '第三章完成：追随深紫坐标，前往深空遗址。',
    'stabilize-gravity': '调查深空遗址中的三簇失重晶体，让漂浮石台恢复稳定。',
    'awaken-terminal': '将三簇晶体的回响带回遗址中央的古代终端。',
    'face-rift-guardian': '遗址的守卫核心已启动；让它从失控的警报中平静下来。',
    'follow-legend-echo': '跟随穿过裂隙的幻兽回响，读懂古代终端留下的讯息。',
    'deep-space-complete': '第四章完成：带着深空遗址的记录，返回雾湾镇。',
  };
  return labels[id] ?? '继续在澜潮群岛探索。';
}
export function sceneForNpc(npcId: string, story: StoryState): StoryScene {
  const flagged = (flag: string) => hasStoryFlag(story, flag);
  if (npcId === 'professor-lan') {
    if (flagged('anomaly_calm') && !flagged('chapter_one_complete')) return {
      lines: [
        { speaker: '澜博士', role: '潮汐研究员', text: '潮印碎片的频率和今早的脉冲完全一致……可它不是机器发出的信号。' },
        { speaker: '澜博士', text: '做得很好。第一层迷雾已经散开，但群岛深处还有更多回声。我们得去星陨观测所。' },
      ], grantFlags: ['chapter_one_complete'], activeQuest: 'climb-starfell',
    };
    if (!flagged('professor_briefed')) return {
      lines: [
        { speaker: '澜博士', role: '潮汐研究员', text: '你终于醒了。今早灯塔下的潮汐仪记录到一段不属于任何已知宝可梦的脉冲。' },
        { speaker: '澜博士', text: '你的伙伴似乎也听见了它。白夜在港口等你——先和他切磋一次，让我看看你们的默契。' },
      ], grantFlags: ['professor_briefed'], activeQuest: 'challenge-baiye',
    };
    return { lines: [{ speaker: '澜博士', role: '潮汐研究员', text: flagged('rival_defeated') ? '萤火林道的光点越来越亮了。别急，先观察环境，再让伙伴出手。' : '白夜就在广场东侧。你们的切磋不会有危险，但要认真对待伙伴。' }] };
  }
  if (npcId === 'rival-baiye') {
    if (!flagged('rival_defeated')) return {
      lines: [
        { speaker: '白夜', role: '你的劲敌', text: '澜博士又把麻烦交给你了？正好，让我看看你和新伙伴能不能跟上我的节奏。' },
        { speaker: '白夜', text: '这不是胜负而已——在真正的异象前，犹豫会让伙伴受伤。来一场切磋！' },
      ], choices: [{ label: '接受切磋', kind: 'trainer-battle', battleId: 'baiye-first' }, { label: '稍后再说', kind: 'close' }],
    };
    return {
      lines: [{ speaker: '白夜', role: '你的劲敌', text: '不错嘛。萤火林道的巡查员说，他也看见了海蓝色的光。想再确认阵容的话，随时来切磋。' }],
      choices: [{ label: '再次切磋（不推进剧情）', kind: 'trainer-battle', battleId: 'baiye-rematch' }, { label: '先去探索', kind: 'close' }],
    };
  }
  if (npcId === 'lantern-scout') {
    if (!flagged('firefly_signal_found')) return {
      lines: [
        { speaker: '岚巡员', role: '萤火林道巡查员', text: '你也在找那道蓝光？它往北面的雾林去了，可那里的路被旧藤蔓封住。' },
        { speaker: '岚巡员', text: '我已经清出一条小径。孢子会依次回应潮印——别急着冲进迷雾，先听清它们的节奏。' },
      ], grantFlags: ['firefly_signal_found'], activeQuest: 'mistwood-open',
    };
    return { lines: [{ speaker: '岚巡员', role: '萤火林道巡查员', text: flagged('anomaly_calm') ? '蓝光平静了。雾湾的人终于能安心睡一晚。' : '迷雾里有三枚潮光孢子，它们会一枚接一枚亮起。顺着它们走。' }] };
  }
  if (npcId === 'mist-runner') return {
    lines: [
      { speaker: '织羽', role: '雾行试炼者', text: '能让三枚潮光孢子同时回应，说明你的伙伴没有被异相迷惑。' },
      { speaker: '织羽', text: '但林子的中心会放大恐惧。先用一场战斗告诉我，你是靠命令，还是靠信任前进。' },
    ], choices: [{ label: '接受试炼', kind: 'trainer-battle', battleId: 'mist-runner-trial' }, { label: '准备一下', kind: 'close' }],
  };
  if (npcId === 'ridge-guide') return {
    lines: [{ speaker: '洛岩', role: '星陨高径向导', text: flagged('star_3') ? '三道刻痕已连成一条弧线。观测所的朔会等你。' : '山风会抹去脚印，但抹不掉坠星留下的刻痕。按它们回应的顺序寻找。' }],
  };
  if (npcId === 'sky-cartographer') return {
    lines: [
      { speaker: '朔', role: '观测所守门人', text: '三道刻痕都亮了？潮印果然把你带到了这里。可星图不向犹豫的人展开。' },
      { speaker: '朔', text: '用一场切磋告诉我：当答案来自天外时，你还会信任身边的伙伴吗？' },
    ], choices: [{ label: '接受星图试炼', kind: 'trainer-battle', battleId: 'cartographer-trial' }, { label: '稍后再来', kind: 'close' }],
  };
  if (npcId === 'tide-captain') {
    if (!flagged('tide_low')) return {
      lines: [
        { speaker: '赛岚', role: '静潮群岛船长', text: '东海的坐标把你送到这里？那你来得正是时候。静潮群岛一天只露一次礁石路。' },
        { speaker: '赛岚', text: '去码头边的潮位仪，把潮位调到低潮。沉船的日志也许知道那道紫色坐标从哪里来。' },
      ], grantFlags: ['tide_briefed'], activeQuest: 'find-ship-log',
    };
    return { lines: [{ speaker: '赛岚', role: '静潮群岛船长', text: flagged('ship_log_found') ? '潮洞深处的水从不说谎。守望者砾会带你去看那枚锚印。' : '低潮不会持续太久，礁石外侧的船骸就在北面。' }] };
  }
  if (npcId === 'chart-apprentice') return { lines: [{ speaker: '宁墨', role: '沉船调查员', text: flagged('ship_log_found') ? '日志里的最后一页写着："星光落海，锚印向下。" 这不像普通航海事故。' : '海图上的暗礁只在低潮时露出。船长说得对，别等海水回来。' }] };
  if (npcId === 'reef-keeper') return {
    lines: [
      { speaker: '砾', role: '潮洞守望者', text: '航海日志把你带来了。沉船的人不是失踪，而是被深潮锚印的回声引向了洞底。' },
      { speaker: '砾', text: '想靠近锚印，先通过巡护员的试炼。潮洞不欢迎只会追逐答案的人。' },
    ], choices: [{ label: '接受潮礁试炼', kind: 'trainer-battle', battleId: 'reef-trial' }, { label: '稍后准备', kind: 'close' }],
  };
  return { lines: [{ speaker: '渔人阿澈', role: '雾湾镇居民', text: '雾湾的潮水每天都不一样。今天的浪啊，像是在给谁传递消息。' }] };
}

export function sceneForObject(objectId: string, story: StoryState): StoryScene {
  if (objectId === 'lumen-1') return { lines: [{ speaker: '潮光孢子', text: '第一枚孢子在掌心般的蓝光中苏醒，指向林境更深处。' }], grantFlags: ['lumen_1'], activeQuest: 'follow-lumens' };
  if (objectId === 'lumen-2') return { lines: [{ speaker: '潮光孢子', text: '第二枚孢子绕着你的伙伴转了一圈，雾中的脚印短暂显现。' }], grantFlags: ['lumen_2'], activeQuest: 'follow-lumens' };
  if (objectId === 'lumen-3') return { lines: [{ speaker: '潮光孢子', text: '第三枚孢子发出清亮回响。林境中央的异相核正在回应你。' }], grantFlags: ['lumen_3'], activeQuest: 'follow-lumens' };
  if (objectId === 'star-1') return { lines: [{ speaker: '坠星刻痕', text: '第一道刻痕像潮水一样向北弯折。星尘在石面上留下短暂的蓝白轨迹。' }], grantFlags: ['star_1'], activeQuest: 'read-stars' };
  if (objectId === 'star-2') return { lines: [{ speaker: '坠星刻痕', text: '第二道刻痕与潮印共鸣。远处观测所的穹顶闪过一次银光。' }], grantFlags: ['star_2'], activeQuest: 'read-stars' };
  if (objectId === 'star-3') return { lines: [{ speaker: '坠星刻痕', text: '第三道刻痕完成星图。高径尽头的门锁传来低沉回响。' }], grantFlags: ['star_3'], activeQuest: 'challenge-cartographer' };
  if (objectId === 'tide-gauge') {
    if (story.tide === 'low') return {
      lines: [{ speaker: '潮位仪', text: '指针停在低潮。礁石路仍露在水面上，沉船外侧可以通行。' }],
      choices: [{ label: '切换为高潮', kind: 'set-tide', tide: 'high' }, { label: '保持低潮', kind: 'close' }],
    };
    return {
      lines: [{ speaker: '潮位仪', text: '潮位正在上涨。将它调至低潮，礁石路与沉船桅杆就会露出水面。' }],
      choices: [{ label: '切换为低潮', kind: 'set-tide', tide: 'low' }, { label: '暂时不调整', kind: 'close' }],
    };
  }
  if (objectId === 'ship-log') return {
    lines: [
      { speaker: '沉船航海日志', text: '日志被盐水浸透："第七夜，星光坠入海中。锚印在潮洞里苏醒，船员听见了不属于海的呼唤。"' },
      { speaker: '沉船航海日志', text: '末页画着一枚向下的紫色符号，旁边标注："交给潮洞守望者。"' },
    ], grantFlags: ['ship_log_found'], activeQuest: 'meet-reef-keeper',
  };
  if (objectId === 'tide-anchor') return {
    lines: [
      { speaker: '深潮锚印', text: '锚印周围的水面悬在半空，深紫色光线把潮洞映成没有尽头的星海。' },
      { speaker: '砾', role: '潮洞守望者', text: '就是它。平息这枚锚印，坐标才会露出来。' },
    ], choices: [{ label: '平息深潮锚印', kind: 'trainer-battle', battleId: 'tide-anchor' }, { label: '暂时观察', kind: 'close' }],
  };
  if (objectId === 'deep-space-gate') return {
    lines: [{ speaker: '深空裂隙', text: '裂隙另一侧没有海、没有风，只有一座悬浮在紫蓝晶体中的遗址。潮印正指向那里。' }],
    choices: [{ label: '踏入深空遗址', kind: 'warp', mapId: 'deep-space', x: 8, y: 12 }, { label: '暂时返回', kind: 'close' }],
  };
  if (objectId === 'gravity-node-1') return {
    lines: [
      { speaker: '失重晶簇', text: '第一簇晶体轻轻离开地面。它的脉冲让附近的石台停止倾斜，指向遗址东侧。' },
    ], grantFlags: ['gravity_node_1'], activeQuest: 'stabilize-gravity',
  };
  if (objectId === 'gravity-node-2') return {
    lines: [
      { speaker: '失重晶簇', text: '第二簇晶体在掌心上方旋转。终端的符号短暂亮起，最后一道回响藏在南侧平台。' },
    ], grantFlags: ['gravity_node_2'], activeQuest: 'stabilize-gravity',
  };
  if (objectId === 'gravity-node-3') return {
    lines: [
      { speaker: '失重晶簇', text: '第三簇晶体与潮印重叠，散开的石台缓缓归位。古代终端终于接收到完整频率。' },
    ], grantFlags: ['gravity_node_3'], activeQuest: 'awaken-terminal',
  };
  if (objectId === 'ancient-terminal') return {
    lines: [
      { speaker: '古代终端', text: '终端以无法辨识的文字记录："潮汐不是海的语言，而是穿过世界边缘的门。"' },
      { speaker: '古代终端', text: '一道警报骤然切断投影。遗址守卫将你识别为入侵者，核心正在聚集失控的电光。' },
    ], grantFlags: ['terminal_awakened'], activeQuest: 'face-rift-guardian',
  };
  if (objectId === 'rift-heart') return {
    lines: [
      { speaker: '裂隙守卫核心', text: '紫蓝色方块在半空重组，机械音反复宣告："坐标未校验，禁止接近回响源。"' },
      { speaker: '潮印', role: '共鸣', text: '你的伙伴靠近了一步。也许战斗不是摧毁守卫，而是让它听见现在的世界。' },
    ], choices: [{ label: '平息裂隙守卫', kind: 'trainer-battle', battleId: 'rift-heart' }, { label: '暂时后退', kind: 'close' }],
  };
  if (objectId === 'legend-echo') return {
    lines: [
      { speaker: '幻兽回响', text: '一只轻盈的身影从晶体间掠过，只留下一串像潮声又像星光的音符。它没有停下，却回头看了你一眼。' },
      { speaker: '古代终端', role: '译文', text: '"当潮汐与群星再次同频，边界将被温柔地打开。守护回响，而非占有它。"' },
      { speaker: '澜博士的记录仪', role: '通讯', text: '我收到了！那不是求救信号，是某种古老的航标。快回来吧，我们要重新绘制整片群岛的星图。' },
    ], grantFlags: ['deep_space_chapter_complete'], activeQuest: 'deep-space-complete',
    choices: [{ label: '返回雾湾镇', kind: 'warp', mapId: 'pallet', x: 8, y: 11 }, { label: '继续探索遗址', kind: 'close' }],
  };
  if (objectId === 'observatory-lens') return {
    lines: [
      { speaker: '失焦观星镜', text: '镜面映出一只被银蓝星光笼罩的身影。它正把天空的回声扭成刺耳的杂音。' },
      { speaker: '朔', role: '星图师', text: '校准镜面需要让那股力量平静下来。准备好了就和它战斗。' },
    ], choices: [{ label: '校准星镜', kind: 'trainer-battle', battleId: 'observatory-lens' }, { label: '暂时观察', kind: 'close' }],
  };
  return {
    lines: [
      { speaker: '潮汐异相核', text: '蓝色晶核剧烈震动，周围的草叶被无形潮声压低。' },
      { speaker: '澜博士的记录仪', role: '通讯', text: '那不是普通野生宝可梦！让伙伴用你们的节奏，把它从异相里唤醒！' },
    ], choices: [{ label: '平息异相', kind: 'trainer-battle', battleId: 'anomaly-core' }, { label: '暂时观察', kind: 'close' }],
  };
}

/** Route progression gates. The UI gives a diegetic hint instead of silently
 * blocking the player. */
export const STORY_WARP_REQUIREMENTS: Record<string, { flag: string; hint: string }> = {
  'pallet:route1': { flag: 'rival_defeated', hint: '先完成和白夜的切磋；澜博士希望你们先磨合默契。' },
  'route1:viridian-forest': { flag: 'firefly_signal_found', hint: '先向萤火林道的岚巡员询问蓝色光点的去向。' },
  'viridian-forest:route3': { flag: 'chapter_one_complete', hint: '先把潮印碎片带回雾湾镇，请澜博士解析它的坐标。' },
  'route3:mt-moon': { flag: 'star_3', hint: '先找到星陨高径上的三道坠星刻痕，观测所的门才会回应潮印。' },
  'mt-moon:rock-tunnel': { flag: 'lens_aligned', hint: '先校准观星镜，确认东海坐标后再前往裂谷。' },
  'rock-tunnel:sea-route': { flag: 'lens_aligned', hint: '裂谷尽头的潮门尚未开启；先完成观测所的星镜校准。' },
};
