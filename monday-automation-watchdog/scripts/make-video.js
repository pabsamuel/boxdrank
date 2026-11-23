#!/usr/bin/env node
/**
 * Renders the marketplace listing video, listing/automation-watchdog.mp4.
 *
 * FACT (`apps/docs/app-listing-guidelines`, read 27 Sep 2026): "30-60 seconds,
 * HD or 4K video, MP4 format, up to 50 MB", and "it's a promo video, not a
 * demo, so it should focus on the value your app provides".
 *
 * Nine 1920×1080 scenes, each a still of the real board view on the demo
 * account (or a title card), with a slow zoom and cross-fades, encoded by
 * ffmpeg as H.264 with a silent audio track. A development tool: it needs
 * Playwright and ffmpeg, neither of which is a dependency.
 *
 *   NODE_PATH="$(npm root -g)" node scripts/make-video.js
 */

import { execFileSync } from 'node:child_process';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import {
  chromium,
  root,
  DEMO,
  NAVY,
  TEAL,
  RED,
  markSvg,
  page,
  startDemoServer,
  shootBoardView,
  renderHtml,
  alertEmailHtml,
} from './asset-kit.js';

const W = 1920;
const H = 1080;
const FPS = 30;
const FADE = 0.6;
const work = `${root}listing/.video-frames/`;
const output = `${root}listing/automation-watchdog.mp4`;

const b64 = (buffer) => buffer.toString('base64');

function titleCard(title, lines, { dark = true } = {}) {
  return page(W, H, `
    <div class="card">
      ${markSvg(150, { background: dark ? '#2a3170' : NAVY })}
      <h1>${title}</h1>
      ${lines.map((line, i) => `<p class="l${i}">${line}</p>`).join('')}
    </div>`, `
    .card { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;
      text-align: center; padding: 0 200px; background: ${dark ? 'linear-gradient(135deg,#1c1f3b,#26305e)' : '#f3f5fb'};
      color: ${dark ? '#fff' : NAVY}; }
    .card svg { border-radius: 34px; margin-bottom: 44px; }
    h1 { font-size: 92px; font-weight: 800; letter-spacing: -2px; margin-bottom: 22px; }
    p { font-size: 40px; line-height: 1.4; color: ${dark ? '#c9cce0' : '#55586e'}; }
    p.l0 { color: ${dark ? '#fff' : NAVY}; }
    p + p { margin-top: 10px; font-size: 32px; }
  `);
}

function problemCard() {
  return page(W, H, `
    <div class="card">
      <h1>Automations stop quietly.</h1>
      <p>monday switches some automations off <b>without telling anyone</b>.</p>
      <p>Nothing breaks loudly. The work just doesn't happen.</p>
      <div class="line">${markSvg(120, { background: 'transparent' })}</div>
    </div>`, `
    .card { height: 100%; display: flex; flex-direction: column; justify-content: center; padding: 0 220px;
      background: #10122a; color: #edeef5; }
    h1 { font-size: 96px; font-weight: 800; letter-spacing: -2px; margin-bottom: 40px; }
    p { font-size: 42px; line-height: 1.45; color: #a4a7bd; }
    p b { color: ${RED}; font-weight: 700; }
    .line { margin-top: 60px; }
  `);
}

/** Text on the left, the product on the right, as on the gallery images. */
function slide(headline, detail, shot, { dark = false } = {}) {
  return page(W, H, `
    <div class="slide">
      <div class="copy">
        <div class="brand">${markSvg(60)}<span>Automation Watchdog</span></div>
        <h1>${headline}</h1>
        <p>${detail}</p>
      </div>
      <div class="shot"><img src="data:image/png;base64,${b64(shot)}"></div>
    </div>`, `
    .slide { display: flex; align-items: center; gap: 80px; height: 100%; padding-left: 120px;
      background: ${dark ? '#10122a' : '#f3f5fb'}; color: ${dark ? '#edeef5' : NAVY}; }
    .copy { flex: 0 0 600px; }
    .brand { display: flex; align-items: center; gap: 16px; font-size: 24px; font-weight: 700; margin-bottom: 50px; }
    .brand svg { border-radius: 14px; }
    h1 { font-size: 66px; line-height: 1.08; font-weight: 800; letter-spacing: -1.5px; margin-bottom: 28px; }
    p { font-size: 30px; line-height: 1.45; color: ${dark ? '#a4a7bd' : '#55586e'}; }
    .shot { flex: 1; max-height: 900px; overflow: hidden; border-radius: 20px 0 0 20px;
      box-shadow: 0 12px 44px rgba(28,31,59,.2); }
    .shot img { width: 100%; display: block; }
  `);
}

