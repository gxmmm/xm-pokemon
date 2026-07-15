# 视觉运行时重构基线与迁移清单

> 记录日期：2026-07-14。该清单对应 `VISUAL_RUNTIME_REFACTOR_PLAN.md` 的阶段 0，供后续迁移核对；不替代主计划中的架构约束。

## 已验证的基线

在开始公共契约重构前，以下命令均通过：

```powershell
npm run typecheck
npm run smoke
npm run build:web
git diff --check
```

现有 smoke 已覆盖 PVE 3v1、PVE 同时上场 3v1、PVP 3v3，以及结构化伤害结果、技能可视化 profile、事件驱动动作时间轴。

## 战斗演出当前职责与迁移边界

| 现有模块 | 当前职责 | 目标归属 | 迁移注意事项 |
|---|---|---|---|
| `PresentationTimeline.ts` | 战斗快照深拷贝、连续像素位置插值、延迟显示语义 | `packages/presentation` | 可直接抽离；不得依赖 Canvas / Vue。 |
| `BattleActions.ts` | 由结构化事件驱动的姿态、攻击方向、投射起点 | presentation 语义 + Canvas adapter | 先把动作 DTO / cue 抽离，再保留 Canvas 兼容 consumer。 |
| `BattleEffects.ts` | 技能 profile、事件消费、Canvas 形状绘制与生命周期 | event→cue/recipe 解释层 + Canvas VFX adapter | 当前把解释和绘制混在同一 manager；阶段 2 必须拆分。 |
| `BattleCanvas.vue` | 逐帧调用、场地绘制、sprite、旧 Action / VFX manager | compatibility renderer / Vue bridge | 继续工作；不得成为 Pixi 的依赖。 |

## WorldCanvas 硬编码氛围清单

`apps/web/src/components/WorldCanvas.vue` 的 `drawAtmosphere` 目前包含以下 mapId 分支，后续逐一迁移至 `WorldSceneSpec` / `BiomeVisualSpec`：

- `pallet`（雾湾镇）
- `route1`（萤火林道）
- `sea-route`
- `viridian-forest`
- `route3`
- `mt-moon`
- `dragon-den`
- `deep-space`
- `illusion-tower-*`

阶段 1 仅配置雾湾镇与萤火林道 scene pack 原型；旧 Canvas 分支不在本批次删除或改写。

## 确定性 fixture 约定

阶段 1 先通过 `scripts/visual-runtime-fixtures.ts` 定义固定输入、固定 RNG seed 和 UID 的 PVE/PVP 结构化事件 fixture，并在 smoke 中验证同一输入稳定生成相同事件和 presentation DTO 序列。它们是后续 `BattleDirector` 和 renderer consumer 的共同回归输入。

## 阶段 2 实施记录（2026-07-14）

本批次完成了第一段可回退的演出语义迁移：

- `BattleDirector` 位于 `packages/presentation`，只将结构化 `BattlePresentationEvent` 与 visual recipe 转成可序列化的 cue；它不导入 DOM、Pixi、Vue、Pinia 或 engine 内部状态。
- `BattleView` 用 director 消费延迟 presentation 事件；`BattleCanvas` 不再直接消费 engine event，而是通过 `CanvasCueAdapter` 消费 director cue。
- `BattleActionTimeline` 增加 `consumeCues`，保留旧 event 方法仅作 compatibility / 回归适配。
- `EffectManager.consumeLegacyEvents` 明确成为 Canvas 具体绘制输入；它不再是主路径的 event → cue 解释器。
- smoke 覆盖固定 fixture 的 cue 序列稳定性、结构化 cue、Canvas adapter 和动作 cue 消费。

阶段 2 的 Canvas primitive 拆分与 presentation bridge 抽离已完成；PVE 3v1、PVP 3v3 与 cinematic / standard / compatibility 的浏览器人工验证已完成。当前进入阶段 3 最小 Pixi BattleStage 的并行垂直切片。


## Battle presentation bridge（2026-07-14）

`apps/web/src/game/BattlePresentationBridge.ts` 已接管原先位于 `BattleView.vue` 的非权威演出编排：

