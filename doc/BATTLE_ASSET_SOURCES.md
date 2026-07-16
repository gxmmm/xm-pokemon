# 战斗资产来源与 B-3 导入记录

**状态：** #006 的 v4 已通过基础模型验收：使用项目已下载 PokeAPI 静态 sprite 的无损序列帧封装；v1、v2、v3 保留为未验收历史候选。

## 已确认的决策

首个真实角色美术垂直切片仍是喷火龙 #006（`showcase:flame-wing`）。目标形式为高质量、保留像素可读性的**二维 PNG 序列帧加 JSON 元数据**，分别提供前视与后视资源。此处的内容是导入与生产契约，不表示资产已经产出。

开发者指出 v1、v2、v3 的纯代码重绘均不符合喷火龙的可辨识质量要求，要求按项目已下载、已记录来源的静态喷火龙复刻。v1、v2、v3 均继续保留为未验收历史候选；v4 的来源记录为 `pokemon-online-pokeapi-derived-flame-wing-v4`，生成脚本为 `scripts/generate-flame-wing-v4-sequence.py`。v4 将 `apps/web/public/sprites/pokemon/6.png` 与 `apps/web/public/sprites/pokemon/back/6.png` 逐像素复制为各 clip 帧，不重绘、不缩放、不修饰原图；#006 profile 当前通过 `BATTLE_ASSET_MANIFEST` 引用 v4 前/后资源，专供 `/battle-sandbox` 审核，同时继续保留通用程序 fallback。

## 当前资产来源与权利记录

| 来源 ID | 适用范围 | 来源 / 证据 | 许可证、署名与边界 |
| --- | --- | --- | --- |
| `pokeapi-sprites` | 现有 151 只前/后视静态 sprite | <https://github.com/PokeAPI/sprites> | 适用上游仓库条款与 Pokémon 相关 IP 权利。`README.md` 中“Sprites © PokeAPI”的署名继续有效；项目仅作非商业同人使用。 |
| `procedural-fallback` | `battle:fallback-shape` | 项目内部 Pixi renderer 源码 | 项目代码采用 MIT 许可；运行时生成的几何 fallback 不导入角色图片。 |
| `pokemon-online-code-authored-flame-wing-v1` | #006 v1 前/后视序列图与 JSON 元数据 | `scripts/generate-flame-wing-sequence.py` | 未验收历史候选，保留用于对照；项目自制的程序化像素资产，适用项目代码的 MIT 许可。 |
| `pokemon-online-code-authored-flame-wing-v2` | #006 v2 前/后视序列图与 JSON 元数据 | `scripts/generate-flame-wing-v2-sequence.py` | 未验收历史候选；头部、翼部和手臂层级反馈不通过，保留用于对照。 |
| `pokemon-online-code-authored-flame-wing-v3` | #006 v3 前/后视序列图与 JSON 元数据 | `scripts/generate-flame-wing-v3-sequence.py` | 未验收历史候选；纯代码头部/翅膀/手臂修订仍未达到模型可辨识要求，保留用于对照。 |
| `pokemon-online-pokeapi-derived-flame-wing-v4` | #006 v4 前/后视序列图与 JSON 元数据 | <https://github.com/PokeAPI/sprites> + `scripts/generate-flame-wing-v4-sequence.py` | 当前审核候选。以项目已下载且已记录来源的 #006 前/后视 PokeAPI sprite 逐像素复制为序列帧，不修改角色轮廓；适用上游条款与 Pokémon IP 权利，项目仅作非商业同人使用。 |

机器可读的对应配置位于 `packages/config/src/battle-art.ts`：`BATTLE_ASSET_SOURCES` 与 `BattleAssetManifestEntry.sourceId`。校验会拒绝缺少来源记录、许可证证据或署名字段的条目。

## 当前审核中的无损静态 sprite 序列帧规格：#006 `showcase:flame-wing` v4

