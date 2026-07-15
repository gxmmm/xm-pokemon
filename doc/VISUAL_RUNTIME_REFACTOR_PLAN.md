# 视觉运行时与战斗演出底座重构计划

> **状态：进行中（阶段 0 / 1 / 2 已完成；阶段 3 / 4 已人工验收；阶段 5 已完成；阶段 7 已完成星陨观测所、深空遗迹与潮洞的受控正式 GPU 接入）**
> **最后更新：2026-07-15**
> **适用范围：世界场景、城镇、人物 / NPC、地图表现、世界与战斗转场、战斗渲染与程序化技能演出。**

本文件是后续新上下文开发时的**唯一重构导航文档**。开始任何相关任务前必须阅读：

1. `PROJECT_RULES.md`
2. `README.md`
3. 本文件
4. 当前阶段对应的验收清单与现有实现代码

若用户的新要求与本文件冲突：

- **冻结设计、项目最高规则优先于本文件。**
- 对会改变本文件中的“架构决策 / 不变量 / 阶段验收”的需求，先更新本文件，再开始实现。
- 不得以“快速出效果”为由绕开契约、纯规则核心或测试。

---

## 1. 重构目标与成功标准

### 1.1 总目标

建立一套统一、可扩展、可测试、可回退的视觉运行时：

- 世界不再是简陋的 tile 拼图与按 `mapId` 硬编码的临时氛围；
- 城镇、野外、人物、NPC 与战斗共享色彩、环境、镜头和质量档位语言；
- 战斗成为视觉重心，使用 GPU 加速的程序化特效、镜头导演、分层场景和后处理；
- **技能高质量表现不依赖“每个技能一套特效 PNG / 序列帧”**；
- 队伍、图鉴、培养、背包、商店、设置等信息界面仍保留 Vue / DOM 的效率；
- 游戏规则、AI、战斗结算、存档完全不依赖渲染器。

### 1.2 最终玩家体验标准

重构完成前，至少应满足：

1. 玩家进入雾湾镇时，能感受到海港、雾气、地标、空间层级与生活感，而不是看到重复 tile 网格。
2. 玩家、NPC、建筑、树木、桥梁、屋檐等具有正确的前后遮挡、接地关系和环境光照。
3. 重要 NPC 即使隐藏名字，也能从轮廓、服装、位置与行为辨认身份。
4. 野外遇敌后，能从当前世界场景自然切换到同 biome 语义的战斗场景；战斗结束后平滑返回。
5. 普攻、近战、投射、光束、范围、状态、暴击、击倒的演出节奏与视觉语言明显不同。
6. 火、冰、电、草、水、岩石、龙等属性能通过程序化几何、粒子、色彩、轨迹、后处理和环境反应形成可识别风格。
7. 战斗在不加载专属 VFX 图片文件的情况下仍有镜头感、冲击感和“史诗级”关键瞬间。
8. 所有战斗规则与存档逻辑仍可在 Node 测试中独立运行；演出仅消费事件与快照。

### 1.3 明确非目标

本次重构**不做**：

- 商业化、排行榜、日常、体力、VIP 等禁止玩法；
- 重写 `packages/engine` 的战斗规则、AI 设计或已冻结的游戏设计；
- 把所有 Vue 菜单迁移到游戏引擎；
- 把整个项目重写为 3D；
- 把每个技能做成一套独立手写脚本或独立序列帧资源；
- 在没有垂直切片验证的情况下，一次性替换所有地图和全部战斗代码。

---

## 2. 不可妥协的架构决策

### AD-01：Vue 保持为应用壳和静态 UI

Vue 继续负责：

- 路由、Pinia、登录、存档 UI；
- 队伍、图鉴、培养、炼妖、背包、商店、设置；
- 对话框、战斗 HUD、日志、交互面板、提示；
- 非实时的城镇功能页与菜单。

Vue **不得**高频声明式创建、移动或销毁战斗 / 世界渲染对象。

### AD-02：采用独立 GPU 2D Renderer 作为视觉底座

目标实现为 **PixiJS / WebGL 优先** 的渲染运行时；它服务于世界场景和战斗场景。

- 不采用 Phavuer 作为项目架构依赖；
- 不把 Phaser 作为全作主运行时；
- 在真正安装依赖前，先完成本文件定义的 renderer spike（见阶段 1）；
- 若 spike 证明 PixiJS 无法满足项目约束，允许替换底层 renderer，但**不得改变本文件中的 Renderer Contract、Presentation Contract 和纯规则边界**。

### AD-03：游戏规则核心必须纯 TypeScript

`packages/engine` 的职责不变且需继续净化：

- 战斗、AI、伤害、冷却、状态、捕获、炼妖、成长、遭遇、剧情条件；
- 不能导入 Vue、PixiJS、浏览器 DOM、`window`、时间轴或渲染对象；
- 规则计算可通过 Node 测试和 smoke 测试独立验证。

### AD-04：渲染器不决定游戏事实

渲染层禁止判断：

- 谁命中、谁闪避、谁暴击、谁死亡；
- 技能伤害、状态变化、冷却变化；
- 碰撞、遭遇概率、剧情进度；
- 存档内容。

渲染器只消费：

- 明确的世界快照 / 地图配置；
- 战斗快照；
- 由核心产生的结构化事件；
- 经演出层编排后的 cue（镜头、VFX、音效、时间控制）。

### AD-05：程序化 VFX 优先

技能演出主要由以下能力生成：

- 基础几何、渐变、SDF / 距离场风格形状；
- GPU 粒子、轨迹、ribbon / mesh、RenderTexture；
- additive / screen / multiply 等混合模式；
- 噪声扰动、UV 扭曲、局部 bloom、色彩分级、冲击波；
- 镜头构图、短暂停格、时间缩放、环境响应。

允许使用的静态美术：

- 宝可梦本体精灵；
- 地图地表、建筑、地标、树群、NPC、剧情物件；
- UI 图标；
- 少量明确有作者表达价值的 Boss / 剧情专属资产。

除非明确经过设计评审，禁止为普通技能新增必需的 VFX PNG / GIF / sprite sheet。

### AD-06：迁移期间必须可回退

旧 Canvas renderer 不应立即删除：

- 作为 compatibility / 低性能设备回退；
- 作为新渲染器的事件语义比对基准；
- 作为分阶段迁移的稳定版本。

只有核心地图与主战斗路径迁移验收完成后，才评估旧实现的删除或降级。

---

## 3. 目标架构

