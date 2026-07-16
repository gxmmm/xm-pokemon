# 当前运行时边界与战斗美术入口

> GPU/Pixi 是正式世界与战斗运行时。上一轮运行时重构已经结束；后续人工测试发现的问题按独立 bug 修复。当前唯一计划：`doc/BATTLE_ART_UPGRADE_PLAN.md`。

## 必须遵守

- `packages/engine` 决定世界和战斗事实；presentation/bridge 产出结构化 DTO 与有序 cue；renderer 只消费 DTO，不读取 Pinia 或 BattleSim 内部状态，不重算或修改规则。
- `WorldCanvas.vue`、`BattleCanvas.vue`、Canvas cue adapter 与 Canvas primitives 必须保留在仓库；它们不挂入正式路径、不提供玩家切换、也不是 GPU fallback。
- GPU 初始化失败时显示明确状态，不隐式切回 Canvas。
- 模型、皮肤、动作、挂点、调色主题、技能/被动/特性/状态特效、环境反应、资源映射和质量预算全部走静态配置、asset manifest 与通用 resolver。
- 一个技能只保留一份玩法数据与通用视觉 recipe。不同模型的颜色、发射点、动作或特效变体由 art profile/theme/override 配置表达；禁止在 renderer、Vue、cue adapter 或时间轴按 `speciesId`、`skillId` 或文件路径硬编码。
- `castTime` 是玩法权威的前摇。准备、施放、吟唱、蓄力、持续施法、命中、后摇只扩展 presentation，不得改变 engine 结算时机。

## 开始下一工作包前

阅读：

1. `README.md`
2. `PROJECT_RULES.md`
3. 本文件
4. `doc/BATTLE_ART_UPGRADE_PLAN.md`

并先检查 `git status`，保留已有改动；不得 reset、checkout、覆盖或删除他人改动。每个工作包只完成一个可验证闭环，说明配置契约、资产/动作 fallback、质量档、测试方式，以及 Canvas 保留情况。

## 关键位置

| 责任 | 位置 |
|---|---|
| 冻结规则与开发约束 | `PROJECT_RULES.md` |
| 战斗美术计划 | `doc/BATTLE_ART_UPGRADE_PLAN.md` |
| 共享类型 | `packages/shared/src/types.ts` |
| 静态玩法与视觉配置 | `packages/config/src/` |
| 规则事实 | `packages/engine/src/` |
| 演出 bridge / cue | `packages/presentation/`、`apps/web/src/game/BattlePresentationBridge.ts` |
| renderer DTO | `packages/renderer/src/contracts.ts` |
| 正式 GPU 战斗绘制 | `packages/renderer-pixi/src/BattleStage.ts` |
| 必须保留的 Canvas 实现 | `apps/web/src/components/BattleCanvas.vue`、`WorldCanvas.vue`、`apps/web/src/battle/canvas/` |

## 可复制接力提示

```text
先阅读 README.md、PROJECT_RULES.md、doc/VISUAL_RUNTIME_HANDOFF.md、doc/BATTLE_ART_UPGRADE_PLAN.md，并检查 git status。

GPU/Pixi 是正式世界与战斗运行时；Canvas 源码必须保留但不得重新接入正式路径。当前只执行配置优先的战斗美术升级：模型、动作、技能/被动/状态特效、资源映射、主题和预算均由静态配置、asset manifest 与通用 resolver 驱动；禁止 renderer/Vue 按 speciesId、skillId 或文件路径硬编码。只完成一个可验证工作包，不顺带重构 BattleSim、玩法规则或存档。
```