- 维护 snapshot history、延迟 presentation cursor 与 presentation-only hit-stop；
- 通过 `snapshotBattle()` / `interpolateBattle()` 产生延迟 `BattlePresentation`；
- 在延迟事件越过游标时调用 `BattleDirector`，输出增量 `DirectedBattleCue[]` 和 `newEvents`；
- `BattleView` 现在只负责驱动 `BattleSim.tick()`、HUD/route lifecycle 和将 `presentation + cues` 交给 `BattleCanvas`；
- bridge 不导入 Vue、Canvas、Pixi、Pinia 或 engine 内部实现，且不改变规则时间线。

Smoke 新增 bridge 回归：验证 cue 只派发一次、能产生 action/VFX cue，且 hit-stop 仅冻结视觉游标。

## Canvas primitive split（2026-07-14）

`apps/web/src/battle/BattleEffects.ts` 现只保留 compatibility manager：接收 adapter 生成的 legacy DTO、维护 effect 生命周期、局部 impact / focal / impulse 信号。实际 Canvas 2D 图形和可选 VFX 资产加载已拆到：

- `apps/web/src/battle/canvas/types.ts`
- `apps/web/src/battle/canvas/assets.ts`
- `apps/web/src/battle/canvas/CanvasVfxPrimitives.ts`

这使后续 Pixi VFX primitive 可以复用 presentation cue，而不依赖或迁移 Canvas 绘制实现。


## 阶段 3 最小 BattleStage（2026-07-14）

已新增不替换主路径的 Pixi `BattleStage` 垂直切片：它消费 renderer-compatible snapshot/cue，使用程序化 projectile、impact、beam、burst、ring 与环境反应，不读取 engine 内部状态。`/battle-stage-sandbox` 为 3v1 grass biome 并行验证入口；正式 `BattleView + BattleCanvas` 保持 compatibility 基线。

## 阶段 3 受控正式接入（2026-07-14）

`apps/web/src/components/PixiBattleViewport.vue` 是 Vue ↔ `BattleStage` 的唯一 bridge：它只接收 `BattlePresentation`、`DirectedBattleCue[]`、biome 和 quality，挂载/销毁 Pixi 生命周期并暴露 `isPresentationSettled()`。正式 `BattleView` 默认仍为 Canvas compatibility；arena 控制区的 **Canvas/GPU** 按钮才会切入 Pixi。GPU 初始化失败会自动回退 Canvas。

两条 renderer 路径都消费同一 `presentation + cues`；结算等待当前 active renderer 的 settle 状态。Pixi hit-stop 会请求同一个 `BattlePresentationBridge` 暂停视觉游标，绝不影响 `BattleSim.tick()`。

## 阶段 4 雾湾镇 WorldStage（2026-07-14）

`WorldSceneSpec` 已扩展为可选 `landmarks`，雾湾镇配置描述码头、潮汐研究所、灯塔、市场屋檐和前景雾带；这不触碰 `MAPS.pallet` 的 tiles、warp、剧情或 encounter。`packages/renderer-pixi/src/WorldStage.ts` 消费 renderer DTO 和该静态 scene spec；`/world-stage-sandbox` 是并行验证入口，旧 `WorldCanvas` 尚未改写。


阶段 4 sandbox 首次人工验收发现 quality switch 与遮挡不可见：已修复为 `WorldStage.setQuality()` 立即重建静态/雾层，且雾粒子通过 Pixi ticker 漂移；市场屋檐配置移动至 sandbox 玩家必经路径，entities 层在 occlusion 层之后，因此能直接验证遮挡。


## 阶段 4 受控正式接入（2026-07-14）

`apps/web/src/components/PixiWorldViewport.vue` 是 Vue ↔ `WorldStage` bridge：只接收雾湾镇 `WorldSceneSpec`、`WorldEntityRenderSnapshot[]` 与 quality。正式 `WorldView` 默认仍使用 `WorldCanvas`；仅在 `pallet` 显示 **Canvas / GPU 雾湾** 控制，GPU 启动失败自动回退 Canvas。移动、碰撞、NPC/对象交互、剧情、warp、encounter 与存档仍由原 `WorldView` 逻辑负责。


