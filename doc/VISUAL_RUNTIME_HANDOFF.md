# 战斗美术 B-3 交接：#006 基线验收通过，准备扩展下一代表模型

> **更新时间：2026-07-16**
> 正式世界与战斗已使用 GPU/Pixi。Canvas 源码必须保留但不参与正式路径。当前已完成战斗美术 **阶段 A、B-1、B-2，以及 B-3 的 #006 静态基底 vertical slice**：开发者已验收 #006 的基础模型和通用朝向反转。下一新上下文应继续 **B-3：以同一静态基底 + 通用 GPU 动态契约接入下一只代表模型，并完成资源/生命周期人工验收**。

## 1. 当前已完成状态（不要回退）

### 配置与覆盖

- `packages/config/src/battle-art.ts` 已是战斗美术静态配置权威：
  - 151 个 `BattleArtProfile`；
  - 311 条资产 manifest（151 前视、151 后视、1 个程序 fallback、#006 的 v1～v4 前/后视序列帧候选）；
  - 全部 141 个主动技能的 `SkillCastPresentationSpec`；
  - Ability、Passive、6 种 Status 的 reactive visual recipe；
  - `resolveBattleArtPresentation()` 与 `validateBattleArtConfiguration()`。
- 同一技能只保留一份玩法与通用 visual recipe；模型颜色、资源、挂点、动作与变体必须通过 profile/theme/override resolver 产生。
- `castTime` 只映射为 presentation 的 `windupMs`，没有改变 engine 结算时机。

### 正式 GPU 运行时

- `packages/renderer-pixi/src/BattleArtAssets.ts`：manifest-only Pixi loader；只接受 `BattleAssetManifestEntry`，资源失败返回 `null`。
- `packages/renderer-pixi/src/CombatantView.ts`：从 profile/resolver 显示 Sprite 或程序 fallback；已支持统一 motion 与前/后 aura/halo 层。
- `packages/renderer-pixi/src/BattleStage.ts`：进入战斗时只预加载当前 3vN 队伍所需 manifest 资产；snapshot 创建/刷新 `CombatantView`；animation cue 驱动通用动作。
- 正式 GPU renderer 中没有 `/sprites/...` 路径、`speciesId === ...`、`skillId === ...` 或 `showcase:*` 分支。

### 已完成的 2.5D 代表切片

以下六个 profile 已有独立 modelId、体型、阴影、aura/halo 与动作 pose；其差异只在 `battle-art.ts`：

| Species | modelId | 身份 |
|---|---|---|
| #006 喷火龙 | `showcase:flame-wing` | 空中爆发 |
| #025 皮卡丘 | `showcase:volt-scout` | 小型敏捷 |
| #094 耿鬼 | `showcase:spectral-caster` | 幽灵施法 |
| #131 拉普拉斯 | `showcase:tide-guardian` | 水系支援 |
| #143 卡比兽 | `showcase:fortress-tank` | 重装坦克 |
| #149 快龙 | `showcase:sky-dragon` | 空中龙系 |

#025/#094/#131/#143/#149 仍以现有 PokeAPI 静态 sprite 为底图，叠加通用 GPU 光环/姿态。#006 当前使用以项目已下载 PokeAPI 静态 sprite 无损封装的 v4 前/后视 PNG 序列帧与 JSON 元数据，已通过开发者基础模型验收；v1、v2、v3 保留为未验收历史候选，尚未使用骨骼资产。后续代表模型优先采用同一静态基底 + 通用 GPU 动态表现方向。

### 已完成的 B-3 资产接入与运行时准备（2026-07-16）

- `BattleAssetManifestEntry` 通过 `sourceId` 引用 `BATTLE_ASSET_SOURCES`；该记录包含来源、许可证证据、署名与审计状态，并已覆盖 PokeAPI 和程序 fallback。
- #006 的 `BATTLE_ART_IMPORT_CONTRACTS` 已采用 `pokemon-online-pokeapi-derived-flame-wing-v4`：从项目已下载、已记录来源的 PokeAPI 96×96 前/后视静态 sprite 逐像素复制为 29 帧 `png-sequence-json` 封装。它声明 `idle/attack/cast/charge/channel/hit/faint`、待机到攻击等通用补间和 fallback；状态为 `integrated`。v4 已通过开发者基础模型验收；v1～v3 仅作未验收历史候选。
- `CombatantView` 从 `BattleRenderSnapshot.combatants[].facing` 通用镜像模型层级：静态贴图、裁剪序列帧、aura/halo、程序 fallback、动作水平位移和倾角都会随目标方向改变；不按物种分支，也不改引擎的 facing 权威。
- `doc/BATTLE_ASSET_SOURCES.md` 是简体中文人工审计记录；smoke 校验来源字段、已生成位图/元数据存在、动作与补间要求、方向镜像和 fallback。Canvas 源码均有 `@canvas-archive-only` 标记，`npm run canvas:archive-check` 阻止正式 world/battle Vue 入口、Pixi viewport 和 `renderer-pixi` 重新引用它；没有改变 renderer/Vue/cue adapter 的物种、技能或路径边界。


