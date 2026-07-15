# Visual Runtime 重构交接清单

> **交接日期：2026-07-15**
> **当前状态：阶段 0 / 1 / 2 已完成；阶段 3 / 4 已人工验收；阶段 5 / 6 已完成；阶段 7 的五张 GPU 世界地图已受控接入；阶段 8 的资源预算、配置级 / 浏览器截图基线与 WorldStage 生命周期回归已完成；阶段 9.1-a 的 `viridian-forest` 已完成人工视觉验收；阶段 9.1-b 的认证正式 WorldView 行为回归已通过人工验收；阶段 9.1-c 已将该图纳入显式 GPU migration gate，并以无 `world-gpu-diagnostic` 的真实认证 World → Battle → World 复测通过。Canvas 继续保留。阶段 9.1-d 的 `route3` sandbox-first 已完成并通过 cinematic / standard / compatibility 人工视觉验收；未扩大 GPU gate。幻境之塔五层已确定共用一个参数化 Scene Pack。`route3` 认证正式 WorldView 自动与人工行为验收均通过，并已通过显式 GPU migration gate 接入；Canvas 继续保留。**
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
| `packages/config/src/visuals.ts` | biome / scene / landmark / character config 与 GPU migration gate | 新场景优先加配置，禁止 renderer mapId 大分支。 |
| `packages/config/src/skill-visuals.ts` | 全技能 visual grammar / recipe / validation | 141 个技能必须保持 recipe 覆盖与预算校验。 |
| `packages/config/src/battle-environments.ts` | BattleStage biome environment catalog | renderer 只消费 terrain / ambience / palette / reaction DTO。 |
| `apps/web/src/game/BattlePresentationBridge.ts` | delayed battle presentation runtime | 不调用 renderer。 |
| `apps/web/src/game/SceneVisualTransition.ts` | 路由 renderer handoff | 只传 `{ mapId, quality }`。 |
| `packages/renderer-pixi/src/BattleStage.ts` | GPU battle implementation | 不读 engine/Pinia；消费 snapshot/cue。 |
| `packages/renderer-pixi/src/WorldStage.ts` | GPU world implementation | 不读 WorldView/store；消费 scene/entity DTO。 |
| `packages/renderer-pixi/src/CharacterView.ts` | GPU 角色与行为 primitive | 只包含 renderer-local 视觉。 |
| `apps/web/src/components/PixiBattleViewport.vue` | Vue ↔ BattleStage bridge | 仅 presentation/cues/biome/quality。 |
| `apps/web/src/components/PixiWorldViewport.vue` | Vue ↔ WorldStage bridge | 仅 scene/entities/quality。 |
| `apps/web/src/views/BattleView.vue` | 规则 tick、HUD、Canvas/GPU 控制 | 默认 Canvas；GPU 可回退。 |
| `apps/web/src/views/WorldView.vue` | 世界规则、移动、交互、Canvas/GPU 控制 | 仅 `GPU_WORLD_MAP_IDS` 批准地图可受控启用 GPU。 |
| `apps/web/src/components/WorldCanvas.vue` | 旧 Canvas compatibility world renderer | 不向其新增地图专用硬编码分支。 |
| `scripts/smoke.ts` | Node smoke | 已含 visual fixtures、GPU eligibility、三张受控 world scene、Stage 6 recipe / biome、剧情与白夜 rematch 检查。 |
| `scripts/visual-report.ts` | Visual recipe config report | `npm run visuals:report` 校验 recipe 覆盖、重复、signature 引用、粒子预算。 |

---

## 4. 已知限制（正常，不要误当回归）

- GPU BattleStage 的宝可梦仍是程序化 CombatantView，尚未接入正式宝可梦 sprite；这是后续战斗质量工作，不应回退当前 cue/runtime 架构。
- GPU WorldStage 的角色是程序化像素 `CharacterView`，不是最终 sprite asset pipeline。
- 当前正式 GPU 世界地图为 `pallet`、`route1`、`mt-moon`、`deep-space`、`dragon-den`；其余地图仍在迁移队列。阶段 9 的目标是完成全部启用地图覆盖后删除旧自定义 Canvas，而不是永久保留它。

- 正式资格仅由 `GPU_WORLD_MAP_IDS` 授予；scene pack 存在或 sandbox 可预览，不等于可进入正式 WorldView。
- `mt-moon` 已完成人工验收，覆盖 GPU World → cave GPU Battle → GPU World；当前 Canvas 仍是迁移期默认 / 失败 fallback，但阶段 9 完成后必须由 GPU compatibility 与非 Canvas 错误恢复替代。

- 阶段 3 的完整镜头语言、所有状态残留/element grammar、distortion 后效仍可继续增强；已验收的是最小可回退垂直切片。