## 阶段 4 CharacterView（2026-07-14）

`packages/renderer-pixi/src/CharacterView.ts` 以项目现有 Canvas fallback 的调色和像素人形语义为基准，提供 GPU 侧的 hero / researcher / villager / fisher 外观；不导入 app 层的 Canvas helper。雾湾镇 scene config 为玩家、澜博士、渔人阿澈与码头渔民定义外观/行为，`WorldStage` 将它们呈现为可识别角色：研究员观测潮汐、居民望海、渔民整理渔网。


CharacterView 首次人工验收中地点行为不够可读；已增强为高对比度的可辨认行为：澜博士有脉冲潮汐扫描环，阿澈有望远镜与横向扫视光束，码头渔民有大幅摆动渔网与水色波环；角色比例提升约 28%。


## 阶段 4 世界 ↔ 战斗视觉转场（2026-07-14）

`apps/web/src/game/SceneVisualTransition.ts` 在路由之间仅交接 `{ mapId, quality }` 视觉意图，不携带规则状态。雾湾镇 GPU WorldStage 进入 battle 前执行 biome crossfade；BattleView 以同一 quality 自动启动 GPU renderer 并执行 intro crossfade。结算返回时 BattleStage 先淡出，再交接雾湾镇 GPU 恢复意图，WorldStage 挂载后执行 reveal。Canvas 仍为默认和失败 fallback，battle/world 规则与存档流程未改变。


阶段 4 转场首次人工验收中淡入不明显：已将 WorldStage/BattleStage 从静态覆盖层改为 requestAnimationFrame 驱动的 alpha sine tween（完整渐暗再渐亮）。同时，为便于回归测试，白夜在主线首次击败后提供 `baiye-rematch`；该切磋不再发放 EXP、不写剧情 flag、不推进 quest。


## 阶段 4 最终验收记录（2026-07-14）

雾湾镇 GPU WorldStage 已完成正式受控接入并通过人工验收：质量档位雾层差异、屋檐遮挡、角色可辨性、三名代表 NPC 的地点行为、Canvas/GPU 切换、移动/交互/warp 与 GPU 世界 ↔ GPU 战斗渐暗/渐亮转场均正常。`pallet` 与 `route1` 是正式 GPU 世界地图，Canvas 是默认 compatibility 与失败 fallback。白夜的 `baiye-rematch` 可反复用于回归测试，且不会改变剧情或奖励。

阶段 5 已完成并人工验收：萤火林道的配置化 WorldSceneSpec、通用自然场景 WorldStage、独立 sandbox 与受控正式 GPU WorldView 接入均已完成。`GPU_WORLD_MAP_IDS` 明确仅批准 `pallet` / `route1`，Canvas 仍为默认 compatibility 与失败 fallback；碰撞、warp、NPC 坐标、遭遇和剧情未改。


## 阶段 6 实施记录（2026-07-14）

已建立配置优先的 battle visual pack：`skill-visuals.ts` 覆盖全部 141 个当前技能，并通过 delivery / impact / tier / variant / particleBudget 描述演出；`battle-environments.ts` 描述 grass、cave、water、dragon、arena 的地表、氛围、色板和环境反应。BattleStage 仅消费这些 renderer-ready DTO，所有质量档位对 burst 粒子都设置上限。`npm run visuals:report` 与 smoke 校验配方覆盖、重复、无效 signature 引用及预算约束。


## 阶段 7 星陨观测所 sandbox 与受控正式接入（2026-07-15）

`mt-moon`（星陨观测所）已完成 sandbox-first Scene Pack：观测穹顶、陨石尖塔、星图地台、晶簇、裂隙雾与 starlight ambience 全部由 `WorldSceneSpec` 描述；WorldStage 增加通用 observatory landmark grammar，CharacterView 增加星图师朔的 `trace-stars` 行为。人工验收后，该地图已加入 `GPU_WORLD_MAP_IDS = ['pallet', 'route1', 'mt-moon']`，正式 WorldView 可受控启用 GPU；现有 handoff 自动覆盖 GPU World → cave GPU Battle → GPU World。Canvas 仍是默认 compatibility 与失败 fallback，碰撞、自然 encounterFloor、warp、NPC、剧情或存档均未改变。

