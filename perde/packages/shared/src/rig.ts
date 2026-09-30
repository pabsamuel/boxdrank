import { CUSTOM_PUPPET_PREFIX, type Point, type PuppetInput } from './puppet';

/**
 * Turning a family's drawing into a puppet: a few tapped keypoints on the
 * cut-out figure become a basic rig (head, one arm, two legs) that hangs
 * from the neck like a Karagöz figure. Pure functions, so they are testable
 * without a browser; the phone supplies the alpha mask and the taps.
 */

export interface Keypoints {
  /** Top of the head. */
  head: Point;
  /** Where the head meets the body; also the rod point. */
  neck: Point;
  shoulder: Point;
  hand: Point;
  /** Where the legs start. */
  hips: Point;
  /** Optional: feet, for legs that swing when walking. */
  leftFoot?: Point;
  rightFoot?: Point;
}

export interface AlphaMask {
  width: number;
  height: number;
  /** 0..255 per pixel, row-major. */
  data: Uint8Array | Uint8ClampedArray | number[];
}

const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Opaque run length through `at`, measured along the unit direction (dx, dy), in pixels. */
export function thicknessAt(
  mask: AlphaMask,
  at: Point,
  dx: number,
  dy: number,
  threshold = 96,
): number {
  const opaque = (x: number, y: number) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= mask.width || yi >= mask.height) return false;
    return (mask.data[yi * mask.width + xi] ?? 0) >= threshold;
  };
  if (!opaque(at[0], at[1])) return 0;
  let n = 1;
  for (let s = 1; s < Math.max(mask.width, mask.height); s++) {
    if (!opaque(at[0] + dx * s, at[1] + dy * s)) break;
    n++;
  }
  for (let s = 1; s < Math.max(mask.width, mask.height); s++) {
    if (!opaque(at[0] - dx * s, at[1] - dy * s)) break;
    n++;
  }
  return n;
}

/** A rounded strip from a to b with half-width r, as a polygon. */
export function capsulePolygon(a: Point, b: Point, r: number, segments = 8): Point[] {
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const pts: Point[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = angle + Math.PI / 2 + (Math.PI * i) / segments;
    pts.push([a[0] + Math.cos(t) * r, a[1] + Math.sin(t) * r]);
  }
  for (let i = 0; i <= segments; i++) {
    const t = angle - Math.PI / 2 + (Math.PI * i) / segments;
    pts.push([b[0] + Math.cos(t) * r, b[1] + Math.sin(t) * r]);
  }
  return pts.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
}

export interface BuildRigOptions {
  id: string;
  name: string;
  cultureId?: string;
  image: string;
  width: number;
  height: number;
  keypoints: Keypoints;
  mask?: AlphaMask;
  color?: string;
}

/**
 * Basic rig: the head above the neck, an arm from shoulder to hand, legs from
 * the hips to each foot, everything else is the body. Widths come from the
 * mask when given, otherwise from the figure's height.
 */