```text
┌──────────────────────────────────────────────────────────────┐
│ Vue Application Shell                                          │
│ 路由 / Pinia / 菜单 / 队伍 / 图鉴 / 对话 / 战斗 HUD / 设置       │
└────────────────────────┬─────────────────────────────────────┘
                         │ 低频业务命令、快照、UI 状态
┌────────────────────────▼─────────────────────────────────────┐
│ Game Runtime                                                   │
│ 会话编排 / 场景流转 / 存档桥接 / Renderer 生命周期 / 质量档位    │
├────────────────────────┬─────────────────────────────────────┤
│ World Presentation      │ Battle Presentation                 │
│ 世界快照 → 世界视图 cue │ 战斗事件 → timeline / camera / VFX cue│
└──────────────┬─────────┴──────────────┬──────────────────────┘
               │                         │
┌──────────────▼─────────────┐ ┌─────────▼──────────────────────┐
│ Pure Game Core             │ │ GPU Renderer                    │
│ packages/engine            │ │ WorldStage / BattleStage        │
│ 规则 / AI / 存档语义        │ │ Camera / Layers / VFX / PostFX  │
└────────────────────────────┘ └────────────────────────────────┘
```

### 3.1 新模块建议

在现有 monorepo 中建立下列边界（命名可在实现前小幅调整，但职责不能漂移）：

```text
packages/
  shared/                       # 跨端类型、ID、常量
  config/                       # 静态游戏数据 + 新视觉配置
  engine/                       # 纯规则核心，保持无渲染依赖
  presentation/                 # 新：战斗/世界演出语义、timeline、cue
  renderer/                     # 新：Renderer contracts、质量档位、资产契约
  renderer-pixi/                # 新：PixiJS 实现（仅实现层）

apps/web/src/
  game/                         # GameRuntime、Vue ↔ Renderer bridge、挂载
  components/                   # Vue HUD / Viewport 容器
  views/                        # 页面编排
  world/                        # 迁移期旧 Canvas 实现；以后逐步缩小为兼容实现
  battle/                       # 迁移期旧 Canvas 实现；以后逐步缩小为兼容实现
```

### 3.2 依赖方向（必须遵守）

```text
config ──────► engine
shared ──────► engine
shared ──────► presentation
config ──────► presentation
engine ──────► presentation（仅通过明确 DTO / 事件）
presentation ─► renderer（只提供契约，不导入具体 Pixi）
renderer ─────► renderer-pixi
apps/web ─────► engine / presentation / renderer / renderer-pixi

禁止：
engine ───────► apps/web
engine ───────► PixiJS / Vue / DOM
presentation ─► renderer-pixi
renderer-pixi ─► engine 的内部状态或 Pinia store
```

---

## 4. 当前代码基线与迁移注意事项

### 4.1 当前关键实现位置

| 区域 | 当前文件 | 现状 / 迁移处理 |
|---|---|---|
| Canvas 战斗入口 | `apps/web/src/components/BattleCanvas.vue` | 现有 Canvas renderer；保留为 compatibility 与语义参考。 |
| 战斗场景 | `apps/web/src/battle/BattleField.ts` | 已从椭圆竞技场尝试改为透视 biome 场景原型；后续应迁移其视觉语义，不绑定其 Canvas 实现。 |
| 战斗 VFX | `apps/web/src/battle/BattleEffects.ts` | 当前混合了事件解读与 Canvas 绘制；阶段 2 必须拆开。 |
| 动作演出 | `apps/web/src/battle/BattleActions.ts` | 是可抽取的演出语义来源。 |
| 演出快照 / 插值 | `apps/web/src/battle/PresentationTimeline.ts` | 是 `packages/presentation` 的核心迁移源。 |
| 宝可梦绘制 | `apps/web/src/battle/BattleSprite.ts` | 作为 sprite 语义参考；新 renderer 需要对应 `CombatantView`。 |
| 世界 Canvas | `apps/web/src/components/WorldCanvas.vue` | 当前包含地图 tile、实体与按 `mapId` 硬编码氛围；停止在此继续堆世界美术逻辑。 |
| tile 绘制 | `apps/web/src/world/Tileset.ts` | 保留地图逻辑 / 兼容输出；新世界 renderer 只复用必要资产数据。 |
| 人物绘制 | `apps/web/src/world/CharacterSprite.ts` | 迁移为新 `CharacterView` 的资源/动画输入参考。 |
| 游戏规则 | `packages/engine/` | 不改变冻结玩法；需要保持纯粹与可测试。 |
| 静态配置 | `packages/config/` | 新的 biome、世界场景、技能视觉配方应优先放在这里。 |

### 4.2 当前工作区注意事项

截至本文件更新时，工作区存在未提交的战斗场景原型修改：

- `apps/web/src/battle/BattleField.ts`
- `apps/web/src/components/BattleCanvas.vue`

其内容是“去椭圆化、透视化、biome 场景化、六边形站位底座”的 Canvas 原型。该原型已经通过：

- `npm run typecheck`
- `npm run build:web`
- `npm run smoke`
- `git diff --check`

**后续开发者在开始重构前必须先确认这两项修改的归属：**

1. 若作为当前版本可交付改动：单独审查、提交；
2. 若只作为探索性原型：明确记录并保留或有意识地回退；
3. 不得在不知情的情况下覆盖、混入或遗失这些改动。

---

## 5. 统一视觉规范

### 5.1 世界与战斗共享的视觉能力

共享能力，而非共享业务代码：

- `BiomeVisualSpec`：色彩、环境光、雾、天气、环境粒子、地面响应；
- `QualityProfile`：`cinematic | standard | compatibility`；
- `AssetCatalog`：加载、预热、释放、版本化资源键；
- `CameraRig` 基础接口：目标、边界、平滑、屏幕空间偏移；
- `ColorGrade`：色调、暗角、对比度、雾色；
- `AudioCue` 契约；
- 转场（淡入 / 遮罩 / 色调过渡）；
- 分层语义：远景、环境、地表、实体、遮挡、前景、后处理、DOM HUD。

### 5.2 世界场景分层标准

每张新世界地图至少按以下层定义：

```text
0. Sky / distant backdrop      天空、山脊、海面、远景森林、遗迹剪影
1. Ambient back                雾、云影、远景飞鸟、远处光尘
2. Terrain                     可行走地面、道路、水面、坡道、桥面
3. Scenery                     建筑、树群、码头、岩壁、围栏、招牌
4. Entities                    玩家、NPC、野生宝可梦、可交互物
5. Occlusion                   树冠、屋檐、桥顶、船帆、洞口上缘
6. Foreground                  近景草叶、雾片、枝叶、光斑
7. Color / post                色调、暗角、天气整体处理
8. Vue UI                      对话、提示、任务、菜单
```

### 5.3 战斗场景分层标准

```text
0. Distant background          天空、远景、遗迹、环境轮廓
1. Environment back            雾、光尘、远景环境粒子
2. Battlefield                 地表、边缘、场景物
3. Ground effects              焦痕、冰霜、毒雾、雷场、符文
4. Back VFX                    位于宝可梦后方的蓄力、光柱、范围效果
5. Combatants                  宝可梦本体、接地、状态
6. Front VFX                   弹道、斩击、近战轨迹、前景火花
7. Impact / numbers            命中、伤害、状态反馈、击倒余波
8. Foreground / particles      遮挡、飞散物、前景大气
9. Post-process                bloom、局部扭曲、色彩、暗角
10. Vue HUD                    血条、日志、控速、结果 UI
```