## 阶段 7 深空遗迹 sandbox-first 实施记录（2026-07-15）

`deep-space` 已新增配置化 `WorldSceneSpec`，以失重石台、裂隙拱门、悬浮碎片、前景石台、裂隙雾与 `rune` ambience 表达异常遗迹。`WorldStage` 仅扩展通用 `gravity-platform` / `rift-arch` / `void-debris` landmark grammar，并消费 scene config 的 `objectVisuals` 为传入 renderer DTO 的既有故事物件提供外观；不会读取 Pinia / engine 状态，也不会决定对象可见性或坐标。

`/world-stage-sandbox` 默认展示深空遗迹，并以原有故事配置的晶簇、终端、守卫核心与幻兽回响坐标做独立 DTO 样本。人工验收通过后，`deep-space` 已加入 `GPU_WORLD_MAP_IDS = ['pallet', 'route1', 'mt-moon', 'deep-space']`，由既有 `isGpuWorldMapId()` bridge 受控启用正式 GPU WorldView；Canvas 仍是默认 compatibility 与失败 fallback。`WorldView` / `WorldCanvas` 未新增地图专用分支，碰撞、warp、NPC 坐标、自然 encounterFloor、剧情与存档均未修改。

## 阶段 7 潮洞 sandbox-first 实施记录（2026-07-15）

`dragon-den`（潮洞）已新增配置化 `WorldSceneSpec`：潮蚀洞壁、盐晶潮池、深潮锚印地台、前景潮雾与 `rune` ambience 均由 scene config 描述。`WorldStage` 仅扩展通用 `tide-cavern-wall` / `crystal-tide-pool` / `anchor-dais` / `cave-veil` grammar，并消费 `objectVisuals` 为外部 DTO 的深潮锚印与深空裂隙提供外观；不会读取 Pinia / engine 状态，也不决定对象的可见性或位置。

`/world-stage-sandbox` 默认展示潮洞，并以既有故事配置中的守望者 `(10, 8)`、锚印 `(8, 5)`、裂隙 `(8, 2)` 作为独立 renderer DTO 样本。人工验收通过后，`dragon-den` 已加入 `GPU_WORLD_MAP_IDS = ['pallet', 'route1', 'mt-moon', 'deep-space', 'dragon-den']`，由既有 `isGpuWorldMapId()` bridge 受控启用正式 GPU WorldView；Canvas 仍是默认 compatibility 与失败 fallback。`WorldView` / `WorldCanvas` 未新增地图专用分支，碰撞、warp、NPC 坐标、自然 encounterFloor、剧情与存档均未修改。

## 阶段 8 前置：WorldScene 资源与配置级视觉基线（2026-07-15）

五张受控 GPU 地图的 `WorldSceneSpec` 均声明本地 `resources` 预算：landmark、静态 container、cinematic ambience particle、dynamic entity 和 preload key 的上限。目前所有 pack 的 `preloadKeys` 均为 `['procedural-primitives']`，因此明确不预加载全世界资产；后续引入纹理时必须先把 key 加入当前 Scene Pack，再由 `WorldStage.enterScene()` 以 scene-local 生命周期加载。场景切换和 unmount 会清理上一场景的预加载所有权，Pixi children / texture source 仍按既有销毁路径释放。

`npm run visuals:report` 与 smoke 校验预算、GPU gate 与 Scene Pack 的对应关系，并记录五张配置组成 hash 基线：雾湾 `18226d2f`、萤火林道 `d2919216`、星陨观测所 `05366b70`、潮洞 `fa843cf7`、深空遗迹 `9ebe7f67`。这些是 DOM/Pixi 无关的首轮视觉回归基线；修改 Scene Pack 的 landmark / character / object 组成后，必须经视觉评审再更新 hash。此工作包未增加 GPU 地图，未改世界规则、地图、故事或存档。

