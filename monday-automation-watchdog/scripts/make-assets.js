#!/usr/bin/env node
/**
 * Renders every image the app and its marketplace listing need, from the real
 * board view running on the demo account.
 *
 *   src/app/assets/board-view.png    welcome page and how-to page
 *   src/app/assets/alert-email.png   how-to page
 *   listing/app-icon-192.png         marketplace app icon, 192×192
 *   listing/developer-icon-192.png   developer icon, 192×192
 *   listing/app-card-592x348.png     app card image, 592×348
 *   listing/gallery-*.png            gallery images, 1920×960
 *   listing/auth-code.png            the authorization code monday's security
 *                                    review asks to see, taken from the source
 *
 * Sizes are monday's, from `apps/docs/app-listing-page` (read 27 Sep 2026).
 *
 * A development tool, not part of the app: it needs Playwright, which is not a
 * dependency. Run with the global install on the path, for example
 *
 *   NODE_PATH="$(npm root -g)" node scripts/make-assets.js
 *
 * Every screenshot is of the real UI, showing the demo account's invented
 * boards. None of it is a customer's data.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  chromium,
  root,
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

/** A 1920×960 gallery slide: a sentence on the left, the product on the right. */
function galleryHtml(headline, detail, shotBase64, { dark = false } = {}) {
  return page(1920, 960, `
    <div class="slide">
      <div class="copy">
        <div class="brand">${markSvg(56)}<span>Automation Watchdog</span></div>
        <h1>${headline}</h1>
        <p>${detail}</p>
      </div>
      <div class="shot"><img src="data:image/png;base64,${shotBase64}"></div>
    </div>`, `
    .slide { display: flex; align-items: center; gap: 70px; height: 100%; padding: 0 0 0 110px;
      background: ${dark ? '#10122a' : '#f3f5fb'}; color: ${dark ? '#edeef5' : NAVY}; }
    .copy { flex: 0 0 560px; }
    .brand { display: flex; align-items: center; gap: 14px; font-size: 22px; font-weight: 700; margin-bottom: 46px; }
    .brand svg { border-radius: 12px; }
    h1 { font-size: 58px; line-height: 1.1; font-weight: 800; letter-spacing: -1px; margin-bottom: 26px; }
    p { font-size: 26px; line-height: 1.45; color: ${dark ? '#a4a7bd' : '#55586e'}; }
    .shot { flex: 1; max-height: 780px; overflow: hidden; border-radius: 18px 0 0 18px;
      box-shadow: 0 10px 40px rgba(28,31,59,.18); }
    .shot img { width: 100%; display: block; }
  `);
}

function cardHtml() {
  return page(592, 348, `
    <div class="card">
      ${markSvg(72, { background: '#323b78' })}
      <h1>Automation Watchdog</h1>
      <p>Know when a monday automation stops working, before anyone notices the work that didn't happen.</p>
      <div class="pills"><span class="s">Stopped</span><span class="l">Overdue</span><span class="h">Running</span></div>
    </div>`, `
    .card { height: 100%; padding: 34px 40px; background: linear-gradient(135deg, #1c1f3b 0%, #26305e 100%); color: #fff; }
    .card svg { border-radius: 16px; margin-bottom: 18px; }
    h1 { font-size: 32px; font-weight: 800; letter-spacing: -.5px; margin-bottom: 10px; }
    p { font-size: 16px; line-height: 1.45; color: #c9cce0; max-width: 470px; margin-bottom: 20px; }
    .pills span { display: inline-block; font-size: 13px; font-weight: 700; padding: 4px 12px; border-radius: 999px;
      margin-right: 8px; color: #fff; }
    .s { background: ${RED}; } .l { background: #d9911a; } .h { background: #16a34a; }
  `);
}

function developerIconHtml() {
  return page(192, 192, `<div class="mono">SA</div>`, `
    .mono { width: 192px; height: 192px; display: flex; align-items: center; justify-content: center;
      background: ${TEAL}; color: #fff; font-size: 84px; font-weight: 800; letter-spacing: -3px; border-radius: 42px; }
  `);
}

/**
 * The code that authenticates requests, cut from the source rather than
 * retyped, so the screenshot cannot drift from what runs.
 */