### 5.4 人物 / NPC 质量标准

新世界 renderer 的 `CharacterView` 必须支持：

- 至少四方向（重要角色可扩展）；
- idle、walk、run、interact；重要剧情可有额外姿势；
- 接地阴影与轻微待机呼吸；
- 朝向玩家 / 交互目标；
- 遮挡层正确前后关系；
- 由场景光照 / 色调影响；
- 头顶交互标识和情绪 / 剧情 cue；
- NPC 有地点语义的轻量行为循环，不做无意义随机游走。

---

## 6. 核心数据契约

> 实现这些契约时先写类型与测试，再写 Pixi / Vue 代码。类型名允许调整，但表达能力必须保留。

### 6.1 Renderer Contract

```ts
export interface GameRenderer {
  mount(container: HTMLElement): Promise<void>;
  unmount(): void;
  setQuality(profile: QualityProfile): void;
  preload(keys: readonly AssetKey[]): Promise<void>;
  transition(request: SceneTransitionRequest): Promise<void>;
}

export interface WorldRenderer extends GameRenderer {
  enterWorld(input: WorldRenderInput): Promise<void>;
  applyWorldSnapshot(snapshot: WorldRenderSnapshot): void;
  playWorldCues(cues: readonly WorldCue[]): Promise<void>;
}

export interface BattleRenderer extends GameRenderer {
  enterBattle(input: BattleRenderInput): Promise<void>;
  applyBattleSnapshot(snapshot: BattleRenderSnapshot): void;
  playBattleCues(cues: readonly BattleCue[]): Promise<void>;
  isSettled(): boolean;
}
```

### 6.2 战斗 Presentation Contract

```ts
export interface BattlePresentationEvent {
  id: string;
  sequence: number;
  type: 'move' | 'cast-start' | 'skill' | 'damage' | 'heal' | 'status' | 'faint' | 'capture' | 'battle-end';
  actorId?: string;
  targetIds?: readonly string[];
  skillId?: string;
  outcome?: {
    damage?: number;
    critical?: boolean;
    effectiveness?: number;
    missed?: boolean;
    ko?: boolean;
  };
  at: number;
}

export type BattleCue =
  | { type: 'camera'; plan: CameraPlan }
  | { type: 'vfx'; recipe: VfxRecipeRef; anchors: VfxAnchors; intensity: number }
  | { type: 'animation'; subjectId: string; animation: CombatantAnimation }
  | { type: 'hit-stop'; milliseconds: number }
  | { type: 'time-scale'; scale: number; durationMs: number }
  | { type: 'environment'; reaction: EnvironmentReaction }
  | { type: 'sound'; cue: SoundCue };
```

### 6.3 程序化技能视觉配方

```ts
export interface SkillVisualRecipe {
  id: string;
  element: TypeName;
  tier: 'basic' | 'signature' | 'finisher';
  windup: WindupRecipe;
  delivery: DeliveryRecipe;
  impact: ImpactRecipe;
  aftermath?: AftermathRecipe;
  camera: CameraStyle;
  environment?: EnvironmentReactionRecipe;
}
```

设计原则：

- **属性**定义基础视觉语法：色彩、粒子形状、混合模式、运动噪声、环境反应；
- **技能形态**定义攻击结构：投射、光束、冲锋、落雷、环绕、全体领域、近战；
- **技能个性**定义少量修正：多段、锁定、扩散、连锁、蓄力、爆发、持续；
- **结果**定义强度：普通 / 克制 / 暴击 / 击倒；
- **场地**定义反应：草地焦痕、水面电光、洞窟碎石、遗迹符文共鸣等。

禁止用 `if (skillId === ...)` 在 renderer 内无止境新增技能特例；标志性技能的特殊表现也必须通过配置配方或明确的 recipe plugin 注册。

### 6.4 世界 Scene Pack

```ts
export interface WorldSceneSpec {
  id: string;
  biome: Biome;
  terrain: readonly TerrainLayerSpec[];
  scenery: readonly StaticSceneLayerSpec[];
  occlusion: readonly StaticSceneLayerSpec[];
  foreground: readonly StaticSceneLayerSpec[];
  ambience: AmbienceSpec;
  lighting: LightingSpec;
  entities: readonly WorldEntitySpec[];
}
```

要求：

- 地图逻辑格、碰撞、触发仍由现有配置 / engine 语义驱动；
- Scene Pack 只定义视觉构图、层级、资产、环境和视觉实体；
- 禁止继续向 `WorldCanvas.vue` 增加 `if (mapId === '...')` 场景特例；
- `WorldSceneSpec` 必须由配置导出，而非散落在 renderer 内。

### 6.5 Quality Profile

```ts
export type QualityProfile = 'cinematic' | 'standard' | 'compatibility';
```

| 档位 | 目标能力 |
|---|---|
| `cinematic` | WebGL2 优先、完整环境粒子、局部 bloom / 扭曲、较多粒子、完整镜头导演。 |
| `standard` | WebGL、简化后处理、受限粒子数、保留全部信息和演出顺序。 |
| `compatibility` | 旧 Canvas 或低成本实现；关闭高成本效果，但保留状态、事件顺序、可读性和战斗功能。 |

---

## 7. 实施路线图

> 每个阶段结束都必须保证主分支可构建、可 typecheck、可 smoke。  
> 未达到本阶段验收标准，不得因为“想先做下一个更酷的效果”而跳过阶段。

### 阶段 0：冻结基线与重构准备

**目标：** 确保当前系统有可靠基线，避免迁移过程中规则与表现同时漂移。

任务：

- [ ] 审查并处理当前未提交的 BattleField / BattleCanvas 原型修改（见 4.2）。
- [ ] 记录当前 `npm run typecheck`、`npm run smoke`、`npm run build:web` 的绿色基线。
- [ ] 为至少一场 PVE 3vN 战斗和一场 PVP 3v3 战斗保存 deterministic fixture（初始状态、随机种子 / 固定输入、事件序列）。
- [ ] 列出目前 `PresentationTimeline`、`BattleActions`、`BattleEffects` 的职责边界与耦合点。
- [ ] 列出 `WorldCanvas.vue` 内所有按 `mapId` 的硬编码氛围，形成迁移清单。
- [ ] 确认所有游戏设计继续遵守 `PROJECT_RULES.md` 的冻结约束。

验收：

- [ ] 现有测试全绿。
- [ ] 至少两局战斗可稳定复现并导出结构化事件。
- [ ] 当前世界硬编码表现清单已写入 issue / 子文档或本文件附录。

### 阶段 1：Renderer 技术 Spike 与公共契约

**目标：** 验证 GPU renderer 的最低能力，冻结依赖边界；不迁移正式玩法。

任务：

