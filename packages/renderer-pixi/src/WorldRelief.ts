import type { WorldReliefLayout, WorldScenePalette } from '@pokemon-online/config';
import { PixelDiorama, tone } from './PixelDiorama.ts';

const OX=160, OY=110, CW=64, CH=40;

/** 格子中心与角色投影完全一致。高物体只画在障碍格，台阶只画在出口格。 */
export function drawWorldRelief(layout: WorldReliefLayout,p: WorldScenePalette) {
  const floor=new PixelDiorama(201), backdrop=new PixelDiorama(83), front=new PixelDiorama(27);
  const rows=layout.tiles.map((_,row)=>new PixelDiorama(900+row));
  const harbor=layout.style==='harbor', width=layout.tiles[0]!.length*CW, height=layout.tiles.length*CH;
  const left=OX-CW/2,top=OY-CH/2;
  const ground=tone(p.ground,0),stone=harbor?0x8e9680:ground;
  // 连续全景中的地台有外露立面；地台边缘位于不可走的外围格之外。
  if(!harbor) {
    floor.slab(34,top-10,1220,height+38,32,tone(ground,-.2));
    floor.paving(38,top-6,1212,height+30,tone(ground,-.17),48);
    floor.slab(left-10,top-6,width+20,height+10,26,tone(ground,-.08));
  }
  else {
    // 大陆向窗口四边延伸，房屋与灯塔共享陆地，海岸只在南侧出现。
    floor.slab(-200,650,1680,4,19,0x8b9274);
    floor.flecks(-100,0,1480,650,ground,760,.35);
  }
  for(let row=0;row<layout.tiles.length;row++) for(let col=0;col<layout.tiles[row]!.length;col++) {
    const tile=layout.tiles[row]![col]!, x=OX+col*CW-CW/2, y=OY+row*CH-CH/2;
    if(harbor) {
      floor.rect(x,y,CW,CH,tone(ground,((row*17+col*7)%5-2)*.008));
      floor.flecks(x+2,y+2,CW-4,CH-4,ground,9,.5);
    } else {
      floor.paving(x,y,CW,CH,ground,32);
      // 稀疏磨损、苔斑与铜嵌条有不同材质；不改变可走平面。
      if(layout.style==='moss' && (col+row)%3===0)floor.flecks(x,y,CW,CH,0x8fad73,9,.6);
      if(layout.style==='tidal')floor.rect(x+10,y+CH-4,38,2,p.accent,.17);
      if(layout.style==='forge' && col%4===0)floor.rect(x+2,y,2,CH,0xc0a479,.5);
      if(layout.style==='astral' && col%3===0 && row%3===0)floor.poly([x+26,y+10,x+34,y+16,x+26,y+22,x+18,y+16],p.accent,.4);
    }
    if(tile===4 || tile===5) {
      if(harbor) {
        // 磨损踏石融入草地，避免把不连续的小路格画成孤立方砖板。
        for(let i=0;i<3;i++) {
          const sx=x+8+i*16+(row%2)*3,sy=y+10+i%2*13;
          floor.poly([sx-3,sy+3,sx,sy-3,sx+12,sy-3,sx+16,sy+4,sx+12,sy+9,sx,sy+8],tone(p.path,-.13));
          floor.rect(sx+1,sy-2,10,2,tone(p.path,.08));
          floor.rect(sx+3,sy+3,7,2,tone(p.path,-.25),.4);
        }
      } else floor.paving(x+2,y+2,CW-4,CH-4,p.path,22);
    }
    if(tile===2) {
      floor.rect(x,y,CW,CH,0x366e80);floor.rect(x,y+13,CW,CH-13,0x285768);
      for(let i=0;i<6;i++)floor.rect(x+floor.random()*CW,y+floor.random()*CH,8+floor.random()*14,2,0x83bab8,.45);
      if(layout.tiles[row-1]?.[col]!==2){floor.rect(x,y,CW,5,0xa9c4a0);floor.rect(x,y+5,CW,3,0x74a9a2);}
    }
    if(tile===11 || tile===13) {
      floor.rect(x,y,CW,CH,0x4d594e);
      for(let plank=0;plank<5;plank++) {
        floor.rect(x+2,y+plank*8,CW-4,6,plank%2?0x9e8b60:0xb09b6a);
        floor.rect(x+5,y+plank*8+1,CW-10,2,0xc4ad79,.8);
        floor.rect(x+7,y+plank*8+3,2,2,0x605b4a);floor.rect(x+CW-9,y+plank*8+3,2,2,0x605b4a);
      }
      if(layout.tiles[row+1]?.[col]===2) {
        const edge=rows[row]!;
        edge.rect(x+3,y+CH-5,6,18,0x564f3e);edge.rect(x+3,y+CH-7,6,4,0xc6b18a);
        edge.rect(x+CW-9,y+CH-5,6,18,0x564f3e);edge.rect(x+CW-9,y+CH-7,6,4,0xc6b18a);
      }
    }
    if(tile===3 || tile===8) for(let i=0;i<8;i++) {
      const px=x+5+floor.random()*(CW-10),py=y+7+floor.random()*(CH-10);
      floor.rect(px,py,2,6,0x355b40);floor.rect(px-2,py+2,6,2,0x739650);
      if(tile===8){floor.rect(px-2,py-2,6,4,i%2?0xeed58c:0xc89fc0);floor.rect(px,py-2,2,2,0xffedb3);}
    }
    if(tile===10) {
      const sign=rows[row]!;sign.rect(x+30,y+9,4,24,0x624e39);sign.rect(x+18,y+5,28,17,0xddd0a0);
      sign.rect(x+21,y+8,22,3,0x6c6653);sign.rect(x+21,y+14,14,2,0x8e8564);
    }
    const object=rows[row]!;
    if(tile===1) {
      if(harbor)object.tree(x+CW*.5,y+CH*.65,28+(col*7+row)%9,0x4e784b);
      else {
        const wallHeight=row===0?60:26;
        object.slab(x,y-wallHeight,CW,CH,wallHeight,stone);
        object.paving(x+2,y-wallHeight+2,CW-4,CH-4,tone(stone,.13),32);
        if((col+row)%3===0)object.rect(x+10,y-wallHeight+7,16,4,p.accent,.34);
        if(row===0 && col%3===1)object.column(x+32,y+CH,74,stone);
      }
    }
    if(tile===6) {
      if(layout.style==='crystal') {
        object.rock(x+34,y+27,20,stone);object.crystal(x+23+(row%3)*3,y+24,35+(col*7+row)%22,p.accent);
        if((col+row)%3!==0)object.crystal(x+44,y+29,22+(row*5)%12,tone(p.accent,-.18));
      } else if(layout.style==='forge') {
        object.slab(x+13,y-8,38,24,16,stone); object.rect(x+18,y+2,28,8,0x33313a);
        for(let i=0;i<4;i++)object.rect(x+21+i*5,y-5-i%2*5,4,10+i%2*5,i%2?0xffd98b:0xcb734d);
      } else if(layout.style==='astral') {
        object.column(x+32,y+29,51,stone);object.crystal(x+32,y-24,23,p.accent);
      } else {
        object.rock(x+30,y+28,25,stone);object.rock(x+48,y+31,12,tone(stone,-.1));
        if(layout.style==='moss')object.flecks(x+13,y+4,30,12,0x9eba75,10,.8);
        if(layout.style==='tidal')object.crystal(x+24,y+15,22,p.accent);
      }
    }
    if(tile===7 || tile===12) {
      const stairs=rows[row]!;
      floor.paving(x+8,y,CW-16,CH,p.path,24);
      for(let step=0;step<4;step++) {
        stairs.rect(x+10,y+step*8,CW-20,7,tone(p.path,.08-step*.08));
        stairs.rect(x+10,y+step*8,CW-20,2,tone(p.path,.3));
      }
      stairs.rect(x+2,y-9,5,38,tone(stone,-.12));stairs.rect(x+CW-7,y-9,5,38,tone(stone,-.12));
      stairs.rect(x+2,y-12,5,5,p.accent);stairs.rect(x+CW-7,y-12,5,5,p.accent);
    }
  }
  if(harbor) {
    // 合并建筑格，门轴来自实际门格。不会把装饰房屋放到可行走道路中。
    const buildingCells=layout.tiles.flatMap((row,y)=>row.flatMap((tile,x)=>tile===9?[{x,y}]:[]));
    if(buildingCells.length) {
      const minX=Math.min(...buildingCells.map(c=>c.x)),maxX=Math.max(...buildingCells.map(c=>c.x));
      const maxY=Math.max(...buildingCells.map(c=>c.y));
      const door=layout.tiles.flatMap((row,y)=>row.flatMap((tile,x)=>tile===7?[{x,y}]:[]))[0];
      const bx=OX+minX*CW-CW/2,by=OY+maxY*CH+CH/2;
      rows[maxY]!.house(bx,by,(maxX-minX+1)*CW,76,0x536c8f,OX+(door?.x??maxX)*CW);
      rows[maxY]!.crystal(bx+54,by-104,30,0xbaabd8);
    }
    // 远岸建筑位于地图外，不产生与逻辑道路矛盾的装饰障碍。
    backdrop.lighthouse(1212,270,140);
    backdrop.house(12,390,84,64,0x527c7a);
    backdrop.house(15,530,88,57,0x96745e);
    backdrop.slab(8,531,92,14,15,0x9a9f84);
    for(let i=0;i<30;i++) {
      const x=-80+backdrop.random()*1440,y=675+backdrop.random()*100;
      front.rect(x,y,12+backdrop.random()*35,2,0x9ac6c1,.35);
    }
  } else {
    // 外沿立柱落在连续外台上，以不同构件区分五层。
    for(const x of [70,1220]) {
      backdrop.column(x,300,150,tone(stone,-.2));
      backdrop.column(x,550,95,tone(stone,-.2));
      if(layout.style==='crystal'||layout.style==='astral')backdrop.crystal(x,184,45,p.accent);
      else if(layout.style==='moss')backdrop.tree(x,175,28,0x53745a);
      else {backdrop.rect(x-9,160,18,24,p.accent,.8);backdrop.rect(x-5,155,8,17,tone(p.accent,.4));}
    }
  }
  // 柔和接地暗部在地面层，亮部以碎色阶构成，不覆盖角色与界面。
  for(let i=0;i<22;i++)floor.rect(left+i*4,top+3+i*3,width-i*8,2,0x142c31,.012);
  return {floor:floor.g,backdrop:backdrop.g,front:front.g,rows:rows.map((p,i)=>{p.g.zIndex=OY+i*CH+13;return p.g;})};
}
