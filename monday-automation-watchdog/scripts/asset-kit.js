/**
 * Shared by scripts/make-assets.js and scripts/make-video.js: the brand mark,
 * a fixed-size page, the demo server, and screenshots of the real board view on
 * the demo account. Development tools only; they need Playwright, which is not
 * a dependency (run with NODE_PATH="$(npm root -g)").
 */

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { watch } from '../src/core/watch.js';
import { planNotifications } from '../src/core/alerts.js';
import { renderEmail } from '../src/core/email.js';

const require = createRequire(import.meta.url);
export const { chromium } = require('playwright');

export const root = fileURLToPath(new URL('..', import.meta.url));
export const PORT = 8199;
export const DEMO = `http://127.0.0.1:${PORT}/src/app/index.html`;

export const FONT = "'Inter', 'Liberation Sans', Arial, sans-serif";
export const NAVY = '#1c1f3b';
export const TEAL = '#12b3a0';
export const RED = '#e2445c';

/** The mark: an activity line that runs, then goes flat, ending in an alert dot. */
export function markSvg(size, { background = NAVY, radius = 0.22 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
    <rect width="100" height="100" rx="${radius * 100}" fill="${background}"/>
    <path d="M14 58 H27 L34 36 L43 72 L51 30 L58 58 H74" fill="none" stroke="${TEAL}" stroke-width="7"
      stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="82" cy="58" r="7.5" fill="${RED}"/>
  </svg>`;
}

export function page(width, height, body, extraCss = '') {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; }
    html, body { width: ${width}px; height: ${height}px; overflow: hidden; }
    body { font-family: ${FONT}; color: ${NAVY}; }
    ${extraCss}
  </style></head><body>${body}</body></html>`;
}

export async function startDemoServer() {
  const child = spawn(process.execPath, ['scripts/serve.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(DEMO);
      if (response.ok) return child;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error('The demo server did not start.');
}

/** The board view on the demo account, as a PNG buffer. */
export async function shootBoardView(browser, { width, height, scale, colorScheme = 'light', welcome = false }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, colorScheme });
  if (!welcome) {
    await context.addInitScript(() => window.localStorage.setItem('watchdog:welcomed:v1', '1'));
  }
  const tab = await context.newPage();
  await tab.goto(DEMO);
  await tab.waitForSelector(welcome ? '.welcome' : '.banner');
  // Images inside the page (the welcome screenshot) must finish loading.
  await tab.waitForLoadState('networkidle');
  const shot = await tab.screenshot();
  await context.close();
  return shot;
}

export async function renderHtml(browser, html, width, height, scale = 1) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  const tab = await context.newPage();
  await tab.setContent(html, { waitUntil: 'load' });
  await tab.evaluate(() => document.fonts.ready);
  const shot = await tab.screenshot();
  await context.close();
  return shot;
}

/** The alert the demo account would receive, framed like a mail client. */
export async function alertEmailHtml(width, height) {
  const demo = JSON.parse(await readFile(`${root}fixtures/demo-activity.json`, 'utf8'));
  const results = watch(demo.entries, demo.now, {
    actorNames: new Map(demo.actors.map((a) => [a.id, a.name])),
    boardNames: new Map(demo.boards.map((b) => [b.id, b.name])),
  });
  const email = renderEmail(planNotifications(results, {}, demo.now));
  const escape = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return page(width, height, `
    <div class="client">
      <div class="head">
        <div class="subject">${escape(email.subject)}</div>
        <div class="from"><b>Automation Watchdog</b> &lt;alerts@example.com&gt; · to you</div>
      </div>
      <div class="body">${email.html}</div>
    </div>`, `
    body { background: #eef0f6; padding: 28px; }
    .client { background: #fff; border-radius: 12px; min-height: 100%; overflow: hidden;
      box-shadow: 0 2px 10px rgba(28,31,59,.08); }
    .head { padding: 22px 30px 16px; border-bottom: 1px solid #e4e6ef; }
    .subject { font-size: 22px; font-weight: 700; margin-bottom: 6px; }
    .from { font-size: 14px; color: #676879; }
    .body { padding: 22px 30px; font-size: 15px; line-height: 1.55; }
  `);
}
