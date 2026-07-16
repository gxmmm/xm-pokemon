# 战斗美术升级计划（GPU 运行时后的下一阶段）

> **状态：待实施。** 本文是战斗美术、模型、动作、技能特效与相关配置体系的唯一执行计划。视觉运行时 GPU 重构已于 **2026-07-16** 由开发者确认结束；后续人工测试发现的问题按独立 bug 修复处理，不重新开启运行时重构。
>
> **前置阅读：** `README.md`、`PROJECT_RULES.md`、`doc/VISUAL_RUNTIME_HANDOFF.md`。开始具体工作前再阅读本计划及对应代码。所有沟通、计划与注释使用简体中文。

---

## 1. 目标、范围与完成标准

### 1.1 总目标

在现有 GPU-only Pixi 正式运行时上，把当前以程序化图形为主的战斗表现升级为**资产驱动、动作连贯、可批量扩展且高于旧 Canvas 水平**的战斗美术系统。

升级对象包括：

- 宝可梦战斗模型 / 图像资产、朝向、缩放、层级、材质或调色；
- 待机、移动、受击、濒死、入场、退场、攻击、施放、吟唱、蓄力、持续施法、后摇等动作；
- 主动技能、被动技能、特性、状态、暴击、击败、治疗、护盾、召唤或环境反应的特效与音画 cue；
- 战场环境、镜头、镜头运动、命中反馈、队伍站位与可读性；
- 美术资产的 manifest、版本、预算、预加载、降级与回归基线。

本计划是**内容与表现升级**，不是再次替换渲染框架、战斗规则或前后端 authority。

### 1.2 成功标准（必须同时满足）

1. 正式世界与战斗继续由 GPU/Pixi 路径运行；旧 Canvas 源码继续保留但不重新挂回正式路径。
2. 同一个技能的玩法数据只有一份：修改该技能的数值、目标、冷却或视觉配方后，所有学习该技能的宝可梦自动生效。
3. 同一个技能允许因**使用者模型的配置**产生不同颜色、骨骼挂点、发射位置、动作片段、视觉变体或资源皮肤；这种差异由 resolver 组合配置产生，不复制技能、不在 renderer 写物种判断。
4. 新增一只宝可梦、一个技能、一个被动、一个模型皮肤或一个特效主题时，通常只增加/调整 `packages/config`、资产 manifest 与资源文件；renderer 只扩展通用 primitive 或通用能力，不能添加按 `speciesId` / `skillId` 的表现分支。
5. 每次动作均具备明确相位与可中断/衔接规则；连续 3v3 战斗中不出现明显瞬移、无意义停顿、技能先命中后出手、前一动作被粗暴截断等问题。
6. cinematic / standard / compatibility 三档品质都有确定的资源预算和可读性下限；低档可减少粒子、骨骼层、后处理或帧数，但不能改变战斗事实或让关键技能失去辨识度。
7. 静态校验、fixture/smoke、截图基线和人工战斗验收能证明：配置引用完整、资产可加载、时间轴可执行、同输入 cue 序列稳定、无显著内存/资源泄漏。

### 1.3 不在本阶段内

- 不改变 BattleSim、伤害公式、AI 决策、冷却规则、技能平衡或存档结构，除非另有独立玩法设计批准。
- 不把战斗计算迁移到后端，不让 renderer 反向决定伤害、命中、死亡或剧情。
- 不因美术升级删除 `WorldCanvas.vue`、`BattleCanvas.vue` 或其 Canvas adapter；它们是保留的历史兼容源码，不能作为新美术的正式 fallback。
- 不要求把项目强制改为 3D。首期可以是高质量 2D / 2.5D（分层、骨骼或序列帧、GPU 特效）；资产契约须为未来 3D/骨骼模型保留统一模型、动作和挂点接口。

### 1.4 需要开发者确认的美术产品决策

下列问题不会阻碍先做“阶段 A：契约冻结与内容审计”，但会影响资产生产，**在阶段 B 前必须确认**。建议默认选项已标出：

