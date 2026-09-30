/* global document, Image */
// Artwork tooling for painted puppets (see docs/ART.md).
//
//   node scripts/art-tiles.mjs stitch <tilesDir> <workDir>  # 600 px Canva tile renders → full PNG/JPG
//   node scripts/art-tiles.mjs grid <workDir> <gridDir>      # coordinate grids for rig polygons
//   node scripts/art-tiles.mjs parts <workDir> <outDir>     # body (coat painted in) + arm layer .webp
//
// Everything runs in headless Chromium (canvas), so no image library is needed.
// PERDE_CHROMIUM_PATH points at the browser when Playwright's own download is unavailable.

import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const FIGURES = ['karagoz', 'hacivat', 'celebi', 'zenne'];
const ART_BOX = { w: 1000, h: 1980 };

const JOBS = [
  {
    name: 'karagoz',
    w: 896,
    h: 1776,
    key: true,
    prefix: 'k',
    cols: [0, 296],
    rows: [0, 600, 1176],
  },
  {
    name: 'hacivat',
    w: 896,
    h: 1776,
    key: true,
    prefix: 'h',
    cols: [0, 296],
    rows: [0, 600, 1176],
  },
  {
    name: 'celebi',
    w: 896,
    h: 1776,
    key: true,
    prefix: 'c',
    cols: [0, 296],
    rows: [0, 600, 1176],
  },
  {
    name: 'zenne',
    w: 896,
    h: 1776,
    key: true,
    prefix: 'z',
    cols: [0, 296],
    rows: [0, 600, 1176],
  },
  {
    name: 'backdrop',
    w: 1680,
    h: 944,
    key: false,
    prefix: 'b',
    cols: [0, 600, 1080],
    rows: [0, 344],
  },
];

async function withPage(fn) {
  const browser = await chromium.launch({ executablePath: process.env.PERDE_CHROMIUM_PATH });
  const page = await browser.newPage();
  await page.setContent('<html><body></body></html>');
  try {
    return await fn(page);
  } finally {
    await browser.close();
  }
}

const dataUrl = (file, mime) => `data:${mime};base64,${readFileSync(file).toString('base64')}`;
const fromDataUrl = (url) => Buffer.from(url.split(',')[1], 'base64');

/** Stitch tiles and key out the page white behind a figure (flood fill from the border). */
async function stitch(tilesDir, outDir) {
  mkdirSync(outDir, { recursive: true });
  await withPage(async (page) => {
    for (const job of JOBS) {
      const tiles = [];
      for (const y of job.rows)
        for (const x of job.cols)
          tiles.push({
            x,
            y,
            data: dataUrl(`${tilesDir}/${job.prefix}-${x}-${y}.png`, 'image/png'),
          });
      const result = await page.evaluate(
        async ({ job, tiles }) => {
          const c = document.createElement('canvas');
          c.width = job.w;
          c.height = job.h;
          const ctx = c.getContext('2d');
          for (const t of tiles) {
            const img = new Image();
            await new Promise((res, rej) => {
              img.onload = res;
              img.onerror = rej;
              img.src = t.data;
            });
            ctx.drawImage(img, t.x, t.y);
          }
          let stats = '';
          if (job.key) {
            const im = ctx.getImageData(0, 0, job.w, job.h);
            const d = im.data;
            const W = job.w;
            const H = job.h;
            const isWhite = (i) => d[i] > 232 && d[i + 1] > 232 && d[i + 2] > 232;
            const bg = new Uint8Array(W * H);
            const stack = [];
            const push = (x, y) => {
              const p = y * W + x;
              if (!bg[p] && isWhite(p * 4)) {
                bg[p] = 1;
                stack.push(p);
              }
            };
            for (let x = 0; x < W; x++) {
              push(x, 0);
              push(x, H - 1);
            }
            for (let y = 0; y < H; y++) {
              push(0, y);
              push(W - 1, y);
            }
            while (stack.length) {
              const p = stack.pop();
              const x = p % W;
              const y = (p - x) / W;
              if (x > 0) push(x - 1, y);
              if (x < W - 1) push(x + 1, y);
              if (y > 0) push(x, y - 1);
              if (y < H - 1) push(x, y + 1);
            }
            let cleared = 0;
            for (let p = 0; p < W * H; p++)
              if (bg[p]) {
                d[p * 4 + 3] = 0;
                cleared++;
              }
            // Light rim pixels next to the background fade out so the edge is not jagged.
            for (let y = 1; y < H - 1; y++)
              for (let x = 1; x < W - 1; x++) {
                const p = y * W + x;
                if (bg[p]) continue;
                if (bg[p - 1] || bg[p + 1] || bg[p - W] || bg[p + W]) {
                  const i = p * 4;
                  const m = Math.min(d[i], d[i + 1], d[i + 2]);
                  const white = Math.max(0, Math.min(1, (m - 190) / 50));
                  d[i + 3] = Math.round(255 * (1 - white * 0.85));
                }
              }
            ctx.putImageData(im, 0, 0);
            stats = `cleared ${((100 * cleared) / (W * H)).toFixed(1)}% as background`;
          }
          const url = job.key ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.9);
          return { url, stats };
        },
        { job, tiles },
      );
      const ext = job.key ? 'png' : 'jpg';
      const buf = fromDataUrl(result.url);
      writeFileSync(`${outDir}/${job.name}.${ext}`, buf);
      console.log(job.name, buf.length, 'bytes', result.stats);
    }
  });
}

