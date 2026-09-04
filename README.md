# Pokémon Online

> 一个让朋友一起旅行、一起发现、一起培养宝可梦的世界。
> A friend-co-op Pokémon raising game. Not a commercial MMO — no leaderboards, no stamina, no daily check-ins.

本项目所有开发由 AI 与开发者协同完成，遵循 **Design First（设计优先）** 原则。前端负责战斗、AI、炼妖等全部计算，Cloudflare Workers + D1 仅作为存档与认证服务器。

Sprites © [PokeAPI](https://github.com/PokeAPI/sprites) — 本项目为非商业同人作品，不用于商业用途。

宝可梦相关角色、名称、设计、商标及其他 IP 仍属于 Nintendo / Creatures Inc. / GAME FREAK inc. / The Pokémon Company 等相应权利方。

---

## ✨ 特性

- **当前范围**：仅保留出生城镇「雾湾镇」与五层「幻境之塔」。其他地图、剧情与专属代码已移除；战斗和 UI 品质达标后再规划扩展。
- **开发训练塔**：雾湾镇设有「幻境之塔」沙盒设施，五层分别提供 Lv.5–10、12–18、20–28、30–40、45–55 的野生遭遇，用于快速体验战斗、捕捉与炼妖循环。
- **实时自动战斗**：**PVE/PVP 均同时上场**（玩家 3 只 vs 野外 1~3 只 / 对手 3 只），全部由 AI 操控——玩家拼培养、拼阵容、拼理解，而非操作。
- **性格驱动 AI**：10 种性格改变 AI 行为（勇敢/胆小/狡猾/固执/谨慎/鲁莽/智慧/冷静/顽皮/悠闲），同种宝可梦可拥有完全不同的战斗风格。
- **独立技能冷却**：无 MP/PP，每个技能独立 CD，普攻保证持续输出；AI 根据距离/权重/性格/血量/局势动态选择。
- **100% 捕获**：击败后选择捕捉或放生，放生保留图鉴记录，经验始终获得；**战斗结束自动回满状态**（低压力设计）。
- **双阵容系统**：随身携带最多 **20 只**宝可梦（暂无仓库，未来保留），分别设置 **PVE 阵容**与 **PVP 阵容**各 3 只 + 自由摆位阵型（起始阵位）。满员时无法捕捉，需先放生。
- **梦幻式炼妖**：两只宝可梦炼妖产出一只新个体，种族随机继承主/副宠（不融合），资质与成长重新随机，被动技能随机继承（多技能上限），特性极低概率变异，保留家谱。
- **统一四维**：生命/攻击/防御/速度（攻特攻合一、防特防合一）。
- **配置驱动**：151 只初代宝可梦、技能、特性、性格、地图全部为静态配置；新增世代/地图优先只加配置，不改核心规则。
- **Pixi GPU 战斗**：世界与战斗统一由 PixiJS 渲染；角色通过配置化的静态图与序列帧资产表现待机、移动、蓄力、攻击、施法、受击与倒下。
- **云端存档**：Cloudflare D1 关系型数据库 + Workers 存档服务器，前端计算，随时跨设备继续冒险。

---

## 🧱 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 + Vite + Pinia + Vue Router（TypeScript） |
| 视觉运行时 | PixiJS（世界与战斗 GPU renderer） |
| 后端 | Cloudflare Workers（TypeScript，仅存档/认证/PVP 队列查询） |
| 数据库 | Cloudflare D1（SQLite） |
| 部署 | 单个 Worker：静态资源（SPA）+ `/api/*` + D1 绑定 |
| 共享 | `packages/shared` 类型、`packages/config` 静态配置、`packages/engine` 游戏引擎 |

> **为什么前端计算？** 这是朋友游戏，不追求反作弊。前端负责 AI/战斗/炼妖等复杂逻辑，Workers 只负责存档与同步，极大降低开发复杂度（详见 `docs` 设计思路）。

---

## 🎯 当前开发目标：Pixi 序列帧战斗

当前阶段聚焦一条主线：**完善 Pixi GPU 战斗的配置化 2D 序列帧表现，并保持世界与战斗的一致渲染链路。**

```text
Pixi 世界探索
  → 遭遇 / 战斗入口
  → BattleSim（AI、伤害、状态、移动、空间碰撞权威）
  → presentation（snapshot / cue）
  → Pixi BattleRenderer
  → 战斗结果回到世界
```

### Pixi 战斗当前约束

- `packages/engine` / `BattleSim` 始终决定 AI、伤害、命中、状态、死亡、移动和目标距离；Pixi 不重算玩法。
- `packages/renderer-pixi` 只消费 renderer-neutral DTO，负责 2D 角色、序列帧、镜头、VFX、材质和资源释放。
- 每种战斗资产必须经过 manifest 审计：来源、许可证、帧尺寸、动作 clip、挂点与质量预算。
- 正式战斗入口仅挂载 Pixi，不提供玩家 renderer 切换。

## 📂 项目结构

```
xm-pokemon/
├── packages/
│   ├── shared/          # 前后端共享类型与常量
│   ├── config/          # 全部静态配置（151宝可梦/技能/特性/性格/地图/道具/经验曲线/属性相克）
│   ├── engine/          # 游戏引擎（战斗模拟/AI/炼妖/属性计算/遇敌/捕获）
│   ├── renderer-pixi/   # Pixi GPU 世界与战斗 renderer（2D 角色、序列帧、VFX、资源生命周期）
│   └── utils/           # 通用工具
├── apps/
│   ├── web/             # Vue 3 前端（views/components/stores）
│   │   └── public/sprites/   # 下载的宝可梦素材
│   └── worker/          # Cloudflare Worker（auth/save/pvp 路由）
├── database/
│   └── schema.sql       # D1 表结构
├── scripts/
│   ├── setup.sh         # 一键本地环境
│   ├── deploy.sh        # 一键部署到 Cloudflare
│   ├── deploy.ps1       # Windows PowerShell 部署
│   └── download-sprites.mjs
├── wrangler.toml        # Worker + D1 + 静态资源配置
└── package.json         # workspaces 根
```

---

## 🚀 快速开始（本地开发）

### 前置要求
- Node.js ≥ 18
- npm
- （部署）一个 Cloudflare 账号

### 一键安装
```bash
bash scripts/setup.sh
```
该脚本会：安装依赖 → 初始化本地 D1 → 下载素材。

或手动分步：
```bash
npm install                      # 安装依赖（workspaces）
npx wrangler d1 execute pokemon-online --local --file=database/schema.sql   # 本地 D1 建表
node scripts/download-sprites.mjs                                            # 下载 151 宝可梦素材
```

### 启动开发服务器
```bash
npm run dev
```
- 前端 Vite：http://localhost:5173
- Worker（API + 本地 D1）：http://localhost:8787
- 前端已配置代理，`/api/*` 自动转发到 Worker。

打开 http://localhost:5173 → 注册账号 → 选择初始伙伴 → 开始冒险。

> 首次 `npm run dev` 时 wrangler 会自动创建本地 D1。若 `/api/register` 报错，先单独跑一次 `npx wrangler dev` 让它初始化 D1，再 `npm run db:apply`，然后重启。

---

## ☁️ 部署到 Cloudflare

### 方式 A：一键脚本（推荐）
```bash
npx wrangler login          # 登录 Cloudflare（仅需一次）
bash scripts/deploy.sh      # macOS / Linux / Git Bash
# 或 Windows PowerShell:
#   pwsh ./scripts/deploy.ps1
```
脚本自动完成：创建 D1 → 写回 `database_id` → 远程建表 → 构建前端 → 部署 Worker。

### 方式 B：手动步骤

1. **登录 Cloudflare**
   ```bash
   npx wrangler login
   ```

2. **创建 D1 数据库**
   ```bash
   npx wrangler d1 create pokemon-online
   ```
   把输出中的 `database_id` 填入 `wrangler.toml`：
   ```toml
   [[d1_databases]]
   binding = "DB"
   database_name = "pokemon-online"
   database_id = "粘贴这里"
   ```

3. **应用数据库结构到远程**
   ```bash
   npx wrangler d1 execute pokemon-online --remote --file=database/schema.sql
   ```

4. **构建前端**
   ```bash
   npm run build
   ```
   产物输出到 `apps/web/dist`，由 Worker 作为静态资源提供服务。

5. **部署 Worker**
   ```bash
   npx wrangler deploy
   ```
   部署完成后，wrangler 会输出 `https://pokemon-online.<你的子域>.workers.dev`，这就是游戏地址。

6. **（可选）设置密钥**
   ```bash
   npx wrangler secret put AUTH_PEPPER   # 密码加密附加胡椒（增强安全）
   ```

### 自定义域名
在 Cloudflare Dashboard → Workers & Pages → 你的 Worker → Settings → Triggers → Custom Domains 绑定域名即可。

### 数据库管理
```bash
# 查看远程数据
npx wrangler d1 execute pokemon-online --remote --command "SELECT username, created_at FROM players"
# 备份存档
npx wrangler d1 execute pokemon-online --remote --command "SELECT * FROM saves" --json > backup.json
```

---

## 🎮 玩法指南

1. **注册 / 登录** → 选择初始伙伴（妙蛙种子 / 小火龙 / 杰尼龟）。
2. **探索**：在「探索」页用方向键/WASD 移动，从雾湾镇研究所西侧塔门进入幻境之塔；在塔内自然地面触发野生遇敌。
3. **战斗**：全自动实时演算，可调速（1x/2x/3x）、暂停、跳过。**PVE/PVP 均同时上场**（3vN，野外 1~3 只）。击败后可**捕捉其中一只**或全部放生，战斗结束自动回满状态。
4. **培养**：宝可梦获得经验升级、学会新技能、可能进化（详情页可手动触发进化，伊布可三选一）。进化时主动技能全部换成新种族当前等级的技能组；被动全部保留，并补齐新种族必带被动、去重。即使已有 24 个被动，进化也不会为补齐必带而删掉旧技能；再次炼妖的后代仍以 24 个为上限。资质、成长与家谱保持不变。
5. **阵容**：在「队伍」页设置 PVE/PVP 两套阵容各 3 只 + 自由摆位阵型，随身最多携带 20 只。
6. **炼妖**：在「炼妖」页选两只宝可梦炼妖，产出新个体——赌资质、继承被动、拼极品。
7. **幻境之塔（开发沙盒）**：雾湾镇研究所西侧可进入五层训练塔。每层有固定等级区间的野生宝可梦，适合反复测试战斗、补充图鉴、捕捉个体与炼妖；当前版本只围绕该循环打磨。
8. **切磋**：在「切磋」页用 PVP 阵容输入好友用户名挑战其存档队伍（AI 对战 AI）。
9. **图鉴**：收集 151 只，放生也保留记录。
10. **商店**：用金币购买精灵球、经验糖果等（战斗自动回满，无需伤药）。

### 幻境之塔

五层等级分别为 Lv.5–10、12–18、20–28、30–40、45–55，合计覆盖全部 151 种宝可梦。塔内上下楼可自由往返，不设剧情门槛。区域地图只显示雾湾镇和幻境之塔。

本次为破坏性精简：存档版本为 v6，不迁移旧存档。旧版本账号需重新选择初始伙伴；不会后台批量删除数据库，创建新游戏时才写入新存档。

### 设计原则速览（冻结设计）
- 朋友共同探索，不做商业 MMO
- PVE/PVP 均同时上场（3vN，野外遇敌 1~3 只）
- 随身携带 20 只，暂无仓库（未来保留）；PVE/PVP 各一套 3 只阵容 + 自由摆位阵型
- 战斗结束自动回满状态
- 捕获 100% 成功；满员时无法捕捉需先放生
- 无排行榜、无世界 Boss、无每日签到、无体力、无 VIP
- 炼妖随机继承主/副宠种族，不产生融合种族
- 主动技能独立 CD，无 MP/PP
- 性格决定 AI 行为
- 前端计算，后端存档
- 关系型数据库（Cloudflare D1）

---

## 📜 脚本一览

| 命令 | 说明 |
|---|---|
| `npm run dev` | 同时启动前端(Vite)与后端(wrangler dev) |
| `npm run dev:web` | 仅启动前端 |
| `npm run dev:worker` | 仅启动 Worker |
| `npm run build` | 构建前端到 `apps/web/dist` |
| `npm run typecheck` | vue-tsc + tsc 类型检查 |
| `npm run smoke` | 引擎、城镇／塔连通性、全图鉴遇敌与战斗配置冒烟测试 |
| `npm run progress:browser` | 使用隔离的内存 API 验收存档读取、失败重试、新游戏与安全退出，不访问真实账号 |
| `npm run visuals:browser` | 城镇＋五层塔截图、场景生命周期和隔离的真实游戏往返验收 |
| `npm run visuals:report` | 世界预算、配置基线与技能视觉配方检查 |
| `npm run visuals:battle` | 无存档战斗沙盒的真实浏览器生命周期、窄屏与持续运行验收 |
| `npm run db:apply` | 本地 D1 建表 |
| `npm run db:apply:remote` | 远程 D1 建表 |
| `npm run deploy` | 构建 + `wrangler deploy` |
| `npm run assets:download` | 下载宝可梦素材 |
| `bash scripts/setup.sh` | 一键本地环境 |
| `bash scripts/deploy.sh` | 一键 Cloudflare 部署 |

战斗专项验收会自动启动本地 Vite（端口 `41775`）和独立无头 Chrome，不启动 Worker、不登录、不读写玩家存档。默认使用 Windows 标准安装位置的 Chrome；其他位置可通过环境变量 `PO_VISUAL_BROWSER` 指定可执行文件。

覆盖资源加载中退出、6 轮 3v3 进入/重开/退出、5 种环境连续切换、60 秒持续采样与 390px 窄屏布局，并采集喷射火焰、暗影球的分段动作截图。独立的确定性场景检查普通命中及致命一击的血量、存活状态和画面衔接，不接入正式页面或玩家存档。截图及 JSON 报告输出到 Git 忽略的 `doc/visual-baselines/battle/`。此项使用 SwiftShader 软件渲染，只作为功能与资源生命周期回归，不等于真实显卡性能、长时间压力测试或真实显卡性能验收。

---

脚本按用途保留：开发／部署、资源生成、数值报告、战斗与世界验收。战斗专项 `*-smoke.ts` 由 `npm run smoke` 统一调用，`*-fixture.ts` 为验收数据，不是独立命令。旧剧情流程脚本、旧瓦片下载器和失效的 `db:seed` 命令已删除。`run.mjs` 统一转发参数，并在运行结束（含失败）时清理临时打包文件。

世界浏览器验收会自动构建并预览发布产物，使用独立浏览器与内存 API 模拟，不读写真实存档；`--update` 更新截图候选，确认画面后再运行默认命令比对。

进度可靠性回归已纳入 `smoke`：保存快照按顺序写入，手动保存合并待写任务；神奇糖果复用正常升级流程，满级不消耗糖果；进化登记图鉴但不增加捕捉次数；经验按本场实际参战个体发放。`progress:browser` 在正式页面模拟读取失败、首次保存失败、断网重试和退出期间的新修改，报告与截图输出到 `doc/visual-baselines/progress/`。保存失败时进度保留在当前页面，可重试；关闭或刷新仍有未保存进度的页面会触发浏览器离开提示，此机制不提供离线存档。

## 🔧 配置、战斗美术与扩展

游戏内容的权威数据位于 `packages/config/src/`：新增内容遵循**配置优先**，先扩展静态数据契约，再考虑通用引擎/renderer 能力，禁止把物种、技能或资源路径散落硬编码到组件中。

- `pokemon.ts` — 151 只宝可梦原始数据（种族/属性/特性/进化），learnset 与被动池由类型池自动生成
- `skills.ts` — 主动技能的数值、独立 CD、目标、射程、`castTime` 与玩法效果
- `passive-skills.ts` / `abilities.ts` — 梦幻式被动技能与宝可梦特性
- `skill-visuals.ts` / `visuals.ts` / `battle-environments.ts` — 技能通用视觉配方、世界/战斗环境与视觉预算
- `personalities.ts` — 性格（影响 AI）
- `maps.ts` — 城镇、训练塔与全图鉴分层遇敌表
- `type-chart.ts` — 属性相克表
- `items.ts` / `exp.ts` — 道具与经验曲线

### 战斗美术的配置规则

Pixi 战斗角色、序列帧 clip、挂点、调色主题、技能特效、被动/特性/状态特效、环境反应、资源 manifest 和品质预算都必须配置化，并由通用 resolver 组合：

- **一个技能只有一份玩法与通用视觉定义。** 修改技能数据后，所有学习该技能的宝可梦自动生效。
- **同一技能可因角色配置而有不同表现。** 颜色、发射挂点、序列帧动作片段、特效变体和皮肤差异使用 art profile/theme/override 配置表达，不复制技能，也不在 Pixi/Vue 中按物种或技能 ID 写分支。
- `castTime` 是玩法权威前摇；攻击前摇、后摇、施放、吟唱/蓄力、持续施法、命中与受击等流畅性表现由 presentation + 动作配置驱动，不改变 engine 的结算事实。
- `BattleArtProfile.motionTracks` 可为动作声明从 `at: 0` 到 `at: 1` 的姿态关键帧，未填字段继承该动作的基础姿态。当前仅喷火龙、耿鬼启用，分别强调前压回收与悬浮施法；通用采样器不识别物种或技能 ID。序列帧沿用既有 manifest，不新增图片资源。
- `flame-stream` 使用单四边形 WebGL 着色器，通过流动噪声生成连续火焰、扰动边缘与明暗热芯，不堆叠椭圆粒子；`shadow-orb` 使用暗色核心、紫色弧光和收缩命中。两者保留原有特效生命周期与减少闪烁设置；通用投射物兜底不会覆盖专用造型。技能配方统一配置，未增加图片资源或改变战斗结算。
- 发射挂点由技能施放配置传到 VFX 计划，再按角色姿态、朝向、悬浮和投影缩放解析；投射物固定发射瞬间的位置，持续光束/火焰跟随实时挂点。坐标在舞台平面解析，避免重复叠加镜头变换，不改变 engine 的命中判定。
- 同次提交、同一时刻的发射与命中事件由 director 配对，受击、命中特效与环境反馈按共享飞行时序播放；暴击强度不会缩短弹体飞行。靶场复用该时序，并对整组动作、镜头和特效统一错开连播。
- engine 的伤害、治疗与倒下事件附带只读的结算后血量记录。表现桥在命中帧同时发布记录与反馈，HUD/角色不提前显示扣血或倒下；同一目标按事实顺序播放，不用伤害值反推血量。视觉计时独立于战斗倍速，结算界面等待待播结果与角色演出结束。实际伤害、死亡时机及战斗胜负不变。
- 异常状态与施法中断复用同一结果队列：按技能来源对齐状态、图标与中断提示，按权威快照恢复，不从特效颜色推断状态。中断使用结构化标记，不匹配中文日志；蓄力仅保留随 `castProgress` 清除的角色光效，已发射动作不被撤回。浏览器确定性场景覆盖蓄力、催眠命中、中断及恢复，控制时长与可打断规则不变。
- 当前世界与战斗正式运行于 Pixi GPU。
- 密集战斗中，脚步、环境反应与范围光圈位于角色下方，发射与命中反馈保留前景；同一特效池负责两层的计时、减少闪烁和释放。范围展开按唯一有效目标分发，地面光圈使用脚下挂点，群体展开亮度由统一配置约束，链状技能仍保持一条连续路径；不更改玩法站位与命中范围。
- 多人镜头由现有控制器按优先级统一处理，同帧同级请求合并焦点，短暂保持避免连续抢焦；焦点跟随实时表现位置，到期自动回归全景。缩放围绕构图中心，与角色和特效共用命中定格时钟，回归结束后才算表现收尾完成。参数集中在 `BATTLE_CAMERA_MOTION`，跨层共用 `BattleCameraPlan` 契约，不改变战斗规则。
- 普通受击不再覆盖攻击、蓄力、持续施法或收招：复用角色视图叠加短促后挫，同一反应期间的连续命中不重置计时、不堆叠队列。真正的施法中断仍由结构化事件控制，倒下后忽略迟到动作。幅度与时长集中在 `BATTLE_HIT_REACTION`，不增加闪光、飘字或改变玩法硬直。
- 经确认的引擎空间规则：选格检查从当前平滑坐标到目标格的整段路径，避开其他存活单位尚未走完的路径。`battle-movement.ts` 统一声明半格移动安全间隔与 2 格同队停靠间距；敌我仍可进入相邻格近战，倒下立即释放阻挡。接敌使用有界网格搜索找到射程内的可达位置，每次只走一步并复用原有速度与路径占用校验，避免队友挡路时反复横移；撤退和战术掩护保留局部选格。自由起始阵型不重写，拥挤阵型在移动时允许逐步拉开，不为美观强制挪动射程内的角色。此规则会影响接敌时间、路径及胜负，但不修改技能射程、伤害、速度参数、投影或模型大小，也不保证大幅角色贴图完全无遮挡。回归覆盖 27 组固定战斗、9 组纯近战/拥挤阵型及真实浏览器开场与中段截图。

**新增世代/地图示例**：在 `pokemon.ts` 的 `RAW` 数组追加新条目，在 `maps.ts` 加新地图与遇敌表；新增序列帧资产或特效时同步添加 art config、资源 manifest、引用校验与回归基线，而不是修改角色绑定代码。

战斗投影采用配置化的 50° 俯视角，各环境的镜头高度约束场地范围，草地构图额外对齐位图空地的远端。中央前后排有更多纵深空间，角色资产尺寸、挂点解析、镜头演出与引擎坐标不变；不新增品质选项或按物种修正位置。验收覆盖五种环境全部可用格的投影边界、前后排序及真实浏览器边缘/密集站位截图。此调整缓解前后遮挡，不保证贴身战斗完全无遮挡。

### 开发规则文档

- `PROJECT_RULES.md` — 冻结设计、技术边界与 AI 开发最高规则


---

## 🛡️ 安全说明

- 密码使用 PBKDF2-SHA256（10 万次迭代 + 随机盐）哈希存储，绝不存明文。
- 会话令牌为 32 字节随机数，存于 `players.token`，前端以 `Authorization: Bearer` 携带。
- 本作为朋友游戏，战斗/炼妖在前端计算，不设反作弊；如需竞技公平可后续将关键计算迁至 Worker。

---

## 🙏 致谢

- 宝可梦素材来自 [PokeAPI Sprites](https://github.com/PokeAPI/sprites)
- 灵感源自《神奇宝贝》第一部动画与《梦幻西游》炼妖系统
- 本项目为**非商业同人作品**，宝可梦版权归任天堂/Game Freak/The Pokémon Company 所有

## 📄 许可

代码部分采用 MIT 许可（见 `LICENSE`）。素材版权归原作者所有，仅用于非商业用途。

---

*"这是我和朋友一起培养出来的第一只喷火龙。"* —— 项目的最终目标。