1. **首期表现形式**：建议采用 **2.5D 分层/骨骼动画 + GPU 特效**，不直接投入完整 3D 模型。它更适合当前 Pixi 技术栈、151 只内容规模和快速迭代；数据契约仍预留未来 3D 模型 provider。
2. **首批验收样本**：建议选 6 只覆盖小/中/大体型、近战/远程/辅助、地面/飞行的宝可梦，以及覆盖 projectile、beam、melee、area、aura、heal/shield、control 的代表技能，而不是一开始批量生产 151 只资产。
3. **美术方向与规格**：需确定像素风强化、动画卡通、半厚涂或其他视觉方向；同时确定基准分辨率、帧率/骨骼质量、镜头尺度和是否允许动态光照/后处理。这些应写入 `BattleAssetManifest` 的版本规范。
4. **资源来源与授权**：现有精灵素材来源和未来模型/音频/特效资源的可用范围、署名、许可证、AI 生成素材规则必须在导入前明确，并逐项记录到 manifest。
5. **音频是否同批纳入**：建议动作 marker、VFX 与声音共享同一配置契约，但音频生产可作为阶段 E 的可选子包；若不纳入，schema 仍保留 `sound` cue，首期以空配置运行。
6. **皮肤/异色的产品语义**：若皮肤仅为静态展示，可只配置 `BattleArtOverride`；若玩家能获得、装备、交易或繁殖出外观，则必须另开存档与玩法设计，不能把可变外观直接塞进 Species 或 renderer。
7. **性能目标**：需要确认最低支持设备/浏览器与首屏加载预算。建议以 standard 档稳定完成 3v3 为最低目标，compatibility 档保持关键信息可读，cinematic 档才启用高密度粒子和后处理。

---

## 2. 已冻结的运行时边界

- 正式游戏是 **GPU-only**：`WorldView` 使用 `WorldStage`，`BattleView` 使用 `BattleStage`。GPU 无法初始化时显示明确状态，不把 Canvas 作为玩家可切换 fallback。
- `packages/engine` 产出战斗事实；`packages/presentation` / `BattlePresentationBridge` 产出延迟快照与有序 cue；`packages/renderer` 只定义 DTO/契约；`packages/renderer-pixi` 只消费 DTO 并绘制。
- Vue/Pinia 负责页面、HUD、路由和驱动；Pixi renderer 不读取 Pinia、BattleSim 内部对象、地图规则或存档。
- 现有 `BattleCue` 与 `SkillVisualRecipe` 是演出入口。升级应扩展其**数据契约与通用 resolver**，不得通过日志文本解析、DOM 事件猜测战斗结果或在 renderer 内重算。
- Canvas 代码必须保留。任何新功能若需要兼容性验证，可复用 cue / DTO；不能删改其历史实现来伪造“完成”，也不能把它重新接入正式运行时。

---

## 3. 配置优先：战斗内容与美术的权威分层

### 3.1 数据归属

| 内容 | 权威位置 | 说明 |
|---|---|---|
| 种族、可学习技能、特性、被动池、战斗定位 | `pokemon.ts` / `abilities.ts` / `passive-skills.ts` | 玩法身份；不能由模型文件反向决定。 |
| 主动技能数值、目标、射程、冷却、`castTime`、玩法效果 | `skills.ts` | 一技能一份定义，所有使用者共享。 |
| 技能通用视觉语义、投递方式、冲击、环境反应、粒子预算 | `skill-visuals.ts` + `visuals.ts` | 技能 ID → 通用 visual recipe；renderer 不解释技能 ID。 |
| 战场环境和环境反应 | `battle-environments.ts` / `visuals.ts` | 环境只提供美术语义，不改变未经 engine 批准的规则。 |
| 模型/皮肤、骨架、动作集、挂点、调色主题、个体 visual override | **新增 battle-art 配置模块与资产 manifest** | 模型身份和资产映射必须显式配置，绝不散落在组件 URL 或 renderer 常量中。 |
| 被动/特性/状态的触发视觉 | **新增 passive/ability/status visual recipe 配置** | 玩法触发来自结构化事件；美术只订阅 cue。 |
| 实际图片、序列帧、骨骼数据、音频等资源 | `apps/web/public/...`（或后续受控 CDN） | 文件路径由 manifest 管理，代码不得硬编码具体物种资源 URL。 |