/** The figure on white with lines every 100 art-box units, to read polygon coordinates off. */
async function grid(pngDir, gridDir) {
  mkdirSync(gridDir, { recursive: true });
  await withPage(async (page) => {
    for (const name of FIGURES) {
      const url = await page.evaluate(
        async ({ data, box }) => {
          const img = new Image();
          await new Promise((res, rej) => {
            img.onload = res;
            img.onerror = rej;
            img.src = data;
          });
          const g = document.createElement('canvas');
          g.width = img.width;
          g.height = img.height;
          const gx = g.getContext('2d');
          gx.fillStyle = '#fff';
          gx.fillRect(0, 0, g.width, g.height);
          gx.drawImage(img, 0, 0);
          gx.strokeStyle = 'rgba(0,120,255,0.55)';
          gx.lineWidth = 1;
          gx.fillStyle = '#0050c0';
          gx.font = 'bold 22px sans-serif';
          for (let u = 0; u <= box.w; u += 100) {
            const x = (u / box.w) * img.width;
            gx.beginPath();
            gx.moveTo(x, 0);
            gx.lineTo(x, img.height);
            gx.stroke();
            gx.fillText(String(u), x + 3, 24);
            gx.fillText(String(u), x + 3, img.height / 2);
          }
          for (let v = 0; v <= box.h; v += 100) {
            const y = (v / box.h) * img.height;
            gx.beginPath();
            gx.moveTo(0, y);
            gx.lineTo(img.width, y);
            gx.stroke();
            gx.fillText(String(v), 3, y - 4);
            gx.fillText(String(v), img.width - 70, y - 4);
          }
          return g.toDataURL('image/png');
        },
        { data: dataUrl(`${pngDir}/${name}.png`, 'image/png'), box: ART_BOX },
      );
      writeFileSync(`${gridDir}/${name}-grid.png`, fromDataUrl(url));
      console.log(name, 'grid written');
    }
  });
}

// Arm polygons in art-box units; keep in sync with packages/content/src/tr/puppets.ts.
const ARMS = {
  karagoz: {
    dx: 150,
    polygon: [
      [250, 530],
      [430, 560],
      [440, 700],
      [430, 900],
      [400, 1010],
      [400, 1180],
      [370, 1265],
      [260, 1270],
      [230, 1180],
      [200, 1000],
      [180, 850],
      [190, 680],
    ],
  },
  hacivat: {
    dx: 130,
    polygon: [
      [270, 520],
      [440, 570],
      [440, 880],
      [340, 900],
      [340, 1090],
      [310, 1290],
      [200, 1300],
      [180, 1130],
      [195, 900],
      [200, 700],
    ],
  },
  celebi: {
    dx: 150,
    polygon: [
      [590, 760],
      [700, 530],
      [850, 540],
      [840, 700],
      [760, 940],
      [620, 930],
      [590, 850],
    ],
  },
  zenne: {
    dx: 150,
    polygon: [
      [540, 600],
      [620, 480],
      [860, 500],
      [860, 690],
      [720, 760],
      [680, 860],
      [560, 870],
      [520, 760],
    ],
  },
};

