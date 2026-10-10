#!/usr/bin/env node
/**
 * Renders the marketplace listing video, listing/automation-inventory.mp4.
 *
 * FACT (`apps/docs/app-listing-guidelines`, read 27 Sep 2026 for Watchdog):
 * "30-60 seconds, HD or 4K video, MP4 format, up to 50 MB", and "it's a promo
 * video, not a demo, so it should focus on the value your app provides".
 *
 * 1920×1080, 30 fps, H.264 with a silent audio track, cross-faded scenes, as
 * Watchdog's scripts/make-video.js does. Every product scene is the real view
 * on the invented demo account: the list scrolls, the search is typed one key
 * at a time, and the filters are clicked, each frame a screenshot of what the
 * view then shows. The "Open board ↗" close-up comes from the same view inside
 * a stand-in for monday (listing-kit.js, openInMonday), because only there
 * does the view show that link. The pointer is drawn over the screenshots.
 *
 * A development tool, not part of the app: it needs Playwright and ffmpeg,
 * neither of which is a dependency. Run:
 *
 *   node scripts/make-listing-video.js
 */

import { execFileSync } from 'node:child_process';
import { link, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  APP_NAME,
  root,
  NAVY,
  ACCENT,
  LIGHT_BG,
  DARK_BG,
  POINTER_SVG,
  markSvg,
  page,
  b64,
  escapeHtml,
  launchBrowser,
  startServer,
  openDemo,
  openInMonday,
  cutHeight,
  shootView,
  renderHtml,
  slideHtml,
} from './listing-kit.js';

const W = 1920;
const H = 1080;
const FPS = 30;
const FADE = 0.6;
/** The view is 900 CSS px wide; on the product scenes it is shown at 1.22×. */
const ZOOM = 1.22;
const MAX_SHOT = Math.floor(960 / ZOOM);
const output = `${root}listing/automation-inventory.mp4`;

const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';

// ---- cards -----------------------------------------------------------------

function titleCard(title, lines) {
  return page(W, H, `
    <div class="card">
      ${markSvg(150, { background: '#2a3170' })}
      <h1>${escapeHtml(title)}</h1>
      ${lines.map((line, i) => `<p class="l${i}">${line}</p>`).join('')}
    </div>`, `
    .card { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;
      text-align: center; padding: 0 200px; background: linear-gradient(135deg, #1c1f3b, #26305e); color: #fff; }
    .card svg { border-radius: 34px; margin-bottom: 44px; }
    h1 { font-size: 92px; font-weight: 800; letter-spacing: -2px; margin-bottom: 22px; }
    p { font-size: 40px; line-height: 1.4; color: #c9cce0; }
    p.l0 { color: #fff; }
    p + p { margin-top: 10px; font-size: 32px; }
  `);
}

/** A dark card: a headline and a few lines, the mark underneath. */
function statementCard(headline, lines) {
  return page(W, H, `
    <div class="card">
      <h1>${headline}</h1>
      ${lines.map((line) => `<p>${line}</p>`).join('')}
      <div class="mark">${markSvg(120, { background: 'transparent' })}</div>
    </div>`, `
    .card { height: 100%; display: flex; flex-direction: column; justify-content: center; padding: 0 220px;
      background: ${DARK_BG}; color: #edeef5; }
    h1 { font-size: 96px; font-weight: 800; letter-spacing: -2px; margin-bottom: 40px; text-wrap: balance; }
    p { font-size: 42px; line-height: 1.45; color: #a4a7bd; }
    p b { color: ${ACCENT}; font-weight: 700; }
    .mark { margin-top: 60px; margin-left: -12px; }
  `);
}