/** A close-up of the product with one sentence underneath. */
function closeUp(shot, caption, { offsetY = 0 } = {}) {
  return page(W, H, `
    <div class="frame"><img src="data:image/png;base64,${b64(shot)}" style="margin-top:${-offsetY}px"></div>
    <div class="caption">${caption}</div>`, `
    body { background: #f3f5fb; }
    .frame { position: absolute; left: 160px; right: 160px; top: 70px; height: 740px; overflow: hidden;
      border-radius: 20px; box-shadow: 0 12px 44px rgba(28,31,59,.18); background: #fff; }
    .frame img { width: 100%; display: block; }
    .caption { position: absolute; left: 160px; right: 160px; bottom: 90px; font-size: 50px; font-weight: 800;
      letter-spacing: -1px; line-height: 1.2; color: ${NAVY}; }
  `);
}

/** The whole board view after muting the stopped automation for a week. */
async function shootMuted(browser) {
  const context = await browser.newContext({ viewport: { width: 900, height: 760 }, deviceScaleFactor: 1.8 });
  await context.addInitScript(() => window.localStorage.setItem('watchdog:welcomed:v1', '1'));
  const tab = await context.newPage();
  await tab.goto(DEMO);
  await tab.waitForSelector('.row.silent');
  await tab.locator('.row.silent').first().getByRole('button', { name: 'for a week' }).click();
  await tab.waitForSelector('.row.muted');
  const shot = await tab.screenshot();
  await context.close();
  return shot;
}

const server = await startDemoServer();
const browser = await chromium.launch();
const scenes = [];
try {
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });

  const view = { width: 900, height: 760, scale: 1.8 };
  const board = await shootBoardView(browser, view);
  const welcome = await shootBoardView(browser, { ...view, welcome: true });
  const dark = await shootBoardView(browser, { ...view, colorScheme: 'dark' });
  const tall = await shootBoardView(browser, { width: 900, height: 900, scale: 2 });
  const email = await renderHtml(browser, await alertEmailHtml(900, 460), 900, 460, 1.8);
  const muted = await shootMuted(browser);

  const plan = [
    [4.5, titleCard('Automation Watchdog', ['Know when a monday automation stops working.', 'for monday.com'])],
    [6, problemCard()],
    [6.5, slide('See which automations have stopped.', 'Every automation that repeats, on every board you can see, with its normal rhythm and its state today.', board)],
    [6, closeUp(tall, 'It learns each automation’s rhythm, and notices when one goes quiet.', { offsetY: 330 })],
    [6, slide('Get an email when one stops.', 'One email when it stops, a reminder if it is still stopped three days later, and a note when it recovers.', email)],
    [5.5, slide('Mute what you already know about.', 'For a day, a week, 90 days or until it works again — never forever, and always counted.', muted)],
    [5.5, slide('Read-only. Set up in one click.', 'It never changes a board, an item or an automation.', welcome)],
    [5, slide('At home in dark mode.', 'Follows monday’s light, dark and night themes.', dark, { dark: true })],
    [5, titleCard('Automation Watchdog', ['Install it from the monday.com marketplace.', 'atesensoftware.com'])],
  ];
  for (const [index, [seconds, html]] of plan.entries()) {
    const file = `${work}scene-${index}.png`;
    await writeFile(file, await renderHtml(browser, html, W, H));
    scenes.push({ file, seconds });
  }
} finally {
  await browser.close();
  server.kill();
}

// A slow push-in on each still, then cross-fades. Scaled up before zoompan so
// the sub-pixel motion does not jitter.
const inputs = scenes.flatMap(({ file }) => ['-i', file]);
const filters = scenes.map(({ seconds }, i) => {
  const frames = Math.round(seconds * FPS);
  return `[${i}:v]scale=${W * 2}:${H * 2},zoompan=z='1+0.035*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=${FPS},format=yuv420p,setsar=1[v${i}]`;
});
let last = 'v0';
let elapsed = scenes[0].seconds;
for (let i = 1; i < scenes.length; i += 1) {
  const offset = (elapsed - FADE).toFixed(3);
  filters.push(`[${last}][v${i}]xfade=transition=fade:duration=${FADE}:offset=${offset}[x${i}]`);
  last = `x${i}`;
  elapsed = elapsed - FADE + scenes[i].seconds;
}

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error',
  ...inputs,
  '-f', 'lavfi', '-t', elapsed.toFixed(3), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
  '-filter_complex', filters.join(';'),
  '-map', `[${last}]`, '-map', `${scenes.length}:a`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '96k', '-shortest', '-movflags', '+faststart',
  output,
], { stdio: 'inherit' });

await rm(work, { recursive: true, force: true });
const { size } = await stat(output);
console.log(`Wrote listing/automation-watchdog.mp4 — ${elapsed.toFixed(1)} s, ${(size / 1e6).toFixed(1)} MB`);