/**
 * Split each figure into a complete body and an arm layer. The arm is a
 * separate leather piece pinned over the coat, so the coat under it is
 * painted in from the coat beside it; the arm layer keeps only the arm.
 */
async function parts(pngDir, outDir) {
  mkdirSync(outDir, { recursive: true });
  await withPage(async (page) => {
    for (const name of FIGURES) {
      const spec = ARMS[name];
      const r = await page.evaluate(
        async ({ data, box, spec }) => {
          const img = new Image();
          await new Promise((res, rej) => {
            img.onload = res;
            img.onerror = rej;
            img.src = data;
          });
          const W = img.width;
          const H = img.height;
          const sx = W / box.w;
          const sy = H / box.h;
          const poly = spec.polygon.map(([x, y]) => [x * sx, y * sy]);
          const inside = (x, y) => {
            let c = false;
            for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
              const [xi, yi] = poly[i];
              const [xj, yj] = poly[j];
              if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
            }
            return c;
          };
          const c = document.createElement('canvas');
          c.width = W;
          c.height = H;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const src = ctx.getImageData(0, 0, W, H);
          const body = ctx.createImageData(W, H);
          const arm = ctx.createImageData(W, H);
          const s = src.data;
          const mask = new Uint8Array(W * H);
          for (let y = 0; y < H; y++)
            for (let x = 0; x < W; x++) mask[y * W + x] = inside(x + 0.5, y + 0.5) ? 1 : 0;
          const usable = (x, y) => {
            if (x < 0 || y < 0 || x >= W || y >= H) return false;
            const p = y * W + x;
            if (mask[p]) return false;
            const i = p * 4;
            if (s[i + 3] < 250) return false;
            // skip the beard and other near-black areas: coat colour only
            return s[i] + s[i + 1] + s[i + 2] > 150;
          };
          const dx = Math.round(spec.dx * sx);
          for (let y = 0; y < H; y++)
            for (let x = 0; x < W; x++) {
              const p = y * W + x;
              const i = p * 4;
              if (!mask[p]) {
                body.data.set(s.subarray(i, i + 4), i);
                continue;
              }
              arm.data.set(s.subarray(i, i + 4), i);
              if (s[i + 3] === 0) continue; // outside the figure: stays transparent
              let from = -1;
              for (const [ox, oy] of [
                [dx, 0],
                [dx * 1.5, 0],
                [dx * 2, 0],
                [0, 160],
                [0, 320],
                [0, 480],
                [dx, 160],
                [0, -160],
              ]) {
                const qx = Math.round(x + ox);
                const qy = Math.round(y + oy);
                if (usable(qx, qy)) {
                  from = (qy * W + qx) * 4;
                  break;
                }
              }
              if (from >= 0) body.data.set(s.subarray(from, from + 4), i);
            }
          const out = {};
          ctx.putImageData(body, 0, 0);
          out.body = c.toDataURL('image/webp', 0.9);
          ctx.putImageData(arm, 0, 0);
          out.arm = c.toDataURL('image/webp', 0.9);
          return out;
        },
        { data: dataUrl(`${pngDir}/${name}.png`, 'image/png'), box: ART_BOX, spec },
      );
      writeFileSync(`${outDir}/${name}.webp`, fromDataUrl(r.body));
      writeFileSync(`${outDir}/${name}-arm.webp`, fromDataUrl(r.arm));
      console.log(name, 'body + arm layers written');
    }
  });
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === 'stitch' && a && b) await stitch(a, b);
else if (cmd === 'grid' && a && b) await grid(a, b);
else if (cmd === 'parts' && a && b) await parts(a, b);
else {
  console.error(
    'usage: art-tiles.mjs stitch <tilesDir> <workDir> | grid <workDir> <gridDir> | parts <workDir> <outDir>',
  );
  process.exit(2);
}