### 3.2 必须新增或补齐的契约（先设计、再批量生产资产）

建议在共享类型与配置层建立以下独立、可校验的数据对象。命名可在实现前微调，但职责不可合并丢失：

```ts
BattleModelSpec              // modelId、表现类型、资源 key、朝向、默认 scale、shadow、基础调色
BattleRigSpec                // skeleton/anchor 定义：root、muzzle、hand、head、body、ground 等
BattleMotionSet              // idle / move / enter / exit / hit / faint / attack / cast / charge / channel / recover
BattleMotionClip             // 片段时长、循环、可混合、可中断点、事件 marker、播放速率
BattleArtProfile             // 物种默认模型、动作集、visualTheme、发射挂点、调色/变体策略
BattleArtOverride            // 皮肤、稀有外观或未来个体外观的可选覆盖；只覆盖表现，不覆盖玩法
SkillCastPresentationSpec    // prepare、windup、release、travel、impact、recovery 的时序与动作选择
VisualThemeSpec              // 主色、辅色、亮度、材质、trail/impact variant、色盲安全替代
EffectRecipeSpec             // 通用 VFX graph/primitive、挂点、层级、预算、可扩散参数
ReactiveVisualSpec           // ability/passive/status/crit/heal/shield/faint 等事件 → effect/motion/camera/sound cue
BattleAssetManifest          // 资源 key、文件、版本、尺寸/帧数、预加载组、quality tier、许可证/来源
```

这些对象必须是序列化静态配置，支持 schema 校验与引用校验；不把 Pixi `Texture`、`Container`、运行时回调、Vue 组件或 engine 对象存入配置。

### 3.3 组合规则（防止模型绑定与技能复制）

一次施法的表现由纯函数 resolver 组合，至少输入：

- `skillId` 对应的 `Skill` + `SkillVisualRecipe`；
- 施法者的 `BattleArtProfile` / 可选 `BattleArtOverride`；
- 目标、阵营、站位、战场环境、品质档；
- 来自 presentation 的结构化 battle cue（实际发生、目标、强度、暴击/克制等）。

解析优先级必须固定并写入测试：

1. 通用技能 recipe（保证改技能全局生效）；
2. 施法者 visual theme / model hook（允许同技能因模型而改变颜色、挂点或变体）；
3. 环境 reaction（只叠加环境层）；
4. 皮肤/个体 art override（仅在明确许可字段内覆盖）；
5. 质量档降级（只减表现预算）。

**禁止：**

```ts
if (skill.id === 'flamethrower') { ... }
if (combatant.speciesId === 6) { ... }
texture = `/sprites/pokemon/${speciesId}.png`
```

以上分支不得出现在 renderer、Vue 战斗组件、cue adapter 或 timeline 中。唯一许可的位置是通用配置 resolver/manifest 查询，且其输出必须可记录、可测试。

### 3.4 “同技能、不同模型颜色”标准例子

- `skills.ts` 只定义一次“火焰喷射”的伤害、射程、冷却和 `castTime`；
- `skill-visuals.ts` 只定义一次其 projectile / impact recipe；
- 火系蜥蜴模型在 `BattleArtProfile.visualTheme = ember-orange`，幽火主题模型使用 `spectral-violet`；二者均引用同一技能 ID；
- resolver 输出不同 palette、muzzle anchor、motion clip 和 VFX variant；任何数值改动仍自动影响所有学习该技能的模型；
- 若需要真正不同玩法，才新建技能 ID，并在玩法设计中明确说明；不得为换色复制技能。

---

## 4. 动作与时间轴标准（流畅性的硬要求）

### 4.1 标准施法相位

每个主动技能都映射到以下可选/必选相位；所有相位均是 presentation 层表现，战斗事实仍由 engine 时间线决定：

