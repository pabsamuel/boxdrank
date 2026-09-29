/** Tiny helpers for authoring puppet parts as SVG path data. */

const f = (n: number) => Number(n.toFixed(1));

export function ellipse(cx: number, cy: number, rx: number, ry: number): string {
  return `M${f(cx - rx)},${f(cy)} a${f(rx)},${f(ry)} 0 1,0 ${f(rx * 2)},0 a${f(rx)},${f(ry)} 0 1,0 ${f(-rx * 2)},0 Z`;
}

export function circle(cx: number, cy: number, r: number): string {
  return ellipse(cx, cy, r, r);
}

export function poly(...points: Array<[number, number]>): string {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${f(x)},${f(y)}`).join(' ') + ' Z';
}

export function rect(x: number, y: number, w: number, h: number): string {
  return poly([x, y], [x + w, y], [x + w, y + h], [x, y + h]);
}

/** A rounded blob through the given points using quadratic curves. */
export function blob(...points: Array<[number, number]>): string {
  if (points.length < 3) return poly(...points);
  const mid = (a: [number, number], b: [number, number]): [number, number] => [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
  ];
  const first = mid(points[points.length - 1]!, points[0]!);
  let d = `M${f(first[0])},${f(first[1])}`;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const next = points[(i + 1) % points.length]!;
    const m = mid(p, next);
    d += ` Q${f(p[0])},${f(p[1])} ${f(m[0])},${f(m[1])}`;
  }
  return d + ' Z';
}