## 阶段 8：浏览器视觉基线与 WorldStage 生命周期回归（2026-07-15）

`npm run visuals:browser` 已固定使用本机 Chrome + SwiftShader、`1280×800` viewport，生成 / 比对五张 Scene Pack × `cinematic` / `standard` / `compatibility` 的 15 张 PNG。受审查基线及 manifest 位于 `doc/visual-baselines/`；常规执行只比对，只有带 `-- --update` 的显式命令才会覆盖基线。`?visual-regression=1` 仅允许独立 sandbox 路由，并关闭 WorldStage animation，从而使程序化图形、粒子和角色姿势可稳定截图，不影响正式可玩页面的认证边界。

浏览器 harness 同时读取 `WorldStage.getDiagnostics()` 并执行三轮 World → battle sandbox → World：共 15 次 scene switch，持续断言每个 viewport 只有一个 canvas、scene-local preload key 为一项且 visual motion 已关闭。通过 CDP 强制 GC 的首轮观测为 `heap delta = 0 bytes`；回归阈值保守设为小于 32 MiB，避免浏览器和 GPU 驱动差异导致脆弱测试。此工作包未增加 GPU gate、未改 engine、地图、故事、碰撞或存档。

## 阶段 8：可访问性视觉偏好回归（2026-07-15）

“减少闪烁”与“镜头强度”以 renderer-neutral `VisualRuntimeSettings` 进入 WorldStage / BattleStage。默认值为 `reduceFlicker: false`、`cameraIntensity: 'full'`，完全保留既有截图表现；浏览器视觉 harness 因而继续比对同一组五图 × 三质量档 PNG，不更新 manifest。偏好只保存在当前浏览器，不构成存档或规则数据。

## 阶段 8：质量自动选择与手动档位回归（2026-07-15）

自动质量由 Vue bridge 的浏览器能力探测解析，但 renderer 的选择策略仍是 DOM-free `selectQualityProfile()`。浏览器截图 harness 显式请求 `cinematic` / `standard` / `compatibility`，不受本机 `localStorage` 偏好影响；因此同一五图 × 三档 PNG manifest 继续作为稳定基线。

## 阶段 8：正式 renderer 观测基线边界（2026-07-15）

正式可玩页的观测使用显式 `?renderer-observation=1`，且仍要求真实认证和现有存档；它不属于截图 harness，也不会绕过 auth 或改变 PNG baseline。报告仅包含 renderer-local canvas / WebGL draw-call / container / effect 计数及浏览器端 heap 采样时间，供长时人工或认证 e2e 观察使用。

## 阶段 9.1-a：迷雾林境 sandbox-first 三质量基线（2026-07-15，已人工验收）

`viridian-forest` 现有 `mist-forest` `WorldSceneSpec`：迷雾森林 palette、树墙 / 树群 / 孢子林地 / 根环 / 苔石 / 孢子环、遮挡树冠、前景低雾和 `mist` ambience。`WorldStage` 只增加 renderer-generic 的 `spore-ring` landmark 与 `signal-spore` / `anomaly-core` object DTO 外观；它不读取 Pinia / engine，也不拥有对象的故事可见性或位置。sandbox 用既有 story 配置的织羽 `(10, 9)`、三枚孢子 `(3, 4)` / `(12, 7)` / `(4, 11)` 和异相核 `(8, 5)` 作为纯 renderer 输入。

`npm run visuals:report` 已记录 config fingerprint hash `796ba47b`。`npm run visuals:browser -- --update` 已把 sandbox 矩阵扩为六图 × `cinematic` / `standard` / `compatibility` 的 18 张候选 PNG；常规比对通过，三轮 World → battle sandbox → World 共 18 次 scene switch，强制 GC 后 heap delta 为 `0 bytes`。三质量人工验收已通过：迷雾层次、孢子 / 异相核可辨性与树冠遮挡均符合预期，随后进入正式 WorldView 行为回归。