- [ ] 在隔离目录或新包中创建 Pixi renderer spike；不要修改正式 `BattleView`。
- [ ] 验证：固定内部渲染分辨率、像素精灵缩放、分层容器、粒子、blend mode、RenderTexture、shader / filter、camera transform、resize、资源释放。
- [ ] 验证标准设备和低性能 / 无 WebGL 情况下的 capability detection。
- [ ] 创建 `packages/renderer`：`Renderer Contract`、`QualityProfile`、`AssetKey`、基础 scene transition 类型。
- [ ] 创建 `packages/presentation`：先迁入无 DOM 依赖的事件类型与 timeline 类型。
- [ ] 定义 `BiomeVisualSpec`、`WorldSceneSpec`、`SkillVisualRecipe` 的最小 schema，不要一次定义所有字段。
- [ ] 将 Vue 与 renderer 的通信限制为 bridge：Vue 挂载 / 卸载 renderer、发送 session 命令、读取低频 UI snapshot。

验收：

- [ ] `packages/engine` 不新增任何 renderer 依赖。
- [ ] 独立 demo 可在同一页面中渲染一个世界分层场景和一个战斗分层场景。
- [ ] demo 具备 `cinematic / standard / compatibility` 三档选择或自动降级。
- [ ] spike 结论（继续 Pixi 或替换底层实现）必须写入本文件的“决策日志”。

### 阶段 2：抽离战斗演出语义（旧 Canvas 继续工作）

**目标：** 先让战斗演出可被多个 renderer 消费，再开始做华丽新效果。

任务：

- [ ] 从 `PresentationTimeline.ts` 抽出 renderer 无关的 `BattlePresentationEvent`、快照、插值语义到 `packages/presentation`。
- [ ] 将 `BattleEffects.ts` 拆成：
  - [ ] event → cue / recipe 的解释层；
  - [ ] Canvas 具体绘制层（兼容实现）；
  - [ ] 不允许两层继续混在同一个 manager 中。
- [ ] 将 `BattleActions.ts` 的姿态、攻击锚点、蓄力、冲刺等可复用语义迁入 presentation 层。
- [ ] 新建 `BattleDirector`：输入战斗事件 + 快照 + skill visual config，输出可播放的 `BattleCue[]`。
- [ ] 新建基础 `CameraPlan` 和 `VisualScore`：根据普通命中、克制、暴击、击倒、AOE 等计算演出强度。
- [ ] 使用旧 Canvas consumer 消费新 cue，以证明契约正确。
- [ ] 添加测试：同一 fixture 输入得到稳定 cue 序列；cue 不依赖 Pixi / DOM。

验收：

- [ ] 旧 Canvas 战斗仍可完整进行。
- [ ] 核心事件（移动、施法、技能、伤害、暴击、击倒、状态）都能从 `BattleDirector` 产生可序列化 cue。
- [ ] Node 测试无需浏览器即可校验 cue 序列。
- [ ] renderer 不需要读取 engine 内部对象来判断演出。

### 阶段 3：战斗垂直切片（新 Renderer）

**目标：** 证明“不依赖 VFX 文件也能高质量战斗”。只做最小完整战斗，不做全量迁移。

范围：

- 一个 biome（推荐 grass 或当前主线最常见 biome）；
- 2–3 名己方、1–3 名敌方；
- 普攻；
- 一种近战；
- 一种投射；
- 一种光束；
- 一种范围 / 全体；
- 暴击、克制、击倒、一个状态残留；
- 一次世界 → 战斗 → 世界转场。

任务：

- [x] 建立最小 `BattleStage`：包含 CombatantView、环境层、镜头目标/轻摇、程序化 VFX 与 transition overlay；后续仍可拆分为独立子系统。
- [ ] 实现“常规态、预瞄、命中、终结”四种镜头节奏；禁止无意义持续摇屏。
- [x] 实现 presentation-only hit-stop；`BattleSim.tick()` 不因视觉暂停而改变。
- [x] 实现至少五个程序化 VFX primitive：
  - [x] ring / sigil；
  - [x] particle burst；
  - [x] projectile / trail；
  - [x] beam / ribbon；
  - [x] shockwave / impact ring（distortion 留待后续质量提升）。
- [ ] 实现火、草、水、电或按实际样板技能选择的基础 element visual grammar。
- [x] 实现 scorch / spark 环境反应样板。
- [x] 战斗 HUD 保持 Vue DOM；renderer 不画功能 HUD。
- [ ] 与旧 Canvas 对照：同一事件序列在两个 renderer 中应表达相同规则结果和大致演出顺序。

验收：

- [x] 未新增普通技能专属 VFX 图片文件。
- [x] 最小 GPU stage 中可区分近战 / 投射 / 光束 / 范围。
- [ ] 暴击、克制、击倒有递进式镜头与时间反馈，不影响规则结果。
- [x] 雾湾镇 GPU WorldStage ↔ GPU BattleStage 可受控进入并返回。
- [x] cinematic / standard / compatibility 已有明确 density / primitive 降级；低档不丢战斗信息。

### 阶段 4：世界垂直切片 —— 雾湾镇

**目标：** 让城镇达到新的质量基线；验证城镇、角色、遮挡、氛围与转场。

任务：

- [x] 为雾湾镇定义 `WorldSceneSpec`（含 landmarks / characters）；未向 `WorldCanvas.vue` 增加新分支。
- [x] 制作雾湾镇分层静态样板：港湾地表、码头、研究所、灯塔、屋檐遮挡与前景雾带。
- [x] 保留现有地图逻辑、碰撞和剧情坐标；未改主线或 encounter 规则。
- [x] 实现 `WorldStage`、terrain / scenery / entities / occlusion / foreground 层。
- [x] 实现玩家、澜博士、渔人阿澈、码头渔民的 GPU `CharacterView`。
- [x] 实现研究员观测潮汐、居民望海、码头渔民整理渔网等可辨认行为。
- [x] 实现薄雾 ticker 漂移与 quality-gated density；海面/旗帜/窗灯留待场景质量提升。
- [x] 实现港湾色调、灯塔暖光、前景雾与屋檐遮挡。
- [x] 打通雾湾镇 GPU → grass battle GPU → 雾湾镇 GPU 的视觉转场（Canvas 保持 fallback）。

验收：

- [x] 城镇样板以配置化研究所、灯塔、码头、屋檐等地标表达空间。
- [x] 玩家与 NPC 可被市场屋檐遮挡；树冠/船帆属于后续场景扩展。
- [x] 雾湾镇港口地标与三名 NPC 行为已人工验收可辨。
- [x] 旧 `WorldCanvas.vue` 未新增雾湾镇专用逻辑。

### 阶段 5：世界垂直切片 —— 萤火林道与自然场景模块

**目标：** 验证野外探索的自然感与 reusable biome modules。

任务：

- [x] 建立森林 scene pack：树冠遮挡、根须、林间小径、草地、岩石、远景树墙。
- [x] 建立萤火、薄雾、色调环境模块；当前项目昼夜状态继续由旧世界 UI 表达。
- [x] 把 encounter 区域以自然表达呈现，不改变 encounterFloor / 草丛等既有规则。
- [x] 验证玩家移动、NPC、对象、可交互物和镜头边界。
- [x] 复用 `BiomeVisualSpec` 的 `lumen-forest → forest` 语义进入既有 grass battle 场，确保世界与战斗统一色彩语言。
- [x] sandbox 人工验收后，将 `route1` 通过配置化 `GPU_WORLD_MAP_IDS` 受控接入正式 WorldView，并保持 Canvas fallback。