---

## 5. 下一工作包（推荐，单次闭环）

### 阶段 5：萤火林道自然场景模块（已人工验收）

**完成内容：**

1. `WORLD_SCENE_BY_MAP_ID.route1` 已配置远景树墙、非单格树群、林间路径、草地、根须、苔石、树冠遮挡、低雾与 pollen 萤火 ambience。
2. `WorldStage` 通过通用 landmark / palette / ambience renderer 渲染自然场景；没有 `if (mapId === 'route1')` 分支。
3. `/world-stage-sandbox` 默认预览 route1，支持质量档位及雾湾镇对照；包含玩家、原有 `(7, 5)` 坐标的岚巡员与 renderer-only 环境 object。
4. 阶段 5 验收时的 `GPU_WORLD_MAP_IDS = ['pallet', 'route1']` 迁移 gate 已在阶段 7 扩展为 `['pallet', 'route1', 'mt-moon']`；scene pack 的存在本身仍不自动获得正式资格。
5. 世界 → grass battle → 世界的 GPU visual handoff 已由 map-id gate 通用化；星陨观测所额外验证 GPU World → cave battle → GPU World。规则、碰撞、warp、NPC 坐标、遭遇及剧情仍由既有 WorldView / store / engine 负责。

**验证与不变量：**

- `WorldCanvas.vue` 未新增 route1 / 森林专用逻辑；
- `packages/engine` 未改，renderer-pixi 不读取 Pinia 或 engine 内部状态；
- smoke 覆盖 route1 森林 scene contract 与受控 GPU eligibility；
- `typecheck` / `smoke` / `build:web` / Pixi bundle / `diff --check` 均需保持通过。

### 阶段 9.1-a：迷雾林境 sandbox-first（待人工验收）

1. `WORLD_SCENE_BY_MAP_ID['viridian-forest']` 新增 `mist-forest` Scene Pack：迷雾色板、树墙 / 树群 / 孢子林地 / 根环 / 苔石 / 孢子环 / 遮挡树冠 / 前景低雾，均为静态装饰配置，不复制地图 tiles、碰撞、warp、encounter 或剧情条件。
2. `WorldStage` 只新增可复用的 `spore-ring` landmark 和 `signal-spore` / `anomaly-core` object DTO grammar；object 的实时坐标与可见性仍由外部 `WorldEntityRenderSnapshot[]` 提供。renderer-pixi 不导入 Pinia / engine。
3. `/world-stage-sandbox` 默认展示迷雾林境，展示既有 story 的织羽 `(10, 9)`、三枚潮光孢子 `(3, 4)` / `(12, 7)` / `(4, 11)` 与异相核 `(8, 5)`；这些仅为独立 renderer 样本。
4. `visuals:report` 已记录配置 hash `796ba47b`；浏览器基线已扩为六张 sandbox Scene Pack × 三质量档，共 18 张 PNG，三轮 World → battle sandbox → World 共 18 次 scene switch，heap delta 为 `0 bytes`。
5. **明确未做：** `GPU_WORLD_MAP_IDS` 仍为五张既有受控地图，`viridian-forest` 未加入正式 GPU WorldView，`WorldCanvas.vue` 未增加专用分支，Canvas 未删除；等待人工审核视觉后才可进入该图移动 / 碰撞 / warp / NPC / 剧情 / 遭遇的正式行为回归。

**人工验收清单：**

- cinematic：迷雾、孢子环、潮光孢子与异相核清晰可辨，且树冠遮挡能形成前中后景；
- standard：保留关键辨识性，粒子减少但不导致剧情对象混淆；
- compatibility：保持可读构图和对象可发现性，不以旧 Canvas 兜底；
- 不验收或未通过时，不扩大 migration gate。

### 阶段 9.1-b：迷雾林境正式 WorldView 行为回归（已人工验收）

1. `apps/web/src/visuals/runtime-observation.ts` 增加显式、认证且仅诊断用途的 `world-gpu-diagnostic=<mapId>` 选择器。它只有在既有 `renderer-observation=1` 会话中才生效，并只由 Vue bridge 判断是否可为**当前地图**传入既有 SceneSpec；不改 `GPU_WORLD_MAP_IDS`、路由守卫、存档或 renderer-pixi。
2. `WorldView` 的普通 GPU 开关仍只读 `isGpuWorldMapId()`。`viridian-forest` 在正常可玩、刷新或非观测 URL 下仍是 Canvas；诊断会话会自动镜像该图的原始 `worldEntities` DTO 到 Pixi，且 WorldStage 不接触 Pinia / engine。
3. `scripts/playable-renderer-observation.ts` 通过真实注册与 UI 键盘移动，在可玩链路验证：开局 / 白夜 / 萤火林道巡查员、真实进入森林、三枚孢子顺序、织羽可见性、树格碰撞、草丛 encounter 资格、真实织羽试炼战的 GPU World → GPU Battle → GPU World 返回，以及森林 south warp 回到已批准 GPU 地图与雾湾镇。
4. 可玩观测不会伪造胜利或故事 flag；试炼战的结算仍由原 `BattleSim` 决定。Story 的异相核后续状态继续由既有 smoke 覆盖，sandbox 则已验证 object DTO appearance。
5. **明确未做：** `GPU_WORLD_MAP_IDS` 仍为五张既有地图；无 `WorldCanvas.vue` 改动、无 Canvas 删除，常规用户不见迷雾林境 GPU 按钮。

