# 战斗特效素材接口 (Battle VFX Assets)

战斗特效**默认全部由代码程序化绘制**（像素风粒子，按 `TYPE_COLORS` 着色），零素材即可运行。
本目录用于放置可选的 1:1 像素特效贴图来覆盖程序化绘制。全部素材必须为**像素风**（pixel-art）。

## 如何启用自定义特效贴图

1. 把对应名称的 `.png` 放到下表路径。
2. 在本目录创建 `atlas.json`，列出已提供的素材名（不含扩展名、不含目录前缀的完整相对名）：

```json
{ "images": ["type/fire", "type/water", "shared/heal", "shared/shield", "status/burn", "cast/fire"] }
```

渲染器启动时会读取 `atlas.json` 并加载列出的贴图；未列出或加载失败的项自动回退程序化绘制。
**缺失 `atlas.json` 时完全不加载任何特效贴图**（一次 404 后走程序化，无性能损耗）。

## 命名规则（代码所需名称）

代码通过名称引用素材，文件名 = 名称 + `.png`。下方每个 `.md` 占位文件对应一个代码所需名称，
说明该素材的规格。提供真实贴图时删除对应 `.md`、放入同名 `.png` 即可。

### 按属性（type/<属性>.png）-- 用于远程弹道与命中爆裂
16~32px 见方，透明背景，居中。按属性主题色绘制（见 `TYPE_COLORS`）。
用于该属性技能的弹道（projectile）与命中爆裂（burst）。

- type/normal, type/fire, type/water, type/grass, type/electric, type/ice,
- type/fighting, type/poison, type/ground, type/flying, type/psychic, type/bug,
- type/rock, type/ghost, type/dragon, type/dark, type/steel, type/fairy

### 通用（shared/<名称>.png）
- `shared/heal`   -- 治疗特效（绿色十字/光点），约 24px。
- `shared/shield` -- 护盾特效（半透明罩），约 44px。

### 状态光环（status/<状态>.png）
用于宝可梦身上**持续**的状态环境粒子（每帧绘制，非一次性）。约 32px，透明背景，居中。
存在时覆盖程序化粒子；缺失时按状态程序化绘制：burn 上升火星 / poison 紫泡 / paralyze 电弧 / freeze 冰晶 / sleep 浮动 Z / confuse 绕圈星。
- status/burn, status/poison, status/paralyze, status/freeze, status/sleep, status/confuse

### 蓄力充能（cast/<属性>.png）
用于高级技能蓄力前摇期间的**核心充能光球**（地面圆与向内收敛粒子始终程序化，此贴图替换核心）。
约 24px，属性主题色（见 `TYPE_COLORS`），透明背景，居中。属性名同上 `type/<属性>` 列表。
- cast/fire, cast/water, cast/grass, cast/electric, cast/ice, cast/fighting, cast/poison,
  cast/ground, cast/flying, cast/psychic, cast/bug, cast/rock, cast/ghost, cast/dragon,
  cast/dark, cast/steel, cast/fairy（cast/normal 一般用不到，普攻无前摇）

### 战场背景
- `sprites/battle/arena-bg.png` -- 768×384 整图（16×8 格，2:1）。缺失时按地图生态程序化绘制
  （grass/cave/water/dragon/arena 五种主题）。见 `sprites/battle/arena-bg.md`。

## 备注
- 近战劈砍（slash）、浮动数字、倒下粒子、尘土、阵营地面光晕、暗角等**始终程序化绘制**，不读取贴图，保证轻量与一致风格。
- 蓄力充能核心（`cast/<属性>`）与状态光环（`status/<状态>`）默认程序化，可按上表放贴图覆盖。
- 命中冻帧、攻击者前冲、受击形变、屏闪等打击感效果为纯渲染逻辑，无贴图。
- 宝可梦精灵走 `sprites/pokemon/<id>.png` 与 `back/<id>.png`（已由 PokeAPI 下载），
  缺失时由 Pixi 战斗 renderer 的配置化 fallback 保持战斗可读性。