验收：

- [x] 树木不再主要由重复单格 tile 表达。
- [x] 前景、遮挡、雾和小型环境粒子不会影响可读性和交互。
- [x] 场景与同 biome 战斗在色调、地面语义、环境反应上统一。
- [x] `route1` 的正式 GPU eligibility 是显式 migration gate；`pallet` / `route1` 之外的地图继续 Canvas compatibility。

### 阶段 6：技能视觉配方体系与 battle biome 扩展

**目标：** 将“少数技能 demo”扩展为可覆盖全部技能的配置化视觉体系。

任务：

- [x] 在 `packages/config` 创建 `skill-visuals.ts` 和 `battle-environments.ts`。
- [x] 按属性定义基础 visual grammar。
- [x] 按技能形态定义 delivery / impact archetype。
- [x] 为每个技能分配 recipe；普通技能复用 archetype，标志性技能选择 renderer-neutral variant。
- [x] 覆盖现有 141 个技能；同属性可通过 delivery / impact / tier / variant 区分。
- [x] 扩展 grass / cave / water / dragon / arena biome 的场景、地面反应与 ambience。
- [x] 添加配置校验与 `npm run visuals:report`：无 recipe、重复、无效 signature 引用、粒子预算超限均会失败。

验收：

- [x] 全部可用技能都有视觉 recipe 或明确 fallback。
- [x] 所有 recipe 可在配置校验中通过。
- [x] 大范围技能通过 `particleBudget` 与 cinematic / standard / compatibility cap 约束粒子数量。
- [x] 标志性技能的差异来自配置化 variant，而不是 renderer 内不断增长的技能 ID 分支。

### 阶段 7：世界系统化迁移

**目标：** 批量迁移地图与角色，但保持每次变更可验证。

迁移优先顺序：

1. 雾湾镇（阶段 4，质量基线）；
2. 萤火林道（阶段 5，自然模板）；
3. 星陨观测所 / 深空遗迹（强地标与异常视觉模板）；
4. 洞窟、水域、群岛、龙系 / 深空等剩余 biome；
5. 其余城镇和过渡地图。

任务：

- [x] 第一张阶段 7 地图（星陨观测所）完成 Scene Pack、sandbox、人工验收，并通过显式 GPU gate 受控接入正式 renderer。
- [x] 新增可复用 `trace-stars` 角色行为与观测穹顶 / 陨石尖塔 / 星图 / 晶簇 / 裂隙雾 landmark grammar。
- [x] `deep-space` 完成 sandbox-first Scene Pack 与可复用异常遗迹 landmark grammar；人工验收后已通过显式 GPU migration gate 受控接入。
- [x] `dragon-den` 完成潮蚀洞窟 Scene Pack、通用 landmark / object grammar 与独立 sandbox；人工验收后已通过显式 GPU migration gate 受控接入。
- [x] 建立 Scene Pack 资源预算与预加载边界：每图声明 landmark / container / particle / entity cap，且当前程序化 packs 仅加载本图 `procedural-primitives`。
- [x] 为五张受控 GPU 地图建立确定性配置级视觉回归 baseline hash；后续可叠加浏览器截图自动化。

验收：

- [ ] 所有当前启用的可玩地图（含开发训练塔开关启用时的塔层）均具有 `WorldSceneSpec`、sandbox 和受控正式 GPU 验收记录。
- [ ] 主线核心地图均使用新 WorldStage；剩余 `viridian-forest`、`route3`、`rock-tunnel`、`sea-route` 及按开关启用的训练塔地图必须逐张迁移，不允许用 `WorldCanvas.vue` 地图分支补齐。
- [ ] 旧 Canvas 世界 renderer 仅在全量迁移完成前作为临时 fallback；其最终删除条件见“阶段 9”。
- [x] 星陨观测所、深空遗迹与潮洞受控正式 GPU 接入未改变剧情、碰撞、遇敌、NPC 交互和存档兼容性；Canvas 仍为默认与失败 fallback。

### 阶段 8：稳定化、性能与旧实现处置

**目标：** 把重构从“视觉 demo”变成可发布系统。

任务：

- [x] 设备 capability detection、质量自动选择与设置页手动切换。
- [x] 第一轮性能预算：粒子上限、静态 container / landmark / entity cap、scene-local preload ownership 与场景销毁边界。
- [x] 浏览器截图 harness 的首轮运行时内存 / container 观测与重复进入回归：15 次 scene switch、三轮 World → battle sandbox → World、强制 GC heap delta < 32 MiB。
- [x] 正式可玩路径的 draw call / 内存长期观测：本地真实注册 / 建档 / 剧情 / warp 后，三轮 GPU World → GPU Battle → GPU World，强制 GC heap delta < 32 MiB。
- [x] 可访问性与兼容：减少闪烁选项、镜头强度选项、兼容 renderer。
- [ ] 断网 / 资源加载失败策略：GPU stage 的重试、错误 UI、重新进入场景和资源失败诊断必须独立于旧 Canvas；不得把 Canvas 当作最终失败策略。
- [x] 检查 sandbox World → battle → World 的资源释放与重复进入稳定性。
- [x] 检查正式可玩 World → battle → World 的资源释放与重复进入稳定性：真实认证 / 建档 / 剧情 / warp 后三轮 GPU World → GPU Battle → GPU World，heap、draw-call、child 与单 canvas 观测稳定。
- [ ] 完成阶段 9 的全量迁移和删除门槛后，删除旧 `WorldCanvas` / `BattleCanvas` 及其专用 adapter；在此之前禁止“半删除”造成行为双轨。
- [ ] 更新 README、架构文档、开发指南和 smoke / test 文档。

验收：

- [x] 浏览器回归执行三轮 World → battle sandbox → World、15 次 scene switch；每次仅一个 canvas，强制 GC 后 heap delta < 32 MiB。
- [x] 在正式可玩路径完成长时间地图切换与重复战斗的人机观察：三轮认证 GPU World → GPU Battle → GPU World，canvas=1、renderer child / draw-call 采样稳定。
- [x] 五张 Scene Pack × 三档质量的浏览器 PNG baseline 已生成并可重复比对；规则路径不参与截图。
- [ ] 主线关键路径完整可玩。
- [ ] 已文档化的 renderer contract、scene pack、skill recipe 有稳定维护说明。

---

### 阶段 9：全量 GPU 迁移与旧 Canvas 退役

**目标：** 将自定义 `WorldCanvas.vue` / `BattleCanvas.vue` 路径从“临时兼容 fallback”收敛为**可删除的旧实现**。本阶段的完成不是把 GPU 按钮改成默认，而是让 GPU renderer 覆盖全部已发布规则路径、错误路径与质量档位后，删除旧 Canvas 代码和双轨 bridge。

