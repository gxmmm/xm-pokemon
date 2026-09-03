export function parseHexColor(value: string, fallback = 0xffffff): number {
  const parsed = Number.parseInt(value.replace('#', ''), 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}
