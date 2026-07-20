import type { Species, TypeName, Stats, GrowthRate, Rarity, LearnsetEntry, CombatRole, NormalAttackDelivery } from '@pokemon-online/shared';
import { TYPE_LEARNSET, SKILL_MAP } from './skills.ts';
import { TYPE_PASSIVE_POOL, GENERIC_PASSIVE_POOL } from './passive-skills.ts';

/**
 * The 151 Gen-1 Pokemon (《神奇宝贝》第一部动画 world). This is the raw identity
 * data; everything mechanical (learnsets, ability pools, passive pools) is
 * generated from type pools so adding new generations is purely additive.
 *
 * Raw tuple: [id, cnName, enName, types, [hp,atk,def,spAtk,spDef,spd],
 *             growthRate, rarity, height(m), weight(kg), dex]
 */
type Raw = [
  number, string, string, TypeName[],
  [number, number, number, number, number, number],
  GrowthRate, Rarity, number, number, string,
];

const RAW: Raw[] = [
  [1, '妙蛙种子', 'bulbasaur', ['grass', 'poison'], [45, 49, 49, 65, 65, 45], 'medium-slow', 'uncommon', 0.7, 6.9, '背上的种子会吸收阳光成长。'],
  [2, '妙蛙草', 'ivysaur', ['grass', 'poison'], [60, 62, 63, 80, 80, 60], 'medium-slow', 'uncommon', 1.0, 13.0, '花苞散发出淡淡香气。'],
  [3, '妙蛙花', 'venusaur', ['grass', 'poison'], [80, 82, 83, 100, 100, 80], 'medium-slow', 'rare', 2.0, 100.0, '巨大的花朵收集阳光。'],
  [4, '小火龙', 'charmander', ['fire'], [39, 52, 43, 60, 50, 65], 'medium-slow', 'uncommon', 0.6, 8.5, '尾巴的火焰是生命之灯。'],
  [5, '火恐龙', 'charmeleon', ['fire'], [58, 64, 58, 80, 65, 80], 'medium-slow', 'uncommon', 1.1, 19.0, '暴躁的性情与炽热爪子。'],
  [6, '喷火龙', 'charizard', ['fire', 'flying'], [78, 84, 78, 109, 85, 100], 'medium-slow', 'rare', 1.7, 90.5, '能融化岩石的灼热吐息。'],
  [7, '杰尼龟', 'squirtle', ['water'], [44, 48, 65, 50, 64, 43], 'medium-slow', 'uncommon', 0.5, 9.0, '龟壳是绝佳的防护。'],
  [8, '卡咪龟', 'wartortle', ['water'], [59, 63, 80, 65, 80, 58], 'medium-slow', 'uncommon', 1.0, 22.5, '毛茸茸的尾巴象征长寿。'],
  [9, '水箭龟', 'blastoise', ['water'], [79, 83, 100, 85, 105, 78], 'medium-slow', 'rare', 1.6, 85.5, '背上的水炮能击穿钢板。'],
  [10, '绿毛虫', 'caterpie', ['bug'], [45, 30, 35, 20, 20, 45], 'medium-fast', 'common', 0.3, 2.9, '触角散发难闻气味。'],
  [11, '铁甲蛹', 'metapod', ['bug'], [50, 20, 55, 25, 25, 30], 'medium-fast', 'common', 0.7, 9.9, '静静等待羽化。'],
  [12, '巴大蝶', 'butterfree', ['bug', 'flying'], [60, 45, 50, 90, 80, 70], 'medium-fast', 'uncommon', 1.1, 32.0, '翅膀覆盖着防水的鳞粉。'],
  [13, '独角虫', 'weedle', ['bug', 'poison'], [40, 35, 30, 20, 20, 50], 'medium-fast', 'common', 0.3, 3.2, '头顶与尾部的毒针很危险。'],
  [14, '铁壳蛹', 'kakuna', ['bug', 'poison'], [45, 25, 50, 25, 25, 35], 'medium-fast', 'common', 0.6, 10.0, '外壳坚硬以待进化。'],
  [15, '大针蜂', 'beedrill', ['bug', 'poison'], [65, 90, 40, 45, 80, 75], 'medium-fast', 'uncommon', 1.0, 29.5, '尾部的毒针威力惊人。'],
  [16, '波波', 'pidgey', ['normal', 'flying'], [40, 45, 40, 35, 35, 56], 'medium-fast', 'common', 0.3, 1.8, '性格温和，飞行稳健。'],
  [17, '比比鸟', 'pidgeotto', ['normal', 'flying'], [63, 60, 55, 50, 50, 71], 'medium-fast', 'common', 1.1, 30.0, '领地意识很强。'],
  [18, '比雕', 'pidgeot', ['normal', 'flying'], [83, 80, 75, 70, 70, 101], 'medium-slow', 'uncommon', 1.5, 39.5, '以2马赫速度俯冲。'],
  [19, '小拉达', 'rattata', ['normal'], [30, 56, 35, 25, 35, 72], 'medium-fast', 'common', 0.3, 3.5, '哪里都能顽强生存。'],
  [20, '拉达', 'raticate', ['normal'], [55, 81, 60, 50, 70, 97], 'medium-fast', 'common', 0.7, 18.5, '门牙能咬断坚硬物。'],
  [21, '烈雀', 'spearow', ['normal', 'flying'], [40, 60, 30, 31, 31, 70], 'medium-fast', 'common', 0.3, 2.0, '脾气暴躁叫声刺耳。'],
  [22, '大嘴雀', 'fearow', ['normal', 'flying'], [65, 90, 65, 61, 61, 100], 'medium-fast', 'uncommon', 1.2, 38.0, '长喙是它的武器。'],
  [23, '阿柏蛇', 'ekans', ['poison'], [35, 60, 44, 40, 54, 55], 'medium-fast', 'common', 2.0, 6.9, '盘起来警告敌人。'],
  [24, '阿柏怪', 'arbok', ['poison'], [60, 95, 69, 65, 79, 80], 'medium-fast', 'uncommon', 3.5, 65.0, '腹部的花纹吓退敌人。'],
  [25, '皮卡丘', 'pikachu', ['electric'], [35, 55, 40, 50, 50, 90], 'medium-fast', 'uncommon', 0.4, 6.0, '脸颊储存电力。'],
  [26, '雷丘', 'raichu', ['electric'], [60, 90, 55, 90, 80, 110], 'medium-fast', 'uncommon', 0.8, 30.0, '十万伏特的电流贯穿全身。'],
  [27, '穿山鼠', 'sandshrew', ['ground'], [50, 75, 85, 20, 30, 40], 'medium-fast', 'common', 0.6, 12.0, '蜷成球抵御攻击。'],
  [28, '穿山王', 'sandslash', ['ground'], [75, 100, 110, 45, 55, 65], 'medium-fast', 'uncommon', 1.0, 29.5, '背刺能造成重伤。'],
  [29, '尼多兰', 'nidoran-f', ['poison'], [55, 47, 52, 40, 40, 41], 'medium-slow', 'common', 0.4, 7.0, '毒刺用于自卫。'],
  [30, '尼多娜', 'nidorina', ['poison'], [70, 62, 67, 55, 55, 56], 'medium-slow', 'common', 0.8, 20.0, '群居且彼此照应。'],
  [31, '尼多后', 'nidoqueen', ['poison', 'ground'], [90, 92, 87, 75, 85, 76], 'medium-slow', 'uncommon', 1.3, 60.0, '为保护幼崽奋不顾身。'],
  [32, '尼多朗', 'nidoran-m', ['poison'], [46, 57, 40, 40, 40, 50], 'medium-slow', 'common', 0.5, 9.0, '耳朵能听远处的动静。'],
  [33, '尼多力诺', 'nidorino', ['poison'], [61, 72, 57, 55, 55, 65], 'medium-slow', 'common', 0.9, 19.5, '好斗且警觉。'],
  [34, '尼多王', 'nidoking', ['poison', 'ground'], [81, 102, 77, 85, 75, 85], 'medium-slow', 'uncommon', 1.4, 62.0, '尾角的破坏力巨大。'],
  [35, '皮皮', 'clefairy', ['fairy'], [70, 45, 48, 60, 65, 35], 'fast', 'uncommon', 0.6, 7.5, '月光下聚集跳舞。'],
  [36, '皮可西', 'clefable', ['fairy'], [95, 70, 73, 95, 90, 60], 'fast', 'rare', 1.3, 40.0, '听力极佳能听见针落。'],
  [37, '六尾', 'vulpix', ['fire'], [38, 41, 40, 50, 65, 65], 'medium-fast', 'uncommon', 0.6, 9.9, '尾巴长大后分成六股。'],
  [38, '九尾', 'ninetales', ['fire'], [73, 76, 75, 81, 100, 100], 'medium-fast', 'rare', 1.1, 19.9, '传说能活千年。'],
  [39, '胖丁', 'jigglypuff', ['normal', 'fairy'], [115, 45, 20, 45, 25, 20], 'fast', 'uncommon', 0.5, 5.5, '歌声催眠听众。'],
  [40, '胖可丁', 'wigglytuff', ['normal', 'fairy'], [140, 70, 45, 85, 50, 45], 'fast', 'uncommon', 1.0, 12.0, '毛发触感极佳。'],
  [41, '超音蝠', 'zubat', ['poison', 'flying'], [40, 45, 35, 30, 40, 55], 'medium-fast', 'common', 0.8, 7.5, '用超声波探路。'],
  [42, '大嘴蝠', 'golbat', ['poison', 'flying'], [75, 90, 70, 65, 75, 90], 'medium-fast', 'common', 1.6, 55.0, '吸血为生。'],
  [43, '走路草', 'oddish', ['grass', 'poison'], [45, 50, 55, 75, 65, 30], 'medium-slow', 'common', 0.5, 5.4, '夜里把脚埋入土。'],
  [44, '臭花', 'gloom', ['grass', 'poison'], [60, 65, 70, 85, 75, 40], 'medium-slow', 'common', 0.8, 8.6, '散发出刺鼻臭味。'],
  [45, '霸王花', 'vileplume', ['grass', 'poison'], [75, 80, 85, 110, 90, 50], 'medium-slow', 'uncommon', 1.2, 18.6, '花瓣散播毒花粉。'],
  [46, '派拉斯', 'paras', ['bug', 'grass'], [35, 70, 55, 45, 55, 25], 'medium-fast', 'common', 0.3, 5.4, '背上的蘑菇是寄生。'],
  [47, '派拉斯特', 'parasect', ['bug', 'grass'], [60, 95, 80, 60, 80, 30], 'medium-fast', 'uncommon', 1.0, 29.5, '被蘑菇控制了意志。'],
  [48, '毛球', 'venonat', ['bug', 'poison'], [60, 55, 50, 40, 55, 45], 'medium-fast', 'common', 1.0, 30.0, '大眼睛能夜视。'],
  [49, '摩鲁蛾', 'venomoth', ['bug', 'poison'], [70, 65, 60, 90, 75, 90], 'medium-fast', 'uncommon', 1.5, 12.5, '鳞粉含剧毒。'],
  [50, '地鼠', 'diglett', ['ground'], [10, 55, 25, 35, 45, 95], 'medium-fast', 'common', 0.2, 0.8, '在地下高速掘进。'],
  [51, '三地鼠', 'dugtrio', ['ground'], [35, 100, 50, 50, 70, 120], 'medium-fast', 'uncommon', 0.7, 33.3, '三只地鼠协同作战。'],
  [52, '喵喵', 'meowth', ['normal'], [40, 45, 35, 40, 40, 90], 'medium-fast', 'common', 0.4, 4.2, '喜欢收集闪亮硬币。'],
  [53, '猫老大', 'persian', ['normal'], [65, 70, 60, 65, 65, 115], 'medium-fast', 'uncommon', 1.0, 32.0, '优雅高贵的气质。'],
  [54, '可达鸭', 'psyduck', ['water'], [50, 52, 48, 50, 50, 55], 'medium-fast', 'common', 0.8, 19.6, '头痛时会释放念力。'],
  [55, '哥达鸭', 'golduck', ['water'], [80, 82, 78, 95, 80, 85], 'medium-fast', 'uncommon', 1.7, 76.6, '游泳优雅且速度极快。'],
  [56, '猴怪', 'mankey', ['fighting'], [40, 80, 35, 35, 45, 70], 'medium-fast', 'common', 0.5, 28.0, '脾气暴躁易怒。'],
  [57, '火暴猴', 'primeape', ['fighting'], [65, 105, 60, 60, 70, 95], 'medium-fast', 'uncommon', 1.0, 32.0, '一旦发怒无人能挡。'],
  [58, '卡蒂狗', 'growlithe', ['fire'], [55, 70, 45, 70, 50, 60], 'slow', 'uncommon', 0.7, 19.0, '忠诚的看家犬。'],
  [59, '风速狗', 'arcanine', ['fire'], [90, 110, 80, 100, 80, 95], 'slow', 'rare', 1.9, 155.0, '奔跑如风姿态威武。'],
  [60, '蚊香蝌蚪', 'poliwag', ['water'], [40, 50, 40, 40, 40, 90], 'medium-slow', 'common', 0.6, 12.4, '腹部螺旋纹是肠。'],
  [61, '蚊香君', 'poliwhirl', ['water'], [65, 65, 65, 50, 50, 90], 'medium-slow', 'common', 1.0, 20.0, '四肢强健善于游泳。'],
  [62, '蚊香泳士', 'poliwrath', ['water', 'fighting'], [90, 95, 95, 70, 90, 70], 'medium-slow', 'uncommon', 1.3, 54.0, '肌肉如钢铁般结实。'],
  [63, '凯西', 'abra', ['psychic'], [25, 20, 15, 105, 55, 90], 'medium-slow', 'uncommon', 0.9, 19.5, '感应危险便瞬移逃跑。'],
  [64, '勇吉拉', 'kadabra', ['psychic'], [40, 35, 30, 120, 70, 105], 'medium-slow', 'uncommon', 1.3, 56.5, '发出强力的阿尔法波。'],
  [65, '胡地', 'alakazam', ['psychic'], [55, 50, 45, 135, 95, 120], 'medium-slow', 'rare', 1.5, 48.0, '智商高达5000。'],
  [66, '腕力', 'machop', ['fighting'], [70, 80, 50, 35, 35, 35], 'medium-slow', 'common', 0.8, 19.5, '热爱锻炼全身肌肉。'],
  [67, '豪力', 'machoke', ['fighting'], [80, 100, 70, 50, 60, 45], 'medium-slow', 'common', 1.5, 70.5, '力量腰带抑制怪力。'],
  [68, '怪力', 'machamp', ['fighting'], [90, 130, 80, 65, 85, 55], 'medium-slow', 'rare', 1.6, 130.0, '四只手能一击推山。'],
  [69, '喇叭芽', 'bellsprout', ['grass', 'poison'], [50, 75, 35, 70, 30, 40], 'medium-slow', 'common', 0.7, 4.0, '捕食虫类为生。'],
  [70, '臭臭花', 'weepinbell', ['grass', 'poison'], [65, 90, 50, 85, 45, 55], 'medium-slow', 'common', 1.0, 6.4, '用消化液溶解猎物。'],
  [71, '大食花', 'victreebel', ['grass', 'poison'], [80, 105, 65, 100, 70, 70], 'medium-slow', 'uncommon', 1.7, 15.5, '甜腻香气引诱猎物。'],
  [72, '玛瑙水母', 'tentacool', ['water', 'poison'], [40, 40, 35, 50, 100, 70], 'slow', 'common', 0.9, 45.5, '触手带强烈毒素。'],
  [73, '毒刺水母', 'tentacruel', ['water', 'poison'], [80, 70, 65, 80, 120, 100], 'slow', 'uncommon', 1.6, 55.0, '八十条触手缠绕猎物。'],
  [74, '小拳石', 'geodude', ['rock', 'ground'], [40, 80, 100, 30, 30, 20], 'medium-slow', 'common', 0.4, 20.0, '常被误认为石头。'],
  [75, '隆隆石', 'graveler', ['rock', 'ground'], [55, 95, 115, 45, 45, 35], 'medium-slow', 'common', 1.0, 105.0, '从山上滚下攻击。'],
  [76, '隆隆岩', 'golem', ['rock', 'ground'], [80, 120, 130, 55, 65, 45], 'medium-slow', 'uncommon', 1.4, 300.0, '皮肤如装甲般坚硬。'],
  [77, '小火马', 'ponyta', ['fire'], [50, 85, 55, 65, 65, 90], 'medium-fast', 'common', 1.0, 30.0, '鬃毛是炽热火焰。'],
  [78, '烈焰马', 'rapidash', ['fire'], [65, 100, 70, 80, 80, 105], 'medium-fast', 'uncommon', 1.7, 95.0, '以240公里时速奔驰。'],
  [79, '呆呆兽', 'slowpoke', ['water', 'psychic'], [90, 65, 65, 40, 40, 15], 'medium-fast', 'common', 1.2, 36.0, '总是呆呆地发愣。'],
  [80, '呆壳兽', 'slowbro', ['water', 'psychic'], [95, 75, 110, 100, 80, 30], 'medium-fast', 'uncommon', 1.6, 78.5, '尾巴上的贝壳寄生。'],
  [81, '小磁怪', 'magnemite', ['electric', 'steel'], [25, 35, 70, 95, 55, 45], 'medium-fast', 'uncommon', 0.3, 6.0, '用电磁力浮在空中。'],
  [82, '三合一磁怪', 'magneton', ['electric', 'steel'], [50, 60, 95, 120, 70, 70], 'medium-fast', 'uncommon', 1.0, 60.0, '三只小磁怪结合体。'],
  [83, '大葱鸭', 'farfetchd', ['normal', 'flying'], [52, 90, 55, 58, 62, 60], 'medium-fast', 'uncommon', 0.8, 15.0, '拿着葱当武器。'],
  [84, '嘟嘟', 'doduo', ['normal', 'flying'], [35, 85, 35, 35, 35, 75], 'medium-fast', 'common', 1.4, 39.2, '两个脑袋轮流睡觉。'],
  [85, '嘟嘟利', 'dodrio', ['normal', 'flying'], [60, 110, 70, 60, 60, 110], 'medium-fast', 'uncommon', 1.8, 85.2, '三头代表喜怒哀。'],
  [86, '小海狮', 'seel', ['water'], [65, 45, 55, 45, 70, 45], 'medium-fast', 'common', 1.1, 90.0, '冰上行动自如。'],
  [87, '白海狮', 'dewgong', ['water', 'ice'], [90, 70, 80, 70, 95, 70], 'medium-fast', 'uncommon', 1.7, 120.0, '极寒海域的游泳健将。'],
  [88, '臭泥', 'grimer', ['poison'], [80, 80, 50, 40, 50, 25], 'medium-fast', 'common', 0.9, 30.0, '由污染淤泥诞生。'],
  [89, '臭臭泥', 'muk', ['poison'], [105, 105, 75, 65, 100, 50], 'medium-fast', 'uncommon', 1.2, 30.0, '足迹会污染土地。'],
  [90, '大舌贝', 'shellder', ['water'], [30, 65, 100, 45, 25, 40], 'slow', 'common', 0.3, 4.0, '舌头又大又黏。'],
  [91, '刺甲贝', 'cloyster', ['water', 'ice'], [50, 95, 180, 85, 45, 70], 'slow', 'uncommon', 1.5, 132.5, '外壳比钻石还硬。'],
  [92, '鬼斯', 'gastly', ['ghost', 'poison'], [30, 35, 30, 100, 35, 80], 'medium-slow', 'uncommon', 1.3, 0.1, '气体身体能穿透墙壁。'],
  [93, '鬼斯通', 'haunter', ['ghost', 'poison'], [45, 50, 45, 115, 55, 95], 'medium-slow', 'uncommon', 1.6, 0.1, '舔到会浑身发抖。'],
  [94, '耿鬼', 'gengar', ['ghost', 'poison'], [60, 65, 60, 130, 75, 110], 'medium-slow', 'rare', 1.5, 40.5, '喜欢恶作剧的影子。'],
  [95, '大岩蛇', 'onix', ['rock', 'ground'], [35, 45, 160, 30, 45, 70], 'medium-fast', 'uncommon', 8.8, 210.0, '地下挖出的隧道如迷宫。'],
  [96, '催眠貘', 'drowzee', ['psychic'], [60, 48, 45, 43, 90, 42], 'medium-fast', 'common', 1.0, 32.4, '吃掉他人的梦境。'],
  [97, '素利拍', 'hypno', ['psychic'], [85, 73, 70, 73, 115, 67], 'medium-fast', 'uncommon', 1.6, 75.6, '钟摆催眠猎物。'],
  [98, '大钳蟹', 'krabby', ['water'], [30, 105, 90, 25, 25, 50], 'medium-fast', 'common', 0.4, 6.5, '巨钳力量巨大。'],
  [99, '巨钳蟹', 'kingler', ['water'], [55, 130, 115, 50, 50, 75], 'medium-fast', 'uncommon', 1.3, 60.0, '一万匹马力的钳子。'],
  [100, '雷电球', 'voltorb', ['electric'], [40, 30, 50, 55, 55, 100], 'medium-fast', 'common', 0.5, 10.4, '易与精灵球混淆。'],
  [101, '顽皮弹', 'electrode', ['electric'], [60, 50, 70, 80, 80, 150], 'medium-fast', 'uncommon', 1.2, 66.6, '受惊会自爆。'],
  [102, '蛋蛋', 'exeggcute', ['grass', 'psychic'], [60, 40, 80, 60, 45, 40], 'slow', 'uncommon', 0.4, 2.5, '六颗蛋心意相通。'],
  [103, '椰蛋树', 'exeggutor', ['grass', 'psychic'], [95, 95, 85, 125, 75, 55], 'slow', 'uncommon', 2.0, 120.0, '每颗头会心灵感应。'],
  [104, '可拉可拉', 'cubone', ['ground'], [50, 50, 95, 40, 50, 35], 'medium-fast', 'uncommon', 0.4, 6.5, '戴着母亲的头骨。'],
  [105, '嘎拉嘎拉', 'marowak', ['ground'], [60, 80, 110, 50, 80, 45], 'medium-fast', 'uncommon', 1.0, 45.0, '骨头棒击碎岩石。'],
  [106, '沙瓦郎', 'hitmonlee', ['fighting'], [50, 120, 53, 35, 110, 87], 'medium-fast', 'uncommon', 1.5, 49.8, '双腿可任意伸长。'],
  [107, '艾比郎', 'hitmonchan', ['fighting'], [50, 105, 79, 35, 110, 76], 'medium-fast', 'uncommon', 1.4, 50.2, '出拳如闪电般迅捷。'],
  [108, '大舌头', 'lickitung', ['normal'], [90, 55, 75, 60, 75, 30], 'medium-fast', 'uncommon', 1.2, 65.5, '长舌黏糊能伸缩。'],
  [109, '瓦斯弹', 'koffing', ['poison'], [40, 65, 95, 60, 45, 35], 'medium-fast', 'common', 0.6, 1.0, '体内充满有毒气体。'],
  [110, '双弹瓦斯', 'weezing', ['poison'], [65, 90, 120, 85, 70, 60], 'medium-fast', 'uncommon', 1.2, 9.5, '两个脑袋混合毒气。'],
  [111, '犀牛角', 'rhyhorn', ['ground', 'rock'], [80, 85, 95, 30, 30, 25], 'slow', 'common', 1.0, 115.0, '头脑迟钝但皮糙肉厚。'],
  [112, '钻角犀兽', 'rhydon', ['ground', 'rock'], [105, 130, 120, 45, 45, 40], 'slow', 'uncommon', 1.9, 120.0, '角能穿透高楼。'],
  [113, '吉利蛋', 'chansey', ['normal'], [250, 5, 5, 35, 105, 50], 'fast', 'rare', 1.1, 34.6, '为他人奉献的温柔心。'],
  [114, '蔓藤怪', 'tangela', ['grass'], [65, 55, 115, 100, 40, 60], 'medium-fast', 'uncommon', 1.0, 35.0, '藤蔓下真身成谜。'],
  [115, '袋龙', 'kangaskhan', ['normal'], [105, 95, 80, 40, 80, 90], 'medium-fast', 'uncommon', 2.2, 80.0, '育儿袋里藏着幼崽。'],
  [116, '墨海马', 'horsea', ['water'], [30, 40, 70, 70, 25, 60], 'medium-fast', 'common', 0.4, 8.0, '喷出墨汁逃跑。'],
  [117, '海刺龙', 'seadra', ['water'], [55, 65, 95, 95, 45, 85], 'medium-fast', 'uncommon', 1.2, 25.0, '背刺带剧毒。'],
  [118, '角金鱼', 'goldeen', ['water'], [45, 67, 60, 35, 50, 63], 'medium-fast', 'common', 0.6, 15.0, '优美的尾鳍如舞裙。'],
  [119, '金鱼王', 'seaking', ['water'], [80, 92, 65, 65, 80, 68], 'medium-fast', 'uncommon', 1.3, 39.0, '角能在岩石上钻孔。'],
  [120, '海星星', 'staryu', ['water'], [30, 45, 55, 70, 55, 85], 'slow', 'common', 0.8, 34.5, '中心核发红光。'],
  [121, '宝石海星', 'starmie', ['water', 'psychic'], [60, 75, 85, 100, 85, 115], 'slow', 'uncommon', 1.1, 80.0, '核心散发七彩光芒。'],
  [122, '魔墙人偶', 'mr-mime', ['psychic', 'fairy'], [40, 45, 65, 100, 120, 90], 'medium-fast', 'uncommon', 1.3, 54.5, '制造看不见的墙壁。'],
  [123, '飞天螳螂', 'scyther', ['bug', 'flying'], [70, 110, 80, 55, 80, 105], 'medium-fast', 'uncommon', 1.5, 56.0, '镰刀锋利如刀。'],
  [124, '迷唇姐', 'jynx', ['ice', 'psychic'], [65, 50, 35, 115, 95, 95], 'medium-fast', 'uncommon', 1.4, 40.6, '跳着奇怪的舞。'],
  [125, '电击兽', 'electabuzz', ['electric'], [65, 83, 57, 95, 85, 105], 'medium-fast', 'uncommon', 1.1, 30.0, '雷暴时会兴奋异常。'],
  [126, '鸭嘴火兽', 'magmar', ['fire'], [65, 95, 57, 100, 85, 93], 'medium-fast', 'uncommon', 1.3, 44.5, '全身呼吸着炽热火焰。'],
  [127, '凯罗斯', 'pinsir', ['bug'], [65, 125, 100, 55, 70, 85], 'slow', 'uncommon', 1.5, 55.0, '巨钳能夹碎猎物。'],
  [128, '肯泰罗', 'tauros', ['normal'], [75, 100, 95, 40, 70, 110], 'slow', 'uncommon', 1.4, 88.4, '三条尾巴抽打敌人。'],
  [129, '鲤鱼王', 'magikarp', ['water'], [20, 10, 55, 15, 20, 80], 'slow', 'common', 0.9, 10.0, '只能溅起水花。'],
  [130, '暴鲤龙', 'gyarados', ['water', 'flying'], [95, 125, 79, 60, 100, 81], 'slow', 'rare', 6.5, 235.0, '性情狂暴毁城灭镇。'],
  [131, '拉普拉斯', 'lapras', ['water', 'ice'], [130, 85, 80, 85, 95, 60], 'slow', 'rare', 2.5, 220.0, '聪明且乐于载人渡海。'],
  [132, '百变怪', 'ditto', ['normal'], [48, 48, 48, 48, 48, 48], 'medium-fast', 'uncommon', 0.3, 4.0, '能变身成任何东西。'],
  [133, '伊布', 'eevee', ['normal'], [55, 55, 50, 45, 65, 55], 'medium-fast', 'uncommon', 0.3, 6.5, '基因极不稳定可多种进化。'],
  [134, '水伊布', 'vaporeon', ['water'], [130, 65, 60, 110, 95, 65], 'medium-fast', 'rare', 1.0, 29.0, '身体能融化于水中。'],
  [135, '雷伊布', 'jolteon', ['electric'], [65, 65, 60, 110, 95, 130], 'medium-fast', 'rare', 0.8, 24.5, '毛发会发射电荷。'],
  [136, '火伊布', 'flareon', ['fire'], [65, 130, 60, 95, 110, 65], 'medium-fast', 'rare', 0.9, 25.0, '体内有火焰袋。'],
  [137, '3D龙', 'porygon', ['normal'], [65, 60, 70, 85, 75, 40], 'medium-fast', 'uncommon', 0.8, 36.5, '由程序创造的虚拟存在。'],
  [138, '菊石兽', 'omanyte', ['rock', 'water'], [35, 40, 100, 90, 55, 35], 'medium-fast', 'rare', 0.4, 7.5, '从化石复活的远古宝可梦。'],
  [139, '多刺菊石兽', 'omastar', ['rock', 'water'], [70, 60, 125, 115, 70, 55], 'medium-fast', 'rare', 1.0, 35.0, '触手缠住猎物消化。'],
  [140, '化石盔', 'kabuto', ['rock', 'water'], [30, 80, 90, 55, 45, 55], 'medium-fast', 'rare', 0.5, 11.5, '背壳坚硬如装甲。'],
  [141, '镰刀盔', 'kabutops', ['rock', 'water'], [60, 115, 105, 65, 70, 80], 'medium-fast', 'rare', 1.3, 40.5, '镰刀斩杀猎物。'],
  [142, '化石翼龙', 'aerodactyl', ['rock', 'flying'], [80, 105, 65, 60, 75, 130], 'slow', 'rare', 1.8, 59.0, '史前天空的霸主。'],
  [143, '卡比兽', 'snorlax', ['normal'], [160, 110, 65, 65, 110, 30], 'slow', 'rare', 2.1, 460.0, '吃饱就睡的大型宝可梦。'],
  [144, '急冻鸟', 'articuno', ['ice', 'flying'], [90, 85, 100, 95, 125, 85], 'slow', 'legendary', 1.7, 55.4, '传说中现身于雪山。'],
  [145, '闪电鸟', 'zapdos', ['electric', 'flying'], [90, 90, 85, 125, 90, 100], 'slow', 'legendary', 1.6, 52.6, '雷云中振翅引雷。'],
  [146, '火焰鸟', 'moltres', ['fire', 'flying'], [90, 100, 90, 125, 85, 90], 'slow', 'legendary', 2.0, 60.0, '火焰之翼照亮夜空。'],
  [147, '迷你龙', 'dratini', ['dragon'], [41, 64, 45, 50, 50, 50], 'slow', 'rare', 1.8, 3.3, '被传为幻之宝可梦。'],
  [148, '哈克龙', 'dragonair', ['dragon'], [61, 84, 65, 70, 70, 70], 'slow', 'rare', 4.0, 16.5, '能操纵天气变化。'],
  [149, '快龙', 'dragonite', ['dragon', 'flying'], [91, 134, 95, 100, 100, 80], 'slow', 'rare', 2.2, 210.0, '能在海上绕世界一圈。'],
  [150, '超梦', 'mewtwo', ['psychic'], [106, 110, 90, 154, 90, 130], 'slow', 'legendary', 2.0, 122.0, '为战斗而诞生的人造宝可梦。'],
  [151, '梦幻', 'mew', ['psychic'], [100, 100, 100, 100, 100, 100], 'medium-slow', 'mythical', 0.4, 4.0, '据说拥有所有宝可梦的基因。'],
];