#### 9.0 先决决策（已确定）

- **目标架构：** Vue 继续负责路由、HUD、菜单、对话和设置；世界与战斗实时画面统一由 `renderer-pixi` 承担。
- **不保留自定义 Canvas fallback：** 删除后，`compatibility` 是 Pixi 的低质量档，不是 `WorldCanvas` / `BattleCanvas` 的别名。
- **WebGL 不可用策略：** 显示明确的设备不支持 / 重试 UI，而不是悄悄切回旧 Canvas；这项策略必须在删除旧实现前验收。
- **资源失败策略：** scene-local preload 或 Stage 初始化失败必须可诊断、可重试、可安全回到菜单 / 重进当前路由；不得重新依赖旧 Canvas。
- **规则不变量：** engine、碰撞、warp、NPC 坐标、遭遇、剧情、战斗结算和存档仍由既有 runtime / store 负责；迁移只改变 renderer 与 bridge。

#### 9.1 覆盖清单与迁移顺序

先以 `MAPS` 的实际运行结果建立覆盖 manifest；不得手写一个可能遗漏条件开关地图的列表。覆盖对象至少包括：所有正常地图、`ILLUSION_TOWER_ENABLED=true` 时的所有训练塔层、PVE 野外 / 剧情战 / PVP 三类战斗路径，以及从每个获准 GPU 世界返回世界的路径。

推荐单图闭环顺序：

1. `viridian-forest`：迷雾森林 / 剧情物件模板；
2. `route3`：高径 / 石路 / 星痕模板；
3. `rock-tunnel`：低光洞窟、遮挡和 `encounterFloor` 模板；
4. `sea-route`：潮位、水域、船只与水环境模板；
5. 开发训练塔：五层共用**一个**按 `illusion-tower-*` map ID / floor index 参数化生成的 Scene Pack，不为单层新增 renderer `mapId` 分支；
6. 复核所有既有 GPU 地图及隐藏 / 剧情 warp 回路。

每张地图只能按以下顺序进入正式资格：

```text
WorldSceneSpec / 通用 landmark grammar
  → sandbox DTO 预览与三质量人工验收
  → config budget + fingerprint / visuals:report
  → 浏览器截图 baseline
  → 正式 WorldView 路径行为回归（移动、碰撞、warp、NPC、剧情、遭遇）
  → 显式 GPU migration gate
  → 认证 World → Battle → World 观测
```

在第六步前，**不得**仅因 scene pack 存在而扩大 `GPU_WORLD_MAP_IDS`；在阶段 9.4 前，也不得删除 Canvas。

##### 9.1-a `viridian-forest` sandbox-first（2026-07-15）

- [x] `viridian-forest` 已新增仅配置化 `WorldSceneSpec`：迷雾森林色板、树墙 / 林地 / 根环 / 孢子环 / 遮挡树冠 / 前景低雾、织羽 character DTO，以及潮光孢子 / 异相核 object DTO 外观。
- [x] `WorldStage` 仅扩展通用 `spore-ring` landmark grammar 和 `signal-spore` / `anomaly-core` object grammar；renderer 不读取 Pinia 或 engine 内部状态，也不决定故事对象的坐标或可见性。
- [x] `/world-stage-sandbox` 默认预览迷雾林境，并以既有 story 坐标 `(10, 9)`、`(3, 4)`、`(12, 7)`、`(4, 11)`、`(8, 5)` 作为 renderer DTO 样本；`visuals:browser` 已覆盖六张 sandbox Scene Pack × 三质量档。
- [x] 人工验收已通过：迷雾层次、孢子与异相核可辨性、近景树冠遮挡及 cinematic / standard / compatibility 三档差异均获确认。
- [x] `GPU_WORLD_MAP_IDS` 仍严格为 `pallet` / `route1` / `mt-moon` / `deep-space` / `dragon-den`；`viridian-forest` 未加入 gate，未改 `WorldCanvas.vue`，未删除 Canvas。

##### 9.1-b `viridian-forest` 正式 WorldView 行为回归（2026-07-15）

- [x] 仅在认证 `?renderer-observation=1&world-gpu-diagnostic=viridian-forest` 诊断会话内，Vue bridge 可将**当前就是** `viridian-forest` 的既有 `WorldEntityRenderSnapshot[]` 镜像到 WorldStage；这不是 `GPU_WORLD_MAP_IDS` 的成员资格、不会写入存档，也不进入普通 URL / 发布默认路径。
- [x] 可玩观测经真实注册、开局、白夜战、萤火林道巡查员和真实 north warp 到达迷雾林境；验证森林 WorldStage sceneId、玩家 / NPC / object DTO、三枚孢子的顺序故事可见性、阻挡树格碰撞、草丛 encounter 语义、真实试炼战的 GPU World → GPU Battle → GPU World 返回，以及森林 south warp → 已批准地图路径。
- [x] `renderer-pixi` 仍不读取 Pinia / engine；正式行为与对象状态由 WorldView / store / story 输入。常规用户仍只能通过既有五图 gate 开启 GPU，迷雾林境未出现玩家可见 GPU 开关。
- [x] 人工验收通过：认证诊断路径中的真实移动、树格阻挡、孢子消失 / 织羽出现、试炼战返回与 south warp 均正常。
- [x] 已确认诊断会话边界：URL 查询参数会在路由切换后消失，但同一浏览器标签页的 `sessionStorage` 保留 `renderer-observation` / `world-gpu-diagnostic` 上下文，以覆盖连续 World → Battle → World；这是诊断会话续航，不是 gate 扩大。新标签页 / 新浏览器会话，或清除该标签页 sessionStorage 后，未带显式参数进入迷雾林境仍须为 Canvas 且没有 GPU 切换按钮。
- [x] 9.1-c（2026-07-15）：仅将已验收的 `viridian-forest` 加入显式 `GPU_WORLD_MAP_IDS` migration gate；认证 `visuals:playable` 不再传入 `world-gpu-diagnostic`，确认该图经正常 config gate 完成真实 World → Battle → World。Canvas、`WorldCanvas.vue`、engine、地图、故事与存档均未修改。

##### 9.1-d `route3` sandbox-first（2026-07-15，已人工验收）