**已完成的人工验收：**

- 认证诊断会话中的真实森林进出、三枚孢子 / 织羽、树格阻挡、草丛语义、试炼战返回与 south warp 均正常；
- URL 参数在 World / Battle 路由转换后会消失，但同一标签页的 `sessionStorage` 会保留 observation / diagnostic 上下文，使连续诊断会话的迷雾林境继续使用 GPU；这是刻意用于 World → Battle → World 回归的 session-only 续航，不属于正式 gate；
- 新标签页 / 新浏览器会话，或清除当前标签页 sessionStorage 后，未带 `renderer-observation=1&world-gpu-diagnostic=viridian-forest` 进入迷雾林境必须回到 Canvas，且不显示迷雾林境 GPU 按钮；
- 本确认完成前没有修改 `GPU_WORLD_MAP_IDS`。

### 下一工作包：阶段 9.1-c——迷雾林境显式 GPU migration gate

**唯一目标：** 把已验收的 `viridian-forest` 追加到配置化 `GPU_WORLD_MAP_IDS`，让普通认证 WorldView 可按既有用户 GPU 开关走正式 Pixi 路径；随后完成真实 World → Battle → World 复测。

**必须保持：**

1. 只改 config gate、必要的 gate / smoke / 认证观测断言和交接文档；不改 `packages/engine`、地图、故事、碰撞、warp、NPC 坐标、遭遇、存档或 `WorldCanvas.vue`。
2. 移除或收窄 `world-gpu-diagnostic=viridian-forest` 对该图的特殊需要：gate 接入后，正常正式路径必须完全由 `isGpuWorldMapId('viridian-forest')` 驱动；保留 observation 通用能力时不得让它成为未批准地图的发布后门。
3. Canvas 仍是迁移期默认 / fallback；不得删除 Canvas，且不得开始阶段 9.2 的默认化工作。
4. 运行 `typecheck`、`smoke`、`visuals:report`、`visuals:browser`、`visuals:playable`、`build:web`、Pixi bundle 与 `git diff --check`；人工确认普通非 observation 的迷雾林境 GPU 手动开启、Canvas 切换、试炼战返回和 south warp。

### 阶段 6：技能视觉配方与 battle biome（已完成）

1. `packages/config/src/skill-visuals.ts` 为全部 141 个技能生成配置化 recipe，包含 delivery、impact、tier、camera、environment reaction、variant 与 particleBudget。
2. `packages/config/src/battle-environments.ts` 为 grass / cave / water / dragon / arena 定义 palette、terrain、ambience 与允许的环境反应。
3. `BattleStage` 只消费上述 environment / recipe DTO：通用 terrain/ambience grammar、quality particle cap 和 generic variant motif；没有技能 ID 分支。
4. `/battle-stage-sandbox` 可切换五种 biome；`npm run visuals:report` 与 smoke 共同验证覆盖、重复、无效 signature 引用和超预算。

### 阶段 7：星陨观测所 Scene Pack + WorldStage sandbox（已人工验收）

1. `WORLD_SCENE_BY_MAP_ID['mt-moon']` 描述观测穹顶、陨石尖塔、星图地台、晶簇、裂隙雾与 starlight ambience；不触碰地图 tiles、encounterFloor、warp 或剧情。
2. `WorldStage` 新增可复用的 observatory / meteor / star-chart / crystal / rift landmark grammar，且 `starlight` ambience 仍由通用 ambience path 绘制。
3. `CharacterView` 增加 `trace-stars` 行为；星图师朔继续使用原有配置坐标 `(11, 8)`，正式 WorldView 仍只镜像其 authoritative entity DTO。
4. `/world-stage-sandbox` 默认进入星陨观测所，并可切换雾湾镇、萤火林道对照。人工验收后，`mt-moon` 已加入 `GPU_WORLD_MAP_IDS`，正式 WorldView 可通过既有 Canvas / GPU 控制受控启用。

### 星陨观测所受控正式 GPU 接入（已人工验收）

