# Pokémon Online

朋友一起探索、收集、培养宝可梦的非商业同人项目。开发前先读 [PROJECT_RULES.md](PROJECT_RULES.md)，美术以 [当前美术规范](doc/当前美术规范.md) 为准，测试以 [开发与验收](doc/开发与验收.md) 为准。

## 当前版本

- 仅桌面端，全窗口布局，统一一套视觉和镜头标准。
- 地图范围：雾湾镇和五层幻境之塔；塔层等级为 5–10、12–18、20–28、30–40、45–55，合计覆盖初代 151 种。
- 美术：PMDCollab 原生像素动作，像素 2.5D 世界和战斗场景，所有特效采用相同像素风。
- 世界和战斗统一使用 Pixi；角色、资源、动作、挂点、技能表现和预算配置化。
- 全自动实时 3vN 战斗：野外 1–3 只，PVP 3v3。支持暂停、1/2/3 倍速和跳过。
- 战斗按角色作战距离持续进攻：近战预约接敌位置，远程保距压制；喷射、光束、爆发与周身范围按实际覆盖结算，像素蓄力范围与固定发射方向对应。
- 取消通用普攻：每种宝可梦固定一个基础招式，另有最多四个战术招式；基础可为攻击或友方治疗。速度显著缩短基础冷却、较温和地缩短其它冷却，同时保留完整动作与收招。
- 队伍协作：治疗结合有效缺血与承压分工，前排就近反制后排身边的威胁，输出利用可赶上的控制窗口；支援者保留远程进攻手段。
- 范围避让：观察敌方公开蓄力，结合性格、血量和剩余时间进行最多两步的短移；遵守碰撞、动作占用与远程距离，以实际脚点判定是否躲开。
- 随身最多 20 只，PVE/PVP 各一套 3 只阵容及自由起始摆位。
- 战后自动回满，捕获成功率 100%；可选捕捉一只或全部放生，满员时不能捕捉。
- 培养包含资质、成长、性格、主动技能、被动、特性、进化和炼妖。进化保留被动并补齐必带，替换主动技能；炼妖规则见冻结设计。
- 前端决定战斗事实，后端只负责账号与存档。存档版本 v6，不迁移旧版本数据。

## 开发入口

| 目录 | 职责 |
|---|---|
| `packages/config` | 物种、技能、地图、PMD 资源、动作与全部静态表现配置 |
| `packages/engine` | 战斗 AI、移动、碰撞、伤害、培养与遇敌 |
| `packages/presentation` | 快照、动作 cue、命中及结果演出时序 |
| `packages/renderer-pixi` | 像素角色、2.5D 场景、镜头、特效及资源释放 |
| `packages/shared` | 类型与契约 |
| `apps/web` | Vue 页面、交互与状态管理 |
| `apps/worker` | Cloudflare Worker 账号、存档及切磋 API |
| `apps/web/public/sprites/pmd-v1` | 当前正式角色图集、图标、元数据和署名，纳入 Git |
| `scripts` | 开发、部署、PMD 重建及现行回归检查 |

战斗链路：`BattleSim → presentation → renderer DTO → Pixi`。renderer 不重算玩法，不通过修改显示位置掩盖引擎空间问题。

## 本地运行

需要 Node.js ≥18 与 npm。正式素材已在仓库中，正常安装不用下载。

```bash
npm install
npm run db:apply
npm run assets:check
npm run dev
```

也可执行 `bash scripts/setup.sh` 初始化。前端为 `http://localhost:5173`，Worker 为 `http://localhost:8787`；Vite 将 `/api` 代理到 Worker。首次 D1 初始化失败时先执行 `npm run dev:worker`，然后重试 `npm run db:apply`。

注册并选择伙伴后，用 WASD/方向键探索，从雾湾镇塔门进入幻境之塔。队伍、炼妖、图鉴和好友切磋从菜单进入；地图和战斗只围绕当前版本范围扩展。

## 常用命令

| 命令 | 用途 |
|---|---|
| `npm run dev:web` / `npm run dev:worker` | 单独启动前端或 API |
| `npm run typecheck` / `npm run smoke` | 类型与行为回归 |
| `npm run build` | 发布构建到 `apps/web/dist` |
| `npm run assets:check` | 当前发布素材、引用和署名审计 |
| `npm run assets:rebuild` | 从固定 PMD 来源重建，要求 Python + Pillow |
| `npm run visuals:report` | 世界场景配置与预算检查 |
| `npm run visuals:battle` | 分批完整战斗回归 |
| `npm run playable:browser` | 正式界面和交互回归 |
| `npm run progress:browser` | 保存与恢复回归 |
| `npm run balance` / `npm run tactics` | 数值与 AI 行为报告 |

检查和构建自动排队，Windows 使用低优先级、最多 2 个逻辑核心。浏览器批次结束后关闭实例并休息 3 秒；不要额外并发运行重检查。各专项、桌面尺寸及验收要求见 [开发与验收](doc/开发与验收.md)。

PMD 原始缓存位于忽略目录 `art-source/pmd-source-v1`，截图与报告位于忽略目录 `doc/visual-baselines`。缓存和报告可删除，正式素材与署名必须保留。工作树不保存旧画风候选、制作试验或失效计划；历史按需查 Git。

## 部署

```bash
npx wrangler login
bash scripts/deploy.sh
# Windows PowerShell：pwsh scripts/deploy.ps1
```

部署脚本负责 D1 配置、远程建表、构建和 Worker 部署。手动部署可执行 `npm run db:apply:remote`、`npm run build`、`npx wrangler deploy`；数据库绑定配置在 `wrangler.toml`。本地提交不会自动推送或部署。

## 来源与许可

角色素材来自 [PMDCollab/SpriteCollab](https://github.com/PMDCollab/SpriteCollab)，固定版本与导入细节见当前美术规范。逐角色署名、上游许可证和贡献者名单随正式素材保留；界面精灵球的独立来源见 [图标署名](apps/web/public/sprites/icons/CREDITS.md)。

代码许可见 [LICENSE](LICENSE)。Pokémon 相关形象与知识产权仍归 Nintendo、Creatures、GAME FREAK 等相应权利方；素材适用各自来源条款，不因本项目代码许可而改变。