1. **prepare**：目标锁定 / 朝向转身 / 轻微预备；
2. **windup**：攻击前摇，建立动作意图；
3. **charge**：吟唱或蓄力，可循环，带能量累积与取消/完成 marker；
4. **release**：施放瞬间，作为命中前的视觉释放点；
5. **travel / channel**：投射物飞行、光束持续、近战位移或持续施法循环；
6. **impact**：命中、护盾抵挡、闪避、暴击、克制/无效等结果的结构化反馈；
7. **recovery**：攻击后摇，平滑回到 idle / move / channel，不硬切；
8. **interrupt / react**：被击、眩晕、死亡、替换、强制移动等优先级更高的中断路径。

`castTime` 仍是现有玩法权威的前摇数据。新增 presentation timing 只能定义动作分配、视觉缓冲、marker 与可混合窗口；不得偷偷改变实际伤害结算时机。若玩法需要“蓄力可被打断”或“持续伤害每 tick”，必须先单独扩展 engine/Skill 数据并经规则批准。

### 4.2 动作状态机要求

- 最小统一状态：`idle`、`locomotion`、`enter`、`exit`、`attack`、`cast`、`charge`、`channel`、`recover`、`hit`、`guard`、`faint`。
- 每个模型都必须声明其支持的 clip；缺失 clip 由**配置指定的通用 fallback**补齐，不能在 renderer 物种分支补洞。
- clip 有 `loop`、混合入/出时长、可取消点、root motion 许可、marker（如 muzzle flash / projectile spawn / hit-ready）和 quality 变体。
- 移动/攻击/受击/死亡优先级及可抢占性由通用状态机定义；同一角色不会同时播放互斥 clip。
- 近战冲刺、远程施放、持续光束和范围法术需分别有基线模板，模型通过动作集选择模板与参数，而不是复制 renderer 逻辑。
- 战斗时间缩放、hit-stop、镜头和粒子都只影响表现游标；停止或慢放不能导致 cue 重放、重复伤害或错过结算。

### 4.3 观感质量门槛

每种首期支持的施法模板至少具备：明确前摇、释放 marker、命中反馈、自然后摇/回待机；吟唱和持续施法另有循环层与结束过渡。3v3 同屏时优先级必须保证：关键施法者、关键目标、击败、护盾/治疗和高危险区域仍清晰可读。

---

## 5. 实施路线图

### 阶段 A：契约冻结与内容审计

**目标：** 先清点全部现有战斗数据与硬编码缺口，再定义类型和命名。

- 审计 `pokemon.ts`、`skills.ts`、`passive-skills.ts`、`abilities.ts`、`skill-visuals.ts`、`battle-environments.ts`、presentation cue、`BattleStage` 及 Canvas 兼容层；
- 列出现有模型来源、贴图路径、renderer 中 Graphics primitive、动作 cue 字符串、按技能/物种分支和无法配置的行为；
- 设计 `BattleArtProfile`、manifest、动作/挂点、被动/状态 recipe 的 TypeScript schema；
- 写配置完整性校验：所有可战斗物种有 art profile、所有技能有 recipe/fallback、所有引用资源存在、所有 clip/anchor 可解析；
- 形成一份“现状 → 目标字段”的迁移表并得到开发者确认后才生产美术资产。

**验收：** 无 renderer/组件硬编码新增；schema、fallback 和 resolver 优先级有单元/smoke 覆盖。

### 阶段 A 实施记录（2026-07-16）

本阶段已完成静态战斗美术契约与审计底座，未改动 BattleSim、伤害、AI、存档、正式运行时路径或 Canvas 源码。