- `GPU_WORLD_MAP_IDS = ['pallet', 'route1', 'mt-moon']` 是正式 WorldView 的唯一批准列表；现有 WorldView / BattleView 只读取该 gate，因此无需新增 map-id 分支。
- `mt-moon` 可使用既有 Canvas / GPU 控制；GPU 初始化失败仍回退 Canvas。
- 已通用化的 visual handoff 覆盖 GPU World → cave battle → GPU World；路由间仍只交接 `{ mapId, quality }`。
- 碰撞、自然 encounterFloor、warp、星图师坐标、剧情与存档继续由原有 WorldView / store / engine 负责。

### 阶段 7：深空遗迹 Scene Pack + 受控正式 GPU 接入（已人工验收）

1. `WORLD_SCENE_BY_MAP_ID['deep-space']` 描述失重石台、裂隙拱门、悬浮碎片、近景遮挡石台、裂隙雾与 `rune` ambience；它仅是装饰性 scene pack，不复制 `maps.ts` 的 tile / collision / encounterFloor / warp。
2. `WorldStage` 使用通用 `gravity-platform` / `rift-arch` / `void-debris` landmark grammar，并以 config-owned `objectVisuals` 将 renderer DTO 的既有故事物件 ID 映射为失重晶簇、古代终端、裂隙守卫核心与幻兽回响的通用外观。renderer 不读取 Pinia、store 或 engine 内部状态，物件坐标和可见性仍由传入 snapshot 决定。
3. `/world-stage-sandbox` 默认进入深空遗迹，使用 `story.ts` 中既有 `(3, 2)` / `(12, 5)` / `(5, 10)` / `(8, 5)` / `(8, 9)` / `(8, 2)` 坐标作为独立 renderer DTO 样本；可继续切换星陨观测所、萤火林道与雾湾镇回归对照。
4. 人工验收通过后，`deep-space` 已加入 `GPU_WORLD_MAP_IDS = ['pallet', 'route1', 'mt-moon', 'deep-space']`。既有 `isGpuWorldMapId()` bridge 自动复用 Canvas / GPU 控制、失败回退及 GPU World → battle → GPU World 视觉 handoff，无需新增 `WorldView.vue` 或 `WorldCanvas.vue` 的地图专用分支。
5. `packages/engine`、`maps.ts`、`story.ts`、碰撞、warp、NPC 坐标、自然 encounterFloor、遭遇规则、剧情与存档均未修改。

### 阶段 7：潮洞 Scene Pack + 受控正式 GPU 接入（已人工验收）

1. `WORLD_SCENE_BY_MAP_ID['dragon-den']` 描述潮蚀洞壁、盐晶潮池、深潮锚印地台、前景潮雾与 `rune` ambience；它只表达视觉层次，不复制 `maps.ts` 的 tile / collision / encounterFloor / warp。
2. `WorldStage` 使用可复用 `tide-cavern-wall` / `crystal-tide-pool` / `anchor-dais` / `cave-veil` landmark grammar，并以 config-owned `objectVisuals` 为传入 DTO 的 `tide-anchor` 与 `deep-space-gate` 提供通用外观。renderer 不读取 Pinia、store 或 engine 内部状态；对象的坐标和可见性仍完全由 snapshot 决定。
3. `/world-stage-sandbox` 默认进入潮洞，使用既有故事配置坐标：潮洞守望者 `(10, 8)`、深潮锚印 `(8, 5)` 与深空裂隙 `(8, 2)`；深空、观测所、林道与雾湾镇仍可作为回归对照。
4. 人工验收通过后，`dragon-den` 已加入 `GPU_WORLD_MAP_IDS = ['pallet', 'route1', 'mt-moon', 'deep-space', 'dragon-den']`。既有 `isGpuWorldMapId()` bridge 自动复用 Canvas / GPU 控制、失败回退及 GPU World → battle → GPU World 视觉 handoff，无需新增 `WorldView.vue` 或 `WorldCanvas.vue` 的地图专用分支。
5. `packages/engine`、`maps.ts`、`story.ts`、碰撞、warp、NPC 坐标、自然 encounterFloor、遭遇规则、剧情与存档均未修改。

### 阶段 8 前置：WorldScene 资源预算、预加载边界与配置级视觉回归基线（已完成）

