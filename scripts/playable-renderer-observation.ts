import { chromium, type Browser, type Page } from 'playwright-core';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { getMap, isWalkable } from '@pokemon-online/config';
const ROOT = process.cwd();
const WEB_PORT = 41774;
const WORKER_PORT = 8787;
const BASE_URL = `http://127.0.0.1:${WEB_PORT}`;
const ARTIFACT_DIR = resolve(ROOT, 'doc/visual-baselines/artifacts');
const REPORT_PATH = resolve(ARTIFACT_DIR, 'playable-runtime-observation.json');
const CHROME_PATH = process.env.PO_VISUAL_BROWSER ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CYCLES = 3;
type ObservationSample = {
    stage: 'world' | 'battle';
    atMs: number;
    heapUsedBytes?: number;
    diagnostics: Record<string, unknown>;
};
type ObservationReport = {
    version: 1;
    startedAtMs: number;
    samples: readonly ObservationSample[];
    stageMounts: Readonly<Record<'world' | 'battle', number>>;
};
type WorldBehaviorDiagnostics = {
    mapId: string;
    sceneId: string | null;
    renderer: 'canvas' | 'pixi';
    position: {
        x: number;
        y: number;
    };
    activeQuest: string | null;
    npcIds: readonly string[];
    objectIds: readonly string[];
    nearbyNpcId: string | null;
    nearbyObjectId: string | null;
    encounterEligible: boolean;
    diagnosticWorldScene: boolean;
};
function assert(condition: unknown, message: string): asserts condition { if (!condition)
    throw new Error(message); }
