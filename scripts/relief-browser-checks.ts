import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Page } from 'playwright-core';
declare global {interface Window {__RELIEF_FIXTURE__:Awaited<ReturnType<typeof import('./relief-browser-fixture.ts').createReliefFixture>>;}}

export async function checkRelief(page:Page,root:string,width?:number) {
  const output=resolve(root,'relief');await mkdir(output,{recursive:true});
  await page.evaluate(async url=>{window.__RELIEF_FIXTURE__=await(await import(/* @vite-ignore */url)).createReliefFixture();},
    `/@fs/${resolve('scripts/relief-browser-fixture.ts').replaceAll('\\','/')}`);
  const samples:unknown[]=[];
  try {
    const sizes=[{width:1440,height:900},{width:1366,height:768},{width:1920,height:1080}];
    assert(width===undefined || sizes.some(size=>size.width===width),'unknown desktop batch size');
    for(const size of sizes.filter(size=>width===undefined || size.width===width)) {
      await page.setViewportSize(size);
      for(const kind of ['world','battle'] as const)for(let index=0;index<(kind==='world'?6:5);index++) {
        const scene=await page.evaluate(({kind,index})=>window.__RELIEF_FIXTURE__.show(kind,index),{kind,index});
        await page.clock.runFor(400);
        const state=await page.evaluate(()=>window.__RELIEF_FIXTURE__.read());
        assert(state.unchanged,'场景绘制不可改写地图或入口');
        assert.equal(state.diagnostics.canvasCount,1);
        if('staticChildCount' in state.diagnostics)assert(state.diagnostics.staticChildCount<=scene.budget,'地形分层须在配置预算内');
        if('combatantCount' in state.diagnostics)assert.equal(state.diagnostics.combatantCount,6);
        const canvas=await page.locator('canvas').last().boundingBox();
        assert(canvas && canvas.x===0 && canvas.y===0 && canvas.width===size.width && canvas.height===size.height);
        await page.screenshot({path:resolve(output,`${kind}-${scene.id}-${size.width}.png`)});
        samples.push({kind,scene,size,...state});
        console.log(`✓ relief ${kind}/${scene.id} ${size.width}`);
      }
    }
    await writeFile(resolve(output,width ? `report-${width}.json` : 'report.json'),JSON.stringify({runId:process.env.PO_VERIFICATION_RUN_ID,passed:true,samples},null,2));
  } finally {await page.evaluate(()=>window.__RELIEF_FIXTURE__.destroy());}
}