- 新增 `packages/config/src/battle-art.ts`，集中声明 `BattleAssetManifestEntry`、`BattleArtProfile`、锚点、完整动作集、动作 marker、主题调色、技能施法表现、被动/特性/状态 reactive recipe 与纯 `resolveBattleArtPresentation()` resolver；并从 `packages/config/src/index.ts` 统一导出。
- 已为 151 个现有 Species 生成显式 art profile，资源地址只出现在 asset manifest：前视 `/sprites/pokemon/<id>.png`、玩家后视 `/sprites/pokemon/back/<id>.png`。当前模型表现格式标记为 `static-sprite`，为下一阶段替换为分层/骨骼资产保留 `modelId`、`motions`、`anchors` 与 manifest key，不绑定 Pixi 对象或贴图。
- 已为全部 141 个主动技能生成 `SkillCastPresentationSpec`；`castTime` 仅映射为表现层 `windupMs`，并配置 prepare/release/recover marker、charge/channel 意图与近战/远程发射挂点。正常攻击使用通用 fallback，不要求复制技能配置。
- 已为全部现有 Ability、Passive 与 6 种 Status 建立 reactive visual recipe；它们尚未改动正式 cue/renderer 消费路径，后续阶段接入时只能消费结构化事件，不得解析日志或重算规则。
- resolver 已验证“同一技能、不同模型”路径：共享 `swift` recipe 仍是一份，喷火龙和皮卡丘按 profile 得到不同主题、前/后资源与发射挂点；未知模型/技能解析到配置化 `generic:fallback`，不会在 renderer 中补物种分支。
- `validateBattleArtConfiguration()` 与 smoke 已校验：151 profile、303 manifest 资产声明、所有实际 sprite 文件、动作/锚点完整性、技能/能力/被动/状态覆盖及 fallback。`npm run smoke` 与 `npm run typecheck` 于 2026-07-16 通过。

**审计结论与下一阶段边界：** 当前 GPU `BattleStage` 仍用程序化 `Graphics` 圆形战斗体，尚未消费模型资产；Canvas 保留层仍有自己的贴图加载辅助。阶段 B 应实现通用 GPU asset loader / `CombatantView`，只消费本阶段的 manifest 与 resolver 输出，并以 3–6 个代表模型验证 2.5D 分层或骨骼资产；不得把具体物种路径、技能 ID 分支或 Canvas fallback 接回正式路径。

### 阶段 B：资产管线与首批模型基线

**目标：** 建立可重复导入、可替换、可追踪版本的资产流程。

- 确定首期表现格式（高质量序列帧、spine/骨骼、分层 2D，或兼容这些格式的 manifest）；
- 落地 asset key、atlas/骨架 metadata、许可证与来源记录、预加载分组、尺寸和性能预算；
- 制作 3–6 个覆盖不同体型/战斗角色的代表模型，含 idle、move、attack、cast、charge、channel、hit、faint；
- 实现通用 Pixi asset loader、对象池、锚点解析、颜色主题和缺失资源 fallback；
- 正式 renderer 通过 DTO 的 `modelId` / `artProfileId` 消费资产，永不拼接物种 URL。

**验收：** 同一模型可替换资源不改代码；资源加载失败有可见但不崩溃的通用 fallback；切场景/重复战斗无持有资源泄漏。

#### 阶段 B-1 实施记录（2026-07-16）：静态 Sprite GPU 接入

本工作包先完成现有 151 张前/后视 sprite 的**通用 GPU 资产接入**，不宣称已完成新模型生产、骨骼动画或 2.5D 首批美术资产。

- 新增 `packages/renderer-pixi/src/BattleArtAssets.ts`：`BattleArtAssetLoader` 只接收 `BattleAssetManifestEntry`，使用 Pixi `Assets.load()` 按 manifest 加载并缓存 `Texture`；资源失败返回 `null`，不抛出到战斗流程。它不接收 `speciesId`、`skillId` 或任意文件路径字符串。
- 新增 `packages/renderer-pixi/src/CombatantView.ts`：消费 `resolveBattleArtPresentation()` 的 profile、asset、theme 与 motion；正常显示 manifest 声明的 sprite，未加载或失败时显示配置化程序 fallback。它包含 idle / locomotion / charge / channel 的轻微循环，以及 attack / cast / hit / faint 等统一 motion 状态，动作 cue 由配置层 `battleArtMotionForAnimation()` 映射。
- `BattleStage` 不再创建程序化圆形战斗体；进入战斗时只预加载当前 3vN 队伍的 manifest 资产，snapshot 仅以 `speciesId`/side 通过 resolver 创建或刷新 `CombatantView`，animation cue 驱动 view 的通用动作。正式 GPU 路径没有引入 Canvas fallback，Canvas 源码未改动。
- `BattleArtAssetLoader`、`CombatantView` 已从 `@pokemon-online/renderer-pixi` 导出；smoke 覆盖 loader 的 manifest-only 输入、fallback 类型与 `CombatantView` motion；`npm run smoke`、`npm run typecheck`、`npm run build:web` 于 2026-07-16 通过。