### 独立战斗验收沙盒（2026-07-16）

- 新增无需登录的 `/battle-sandbox`：不读取 Pinia、认证、存档、图鉴、队伍或战斗记录；它是前端内存中的验收入口，不能用于正常游戏流程。
- 双方各可勾选 1～3 只，支持 1v1、1v2、2v3、3v3 等任意 N vs N 组合。每次开始都会对所选物种执行 `createWildInstance(speciesId, 100)`，因此 IV、成长、性格和可选被动按野生规则重新随机，不进入玩家数据。
- 沙盒复用正式 `BattleSim`、`BattlePresentationBridge`、`PixiBattleViewport` 与 `BattleStage`；不改变 AI、伤害或存档权威。GPU 不可用时只显示状态，不使用 Canvas fallback。

## 2. 已验收结论与下一工作包

### 已验收（冻结为后续模型生产基线）

1. **#006 基础模型：** v4 的前/后视基础轮廓合格。它必须保持“已记录来源的 PokeAPI 静态 sprite 无损序列帧封装”，不得用 v1～v3 的纯代码重绘替换。
2. **朝向：** `CombatantView` 已从 snapshot 的 `combatant.facing` 通用镜像完整模型层级；开发者确认反转正确。后续模型、贴图、序列帧、aura/halo、fallback、动作水平偏移和倾角必须继续服从这一通用规则。
3. **验收入口：** `/battle-sandbox` 无需登录，双方各选 1～3 只（最小 1v1、最大 3v3），每次以 `createWildInstance(speciesId, 100)` 创建仅存于内存的满级随机野生式个体；不会改图鉴、队伍、战斗记录或存档。
4. **Canvas：** 13 个 Canvas 历史源以 `@canvas-archive-only` 保留；`npm run canvas:archive-check` 已阻止正式 world/battle Vue 入口、Pixi viewport 和 `renderer-pixi` 回接 Canvas。

### 下一工作包：B-3 下一代表模型（建议 #094 耿鬼）

**目标：** 以 #006 已验收的相同路径，接入耿鬼 #094：继续使用已下载、已记录来源的 PokeAPI 静态 sprite 作为前/后视基底；用 manifest + JSON sequence metadata + `BattleArtProfile` 引用实现通用动作、补间、facing 镜像和 fallback。优先验证悬浮、施法、`channel`、受击和倒下可读性。

**不要做：** 不要再尝试用抽象多边形重绘角色本体；不要删除 v1～v3 候选；不要修改 BattleSim、AI、伤害、存档、正式 Canvas 边界；不要在 renderer/Vue/cue adapter 按物种、技能或路径硬编码。

## 3. B-3 下一模型的固定生产策略

在不改 BattleSim、AI、伤害、存档、玩法技能数据或 Canvas 正式路径的前提下，每次只完成一个可验证的代表模型 vertical slice。

1. 先从项目已经下载、已有来源/许可证记录的 PokeAPI 静态前/后视 sprite 取得基底；不能拿来源不明图片，也不覆盖原始 sprite。
2. 用离线脚本逐像素封装为 PNG sequence + JSON metadata；如果尚没有真正逐帧角色动画，就让通用 `BattleArtProfile.motionPoses`、Pixi 补间、aura/halo 与 `combatant.facing` 提供动态，而非抽象重绘角色轮廓。
3. 新资源只能通过 `BattleAssetManifestEntry` 注册，profile 只引用 asset ID；记录 `sourceId`、许可证证据、署名、脚本版本、校验和、验收结论。
4. 对当前模型完成 `/battle-sandbox` 的最小 1v1 和代表性 3v3 人工检查，再开始下一只。

**下一候选：** 建议 #094 耿鬼（`showcase:spectral-caster`），重点验证悬浮、`cast/channel`、受击、倒下、方向镜像与加载 fallback。#025 皮卡丘可作为后续小型敏捷基线。

## 4. 不可突破的边界

- `packages/engine` 决定事实；presentation/bridge 产出 cue；renderer 只消费 DTO，不读 Pinia/BattleSim 内部状态、不重算结果。
- `WorldCanvas.vue`、`BattleCanvas.vue`、Canvas cue adapter 与 Canvas primitives 必须保留；不挂载、不提供切换、不是 GPU fallback。
- 禁止在 renderer/Vue/cue adapter/时间轴中：
  - 按 `speciesId` 或 `skillId` 分支；
  - 拼接具体资源路径；
  - 将模型资产反向绑定玩法技能；
  - 依据日志文本决定特效或动作。