/** A close-up of two rows with one sentence underneath. */
function closeUpHtml(shot, cssWidth, caption, target) {
  const frameWidth = W - 2 * 160;
  const zoom = frameWidth / cssWidth;
  const ring = {
    left: (target.x - 8) * zoom, top: (target.y - 5) * zoom,
    width: (target.width + 16) * zoom, height: (target.height + 10) * zoom,
  };
  return page(W, H, `
    <div class="wrap">
      <div class="frame">
        <img src="data:image/png;base64,${b64(shot)}">
        <div class="ring" style="left:${ring.left}px;top:${ring.top}px;width:${ring.width}px;height:${ring.height}px"></div>
        <div class="pointer" style="left:${(target.x + target.width * 0.62) * zoom}px;top:${(target.y + target.height * 0.62) * zoom}px">${POINTER_SVG}</div>
      </div>
      <div class="caption">${caption}</div>
    </div>`, `
    body { background: ${LIGHT_BG}; }
    .wrap { height: 100%; display: flex; flex-direction: column; justify-content: center; gap: 64px; padding: 0 160px; }
    .frame { position: relative; overflow: hidden; border-radius: 20px; background: #fff;
      box-shadow: 0 12px 44px rgba(28,31,59,.18); }
    .frame img { width: 100%; display: block; }
    .ring { position: absolute; border: 4px solid ${ACCENT}; border-radius: 12px; }
    .pointer { position: absolute; filter: drop-shadow(0 2px 3px rgba(0,0,0,.3)); }
    .pointer svg { width: 44px; height: auto; }
    .caption { font-size: 50px; font-weight: 800; letter-spacing: -1px; line-height: 1.2; color: ${NAVY}; text-wrap: balance; }
  `);
}

// ---- frame sequences -----------------------------------------------------------

/** Numbered PNG frames at FPS; a held frame is written once and hard-linked. */
class Frames {
  constructor(dir) {
    this.dir = dir;
    this.count = 0;
  }

  file(index) {
    return join(this.dir, `${String(index).padStart(5, '0')}.png`);
  }

  async add(png, seconds = 1 / FPS) {
    const n = Math.max(1, Math.round(seconds * FPS));
    const first = this.file(this.count);
    await writeFile(first, png);
    this.count += 1;
    for (let i = 1; i < n; i += 1) {
      await link(first, this.file(this.count));
      this.count += 1;
    }
  }

  get seconds() {
    return this.count / FPS;
  }
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t) => 1 - (1 - t) ** 3;

/** A 1920×1080 page kept open, changed between screenshots. */
async function openStage(browser, html) {
  const context = await browser.newContext({ viewport: { width: W, height: H } });
  const tab = await context.newPage();
  await tab.setContent(html, { waitUntil: 'load' });
  await tab.evaluate(() => document.fonts.ready);
  return {
    tab,
    close: () => context.close(),
    snap: () => tab.screenshot(),
    /** Shows shot `index`, scrolled down by `scroll` CSS px of the view. */
    show: (index, scroll = 0) =>
      tab.evaluate(({ index, scroll, zoom }) => {
        for (const img of document.querySelectorAll('.shot img')) {
          const on = img.id === `shot-${index}`;
          img.style.display = on ? 'block' : 'none';
          if (on) img.style.transform = `translateY(${-scroll * zoom}px)`;
        }
      }, { index, scroll, zoom: ZOOM }),
    /** Puts the pointer's tip at (x, y) in the view's CSS px, or hides it. */
    pointer: (at) =>
      tab.evaluate(({ at, zoom }) => {
        const pointer = document.getElementById('pointer');
        if (!at) {
          pointer.style.display = 'none';
          return;
        }
        const panel = document.querySelector('.shot').getBoundingClientRect();
        pointer.style.display = 'block';
        pointer.style.transform = `translate(${panel.left + at.x * zoom}px, ${panel.top + at.y * zoom}px)`;
      }, { at, zoom: ZOOM }),
  };
}

/** Glides the pointer from `from` to `to` over `seconds`, one frame at a time. */
async function glide(stage, frames, from, to, seconds) {
  const n = Math.round(seconds * FPS);
  for (let i = 1; i <= n; i += 1) {
    const t = easeOut(i / n);
    await stage.pointer({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
    await frames.add(await stage.snap());
  }
}

const centre = (box, fx = 0.5, fy = 0.55) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });

// ---- scenes ------------------------------------------------------------------------

const server = await startServer();
const browser = await launchBrowser();
const work = await mkdtemp(join(tmpdir(), 'inventory-video-'));
const scenes = [];

async function still(html, seconds) {
  const file = join(work, `still-${scenes.length}.png`);
  await writeFile(file, await renderHtml(browser, html, W, H));
  scenes.push({ kind: 'still', file, seconds });
}