| 项目 | 固定值 |
| --- | --- |
| 交付形式 | 前/后视 PNG sprite sheet / 序列帧，加 JSON 元数据 |
| 单帧画布 | 256 × 256 像素 |
| 播放规则 | 12 fps；`charge` 和 `channel` 可循环，其余 clip 应自然结束 |
| 必需 clip | `idle`、`attack`、`cast`、`charge`、`channel`、`hit`、`faint` |
| 补间过渡 | `idle → attack` 120ms、`attack → idle` 160ms、`idle → cast` 140ms、`cast → idle` 160ms、`idle → charge` 180ms、`charge → channel` 120ms、`channel → idle` 180ms、`idle → hit` 70ms、`hit → idle` 140ms；统一使用 `cubic-in-out` 缓动 |
| 背景流程 | 脚本直接生成透明 PNG alpha，不使用 chroma key；不得有场景、地面、标签、UI、投影或演员阴影 |
| 风格边界 | 由项目代码定义的原创、像素可读二维火龙轮廓；不得拷贝任何 Pokémon 游戏或动画的帧、截图、专有 sprite sheet 或官方画稿 |
| 正式运行时边界 | manifest 独占位图/元数据 URL，profile 只保存 ID，通用 Pixi 运行时消费 clip；不得新增 #006 / species / skill / 路径分支 |

**无损序列帧封装版本 `pokeapi-derived-flame-wing-v4-lossless-frame-wrapper`：**

`generate-flame-wing-v4-sequence.py` 读取项目已下载的 96×96 PokeAPI #006 前/后视静态 sprite，并将其逐像素复制为 29 个 clip 帧（4 `idle`、5 `attack`、4 `cast`、4 `charge`、4 `channel`、3 `hit`、5 `faint`）。脚本不重绘、不缩放、不填色、不做局部修饰；因此每个输出帧都与相应静态原图完全一致。动作感由现有通用 `BattleArtProfile.motionPoses`、Pixi `cubic-in-out` 补间和 aura/halo 层提供。

每次重新生成文件后都必须在本文件补充真实文件路径、输出 SHA-256、生成日期、脚本版本、参数变更和审核结论。

## 已接入资产的再生成与验收流程

1. 执行 `python scripts/generate-flame-wing-v4-sequence.py`，保留脚本版本与生成输出。
2. 检查前/后视 contact sheet：轮廓、翅膀、尾焰、受击和倒下姿态都必须可读，且不存在文字、UI 或场景背景。
3. 记录下列输出的 SHA-256，并复核 JSON 的 29 帧布局、clip 名称、循环属性和补间表。
4. 只允许 `BATTLE_ASSET_MANIFEST` 保存 PNG/JSON 公开路径；#006 `BattleArtProfile` 只引用 asset ID，并保留 `battle:fallback-shape`。
5. `sprite-sheet`、JSON 元数据或任一 clip 加载失败时，统一退回 Pixi 的通用 fallback；不得回接 Canvas。
6. 执行配置校验、smoke、typecheck、web build、diff-check 和浏览器人工验收。不得在 renderer、Vue 或 cue adapter 添加 species、skill 或路径分支。

Canvas 源码仅作归档与回归用途，必须保留但不得挂载；它既不是资产导入路径，也不能成为 GPU 的 fallback。


## 当前已生成文件与校验和（2026 年 7 月 16 日）

| 文件 | SHA-256 | 说明 |
| --- | --- | --- |
| `apps/web/public/sprites/battle/flame-wing-v4/front-sheet.png` | `16171736c25efb31797b0d5f8334dd37ddbd5c1e9c66bbeb40310c04b741e5c0` | 前视序列图，29 帧，8 列布局。 |
| `apps/web/public/sprites/battle/flame-wing-v4/back-sheet.png` | `f665fd1ffe310a156c5e2edfa05541ef14ceea0f1f762499fdf6cc643dcfdc88` | 后视序列图，29 帧，8 列布局。 |
| `apps/web/public/sprites/battle/flame-wing-v4/front-sheet.json` | 由 smoke 读取校验 | 前视 clip、帧率和补间元数据。 |
| `apps/web/public/sprites/battle/flame-wing-v4/back-sheet.json` | 由 smoke 读取校验 | 后视 clip、帧率和补间元数据。 |

**审核结论：** v1、v2、v3 的纯代码重绘均未达到可接受角色模型质量，保留但不作为当前审核对象。v4 复用项目已经下载并记录来源的 PokeAPI #006 静态 sprite 作为无损序列帧基底；前/后视 PNG、JSON 元数据、manifest/profile 引用和通用 Pixi 播放器均已接入，基础造型已获开发者验收通过；后续代表模型优先采用“已记录来源的静态基底 + 通用 Pixi 姿态/补间”的路径。