// ── Ability assignment ──
// Per-type pools. Species pick deterministically by id for variety; starters &
// a few iconic species get explicit overrides.
const TYPE_ABILITY_POOL: Record<string, string[]> = {
  normal: ['intimidate', 'keen-eye', 'guts', 'inner-focus', 'combat-rhythm', 'natural-cure'],
  fire: ['flame-body', 'flash-fire', 'guts'],
  water: ['water-absorb', 'rain-dish', 'shell-armor', 'natural-cure'],
  grass: ['natural-cure', 'marvel-scale', 'shell-armor', 'chlorophyll'],
  electric: ['static', 'volt-absorb', 'combat-rhythm'],
  ice: ['shell-armor', 'thick-fat', 'inner-focus'],
  fighting: ['guts', 'huge-power', 'inner-focus'],
  poison: ['poison-point', 'natural-cure', 'marvel-scale'],
  ground: ['sand-veil', 'rock-head', 'guts'],
  flying: ['keen-eye', 'inner-focus', 'guts', 'opening-initiative'],
  psychic: ['natural-cure', 'serene-grace', 'inner-focus', 'marvel-scale'],
  bug: ['swarm', 'keen-eye', 'guts', 'inner-focus'],
  rock: ['rock-head', 'sturdy', 'shell-armor'],
  ghost: ['levitate', 'natural-cure'],
  dragon: ['multiscale', 'pressure', 'marvel-scale'],
  dark: ['guts', 'keen-eye', 'intimidate'],
  steel: ['sturdy', 'rock-head', 'shell-armor', 'keen-eye'],
  fairy: ['natural-cure', 'serene-grace', 'marvel-scale'],
};