- [x] `route3` 新增仅配置化 `starfall-ridge` `WorldSceneSpec`：高径色板、断崖岩壁 / 石阶古道 / 风化台地 / 坠星刻痕 / 岩檐遮挡 / 前景高空薄霭，以及陵导员与三枚坠星刻痕 DTO 外观。
- [x] `WorldStage` 仅扩展 renderer-generic 的 `ridge-wall` / `stone-terrace` / `starfall-scar` / `ridge-overhang` landmark grammar 与 `star-scar` object DTO 外观；不读取 Pinia / engine，也不拥有星痕的故事可见性或位置。
- [x] `/world-stage-sandbox` 默认预览星陨高径，并以既有 story 配置的洛岩 `(6, 8)`、三枚坠星刻痕 `(3, 4)` / `(12, 6)` / `(5, 11)` 作为纯 renderer 输入；浏览器矩阵已扩为七图 × 三档质量的 21 张候选 PNG。
- [x] config fingerprint `0711a01b`、scene budget、smoke 与浏览器自动比对通过；cinematic / standard / compatibility 三档人工视觉验收已通过。
- [x] 认证 `renderer-observation` 已使用受记录的 `world-gpu-diagnostic=route3` 走完真实 chapter-one 开放路径、`route3` DTO / 碰撞 / 星痕顺序 / 洛岩 / 野外战斗往返及 north warp；自动观测通过，等待人工正式行为验收。
- [ ] `GPU_WORLD_MAP_IDS` 不含 `route3`；Canvas 继续保留。只有人工确认正式行为回归后，才可讨论显式 migration gate。

#### 9.2 GPU 默认化（仍保留删除前的安全窗口）

- 全部地图通过上节验收后，WorldView 改为 GPU 默认路径；BattleView 的 PVE、剧情战和 PVP 改为 GPU 默认路径。
- 设置页保留质量、减少闪烁、镜头强度；移除玩家可见的 Canvas / GPU 模式切换按钮。
- 自定义 Canvas 仍可在短暂的内部过渡版本保留，但只能通过明确、受记录的开发诊断开关使用；该开关不得进入发布默认路径，也不得成为资源失败回退。
- 扩展 `visuals:browser`：基于 coverage manifest 覆盖全部已启用 WorldScene × 三质量档；扩展 `visuals:playable`：覆盖野外 PVE、剧情战、PVP 及至少一次跨 biome / warp 往返。

#### 9.3 删除门槛（全部满足才可开始机械删除）

- [ ] `MAPS` 中每张当前启用地图均有经过验收的 `WorldSceneSpec`；开关地图的覆盖由自动校验验证。
- [ ] `GPU_WORLD_MAP_IDS` 不再作为“部分地图白名单”；改为由完整 coverage manifest / 全量配置校验支撑，且没有 Canvas 分支依赖它。
- [ ] WorldView 的 GPU 路径已覆盖移动、碰撞、warp、NPC、故事物件、自然 encounterFloor、潮位、隐藏地图和训练塔开关；这些事实仍由 renderer 外部 DTO 输入。
- [ ] BattleStage 已成为 PVE 野外、剧情战、PVP 的默认 renderer，覆盖 normal / skill / status / KO / capture / result / return；HUD 与规则 tick 保持 Vue / engine 原边界。
- [ ] WebGL 不可用、Stage mount 失败、scene preload 失败、路由中断均有非 Canvas 的用户恢复策略和自动化 / 人工验收。
- [ ] 全部地图 × `cinematic` / `standard` / `compatibility` 截图基线通过；正式认证路径至少三轮 World → Battle → World、跨地图 / 战斗类型观察通过，heap 增量 `< 32 MiB`、每 viewport 一个 canvas。
- [ ] `npm run typecheck`、`npm run smoke`、`npm run visuals:report`、`npm run visuals:browser`、`npm run visuals:playable`、`npm run build:web`、Pixi esbuild bundle 与 `git diff --check` 全部通过。
- [ ] README、迁移指南、handoff、smoke / report 说明已把“Canvas default/fallback”更新为历史信息或删除。

#### 9.4 机械删除批次（单独提交、可审查、不可夹带玩法变更）

删除前先通过静态引用清单确认真实写入集合。预期审计对象包括但不限于：

- `apps/web/src/components/WorldCanvas.vue`；
- `apps/web/src/components/BattleCanvas.vue`；
- Canvas 专用 battle / world adapter、cue adapter、sprite / field helper；
- WorldView / BattleView 中的 renderer mode、Canvas ref、Canvas fallback UI；
- 仅服务于旧 Canvas 的测试、样式、文档与开发按钮。

删除批次必须遵守：

1. 只删除旧 renderer / adapter / UI 分支与死代码；不得顺带改 engine、剧情、地图或存档；
2. 先用 TypeScript / 搜索验证不存在 `WorldCanvas`、`BattleCanvas`、`CanvasCueAdapter` 等旧路径残留；
3. `compatibility` 继续传给 Pixi Stage，而不是重新创建 Canvas；
4. 资源 / WebGL 失败 UI 不实例化旧 Canvas；
5. 删除后重新生成全部视觉基线并完成正式认证 e2e 观测；
6. 若任一删除门槛失败，回到 9.1–9.3 修复，不恢复“永久双轨”设计。

#### 9.5 阶段 9 验收

- [ ] 所有当前启用场景和三类战斗路径只通过 GPU renderer 呈现实时画面；
- [ ] 项目中已不存在自定义 `WorldCanvas` / `BattleCanvas` 的运行时引用或隐藏 fallback；
- [ ] `compatibility`、减少闪烁和镜头关闭均在 GPU renderer 内工作；
- [ ] GPU 失败与不支持设备有可理解、可恢复的产品路径；
- [ ] 规则、存档、地图和剧情 smoke 结果与迁移前一致；
- [ ] 发布构建、全量视觉回归和正式认证路径观测持续通过。


---

## 8. 开发工作流与质量门禁

### 8.1 每个实现任务开始前

1. 阅读本文件和当前阶段内容。
2. 用 `git status --short` 检查工作区；不覆盖他人 / 既有未提交改动。
3. 确认任务归属：规则、presentation、renderer、Vue UI 或配置。
4. 若一个改动跨越多个归属，先定义 DTO / contract，再写实现。
5. 若需要新增美术或 shader，先判断能否用程序化 primitive + 配置实现。

### 8.2 每个 PR / 实现批次的最低验证

```powershell
npm run typecheck
npm run smoke
npm run build:web
git diff --check
```

若本批次改动了 visual config、presentation 或 renderer，还必须：

- [ ] 增加或更新对应的 Node / 配置校验测试；
- [ ] 通过至少一个可重复的 battle fixture；
- [ ] 人工验证 cinematic / standard / compatibility；
- [ ] 记录截图 / 短视频 / 性能观察（在 PR 或开发记录中）。

### 8.3 禁止的实现捷径

- 禁止让 Pixi / renderer 直接订阅 Pinia store 的内部结构；
- 禁止让 engine import renderer；
- 禁止在 renderer 中写战斗规则判断；
- 禁止继续在 `WorldCanvas.vue` 添加 `mapId` 大型分支；
- 禁止将每个技能特效硬编码成 renderer 条件分支；
- 禁止一次性全量替换世界地图或战斗页面；
- 禁止未验证性能就对所有技能开启全屏 bloom、重 shader 或无限粒子；
- 禁止为了视觉改动冻结玩法、数值、剧情或存档语义。

---

## 9. 任务拆分建议

为了让多轮上下文或多人协作不跑偏，按以下边界拆任务：