**仍在阶段 B 的后续工作：** 选择 3–6 个代表宝可梦，替换现有静态 sprite 为受控的分层/骨骼或高质量序列帧资产；在不改变 `BattleArtProfile`/manifest/resolver API 的前提下补充真实 attack、cast、charge、channel、hit、faint clip，并做浏览器人工验收和资源生命周期观测。

#### 阶段 B-2 实施记录（2026-07-16）：六种代表模型的 2.5D 配置切片

本工作包以现有已记录来源的静态 sprite 为底图，完成可运行的 **2.5D 分层与动作姿态切片**；没有引入未确认授权的新外部图片，也没有把临时图片路径绑进 renderer。

- 在 `battle-art.ts` 为 profile 补充通用 `BattleArtLayerSpec`（aura / halo、前后景、主题色、呼吸参数）与 `BattleArtMotionPose`（位移、旋转、缩放、发光强度）。这些是 renderer 通用能力，不包含物种或技能条件分支。
- 首批代表模型由配置显式选定：喷火龙 #006（空中爆发）、皮卡丘 #025（小型敏捷）、耿鬼 #094（幽灵施法）、拉普拉斯 #131（水系支援）、卡比兽 #143（重装坦克）、快龙 #149（空中龙系）。每个 profile 有独立 `modelId`、体型/阴影尺度、aura/halo 组合及 attack/cast/charge/channel/hit/faint 等姿态参数。
- `CombatantView` 现根据 resolved profile 创建前后分层，按 motion pose 驱动模型的位移、旋转、缩放与光效；未配置代表切片的其余 145 只继续使用相同的 manifest sprite + 通用动作/fallback，不出现 renderer 物种分支。
- 新增 view diagnostics 和 smoke 覆盖，确认 #006 的 `showcase:flame-wing` profile 在 `windup` cue 后进入 `charge`、声明两层配置化装饰。`npm run smoke`、`npm run typecheck`、`npm run build:web` 与 `git diff --check` 于 2026-07-16 通过。

**下一项真实美术生产前的确认：** 当前六只的“分层”是可运行的 GPU 配置与通用光效层，不等同于新绘制的骨骼/序列帧角色美术。进入新位图或骨骼资产生产前，需要确认视觉风格与授权来源；届时新资产只能新增 manifest 项和 profile 引用，不能改变 gameplay 数据、把文件路径散落到 renderer，或删除/接回 Canvas。

#### 阶段 B-3 实施记录（2026-07-16）：首期真实角色资产的来源门禁与导入契约

本工作包以喷火龙 #006（`showcase:flame-wing`）完成首个 vertical slice。经过 v1～v3 纯代码重绘候选的人工否决后，开发者验收通过 v4：以项目已经下载、已记录来源的 PokeAPI #006 前/后视静态 sprite 为基底，离线脚本逐像素复制为 PNG 序列帧 + JSON metadata；通过 manifest/profile 原子接入，未覆盖任何原始 sprite。

- `BattleAssetManifestEntry` 以 `sourceId` 显式关联 `BATTLE_ASSET_SOURCES`；每个来源记录包含来源链接、许可证证据链接、署名和审计状态。#006 v4 明确继承已记录的 PokeAPI 来源；v1～v3 的纯代码重绘来源仍保留，仅作历史候选。
- `BATTLE_ART_IMPORT_CONTRACTS` 中 #006 的 `vertical-slice:flame-wing-2d-sequence` 已声明 v4 PokeAPI 派生来源、96×96/12fps/透明 PNG 的 `png-sequence-json`、`idle/attack/cast/charge/channel/hit/faint`、`cubic-in-out` 通用补间和公共 fallback。状态为 `integrated`；校验确保前/后 manifest 条目存在且 #006 profile 同步引用它们。
- Pixi manifest loader 对通用 `sprite-sheet` 位图与 JSON clip 元数据保持仅 manifest 输入；`CombatantView` 用通用播放器按 clip 帧播放，以 `cubic-in-out` 插值实现待机到攻击等 motion pose 衔接，并从 snapshot 的 `combatant.facing` 统一镜像贴图、序列帧、光环、fallback、水平偏移和倾角。它不接收 species、skill 或路径字符串；角色资源、元数据或 clip 加载失败依旧使用配置化程序 fallback；Canvas 文件保持未挂载，也未被接回正式路径。
- 新增 `doc/BATTLE_ASSET_SOURCES.md`，记录当前来源、许可证证据、无损封装脚本、校验和和验收结论。smoke 扩展为来源/许可证字段、已生成 PNG/JSON 存在、关键动作与补间契约、方向镜像、manifest ID 与 fallback 的确定性断言。

