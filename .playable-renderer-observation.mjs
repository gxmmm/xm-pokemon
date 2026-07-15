// scripts/playable-renderer-observation.ts
import { chromium } from "playwright-core";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { getMap, isWalkable } from "@pokemon-online/config";
var ROOT = process.cwd();
var WEB_PORT = 41774;
var WORKER_PORT = 8787;
var BASE_URL = `http://127.0.0.1:${WEB_PORT}`;
var ARTIFACT_DIR = resolve(ROOT, "doc/visual-baselines/artifacts");
var REPORT_PATH = resolve(ARTIFACT_DIR, "playable-runtime-observation.json");
var CHROME_PATH = process.env.PO_VISUAL_BROWSER ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
var CYCLES = 3;
function assert(condition, message) {
  if (!condition)
    throw new Error(message);
}
function start(command, args) {
  return spawn(command, args, { cwd: ROOT, stdio: "pipe", windowsHide: true });
}
async function stop(process2) {
  if (!process2 || process2.exitCode !== null)
    return;
  process2.kill();
  await new Promise((resolve2) => setTimeout(resolve2, 300));
  if (process2.exitCode === null)
    process2.kill("SIGKILL");
}
async function waitFor(url, process2, label) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 45e3) {
    if (process2.exitCode !== null)
      throw new Error(`${label} exited early (${process2.exitCode})`);
    try {
      const response = await fetch(url);
      if (response.ok)
        return;
    } catch {
    }
    await new Promise((resolve2) => setTimeout(resolve2, 150));
  }
  throw new Error(`Timed out waiting for ${label}`);
}
async function press(page, key, count = 1) {
  for (let index = 0; index < count; index++) {
    const handled = await page.evaluate((pressedKey) => {
      const down = new KeyboardEvent("keydown", { key: pressedKey, bubbles: true, cancelable: true });
      window.dispatchEvent(down);
      window.dispatchEvent(new KeyboardEvent("keyup", { key: pressedKey, bubbles: true, cancelable: true }));
      return down.defaultPrevented;
    }, key);
    if (!handled)
      throw new Error(`world key handler did not consume ${key}`);
    await page.waitForTimeout(220);
  }
}
async function worldState(page) {
  return page.evaluate(() => ({ heading: document.querySelector(".world h2")?.textContent?.trim() ?? "", renderer: document.querySelector(".pixi-world-viewport") ? "pixi" : "canvas", dialogOpen: !!document.querySelector(".dialog-layer"), hint: document.querySelector(".interact-hint")?.textContent?.trim() ?? "", dialogText: document.querySelector(".dialog-layer")?.textContent?.trim().slice(0, 240) ?? "" }));
}
async function requireWorld(page, expectedHeading, label) {
  const state = await worldState(page);
  if (state.heading !== expectedHeading)
    throw new Error(`${label}: expected ${expectedHeading}, got ${JSON.stringify(state)}; url=${page.url()}; body=${(await page.locator("body").innerText()).slice(0, 1400)}`);
}
async function worldBehavior(page) {
  const diagnostics = await page.evaluate(() => window.__PO_WORLD_BEHAVIOR_DIAGNOSTICS__?.());
  if (!diagnostics)
    throw new Error(`missing WorldView behavior diagnostics; state=${JSON.stringify(await worldState(page))}`);
  return diagnostics;
}
var DIRECTIONS = [{ key: "ArrowUp", dx: 0, dy: -1 }, { key: "ArrowDown", dx: 0, dy: 1 }, { key: "ArrowLeft", dx: -1, dy: 0 }, { key: "ArrowRight", dx: 1, dy: 0 }];
function pathTo(mapId, start2, target) {
  const map = getMap(mapId);
  const pending = [{ ...start2, path: [] }];
  const seen = /* @__PURE__ */ new Set([`${start2.x},${start2.y}`]);
  while (pending.length) {
    const current = pending.shift();
    if (current.x === target.x && current.y === target.y)
      return current.path;
    for (const direction of DIRECTIONS) {
      const x = current.x + direction.dx;
      const y = current.y + direction.dy;
      const key = `${x},${y}`;
      if (x < 0 || y < 0 || x >= map.width || y >= map.height || seen.has(key) || !isWalkable(map.tiles[y][x]))
        continue;
      seen.add(key);
      pending.push({ x, y, path: [...current.path, direction] });
    }
  }
  throw new Error(`no static-map path for ${mapId}: ${start2.x},${start2.y} -> ${target.x},${target.y}`);
}
async function resolveWildEncounter(page, mapId) {
  for (let retry = 0; retry < 8 && await page.locator(".battle").count() === 0; retry++)
    await page.waitForTimeout(90);
  if (await page.locator(".battle").count() === 0)
    return;
  await page.getByRole("button", { name: "\u23ED" }).click();
  const outcome = page.locator(".modal button").filter({ hasText: /全部放生|返回/ }).first();
  await outcome.waitFor({ timeout: 2e4 });
  await outcome.click();
  await page.getByRole("heading", { name: getMap(mapId).name }).waitFor({ timeout: 1e4 });
  await page.waitForTimeout(180);
}
async function moveTo(page, mapId, target) {
  for (let remaining = 0; remaining < 96; remaining++) {
    const state = await worldBehavior(page);
    assert(state.mapId === mapId, `moveTo expected ${mapId}, got ${JSON.stringify(state)}`);
    if (state.position.x === target.x && state.position.y === target.y)
      return;
    const direction = pathTo(mapId, state.position, target)[0];
    assert(direction, `moveTo stalled at ${JSON.stringify(state)} toward ${JSON.stringify(target)}`);
    await press(page, direction.key);
    await resolveWildEncounter(page, mapId);
  }
  throw new Error(`moveTo exceeded step budget on ${mapId} toward ${JSON.stringify(target)}; current=${JSON.stringify(await worldBehavior(page))}`);
}
async function enterWarp(page, mapId, from, key, expectedHeading) {
  await moveTo(page, mapId, from);
  await press(page, key);
  await page.getByRole("heading", { name: expectedHeading }).waitFor({ timeout: 1e4 });
  await page.waitForTimeout(320);
}
async function requireMistwood(page, label) {
  await requireWorld(page, "\u8FF7\u96FE\u6797\u5883", label);
  await page.locator(".pixi-world-viewport canvas").waitFor({ timeout: 1e4 });
  const diagnostics = await worldBehavior(page);
  assert(diagnostics.mapId === "viridian-forest" && diagnostics.sceneId === "mistwood-trial" && diagnostics.renderer === "pixi" && !diagnostics.diagnosticWorldScene, `${label}: formally gated scene did not use the normal GPU WorldView bridge (${JSON.stringify(diagnostics)})`);
  return diagnostics;
}
async function requireStarfallRidge(page, label) {
  await requireWorld(page, "\u661F\u9668\u9AD8\u5F84", label);
  await page.locator(".pixi-world-viewport canvas").waitFor({ timeout: 1e4 });
  const diagnostics = await worldBehavior(page);
  assert(diagnostics.mapId === "route3" && diagnostics.sceneId === "starfall-ridge" && diagnostics.renderer === "pixi" && !diagnostics.diagnosticWorldScene, `${label}: formally gated ridge scene did not use the normal GPU WorldView bridge (${JSON.stringify(diagnostics)})`);
  return diagnostics;
}
async function advanceDialog(page) {
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true })));
  await page.waitForTimeout(120);
}
async function dismissDialog(page) {
  for (let step = 0; step < 16 && await page.locator(".dialog-layer").count(); step++) {
    if (await page.locator(".dialog-choices").count()) {
      await page.locator(".dialog-choices button").last().click();
      await page.waitForTimeout(180);
      continue;
    }
    await advanceDialog(page);
  }
  assert(await page.locator(".dialog-layer").count() === 0, `dialog did not close through normal keyboard UI; state=${JSON.stringify(await worldState(page))}`);
}
async function advanceToChoices(page) {
  for (let step = 0; step < 8 && await page.locator(".dialog-choices").count() === 0; step++)
    await advanceDialog(page);
  if (await page.locator(".dialog-choices").count() !== 1) {
    throw new Error(`dialog choices did not appear; state=${JSON.stringify(await worldState(page))}; body=${(await page.locator("body").innerText()).slice(0, 1800)}`);
  }
}
async function finishBattle(page, expectedWorld = "\u8424\u706B\u6797\u9053") {
  await page.getByRole("button", { name: "\u23ED" }).click();
  const outcome = page.locator(".modal button").filter({ hasText: /全部放生|返回/ }).first();
  await outcome.waitFor({ timeout: 2e4 });
  await outcome.click();
  await page.getByRole("heading", { name: expectedWorld }).waitFor({ timeout: 1e4 });
  await page.waitForTimeout(500);
}
async function unlockRoute1(page) {
  await press(page, "ArrowLeft", 1);
  await press(page, "e");
  await dismissDialog(page);
  await press(page, "ArrowRight", 3);
  await press(page, "ArrowDown", 2);
  await press(page, "e");
  await advanceToChoices(page);
  await page.getByRole("button", { name: "\u63A5\u53D7\u5207\u78CB" }).click();
  try {
    await page.locator(".battle").waitFor({ timeout: 1e4 });
  } catch {
    await page.screenshot({ path: resolve(ARTIFACT_DIR, "playable-observation-trainer-failure.png") });
    const body = (await page.locator("body").innerText()).slice(0, 2400);
    throw new Error(`trainer battle did not start; state=${JSON.stringify(await worldState(page))}; url=${page.url()}; body=${body}`);
  }
  await finishBattle(page, "\u96FE\u6E7E\u9547");
  await moveTo(page, "pallet", { x: 8, y: 1 });
  await press(page, "ArrowUp");
  await page.getByRole("heading", { name: "\u8424\u706B\u6797\u9053" }).waitFor({ timeout: 15e3 });
  await page.waitForTimeout(320);
}
async function completeChapterOne(page) {
  await moveTo(page, "route1", { x: 8, y: 5 });
  assert((await worldBehavior(page)).nearbyNpcId === "lantern-scout", `Route1 scout was not adjacent at the planned tile (${JSON.stringify(await worldBehavior(page))})`);
  await press(page, "e");
  assert((await worldState(page)).dialogText.includes("\u5C9A\u5DE1\u5458"), `Route1 scout interaction did not open through the normal WorldView UI; state=${JSON.stringify(await worldState(page))}; behavior=${JSON.stringify(await worldBehavior(page))}`);
  await dismissDialog(page);
  await enterWarp(page, "route1", { x: 8, y: 1 }, "ArrowUp", "\u8FF7\u96FE\u6797\u5883");
  const initial = await requireMistwood(page, "forest entry");
  assert(initial.activeQuest === "mistwood-open" && initial.objectIds.join(",") === "lumen-1" && initial.npcIds.length === 0 && initial.encounterEligible, `forest entry DTO/state mismatch (${JSON.stringify(initial)})`);
  await moveTo(page, "viridian-forest", { x: 4, y: 4 });
  assert((await worldBehavior(page)).nearbyObjectId === "lumen-1", "first signal was not adjacent at the planned tile");
  await press(page, "e");
  await dismissDialog(page);
  let state = await requireMistwood(page, "after first signal");
  assert(state.objectIds.join(",") === "lumen-2" && state.activeQuest === "follow-lumens", `first signal progression mismatch (${JSON.stringify(state)})`);
  await moveTo(page, "viridian-forest", { x: 12, y: 8 });
  assert((await worldBehavior(page)).nearbyObjectId === "lumen-2", "second signal was not adjacent at the planned tile");
  await press(page, "e");
  await dismissDialog(page);
  state = await requireMistwood(page, "after second signal");
  assert(state.objectIds.join(",") === "lumen-3", `second signal progression mismatch (${JSON.stringify(state)})`);
  await moveTo(page, "viridian-forest", { x: 3, y: 11 });
  const beforeBlockedMove = await worldBehavior(page);
  await press(page, "ArrowRight");
  await resolveWildEncounter(page, "viridian-forest");
  const afterBlockedMove = await worldBehavior(page);
  assert(beforeBlockedMove.position.x === 3 && beforeBlockedMove.position.y === 11 && afterBlockedMove.position.x === 3 && afterBlockedMove.position.y === 11, `forest collision changed under GPU observation (${JSON.stringify({ beforeBlockedMove, afterBlockedMove })})`);
  assert(afterBlockedMove.nearbyObjectId === "lumen-3", "third signal was not adjacent after collision check");
  await press(page, "e");
  await dismissDialog(page);
  state = await requireMistwood(page, "after third signal");
  assert(state.objectIds.length === 0 && state.npcIds.join(",") === "mist-runner", `third signal did not reveal the existing trainer DTO (${JSON.stringify(state)})`);
  for (let attempt = 0; attempt < 5; attempt++) {
    await moveTo(page, "viridian-forest", { x: 10, y: 10 });
    assert((await worldBehavior(page)).nearbyNpcId === "mist-runner", "mist runner was not adjacent at the planned tile");
    await press(page, "e");
    await advanceToChoices(page);
    await page.getByRole("button", { name: "\u63A5\u53D7\u8BD5\u70BC" }).click();
    await page.locator(".battle").waitFor({ timeout: 1e4 });
    await page.locator(".pixi-battle-viewport canvas").waitFor({ timeout: 1e4 });
    await finishBattle(page, "\u8FF7\u96FE\u6797\u5883");
    state = await requireMistwood(page, `after mist runner battle ${attempt + 1}`);
    if (state.activeQuest === "confront-anomaly" && state.objectIds.join(",") === "anomaly-core" && state.npcIds.length === 0) break;
  }
  assert(state.activeQuest === "confront-anomaly" && state.objectIds.join(",") === "anomaly-core" && state.npcIds.length === 0, `mist runner did not reveal the existing anomaly-core DTO after normal retries (${JSON.stringify(state)})`);
  for (let attempt = 0; attempt < 5; attempt++) {
    await moveTo(page, "viridian-forest", { x: 8, y: 6 });
    assert((await worldBehavior(page)).nearbyObjectId === "anomaly-core", "anomaly core was not adjacent at the planned tile");
    await press(page, "e");
    await advanceToChoices(page);
    await page.getByRole("button", { name: "\u5E73\u606F\u5F02\u76F8" }).click();
    await page.locator(".battle").waitFor({ timeout: 1e4 });
    await page.locator(".pixi-battle-viewport canvas").waitFor({ timeout: 1e4 });
    await finishBattle(page, "\u8FF7\u96FE\u6797\u5883");
    state = await requireMistwood(page, `after anomaly battle ${attempt + 1}`);
    if (state.activeQuest === "return-to-lan" && state.objectIds.length === 0) break;
  }
  assert(state.activeQuest === "return-to-lan" && state.objectIds.length === 0, `anomaly battle did not advance the existing story after normal retries (${JSON.stringify(state)})`);
  await enterWarp(page, "viridian-forest", { x: 8, y: 12 }, "ArrowDown", "\u8424\u706B\u6797\u9053");
  await enterWarp(page, "route1", { x: 8, y: 12 }, "ArrowDown", "\u96FE\u6E7E\u9547");
  await moveTo(page, "pallet", { x: 7, y: 6 });
  assert((await worldBehavior(page)).nearbyNpcId === "professor-lan", "Professor Lan was not adjacent after the normal chapter-one return");
  await press(page, "e");
  await dismissDialog(page);
  const returned = await worldBehavior(page);
  assert(returned.mapId === "pallet" && returned.renderer === "pixi" && !returned.diagnosticWorldScene && returned.activeQuest === "climb-starfell", `chapter-one return did not restore the approved GPU path and next quest (${JSON.stringify(returned)})`);
}
async function resolveRoute3WildBattle(page) {
  await moveTo(page, "route3", { x: 3, y: 3 });
  for (let attempt = 0; attempt < 36; attempt++) {
    await press(page, attempt % 2 === 0 ? "ArrowUp" : "ArrowDown");
    for (let retry = 0; retry < 8 && await page.locator(".battle").count() === 0; retry++) await page.waitForTimeout(90);
    if (await page.locator(".battle").count() === 0) continue;
    await page.locator(".pixi-battle-viewport canvas").waitFor({ timeout: 1e4 });
    await finishBattle(page, "\u661F\u9668\u9AD8\u5F84");
    await requireStarfallRidge(page, "after route3 wild battle");
    return;
  }
  throw new Error("route3 did not trigger a normal wild encounter within the observation budget");
}
async function enterStarfallRidgeObservation(page) {
  const palletStart = await worldBehavior(page);
  assert(palletStart.mapId === "pallet" && palletStart.position.x === 7 && palletStart.position.y === 6, `unexpected post-professor position before ridge route (${JSON.stringify(palletStart)})`);
  await press(page, "ArrowRight");
  await press(page, "ArrowUp", 5);
  await press(page, "ArrowUp");
  await page.getByRole("heading", { name: "\u8424\u706B\u6797\u9053" }).waitFor({ timeout: 1e4 });
  await enterWarp(page, "route1", { x: 8, y: 1 }, "ArrowUp", "\u8FF7\u96FE\u6797\u5883");
  await enterWarp(page, "viridian-forest", { x: 8, y: 1 }, "ArrowUp", "\u661F\u9668\u9AD8\u5F84");
  let state = await requireStarfallRidge(page, "ridge entry");
  assert(state.activeQuest === "climb-starfell" && state.objectIds.join(",") === "star-1" && state.npcIds.join(",") === "ridge-guide" && !state.encounterEligible, `ridge entry DTO/state mismatch (${JSON.stringify(state)})`);
  await moveTo(page, "route3", { x: 5, y: 6 });
  const beforeBlockedMove = await worldBehavior(page);
  await press(page, "ArrowRight");
  const afterBlockedMove = await worldBehavior(page);
  assert(beforeBlockedMove.position.x === 5 && beforeBlockedMove.position.y === 6 && afterBlockedMove.position.x === 5 && afterBlockedMove.position.y === 6, `ridge stone-wall collision changed under GPU observation (${JSON.stringify({ beforeBlockedMove, afterBlockedMove })})`);
  await moveTo(page, "route3", { x: 4, y: 4 });
  assert((await worldBehavior(page)).nearbyObjectId === "star-1", "first star scar was not adjacent at the planned tile");
  await press(page, "e");
  await dismissDialog(page);
  state = await requireStarfallRidge(page, "after first star");
  assert(state.objectIds.join(",") === "star-2" && state.activeQuest === "read-stars", `first star progression mismatch (${JSON.stringify(state)})`);
  await moveTo(page, "route3", { x: 11, y: 6 });
  assert((await worldBehavior(page)).nearbyObjectId === "star-2", "second star scar was not adjacent at the planned tile");
  await press(page, "e");
  await dismissDialog(page);
  state = await requireStarfallRidge(page, "after second star");
  assert(state.objectIds.join(",") === "star-3", `second star progression mismatch (${JSON.stringify(state)})`);
  await moveTo(page, "route3", { x: 4, y: 11 });
  assert((await worldBehavior(page)).nearbyObjectId === "star-3", "third star scar was not adjacent at the planned tile");
  await press(page, "e");
  await dismissDialog(page);
  state = await requireStarfallRidge(page, "after third star");
  assert(state.objectIds.length === 0 && state.activeQuest === "challenge-cartographer", `third star did not complete the existing ridge puzzle (${JSON.stringify(state)})`);
  await moveTo(page, "route3", { x: 5, y: 8 });
  assert((await worldBehavior(page)).nearbyNpcId === "ridge-guide", "ridge guide was not adjacent at the planned tile");
  await press(page, "e");
  assert((await worldState(page)).dialogText.includes("\u4E09\u9053\u523B\u75D5"), `ridge guide dialogue did not use the existing WorldView path; state=${JSON.stringify(await worldState(page))}`);
  await dismissDialog(page);
  await resolveRoute3WildBattle(page);
  await enterWarp(page, "route3", { x: 8, y: 1 }, "ArrowUp", "\u661F\u9668\u89C2\u6D4B\u6240");
  const returned = await worldBehavior(page);
  assert(returned.mapId === "mt-moon" && returned.renderer === "pixi" && !returned.diagnosticWorldScene, `ridge north-warp did not restore the approved GPU renderer path (${JSON.stringify(returned)})`);
}
async function readHeap(page) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("HeapProfiler.collectGarbage");
    const metrics = await cdp.send("Performance.getMetrics");
    return metrics.metrics.find((metric) => metric.name === "JSHeapUsedSize")?.value ?? 0;
  } finally {
    await cdp.detach();
  }
}
function validate(report) {
  const worldSamples = report.samples.filter((sample) => sample.stage === "world");
  const battleSamples = report.samples.filter((sample) => sample.stage === "battle");
  assert(report.stageMounts.world >= CYCLES + 1, `expected >= ${CYCLES + 1} WorldStage mounts, got ${report.stageMounts.world}`);
  assert(report.stageMounts.battle >= CYCLES, `expected >= ${CYCLES} BattleStage mounts, got ${report.stageMounts.battle}`);
  assert(worldSamples.length >= report.stageMounts.world && battleSamples.length >= report.stageMounts.battle, "missing playable renderer observation samples");
  for (const sample of report.samples) {
    assert(sample.diagnostics.canvasCount === 1, `${sample.stage}: expected one renderer canvas`);
    assert(Number(sample.diagnostics.totalChildCount) > 0, `${sample.stage}: expected renderer children`);
    assert(Number(sample.diagnostics.canvasPixels) > 0, `${sample.stage}: expected non-zero canvas pixels`);
  }
  const drawCalls = report.samples.map((sample) => Number(sample.diagnostics.drawCallTotal ?? 0));
  assert(drawCalls.some((count) => count > 0), "renderer-local WebGL draw-call observer did not record draws");
  const heaps = report.samples.map((sample) => sample.heapUsedBytes).filter((heap) => typeof heap === "number");
  const sampledHeapDeltaBytes = heaps.length > 1 ? heaps[heaps.length - 1] - heaps[0] : 0;
  assert(sampledHeapDeltaBytes < 32 * 1024 * 1024, `playable sampled heap growth exceeded 32 MiB (${sampledHeapDeltaBytes})`);
  return { cycles: CYCLES, stageMounts: report.stageMounts, sampleCount: report.samples.length, worldSampleCount: worldSamples.length, battleSampleCount: battleSamples.length, maxDrawCallTotal: Math.max(...drawCalls), maxWorldChildren: Math.max(...worldSamples.map((sample) => Number(sample.diagnostics.totalChildCount))), maxBattleChildren: Math.max(...battleSamples.map((sample) => Number(sample.diagnostics.totalChildCount))), sampledHeapDeltaBytes, maxSampledHeapBytes: heaps.length ? Math.max(...heaps) : 0 };
}
async function main() {
  assert(existsSync(CHROME_PATH), `Chrome executable not found: ${CHROME_PATH}. Set PO_VISUAL_BROWSER to override.`);
  await mkdir(ARTIFACT_DIR, { recursive: true });
  await rm(REPORT_PATH, { force: true });
  const worker = start(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--local", "--port", String(WORKER_PORT)]);
  let web;
  let browser;
  try {
    await waitFor(`http://127.0.0.1:${WORKER_PORT}/api/health`, worker, "local Worker");
    web = start(process.execPath, ["node_modules/vite/bin/vite.js", "--config", "apps/web/vite.config.ts", "--host", "127.0.0.1", "--port", String(WEB_PORT), "--strictPort"]);
    await waitFor(`${BASE_URL}/login`, web, "Vite web server");
    browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true, args: ["--use-angle=swiftshader", "--use-gl=angle", "--disable-gpu-vsync"] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const username = `obs${Date.now().toString(36).slice(-9)}`;
    const password = "renderer-observation";
    await page.goto(`${BASE_URL}/login?renderer-observation=1`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "\u6CE8\u518C" }).click();
    await page.locator("input").nth(0).fill(username);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole("button", { name: "\u6CE8\u518C\u5E76\u5F00\u59CB" }).click();
    await page.getByRole("heading", { name: "\u9009\u62E9\u4F60\u7684\u521D\u59CB\u4F19\u4F34" }).waitFor({ timeout: 1e4 });
    await page.locator(".starter").nth(1).click();
    await page.getByRole("button", { name: /就决定是你了/ }).click();
    await page.getByRole("heading", { name: "\u96FE\u6E7E\u9547" }).waitFor({ timeout: 1e4 });
    await dismissDialog(page);
    await page.goto(`${BASE_URL}/world?renderer-observation=1`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "\u96FE\u6E7E\u9547" }).waitFor({ timeout: 1e4 });
    await dismissDialog(page);
    await unlockRoute1(page);
    await page.getByRole("button", { name: "Canvas" }).click();
    await page.locator(".pixi-world-viewport canvas").waitFor({ timeout: 1e4 });
    const beforeHeap = await readHeap(page);
    await completeChapterOne(page);
    await enterStarfallRidgeObservation(page);
    const afterHeap = await readHeap(page);
    const report = await page.evaluate(() => window.__PO_RENDERER_OBSERVATION__?.());
    assert(report, "missing playable renderer observation report");
    const summary = validate(report);
    const heapDeltaBytes = afterHeap - beforeHeap;
    assert(heapDeltaBytes < 32 * 1024 * 1024, `playable World \u2192 Battle \u2192 World heap growth exceeded 32 MiB (${heapDeltaBytes})`);
    await writeFile(REPORT_PATH, `${JSON.stringify({ username, beforeHeap, afterHeap, heapDeltaBytes, summary, report }, null, 2)}
`);
    console.log(`\u2713 playable authenticated formally gated Starfall Ridge WorldView observation: GPU World \u2192 Battle \u2192 World coverage, ${summary.sampleCount} samples, heap delta ${heapDeltaBytes} bytes, max draw calls ${summary.maxDrawCallTotal}`);
  } finally {
    await browser?.close();
    await stop(web);
    await stop(worker);
  }
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