- 新资源只能通过 `BattleAssetManifestEntry` 声明，profile 只引用 asset ID；同技能的模型差异只能走 theme/anchor/variant/profile。
- 新动作必须有配置动作集、marker、fallback 与 quality 策略；动作效果不得修改真实伤害、命中、死亡、施法结算或存档。
- 旧有未提交变更必须完整保留。不得 `reset`、`checkout`、删除或覆盖其他工作区文件。

## 5. 首先阅读与关键文件

1. `README.md`
2. `PROJECT_RULES.md`
3. 本文件
4. `doc/BATTLE_ART_UPGRADE_PLAN.md`（重点阶段 A、B-1、B-2、阶段 C）
5. `packages/config/src/battle-art.ts`
6. `packages/renderer-pixi/src/BattleArtAssets.ts`
7. `packages/renderer-pixi/src/CombatantView.ts`
8. `packages/renderer-pixi/src/BattleStage.ts`
9. `scripts/smoke.ts`

## 6. 当前未提交工作区（必须保留）

工作区包含本轮 B-3、Canvas 归档隔离、免登录战斗验收沙盒以及 #006 v1～v4 资产候选的未提交改动。新上下文开始时必须先运行 `git status --short` 获取准确清单；不得使用本文件中的旧快照代替真实状态。

已在本轮通过：

```powershell
npm run canvas:archive-check
npm run typecheck
npm run smoke
npm run build:web
git diff --check
```

并已完成浏览器回归：未登录 `/battle-sandbox` 中 #006 vs #025 的 1v1 能挂载 Pixi；#006 v4 的 PNG/JSON 可加载；未出现 GPU 或控制台错误。

## 7. B-3 最低验收清单

- 至少一个选定模型的真实新资产以 manifest 注册，且资源来源/许可证/版本可追溯；
- profile 通过 asset ID 引用新资源；renderer 不因该物种增加分支；
- idle、attack/cast、charge 或 channel、hit、faint 至少覆盖关键一组动作，并有静态/程序 fallback；
- 共享技能更改仍全局生效；模型差异只能改变美术表现；
- 1v1、3v3、资源加载失败、战斗退出重进均可观察；
- 更新 smoke/配置校验，至少执行 `npm run smoke`、`npm run typecheck`、`npm run build:web`、`git diff --check`；
- 在 `doc/BATTLE_ART_UPGRADE_PLAN.md` 写明已完成范围、资产来源、未完成项和下一步。

## 8. 可直接复制到新上下文的提示

```text
继续 Pokemon Online 战斗美术升级计划，处理阶段 B-3 的下一只代表模型。

先阅读：
- README.md
- PROJECT_RULES.md
- doc/VISUAL_RUNTIME_HANDOFF.md
- doc/BATTLE_ART_UPGRADE_PLAN.md
- doc/BATTLE_ASSET_SOURCES.md
- packages/config/src/battle-art.ts
- packages/renderer-pixi/src/BattleArtAssets.ts
- packages/renderer-pixi/src/CombatantView.ts
- packages/renderer-pixi/src/BattleStage.ts
- apps/web/src/views/BattleSandboxView.vue

先检查 git status；保留所有未提交改动。禁止 reset、checkout、覆盖或删除现有改动。

已冻结：正式世界/战斗为 GPU-only Pixi；Canvas 源码必须保留为 @canvas-archive-only，但不得重新挂入正式路径、提供切换或作为 GPU fallback。BattleSim/engine 决定事实，presentation 产出 cue，renderer 只消费 DTO。

#006 喷火龙的 v4 基础模型和通用 facing 镜像已经验收通过：以项目已下载、已记录来源的 PokeAPI 静态前/后视 sprite 无损封装为 PNG sequence + JSON metadata；通用 BattleArtProfile motion pose、Pixi cubic-in-out 补间、aura/halo 和 combatant.facing 提供动态。v1/v2/v3 纯代码重绘是未验收历史候选，必须保留但不得重新接为 #006 当前资源。

本次建议只做 #094 耿鬼的同类 vertical slice：使用已下载且已记录来源的 PokeAPI 静态前/后视 sprite 作为基底，经 BattleAssetManifestEntry + BattleArtProfile 接入 JSON sequence metadata；验证悬浮、cast/channel、hit、faint、facing 和 fallback。禁止在 renderer/Vue/cue adapter 按 speciesId、skillId 或资源路径硬编码；禁止修改 BattleSim、AI、伤害、存档。

可用验收入口：/battle-sandbox，无需登录，支持双方 1～3 只的 N vs N（最小 1v1），每次用 createWildInstance(speciesId, 100) 产生仅内存中的满级随机野生式个体，不写玩家数据。

完成后更新简体中文来源记录、交接和计划文档，并执行 npm run canvas:archive-check、npm run typecheck、npm run smoke、npm run build:web、git diff --check，外加浏览器沙盒人工回归。
```
