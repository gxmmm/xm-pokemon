# Visual Runtime 重构交接清单

> **交接日期：2026-07-14**  
> **当前状态：阶段 0 / 1 / 2 已完成；阶段 3（GPU BattleStage）与阶段 4（雾湾镇 GPU WorldStage、角色行为、世界↔战斗转场）均已人工验收。下一阶段：阶段 5 萤火林道。**  
> **唯一导航文档：** `doc/VISUAL_RUNTIME_REFACTOR_PLAN.md`。本文件记录当前工作区、架构边界、验收基线和下一单次工作包。

---

## 1. 新上下文启动步骤（必须执行）

1. 阅读：
   - `PROJECT_RULES.md`
   - `README.md`
   - `doc/VISUAL_RUNTIME_REFACTOR_PLAN.md`
   - 本文件 `doc/VISUAL_RUNTIME_HANDOFF.md`
   - `doc/VISUAL_RUNTIME_BASELINE.md`
2. 运行 `git status --short`。**本重构所有改动尚未提交；禁止 reset、checkout 或覆盖现有改动。**
3. 先阅读下一工作包涉及的配置与 renderer 文件，再修改。
4. 保持依赖方向：

```text
engine ─X→ Vue / DOM / Pixi / renderer
presentation ─X→ renderer-pixi / Vue / Canvas / Pinia
renderer-pixi ─X→ engine 内部状态 / Pinia
Vue bridge → presentation / renderer
```

5. 每批次最低验证：

```powershell
npm run typecheck
npm run smoke
npm run build:web
npx esbuild packages/renderer-pixi/src/index.ts --bundle --platform=browser --format=esm --outfile=.pixi-spike-check.mjs --log-level=warning
Remove-Item -LiteralPath .pixi-spike-check.mjs -Force -ErrorAction SilentlyContinue
git diff --check
```

全局 git ignore 权限警告是环境噪声，不视为失败。

---

## 2. 已完成并人工验收的垂直切片

### 阶段 0 / 1：契约、配置与 Pixi spike

- `packages/presentation`：renderer-neutral battle presentation / cue、timeline、director。
- `packages/renderer`：renderer lifecycle contracts、quality policy。
- `packages/renderer-pixi`：Pixi v8 生命周期、固定设计空间、分层、resize、销毁与 isolated spike。
- `/renderer-spike`：独立 GPU spike 页面。
- `packages/config/src/visuals.ts`：8 个 biome、所有技能 visual recipe fallback、雾湾镇/萤火林道 scene config 原型。

### 阶段 2：演出语义与 Canvas compatibility

当前稳定链路：

```text
engine BattleEvent
  → toBattlePresentationEvent()
  → BattleDirector.direct()
  → DirectedBattleCue[]
  → CanvasCueAdapter / Canvas compatibility renderer
```

- `BattlePresentationBridge` 已从 `BattleView` 抽出：管理延迟 snapshot、presentation cursor、hit-stop、director dispatch。
- `BattleCanvas` 只消费 `presentation + DirectedBattleCue[]`，不再直接从 engine event 解释 VFX。
- Canvas 图形 primitive 位于 `apps/web/src/battle/canvas/*`；`BattleEffects.ts` 仅保留 compatibility lifecycle manager。

### 阶段 3：GPU BattleStage（受控正式接入）

- `packages/renderer-pixi/src/BattleStage.ts`：草地样板、CombatantView、镜头目标/轻摇、presentation-only hit-stop、transition overlay。
- 程序化 primitive：projectile/trail、impact、beam、burst、ring、环境 scorch/spark。
- `apps/web/src/components/PixiBattleViewport.vue`：唯一 Vue bridge，只接收 `BattlePresentation`、`DirectedBattleCue[]`、biome、quality。
- 正式 `BattleView` 默认仍为 Canvas；arena 中 **Canvas / GPU** 按钮才启用 Pixi；GPU 初始化失败自动回退 Canvas。
- HUD 仍为 Vue DOM；GPU renderer 不读取 engine/Pinia 内部状态。
- `/battle-stage-sandbox` 保留为独立 3v1 诊断入口。

### 阶段 4：雾湾镇 GPU WorldStage（受控正式接入）