`GPU_WORLD_MAP_IDS` 仍是 `['pallet', 'route1', 'mt-moon', 'deep-space', 'dragon-den']`；`viridian-forest` 未加入 gate，`WorldCanvas.vue` 未改，Canvas 未删除。碰撞、warp、NPC 坐标、遭遇、剧情和存档均未修改。

## 阶段 9.1-b：迷雾林境认证 WorldView 行为观测（2026-07-15，已人工验收）

人工通过 sandbox 三质量验收后，认证 `renderer-observation` 新增一个受记录的诊断参数：`world-gpu-diagnostic=viridian-forest`。它只在同一浏览器 observation 会话内由 Vue bridge 启用，允许 `WorldView` 将该图**已经由 WorldView / story 计算出的** player、NPC 与 object DTO 镜像到 `WorldStage`；`GPU_WORLD_MAP_IDS` 没有改变，普通用户开关与默认路径仍只承认五张既有地图。renderer-pixi 不读取 Pinia / engine，且该参数不写入存档、不会绕过认证或路由守卫。

`npm run visuals:playable` 已走真实注册 / 建档 / 初始剧情 / 白夜战 / 萤火林道巡查员 / north warp，验证迷雾林境 `mistwood-trial` GPU scene、孢子顺序对象 DTO、织羽 DTO、树格阻挡、草丛 encounter 资格与真实织羽试炼战的 GPU World → GPU Battle → GPU World 返回；最后经 south warp 回到萤火林道与雾湾镇的既有 GPU 路径。观测共 169 个 renderer-local samples，强制 GC heap delta 为 `0 bytes`。未伪造 battle 胜利或 story flag；完整异相核后续故事保持既有 smoke 回归覆盖。

人工确认真实认证页面的移动、孢子 / 织羽状态变化、树格阻挡、试炼战返回和 south warp 均正常。观察到路由切换后 URL 查询参数会消失、但同一浏览器标签页仍继续 GPU 渲染：这是 observation 会话将显式 `renderer-observation` / `world-gpu-diagnostic` 写入**该标签页的** `sessionStorage`，使 World → Battle → World 诊断不丢上下文；它不修改 `GPU_WORLD_MAP_IDS`，也不写入存档。新标签页 / 新浏览器会话或清除该标签页 sessionStorage 后，未带显式参数访问迷雾林境仍为 Canvas，且无迷雾林境 GPU 开关。

9.1-b 已获批准进入 9.1-c 的**显式 config gate**工作包；开始前，`viridian-forest` 仍不得被视为已加入 gate，Canvas 继续保留。

## 阶段 8：认证正式路径观测结果（2026-07-15）

`npm run visuals:playable` 在本机 Chrome + SwiftShader 下走真实认证 / 建档 / 剧情 / warp 后完成三轮 GPU World → GPU Battle → GPU World。CDP 强制 GC 的 heap delta 为 `0 bytes`；观测模块按秒采样得到 23 条样本，JS heap 采样增量 `6,336,016 bytes`，低于 `< 32 MiB` 阈值。每条样本均为单 canvas，最大 WorldStage / BattleStage child 计数为 `45 / 73`，最大累计 WebGL draw-call 为 `795`。该数值用于结构性回归观察，不作为跨 GPU 驱动的像素基线。

## 阶段 9.1-c：迷雾林境显式 GPU migration gate（2026-07-15）

`GPU_WORLD_MAP_IDS` 现为 `['pallet', 'route1', 'viridian-forest', 'mt-moon', 'deep-space', 'dragon-den']`。本工作包仅改变 config gate，并同步 smoke 的显式资格断言；`WorldCanvas.vue`、`packages/engine`、地图、碰撞、warp、NPC 坐标、遭遇、剧情和存档均未修改。

