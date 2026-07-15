# WorldStage 浏览器视觉基线

本目录保存 `WorldStage` sandbox 的人工审核 PNG 基线。矩阵为六张 sandbox Scene Pack（其中五张受控 GPU 世界地图，加上尚未批准正式 GPU 的迷雾林境）× `cinematic` / `standard` / `compatibility` 三档质量。

- 生成 / 比对：`npm run visuals:browser`
- 有意调整 Scene Pack 的视觉构成后：`npm run visuals:browser -- --update`
- 测试使用本机 Chrome + `playwright-core`，固定 1280×800 viewport，并启用 `?visual-regression=1`：仅对两个独立 sandbox 路由放行，不绕过任何可玩世界或存档页面的认证。
- visual-regression 模式关闭 WorldStage 动画，以使程序化粒子和角色姿势截图可复现。
- `artifacts/` 是临时 diff / actual 输出，已忽略；根目录 PNG 与 `manifest.json` 是受审查、版本化基线。

首轮人工审核基线由 `scripts/visual-browser-report.ts` 创建；同一 harness 还会执行三轮 World → battle sandbox → World 的 lifecycle diagnostics 与强制 GC 堆观测。任何 Scene Pack、质量档位或 WorldStage 绘制变化都必须重新生成、人工审核，再用 `--update` 写入基线。