// explicit overrides for iconic species (id -> abilities[])
const ABILITY_OVERRIDES: Record<number, string[]> = {
  1: ['overgrow'], 2: ['overgrow'], 3: ['overgrow', 'chlorophyll'],
  4: ['blaze'], 5: ['blaze'], 6: ['blaze', 'solar-power'],
  7: ['torrent'], 8: ['torrent'], 9: ['torrent', 'rain-dish'],
  25: ['static', 'lightning-rod'], 26: ['static', 'lightning-rod'],
  35: ['cute-charm'], 36: ['cute-charm', 'magic-guard'],
  53: ['limber'], 59: ['intimidate', 'flash-fire'], 38: ['flash-fire', 'drought'],
  62: ['water-absorb', 'steady-nerves'], 65: ['synchronize', 'inner-focus'],
  68: ['guts', 'no-guard'], 94: ['cursed-body', 'levitate'],
  113: ['natural-cure', 'serene-grace'], 130: ['intimidate', 'moxie'],
  134: ['water-absorb'], 135: ['volt-absorb'], 136: ['flash-fire', 'guts'],
  133: ['opening-initiative', 'adaptability'], 132: ['limber', 'imposter'],
  143: ['thick-fat', 'immunity'], 131: ['water-absorb', 'shell-armor'],
  81: ['lasting-grit', 'sturdy'], 82: ['lasting-grit', 'sturdy'],
  58: ['intimidate', 'flash-fire'], 91: ['shell-armor', 'skill-link'],
  144: ['pressure', 'snow-cloak'], 145: ['pressure', 'static'],
  146: ['pressure', 'flame-body'], 150: ['pressure', 'counter-instinct'], 151: ['synchronize'],
};