`npm run visuals:playable` 已移除登录和世界 URL 中的 `world-gpu-diagnostic=viridian-forest`，只保留 `renderer-observation=1` 的 renderer-local 观测。真实注册 / 建档 / 开局 / 白夜战 / 萤火林道巡查员 / north warp 后，迷雾林境通过正常 config gate 完成孢子状态、树格碰撞、试炼战 GPU World → GPU Battle → GPU World 与 south warp 回程验证。结果为 194 个 samples、强制 GC heap delta `0 bytes`、sampled heap delta `4,842,935 bytes`（低于 32 MiB）、最大 WorldStage / BattleStage child `49 / 90`、最大累计 draw-call `14,117`。

`npm run visuals:report`、`npm run visuals:browser`（18 张截图、18 次 scene switch、heap delta `0 bytes`）、`npm run smoke`、`npm run typecheck`、`npm run build:web` 和 Pixi bundle 均通过。Canvas 仍保留，下一张候选地图为 `route3`。

## 阶段 9.1-d：星陨高径 sandbox-first 三质量基线（2026-07-15，已人工验收）

`route3` 已新增 `starfall-ridge` `WorldSceneSpec`：`sunlit-route` 高径色板、断崖岩壁、石阶古道、风化台地、坠星刻痕、近景岩檐与高空薄霭。`WorldStage` 仅增加 renderer-generic 的 `ridge-wall` / `stone-terrace` / `starfall-scar` / `ridge-overhang` landmark 与 `star-scar` object DTO 外观；它不读取 Pinia / engine，也不决定洛岩或星痕的故事坐标、可见性、交互、碰撞、warp 或 encounter。

`/world-stage-sandbox` 默认使用既有 story 坐标：洛岩 `(6, 8)`、坠星刻痕 `(3, 4)` / `(12, 6)` / `(5, 11)`。`npm run visuals:report` 记录 config fingerprint `0711a01b`；`visuals:browser --update` 后的正式比对通过，矩阵为七图 × `cinematic` / `standard` / `compatibility` 共 21 张 PNG，三轮 World → battle sandbox → World 共 21 次 scene switch，强制 GC 后 heap delta `0 bytes`。

`GPU_WORLD_MAP_IDS` 仍是 `['pallet', 'route1', 'viridian-forest', 'mt-moon', 'deep-space', 'dragon-den']`，不含 `route3`；`WorldCanvas.vue`、Canvas、`packages/engine`、地图、故事与存档均未修改。cinematic / standard / compatibility 三档人工视觉验收已通过；正式 WorldView 自动行为观测已通过，等待人工确认，因此不得进入 migration gate。

迁移决策：`ILLUSION_TOWER_ENABLED=true` 时的五个训练塔 map ID 必须共用一个由 tower floor index / map ID 参数化生成的 Scene Pack；不得为任一层新增 renderer `mapId` 分支。

## 阶段 9.1-d-b：星陨高径认证 WorldView 行为观测（2026-07-15，已人工验收）

认证 `renderer-observation` 以显式 `world-gpu-diagnostic=route3` 建立仅该标签页有效的 pending-map 诊断，并由 Vue bridge 将已经由 WorldView / story 计算的 player、洛岩与星痕 DTO 传给 `WorldStage`。为使诊断会话可从已批准地图跨越至目标图，bridge 只保留该显式目标的 visual handoff capability；它不扩大 `GPU_WORLD_MAP_IDS`、不写入存档，也不让 renderer-pixi 读取 Pinia / engine。

`npm run visuals:playable` 已走真实注册 / 建档 / 白夜战 / 岚巡员 / 三枚孢子 / 织羽试炼 / 异相核 / 澜博士 chapter-one 完成，再经既有 warp 到达星陨高径。观测验证 `starfall-ridge` scene、洛岩与三枚坠星刻痕的有序 DTO 可见性、中央石阶岩壁碰撞、洛岩交互、真实草丛野外 GPU World → GPU Battle → GPU World 往返，以及满足既有 `star_3` 条件后的 north warp 至已批准的星陨观测所。未伪造 battle 胜利、story flag、坐标或存档。

结果为 336 个 renderer-local samples、强制 GC heap delta `0 bytes`、sampled heap delta `3,357,185 bytes`（低于 32 MiB）、最大 WorldStage / BattleStage child `49 / 87`、最大累计 draw-call `16,857`。人工确认正式页面行为正常，已获批准进入显式 config gate 工作包。