async function sequence(build) {
  const dir = join(work, `seq-${scenes.length}`);
  await mkdir(dir);
  const frames = new Frames(dir);
  await build(frames);
  scenes.push({ kind: 'frames', pattern: join(dir, '%05d.png'), seconds: frames.seconds });
}

try {
  await still(titleCard(APP_NAME, ['Every monday automation, in one searchable list.', 'for monday.com']), 4);

  await still(statementCard('Automations live board by board.', [
    'monday keeps each board’s automations on that board’s own page.',
    'Its hub shows failed runs and the most-used ones, <b>not every one</b>.',
  ]), 5.5);

  const { context, tab } = await openDemo(browser, { width: 900, height: 1400, scale: 2 });
  const panelCss = await cutHeight(tab, { maxHeight: MAX_SHOT });
  const panelHeight = Math.round(panelCss * ZOOM);
  const product = { width: W, height: H, zoom: ZOOM, big: true, panelHeight, pointer: true };

  // The whole list, scrolled from the top to its last row.
  {
    const full = await tab.screenshot();
    const endScroll = await tab.evaluate((panelCss) => {
      const end = document.querySelector('#app > p.meta').getBoundingClientRect().bottom + 8;
      const tops = [...document.querySelectorAll('#app .rows > .row')].map((row) => row.getBoundingClientRect().top - 8);
      return tops.find((top) => top + panelCss >= end) ?? end - panelCss;
    }, panelCss);
    const stage = await openStage(browser, slideHtml({
      ...product,
      headline: 'Every automation, on every board, in one list',
      detail: 'On or off, with monday’s warning on each, from every board you can see.',
      shots: [full],
    }));
    await sequence(async (frames) => {
      await frames.add(await stage.snap(), 1.2);
      const n = Math.round(3.4 * FPS);
      for (let i = 1; i <= n; i += 1) {
        await stage.show(0, endScroll * easeInOut(i / n));
        await frames.add(await stage.snap());
      }
      await frames.add(await stage.snap(), 1.9);
    });
    await stage.close();
  }

  // The search, typed one key at a time.
  {
    const search = tab.locator('input.search');
    const box = await search.boundingBox();
    const states = [await shootView(tab, { maxHeight: MAX_SHOT })];
    await search.click();
    states.push(await shootView(tab, { maxHeight: MAX_SHOT }));
    const word = 'notify';
    for (const char of word) {
      await search.press(char);
      states.push(await shootView(tab, { maxHeight: MAX_SHOT }));
    }
    const stage = await openStage(browser, slideHtml({
      ...product,
      headline: 'Find an automation by what it does',
      detail: 'Search the words in its name, its board or monday’s warning.',
      shots: states,
    }));
    await sequence(async (frames) => {
      await frames.add(await stage.snap(), 1.0);
      const at = centre(box, 0.72);
      await glide(stage, frames, { x: 760, y: 620 }, at, 0.5);
      await stage.show(1);
      await frames.add(await stage.snap(), 0.35);
      for (let i = 0; i < word.length; i += 1) {
        await stage.show(i + 2);
        await frames.add(await stage.snap(), 0.14);
      }
      await frames.add(await stage.snap(), 3.1);
    });
    await stage.close();
    await search.fill('');
    await search.blur();
  }

  // The filters, clicked.
  {
    const off = tab.getByRole('button', { name: 'Switched off' });
    const warn = tab.getByRole('button', { name: 'With a warning' });
    const offBox = await off.boundingBox();
    const warnBox = await warn.boundingBox();
    const states = [await shootView(tab, { maxHeight: MAX_SHOT })];
    await off.click();
    states.push(await shootView(tab, { maxHeight: MAX_SHOT }));
    await warn.click();
    states.push(await shootView(tab, { maxHeight: MAX_SHOT }));
    await tab.getByRole('button', { name: 'All' }).click();
    const stage = await openStage(browser, slideHtml({
      ...product,
      headline: 'See what’s switched off, and what monday warns about',
      detail: 'Only the ones switched off, only those with a warning, or one board.',
      shots: states,
    }));
    await sequence(async (frames) => {
      await frames.add(await stage.snap(), 1.0);
      await glide(stage, frames, { x: 640, y: 560 }, centre(offBox), 0.5);
      await frames.add(await stage.snap(), 0.15);
      await stage.show(1);
      await frames.add(await stage.snap(), 1.9);
      await glide(stage, frames, centre(offBox), centre(warnBox), 0.45);
      await frames.add(await stage.snap(), 0.15);
      await stage.show(2);
      await frames.add(await stage.snap(), 2.3);
    });
    await stage.close();
  }
  await context.close();

  // "Open board ↗", from the view inside the stand-in for monday.
  {
    const inMonday = await openInMonday(browser, { width: 900, height: 1400, scale: 2 });
    const rows = inMonday.frame.locator('#app .rows > .row');
    const first = await rows.nth(0).boundingBox();
    const second = await rows.nth(1).boundingBox();
    const button = await rows.nth(0).getByRole('button', { name: 'Open board ↗' }).boundingBox();
    // 8px under the second row: the rows are 10px apart, so none of the third shows.
    const clip = { x: first.x - 12, y: first.y - 12, width: first.width + 24, height: second.y + second.height + 8 - (first.y - 12) };
    const shot = await inMonday.tab.screenshot({ clip });
    await inMonday.context.close();
    const target = { x: button.x - clip.x, y: button.y - clip.y, width: button.width, height: button.height };
    await still(closeUpHtml(shot, clip.width, '“Open board ↗” opens its board in a new tab, where you switch it on or off.', target), 5);
  }

  {
    const dark = await openDemo(browser, { width: 900, height: 1400, scale: 2, colorScheme: 'dark' });
    const shot = await shootView(dark.tab, { maxHeight: MAX_SHOT });
    await dark.context.close();
    await still(slideHtml({
      width: W, height: H, zoom: ZOOM, big: true, dark: true, shot,
      headline: 'Follows monday’s light, dark and night themes',
      detail: 'It picks up the theme you use in monday.',
    }), 4);
  }

  await still(statementCard('It only reads. Nothing is stored.', [
    'It never changes a board, an item or an automation.',
    'The list is read in your browser each time you open it.',
  ]), 4.5);

  await still(titleCard(APP_NAME, ['Every automation on every board, in one searchable list.', 'atesensoftware.com']), 4.5);
} finally {
  await browser.close();
  server.kill();
}

