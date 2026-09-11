import type { BattleEnvironmentSpec } from '@pokemon-online/config';
import type { BattleEnvironmentView } from './BattleEnvironmentView.ts';
import { PixelDiorama, tone } from './PixelDiorama.ts';
import { BATTLE_DESIGN_WIDTH as W, BATTLE_DESIGN_HEIGHT as H } from './battle-stage-layout.ts';

/** 像素舞台的地形体积与材质。立面只布置在战区之外，中央不改变脚点平面。 */
export function drawBattleRelief(view:BattleEnvironmentView,spec:BattleEnvironmentSpec):void {
  const p=spec.palette,o=spec.overscan;
  const base=new PixelDiorama(404),floor=new PixelDiorama(104),back=new PixelDiorama(204),front=new PixelDiorama(304),air=new PixelDiorama(504);
  const ground=tone(p.ground,0);
  base.rect(-o,-o,W+o*2,H+o*2,ground);
  // 大块低对比色阶形成受光地面，微材质保持离散像素而非噪声滤镜。
  for(let row=-o;row<H+o;row+=36) {
    const light=Math.max(0,1-Math.abs(row-440)/600)*.045;
    base.rect(-o,row,W+o*2,36,tone(ground,light));
  }
  if(spec.terrain==='grass') {
    // 交战区是浅色土草地，林沿有真实厚度和连续投影。
    for(let i=0;i<65;i++) {
      const x=90+floor.random()*(W-180),y=200+floor.random()*(H-200);
      const width=30+floor.random()*100,height=12+floor.random()*32;
      floor.poly([x-width*.6,y,x-width*.4,y-height*.45,x+width*.35,y-height*.6,x+width*.55,y,x+width*.2,y+height*.45,x-width*.3,y+height*.35],tone(ground,i%3===0?.08:-.055),.22);
      floor.flecks(x-width*.3,y-height*.25,width*.6,height*.5,p.groundDetail,8,.21);
    }
    for(let i=0;i<760;i++) {
      const x=-o+floor.random()*(W+o*2),y=195+floor.random()*(H+o-195);
      if(x<100||x>W-100)continue;
      floor.rect(x,y,2+i%3*2,2,tone(ground,i%2?.21:-.18),.5);
      if(i%6===0){floor.rect(x+2,y-4,2,6,tone(ground,-.21),.65);floor.rect(x+4,y-2,2,4,tone(ground,.28),.6);}
    }
    back.slab(-o,88,W+o*2,61,28,tone(ground,-.12));
    for(let x=-o;x<W+o;x+=49)back.rock(x+back.random()*12,157+Math.sin(x*.015)*10,16+back.random()*18,0x778670);
    for(let row=0;row<2;row++)for(let x=-o;x<W+o;x+=77)back.tree(x+row*32,45+row*69+back.random()*16,35+back.random()*11,row?0x426946:0x365747);
    for(const [x,y] of [[86,277],[W-70,340],[110,609],[W-48,621]]) {
      back.rock(x!,y!,24,0x7f8d73);back.tree(x!-26,y!-20,35,0x4c7549);
    }
    for(const x of [-30,32,96,W-70,W+4])front.tree(x,H+75,55,0x365e42);
    for(let i=0;i<20;i++) {
      const x=i<10?front.random()*140:W-140+front.random()*140,y=H-20+front.random()*50;
      front.rect(x,y-7,2,10,0x63884b);front.rect(x-3,y-9,6,4,i%3?0xa6bf78:0xe8ce94);
    }
  } else if(spec.terrain==='water') {
    // 交战地面为连续浅滩；远端深水、湿沙和侵蚀岩台各占一层。
    base.rect(-o,-o,W+2*o,175+o,0x214d65);
    for(let x=-o;x<W+o;x+=12) {
      const edge=158+Math.sin(x*.008)*19+Math.sin(x*.026)*7;
      for(let band=0;band<8;band++)back.rect(x,edge+band*8,12,9,tone(ground,-.28+band*.04));
      if(Math.sin(x*.03)>.55)back.rect(x,edge+60,10,2,p.groundDetail,.3);
    }
    for(const x of [115,310,W-270,W-85])back.rock(x,165+Math.sin(x*.008)*19,14+back.random()*13,0x82958c);
    for(let i=0;i<260;i++) {
      const x=-o+floor.random()*(W+o*2),y=210+floor.random()*(H+o-210),len=8+floor.random()*31;
      floor.poly([x,y,x+len*.5,y-3,x+len,y,x+len-4,y+2,x+len*.5,y-1,x,y+2],p.groundDetail,.15+floor.random()*.17);
    }
    for(let i=0;i<80;i++) {
      const x=back.random()*W,y=40+back.random()*148;
      back.rect(x,y,10+back.random()*40,2,0x8bc6c9,.42);
    }
    for(let i=0;i<8;i++) {
      const left=i<4,x=left?75+(i%4)*18:W-118+(i%4)*18,y=210+(i%4)*126;
      back.slab(x-26,y-42,58,35,27,0x9aab9b);back.rock(x,y-30,27,0x8da9a1);
      back.rect(x-27,y+1,62,3,0xc3ded0,.7);back.rect(x-16,y+8,32,2,p.mote,.6);
    }
    for(let i=0;i<90;i++) {
      const x=150+floor.random()*(W-300),y=230+floor.random()*490;
      floor.poly([x-6,y,x-2,y-4,x+8,y-2,x+6,y+4,x-4,y+4],0x455f58,.13);
      floor.rect(x-2,y-4,7,2,0xc1c7a1,.18);
    }
    for(let x=-o;x<W+o;x+=54)front.rect(x,H+15+Math.sin(x*.013)*9,34,3,p.mote,.36);
  } else {
    const stone=spec.terrain==='rune'?0x716380:spec.terrain==='arena'?0x9b967d:0x776e72;
    // 透视密度：远处铺石更短，接近画面底部逐渐变宽，中央维持低对比。
    for(let y=200,row=0;y<H+o;row++) {
      const height=18+Math.max(0,y-180)*.03,width=height*2.5;
      for(let x=-o-row%2*width*.5;x<W+o;x+=width) {
        floor.poly([x+2,y+2,x+width-3,y+2,x+width+3,y+height-2,x-3,y+height-2],tone(ground,(floor.random()-.5)*.085));
        floor.rect(x+4,y+2,width-9,2,tone(ground,.16),.45);
        if(floor.random()>.55)floor.rect(x+width*.6,y+height*.6,6,2,tone(ground,-.21),.5);
      }
      y+=height;
    }
    if(spec.terrain==='stone') {
      // 岩洞保留不规则自然崖壁，剖面层理与柱状石笋不用城墙构件替代。
      back.rect(-o,-o,W+2*o,170+o,0x242734);
      for(let x=-o;x<W+o;) {
        const width=74+back.random()*110,foot=143+back.random()*42,shoulder=35+back.random()*40;
        back.poly([x,-o,x+width,-o,x+width+12,foot-22,x+width*.66,foot+6,x+18,foot-4,x-8,shoulder],0x514d5c);
        back.poly([x,-o,x+width*.55,-o,x+width*.42,shoulder,x+width*.68,foot-30,x+18,foot-4,x-8,shoulder],0x706974);
        back.poly([x+width*.55,-o,x+width,-o,x+width-14,shoulder+30,x+width*.42,shoulder],0x88808a);
        back.poly([x+18,shoulder+23,x+width*.5,shoulder+8,x+width*.72,shoulder+28,x+width*.5,shoulder+19,x+22,shoulder+30],0x393a49);
        back.flecks(x+12,shoulder+34,width*.55,foot-shoulder-48,0x93898c,14,.4);
        back.rock(x+width*.58,foot+12,18+back.random()*24,0x7e7378);
        x+=width-10;
      }
      for(const x of [55,135,W-140,W-40]) {
        back.rock(x,310+back.random()*100,46,0x73686d);
        back.crystal(x+9,288,24,p.accent);
      }
      for(const x of [24,100,W-100,W-10])front.rock(x,H+64,80,0x56505e);
    } else if(spec.terrain==='rune') {
      // 断裂台基、局部晶簇与柱体组成遗迹轮廓。
      back.rect(-o,-o,W+o*2,140+o,0x211e38);
      back.slab(-o,75,W+2*o,62,36,stone);
      back.paving(-o,78,W+2*o,56,tone(stone,.12),64);
      for(let i=0;i<7;i++) {
        const x=75+i*190;
        back.column(x,139,70+i%3*18,stone);
        if(i%2===0){back.crystal(x+25,154,62,p.accent);back.crystal(x+48,162,32,0x9f8bc7);}
      }
      for(const x of [45,110,W-110,W-40]) {
        back.rock(x,300+back.random()*300,29,stone);
        back.crystal(x+8,335+back.random()*225,49,0xa88ac7);
      }
      for(const x of [12,86,W-76,W+12]){front.slab(x-35,H+12,68,38,30,stone);front.crystal(x,H+32,74,0x8e769f);}
    } else {
      // 竞技场看台具有斜阶座席、厚实檐口和拱门暗部。
      back.rect(-o,-o,W+2*o,146+o,0x39434c);
      for(let tier=0;tier<4;tier++) {
        const y=28+tier*32;
        back.slab(-o,y,W+o*2,23,9,tone(stone,-.05-tier*.035));
        for(let x=-o;x<W+o;x+=38)back.rect(x+4,y+5,26,10,tone(stone,-.31));
      }
      for(let i=0;i<6;i++) {
        const x=85+i*220;
        back.column(x,172,140,stone);
        back.poly([x+22,65,x+51,65,x+51,119,x+36,109,x+22,119],i%2?0x49797b:0x965e60);
        back.rect(x+25,69,23,3,0xd5c084);back.rect(x+34,75,5,28,0xd5c084,.8);
      }
      for(const x of [25,W-40]){back.column(x,420,94,stone);front.column(x,H+75,120,tone(stone,-.1));}
    }
  }
  // 局部掠射光以低透明度分层，斜向与物体投影保持一致。
  for(let i=0;i<4;i++)air.poly([120+i*4,-40,168+i*8,-40,650+i*20,310,585+i*20,310],p.mote,.012);
  for(let i=0;i<12;i++)air.rect(180+air.random()*(W-360),145+air.random()*80,2,2,p.mote,.55);
  view.background.addChild(base.g);view.farBackdrop.addChild(back.g);view.groundLayer.addChild(floor.g);
  view.horizonLayer.addChild(air.g);view.foreground.addChild(front.g);
}