1. 每个 `WorldSceneSpec` 现在声明 `resources`：场景本地 `preloadKeys`、landmark / 静态 container / cinematic ambience particle / dynamic entity 上限。五张已批准 GPU 地图目前均显式为 `['procedural-primitives']`，即不预加载全世界资产，也不在本阶段引入外部纹理依赖。
2. `WorldStage.enterScene()` 在进入新场景前清理旧 Scene Pack 的预加载所有权，并仅预加载当前 scene 的 key；`unmount()` 同时释放该边界记录与 Pixi children / texture source。环境粒子数量仍受质量档位限制，并额外受 scene budget 上限约束。
3. `worldSceneBudgetReport()` / `validateWorldSceneBudgets()` 校验重复 scene / map ID、GPU gate 缺失 Scene Pack、未知 preload key 与预算超限。`npm run visuals:report` 输出五张地图的 landmark、静态 container、entity、cinematic particle、preload 数量以及稳定 baseline hash。
4. `WORLD_SCENE_VISUAL_BASELINES` 固化现有配置构成 hash：`pallet=18226d2f`、`route1=d2919216`、`mt-moon=05366b70`、`dragon-den=fa843cf7`、`deep-space=9ebe7f67`。这是无需浏览器 DOM / Pixi 截图的第一层可重复视觉回归；任何 Scene Pack 构成、顺序或配置角色/物件的变化都必须在评审后更新基线。
5. smoke 和 visual report 均验证五张受控 GPU 地图的预算、预加载边界和 baseline。此工作包不扩大 `GPU_WORLD_MAP_IDS`，不触碰地图规则或存档。

### 阶段 8：浏览器截图基线与 WorldStage 生命周期回归（已完成）

1. 新增 `playwright-core` 开发依赖，复用本机 Chrome；`npm run visuals:browser` 使用固定 `1280×800` viewport、Chrome + SwiftShader 生成并比对五张 WorldScene Pack × 三档质量的 15 张 PNG 基线。审核后的文件位于 `doc/visual-baselines/`，临时 actual / diff 产物位于已忽略的 `doc/visual-baselines/artifacts/`。
2. `?visual-regression=1` 仅允许访问独立 `world-stage-sandbox` / `battle-stage-sandbox`：router 和 App 都限制路径，不能绕过可玩 world、battle、菜单或存档页面的认证。该模式关闭 WorldStage 动画，固定程序化粒子/角色姿势，并公开只读 diagnostics。
3. `WorldStage.getDiagnostics()` 输出 scene、quality、preload key、ambience particle、entity、static child 和 motion 状态。浏览器 harness 验证每张截图时的 diagnostics；并执行三轮 World → battle sandbox → World，每轮跨五个场景切换，确认每次仅保留一个 WorldStage canvas、scene-local preload 为一项、motion 关闭且无结构泄漏。
4. harness 通过 CDP 强制 GC 后记录堆观测。当前固定环境结果为 15 次 scene switch、3 次 World → battle → World、heap delta `0 bytes`；阈值为小于 32 MiB，以避免浏览器 / 驱动差异造成脆弱的绝对内存断言。
5. 有意改变 WorldStage 视觉时先运行 `npm run visuals:browser -- --update`，人工审核 15 张 PNG 和 `manifest.json` 后再提交；普通 `npm run visuals:browser` 只比对，不会覆盖基线。

### 下一工作包（推荐）：可访问性与运行时设置

在不改变规则或渲染契约的前提下，加入“减少闪烁”和“镜头强度”设置，贯通 WorldStage / BattleStage 的 presentation-only 视觉参数；随后为设置页、兼容 renderer 与长时间运行观测补充人工验收。

---

## 6. 新上下文可直接复制提示

```text
请继续执行 `doc/VISUAL_RUNTIME_REFACTOR_PLAN.md`。
当前阶段：阶段 8（可访问性与运行时设置）。
当前工作包：只实现“减少闪烁”和“镜头强度”的 presentation-only 设置，贯通 WorldStage / BattleStage 与设置页；不得改变 engine、战斗规则、存档语义或 `GPU_WORLD_MAP_IDS`。浏览器视觉回归仍须保持五图 × 三质量档通过。

请先阅读：
- PROJECT_RULES.md
- README.md
- doc/VISUAL_RUNTIME_REFACTOR_PLAN.md
- doc/VISUAL_RUNTIME_HANDOFF.md
- doc/VISUAL_RUNTIME_BASELINE.md

必须：
- 先检查 git status，保留全部未提交改动；
- 不改 packages/engine，不让 renderer-pixi 读取 Pinia / engine 内部状态；
- 不在 WorldCanvas.vue 新增地图专用硬编码分支；
- 不改变地图碰撞、warp、NPC 坐标、遭遇、剧情、存档或 GPU migration gate；
- 保持 `npm run visuals:report` 与 `npm run visuals:browser` 通过；
- 完成后运行 npm run typecheck、npm run smoke、npm run visuals:report、npm run visuals:browser、npm run build:web、Pixi esbuild bundle、git diff --check；
- 报告修改文件、配置/renderer 边界、验证结果与下一步。
```

---

## 7. 最近通过的验证

最近一轮已通过：

