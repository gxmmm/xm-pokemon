import { Graphics } from 'pixi.js';

/** 像素特效的阶梯轮廓。保留 Graphics 生命周期与材质，避免圆形光斑和平滑圆弧。 */
export class PixelGraphics extends Graphics {
  override arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise = false): this {
    let sweep = endAngle - startAngle;
    if (counterclockwise && sweep > 0) sweep -= Math.PI * 2;
    if (!counterclockwise && sweep < 0) sweep += Math.PI * 2;
    const steps = Math.max(2, Math.min(48, Math.ceil(Math.abs(sweep) * radius / 4)));
    const snap = (value: number) => Math.round(value / 2) * 2;
    this.moveTo(snap(x + Math.cos(startAngle) * radius), snap(y + Math.sin(startAngle) * radius));
    for (let i = 1; i <= steps; i++) {
      const angle = startAngle + sweep * i / steps;
      const previous = startAngle + sweep * (i - 1) / steps;
      this.lineTo(snap(x + Math.cos(angle) * radius), snap(y + Math.sin(previous) * radius))
        .lineTo(snap(x + Math.cos(angle) * radius), snap(y + Math.sin(angle) * radius));
    }
    return this;
  }

  override circle(x: number, y: number, radius: number): this {
    return this.ellipse(x, y, radius, radius);
  }

  override ellipse(x: number, y: number, radiusX: number, radiusY: number): this {
    const rx = Math.abs(radiusX), ry = Math.abs(radiusY);
    if (!rx || !ry) return this;
    const bands = Math.max(3, Math.min(12, Math.ceil(ry / 3)));
    const points: number[] = [];
    // 每条水平带用中点采样宽度，两侧阶梯共用同一个闭合路径。
    const widths = Array.from({ length: bands }, (_, row) => {
      const t = (row + .5) / bands * 2 - 1;
      return Math.max(rx / 6, Math.round(Math.sqrt(1 - t * t) * 6) * rx / 6);
    });
    for (let row = 0; row < bands; row++) {
      points.push(x + widths[row]!, y - ry + row * ry * 2 / bands,
        x + widths[row]!, y - ry + (row + 1) * ry * 2 / bands);
    }
    for (let row = bands - 1; row >= 0; row--) {
      points.push(x - widths[row]!, y - ry + (row + 1) * ry * 2 / bands,
        x - widths[row]!, y - ry + row * ry * 2 / bands);
    }
    return this.poly(points);
  }
}