- `WorldSceneSpec` 已扩展：`landmarks` 与 `characters`。
- `pallet`（雾湾镇）已配置码头、潮汐研究所、灯塔、市场屋檐、前景雾带，以及玩家/澜博士/渔人阿澈/码头渔民。
- `packages/renderer-pixi/src/WorldStage.ts`：terrain / scenery / entities / occlusion / foreground 分层、雾层质量降级和 ticker 漂移。
- `packages/renderer-pixi/src/CharacterView.ts`：hero / researcher / villager / fisher 的 GPU 像素人形；行为已人工验收可辨：
  - 澜博士：潮汐观测板 + 脉冲扫描环；
  - 渔人阿澈：望远镜 + 扫视光束；
  - 码头渔民：摆动渔网 + 水色波环。
- `apps/web/src/components/PixiWorldViewport.vue`：唯一 Vue bridge，只接收 scene、world entity snapshot、quality。
- 正式 `WorldView` **只在 `pallet`** 显示 **Canvas / GPU 雾湾**；默认 Canvas，GPU 初始化失败自动回退。
- 所有移动、碰撞、NPC/对象交互、warp、剧情、encounter、存档继续由原 `WorldView` / game store 权威逻辑负责；`WorldCanvas.vue` 未新增雾湾镇分支。
- `/world-stage-sandbox` 保留为独立场景诊断入口。

### 世界 ↔ 战斗视觉转场

- `apps/web/src/game/SceneVisualTransition.ts` 仅在路由间传递 `{ mapId, quality }` 视觉意图；**禁止传递 BattleSim、存档或地图规则状态。**
- 雾湾镇 GPU → battle：WorldStage biome crossfade → BattleView 自动以同 quality 启动 GPU BattleStage → intro crossfade。
- battle 返回雾湾镇：BattleStage fade → WorldStage GPU 自动恢复 → reveal。
- transition 已改为 requestAnimationFrame alpha sine tween（渐暗再渐亮），人工验收通过。
- Canvas 或非 `pallet` 路径不会错误启用 GPU handoff。

### 测试便利：白夜重复切磋

- 首次击败白夜后，`rival-baiye` 对话提供 **“再次切磋（不推进剧情）”**。
- `baiye-rematch`：不发 EXP、不写剧情 flag、不推进 quest；用于安全反复测试世界↔战斗路径。

---

## 3. 当前关键文件与职责

| 文件 | 职责 | 重要边界 |
|---|---|---|
| `packages/presentation/src/*` | presentation DTO、timeline、director | 不导入 Vue / Canvas / Pixi / Pinia。 |
| `packages/renderer/src/contracts.ts` | implementation-neutral renderer contract | 不导入 presentation director。 |
| `packages/config/src/visuals.ts` | biome / scene / landmark / character / skill visual config | 新场景优先加配置，禁止 renderer mapId 大分支。 |
| `apps/web/src/game/BattlePresentationBridge.ts` | delayed battle presentation runtime | 不调用 renderer。 |
| `apps/web/src/game/SceneVisualTransition.ts` | 路由 renderer handoff | 只传 `{ mapId, quality }`。 |
| `packages/renderer-pixi/src/BattleStage.ts` | GPU battle implementation | 不读 engine/Pinia；消费 snapshot/cue。 |
| `packages/renderer-pixi/src/WorldStage.ts` | GPU world implementation | 不读 WorldView/store；消费 scene/entity DTO。 |
| `packages/renderer-pixi/src/CharacterView.ts` | GPU 角色与行为 primitive | 只包含 renderer-local 视觉。 |
| `apps/web/src/components/PixiBattleViewport.vue` | Vue ↔ BattleStage bridge | 仅 presentation/cues/biome/quality。 |
| `apps/web/src/components/PixiWorldViewport.vue` | Vue ↔ WorldStage bridge | 仅 scene/entities/quality。 |
| `apps/web/src/views/BattleView.vue` | 规则 tick、HUD、Canvas/GPU 控制 | 默认 Canvas；GPU 可回退。 |
| `apps/web/src/views/WorldView.vue` | 世界规则、移动、交互、Canvas/GPU 控制 | 只有 `pallet` 可受控启用 GPU。 |
| `apps/web/src/components/WorldCanvas.vue` | 旧 Canvas compatibility world renderer | 不向其新增雾湾镇/萤火林道特例。 |
| `scripts/smoke.ts` | Node smoke | 已含 fixtures、director、bridge、stage primitive、Mist Bay、handoff、白夜 rematch 检查。 |