```text
npm run typecheck
npm run visuals:report
npm run visuals:browser
npm run smoke
npm run build:web
npx esbuild packages/renderer-pixi/src/index.ts --bundle --platform=browser --format=esm ...
git diff --check
```

Smoke 中新增/仍覆盖：

```text
✓ visual runtime deterministic fixtures
✓ BattlePresentationBridge delayed cue contract
✓ BattleDirector deterministic cue contract
✓ BattleStage primitive cue policy
✓ Stage 6 visual recipe and battle biome contract
✓ Starfall Observatory WorldSceneSpec sandbox contract
✓ Deep-space WorldSceneSpec sandbox contract（已人工验收并纳入 GPU gate）
✓ Tide Dragon Den WorldSceneSpec sandbox contract（已人工验收并纳入 GPU gate）
✓ Stage 8 world scene budgets and visual baselines: 5
✓ browser visual baseline matrix: 15 screenshots
✓ WorldStage lifecycle observation: 15 scene switches / 3 World → battle sandbox → World / heap delta 0 bytes
✓ controlled GPU world eligibility
✓ Mist Bay / Lumen Trail / Starfall Observatory scene contracts
✓ GPU world-battle visual handoff contract
✓ White Night repeatable sparring contract
```

## 阶段 8：presentation-only 可访问性与运行时设置（2026-07-15）

设置页新增“减少闪烁”与“镜头强度（标准 / 降低 / 关闭）”。它们由 `apps/web/src/visuals/runtime-settings.ts` 在当前浏览器 `localStorage` 中保存，**不进入 Pinia、`PlayerSave`、云端 persist 或任何 engine 输入**，因此不会改变存档语义、战斗规则或多人状态。

Vue 仅把 `VisualRuntimeSettings` 这个 renderer-neutral DTO 低频传入 `PixiWorldViewport` / `PixiBattleViewport`；两个 viewport 只调用对应 Stage 的 `setVisualSettings()`。`WorldStage` 在减少闪烁时停止 ambience / CharacterView 动态并衰减转场；`BattleStage` 降低现有 VFX 与转场亮度，镜头强度仅缩放 GPU 战斗 camera offset / zoom / shake。renderer-pixi 未读取 Pinia、localStorage 或 engine 内部状态，`WorldCanvas.vue`、`GPU_WORLD_MAP_IDS`、地图规则和迁移 gate 均未改动。

默认设置保持原视觉行为，故五张 Scene Pack × cinematic / standard / compatibility 的既有浏览器 PNG 基线无需更新；`visuals:browser` 已重新比对通过。

## 阶段 8：设备能力与本机 GPU 质量设置（2026-07-15）

`visualRuntimeSettings` 新增 `qualityPreference: 'auto' | 'cinematic' | 'standard' | 'compatibility'`，仍只保存在当前浏览器 `localStorage`。Vue bridge 在 `apps/web/src/visuals/runtime-settings.ts` 探测 WebGL、WebGL2、device pixel ratio 与可用的 `navigator.deviceMemory`，再调用 renderer 包中 DOM-free 的 `selectQualityProfile()`；Pixi 只接收最终 `QualityProfile`，不读取浏览器 API、Pinia、存档或 engine。

设置页提供自动 / 电影 / 标准 / 兼容四档。切换后，WorldView 与 BattleView 监听已解析档位并把质量实时传给既有 viewport / Stage `setQuality()` 路径；世界与战斗路由 handoff 仍只传递 `{ mapId, quality }`。自动默认保持原有基线所用的解析结果，故五图 × 三质量档浏览器视觉基线不需要更新。

## 阶段 8：正式可玩路径 renderer 观测入口（2026-07-15）

正式 WorldView / BattleView 新增仅用于已登录会话的显式 `?renderer-observation=1` 观测入口；**router 认证守卫没有任何豁免**，它不能创建、加载或修改战斗 / 存档。Pixi Stage 只提供 renderer-local diagnostics（canvas 数量 / 像素、WebGL draw-call、container / entity / effect 等计数），viewport 在 mount 后通过 browser-only `runtime-observation.ts` 采样，并由 `window.__PO_RENDERER_OBSERVATION__()` 输出报告。该报告不进入 presentation cue、路由 handoff、Pinia 或 PlayerSave。

这为人工或已认证 e2e 会话提供正式 World → Battle → World 的长期资源与内存采样基础；现有 `visuals:browser` 仍只运行独立 sandbox、保持五图 × 三质量档 baseline 的认证边界与确定性。

## 阶段 8：认证正式路径三轮观测结果（2026-07-15）

新增 `npm run visuals:playable`。脚本会启动本地 Worker + D1 与 Vite，通过**正常注册 UI、选择初始伙伴、首段剧情、首次白夜训练战和真实地图 warp**解锁萤火林道；随后启用既有用户控制的 GPU renderer，经真实 warp 返回雾湾镇，执行白夜可重复切磋的三轮 GPU World → GPU Battle → GPU World。它不会写入 token、Pinia 或存档捷径，也不改变 router guard。