function start(command: string, args: string[]): ChildProcess { return spawn(command, args, { cwd: ROOT, stdio: 'pipe', windowsHide: true }); }
async function stop(process: ChildProcess | undefined): Promise<void> {
    if (!process || process.exitCode !== null)
        return;
    process.kill();
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (process.exitCode === null)
        process.kill('SIGKILL');
}
async function waitFor(url: string, process: ChildProcess, label: string): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 45000) {
        if (process.exitCode !== null)
            throw new Error(`${label} exited early (${process.exitCode})`);
        try {
            const response = await fetch(url);
            if (response.ok)
                return;
        }
        catch { /* retry */ }
        await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error(`Timed out waiting for ${label}`);
}
async function press(page: Page, key: string, count = 1): Promise<void> {
    for (let index = 0; index < count; index++) {
        const handled = await page.evaluate((pressedKey) => { const down = new KeyboardEvent('keydown', { key: pressedKey, bubbles: true, cancelable: true }); window.dispatchEvent(down); window.dispatchEvent(new KeyboardEvent('keyup', { key: pressedKey, bubbles: true, cancelable: true })); return down.defaultPrevented; }, key);
        if (!handled)
            throw new Error(`world key handler did not consume ${key}`);
        await page.waitForTimeout(220);
    }
}
async function worldState(page: Page): Promise<{
    heading: string;
    renderer: string;
    dialogOpen: boolean;
    hint: string;
    dialogText: string;
}> { return page.evaluate(() => ({ heading: document.querySelector('.world h2')?.textContent?.trim() ?? '', renderer: document.querySelector('.pixi-world-viewport') ? 'pixi' : 'canvas', dialogOpen: !!document.querySelector('.dialog-layer'), hint: document.querySelector('.interact-hint')?.textContent?.trim() ?? '', dialogText: document.querySelector('.dialog-layer')?.textContent?.trim().slice(0, 240) ?? '', })); }
async function requireWorld(page: Page, expectedHeading: string, label: string): Promise<void> {
    const state = await worldState(page);
    if (state.heading !== expectedHeading)
        throw new Error(`${label}: expected ${expectedHeading}, got ${JSON.stringify(state)}; url=${page.url()}; body=${(await page.locator('body').innerText()).slice(0, 1400)}`);
}
async function worldBehavior(page: Page): Promise<WorldBehaviorDiagnostics> {
    const diagnostics = await page.evaluate(() => window.__PO_WORLD_BEHAVIOR_DIAGNOSTICS__?.()) as WorldBehaviorDiagnostics | undefined;
    if (!diagnostics)
        throw new Error(`missing WorldView behavior diagnostics; state=${JSON.stringify(await worldState(page))}`);
    return diagnostics;
}
const DIRECTIONS = [{ key: 'ArrowUp', dx: 0, dy: -1 }, { key: 'ArrowDown', dx: 0, dy: 1 }, { key: 'ArrowLeft', dx: -1, dy: 0 }, { key: 'ArrowRight', dx: 1, dy: 0 },] as const;
function pathTo(mapId: string, start: {
    x: number;
    y: number;
}, target: {
    x: number;
    y: number;
}): readonly typeof DIRECTIONS[number][] {
    const map = getMap(mapId);
    const pending: Array<{
        x: number;
        y: number;
        path: readonly typeof DIRECTIONS[number][];
    }> = [{ ...start, path: [] }];
    const seen = new Set([`${start.x},${start.y}`]);
    while (pending.length) {
        const current = pending.shift()!;
        if (current.x === target.x && current.y === target.y)
            return current.path;
        for (const direction of DIRECTIONS) {
            const x = current.x + direction.dx;
            const y = current.y + direction.dy;
            const key = `${x},${y}`;
            if (x < 0 || y < 0 || x >= map.width || y >= map.height || seen.has(key) || !isWalkable(map.tiles[y]![x]!))
                continue;
            seen.add(key);
            pending.push({ x, y, path: [...current.path, direction] });
        }
    }
    throw new Error(`no static-map path for ${mapId}: ${start.x},${start.y} -> ${target.x},${target.y}`);
}
async function resolveWildEncounter(page: Page, mapId: string): Promise<void> {
    // WorldView starts encounters asynchronously after a movement tween. Poll a  
    // short window so an encounter cannot leave the next planned key on BattleView.
    for (let retry = 0; retry < 8 && await page.locator('.battle').count() === 0; retry++)
        await page.waitForTimeout(90);
    if (await page.locator('.battle').count() === 0)
        return;
    await page.getByRole('button', { name: '⏭' }).click();
    const outcome = page.locator('.modal button').filter({ hasText: /全部放生|返回/ }).first();
    await outcome.waitFor({ timeout: 20000 });
    await outcome.click();
    await page.getByRole('heading', { name: getMap(mapId).name }).waitFor({ timeout: 10000 });
    await page.waitForTimeout(180);
} /** Move through the existing WorldView keyboard path using the authoritative * static map. Every step rereads the Vue-side diagnostic DTO; no save, Pinia, or * route state is written by the harness. */
async function moveTo(page: Page, mapId: string, target: {
    x: number;
    y: number;
}): Promise<void> {
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
async function enterWarp(page: Page, mapId: string, from: {
    x: number;
    y: number;
}, key: 'ArrowUp' | 'ArrowDown', expectedHeading: string): Promise<void> {
    await moveTo(page, mapId, from);
    await press(page, key);
    await page.getByRole('heading', { name: expectedHeading }).waitFor({ timeout: 10000 });
    await page.waitForTimeout(320);
}
async function requireMistwood(page: Page, label: string): Promise<WorldBehaviorDiagnostics> {
    await requireWorld(page, '迷雾林境', label);
    await page.locator('.pixi-world-viewport canvas').waitFor({ timeout: 10000 });
    const diagnostics = await worldBehavior(page);
    assert(diagnostics.mapId === 'viridian-forest' && diagnostics.sceneId === 'mistwood-trial' && diagnostics.renderer === 'pixi' && !diagnostics.diagnosticWorldScene, `${label}: formally gated scene did not use the normal GPU WorldView bridge (${JSON.stringify(diagnostics)})`);
    return diagnostics;
}
async function requireStarfallRidge(page: Page, label: string): Promise<WorldBehaviorDiagnostics> {
    await requireWorld(page, '星陨高径', label);
    await page.locator('.pixi-world-viewport canvas').waitFor({ timeout: 10000 });
    const diagnostics = await worldBehavior(page);
    assert(diagnostics.mapId === 'route3' && diagnostics.sceneId === 'starfall-ridge' && diagnostics.renderer === 'pixi' && !diagnostics.diagnosticWorldScene, `${label}: formally gated ridge scene did not use the normal GPU WorldView bridge (${JSON.stringify(diagnostics)})`);
    return diagnostics;
}
async function advanceDialog(page: Page): Promise<void> {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })));
    await page.waitForTimeout(120);
}
async function dismissDialog(page: Page): Promise<void> {
    for (let step = 0; step < 16 && await page.locator('.dialog-layer').count(); step++) {
        if (await page.locator('.dialog-choices').count()) {
            await page.locator('.dialog-choices button').last().click();
            await page.waitForTimeout(180);
            continue;
        }
        await advanceDialog(page);
    }
    assert(await page.locator('.dialog-layer').count() === 0, `dialog did not close through normal keyboard UI; state=${JSON.stringify(await worldState(page))}`);
}
async function advanceToChoices(page: Page): Promise<void> {
    for (let step = 0; step < 8 && await page.locator('.dialog-choices').count() === 0; step++)
        await advanceDialog(page);
    if (await page.locator('.dialog-choices').count() !== 1) {
        throw new Error(`dialog choices did not appear; state=${JSON.stringify(await worldState(page))}; body=${(await page.locator('body').innerText()).slice(0, 1800)}`);
    }
}
async function finishBattle(page: Page, expectedWorld = '萤火林道'): Promise<void> {
    await page.getByRole('button', { name: '⏭' }).click();
    const outcome = page.locator('.modal button').filter({ hasText: /全部放生|返回/ }).first();
    await outcome.waitFor({ timeout: 20000 });
    await outcome.click();
    await page.getByRole('heading', { name: expectedWorld }).waitFor({ timeout: 10000 });
    await page.waitForTimeout(500);
}
async function unlockRoute1(page: Page): Promise<void> {
    // Start at (8,6). Interact with Professor Lan at (6,6), then White Night at  
    // (10,8), and complete the real first scripted battle to open Route1.
    await press(page, 'ArrowLeft', 1);
    await press(page, 'e');
    await dismissDialog(page);
    await press(page, 'ArrowRight', 3);
    await press(page, 'ArrowDown', 2);
    await press(page, 'e');
    await advanceToChoices(page);
    await page.getByRole('button', { name: '接受切磋' }).click();
    try {
        await page.locator('.battle').waitFor({ timeout: 10000 });
    }
    catch {
        await page.screenshot({ path: resolve(ARTIFACT_DIR, 'playable-observation-trainer-failure.png') });
        const body = (await page.locator('body').innerText()).slice(0, 2400);
        throw new Error(`trainer battle did not start; state=${JSON.stringify(await worldState(page))}; url=${page.url()}; body=${body}`);
    }
    await finishBattle(page, '雾湾镇');
    // From the post-battle position, follow the authoritative map grid to the  
    // genuine pallet→route1 warp. This remains regular keyboard movement and also  
    // tolerates an intervening wild encounter without changing save data directly.
    await moveTo(page, 'pallet', { x: 8, y: 1 });
    await press(page, 'ArrowUp');
    await page.getByRole('heading', { name: '萤火林道' }).waitFor({ timeout: 15000 });
    await page.waitForTimeout(320);
}
async function completeChapterOne(page: Page): Promise<void> {
    // Route1 starts at (8,12). Its existing scout at (7,5) opens the ordinary story  
    // condition for the forest warp; the route planner validates the true tile map.
    await moveTo(page, 'route1', { x: 8, y: 5 });
    assert((await worldBehavior(page)).nearbyNpcId === 'lantern-scout', `Route1 scout was not adjacent at the planned tile (${JSON.stringify(await worldBehavior(page))})`);
    await press(page, 'e');
    assert((await worldState(page)).dialogText.includes('岚巡员'), `Route1 scout interaction did not open through the normal WorldView UI; state=${JSON.stringify(await worldState(page))}; behavior=${JSON.stringify(await worldBehavior(page))}`);
    await dismissDialog(page);
    await enterWarp(page, 'route1', { x: 8, y: 1 }, 'ArrowUp', '迷雾林境');
    const initial = await requireMistwood(page, 'forest entry');
    assert(initial.activeQuest === 'mistwood-open' && initial.objectIds.join(',') === 'lumen-1' && initial.npcIds.length === 0 && initial.encounterEligible, `forest entry DTO/state mismatch (${JSON.stringify(initial)})`);
    // First signal at (3,4), approached from (4,4). It verifies the authoritative  
    // object DTO is mirrored into the formally gated WorldStage without making the  
    // Scene Pack responsible for story visibility.
    await moveTo(page, 'viridian-forest', { x: 4, y: 4 });
    assert((await worldBehavior(page)).nearbyObjectId === 'lumen-1', 'first signal was not adjacent at the planned tile');
    await press(page, 'e');
    await dismissDialog(page);
    let state = await requireMistwood(page, 'after first signal');
    assert(state.objectIds.join(',') === 'lumen-2' && state.activeQuest === 'follow-lumens', `first signal progression mismatch (${JSON.stringify(state)})`);
    // Second signal at (12,7), approached from (12,8).
    await moveTo(page, 'viridian-forest', { x: 12, y: 8 });
    assert((await worldBehavior(page)).nearbyObjectId === 'lumen-2', 'second signal was not adjacent at the planned tile');
    await press(page, 'e');
    await dismissDialog(page);
    state = await requireMistwood(page, 'after second signal');
    assert(state.objectIds.join(',') === 'lumen-3', `second signal progression mismatch (${JSON.stringify(state)})`);
    // Third signal at (4,11), approached from (3,11). The blocked tree tile (4,11)  
    // must remain blocked even while the GPU stage mirrors the location.
    await moveTo(page, 'viridian-forest', { x: 3, y: 11 });
    const beforeBlockedMove = await worldBehavior(page);
    await press(page, 'ArrowRight');
    await resolveWildEncounter(page, 'viridian-forest');
    const afterBlockedMove = await worldBehavior(page);
    assert(beforeBlockedMove.position.x === 3 && beforeBlockedMove.position.y === 11 && afterBlockedMove.position.x === 3 && afterBlockedMove.position.y === 11, `forest collision changed under GPU observation (${JSON.stringify({ beforeBlockedMove, afterBlockedMove })})`);
    assert(afterBlockedMove.nearbyObjectId === 'lumen-3', 'third signal was not adjacent after collision check');
    await press(page, 'e');
    await dismissDialog(page);
    state = await requireMistwood(page, 'after third signal');
    assert(state.objectIds.length === 0 && state.npcIds.join(',') === 'mist-runner', `third signal did not reveal the existing trainer DTO (${JSON.stringify(state)})`);
    // Real story trainer and object battles use their existing win/loss logic.
    // A loss returns through the same GPU World -> GPU Battle -> GPU World path;
    // retrying through the normal WorldView UI is intentional and never writes a
    // flag or manufactures a victory for the renderer observation.
    for (let attempt = 0; attempt < 5; attempt++) {
        await moveTo(page, 'viridian-forest', { x: 10, y: 10 });
        assert((await worldBehavior(page)).nearbyNpcId === 'mist-runner', 'mist runner was not adjacent at the planned tile');
        await press(page, 'e');
        await advanceToChoices(page);
        await page.getByRole('button', { name: '接受试炼' }).click();
        await page.locator('.battle').waitFor({ timeout: 10000 });
        await page.locator('.pixi-battle-viewport canvas').waitFor({ timeout: 10000 });
        await finishBattle(page, '迷雾林境');
        state = await requireMistwood(page, `after mist runner battle ${attempt + 1}`);
        if (state.activeQuest === 'confront-anomaly' && state.objectIds.join(',') === 'anomaly-core' && state.npcIds.length === 0) break;
    }
    assert(state.activeQuest === 'confront-anomaly' && state.objectIds.join(',') === 'anomaly-core' && state.npcIds.length === 0, `mist runner did not reveal the existing anomaly-core DTO after normal retries (${JSON.stringify(state)})`);
    for (let attempt = 0; attempt < 5; attempt++) {
        await moveTo(page, 'viridian-forest', { x: 8, y: 6 });
        assert((await worldBehavior(page)).nearbyObjectId === 'anomaly-core', 'anomaly core was not adjacent at the planned tile');
        await press(page, 'e');
        await advanceToChoices(page);
        await page.getByRole('button', { name: '平息异相' }).click();
        await page.locator('.battle').waitFor({ timeout: 10000 });
        await page.locator('.pixi-battle-viewport canvas').waitFor({ timeout: 10000 });
        await finishBattle(page, '迷雾林境');
        state = await requireMistwood(page, `after anomaly battle ${attempt + 1}`);
        if (state.activeQuest === 'return-to-lan' && state.objectIds.length === 0) break;
    }
    assert(state.activeQuest === 'return-to-lan' && state.objectIds.length === 0, `anomaly battle did not advance the existing story after normal retries (${JSON.stringify(state)})`);
    // Take the genuine forest -> route1 -> pallet lower warps, then receive the
    // existing professor scene that grants chapter-one completion.
    await enterWarp(page, 'viridian-forest', { x: 8, y: 12 }, 'ArrowDown', '萤火林道');
    await enterWarp(page, 'route1', { x: 8, y: 12 }, 'ArrowDown', '雾湾镇');
    await moveTo(page, 'pallet', { x: 7, y: 6 });
    assert((await worldBehavior(page)).nearbyNpcId === 'professor-lan', 'Professor Lan was not adjacent after the normal chapter-one return');
    await press(page, 'e');
    await dismissDialog(page);
    const returned = await worldBehavior(page);
    assert(returned.mapId === 'pallet' && returned.renderer === 'pixi' && !returned.diagnosticWorldScene && returned.activeQuest === 'climb-starfell', `chapter-one return did not restore the approved GPU path and next quest (${JSON.stringify(returned)})`);
}