---

## 4. 已知限制（正常，不要误当回归）

- GPU BattleStage 的宝可梦仍是程序化 CombatantView，尚未接入正式宝可梦 sprite；这是后续战斗质量工作，不应回退当前 cue/runtime 架构。
- GPU WorldStage 的角色是程序化像素 `CharacterView`，不是最终 sprite asset pipeline。
- `pallet` 是目前唯一正式 GPU 世界地图；其他地图继续 Canvas compatibility。
- `route1` 已有 scene config 原型，但**尚未受控接入正式 WorldView**。
- 阶段 3 的完整镜头语言、所有状态残留/element grammar、distortion 后效仍可继续增强；已验收的是最小可回退垂直切片。

---

## 5. 下一工作包（推荐，单次闭环）

### 阶段 5：萤火林道 WorldSceneSpec + WorldStage sandbox

**本轮目标：** 只实现 `route1` 的森林 scene pack 与独立 GPU sandbox；**不要**接入正式 `WorldView`，不要修改 `WorldCanvas.vue`，不要改 encounter/碰撞/剧情。

建议范围：

1. 扩展 `WORLD_SCENE_BY_MAP_ID.route1` 的 config：树冠遮挡、树干/根须、林间路径、草地、岩石、远景树墙、萤火/孢子/雾。
2. 让 `WorldStage` 从配置通用渲染这些森林 landmark/ambience，禁止写 `if (mapId === 'route1')` 大分支。
3. 让 `/world-stage-sandbox` 可明确切换或进入 `route1` 预览；使用配置化玩家、岚巡员与至少一个自然互动/环境样本。
4. 保持 route1 的自然 grass encounter 规则、NPC 坐标、warp、地图碰撞不变。
5. 扩展 smoke：route1 scene config、前景遮挡、森林 ambience 以及不改变 GPU 正式 eligibility（正式 WorldView 仍仅 `pallet`）。

**验收：**

- 树木不主要依赖单格 tile 的重复；
- 前景树冠/雾/萤火不遮挡移动和交互可读性；
- 萤火林道色调与 grass battle 的环境语义一致；
- `WorldCanvas.vue` 没有新增 route1 专用逻辑；
- `typecheck` / `smoke` / `build:web` / Pixi bundle / `diff --check` 通过。

---

## 6. 新上下文可直接复制提示

```text
请继续执行 `doc/VISUAL_RUNTIME_REFACTOR_PLAN.md`。
当前阶段：阶段 5（萤火林道与自然场景模块）。
当前工作包：只实现 route1 的配置化森林 WorldSceneSpec + 通用 WorldStage 渲染能力 + 独立 sandbox 预览；不要接入正式 WorldView。

请先阅读：
- PROJECT_RULES.md
- README.md
- doc/VISUAL_RUNTIME_REFACTOR_PLAN.md
- doc/VISUAL_RUNTIME_HANDOFF.md
- doc/VISUAL_RUNTIME_BASELINE.md

必须：
- 先检查 git status，保留全部未提交改动；
- 不改 packages/engine，不让 renderer-pixi 读取 Pinia / engine 内部状态；
- 不在 WorldCanvas.vue 新增 route1 / 森林硬编码分支；
- route1 的碰撞、warp、NPC 坐标、遭遇规则和剧情保持不变；
- 完成后运行 npm run typecheck、npm run smoke、npm run build:web、Pixi esbuild bundle、git diff --check；
- 报告修改文件、配置/renderer 边界、验证结果与下一步。
```

---

## 7. 最近通过的验证

最近一轮已通过：

```text
npm run typecheck
npm run smoke
npm run build:web
git diff --check
```

Smoke 中新增/仍覆盖：

```text
✓ visual runtime deterministic fixtures
✓ BattlePresentationBridge delayed cue contract
✓ BattleDirector deterministic cue contract
✓ BattleStage primitive cue policy
✓ controlled GPU world eligibility
✓ Mist Bay WorldSceneSpec landmark contract
✓ GPU world-battle visual handoff contract
✓ White Night repeatable sparring contract
```