**B-3 后续工作：** #006 的代码生成资产已接入；v1、v2、v3 的纯代码重绘均未达到角色可辨识质量要求而保留为未验收候选；v4 不再重绘轮廓，而是将项目已下载、已记录来源的 PokeAPI #006 前/后视 sprite 无损复制为序列帧基底，配合通用 motion pose、补间和 aura/halo 提供动态，已获开发者基础模型验收通过。后续代表模型优先采用同一“已记录来源静态基底 + 通用 GPU 动态表现”的路径。另已补齐通用 `facing` 镜像：模型、序列帧、光环、fallback、动作偏移和倾角均从 snapshot 的 `combatant.facing` 消费方向变化，禁止物种特判。下一项是浏览器中的完整人工验收、性能/资源生命周期观察，以及在确认质量后把同一通用契约推广到下一只代表模型。不得改 BattleSim/AI/伤害/存档，或在 renderer/Vue/cue adapter 添加物种、技能或资源路径分支。

### 阶段 C：动作导演与施法时间轴

**目标：** 把 cue 从粗粒度 `animation` 扩展为可审计的动作/相位计划。

- 建立纯 `BattleArtResolver` / `BattleMotionDirector`：输入 cue + 配置、输出 deterministic action/VFX plan；
- 将现有 `castTime` 映射到 windup/release marker，补齐恢复、命中反应、持续施法和取消逻辑；
- 支持目标朝向、近战短冲、远程发射挂点、受击方向、悬浮/飞行模型和无肢体模型 fallback；
- 先在固定 1v1 / 3v3 fixture 证明 cue 顺序、clip marker 与视觉游标稳定，再接入正式 `BattleStage`；
- Canvas adapter 可选择性消费相同 plan 做回归，但不得成为正式依赖。

**验收：** 代表技能在连续释放、受击中断、目标死亡、多个目标、替补入场等场景中无重复 cue、无硬切和无状态卡死。

### 阶段 D：技能、被动、特性与状态特效库

**目标：** 用少量高质量通用 VFX graph 覆盖大量内容，而非为每技能写一段特效代码。

- 建立 projectile、beam、melee arc、area、aura、shield、heal、dot、control、buff/debuff、faint、switch 等通用 effect primitives；
- 从通用技能 recipe 解析颜色、轨迹、粒子、冲击、环境反应和预算；
- 增加被动/特性/状态视觉 recipe：触发条件来自 engine event/cue，表现从 config 解析；
- 支持同技能按 `visualTheme` 改色/变体，支持环境层叠加，保持伤害与效果不变；
- 引入镜头、安全闪烁阈值、屏幕震动、可读性层级、色盲与减少动态效果设置。

**验收：** 用代表性技能/被动/状态矩阵验证覆盖率；任意一个既有技能数值改动不会要求修改 renderer；任意模型主题改变能让共享技能改色而不复制技能。

### 阶段 E：战场、镜头、音画与完成度

**目标：** 让资产、动作、特效与环境在完整战斗中形成超过旧 Canvas 的统一观感。

- 为 `BattleEnvironmentSpec` 补齐配置化前/中/后景、环境粒子、受技能反应层、光照/调色和镜头安全区；
- 以通用 camera plan 处理 focus、track、impact、finisher，限制 3v3 中频繁抢镜；
- 将声音（若本批纳入）与动作 marker / VFX recipe 一样配置化：sound key、混音组、音量、可访问性开关；
- 逐步覆盖全部已可用模型/技能，缺失项目明确进入 manifest/backlog，而非靠代码临时绘制；
- 更新 screenshot baseline、性能预算、质量档与人工验收清单。