// abilities referenced in overrides that aren't in ABILITIES fall back to a
// generic "flavor-only" ability id; we map unknown ones to a safe default so
// the engine never breaks on a missing ability.
const FALLBACK_ABILITY = 'keen-eye';

// ── Evolution table (level-based; stone/trade converted to levels for v1) ──
const EVOLUTIONS: Record<number, { to: number; level: number }[]> = {
  1: [{ to: 2, level: 16 }], 2: [{ to: 3, level: 32 }],
  4: [{ to: 5, level: 16 }], 5: [{ to: 6, level: 36 }],
  7: [{ to: 8, level: 16 }], 8: [{ to: 9, level: 36 }],
  10: [{ to: 11, level: 7 }], 11: [{ to: 12, level: 10 }],
  13: [{ to: 14, level: 7 }], 14: [{ to: 15, level: 10 }],
  16: [{ to: 17, level: 18 }], 17: [{ to: 18, level: 36 }],
  19: [{ to: 20, level: 20 }], 21: [{ to: 22, level: 20 }],
  23: [{ to: 24, level: 22 }], 25: [{ to: 26, level: 30 }],
  27: [{ to: 28, level: 22 }], 29: [{ to: 30, level: 16 }], 30: [{ to: 31, level: 36 }],
  32: [{ to: 33, level: 16 }], 33: [{ to: 34, level: 36 }],
  35: [{ to: 36, level: 36 }], 37: [{ to: 38, level: 36 }],
  39: [{ to: 40, level: 36 }], 41: [{ to: 42, level: 22 }],
  43: [{ to: 44, level: 21 }], 44: [{ to: 45, level: 36 }],
  46: [{ to: 47, level: 24 }], 48: [{ to: 49, level: 31 }],
  50: [{ to: 51, level: 26 }], 52: [{ to: 53, level: 28 }],
  54: [{ to: 55, level: 33 }], 56: [{ to: 57, level: 28 }],
  58: [{ to: 59, level: 36 }], 60: [{ to: 61, level: 25 }], 61: [{ to: 62, level: 36 }],
  63: [{ to: 64, level: 16 }], 64: [{ to: 65, level: 38 }],
  66: [{ to: 67, level: 28 }], 67: [{ to: 68, level: 40 }],
  69: [{ to: 70, level: 21 }], 70: [{ to: 71, level: 36 }],
  72: [{ to: 73, level: 30 }], 74: [{ to: 75, level: 25 }], 75: [{ to: 76, level: 42 }],
  77: [{ to: 78, level: 40 }], 79: [{ to: 80, level: 37 }],
  81: [{ to: 82, level: 30 }], 84: [{ to: 85, level: 31 }],
  86: [{ to: 87, level: 34 }], 88: [{ to: 89, level: 38 }],
  90: [{ to: 91, level: 36 }], 92: [{ to: 93, level: 25 }], 93: [{ to: 94, level: 40 }],
  96: [{ to: 97, level: 26 }], 98: [{ to: 99, level: 28 }],
  100: [{ to: 101, level: 30 }], 102: [{ to: 103, level: 36 }],
  104: [{ to: 105, level: 28 }], 109: [{ to: 110, level: 35 }],
  111: [{ to: 112, level: 42 }], 116: [{ to: 117, level: 32 }],
  118: [{ to: 119, level: 33 }], 120: [{ to: 121, level: 36 }],
  138: [{ to: 139, level: 40 }], 140: [{ to: 141, level: 40 }],
  147: [{ to: 148, level: 30 }], 148: [{ to: 149, level: 55 }],
  // Eevee: branch choice at level 36
  133: [{ to: 134, level: 36 }, { to: 135, level: 36 }, { to: 136, level: 36 }],
};

