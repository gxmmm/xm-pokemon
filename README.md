# Pokémon Online

> 一个让朋友一起旅行、一起发现、一起培养宝可梦的世界。
> A friend-co-op Pokémon raising game. Not a commercial MMO — no leaderboards, no stamina, no daily check-ins.

本项目所有开发由 AI 与开发者协同完成，遵循 **Design First（设计优先）** 原则。前端负责战斗、AI、炼妖等全部计算，Cloudflare Workers + D1 仅作为存档与认证服务器。

Sprites © [PokeAPI](https://github.com/PokeAPI/sprites) — 本项目为非商业同人作品，不用于商业用途。

宝可梦相关角色、名称、设计、商标及其他 IP 仍属于 Nintendo / Creatures Inc. / GAME FREAK inc. / The Pokémon Company 等相应权利方。

---

## ✨ 特性

- **探索优先**：原创主线从雾湾镇、萤火林道、星陨观测所、静潮群岛一路延伸至深空遗址；生态化遇敌（草丛/昼夜/权重）与隐藏地图共同构成可探索世界。
- **开发训练塔**：雾湾镇设有可开关的「幻境之塔」沙盒设施，五层分别提供 Lv.5–10、12–18、20–28、30–40、45–55 的野生遭遇，用于快速体验战斗、捕捉与炼妖循环。
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
│   ├── config/          # 全部静态配置（151宝可梦/技能/特性/性格/地图/剧情/道具/经验曲线/属性相克）
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
2. **探索与主线**：在「探索」页用方向键/WASD/按钮移动，走进草丛或洞穴、水域自然地面触发野生遇敌。跟随主线从雾湾镇出发，依次探索萤火林道、星陨观测所、静潮群岛与深空遗址；通过门、洞口、码头和剧情裂隙进入相邻区域。
3. **战斗**：全自动实时演算，可调速（1x/2x/3x）、暂停、跳过。**PVE/PVP 均同时上场**（3vN，野外 1~3 只）。击败后可**捕捉其中一只**或全部放生，战斗结束自动回满状态。
4. **培养**：宝可梦获得经验升级、学会新技能、可能进化（详情页可手动触发进化，伊布可三选一）。
5. **阵容**：在「队伍」页设置 PVE/PVP 两套阵容各 3 只 + 自由摆位阵型，随身最多携带 20 只。
6. **炼妖**：在「炼妖」页选两只宝可梦炼妖，产出新个体——赌资质、继承被动、拼极品。
7. **幻境之塔（开发沙盒）**：雾湾镇研究所西侧可进入五层训练塔。每层有固定等级区间的野生宝可梦，适合反复测试战斗、补充图鉴、捕捉个体与炼妖；它不参与主线难度平衡。
8. **切磋**：在「切磋」页用 PVP 阵容输入好友用户名挑战其存档队伍（AI 对战 AI）。
9. **图鉴**：收集 151 只，放生也保留记录。
10. **商店**：用金币购买精灵球、经验糖果等（战斗自动回满，无需伤药）。

### 📖 当前原创主线章节

| 章节 | 区域 | 主题与关键玩法 |
|---|---|---|
| 第一章 | 雾湾镇 → 萤火林道 | 潮汐信号、初始伙伴、劲敌切磋、潮光孢子与异相核 |
| 第二章 | 赤砾峡谷 → 星陨观测所 | 坠星刻痕、星图试炼、观星镜校准与范围技能教学战 |
| 第三章 | 静潮群岛 → 潮洞 | 潮位仪、低潮礁盘、沉船航海日志、深潮锚印 |
| 第四章 | 深空遗址 | 失重晶簇解谜、古代终端、裂隙守卫战与幻兽相关回响 |

### 🗼 幻境之塔：开发与测试设施

- **位置**：雾湾镇研究所西侧的塔门；世界地图上以 `🗼` 节点显示。
- **楼层与等级**：一层 Lv.5–10、二层 Lv.12–18、三层 Lv.20–28、四层 Lv.30–40、五层 Lv.45–55。
- **用途**：各层启用 `encounterFloor`，自然地面即可触发野生遭遇，便于战斗演示、捕捉、图鉴补充与炼妖测试。
- **平衡定位**：这是开发期的开放沙盒，不按主线进度或经济节奏限制；正式剧情游玩时可隐藏。
- **正式版隐藏方式**：在 `packages/config/src/maps.ts` 将 `ILLUSION_TOWER_ENABLED` 从 `true` 改为 `false`。入口、塔层地图和世界地图节点会同时移除，不涉及存档迁移。

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
| `npm run smoke` | 引擎、原创主线、潮位、深空遗址与幻境之塔配置冒烟测试 |
| `npm run db:apply` | 本地 D1 建表 |
| `npm run db:apply:remote` | 远程 D1 建表 |
| `npm run deploy` | 构建 + `wrangler deploy` |
| `npm run assets:download` | 下载宝可梦素材 |
| `bash scripts/setup.sh` | 一键本地环境 |
| `bash scripts/deploy.sh` | 一键 Cloudflare 部署 |

---

## 🔧 配置、战斗美术与扩展

游戏内容的权威数据位于 `packages/config/src/`：新增内容遵循**配置优先**，先扩展静态数据契约，再考虑通用引擎/renderer 能力，禁止把物种、技能或资源路径散落硬编码到组件中。

- `pokemon.ts` — 151 只宝可梦原始数据（种族/属性/特性/进化），learnset 与被动池由类型池自动生成
- `skills.ts` — 主动技能的数值、独立 CD、目标、射程、`castTime` 与玩法效果
- `passive-skills.ts` / `abilities.ts` — 梦幻式被动技能与宝可梦特性
- `skill-visuals.ts` / `visuals.ts` / `battle-environments.ts` — 技能通用视觉配方、世界/战斗环境与视觉预算
- `personalities.ts` — 性格（影响 AI）
- `maps.ts` — 地图、生态遇敌表与开发沙盒开关（`ILLUSION_TOWER_ENABLED`）
- `story.ts` — 原创主线章节、剧情 NPC/物件、任务推进、剧情战配置
- `type-chart.ts` — 属性相克表
- `items.ts` / `exp.ts` — 道具与经验曲线

### 战斗美术的配置规则

Pixi 战斗角色、序列帧 clip、挂点、调色主题、技能特效、被动/特性/状态特效、环境反应、资源 manifest 和品质预算都必须配置化，并由通用 resolver 组合：

- **一个技能只有一份玩法与通用视觉定义。** 修改技能数据后，所有学习该技能的宝可梦自动生效。
- **同一技能可因角色配置而有不同表现。** 颜色、发射挂点、序列帧动作片段、特效变体和皮肤差异使用 art profile/theme/override 配置表达，不复制技能，也不在 Pixi/Vue 中按物种或技能 ID 写分支。
- `castTime` 是玩法权威前摇；攻击前摇、后摇、施放、吟唱/蓄力、持续施法、命中与受击等流畅性表现由 presentation + 动作配置驱动，不改变 engine 的结算事实。
- 当前世界与战斗正式运行于 Pixi GPU。

**新增世代/地图示例**：在 `pokemon.ts` 的 `RAW` 数组追加新条目，在 `maps.ts` 加新地图与遇敌表；新增序列帧资产或特效时同步添加 art config、资源 manifest、引用校验与回归基线，而不是修改角色绑定代码。

### 当前交接文档

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