## 阶段 9.1-d-c：星陨高径显式 GPU migration gate（2026-07-15）

`GPU_WORLD_MAP_IDS` 现为 `['pallet', 'route1', 'viridian-forest', 'route3', 'mt-moon', 'deep-space', 'dragon-den']`。本工作包仅改变 config gate 并同步 smoke 资格断言；Canvas、`WorldCanvas.vue`、`packages/engine`、地图、碰撞、warp、NPC 坐标、遭遇、剧情和存档均未修改。

`npm run visuals:playable` 已从登录和世界 URL 移除 `world-gpu-diagnostic=route3`，仅保留 `renderer-observation=1` 的 renderer-local 指标采样。真实认证路径重走 chapter-one、星陨高径星痕、洛岩、野外 GPU World → GPU Battle → GPU World 与 north warp；`route3` 由正常 config gate 呈现。最终复测结果为 330 个 samples、强制 GC heap delta `0 bytes`、sampled heap delta `2,795,329 bytes`（低于 32 MiB）、最大 WorldStage / BattleStage child `49 / 103`、最大累计 draw-call `24,336`。

`npm run visuals:report`、`npm run visuals:browser`（七图 × 三质量档、21 次 scene switch、heap delta `0 bytes`）、`npm run smoke`、`npm run typecheck`、`npm run build:web` 与 Pixi bundle 均通过。Canvas 继续保留；下一张候选地图为 `rock-tunnel`，训练塔五层仍必须共用一个参数化 Scene Pack。

## 阶段 9.1-e：赤砾裂谷直接 GPU 实装（2026-07-15，正式页面人工验收通过）

按后续“单图直接实装、正式页面人工验证”的迁移节奏，`rock-tunnel` 已新增 `red-rift-canyon` Scene Pack 并直接加入 `GPU_WORLD_MAP_IDS`。它使用通用 `canyon-wall` / `mineral-vein` / `rock-shelf` / `cave-shadow` landmark grammar，描绘赤色岩壁、矿脉、落石台、低光岩檐和风沙；renderer-pixi 不读取 Pinia / engine，也不决定任何规则事实。

`encounterFloor`、碰撞、上下洞窟 warp、地图坐标、剧情门槛和存档均保持既有 map/story/runtime 权威。`npm run visuals:report` 的 config fingerprint 为 `90cfb219`；浏览器 baseline 已扩为八图 × 三档质量共 24 张 PNG，常规比对与 24 次 scene switch 通过、强制 GC heap delta `0 bytes`。

正式页面人工验收已通过：普通用户可见的 GPU 切换、低光遮挡、自然地面 encounter、岩壁阻挡以及与星陨观测所 / 静潮群岛之间的洞窟 warp 均正常。Canvas 继续保留；下一张直接实装候选为 `sea-route`。


## 阶段 9.1-f：静潮群岛 sandbox-first 单图实装（2026-07-15，待正式页面人工验证）

`sea-route` 新增 `stilltide-isles` Scene Pack，以通用 `reef-islet` / `tide-channel` / `shipwreck` / `tide-cave-mouth` landmark grammar 呈现低潮礁石、浅潮水道、沉船、潮洞入口和前景海雾；`tide-gauge` / `ship-log` 仅为既有故事对象 DTO 的外观映射。renderer-pixi 不读取 Pinia / engine，不决定潮位、对象可见性、坐标、碰撞、`encounterFloor`、船只 / 洞窟 warp、剧情或存档。

海路本轮**尚未加入** `GPU_WORLD_MAP_IDS`；这保持迁移 gate 不变。`npm run visuals:report` 的候选 config fingerprint 为 `15c1084d`；浏览器基线矩阵现为九图 × 三档质量共 27 张 PNG，常规比对与 27 次 scene switch 通过、强制 GC heap delta `0 bytes`。请在 sandbox 中完成三档视觉人工验收，并在正式页面验证后才可单独调整显式 config gate。Canvas 继续保留；幻境之塔五层仍必须使用一个参数化 Scene Pack。