export interface SignatureSkillConfig { skill: string; level: number; role: CombatRole; label: string; }

/** Iconic-species signatures. They deliberately reuse the common skill
 * engine so content can expand without a bespoke combat code path per species. */
export const SIGNATURE_SKILLS: Record<number, SignatureSkillConfig> = {
  3: { skill: 'verdant-snare', level: 39, role: 'control', label: '持续控制' },
  6: { skill: 'blazing-dive', level: 47, role: 'burst', label: '蓄力爆发' },
  9: { skill: 'fortress-cannon', level: 39, role: 'tank', label: '远程压制' },
  25: { skill: 'volt-chain', level: 31, role: 'area', label: '群体收割' },
  65: { skill: 'mind-lock', level: 39, role: 'control', label: '控制打断' },
  94: { skill: 'shadow-trap', level: 39, role: 'control', label: '暗影控制' },
  112: { skill: 'earth-shatter', level: 39, role: 'area', label: '范围压制' },
  131: { skill: 'tidal-aegis', level: 31, role: 'support', label: '护盾续航' },
  133: { skill: 'potential-surge', level: 31, role: 'growth', label: '可能性加速' },
  143: { skill: 'heavy-slam', level: 39, role: 'tank', label: '前排控制' },
  149: { skill: 'dragon-surge', level: 47, role: 'bruiser', label: '成长爆发' },
  150: { skill: 'psyonic-annihilation', level: 47, role: 'burst', label: '终极群攻' },
  151: { skill: 'genesis-pulse', level: 39, role: 'support', label: '自我回复' },
  18: { skill: 'gale-commander', level: 39, role: 'kite', label: '风场提速' },
  26: { skill: 'thunder-crown', level: 47, role: 'area', label: '雷域群压' },
  36: { skill: 'moonlit-ward', level: 39, role: 'support', label: '月辉护持' },
  59: { skill: 'sunfire-pursuit', level: 47, role: 'burst', label: '烈焰收割' },
  68: { skill: 'fourfold-guard', level: 47, role: 'bruiser', label: '四臂连进' },
  130: { skill: 'tempest-breaker', level: 47, role: 'burst', label: '暴潮终结' },
  134: { skill: 'aqua-recovery', level: 39, role: 'support', label: '水愈续航' },
  135: { skill: 'lightning-feint', level: 39, role: 'kite', label: '电光拉扯' },
  136: { skill: 'blaze-retaliation', level: 39, role: 'burst', label: '烈焰反攻' },
  142: { skill: 'sky-ambush', level: 39, role: 'kite', label: '高空突袭' },
  144: { skill: 'frostbound-hymn', level: 47, role: 'control', label: '霜歌冻结' },
  145: { skill: 'thunderstorm-reign', level: 47, role: 'area', label: '雷暴统御' },
  146: { skill: 'solarflare-wing', level: 47, role: 'area', label: '日炎群焚' },
};