本机 Chrome + SwiftShader 的首轮结果：3 cycles、WorldStage mount 4 次、BattleStage mount 3 次、23 条采样（world 13 / battle 10）、CDP 强制 GC heap delta `0 bytes`、采样 heap 增量 `6,336,016 bytes`（< 32 MiB）、最大累计 draw-call `795`、world / battle 最大 renderer child 分别为 `45 / 73`，每条采样均为单 canvas。完整机器可再生报告在被忽略的 `doc/visual-baselines/artifacts/playable-runtime-observation.json`。

---

## 8. 阶段 9：全量迁移与旧 Canvas 删除交接手册（新上下文唯一执行基线）

### 8.1 已作出的产品 / 架构决定

- 目标不是长期维护 Canvas / GPU 双轨；**旧自定义 `WorldCanvas`、`BattleCanvas` 及其专用 adapter 最终必须删除**。
- 删除不是下一次直接做：先完成全量 GPU 覆盖、GPU 默认化、错误恢复、全量视觉回归和正式认证路径观测。
- `compatibility` 保留，但它是 Pixi 的低质量 GPU 档；WebGL 不可用或资源失败必须显示可理解的恢复 UI，不能回退到旧 Canvas。
- Vue / Pinia 仍负责规则外 UI 与业务状态；renderer-pixi 只消费 DTO，不能读取 Pinia、engine 内部状态、localStorage 或 PlayerSave。

### 8.2 当前覆盖矩阵

| 类别 | 已验收 GPU | 待迁移 / 待补齐 |
|---|---|---|
| 世界地图 | `pallet`、`route1`、`viridian-forest`、`route3`、`mt-moon`、`rock-tunnel`、`deep-space`、`dragon-den` | `rock-tunnel` 正式页面人工验证、`sea-route`，以及 `ILLUSION_TOWER_ENABLED=true` 时的训练塔五层（共用一个参数化 Scene Pack）；实际范围须从 `MAPS` 自动审计，不能靠手写列表。 |
| 战斗路径 | GPU BattleStage 已可走受控 World → Battle → World，并完成正式认证三轮观测 | PVE 野外、剧情战、PVP 必须都切为 GPU 默认，并覆盖 capture / result / return / 错误恢复。 |
| 可访问性 | 质量自动 / 手动、减少闪烁、镜头强度 | WebGL 不可用、mount / preload 失败的非 Canvas 恢复 UX。 |
| 回归 | 五图 × 三质量截图、sandbox 生命周期、真实认证三轮观测 | 覆盖 manifest 扩展至全部启用地图、三类战斗和全量删除后的无旧引用检查。 |

### 8.3 推荐的后续工作包顺序

1. **9.1-a：迷雾林境 `viridian-forest`**。只新增配置化森林 / 迷雾 scene pack、sandbox、三档截图和受控 gate；不改其他地图、规则或 Canvas。
2. **9.1-b：星陨高径 `route3`**。只做高径 / 石路 / 星痕模板与验收。
3. **9.1-c：岩窟 `rock-tunnel`**。重点验证洞窟遮挡、低光、`encounterFloor` 与 world→cave battle→world。
4. **9.1-d：静潮航路 `sea-route`**。重点验证潮位、船只、水域和剧情物件；不把 tide 业务判断移进 renderer。
5. **9.1-e：训练塔配置生成**。以 `MAPS` / 开关生成覆盖 manifest，不为每层添加 renderer `mapId` 分支。
6. **9.2：GPU 默认化**。所有覆盖完成后移除玩家可见 Canvas / GPU 切换，GPU 成为 WorldView / BattleView 默认；Canvas 仅短暂留作内部诊断。
7. **9.3：非 Canvas 失败恢复**。完成 WebGL、资源、stage mount、路由中断策略和验收。
8. **9.4：独立机械删除批次**。审计并删除旧 Canvas 文件、adapter、模式分支、样式和测试；不得夹带 engine、地图、剧情或存档变更。

### 8.4 每个地图迁移的硬性门槛

```text
WorldSceneSpec / 通用 renderer grammar
→ sandbox DTO + cinematic / standard / compatibility 人工验收
→ visuals:report（budget / fingerprint）
→ visuals:browser（截图 baseline）
→ 正式 WorldView 行为回归（移动、碰撞、warp、NPC、剧情、遭遇）
→ 显式 GPU gate
→ visuals:playable / renderer-observation
```

