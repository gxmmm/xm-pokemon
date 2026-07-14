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

雾湾镇 GPU WorldStage 已完成正式受控接入并通过人工验收：质量档位雾层差异、屋檐遮挡、角色可辨性、三名代表 NPC 的地点行为、Canvas/GPU 切换、移动/交互/warp 与 GPU 世界 ↔ GPU 战斗渐暗/渐亮转场均正常。`pallet` 仍是唯一正式 GPU 世界地图，Canvas 是默认 compatibility 与失败 fallback。白夜的 `baiye-rematch` 可反复用于回归测试，且不会改变剧情或奖励。

下一工作包转入阶段 5：萤火林道仅做配置化 WorldSceneSpec + 通用 WorldStage sandbox，不接入正式 WorldView。