/**
 * Curated fan-favorite / series-icon species that receive bespoke moves.
 * Kept explicit rather than inferred from rarity so content expansion can add
 * recognisable favorites without turning every legendary into a signature.
 */
export const ICONIC_SIGNATURE_SPECIES = [
  3, 6, 9, 18, 25, 26, 36, 59, 65, 68, 94, 112, 130, 131, 133,
  134, 135, 136, 142, 143, 144, 145, 146, 149, 150, 151,
] as const;

const missingIconicSignatures = ICONIC_SIGNATURE_SPECIES.filter((id) => !SIGNATURE_SKILLS[id]);
if (missingIconicSignatures.length) {
  throw new Error(`Missing iconic species signatures: ${missingIconicSignatures.join(', ')}`);
}

/**
 * Species combat roles are player-facing tactical guidance. They do not change
 * base stats or AI by themselves, so every species can have a clear identity
 * without coupling static configuration to battle logic.
 */
export const COMBAT_ROLE_LABEL: Record<CombatRole, string> = {
  burst: '爆发收割',
  bruiser: '近战成长',
  tank: '前排坦克',
  control: '控制打断',
  support: '辅助续航',
  kite: '远程风筝',
  area: '范围压制',
  balanced: '均衡作战',
  growth: '成长蜕变',
};

export const COMBAT_ROLE_DESCRIPTION: Record<CombatRole, string> = {
  burst: '擅长在关键窗口集中火力，优先快速压低或收割目标。',
  bruiser: '能承受一定伤害并持续贴身施压，越战越能发挥价值。',
  tank: '适合站在队伍前方承伤、牵制，为同伴争取输出空间。',
  control: '依靠异常、削弱或打断限制对手，为队伍创造主动权。',
  support: '通过治疗、护盾或增益维持战线，提升队伍的持续作战能力。',
  kite: '利用速度、射程或机动性保持距离，持续消耗并规避风险。',
  area: '擅长同时影响多个敌人，在多目标战斗中扩大优势。',
  balanced: '各项能力较为平均，可根据队伍缺口灵活承担不同任务。',
  growth: '拥有战斗内逐步强化的招式：随时间累积属性优势，存活越久越强。',
};

