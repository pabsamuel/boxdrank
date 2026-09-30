import { describe, expect, it } from 'vitest';
import { components, cutoutPixels, estimatePaper, figureMask, isolateFigure } from './cutout';

/** A photo of a drawing: cream paper, a dark figure with a hole (a ring), and a stray speck. */
function photo(w = 60, h = 80) {
  const px = new Uint8ClampedArray(w * h * 4);
  const set = (x: number, y: number, r: number, g: number, b: number) => {
    const i = (y * w + x) * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = 255;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(x, y, 236 + (x % 3), 228, 205);
  // ring (figure with a hole)
  for (let y = 15; y < 55; y++)
    for (let x = 15; x < 45; x++)
      if (!(x > 22 && x < 38 && y > 25 && y < 45)) set(x, y, 40, 30, 20);
  // stray speck
  set(3, 70, 30, 30, 30);
  set(4, 70, 30, 30, 30);
  return { px, w, h };
}

describe('cutout', () => {
  it('estimates the paper colour from the border', () => {
    const { px, w, h } = photo();
    const p = estimatePaper(px, w, h);
    expect(p[0]).toBeGreaterThan(230);
    expect(p[2]).toBeLessThan(215);
  });
  it('marks the figure and the speck, then keeps only the figure with its hole filled', () => {
    const { px, w, h } = photo();
    const raw = figureMask(px, w, h, estimatePaper(px, w, h), 48);
    expect(raw[70 * w + 3]).toBe(1);
    const { sizes } = components(raw, w, h);
    expect(sizes.length).toBe(3); // background label + ring + speck
    const fig = isolateFigure(raw, w, h);
    expect(fig[70 * w + 3]).toBe(0);
    expect(fig[35 * w + 30]).toBe(1); // hole filled
    expect(fig[5 * w + 5]).toBe(0);
  });
  it('crops to the figure with transparency and reports coverage', () => {
    const { px, w, h } = photo();
    const cut = cutoutPixels(px, w, h)!;
    expect(cut).not.toBeNull();
    expect(cut.width).toBeLessThan(w);
    expect(cut.height).toBeLessThan(h);
    expect(cut.coverage).toBeGreaterThan(0.1);
    // corners of the crop are transparent, the middle of the ring is opaque
    expect(cut.data[3]).toBe(0);
    const mid = (Math.round(cut.height / 2) * cut.width + 2) * 4 + 3;
    expect(cut.data[mid]).toBe(255);
  });
  it('returns null on blank paper', () => {
    const w = 20;
    const h = 20;
    const px = new Uint8ClampedArray(w * h * 4).fill(240);
    expect(cutoutPixels(px, w, h)).toBeNull();
  });
});
