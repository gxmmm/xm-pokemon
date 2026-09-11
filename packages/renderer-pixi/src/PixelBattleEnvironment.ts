import type { BattleEnvironmentSpec } from '@pokemon-online/config';
import { Graphics } from 'pixi.js';
import type { BattleEnvironmentView } from './BattleEnvironmentView.ts';
import { BATTLE_DESIGN_WIDTH as W, BATTLE_DESIGN_HEIGHT as H } from './battle-stage-layout.ts';

/** 固定调色板与手绘式像素构件，覆盖全窗口和镜头安全边界。 */
export function drawPixelBattleEnvironment(view: BattleEnvironmentView, spec: BattleEnvironmentSpec): void {
  const p = spec.palette, o = spec.overscan;
  const base = new Graphics(), ground = new Graphics(), scenery = new Graphics(), front = new Graphics();
  const rect = (g: Graphics, x: number, y: number, w: number, h: number, color: string, alpha = 1) =>
    g.rect(Math.round(x / 4) * 4, Math.round(y / 4) * 4, Math.max(4, Math.round(w / 4) * 4), Math.max(4, Math.round(h / 4) * 4)).fill({ color, alpha });
  let seed = 7301;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  rect(base, -o, -o, W + o * 2, H + o * 2, p.ground);
  // 少量碎石与草色块，画面中部保留清晰可读的交战地面。
  for (let i = 0; i < 950; i++) {
    const x = -o + random() * (W + o * 2), y = -o + random() * (H + o * 2);
    if (y < 190 || x < 140 || x > W - 140) continue;
    const quiet = x > W * .16 && x < W * .84 && y > H * .3 && y < H * .88;
    rect(ground, x, y, 4 + random() * 16, 4, i % 3 ? p.groundDetail : p.horizon, quiet ? .20 : .38);
    if (spec.terrain === 'grass' && i % 3 === 0) {
      rect(ground, x + 4, y - 4, 4, 8, p.horizon, quiet ? .22 : .55);
      rect(ground, x + 12, y, 4, 8, p.groundDetail, .55);
    }
  }
  const rock = (g: Graphics, x: number, y: number, s: number) => {
    rect(g, x - s, y + s * .4, s * 2.2, s * .7, p.sky);
    rect(g, x - s, y, s * 2, s, p.horizon);
    rect(g, x - s * .75, y - s * .45, s * 1.5, s, p.groundDetail);
    rect(g, x - s * .5, y - s * .65, s, s * .5, p.mote);
    rect(g, x + s * .45, y - s * .2, s * .35, s * 1.05, p.horizon);
    rect(g, x - s * .5, y + s * .25, s * .9, 4, p.ground);
  };
  const tree = (g: Graphics, x: number, y: number, s: number) => {
    rect(g, x - s, y + s * .7, s * 2, s * .45, p.sky);
    rect(g, x - 8, y, 16, s * 1.2, '#76543b');
    rect(g, x - 4, y + s * .2, 4, s * .8, '#b58a50');
    // 窄水平带构造错位叶冠，边缘为小阶梯，避免整块方盒子。
    const crown = (cx: number, cy: number, rx: number, ry: number, color: string) => {
      for (let row = -ry; row < ry; row += 4) {
        const dy = (row + 2) / ry;
        const width = Math.sqrt(Math.max(0, 1 - dy * dy)) * rx;
        rect(g, cx - width, cy + row, width * 2, 4, color);
      }
    };
    crown(x, y - s * .2, s, s * .8, p.sky);
    crown(x - s * .15, y - s * .38, s * .84, s * .72, p.horizon);
    crown(x - s * .23, y - s * .56, s * .62, s * .54, p.ground);
    crown(x - s * .35, y - s * .7, s * .38, s * .32, p.groundDetail);
    for (let i = 0; i < 12; i++) rect(g, x - s * .6 + random() * s * 1.2, y - s * .75 + random() * s, 8, 4, i % 3 ? p.ground : p.groundDetail);
  };
  if (spec.terrain === 'grass') {
    for (let x = -o; x < W + o; x += 68) tree(scenery, x, 34 + random() * 65, 34 + random() * 16);
    for (let i = 0; i < 8; i++) {
      const x = i < 4 ? -25 + i * 28 : W - 60 + (i - 4) * 28;
      tree(front, x, H - 15 + random() * 60, 40 + random() * 20);
    }
    for (const [x,y] of [[170,185],[1110,230],[90,520],[1190,570]]) rock(scenery,x!,y!,16);
  } else if (spec.terrain === 'water') {
    // 浅滩贯穿交战区，深水沿场边分层；没有天空照片与透视地平线。
    for (let row = -o; row < 180; row += 24) {
      const edge = row + 12 + Math.sin(row * .02) * 8;
      rect(scenery, -o, row, W + 2 * o, 24, row < 110 ? p.sky : p.horizon);
      for (let x = -o; x < W + o; x += 70) rect(scenery, x + random()*30, edge, 24 + random()*30, 4, p.mote, .65);
    }
    for (let i = 0; i < 5; i++) rock(scenery, i % 2 ? W - 24 : 24, 240 + i * 85, 24);
    for (let i = 0; i < 20; i++) rect(front, i * 70, H + 20 + random()*35, 36, 4, p.mote, .6);
  } else {
    // 洞穴、遗迹与竞技场共用石材构件，由各自调色板和地形决定装饰。
    for (let row = -o; row < 124; row += 28) for (let x = -o; x < W + o; x += 64) {
      const shift = Math.round(row/28) % 2 ? 32 : 0;
      rect(scenery, x+shift, row, 60, 24, p.sky);
      rect(scenery, x+shift+4, row+4, 52, 12, p.horizon);
      rect(scenery, x+shift+8, row+4, 32, 4, p.groundDetail);
    }
    for (let i = 0; i < 18; i++) {
      const x = i < 9 ? -70 + random()*180 : W - 80 + random()*180;
      const y = 130 + (i%9)*72;
      rock(i%9 > 6 ? front : scenery, x,y,18+random()*16);
      if (spec.terrain === 'rune') {
        rect(scenery,x-4,y-34,12,40,p.accent);
        rect(scenery,x,y-42,4,40,p.mote);
        rect(scenery,x+8,y-22,8,26,p.groundDetail);
      }
    }
    if (spec.terrain === 'arena') {
      for (let i=0;i<6;i++) {
        const x=140+i*190;
        rect(scenery,x,32,24,100,p.horizon);
        rect(scenery,x+4,36,8,88,p.groundDetail);
        rect(scenery,x-12,24,48,12,p.mote);
        rect(scenery,x+28,32,24,48,p.accent);
      }
    }
  }
  view.background.addChild(base);
  view.groundLayer.addChild(ground);
  view.farBackdrop.addChild(scenery);
  view.foreground.addChild(front);
  // 稀疏方形光点在舞台的统一像素输出中呈现。
  const motes=new Graphics();
  for(let i=0;i<12;i++) rect(motes,random()*W,100+random()*160,4,4,p.mote,.55);
  view.horizonLayer.addChild(motes);
}