async function resolveRoute3WildBattle(page: Page): Promise<void> {
    // Alternate between a known grass tile and its walkable neighbour until the
    // authoritative encounter roll opens a normal wild battle. This checks an
    // actual GPU World -> GPU Battle -> GPU World round trip on the pending map.
    await moveTo(page, 'route3', { x: 3, y: 3 });
    for (let attempt = 0; attempt < 36; attempt++) {
        await press(page, attempt % 2 === 0 ? 'ArrowUp' : 'ArrowDown');
        for (let retry = 0; retry < 8 && await page.locator('.battle').count() === 0; retry++) await page.waitForTimeout(90);
        if (await page.locator('.battle').count() === 0) continue;
        await page.locator('.pixi-battle-viewport canvas').waitFor({ timeout: 10000 });
        await finishBattle(page, '星陨高径');
        await requireStarfallRidge(page, 'after route3 wild battle');
        return;
    }
    throw new Error('route3 did not trigger a normal wild encounter within the observation budget');
}

async function enterStarfallRidgeObservation(page: Page): Promise<void> {
    // The tower doorway at (7,4) is a real optional warp. Route around it with
    // regular keys before taking the existing north route instead of mutating save
    // position or disabling the tower switch.
    const palletStart = await worldBehavior(page);
    assert(palletStart.mapId === 'pallet' && palletStart.position.x === 7 && palletStart.position.y === 6, `unexpected post-professor position before ridge route (${JSON.stringify(palletStart)})`);
    // Avoid the optional tower doorway at (7,4): this is the normal north route
    // from the professor's return position to the pallet -> route1 warp.
    await press(page, 'ArrowRight');
    await press(page, 'ArrowUp', 5);
    await press(page, 'ArrowUp');
    await page.getByRole('heading', { name: '萤火林道' }).waitFor({ timeout: 10000 });
    await enterWarp(page, 'route1', { x: 8, y: 1 }, 'ArrowUp', '迷雾林境');
    await enterWarp(page, 'viridian-forest', { x: 8, y: 1 }, 'ArrowUp', '星陨高径');
    let state = await requireStarfallRidge(page, 'ridge entry');
    assert(state.activeQuest === 'climb-starfell' && state.objectIds.join(',') === 'star-1' && state.npcIds.join(',') === 'ridge-guide' && !state.encounterEligible, `ridge entry DTO/state mismatch (${JSON.stringify(state)})`);
    // The central ancient-road stone wall remains authoritative map geometry.
    await moveTo(page, 'route3', { x: 5, y: 6 });
    const beforeBlockedMove = await worldBehavior(page);
    await press(page, 'ArrowRight');
    const afterBlockedMove = await worldBehavior(page);
    assert(beforeBlockedMove.position.x === 5 && beforeBlockedMove.position.y === 6 && afterBlockedMove.position.x === 5 && afterBlockedMove.position.y === 6, `ridge stone-wall collision changed under GPU observation (${JSON.stringify({ beforeBlockedMove, afterBlockedMove })})`);
    // Ordered star DTOs remain story-owned while WorldStage only mirrors them.
    await moveTo(page, 'route3', { x: 4, y: 4 });
    assert((await worldBehavior(page)).nearbyObjectId === 'star-1', 'first star scar was not adjacent at the planned tile');
    await press(page, 'e');
    await dismissDialog(page);
    state = await requireStarfallRidge(page, 'after first star');
    assert(state.objectIds.join(',') === 'star-2' && state.activeQuest === 'read-stars', `first star progression mismatch (${JSON.stringify(state)})`);
    await moveTo(page, 'route3', { x: 11, y: 6 });
    assert((await worldBehavior(page)).nearbyObjectId === 'star-2', 'second star scar was not adjacent at the planned tile');
    await press(page, 'e');
    await dismissDialog(page);
    state = await requireStarfallRidge(page, 'after second star');
    assert(state.objectIds.join(',') === 'star-3', `second star progression mismatch (${JSON.stringify(state)})`);
    await moveTo(page, 'route3', { x: 4, y: 11 });
    assert((await worldBehavior(page)).nearbyObjectId === 'star-3', 'third star scar was not adjacent at the planned tile');
    await press(page, 'e');
    await dismissDialog(page);
    state = await requireStarfallRidge(page, 'after third star');
    assert(state.objectIds.length === 0 && state.activeQuest === 'challenge-cartographer', `third star did not complete the existing ridge puzzle (${JSON.stringify(state)})`);
    await moveTo(page, 'route3', { x: 5, y: 8 });
    assert((await worldBehavior(page)).nearbyNpcId === 'ridge-guide', 'ridge guide was not adjacent at the planned tile');
    await press(page, 'e');
    assert((await worldState(page)).dialogText.includes('三道刻痕'), `ridge guide dialogue did not use the existing WorldView path; state=${JSON.stringify(await worldState(page))}`);
    await dismissDialog(page);
    await resolveRoute3WildBattle(page);
    // The north exit remains subject to the original star_3 gate, now satisfied
    // by real interactions; the destination is an already approved GPU map.
    await enterWarp(page, 'route3', { x: 8, y: 1 }, 'ArrowUp', '星陨观测所');
    const returned = await worldBehavior(page);
    assert(returned.mapId === 'mt-moon' && returned.renderer === 'pixi' && !returned.diagnosticWorldScene, `ridge north-warp did not restore the approved GPU renderer path (${JSON.stringify(returned)})`);
}
async function readHeap(page: Page): Promise<number> {
    const cdp = await page.context().newCDPSession(page);
    try {
        await cdp.send('HeapProfiler.collectGarbage');
        const metrics = await cdp.send('Performance.getMetrics') as {
            metrics: Array<{
                name: string;
                value: number;
            }>;
        };
        return metrics.metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value ?? 0;
    }
    finally {
        await cdp.detach();
    }
}
function validate(report: ObservationReport): Record<string, unknown> {
    const worldSamples = report.samples.filter((sample) => sample.stage === 'world');
    const battleSamples = report.samples.filter((sample) => sample.stage === 'battle');
    assert(report.stageMounts.world >= CYCLES + 1, `expected >= ${CYCLES + 1} WorldStage mounts, got ${report.stageMounts.world}`);
    assert(report.stageMounts.battle >= CYCLES, `expected >= ${CYCLES} BattleStage mounts, got ${report.stageMounts.battle}`);
    assert(worldSamples.length >= report.stageMounts.world && battleSamples.length >= report.stageMounts.battle, 'missing playable renderer observation samples');
    for (const sample of report.samples) {
        assert(sample.diagnostics.canvasCount === 1, `${sample.stage}: expected one renderer canvas`);
        assert(Number(sample.diagnostics.totalChildCount) > 0, `${sample.stage}: expected renderer children`);
        assert(Number(sample.diagnostics.canvasPixels) > 0, `${sample.stage}: expected non-zero canvas pixels`);
    }
    const drawCalls = report.samples.map((sample) => Number(sample.diagnostics.drawCallTotal ?? 0));
    assert(drawCalls.some((count) => count > 0), 'renderer-local WebGL draw-call observer did not record draws');
    const heaps = report.samples.map((sample) => sample.heapUsedBytes).filter((heap): heap is number => typeof heap === 'number');
    const sampledHeapDeltaBytes = heaps.length > 1 ? heaps[heaps.length - 1]! - heaps[0]! : 0;
    assert(sampledHeapDeltaBytes < 32 * 1024 * 1024, `playable sampled heap growth exceeded 32 MiB (${sampledHeapDeltaBytes})`);
    return { cycles: CYCLES, stageMounts: report.stageMounts, sampleCount: report.samples.length, worldSampleCount: worldSamples.length, battleSampleCount: battleSamples.length, maxDrawCallTotal: Math.max(...drawCalls), maxWorldChildren: Math.max(...worldSamples.map((sample) => Number(sample.diagnostics.totalChildCount))), maxBattleChildren: Math.max(...battleSamples.map((sample) => Number(sample.diagnostics.totalChildCount))), sampledHeapDeltaBytes, maxSampledHeapBytes: heaps.length ? Math.max(...heaps) : 0, };
}
async function main(): Promise<void> {
    assert(existsSync(CHROME_PATH), `Chrome executable not found: ${CHROME_PATH}. Set PO_VISUAL_BROWSER to override.`);
    await mkdir(ARTIFACT_DIR, { recursive: true });
    await rm(REPORT_PATH, { force: true });
    const worker = start(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--local', '--port', String(WORKER_PORT)]);
    let web: ChildProcess | undefined;
    let browser: Browser | undefined;
    try {
        await waitFor(`http://127.0.0.1:${WORKER_PORT}/api/health`, worker, 'local Worker');
        web = start(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'apps/web/vite.config.ts', '--host', '127.0.0.1', '--port', String(WEB_PORT), '--strictPort']);
        await waitFor(`${BASE_URL}/login`, web, 'Vite web server');
        browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true, args: ['--use-angle=swiftshader', '--use-gl=angle', '--disable-gpu-vsync'] });
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
        const username = `obs${Date.now().toString(36).slice(-9)}`;
        const password = 'renderer-observation';
        // This deliberately uses the production login/new-game UI; it does not set    
        // auth storage, invoke Pinia, or call APIs directly.
        await page.goto(`${BASE_URL}/login?renderer-observation=1`, { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: '注册' }).click();
        await page.locator('input').nth(0).fill(username);
        await page.locator('input[type="password"]').fill(password);
        await page.getByRole('button', { name: '注册并开始' }).click();
        await page.getByRole('heading', { name: '选择你的初始伙伴' }).waitFor({ timeout: 10000 });
        await page.locator('.starter').nth(1).click();
        await page.getByRole('button', { name: /就决定是你了/ }).click();
        await page.getByRole('heading', { name: '雾湾镇' }).waitFor({ timeout: 10000 });
        await dismissDialog(page);
        // Enter the renderer observation URL only after normal login/new-game routing    
        // is complete. It records metrics only and does not bypass the route guard or    
        // enable a renderer-local observation only; route3 now relies on its
        // formal config gate rather than a pending-map diagnostic.
        await page.goto(`${BASE_URL}/world?renderer-observation=1`, { waitUntil: 'networkidle' });
        await page.getByRole('heading', { name: '雾湾镇' }).waitFor({ timeout: 10000 });
        await dismissDialog(page);
        // First complete the normal gated opening using the default compatibility    
        // renderer. The approved route1 GPU path then reaches viridian-forest through    
        // its formal config gate, without a map-specific diagnostic override.
        await unlockRoute1(page);
        await page.getByRole('button', { name: 'Canvas' }).click();
        await page.locator('.pixi-world-viewport canvas').waitFor({ timeout: 10000 });
        const beforeHeap = await readHeap(page);
        await completeChapterOne(page);
        await enterStarfallRidgeObservation(page);
        const afterHeap = await readHeap(page);
        const report = await page.evaluate(() => window.__PO_RENDERER_OBSERVATION__?.()) as ObservationReport | undefined;
        assert(report, 'missing playable renderer observation report');
        const summary = validate(report);
        const heapDeltaBytes = afterHeap - beforeHeap;
        assert(heapDeltaBytes < 32 * 1024 * 1024, `playable World → Battle → World heap growth exceeded 32 MiB (${heapDeltaBytes})`);
        await writeFile(REPORT_PATH, `${JSON.stringify({ username, beforeHeap, afterHeap, heapDeltaBytes, summary, report }, null, 2)}\n`);
        console.log(`✓ playable authenticated formally gated Starfall Ridge WorldView observation: GPU World → Battle → World coverage, ${summary.sampleCount} samples, heap delta ${heapDeltaBytes} bytes, max draw calls ${summary.maxDrawCallTotal}`);
    }
    finally {
        await browser?.close();
        await stop(web);
        await stop(worker);
    }
}
main().catch((error) => { console.error(error); process.exit(1); });