// ---- encoding ------------------------------------------------------------------------

// Stills get a slow push-in, scaled up first so the sub-pixel motion does not
// jitter (Watchdog's make-video.js); the sequences already move. Then
// cross-fades, as in Watchdog.
const inputs = [];
const filters = [];
for (const [i, scene] of scenes.entries()) {
  const frames = Math.round(scene.seconds * FPS);
  if (scene.kind === 'still') {
    inputs.push('-i', scene.file);
    filters.push(`[${i}:v]scale=${W * 2}:${H * 2},zoompan=z='1+0.03*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=${FPS},format=yuv420p,setsar=1,settb=1/${FPS}[v${i}]`);
  } else {
    inputs.push('-framerate', String(FPS), '-i', scene.pattern);
    filters.push(`[${i}:v]format=yuv420p,setsar=1,settb=1/${FPS}[v${i}]`);
  }
}
let last = 'v0';
let elapsed = scenes[0].seconds;
for (let i = 1; i < scenes.length; i += 1) {
  const offset = (elapsed - FADE).toFixed(3);
  filters.push(`[${last}][v${i}]xfade=transition=fade:duration=${FADE}:offset=${offset}[x${i}]`);
  last = `x${i}`;
  elapsed = elapsed - FADE + scenes[i].seconds;
}

try {
  execFileSync(ffmpeg, [
    '-y', '-loglevel', 'error',
    ...inputs,
    '-f', 'lavfi', '-t', elapsed.toFixed(3), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-filter_complex', filters.join(';'),
    '-map', `[${last}]`, '-map', `${scenes.length}:a`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '96k', '-shortest', '-movflags', '+faststart',
    output,
  ], { stdio: 'inherit' });
} finally {
  await rm(work, { recursive: true, force: true });
}

const { size } = await stat(output);
console.log(`Wrote listing/automation-inventory.mp4: ${elapsed.toFixed(1)} s, ${(size / 1e6).toFixed(1)} MB, ${scenes.length} scenes.`);