- `GPU_WORLD_MAP_IDS` 仍是迁移期唯一正式资格来源；scene pack 存在不等于正式接入。
- 不在 `WorldCanvas.vue` 增加地图专用分支。
- 不改 `packages/engine`，不让 renderer 决定可见性、坐标、碰撞或剧情状态。
- 一张地图未通过三档视觉、规则路径和正式返回观测，不能进入下一张地图的删除前覆盖清单。

### 8.5 删除旧 Canvas 的不可协商门槛

仅在 `doc/VISUAL_RUNTIME_REFACTOR_PLAN.md` 阶段 9.3 全部勾选后执行。删除提交必须单独、可审查，且至少验证：

```powershell
npm run typecheck
npm run smoke
npm run visuals:report
npm run visuals:browser
npm run visuals:playable
npm run build:web
npx esbuild packages/renderer-pixi/src/index.ts --bundle --platform=browser --format=esm ...
git diff --check
```

此外必须静态确认没有 `WorldCanvas`、`BattleCanvas`、`CanvasCueAdapter` 及 Canvas renderer mode 残留运行时引用；质量 `compatibility` 仍通过 Pixi 工作。

### 8.6 可直接复制到新上下文的启动提示

```text
请继续执行 `doc/VISUAL_RUNTIME_REFACTOR_PLAN.md`。
当前阶段：阶段 9（全量 GPU 迁移与旧 Canvas 退役）。
当前工作包：`rock-tunnel` 已按单图直接实装并通过显式 GPU gate 接入；请在正式页面人工验证 GPU 切换、低光遮挡、`encounterFloor`、岩壁碰撞与洞窟 warp。验证后直接推进 `sea-route` 单图实装；不得改 engine、WorldCanvas、地图规则、剧情或存档。幻境之塔五层后续必须共用一个参数化 Scene Pack。

请先阅读：
- PROJECT_RULES.md
- README.md
- doc/VISUAL_RUNTIME_REFACTOR_PLAN.md
- doc/VISUAL_RUNTIME_HANDOFF.md
- doc/VISUAL_RUNTIME_BASELINE.md

必须：
- 先检查 git status，保留全部未提交改动；
- 不改 packages/engine，不让 renderer-pixi 读取 Pinia / engine 内部状态；
- 不在 WorldCanvas.vue 新增地图专用硬编码分支；
- 不改变碰撞、warp、NPC 坐标、遭遇、剧情、存档或 GPU migration gate；
- 只通过通用 landmark / palette / ambience / object DTO 扩展 WorldStage；
- 保持 npm run visuals:report、npm run visuals:browser、npm run visuals:playable 通过；
- 完成后运行 npm run typecheck、npm run smoke、npm run visuals:report、npm run visuals:browser、npm run visuals:playable、npm run build:web、Pixi esbuild bundle、git diff --check；
- 报告修改文件、配置 / renderer 边界、验收结果和下一步。
```


## 阶段 9.1-e：赤砾裂谷正式页面人工验收（2026-07-15）

赤砾裂谷的普通用户 GPU 切换、低光遮挡、自然地面 `encounterFloor`、岩壁碰撞，以及与星陨观测所 / 静潮群岛之间的洞窟 warp 已在正式页面人工验收通过。该结论仅完成已存在 `rock-tunnel` migration gate 的人工门槛；Canvas 继续保留，地图规则、剧情与存档均未改动。

## 阶段 9.1-f：静潮群岛 sandbox-first 单图实装（2026-07-15，待人工验收）

`sea-route` 已新增配置化 `stilltide-isles` Scene Pack。它以通用 `reef-islet`、`tide-channel`、`shipwreck`、`tide-cave-mouth` landmark grammar，加上 `spray` ambience / `tide-sea` palette，表现低潮礁石、水道、沉船、潮洞入口和海雾；`tide-gauge`、`ship-log` 是输入 World DTO 的外观映射，绝不拥有潮位、可见性、坐标或交互。

海路没有加入 `GPU_WORLD_MAP_IDS`，因此没有改变 GPU migration gate；`WorldCanvas.vue`、`packages/engine`、地图、碰撞、`encounterFloor`、船只 / 洞窟 warp、NPC 坐标、剧情和存档都未修改。`visuals:report` 候选 fingerprint 为 `15c1084d`；`visuals:browser` 已扩展为九图 × 三质量档共 27 张截图，27 次 scene switch、强制 GC heap delta `0 bytes` 均通过。

下一步：先人工检查 `/world-stage-sandbox?visual-scene=sea-route` 的 cinematic / standard / compatibility 视觉；随后按正式页面路径验证 GPU 切换、潮位对象可见性、自然地面 encounter、礁石碰撞、船只 / 洞窟 warp，人工通过后才能单独把 `sea-route` 加入显式 GPU gate。幻境之塔五层仍必须共用一个参数化 Scene Pack。