async function authCodeHtml() {
  const source = await readFile(`${root}src/server/app-server.js`, 'utf8');
  const cut = (startMarker, endMarker) => {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start);
    if (start < 0 || end < 0) throw new Error(`Could not find ${startMarker} in app-server.js`);
    return source.slice(start, end + endMarker.length);
  };
  const verify = cut('export function verifyJwt', '\n}\n');
  const status = cut('  async function status(req, res) {', "return json(res, 401, { error: 'unauthorized' });");
  const lifecycle = cut('  async function lifecycle(req, res) {', "return json(res, 401, { error: 'unauthorized' });");
  const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const block = (title, code) => `<h2>${title}</h2><pre>${escape(code)}</pre>`;
  return page(1400, 1600, `<div class="doc">
      <h1>Automation Watchdog — request authentication (src/server/app-server.js)</h1>
      ${block('Every signed request is verified here: HMAC over the client secret, expiry enforced', verify)}
      ${block('Board view status: the account comes only from the verified session token', `${status}\n    …`)}
      ${block('Uninstall webhook: verified before anything is read', `${lifecycle}\n    …`)}
    </div>`, `
    body { background: #fff; }
    .doc { padding: 28px 34px; }
    h1 { font-size: 20px; margin-bottom: 14px; }
    h2 { font-size: 15px; margin: 18px 0 6px; color: #55586e; }
    pre { font: 13px/1.45 'DejaVu Sans Mono', monospace; background: #f6f7fb; border: 1px solid #dcdfea;
      border-radius: 8px; padding: 12px 14px; white-space: pre-wrap; }
  `);
}

const server = await startDemoServer();
const browser = await chromium.launch();
try {
  await mkdir(`${root}src/app/assets`, { recursive: true });
  await mkdir(`${root}listing`, { recursive: true });

  // In-app images, 1260×868 and 1260×588: the view is 860px wide at most, so
  // it is shot narrow and at 1.4× rather than wide with empty margins.
  const boardView = await shootBoardView(browser, { width: 900, height: 620, scale: 1.4 });
  await writeFile(`${root}src/app/assets/board-view.png`, boardView);
  const email = await renderHtml(browser, await alertEmailHtml(900, 420), 900, 420, 1.4);
  await writeFile(`${root}src/app/assets/alert-email.png`, email);

  // Listing images, at monday's exact sizes.
  await writeFile(`${root}listing/app-icon-192.png`, await renderHtml(browser, page(192, 192, markSvg(192)), 192, 192));
  await writeFile(`${root}listing/developer-icon-192.png`, await renderHtml(browser, developerIconHtml(), 192, 192));
  await writeFile(`${root}listing/app-card-592x348.png`, await renderHtml(browser, cardHtml(), 592, 348));

  const sharp = (buffer) => buffer.toString('base64');
  // The view is 860px wide at most, so it is shot narrow and scaled up
  // rather than shot wide with empty margins.
  const gallery = { width: 900, height: 700, scale: 1.4 };
  const board2x = await shootBoardView(browser, gallery);
  const welcome = await shootBoardView(browser, { ...gallery, welcome: true });
  const dark = await shootBoardView(browser, { ...gallery, colorScheme: 'dark' });
  const emailShot = await renderHtml(browser, await alertEmailHtml(900, 420), 900, 420, 1.4);

  const slides = [
    ['gallery-1-board-view', 'See which automations have stopped.', 'Every automation that repeats, on every board you can see, with its normal rhythm and its state today.', board2x],
    ['gallery-2-email', 'Get an email when one goes quiet.', 'One email when it stops, a reminder if it is still stopped three days later, and a note when it recovers.', emailShot],
    ['gallery-3-welcome', 'Read-only. Set up in one click.', 'It never changes a board, an item or an automation. Add the view, approve read-only access, done.', welcome],
    ['gallery-4-dark', 'At home in dark mode.', 'Follows monday’s light, dark and night themes.', dark, { dark: true }],
  ];
  for (const [name, headline, detail, shot, options] of slides) {
    await writeFile(`${root}listing/${name}.png`, await renderHtml(browser, galleryHtml(headline, detail, sharp(shot), options), 1920, 960));
  }
  {
    const context = await browser.newContext({ viewport: { width: 1400, height: 800 } });
    const tab = await context.newPage();
    await tab.setContent(await authCodeHtml(), { waitUntil: 'load' });
    await tab.evaluate(() => {
      // Fit the page to the code, however long it grows.
      document.documentElement.style.height = 'auto';
      document.body.style.height = 'auto';
      document.body.style.overflow = 'visible';
    });
    await tab.screenshot({ path: `${root}listing/auth-code.png`, fullPage: true });
    await context.close();
  }
  console.log('Wrote src/app/assets/ (2 images) and listing/ (8 images).');
} finally {
  await browser.close();
  server.kill();
}