export function combatRoleTooltipText(role: CombatRole): string {
  return `定位：${COMBAT_ROLE_LABEL[role]}\n${COMBAT_ROLE_DESCRIPTION[role]}`;
}

/** Every Gen-1 species has one primary tactical identity for the Pokédex. */
export const SPECIES_COMBAT_ROLES: Record<number, CombatRole> = {
  1: 'control', 2: 'control', 3: 'control', 4: 'bruiser', 5: 'bruiser', 6: 'burst',
  7: 'tank', 8: 'tank', 9: 'tank', 10: 'control', 11: 'tank', 12: 'kite',
  13: 'control', 14: 'tank', 15: 'burst', 16: 'kite', 17: 'kite', 18: 'kite',
  19: 'bruiser', 20: 'bruiser', 21: 'kite', 22: 'kite', 23: 'control', 24: 'control',
  25: 'area', 26: 'area', 27: 'tank', 28: 'bruiser', 29: 'support', 30: 'support',
  31: 'tank', 32: 'bruiser', 33: 'bruiser', 34: 'tank', 35: 'support', 36: 'support',
  37: 'burst', 38: 'burst', 39: 'support', 40: 'support', 41: 'kite', 42: 'kite',
  43: 'control', 44: 'control', 45: 'control', 46: 'control', 47: 'control', 48: 'control',
  49: 'kite', 50: 'bruiser', 51: 'bruiser', 52: 'kite', 53: 'kite', 54: 'support',
  55: 'bruiser', 56: 'bruiser', 57: 'bruiser', 58: 'burst', 59: 'burst', 60: 'control',
  61: 'control', 62: 'bruiser', 63: 'burst', 64: 'burst', 65: 'control', 66: 'bruiser',
  67: 'bruiser', 68: 'bruiser', 69: 'control', 70: 'control', 71: 'control', 72: 'control',
  73: 'tank', 74: 'tank', 75: 'tank', 76: 'tank', 77: 'kite', 78: 'kite',
  79: 'tank', 80: 'tank', 81: 'kite', 82: 'tank', 83: 'kite', 84: 'kite',
  85: 'kite', 86: 'tank', 87: 'tank', 88: 'control', 89: 'tank', 90: 'tank',
  91: 'tank', 92: 'control', 93: 'control', 94: 'control', 95: 'tank', 96: 'control',
  97: 'control', 98: 'bruiser', 99: 'bruiser', 100: 'area', 101: 'area', 102: 'control',
  103: 'control', 104: 'tank', 105: 'bruiser', 106: 'bruiser', 107: 'tank', 108: 'support',
  109: 'control', 110: 'control', 111: 'tank', 112: 'area', 113: 'support', 114: 'control',
  115: 'bruiser', 116: 'kite', 117: 'kite', 118: 'kite', 119: 'kite', 120: 'support',
  121: 'support', 122: 'control', 123: 'bruiser', 124: 'control', 125: 'area', 126: 'area',
  127: 'bruiser', 128: 'bruiser', 129: 'growth', 130: 'burst', 131: 'support', 132: 'balanced',
  133: 'growth', 134: 'support', 135: 'kite', 136: 'burst', 137: 'control', 138: 'tank',
  139: 'tank', 140: 'tank', 141: 'bruiser', 142: 'kite', 143: 'tank', 144: 'control',
  145: 'area', 146: 'area', 147: 'growth', 148: 'growth', 149: 'bruiser', 150: 'burst',
  151: 'support',
};

const missingCombatRoles = RAW.filter(([id]) => !SPECIES_COMBAT_ROLES[id]).map(([id]) => id);
if (missingCombatRoles.length) {
  throw new Error(`Missing combat roles for species: ${missingCombatRoles.join(', ')}`);
}

/**
 * Fixed basic-attack delivery for Pokédex and wild-battle balance. This belongs
 * to the model, not its current learned skills: capture, breeding, evolution
 * and sandbox instances of one species always retain the same basic reach.
 * Ranged models trade the normal-attack damage multiplier for safe spacing.
 */
export const RANGED_NORMAL_ATTACK_SPECIES = new Set<number>([
  // Plant / spore / vine casters.
  1, 2, 3, 43, 44, 45, 69, 70, 71, 102, 103, 114,
  // Water cannons, bubbles, spray and sea casters.
  7, 8, 9, 54, 55, 60, 61, 72, 73, 86, 87, 90, 91, 116, 117, 118, 119, 120, 121, 131, 134,
  // Elemental emitters and floating energy bodies.
  25, 26, 37, 38, 81, 82, 100, 101, 109, 110, 125, 135, 145,
  // Psychic, ghost and other explicit projection models.
  63, 64, 65, 79, 80, 92, 93, 94, 96, 97, 122, 124, 137, 144, 150, 151,
]);

export const NORMAL_ATTACK_RANGED_CELLS = 6;

/** Baseline cadence bands before model-specific tuning. Ranged models surrender
 * some per-hit damage and therefore receive a slightly quicker default rhythm;
 * heavy frontliners swing slower but retain their full contact damage. */
const NORMAL_ATTACK_INTERVAL_BY_ROLE: Readonly<Record<CombatRole, number>> = {
  burst: 1.18,
  bruiser: 1.30,
  tank: 1.48,
  control: 1.28,
  support: 1.30,
  kite: 1.12,
  area: 1.26,
  balanced: 1.30,
  growth: 1.34,
};

/** Explicit cadence tuning for silhouettes whose mass, limb count, or casting
 * identity materially changes the readable basic-attack rhythm. All omitted
 * models still receive a deterministic role/delivery balance value below. */
const NORMAL_ATTACK_INTERVAL_OVERRIDES: Readonly<Partial<Record<number, number>>> = {
  6: 1.10, 25: 1.08, 65: 1.20, 68: 1.35, 94: 1.16,
  130: 1.42, 143: 1.55, 149: 1.18, 150: 1.28, 151: 1.16,
};

export function normalAttackIntervalFor(speciesId: number): number {
  const override = NORMAL_ATTACK_INTERVAL_OVERRIDES[speciesId];
  if (override !== undefined) return override;
  const role = SPECIES_COMBAT_ROLES[speciesId];
  const baseline = NORMAL_ATTACK_INTERVAL_BY_ROLE[role];
  return normalAttackDeliveryFor(speciesId) === 'ranged'
    ? Math.max(1.05, baseline - 0.08)
    : baseline;
}

export function normalAttackDeliveryFor(speciesId: number): NormalAttackDelivery {
  return RANGED_NORMAL_ATTACK_SPECIES.has(speciesId) ? 'ranged' : 'melee';
}

/**
 * Role-oriented skill groups. Every species receives a distinct mix of:
 * - 1--2 intrinsic moves that are immediately usable at level 1;
 * - role technique(s) that create its tactical identity;
 * - elemental progression moves selected deterministically within its type.
 *
 * Intrinsic moves are explicitly excluded from level-up entries. This keeps the
 * Pokédex honest: “天生” and “升级领悟” never list the same skill twice.
 */
const ROLE_SKILL_PLAN: Record<CombatRole, string[]> = {
  burst: ['battle-focus', 'finishing-ray', 'pressure-point'],
  bruiser: ['relentless-strike', 'drain-pummel', 'grit-charge'],
  tank: ['iron-stance', 'rooted-armor', 'heavy-guard'],
  control: ['binding-gaze', 'chilling-snare', 'toxic-bind'],
  support: ['restoring-light', 'tide-ward', 'renewal-chant'],
  kite: ['tailwind', 'feint-star', 'slipstream-dart'],
  area: ['resonance-wave', 'ember-ring', 'shock-field'],
  balanced: ['adaptive-guard', 'steady-strike', 'measured-wave'],
  growth: ['evolution-rhythm', 'shell-molt', 'quickening-cycle'],
};