export function buildRig(o: BuildRigOptions): PuppetInput {
  const { width: w, height: h, keypoints: k } = o;
  const armLen = Math.max(1, dist(k.shoulder, k.hand));
  const dir = [(k.hand[0] - k.shoulder[0]) / armLen, (k.hand[1] - k.shoulder[1]) / armLen] as const;
  const mid: Point = [(k.shoulder[0] + k.hand[0]) / 2, (k.shoulder[1] + k.hand[1]) / 2];
  const measured = o.mask ? thicknessAt(o.mask, mid, -dir[1], dir[0]) : 0;
  const armR = Math.max(h * 0.035, Math.min(h * 0.12, measured ? measured * 0.62 : h * 0.06));
  // The strip reaches a little past the hand so fingers are not cut off.
  const handEnd: Point = [k.hand[0] + dir[0] * armR * 0.8, k.hand[1] + dir[1] * armR * 0.8];
  const headHalf = Math.max(w * 0.15, dist(k.head, k.neck) * 0.9);

  const parts: PuppetInput['parts'] = [
    {
      id: 'body',
      polygon: [
        [0, 0],
        [w, 0],
        [w, h],
        [0, h],
      ],
      pivot: [k.neck[0], k.neck[1]],
      driver: 'lean',
      gain: 2,
    },
    {
      id: 'head',
      polygon: [
        [k.neck[0] - headHalf, Math.min(k.head[1], k.neck[1]) - headHalf],
        [k.neck[0] + headHalf, Math.min(k.head[1], k.neck[1]) - headHalf],
        [k.neck[0] + headHalf, k.neck[1]],
        [k.neck[0] - headHalf, k.neck[1]],
      ],
      parent: 'body',
      pivot: [k.neck[0], k.neck[1]],
      driver: 'talk',
      gain: 5,
    },
    {
      id: 'arm',
      polygon: capsulePolygon(k.shoulder, handEnd, armR),
      parent: 'body',
      pivot: [k.shoulder[0], k.shoulder[1]],
      driver: 'arm',
      gain: dir[0] >= 0 ? -100 : 100,
      rest: 0,
    },
  ];
  const legs: Array<[string, Point | undefined, 'stride' | 'stride-inverse']> = [
    ['leg-left', k.leftFoot, 'stride'],
    ['leg-right', k.rightFoot, 'stride-inverse'],
  ];
  for (const [id, foot, driver] of legs) {
    if (!foot) continue;
    const len = Math.max(1, dist(k.hips, foot));
    const d = [(foot[0] - k.hips[0]) / len, (foot[1] - k.hips[1]) / len] as const;
    const m: Point = [(k.hips[0] + foot[0]) / 2, (k.hips[1] + foot[1]) / 2];
    const t = o.mask ? thicknessAt(o.mask, m, -d[1], d[0]) : 0;
    const r = Math.max(h * 0.035, Math.min(h * 0.12, t ? t * 0.62 : h * 0.06));
    const end: Point = [foot[0] + d[0] * r, foot[1] + d[1] * r];
    parts.push({
      id,
      polygon: capsulePolygon(k.hips, end, r),
      parent: 'body',
      pivot: [k.hips[0], k.hips[1]],
      driver,
      gain: 14,
    });
  }
  return {
    id: o.id.startsWith(CUSTOM_PUPPET_PREFIX) ? o.id : `${CUSTOM_PUPPET_PREFIX}${o.id}`,
    cultureId: o.cultureId ?? 'atelier',
    name: o.name,
    description: 'Drawn at home.',
    width: w,
    height: h,
    image: o.image,
    color: o.color ?? '#f2c94c',
    rod: [k.neck[0], k.neck[1]],
    premium: false,
    parts,
  };
}

/** Bounding box of the opaque pixels, or null for an empty mask. */
export function maskBounds(
  mask: AlphaMask,
  threshold = 96,
): { x: number; y: number; w: number; h: number } | null {
  let minX = mask.width;
  let minY = mask.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      if ((mask.data[y * mask.width + x] ?? 0) >= threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Guess keypoints from the mask alone so the taps start in the right places:
 * head at the top, neck a bit below, hips at 55 % height, feet at the bottom
 * corners of the lower half, shoulder just under the neck, hand at the side.
 */
export function guessKeypoints(mask: AlphaMask): Keypoints | null {
  const b = maskBounds(mask);
  if (!b) return null;
  const cx = b.x + b.w / 2;
  const top = b.y;
  const bottom = b.y + b.h;
  const rowSpan = (y: number): [number, number] | null => {
    const yi = Math.min(mask.height - 1, Math.max(0, Math.round(y)));
    let l = -1;
    let r = -1;
    for (let x = 0; x < mask.width; x++) {
      if ((mask.data[yi * mask.width + x] ?? 0) >= 96) {
        if (l < 0) l = x;
        r = x;
      }
    }
    return l < 0 ? null : [l, r];
  };
  const neckY = top + b.h * 0.2;
  const neckSpan = rowSpan(neckY);
  const neckX = neckSpan ? (neckSpan[0] + neckSpan[1]) / 2 : cx;
  const shoulderY = top + b.h * 0.27;
  const shoulderSpan = rowSpan(shoulderY);
  const shoulder: Point = [shoulderSpan ? shoulderSpan[1] - b.w * 0.08 : cx + b.w * 0.2, shoulderY];
  const handY = top + b.h * 0.55;
  const handSpan = rowSpan(handY);
  const hand: Point = [handSpan ? handSpan[1] - b.w * 0.05 : cx + b.w * 0.35, handY];
  const hipsY = top + b.h * 0.58;
  const hipsSpan = rowSpan(hipsY);
  const hips: Point = [hipsSpan ? (hipsSpan[0] + hipsSpan[1]) / 2 : cx, hipsY];
  const footY = bottom - b.h * 0.04;
  const footSpan = rowSpan(footY);
  const leftFoot: Point = [
    footSpan ? footSpan[0] + (footSpan[1] - footSpan[0]) * 0.25 : cx - b.w * 0.15,
    footY,
  ];
  const rightFoot: Point = [
    footSpan ? footSpan[0] + (footSpan[1] - footSpan[0]) * 0.75 : cx + b.w * 0.15,
    footY,
  ];
  return {
    head: [neckX, top + 1],
    neck: [neckX, neckY],
    shoulder,
    hand,
    hips,
    leftFoot,
    rightFoot,
  };
}
