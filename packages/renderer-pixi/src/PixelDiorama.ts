import { PixelGraphics } from './PixelGraphics.ts';

/** 有限色阶、左上受光的像素体积构件。坐标属于表现层，不建立碰撞。 */
export function tone(color: string | number, amount: number): number {
  const value = typeof color === 'number' ? color : Number.parseInt(color.replace('#', ''), 16);
  const mix = (shift: number) => Math.round(((value >> shift) & 255) * (1 - Math.abs(amount)) + (amount > 0 ? 255 : 0) * Math.abs(amount));
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

export class PixelDiorama {
  readonly g = new PixelGraphics();
  private seed: number;
  constructor(seed = 91) { this.seed = seed; }
  random(): number { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }
  rect(x: number, y: number, w: number, h: number, color: string | number, alpha = 1): this {
    if (w <= 0 || h <= 0) return this;
    this.g.rect(Math.round(x / 2) * 2, Math.round(y / 2) * 2, Math.max(2, Math.round(w / 2) * 2), Math.max(2, Math.round(h / 2) * 2)).fill({ color, alpha });
    return this;
  }
  poly(points: number[], color: string | number, alpha = 1): this {
    this.g.poly(points.map(v => Math.round(v / 2) * 2)).fill({ color, alpha }); return this;
  }
  shadow(x: number, y: number, w: number, h: number): void {
    this.poly([x-w*.5,y-h*.25,x+w*.5,y-h*.25,x+w*.85,y+h*.65,x-w*.1,y+h*.65],0x132e35,.24);
    this.g.ellipse(x,y,w*.46,h*.26).fill({color:0x111d28,alpha:.22});
  }
  flecks(x: number,y: number,w: number,h: number,color: string | number,count: number,alpha=.32): void {
    for(let i=0;i<count;i++) {
      const px=x+this.random()*w, py=y+this.random()*h;
      this.rect(px,py,2+Math.floor(this.random()*3)*2,2,tone(color,i%2?.2:-.16),alpha);
    }
  }
  /** 岸沿／台基的顶面、前立面、右侧面及连续落影。 */
  slab(x: number,y: number,w: number,d: number,h: number,color: string | number): void {
    this.poly([x,y+d,x+w,y+d,x+w+14,y+d+h+9,x+12,y+d+h+9],0x172633,.22);
    this.poly([x+w,y,x+w+10,y-6,x+w+10,y+d+h-6,x+w,y+d+h],tone(color,-.4));
    this.rect(x,y+d,w,h,tone(color,-.24));
    this.rect(x,y,w,d,color);
    this.rect(x,y,w,2,tone(color,.27)); this.rect(x,y+d-2,w,3,tone(color,.16));
    this.rect(x,y+d+h-3,w,3,tone(color,-.46));
    for(let i=0;i<w;i+=24) this.rect(x+i,y+d+4,2,Math.max(2,h-7),tone(color,-.39));
  }
  paving(x: number,y: number,w: number,h: number,color: string | number,unit=28): void {
    this.rect(x,y,w,h,tone(color,-.16));
    for(let row=0;row<h;row+=unit*.55) for(let col=0;col<w;col+=unit) {
      const pw=Math.min(unit-2,w-col),ph=Math.min(unit*.55-2,h-row);
      if(pw<=0||ph<=0) continue;
      const shade=(this.random()-.5)*.12;
      this.rect(x+col,y+row,pw,ph,tone(color,shade));
      this.rect(x+col+2,y+row,Math.max(2,pw-4),2,tone(color,.13));
      if(this.random()>.65)this.rect(x+col+pw*.4,y+row+ph*.5,4,2,tone(color,-.2));
    }
  }
  rock(x: number,y: number,s: number,color: string | number): void {
    this.shadow(x+4,y+3,s*2,s*.6);
    this.poly([x-s,y-6,x-s*.8,y-s*.8,x-s*.15,y-s*1.2,x+s*.65,y-s*.95,x+s,y-8,x+s*.65,y+9,x-s*.5,y+10],tone(color,-.28));
    this.poly([x-s*.8,y-s*.8,x-s*.15,y-s*1.2,x+s*.65,y-s*.95,x+s*.45,y-s*.35,x-s*.18,y-s*.15],tone(color,.18));
    this.poly([x-s,y-6,x-s*.8,y-s*.8,x-s*.18,y-s*.15,x-s*.12,y+8,x-s*.5,y+10],color);
    this.poly([x-s*.18,y-s*.15,x+s*.45,y-s*.35,x+s,y-8,x+s*.65,y+9,x-s*.12,y+8],tone(color,-.08));
    this.rect(x-s*.55,y-s*.74,s*.46,2,tone(color,.36));
    this.poly([x+s*.25,y-s*.43,x+s*.3,y-s*.08,x+s*.65,y],tone(color,-.42));
    for(let i=0;i<8;i++)this.rect(x-s*.65+this.random()*s*1.2,y-s*.55+this.random()*s*.5,2+i%2*2,2,tone(color,i%2?.25:-.32),.65);
  }
  tree(x: number,y: number,s=34,color: string | number=0x487455): void {
    this.shadow(x+s*.3,y+3,s*2.1,s*.9);
    this.rect(x-6,y-s*.8,12,s*.95,0x54473b); this.rect(x-5,y-s*.5,4,s*.6,0xb09257);
    this.poly([x-9,y+5,x-3,y-14,x+4,y-12,x+10,y+7],0x675239);
    const crown=(cx:number,cy:number,rx:number,ry:number,c:string|number)=>{
      for(let row=-ry;row<ry;row+=3) {
        const extent=Math.sqrt(Math.max(0,1-((row+1.5)/ry)**2))*rx;
        this.rect(cx-extent,cy+row,extent*2,3,c);
      }
    };
    crown(x,y-s*1.15,s,s*.81,tone(color,-.42));
    const clusters=[[-.46,-1.24,.54], [.4,-1.11,.6],[-.14,-1.64,.61],[.1,-.83,.58],[-.52,-.77,.4]];
    for(const [cx,cy,r] of clusters) {
      crown(x+cx!*s,y+cy!*s,r!*s,r!*s*.65,tone(color,-.08));
      crown(x+(cx!-.11)*s,y+(cy!-.12)*s,r!*s*.82,r!*s*.48,color);
      crown(x+(cx!-.16)*s,y+(cy!-.23)*s,r!*s*.52,r!*s*.3,tone(color,.23));
    }
    for(let i=0;i<38;i++) {
      const angle=this.random()*Math.PI*2, radius=Math.sqrt(this.random())*s*.83;
      const px=x+Math.cos(angle)*radius,py=y-s*1.25+Math.sin(angle)*radius*.67;
      this.rect(px,py,3+i%3,2,tone(color,i%3===0?.38:-.27),.85);
      if(i%4===0)this.rect(px+2,py-2,2,2,tone(color,.27));
    }
  }
  crystal(x: number,y: number,h: number,color: string | number): void {
    const w=h*.2; this.shadow(x+5,y,w*3,14);
    this.poly([x-w,y-8,x-w*.7,y-h*.75,x,y-h,x+w,y-h*.68,x+w,y,x,y+7],tone(color,-.35));
    this.poly([x-w*.7,y-h*.75,x,y-h,x,y+7,x-w,y-8],tone(color,.25));
    this.poly([x,y-h,x+w,y-h*.68,x+w,y,x,y+7],color);
    this.rect(x-3,y-h*.72,2,h*.54,tone(color,.65));
    this.poly([x-w,y-8,x,y-h*.38,x+w,y-h*.52,x+w,y-h*.42,x,y-h*.27],tone(color,.45),.45);
  }
  column(x:number,y:number,h:number,color:string|number):void {
    this.shadow(x+10,y,44,22); this.slab(x-18,y-6,36,14,8,color);
    this.rect(x-12,y-h,24,h,tone(color,-.15));this.rect(x-10,y-h,7,h,tone(color,.19));
    this.rect(x+7,y-h,5,h,tone(color,-.37));
    for(let i=0;i<h;i+=22)this.rect(x-12,y-h+i,24,2,tone(color,-.27));
    this.slab(x-17,y-h-7,34,12,6,tone(color,.2));
  }
  /** 斜屋面瓦片、檐口厚度、墙面凹窗，保持入口对准给定门轴。 */
  house(x:number,y:number,w:number,h:number,roof:number,doorX=x+w*.58):void {
    const side=18, wallTop=y-h, ridge=wallTop-35;
    this.shadow(x+w*.6,y+8,w*1.3,40);
    this.poly([x+w,wallTop,x+w+side,wallTop-12,x+w+side,y-12,x+w,y],0x8e8066);
    this.rect(x,wallTop,w,h,0xd7c799);this.rect(x,wallTop,w,10,0x877b61);
    this.rect(x,y-9,w,9,0x827b68);
    for(let row=wallTop+18;row<y-10;row+=16) for(let col=x+5;col<x+w-10;col+=22)
      if((Math.round(row+col)%3)!==0)this.rect(col,row,14,2,0xb4a985,.6);
    this.poly([x-8,wallTop-2,x+w*.48,ridge,x+w+side+8,wallTop-12,x+w+6,wallTop+9,x-8,wallTop+9],tone(roof,-.48));
    this.poly([x-10,wallTop-8,x+w*.45,ridge-6,x+w*.45+side,ridge-18,x+w+side+10,wallTop-18,x+w,wallTop+1],tone(roof,-.15));
    this.poly([x-10,wallTop-8,x+w*.45,ridge-6,x+w,wallTop+1],roof);
    for(let row=0;row<5;row++) {
      const top=ridge-2+row*7, left=x+w*.45-(row+1)*w*.11, right=x+w*.45+(row+1)*w*.11;
      this.rect(left,top,right-left,2,tone(roof,-.32));
      for(let col=left+6;col<right-4;col+=12)this.rect(col,top+2,2,4,tone(roof,.21));
    }
    this.poly([x+w*.45,ridge-7,x+w*.45+side,ridge-19,x+w*.45+side+4,ridge-17,x+w*.45+3,ridge-4],tone(roof,.3));
    const window=(wx:number)=>{
      this.rect(wx,wallTop+23,22,28,0x7b725c);this.rect(wx+3,wallTop+25,16,20,0x304d55);
      this.rect(wx+5,wallTop+27,6,8,0xa5d6ce); this.rect(wx+13,wallTop+27,4,8,0x689695);
      this.rect(wx+10,wallTop+25,2,20,0xd5c495);this.rect(wx+3,wallTop+35,16,2,0xd5c495);
      this.rect(wx-2,wallTop+49,26,4,0xe9d7a4);
    };
    if(doorX-x>46)window(x+14);if(x+w-doorX>40)window(x+w-35);
    this.rect(doorX-14,y-43,28,43,0x75694f);this.rect(doorX-10,y-40,20,38,0x253943);
    this.rect(doorX-8,y-37,16,32,0x735b48); this.rect(doorX+5,y-23,2,3,0xe3bd6f);
    this.slab(doorX-19,y,38,8,5,0xb5ac89);
    this.rect(x+w-27,ridge-14,12,23,0x9a8370); this.rect(x+w-29,ridge-17,16,5,0xc7ae8b);
  }
  lighthouse(x:number,y:number,h=144):void {
    this.shadow(x+15,y,75,30);
    this.poly([x-22,y,x-17,y-h,x+14,y-h,x+25,y],0xd9d1ae);
    this.poly([x+4,y-h,x+14,y-h,x+25,y,x+8,y],0xa69e83);
    this.rect(x-13,y-h+18,5,h-25,0xf0e5c4);
    for(let row=0;row<h;row+=18)this.rect(x-15,y-h+row,29,2,0xb2ac91,.7);
    for(const k of [.33,.69]){this.rect(x-3,y-h*k-9,10,18,0x596d70);this.rect(x-1,y-h*k-7,4,10,0xc3e8dd);}
    this.slab(x-27,y-h-4,54,12,7,0x617174);
    this.rect(x-18,y-h-34,36,30,0x3f626b);this.rect(x-13,y-h-29,11,19,0xf5d18c);this.rect(x+1,y-h-29,9,19,0xa7bfa6);
    this.rect(x-20,y-h-11,40,3,0x283e49);this.poly([x-28,y-h-34,x,y-h-54,x+28,y-h-34],0x467b80);
    this.rect(x-2,y-h-62,4,11,0xcfb97c);
  }
}