**验收：** 首期代表阵容在 cinematic / standard / compatibility 下均可连续完成 PVE/PVP 3v3；表现、帧时间、资源数和可读性达标，且人工确认观感超过当前 Canvas 基线。

### 阶段 F：规模化内容与维护

- 批量补齐 151 只宝可梦的 art profile 与所需动作；
- 批量整理全部技能、被动、特性、状态的 visual recipe 覆盖率；
- 通过生成报告找出缺失 clip、资产、anchor、recipe、质量档和许可证信息；
- 新内容提交流程改为“配置 + 资产 + 校验 + baseline”，禁止临时 renderer 分支；
- 后续发现 bug 作为独立问题修复，保持 GPU 架构和 Canvas 保留原则不变。

---

## 6. 测试、性能与质量门禁

每个实现批次至少执行与改动相匹配的检查：

1. `npm run typecheck`；
2. `npm run smoke`，补充 art config/reference/resolver 的确定性断言；
3. `npm run build:web`；
4. `git diff --check`；
5. 相关战斗 fixture 的 cue / motion plan 快照；
6. 至少一个 PVE 3vN 与一个 PVP 3v3 的人工可玩检查；
7. 对修改的品质档生成或复核 screenshot baseline、资源预算与生命周期诊断。

性能规则：

- 资源加载、atlas、对象池、粒子、光效和骨骼层均有配置化上限；
- renderer 以 `quality` 降低表现成本，不以减少伤害/战斗事件来“优化”；
- 过量 VFX 自动合并/节流应是通用预算策略，不能按某只宝可梦特殊处理；
- 所有动态对象在战斗退出、重试、路由离开时释放，diagnostics 可观测 canvas 数、资源数、效果数与 draw calls。

---

## 7. 内容作者与 AI 的检查清单

新增或修改战斗内容前必须回答：

1. 这是玩法差异，还是仅美术差异？仅美术差异不得新建重复技能/被动。
2. 该数据应放在技能、物种、被动/特性、环境还是 art profile？是否存在唯一权威？
3. 共享技能修改后，所有引用者是否应同步更新？若否，差异是否由 visual theme/override 的许可字段表达？
4. 模型有无完整动作与挂点？缺失时使用哪个通用 fallback？
5. cue、动作、VFX、音频、环境反应和 quality tier 是否都来自配置/manifest？
6. renderer 是否新增了 `skillId`、`speciesId`、文件路径或模型专属判断？如有，必须在合并前改为 resolver/配置。
7. 是否改变了 engine authority、战斗数值或存档？如是，必须拆为独立设计与验证工作包。
8. 是否更新了 schema 校验、fixture、预算、截图基线和许可证/来源信息？

---

## 8. 新上下文接力模板

```text
我们继续 Pokemon Online 的“战斗美术升级计划”。

先阅读：
- README.md
- PROJECT_RULES.md
- doc/VISUAL_RUNTIME_HANDOFF.md
- doc/BATTLE_ART_UPGRADE_PLAN.md
- 与当前任务相关的 packages/config、packages/shared、packages/presentation、packages/renderer、packages/renderer-pixi 文件。

先检查 git status，保留所有未提交改动；不得 reset、checkout、覆盖或删除现有改动。

已冻结：正式世界/战斗是 GPU-only Pixi 路径；WorldCanvas、BattleCanvas 及 Canvas adapter 源码必须保留，但不得重新挂入正式运行时。BattleSim/engine 决定战斗事实，presentation 产出 cue，renderer 只消费 DTO。

最高美术规则：模型、动作、技能、被动/特性/状态特效、环境、资产映射和质量预算必须配置化。一个技能只有一份玩法/通用视觉定义；模型差异通过 art profile/theme/anchor/variant resolver 表达。禁止在 renderer 或 Vue 组件按 skillId、speciesId 或资源路径硬编码。

本次只完成一个可验证工作包，先说明其对应本计划的阶段、影响的配置契约、验证方式和 Canvas 保留情况；不顺带重构玩法或删除 Canvas。
```