| 工作包 | 写入范围 | 不应触碰 |
|---|---|---|
| A. Presentation Contract | `packages/presentation/**`、相关 tests | Pixi 具体代码、Vue 页面布局 |
| B. Renderer Contract / Spike | `packages/renderer/**`、`packages/renderer-pixi/**` | `packages/engine` 规则 |
| C. 旧 Canvas Adapter | `apps/web/src/battle/**`、`BattleCanvas.vue` | 新 renderer 内部实现 |
| D. World Scene Config | `packages/config/**` 中 scene / biome 配置 | renderer 内部特例 |
| E. World Renderer | `packages/renderer-pixi/src/world/**` | engine 规则、Vue 菜单 |
| F. Battle Renderer | `packages/renderer-pixi/src/battle/**` | engine 规则、Pinia 业务状态 |
| G. Vue Bridge / HUD | `apps/web/src/game/**`、Battle / World viewport 与 HUD | renderer 核心、规则逻辑 |
| H. Tests / reports | `scripts/**`、对应 package tests | 不直接重构功能模块 |

并行前提：写入目录必须互不重叠；涉及共享 contract 的任务先完成 contract 决策。

---

## 10. 决策日志

> 新上下文若遇到重大技术选择，先在此追加条目，再实施。不要只在对话中口头决定。

| 日期 | 决策 | 原因 | 影响 |
|---|---|---|---|
| 2026-07-14 | Vue 保留用于菜单、HUD 与应用壳。 | 信息界面适合 DOM；避免把所有页面迁入游戏 renderer。 | 所有世界 / 战斗 UI 边界必须通过 bridge。 |
| 2026-07-14 | 不采用 Phavuer 作为架构底座。 | 项目需要稳定、可控、renderer 无关的契约，而非 Vue 声明式管理游戏对象。 | 不引入 Phavuer 依赖。 |
| 2026-07-14 | GPU 2D renderer 以 PixiJS / WebGL 为优先方向，先做 spike。 | 世界需分层与氛围；战斗需要粒子、shader、后处理和镜头，但不需要完整 Phaser 游戏框架。 | 阶段 1 后确认最终底层库。 |
| 2026-07-14 | 特效以程序化 VFX recipe 为主。 | 支持大量技能、降低资源负担、避免每招序列帧。 | 新技能视觉优先新增配置与 primitive。 |
| 2026-07-14 | 世界表现纳入本次重构一级范围。 | 战斗与城镇质量断层会破坏整体体验。 | 必须完成雾湾镇和萤火林道垂直切片。 |
| 2026-07-14 | 阶段 1 Spike 采用 PixiJS 8.19.0，保留 Canvas compatibility 路径。 | 已完成独立 Pixi v8 分层、RenderTexture、additive、resize、质量档位和销毁生命周期实现；正式 BattleView / WorldView 未迁移。 | 继续阶段 2，先抽离 BattleDirector 与 Canvas cue adapter；GPU renderer 不读取 Pinia 或 engine 内部状态。 |
| 2026-07-15 | 旧自定义 Canvas 路径的最终方向确定为删除，而非永久兼容。 | 目前 Canvas 只用于分批迁移和风险隔离；长期双轨会扩大规则 / 视觉回归维护面。 | 阶段 9 要求先覆盖所有启用地图与三类战斗、提供非 Canvas 错误恢复，再单独删除 `WorldCanvas` / `BattleCanvas` 及 adapter。 |

---

## 11. 新上下文接力模板

开始新对话时，可直接附上或引用以下内容：

```text
请继续执行 `doc/VISUAL_RUNTIME_REFACTOR_PLAN.md`。
当前阶段：<填写阶段编号与名称>。
本轮目标：<一个明确、可验证的工作包>。
请先阅读 PROJECT_RULES.md、README.md、doc/VISUAL_RUNTIME_REFACTOR_PLAN.md、
doc/VISUAL_RUNTIME_HANDOFF.md、doc/VISUAL_RUNTIME_BASELINE.md，并先检查 git status；
保留全部未提交改动。遵守 engine / presentation / renderer / Vue 边界，不改规则、地图、剧情、存档或 GPU migration gate，除非本工作包明确在阶段 9 门槛下处理。

若本轮属于阶段 9：一次只迁移一张地图或一个无交叉删除批次；不得在 `WorldCanvas.vue` 新增地图分支，
不得在覆盖 / 错误恢复 / 全量回归满足前删除 Canvas。完成后运行 npm run typecheck、npm run smoke、npm run visuals:report、npm run visuals:browser、npm run visuals:playable、npm run build:web、Pixi esbuild bundle、git diff --check；报告覆盖清单、renderer 边界、验证结果与下一步。
```

建议每次只选一个可闭环目标，例如：

- “阶段 1：只建立 `packages/renderer` 的 contract 和最小 Pixi spike。”
- “阶段 2：只把 `BattlePresentationEvent` 从 `PresentationTimeline.ts` 抽到 `packages/presentation`，保持旧 Canvas 可工作。”
- “阶段 4：只定义雾湾镇 `WorldSceneSpec`，不接入新 renderer。”
- “阶段 3：只实现 projectile + impact 两个程序化 VFX primitive。”

---

## 12. 完成定义（Definition of Done）

本次重构只有在以下条件都满足时，才能宣布完成：

- [ ] 新 renderer 已用于主线核心世界地图和主要战斗路径；
- [ ] 雾湾镇、萤火林道、至少一个异常 / 遗迹地点达到样板质量；
- [ ] 世界具备分层、遮挡、人物行为、环境氛围和统一 biome 视觉语言；
- [ ] 战斗具备镜头导演、程序化 VFX、环境反应和质量档位；
- [ ] 全部技能具有 visual recipe 或明确 fallback；
- [ ] 不依赖“每个技能一套特效文件”；
- [ ] `packages/engine` 保持纯规则，测试和 smoke 仍稳定；
- [ ] Vue 菜单 / HUD 保持独立且没有被 renderer 侵入；
- [ ] 所有当前启用地图、训练塔开关地图与 PVE / 剧情战 / PVP 路径已完成 GPU 覆盖；
- [ ] 自定义旧 Canvas renderer、Canvas adapter 和玩家可见的 Canvas / GPU 双轨切换已按阶段 9 删除；        - - `compatibility` 仅是 GPU 低质量档；
- [ ] WebGL / 资源失败策略不依赖旧 Canvas，且已测试；
- [ ] 文档、开发规范、资源规范、性能预算和迁移指南均已更新。

---

## 附录 A：推荐的首个可交付闭环

不要从“写完整引擎”开始。第一个真正可见、可验证的闭环是：

```text
雾湾镇新 WorldStage
  → 玩家走到草地 / 港口遭遇点
  → 过渡进入新 BattleStage
  → 3v1 或 3v3 自动战斗
  → 普攻 + 近战 + 投射 + 光束 + 范围技能
  → 暴击 / 击倒 / 环境反应
  → 返回雾湾镇原位置
```

完成该闭环后，再批量扩展世界地图和全部技能；在此之前，不要声称底座已经完成。


