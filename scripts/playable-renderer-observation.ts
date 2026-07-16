import { chromium, type Browser, type Page } from 'playwright-core';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { getMap, isLowTideReefCell, isWalkable } from '@pokemon-online/config';
const ROOT = process.cwd();
const WEB_PORT = 41774;
const WORKER_PORT = 8787;
const BASE_URL = `http://127.0.0.1:${WEB_PORT}`;
const ARTIFACT_DIR = resolve(ROOT, 'doc/visual-baselines/artifacts');
const REPORT_PATH = resolve(ARTIFACT_DIR, 'playable-runtime-observation.json');
const CHROME_PATH = process.env.PO_VISUAL_BROWSER ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CYCLES = 3;
const STORY_BATTLE_RETRY_LIMIT = 12;
const STARTUP_UI_TIMEOUT_MS = 30_000;
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
    renderer: 'pixi';
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
        // WorldView can still be remounting immediately after an authentic map /
        // battle transition. Retry only an unconsumed synthetic key; this neither
        // mutates the save nor fabricates movement, and the actual movement still
        // occurs through the normal capture-phase WorldView handler.
        let handled = false;
        for (let retry = 0; retry < 12 && !handled; retry++) {
            const worldReady = await page.locator('.world').count() > 0 && await page.locator('.battle').count() === 0;
            if (worldReady)
                handled = await page.evaluate((pressedKey) => { const down = new KeyboardEvent('keydown', { key: pressedKey, bubbles: true, cancelable: true }); window.dispatchEvent(down); window.dispatchEvent(new KeyboardEvent('keyup', { key: pressedKey, bubbles: true, cancelable: true })); return down.defaultPrevented; }, key);
            if (!handled) await page.waitForTimeout(120);
        }
        if (!handled) {
            const state = await worldState(page);
            if (key !== 'e' || (!state.dialogOpen && !state.hint))
                throw new Error(`world key handler did not consume ${key}; state=${JSON.stringify(state)}; url=${page.url()}`);
        }
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
}, allowLowTideReef = false): readonly typeof DIRECTIONS[number][] {
    const map = getMap(mapId);
    // A route may pass next to an optional warp (for example the tower door in
    // Pallet). Treat every non-target warp cell as a blocked transit cell so a
    // planner move cannot accidentally leave its declared map before enterWarp()
    // performs the intended, separately asserted crossing.
    const transitWarpCells = new Set(map.warps
        .filter((warp) => warp.x !== target.x || warp.y !== target.y)
        .map((warp) => `${warp.x},${warp.y}`));
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
            const isPlannedLowTideReef = allowLowTideReef && isLowTideReefCell(mapId, x, y);
            if (x < 0 || y < 0 || x >= map.width || y >= map.height || seen.has(key) || transitWarpCells.has(key) || (!isWalkable(map.tiles[y]![x]!) && !isPlannedLowTideReef))
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
    await finishBattle(page, getMap(mapId).name);
} /** Move through the existing WorldView keyboard path using the authoritative * static map. Every step rereads the Vue-side diagnostic DTO; no save, Pinia, or * route state is written by the harness. */
async function moveTo(page: Page, mapId: string, target: {
    x: number;
    y: number;
}, allowLowTideReef = false): Promise<void> {
    for (let remaining = 0; remaining < 96; remaining++) {
        const state = await worldBehavior(page);
        assert(state.mapId === mapId, `moveTo expected ${mapId}, got ${JSON.stringify(state)}`);
        if (state.position.x === target.x && state.position.y === target.y)
            return;
        const direction = pathTo(mapId, state.position, target, allowLowTideReef)[0];
        assert(direction, `moveTo stalled at ${JSON.stringify(state)} toward ${JSON.stringify(target)}`);
        await press(page, direction.key);
        await resolveWildEncounter(page, mapId);
    }
    throw new Error(`moveTo exceeded step budget on ${mapId} toward ${JSON.stringify(target)}; current=${JSON.stringify(await worldBehavior(page))}`);
}
async function enterWarp(page: Page, mapId: string, from: {
    x: number;
    y: number;
}, key: 'ArrowUp' | 'ArrowDown', expectedHeading: string, allowLowTideReef = false): Promise<void> {
    await moveTo(page, mapId, from, allowLowTideReef);
    // WorldView can remount immediately after a real battle or scene transition.
    // Retry the same ordinary edge key only while the player remains on the source
    // map; this is the real keyboard route, not a coordinate or save mutation.
    for (let attempt = 0; attempt < 3; attempt++) {
        await press(page, key);
        try {
            await page.getByRole('heading', { name: expectedHeading }).waitFor({ timeout: 5000 });
            await page.waitForTimeout(320);
            return;
        }
        catch {
            const state = await worldBehavior(page);
            if (state.mapId !== mapId) {
                await page.getByRole('heading', { name: expectedHeading }).waitFor({ timeout: 10000 });
                await page.waitForTimeout(320);
                return;
            }
            await moveTo(page, mapId, from, allowLowTideReef);
        }
    }
    throw new Error(`normal warp key did not reach ${expectedHeading} from ${mapId}:${from.x},${from.y}; state=${JSON.stringify(await worldBehavior(page))}`);
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
async function requireStilltideIsles(page: Page, label: string): Promise<WorldBehaviorDiagnostics> {
    await requireWorld(page, '静潮群岛', label);
    await page.locator('.pixi-world-viewport canvas').waitFor({ timeout: 10000 });
    const diagnostics = await worldBehavior(page);
    assert(diagnostics.mapId === 'sea-route' && diagnostics.sceneId === 'stilltide-isles' && diagnostics.renderer === 'pixi' && !diagnostics.diagnosticWorldScene, `${label}: formally gated Stilltide Isles scene did not use the normal GPU WorldView bridge (${JSON.stringify(diagnostics)})`);
    return diagnostics;
}
async function requireTideCave(page: Page, label: string): Promise<WorldBehaviorDiagnostics> {
    await requireWorld(page, '潮洞', label);
    await page.locator('.pixi-world-viewport canvas').waitFor({ timeout: 10000 });
    const diagnostics = await worldBehavior(page);
    assert(diagnostics.mapId === 'dragon-den' && diagnostics.renderer === 'pixi' && !diagnostics.diagnosticWorldScene, `${label}: tide-cave crossing did not retain the normal GPU WorldView bridge (${JSON.stringify(diagnostics)})`);
    return diagnostics;
}
async function requireRedRiftCanyon(page: Page, label: string): Promise<WorldBehaviorDiagnostics> {
    await requireWorld(page, '赤砾裂谷', label);
    await page.locator('.pixi-world-viewport canvas').waitFor({ timeout: 10000 });
    const diagnostics = await worldBehavior(page);
    assert(diagnostics.mapId === 'rock-tunnel' && diagnostics.renderer === 'pixi' && !diagnostics.diagnosticWorldScene, `${label}: canyon crossing did not retain the normal GPU WorldView bridge (${JSON.stringify(diagnostics)})`);
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
type BattleFinish = { resultText: string; caught: boolean };

async function finishBattle(page: Page, expectedWorld = '萤火林道', captureFirstWild = false): Promise<BattleFinish> {
    await page.getByRole('button', { name: '⏭' }).click();
    const result = page.locator('.modal-backdrop .modal');
    await result.waitFor({ timeout: 20000 });
    const resultText = (await result.locator('h2').textContent())?.trim() ?? '';
    const releaseAll = result.getByRole('button', { name: '全部放生' });
    const capture = result.getByRole('button', { name: '捕捉' }).first();
    const caught = captureFirstWild && await capture.count() === 1;
    if (caught) await capture.click();
    else if (await releaseAll.count()) await releaseAll.click();
    else {
        // Use Playwright's real pointer sequence on the visible modal action.
        // A fresh locator avoids clicking a stale result DOM after BattleView
        // re-renders the scripted outcome.
        const box = await result.locator('button').filter({ hasText: /^返回$/ }).boundingBox();
        assert(box, 'story battle result modal did not expose a visible return button');
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }
    // Story-battle results advance through the existing BattleView completion UI;
    // wait for the route to return to WorldView before observing its next DTO.
    for (let retry = 0; retry < 40 && await page.locator('.battle').count(); retry++) await page.waitForTimeout(120);
    await page.getByRole('heading', { name: expectedWorld }).waitFor({ timeout: 10000 });
    await page.waitForTimeout(500);
    return { resultText, caught };
}

async function addRosterToPveTeam(page: Page, expectedWorld: string): Promise<void> {
    // This uses the same menu and team-selection controls available to a player.
    // It only chooses legitimately caught roster members; no store state is read or
    // written by the harness.
    await page.getByRole('button', { name: '菜单' }).click();
    await page.getByRole('button', { name: '队伍' }).click();
    await page.getByRole('heading', { name: '队伍 / 阵容' }).waitFor({ timeout: 10000 });
    for (let slot = 0; slot < 3; slot++) {
        const join = page.getByRole('button', { name: '加入' }).first();
        if (await join.count() === 0) break;
        await join.click();
    }
    assert(await page.getByText('已选 3/3', { exact: false }).count() === 1, 'captured roster members were not selected into the normal PVE team UI');
    await page.getByRole('button', { name: '← 探索' }).first().click();
    await page.getByRole('heading', { name: expectedWorld }).waitFor({ timeout: 10000 });
    await page.waitForTimeout(320);
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
    // The opening choice may race the initial GPU WorldView mount on this local
    // browser. Retry only the visible NPC dialogue and choice if its normal route
    // transition was not accepted; no state is written outside that UI path.
    for (let attempt = 0; attempt < 3 && await page.locator('.battle').count() === 0; attempt++) {
        if (attempt > 0) {
            await press(page, 'e');
            await advanceToChoices(page);
        }
        await page.getByRole('button', { name: '接受切磋' }).click();
        for (let retry = 0; retry < 16 && await page.locator('.battle').count() === 0; retry++) await page.waitForTimeout(120);
    }
    if (await page.locator('.battle').count() === 0) {
        await page.screenshot({ path: resolve(ARTIFACT_DIR, 'playable-observation-trainer-failure.png') });
        const body = (await page.locator('body').innerText()).slice(0, 2400);
        throw new Error(`trainer battle did not start; state=${JSON.stringify(await worldState(page))}; url=${page.url()}; body=${body}`);
    }
    await finishBattle(page, '雾湾镇');
    // From the post-battle position, reuse the static planner / normal-key route
    // helper for the genuine pallet→route1 crossing. This avoids treating the
    // heading DOM update as the transition completion signal.
    await enterWarp(page, 'pallet', { x: 8, y: 1 }, 'ArrowUp', '萤火林道');
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
    for (let attempt = 0; attempt < STORY_BATTLE_RETRY_LIMIT; attempt++) {
        await moveTo(page, 'viridian-forest', { x: 10, y: 10 });
        assert((await worldBehavior(page)).nearbyNpcId === 'mist-runner', 'mist runner was not adjacent at the planned tile');
        await press(page, 'e');
        await advanceToChoices(page);
        await page.getByRole('button', { name: '接受试炼' }).click();
        await page.locator('.battle').waitFor({ timeout: 10000 });
        await page.locator('.pixi-battle-viewport canvas').waitFor({ timeout: 10000 });
        const { resultText } = await finishBattle(page, '迷雾林境');
        state = await requireMistwood(page, `after mist runner battle ${attempt + 1}`);
        if (state.activeQuest === 'confront-anomaly' && state.objectIds.join(',') === 'anomaly-core' && state.npcIds.length === 0) break;
        if (attempt === STORY_BATTLE_RETRY_LIMIT - 1) throw new Error(`mist runner scripted battle did not advance story after normal retries; last result=${resultText}; state=${JSON.stringify(state)}`);
    }
    assert(state.activeQuest === 'confront-anomaly' && state.objectIds.join(',') === 'anomaly-core' && state.npcIds.length === 0, `mist runner did not reveal the existing anomaly-core DTO after normal retries (${JSON.stringify(state)})`);
    for (let attempt = 0; attempt < STORY_BATTLE_RETRY_LIMIT; attempt++) {
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

async function resolveRoute3WildBattle(page: Page, captureFirstWild = false): Promise<void> {
    // Alternate between a known grass tile and its walkable neighbour until the
    // authoritative encounter roll opens a normal wild battle. This checks an
    // actual GPU World -> GPU Battle -> GPU World round trip on the pending map.
    await moveTo(page, 'route3', { x: 3, y: 3 });
    for (let attempt = 0; attempt < 72; attempt++) {
        await press(page, attempt % 2 === 0 ? 'ArrowUp' : 'ArrowDown');
        for (let retry = 0; retry < 8 && await page.locator('.battle').count() === 0; retry++) await page.waitForTimeout(90);
        if (await page.locator('.battle').count() === 0) {
            await page.waitForTimeout(820);
            continue;
        }
        await page.locator('.pixi-battle-viewport canvas').waitFor({ timeout: 10000 });
        const outcome = await finishBattle(page, '星陨高径', captureFirstWild);
        await requireStarfallRidge(page, 'after route3 wild battle');
        if (!captureFirstWild || outcome.caught) return;
    }
    throw new Error(captureFirstWild ? 'route3 did not produce a winnable capturable encounter within the observation budget' : 'route3 did not trigger a normal wild encounter within the observation budget');
}

async function recruitRoute3PveTeam(page: Page): Promise<void> {
    // The fresh save starts with only one level-5 starter, while the next existing
    // story trainer is a simultaneous 2v2 at levels 11-12. Catch two normal Route3
    // encounters and select them through the regular TeamView before challenging
    // the trainer. This is the real player progression path, rather than a retry
    // loop that asks one starter to win an unwinnable composition.
    for (let recruit = 0; recruit < 2; recruit++)
        await resolveRoute3WildBattle(page, true);
    await addRosterToPveTeam(page, '星陨高径');
}
async function resolveSeaRouteWildBattle(page: Page): Promise<void> {
    // `sea-route` has encounterFloor, so this ordinary pair of walkable natural
    // floor cells verifies the existing sea encounter rule through GPU World ->
    // GPU Battle -> GPU World without adding a renderer-owned encounter path.
    await moveTo(page, 'sea-route', { x: 8, y: 9 });
    assert((await worldBehavior(page)).encounterEligible, 'sea-route natural floor was not encounter-eligible under the normal map rule');
    for (let attempt = 0; attempt < 72; attempt++) {
        await press(page, attempt % 2 === 0 ? 'ArrowUp' : 'ArrowDown');
        for (let retry = 0; retry < 8 && await page.locator('.battle').count() === 0; retry++) await page.waitForTimeout(90);
        if (await page.locator('.battle').count() === 0) {
            await page.waitForTimeout(820);
            continue;
        }
        await page.locator('.pixi-battle-viewport canvas').waitFor({ timeout: 10000 });
        await finishBattle(page, '静潮群岛');
        await requireStilltideIsles(page, 'after sea-route wild battle');
        return;
    }
    throw new Error('sea-route did not trigger a normal natural-floor encounter within the observation budget');
}
async function completeStilltideGateObservation(page: Page): Promise<void> {
    // Complete the existing observatory story entirely through normal UI so the
    // route to the newly gated map remains an authenticated player path.
    await requireWorld(page, '星陨观测所', 'observatory entry before Stilltide path');
    // This is an existing real AI battle. Retry only through the same normal
    // NPC dialogue / choice path after a loss; never write story flags or forge
    // a victory for the renderer observation.
    let cartographerResult: WorldBehaviorDiagnostics | null = null;
    let cartographerBattleResult = '';
    for (let attempt = 0; attempt < STORY_BATTLE_RETRY_LIMIT; attempt++) {
        await moveTo(page, 'mt-moon', { x: 10, y: 8 });
        assert((await worldBehavior(page)).nearbyNpcId === 'sky-cartographer', 'sky cartographer was not adjacent on the normal Stilltide route');
        await press(page, 'e');
        await advanceToChoices(page);
        await page.getByRole('button', { name: '接受星图试炼' }).click();
        await page.locator('.battle').waitFor({ timeout: 10000 });
        await page.locator('.pixi-battle-viewport canvas').waitFor({ timeout: 10000 });
        cartographerBattleResult = (await finishBattle(page, '星陨观测所')).resultText;
        cartographerResult = await worldBehavior(page);
        if (cartographerResult.activeQuest !== 'challenge-cartographer') break;
        if (attempt === STORY_BATTLE_RETRY_LIMIT - 1) throw new Error(`cartographer scripted battle did not advance story after normal retries; last result=${cartographerBattleResult}; state=${JSON.stringify(cartographerResult)}`);
    }
    assert(cartographerResult && cartographerResult.activeQuest !== 'challenge-cartographer', `cartographer scripted battle did not advance story after normal retries; result=${cartographerBattleResult}; state=${JSON.stringify(cartographerResult)}`);
    const lensApproaches = [{ x: 8, y: 6 }, { x: 7, y: 5 }, { x: 9, y: 5 }, { x: 8, y: 4 }];
    let lensState = await worldBehavior(page);
    for (const approach of lensApproaches) {
        await moveTo(page, 'mt-moon', approach);
        lensState = await worldBehavior(page);
        if (lensState.nearbyObjectId === 'observatory-lens') break;
    }
    assert(lensState.nearbyObjectId === 'observatory-lens', `observatory lens was not adjacent on the normal Stilltide route (${JSON.stringify(lensState)})`);
    await press(page, 'e');
    await advanceToChoices(page);
    await page.getByRole('button', { name: '校准星镜' }).click();
    await page.locator('.battle').waitFor({ timeout: 10000 });
    await page.locator('.pixi-battle-viewport canvas').waitFor({ timeout: 10000 });
    await finishBattle(page, '星陨观测所');
    const lensAligned = await worldBehavior(page);
    assert(lensAligned.activeQuest === 'eastbound-signal' && lensAligned.objectIds.length === 0, `observatory lens did not unlock the existing eastbound path (${JSON.stringify(lensAligned)})`);
    await enterWarp(page, 'mt-moon', { x: 8, y: 1 }, 'ArrowUp', '赤砾裂谷');
    await requireRedRiftCanyon(page, 'canyon entry before Stilltide gate');
    await enterWarp(page, 'rock-tunnel', { x: 8, y: 1 }, 'ArrowUp', '静潮群岛');
    let state = await requireStilltideIsles(page, 'Stilltide formal config-gate entry');
    assert(state.activeQuest === 'eastbound-signal' && state.npcIds.join(',') === 'tide-captain' && state.objectIds.length === 0, `Stilltide entry DTO/state mismatch (${JSON.stringify(state)})`);
    await resolveSeaRouteWildBattle(page);
    // The outer reef is not part of generic map walkability. Before operating the
    // existing tide gauge, a real move into it must remain blocked at high tide.
    await moveTo(page, 'sea-route', { x: 9, y: 4 });
    const beforeHighTideReef = await worldBehavior(page);
    await press(page, 'ArrowRight');
    const afterHighTideReef = await worldBehavior(page);
    assert(beforeHighTideReef.position.x === 9 && beforeHighTideReef.position.y === 4 && afterHighTideReef.position.x === 9 && afterHighTideReef.position.y === 4, `high-tide reef collision changed under GPU observation (${JSON.stringify({ beforeHighTideReef, afterHighTideReef })})`);
    await moveTo(page, 'sea-route', { x: 7, y: 10 });
    assert((await worldBehavior(page)).nearbyNpcId === 'tide-captain', 'tide captain was not adjacent at the normal sea-route tile');
    await press(page, 'e');
    await dismissDialog(page);
    state = await requireStilltideIsles(page, 'after tide captain briefing');
    assert(state.activeQuest === 'find-ship-log' && state.objectIds.join(',') === 'tide-gauge', `tide captain did not expose the existing tide-gauge DTO (${JSON.stringify(state)})`);
    // Approach from the north instead of pathing through the captain at (6,10).
    await moveTo(page, 'sea-route', { x: 4, y: 9 });
    assert((await worldBehavior(page)).nearbyObjectId === 'tide-gauge', 'tide gauge was not adjacent at the normal sea-route tile');
    await press(page, 'e');
    await advanceToChoices(page);
    await page.getByRole('button', { name: '切换为低潮' }).click();
    state = await requireStilltideIsles(page, 'after tide-gauge low-tide selection');
    assert(state.activeQuest === 'find-ship-log' && state.objectIds.join(',') === 'tide-gauge,ship-log' && state.npcIds.join(',') === 'tide-captain,chart-apprentice', `low-tide DTO visibility changed outside the existing story path (${JSON.stringify(state)})`);
    // This planner allowance only mirrors the already selected low-tide rule; every
    // resulting step is still dispatched to WorldView's existing keyboard handler.
    await moveTo(page, 'sea-route', { x: 11, y: 4 }, true);
    assert((await worldBehavior(page)).nearbyObjectId === 'ship-log', 'ship log was not adjacent after the existing low-tide reef crossing');
    await press(page, 'e');
    await dismissDialog(page);
    state = await requireStilltideIsles(page, 'after ship-log interaction');
    assert(state.activeQuest === 'meet-reef-keeper' && state.objectIds.join(',') === 'tide-gauge', `ship log did not preserve the existing story progression (${JSON.stringify(state)})`);
    await enterWarp(page, 'sea-route', { x: 8, y: 1 }, 'ArrowUp', '潮洞', true);
    await requireTideCave(page, 'sea-route boat warp');
    await enterWarp(page, 'dragon-den', { x: 8, y: 13 }, 'ArrowDown', '静潮群岛');
    await requireStilltideIsles(page, 'tide-cave boat return');
    await enterWarp(page, 'sea-route', { x: 8, y: 13 }, 'ArrowDown', '赤砾裂谷');
    await requireRedRiftCanyon(page, 'sea-route cave return');
}

async function enterStarfallRidgeObservation(page: Page): Promise<void> {
    // The tower doorway at (7,4) is a real optional warp. Route around it with
    // regular keys before taking the existing north route instead of mutating save
    // position or disabling the tower switch.
    const palletStart = await worldBehavior(page);
    assert(palletStart.mapId === 'pallet' && palletStart.position.x === 7 && palletStart.position.y === 6, `unexpected post-professor position before ridge route (${JSON.stringify(palletStart)})`);
    // Use the same static-map planner as every other crossing: it reaches the
    // ordinary north exit from the professor-return position without touching the
    // optional tower doorway at (7,4), then takes the normal pallet -> route1 warp.
    await enterWarp(page, 'pallet', { x: 8, y: 1 }, 'ArrowUp', '萤火林道');
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
    await recruitRoute3PveTeam(page);
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
        // Persisting the newly created save can leave the old /new DOM briefly
        // attached while the router already reports /world. Wait for the actual
        // WorldView heading rather than a potentially stale role locator.
        await page.waitForFunction(() => document.querySelector('.world h2')?.textContent?.trim() === '雾湾镇', undefined, { timeout: STARTUP_UI_TIMEOUT_MS });
        await dismissDialog(page);
        // Enter the renderer observation URL only after normal login/new-game routing    
        // is complete. It records metrics only and does not bypass the route guard or    
        // enable a renderer-local observation only; route3 now relies on its
        // formal config gate rather than a pending-map diagnostic.
        await page.goto(`${BASE_URL}/world?renderer-observation=1`, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => document.querySelector('.world h2')?.textContent?.trim() === '雾湾镇', undefined, { timeout: STARTUP_UI_TIMEOUT_MS });
        await dismissDialog(page);
        // Complete the normal gated opening through the default GPU WorldView.
        // The route1 path reaches viridian-forest through its formal config gate,
        // without a map-specific diagnostic override or a Canvas mode switch.
        await page.locator('.pixi-world-viewport canvas').waitFor({ timeout: 10000 });
        await unlockRoute1(page);
        const beforeHeap = await readHeap(page);
        await completeChapterOne(page);
        await enterStarfallRidgeObservation(page);
        await completeStilltideGateObservation(page);
        const afterHeap = await readHeap(page);
        const report = await page.evaluate(() => window.__PO_RENDERER_OBSERVATION__?.()) as ObservationReport | undefined;
        assert(report, 'missing playable renderer observation report');
        const summary = validate(report);
        const heapDeltaBytes = afterHeap - beforeHeap;
        assert(heapDeltaBytes < 32 * 1024 * 1024, `playable World → Battle → World heap growth exceeded 32 MiB (${heapDeltaBytes})`);
        await writeFile(REPORT_PATH, `${JSON.stringify({ username, beforeHeap, afterHeap, heapDeltaBytes, summary, report }, null, 2)}\n`);
        console.log(`✓ playable authenticated formally gated Starfall Ridge + Stilltide Isles WorldView observation: GPU World → Battle → World coverage, ${summary.sampleCount} samples, heap delta ${heapDeltaBytes} bytes, max draw calls ${summary.maxDrawCallTotal}`);
    }
    finally {
        await browser?.close();
        await stop(web);
        await stop(worker);
    }
}
main().catch((error) => { console.error(error); process.exit(1); });
