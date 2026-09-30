import type { AlphaMask } from '@perde/shared';

/**
 * Turns a photo of a drawing on paper into a cut-out with transparency, on
 * the phone, with no server: estimate the paper colour from the borders,
 * mark everything that differs as figure, drop what is connected to the
 * border (the paper), keep the biggest blob, feather the edge.
 */

export interface CutoutResult {
  /** Transparent PNG data URL, cropped to the figure with a little padding. */
  image: string;
  width: number;
  height: number;
  mask: AlphaMask;
  /** 0..1 share of the frame the figure covers, for sanity checks. */
  coverage: number;
}

export interface CutoutOptions {
  /** Longest side of the working image. */
  maxSize?: number;
  /** How different from the paper a pixel must be (0..255 scale). */
  threshold?: number;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

/** Paper colour: the median of a 4 % border strip. */
export function estimatePaper(
  px: Uint8ClampedArray,
  w: number,
  h: number,
): [number, number, number] {
  const r: number[] = [];
  const g: number[] = [];
  const b: number[] = [];
  const strip = Math.max(2, Math.round(Math.min(w, h) * 0.04));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= strip && x < w - strip && y >= strip && y < h - strip) continue;
      const i = (y * w + x) * 4;
      r.push(px[i]!);
      g.push(px[i + 1]!);
      b.push(px[i + 2]!);
    }
  }
  return [median(r), median(g), median(b)];
}

/** Foreground mask by distance from the paper colour (max channel difference). */
export function figureMask(
  px: Uint8ClampedArray,
  w: number,
  h: number,
  paper: [number, number, number],
  threshold: number,
): Uint8Array {
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const d = Math.max(
      Math.abs(px[i * 4]! - paper[0]),
      Math.abs(px[i * 4 + 1]! - paper[1]),
      Math.abs(px[i * 4 + 2]! - paper[2]),
    );
    mask[i] = d >= threshold ? 1 : 0;
  }
  return mask;
}

/** Label 4-connected components; returns labels and sizes (label 0 = background). */
export function components(
  mask: Uint8Array,
  w: number,
  h: number,
): { labels: Int32Array; sizes: number[] } {
  const labels = new Int32Array(w * h);
  const sizes: number[] = [0];
  const stack: number[] = [];
  let next = 1;
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || labels[start]) continue;
    const label = next++;
    let size = 0;
    stack.push(start);
    labels[start] = label;
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const x = i % w;
      const y = (i - x) / w;
      const nb = [
        x > 0 ? i - 1 : -1,
        x < w - 1 ? i + 1 : -1,
        y > 0 ? i - w : -1,
        y < h - 1 ? i + w : -1,
      ];
      for (const j of nb) {
        if (j >= 0 && mask[j] && !labels[j]) {
          labels[j] = label;
          stack.push(j);
        }
      }
    }
    sizes.push(size);
  }
  return { labels, sizes };
}

/** Keep the largest component; fill enclosed holes that are not connected to the border. */
export function isolateFigure(mask: Uint8Array, w: number, h: number): Uint8Array {
  const { labels, sizes } = components(mask, w, h);
  let best = 0;
  for (let l = 1; l < sizes.length; l++) if (sizes[l]! > (sizes[best] ?? 0)) best = l;
  const out = new Uint8Array(w * h);
  if (!best) return out;
  for (let i = 0; i < w * h; i++) out[i] = labels[i] === best ? 1 : 0;
  // Background components touching the border are paper; the rest are holes inside the figure.
  const inv = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) inv[i] = out[i] ? 0 : 1;
  const bg = components(inv, w, h);
  const touchesBorder = new Set<number>();
  for (let x = 0; x < w; x++) {
    touchesBorder.add(bg.labels[x]!);
    touchesBorder.add(bg.labels[(h - 1) * w + x]!);
  }
  for (let y = 0; y < h; y++) {
    touchesBorder.add(bg.labels[y * w]!);
    touchesBorder.add(bg.labels[y * w + w - 1]!);
  }
  for (let i = 0; i < w * h; i++) {
    const l = bg.labels[i]!;
    if (l && !touchesBorder.has(l) && bg.sizes[l]! < w * h * 0.15) out[i] = 1;
  }
  return out;
}

/** Bounding box of set pixels. */
function bounds(mask: Uint8Array, w: number, h: number) {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (mask[y * w + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}

/** Pure part of the pipeline: RGBA pixels → cropped RGBA with alpha + mask. Testable in Node. */
export function cutoutPixels(
  px: Uint8ClampedArray,
  w: number,
  h: number,
  threshold = 48,
): {
  data: Uint8ClampedArray<ArrayBuffer>;
  width: number;
  height: number;
  mask: AlphaMask;
  coverage: number;
} | null {
  const paper = estimatePaper(px, w, h);
  const raw = figureMask(px, w, h, paper, threshold);
  const fig = isolateFigure(raw, w, h);
  const b = bounds(fig, w, h);
  if (!b) return null;
  const pad = Math.round(Math.max(w, h) * 0.03);
  const x0 = Math.max(0, b.minX - pad);
  const y0 = Math.max(0, b.minY - pad);
  const x1 = Math.min(w - 1, b.maxX + pad);
  const y1 = Math.min(h - 1, b.maxY + pad);
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const out = new Uint8ClampedArray(cw * ch * 4);
  const alpha = new Uint8Array(cw * ch);
  let count = 0;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const si = (y0 + y) * w + (x0 + x);
      const di = y * cw + x;
      const inside = fig[si] === 1;
      // Feather: a pixel next to the edge gets half alpha.
      let a = 0;
      if (inside) {
        a = 255;
        count++;
      } else {
        const nb = [si - 1, si + 1, si - w, si + w];
        if (nb.some((j) => j >= 0 && j < w * h && fig[j] === 1)) a = 110;
      }
      alpha[di] = a;
      out[di * 4] = px[si * 4]!;
      out[di * 4 + 1] = px[si * 4 + 1]!;
      out[di * 4 + 2] = px[si * 4 + 2]!;
      out[di * 4 + 3] = a;
    }
  }
  return {
    data: out,
    width: cw,
    height: ch,
    mask: { width: cw, height: ch, data: alpha },
    coverage: count / (w * h),
  };
}

/** Browser wrapper: file/blob → downscaled canvas → cut-out PNG data URL. */
export async function cutoutFromFile(
  file: Blob,
  opts: CutoutOptions = {},
): Promise<CutoutResult | null> {
  const maxSize = opts.maxSize ?? 720;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const px = ctx.getImageData(0, 0, w, h).data;
  const cut = cutoutPixels(px, w, h, opts.threshold);
  if (!cut || cut.coverage < 0.004) return null;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = cut.width;
  outCanvas.height = cut.height;
  outCanvas.getContext('2d')!.putImageData(new ImageData(cut.data, cut.width, cut.height), 0, 0);
  return {
    image: outCanvas.toDataURL('image/png'),
    width: cut.width,
    height: cut.height,
    mask: cut.mask,
    coverage: cut.coverage,
  };
}
