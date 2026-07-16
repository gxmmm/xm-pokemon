# 战斗美术 B-3 交接：真实代表资产导入待批准

> **更新时间：2026-07-16**
> 正式世界与战斗已使用 GPU/Pixi。上一轮运行时重构已结束；Canvas 源码必须保留但不参与正式路径。当前工作进度已完成战斗美术 **阶段 A、阶段 B-1、阶段 B-2，以及 B-3 的来源门禁/导入契约**；下一新上下文只能在确认视觉方向与授权来源后，继续 **B-3：真实代表模型资产的生产与接入**。

## 1. 当前已完成状态（不要回退）

### 配置与覆盖

- `packages/config/src/battle-art.ts` 已是战斗美术静态配置权威：
  - 151 个 `BattleArtProfile`；
  - 303 条资产 manifest（151 前视、151 后视、1 个程序 fallback）；
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

当前六只仍以现有 PokeAPI 静态 sprite 为底图，叠加通用 GPU 光环/姿态；**尚未生产新绘制的骨骼或序列帧模型资产。**

### 已完成的 B-3 非位图准备（2026-07-16）

- `BattleAssetManifestEntry` 通过 `sourceId` 引用 `BATTLE_ASSET_SOURCES`；该记录包含来源、许可证证据、署名与审计状态，并已覆盖 PokeAPI 和程序 fallback。
- `BATTLE_ART_IMPORT_CONTRACTS` 已为 #006 的 `showcase:flame-wing` 声明未来 `png-sequence-json` 前/后资源 ID、关键 `idle/attack/cast/charge/channel/hit/faint` 动作与 fallback。状态是 `awaiting-art-direction-and-source-approval`，因此对应新位图 manifest 项必须不存在。
- `doc/BATTLE_ASSET_SOURCES.md` 是人工审计记录；smoke 校验来源字段、未批准位图缺席、动作要求和 fallback。没有改变 renderer/Vue/cue adapter 的物种、技能或路径边界，Canvas 也未接回。

## 2. B-3 的唯一目标

在不改 BattleSim、AI、伤害、存档、玩法技能数据、Canvas 正式路径的前提下，完成一小批（建议先 1–2 只，最多 3 只）代表宝可梦的**新位图分层或骨骼/序列帧资产垂直切片**，并接入现有 manifest/profile/loader/CombatantView 契约。

优先候选：

1. 喷火龙 #006：覆盖空中、近战/远程、蓄力/光束、火焰 aura；
2. 耿鬼 #094：覆盖悬浮、施法、持续 channel、幽灵特效；
3. 皮卡丘 #025：覆盖小型敏捷、短前冲与电系蓄力。

**一次只选择一个可验证闭环。** 若没有明确确认的美术资源来源或风格，不要假称已生产真实新模型；可先完成资产格式导入/metadata 支持，但不要擅自下载或使用来源不明资产。

## 3. B-3 前唯一需要确认的产品决策

新上下文开始时应首先向开发者确认以下一点；确认前可以审计/搭建导入契约，但不能提交新的角色美术资源：

> 首期真实角色资产采用哪一种表现形式与来源？
>
> **推荐：** 保留像素风识别度的高质量 2D 分层 / 序列帧（PNG + JSON metadata），首个 vertical slice 先做喷火龙；资源必须有明确的原创、授权或可用许可证记录。
>
> 可选备选：Spine/骨骼、其他 2D 格式。无论选择哪种，asset manifest/profile 的接口不得按格式或物种散落到 renderer。

若开发者明确要求 AI 生成位图，先遵守 imagegen skill：生成文件必须放入项目工作区、记录来源/许可与版本；透明背景按 skill 的 chroma-key / 透明工作流处理，且不得覆盖现有原始 sprite。

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

```text
M  doc/BATTLE_ART_UPGRADE_PLAN.md
M  packages/config/src/index.ts
M  packages/renderer-pixi/src/BattleStage.ts
M  packages/renderer-pixi/src/index.ts
M  scripts/smoke.ts
?? packages/config/src/battle-art.ts
?? packages/renderer-pixi/src/BattleArtAssets.ts
?? packages/renderer-pixi/src/CombatantView.ts
```

上述变更已经通过：

```powershell
npm run smoke
npm run typecheck
npm run build:web
git diff --check
```

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
继续 Pokemon Online 战斗美术阶段 B-3。先阅读 README.md、PROJECT_RULES.md、doc/VISUAL_RUNTIME_HANDOFF.md、doc/BATTLE_ART_UPGRADE_PLAN.md，并检查 git status；保留全部未提交改动，禁止 reset/checkout/覆盖/删除现有改动。

当前已完成：151 个配置化 BattleArtProfile、manifest-only Pixi loader、CombatantView、正式 GPU sprite 接入，以及喷火龙#006/皮卡丘#025/耿鬼#094/拉普拉斯#131/卡比兽#143/快龙#149 的 2.5D aura/halo/motion pose 配置切片。它们仍使用已有 PokeAPI 静态 sprite，尚未生产新的骨骼或序列帧角色资产。

本次只处理 B-3：先确认首期真实角色资产的视觉形式与授权来源；推荐以喷火龙 #006 为首个高质量 2D 分层/序列帧 vertical slice。新资产必须通过 BattleAssetManifestEntry + BattleArtProfile 引用；禁止在 renderer/Vue/cue adapter 按 speciesId/skillId/文件路径硬编码，禁止改 BattleSim/AI/伤害/存档，Canvas 源码必须保留但不得接回正式路径。

完成一个可验证闭环：asset 来源和许可证记录、manifest/profile 接入、关键动作与 fallback、smoke/typecheck/build/diff-check、计划文档实施记录。若风格/授权来源尚未获确认，不要生产或引入新的角色位图，只完成不依赖该决定的导入契约工作。
```
