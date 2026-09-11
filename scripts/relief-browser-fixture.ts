import { WORLD_SCENES, BATTLE_ENVIRONMENTS, MAPS, type BattleEnvironmentId } from '@pokemon-online/config';
import { BattleSim, createWildInstance } from '@pokemon-online/engine';
import { WorldStage } from '../packages/renderer-pixi/src/WorldStage.ts';
import { BattleStage } from '../packages/renderer-pixi/src/BattleStage.ts';

/** 隔离的正式 renderer 截图，不连接存档或改动地图。 */
export async function createReliefFixture() {
  const host=document.createElement('div');
  Object.assign(host.style,{position:'fixed',inset:'0',zIndex:'9999'});document.body.append(host);
  let stage:WorldStage|BattleStage|null=null;
  const before=JSON.stringify(MAPS);
  return {
    async show(kind:'world'|'battle',index:number) {
      stage?.unmount();
      if(kind==='world') {
        const world=new WorldStage(),scene=WORLD_SCENES[index]!;stage=world;
        await world.mount(host);await world.enterScene({sceneId:scene.id,biomeId:scene.biome},scene);
        world.setMotionEnabled(false);
        world.applyWorldSnapshot({time:0,entities:[{id:'player',kind:'player',position:{x:8,y:7},facing:'up'}]});
        return {id:scene.mapId,budget:scene.resources.staticContainerLimit};
      }
      const battle=new BattleStage();stage=battle;
      const biome=Object.keys(BATTLE_ENVIRONMENTS)[index] as BattleEnvironmentId;
      const sim=new BattleSim({mode:'pvp',player:[6,9,94].map(i=>createWildInstance(i,50,{rng:()=>.5})),
        enemy:[3,25,143].map(i=>createWildInstance(i,50,{rng:()=>.5})),seed:904});
      await battle.mount(host);await battle.enterBattle({biomeId:biome,combatants:sim.state.combatants});
      return {id:biome,budget:0};
    },
    read:()=>({diagnostics:stage!.getDiagnostics(),unchanged:JSON.stringify(MAPS)===before}),
    destroy(){stage?.unmount();host.remove();},
  };
}