function roleTechnique(role: CombatRole, id: number): string {
  const techniques = ROLE_SKILL_PLAN[role];
  return techniques[id % techniques.length]!;
}

function uniqueSkills(ids: string[]): string[] {
  return [...new Set(ids)].filter((id) => !!SKILL_MAP[id]);
}

function elementalProgression(primary: TypeName, id: number): string[] {
  const pool = uniqueSkills(TYPE_LEARNSET[primary] ?? TYPE_LEARNSET.normal)
    .filter((sid) => (SKILL_MAP[sid]?.power ?? 0) > 0)
    .sort((a, b) => (SKILL_MAP[a]!.power - SKILL_MAP[b]!.power) || a.localeCompare(b));
  if (pool.length === 0) return [];
  // Keep the level-1 elemental move in the low-power band; rotate only inside
  // that band so kin feel different without starting with an ultimate.
  const basicCount = Math.min(pool.length, Math.max(1, Math.ceil(pool.length / 2)));
  const basics = pool.slice(0, basicCount);
  const offset = id % basics.length;
  return [...basics.slice(offset), ...basics.slice(0, offset), ...pool.slice(basicCount)];
}

function buildIntrinsicSkills(primary: TypeName, id: number, role: CombatRole): string[] {
  const progression = elementalProgression(primary, id);
  const technique = roleTechnique(role, id);
  const elementalBasic = progression[0];
  // Every species begins with one elemental move and one role technique, so its
  // positioning is present from the first battle rather than arriving too late.
  const out = [elementalBasic, technique];
  return uniqueSkills(out).slice(0, 2);
}

function buildLearnset(primary: TypeName, speciesId: number, role: CombatRole, intrinsic: string[]): LearnsetEntry[] {
  const signature = SIGNATURE_SKILLS[speciesId];
  const progression = elementalProgression(primary, speciesId);
  const roleMoves = ROLE_SKILL_PLAN[role].filter((skill) => !intrinsic.includes(skill));
  // The active role technique comes first, so newly caught Pokémon keep an
  // elemental core while leveling into a second, distinct tactical option.
  const candidates = uniqueSkills([
    roleMoves[0] ?? '',
    ...progression,
    ...roleMoves.slice(1),
    signature?.skill ?? '',
  ]).filter((skill) => !intrinsic.includes(skill));
  const levels = [7, 15, 23, 31, 39, 47, 55];
  const entries: LearnsetEntry[] = [];
  for (const skill of candidates) {
    if (entries.some((entry) => entry.skill === skill)) continue;
    const level = signature?.skill === skill ? signature.level : levels[Math.min(entries.length, levels.length - 1)]!;
    entries.push({ level, skill });
  }
  return entries.sort((a, b) => a.level - b.level || a.skill.localeCompare(b.skill));
}

/** Build the passive pool from the primary type's passive pool + generic.
 *  Deterministically picks a 4-5 passive subset seeded by species id, so each
 *  species has its OWN fixed 梦幻 skill pool (not shared across same-type kin). */
function buildPassivePool(primary: TypeName, id: number): string[] {
  const typePool = TYPE_PASSIVE_POOL[primary] ?? [];
  const master = [...new Set([...typePool, ...GENERIC_PASSIVE_POOL])];
  // deterministic Fisher-Yates seeded by id (stable per species)
  const arr = [...master];
  let s = (id * 2654435761) >>> 0 || 1;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const size = 4 + (id % 2); // 4 or 5 slots per species
  return arr.slice(0, Math.min(size, arr.length));
}

function unifyStats(s: [number, number, number, number, number, number]): Stats {
  const [hp, atk, def, spAtk, spDef, spd] = s;
  // unify attack/spAtk -> attack, defense/spDef -> defense (take the higher to
  // preserve each species' identity, e.g. Alakazam stays a strong attacker).
  return { hp, atk: Math.max(atk, spAtk), def: Math.max(def, spDef), spd };
}

function baseStatTotal(s: Stats): number {
  return s.hp + s.atk + s.def + s.spd;
}

/** 1-2 intrinsic (必带) passives per species, taken deterministically from the
 *  front of the species' own (id-seeded) passive pool. The pool order already
 *  differs per species, so the slice differs too -> same-type kin don't all
 *  share the same intrinsic passives (尽量不雷同). Wild always hold these;
 *  breeding retains them 100% (ignores the 65/35 roll). */
function buildIntrinsicPassives(pool: string[], id: number): string[] {
  if (pool.length === 0) return [];
  const count = Math.min(pool.length, 1 + (id % 2)); // 1 or 2
  return pool.slice(0, count);
}

export const SPECIES_LIST: Species[] = RAW.map((row) => {
  const [id, name, enName, types, rawStats, growthRate, rarity, height, weight, dex] = row;
  const base = unifyStats(rawStats);
  const primary = types[0];
  const combatRole = SPECIES_COMBAT_ROLES[id];
  const intrinsic = buildIntrinsicSkills(primary, id, combatRole);
  const pool = TYPE_ABILITY_POOL[primary] ?? TYPE_ABILITY_POOL.normal;

  let abilities: string[];
  if (ABILITY_OVERRIDES[id]) {
    abilities = ABILITY_OVERRIDES[id];
  } else {
    abilities = pool.length ? [pool[id % pool.length]] : ['keen-eye'];
    if (pool.length > 1) {
      const second = pool[(id + 2) % pool.length];
      if (!abilities.includes(second)) abilities.push(second);
    }
  }
  // hidden ability: a third pool entry (flavor)
  let hiddenAbility: string | undefined;
  if (pool.length > 2) hiddenAbility = pool[(id + 4) % pool.length];

  const bst = baseStatTotal(base);
  const rarityMult = rarity === 'legendary' || rarity === 'mythical' ? 2.2 : rarity === 'rare' ? 1.3 : 1;
  const expYield = Math.max(20, Math.min(320, Math.round((bst / 5) * rarityMult)));
  const passivePool = buildPassivePool(primary, id);

  return {
    id,
    name,
    enName,
    types,
    base,
    expYield,
    growthRate,
    abilities,
    hiddenAbility,
    learnset: buildLearnset(primary, id, combatRole, intrinsic),
    signatureSkill: SIGNATURE_SKILLS[id]?.skill,
    combatRole,
    normalAttackDelivery: normalAttackDeliveryFor(id),
    normalAttackInterval: normalAttackIntervalFor(id),
    intrinsic,
    passivePool,
    intrinsicPassives: buildIntrinsicPassives(passivePool, id),
    evolution: EVOLUTIONS[id],
    rarity,
    dex,
    height,
    weight,
  };
});

export const SPECIES_MAP: Record<number, Species> = Object.fromEntries(
  SPECIES_LIST.map((s) => [s.id, s]),
);

export function getSpecies(id: number): Species {
  const s = SPECIES_MAP[id];
  if (!s) throw new Error(`Unknown species id: ${id}`);
  return s;
}

export { ABILITY_OVERRIDES, FALLBACK_ABILITY };
