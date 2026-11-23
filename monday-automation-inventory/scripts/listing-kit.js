/**
 * Shared by scripts/make-listing.js and scripts/make-listing-video.js: the
 * brand mark, a fixed-size page, the local server in setup mode, and
 * screenshots of the real view on the invented demo account.
 *
 * Adapted from Automation Watchdog's scripts/asset-kit.js (27 Sep 2026), so
 * the two apps' listings look like one developer's: the same navy, type and
 * layout, with Inventory's own mark (a list and a magnifier) and accent
 * (violet, where Watchdog is teal and red).
 *
 * A development tool, not part of the app: it needs Playwright, which is not a
 * dependency, and the server never loads this file (.mappsignore).
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { APP_NAME } from '../src/core/brand.js';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  // The global install in Claude Code cloud sessions.
  playwright = require('/opt/node22/lib/node_modules/playwright');
}

export { APP_NAME };
export const root = fileURLToPath(new URL('..', import.meta.url));
export const PORT = Number(process.env.LISTING_PORT ?? 8298);
export const BASE = `http://127.0.0.1:${PORT}`;
export const VIEW = `${BASE}/view/`;

export const FONT = "'Inter', 'Liberation Sans', Arial, sans-serif";
export const NAVY = '#1c1f3b';
export const INK = '#e9eaf6';
export const ACCENT = '#8f7bff';
export const MUTED = '#55586e';
export const LIGHT_BG = '#f3f5fb';
export const DARK_BG = '#10122a';
/** The view's own state colours (src/app/index.html), for the card's pills. */
export const STATE = { on: '#16a34a', off: '#8b8fa3', warn: '#d9911a' };

/** The mark: a list of rows with a magnifier over it. */
export function markSvg(size, { background = NAVY, radius = 0.22 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
    <rect width="100" height="100" rx="${radius * 100}" fill="${background}"/>
    <g fill="${INK}">
      <circle cx="21" cy="24" r="4.2"/><circle cx="21" cy="42" r="4.2"/><circle cx="21" cy="60" r="4.2"/>
    </g>
    <g stroke="${INK}" stroke-width="7" stroke-linecap="round">
      <path d="M33 24 H79"/><path d="M33 42 H52"/><path d="M33 60 H40"/>
    </g>
    <circle cx="64" cy="61" r="12.5" fill="none" stroke="${ACCENT}" stroke-width="7"/>
    <path d="M73.5 70.5 L81 78" stroke="${ACCENT}" stroke-width="8" stroke-linecap="round"/>
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

export const b64 = (buffer) => buffer.toString('base64');
export const escapeHtml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function launchBrowser() {
  const bundled = '/opt/pw-browsers/chromium';
  const executablePath = process.env.CHROMIUM_PATH || (existsSync(bundled) ? bundled : undefined);
  return playwright.chromium.launch({ executablePath });
}

/**
 * Builds the view and starts the real server in setup mode, which serves the
 * view and the demo data with no settings at all (scripts/check-deploy.js
 * checks the same).
 */
export async function startServer() {
  const built = spawnSync(process.execPath, ['scripts/build.js'], { cwd: root, stdio: 'inherit' });
  if (built.status !== 0) throw new Error('The view did not build.');
  const env = { ...process.env, PORT: String(PORT) };
  for (const name of ['APP_BASE_URL', 'MONDAY_SIGNING_SECRET', 'APP_BILLING']) delete env[name];
  const child = spawn(process.execPath, ['scripts/serve-monday.js'], { cwd: root, env, stdio: 'ignore' });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const ok = await fetch(VIEW).then((r) => r.ok).catch(() => false);
    if (ok) return child;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill();
  throw new Error(`The server did not start on port ${PORT}.`);
}

/**
 * The view opened on its own, the way the listing's demo link opens it: the
 * invented demo account, past the welcome page.
 *
 * @returns {Promise<{context, tab}>}
 */
export async function openDemo(browser, { width = 900, height = 1400, scale = 2, colorScheme = 'light', welcome = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, colorScheme });
  if (!welcome) await context.addInitScript(() => window.localStorage.setItem('inventory:welcomed:v1', '1'));
  const tab = await context.newPage();
  await tab.goto(VIEW);
  await tab.waitForSelector(welcome ? '.welcome' : '#app .rows');
  await tab.evaluate(() => document.fonts.ready);
  return { context, tab };
}

/**
 * The same view inside a stand-in for monday: a parent page answering the
 * SDK's postMessage protocol (as test/browser/verify-view.mjs does) with the
 * demo account's boards and automations. Only this way does the view show its
 * "Open board ↗" links, which need monday's SDK to open a tab. The board URLs
 * are invented; nothing is opened.
 *
 * @returns {Promise<{context, tab, frame}>}
 */
export async function openInMonday(browser, { width = 900, height = 1400, scale = 2, theme = 'light' } = {}) {
  const demo = JSON.parse(await readFile(`${root}fixtures/demo-automations.json`, 'utf8'));
  const boards = demo.boards.map((board) => ({ ...board, url: `https://example.monday.com/boards/${board.id}` }));
  const items = (boardId) =>
    demo.automations
      .filter((a) => a.boardId === boardId)
      .map((a) => ({
        id: a.id, title: a.title, description: a.description, active: a.active, user_id: null,
        created_at: a.createdAt, updated_at: a.updatedAt, notice_message: a.notice || null,
      }));
  const harness = `<!doctype html><html><body style="margin:0">
    <iframe src="/view/" style="width:${width}px;height:${height}px;border:0;display:block"></iframe>
    <script>
      const cfg = ${JSON.stringify({ theme, boards, items: Object.fromEntries(boards.map((b) => [b.id, items(b.id)])) })};
      window.addEventListener('message', (e) => {
        const { method, args, requestId } = e.data || {};
        if (!requestId) return;
        const reply = (data) => e.source.postMessage({ requestId, data }, '*');
        if (method === 'get' && args.type === 'context') return reply({ theme: cfg.theme, user: { isViewOnly: false } });
        if (method === 'execute') return reply({});
        if (method !== 'api') return;
        const q = args.params.query, v = args.params.variables || {};
        if (/board_automations/.test(q)) {
          return reply({ data: { board_automations: { cursor: null, items: cfg.items[String(v.boardId)] || [], legacy_automations: null } } });
        }
        if (/boards/.test(q)) return reply({ data: { boards: v.page > 1 ? [] : cfg.boards } });
        return reply({ data: {} });
      });
    </script></body></html>`;

  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  await context.addInitScript(() => window.localStorage.setItem('inventory:welcomed:v1', '1'));
  await context.route(`${BASE}/harness`, (route) => route.fulfill({ contentType: 'text/html', body: harness }));
  const tab = await context.newPage();
  // "last changed … ago" counts from the same moment as the demo account.
  await tab.clock.setFixedTime(new Date('2026-09-28T09:00:00Z'));
  await tab.goto(`${BASE}/harness`);
  const frame = tab.frame({ url: /\/view\/$/ });
  await frame.waitForSelector('#app .rows');
  await frame.evaluate(() => document.fonts.ready);
  return { context, tab, frame };
}

/**
 * Where to cut the view so nothing is cut through: the bottom of the last whole
 * block (a row, or the line under the list) that fits in `maxHeight` CSS
 * pixels, plus `pad`. The rows are 10px apart, so `pad` stays under that.
 * `target` is a Page or a Frame.
 */
export async function cutHeight(target, { maxHeight = 700, pad = 8 } = {}) {
  return target.evaluate(({ maxHeight, pad }) => {
    const blocks = [...document.querySelectorAll('#app .rows > *, #app > p.meta')]
      .map((node) => node.getBoundingClientRect().bottom);
    const fits = blocks.filter((y) => y + pad <= maxHeight);
    const last = fits.length > 0 ? fits[fits.length - 1] : maxHeight - pad;
    return Math.ceil(last + pad);
  }, { maxHeight, pad });
}

/**
 * A screenshot of the view from the top down to `cutHeight`. The clip is in
 * the top page's coordinates, which for the harness's iframe at (0, 0) are the
 * same as the view's.
 */
export async function shootView(tab, { maxHeight = 700, target = tab, pad = 8 } = {}) {
  const height = await cutHeight(target, { maxHeight, pad });
  return tab.screenshot({ clip: { x: 0, y: 0, width: tab.viewportSize().width, height } });
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

/** A mouse pointer, tip at (0, 0), for the video's clicks. */
export const POINTER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="48" viewBox="-2 -2 24 34">
  <path d="M0 0 V25 L6.2 19.4 L10.4 29 L14.6 27.2 L10.5 17.8 H18.6 Z" fill="${NAVY}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>
</svg>`;

/**
 * Text on the left, the product on the right: the gallery images (1920×960)
 * and the video's product scenes (1920×1080). Each of `shots` is a PNG of the
 * view `shotWidth` CSS pixels wide, shown at `zoom`; only the first is shown
 * until a script shows another (#shot-1, …). `panelHeight`, in slide pixels,
 * fixes the panel's height, with the shot at its top; otherwise the panel is
 * as tall as the shot. `pointer` adds a hidden #pointer for the video.
 */
export function slideHtml({ width, height, headline, detail, shot, shots = [shot], shotWidth = 900, zoom, dark = false, big = false, panelHeight = null, pointer = false }) {
  const shotPx = Math.round(shotWidth * zoom);
  const s = big ? 1.1 : 1;
  const images = shots
    .map((png, i) => `<img id="shot-${i}" src="data:image/png;base64,${b64(png)}"${i > 0 ? ' style="display:none"' : ''}>`)
    .join('');
  return page(width, height, `
    <div class="slide">
      <div class="copy">
        <div class="brand">${markSvg(Math.round(56 * s), { background: dark ? '#262a52' : NAVY })}<span>${escapeHtml(APP_NAME)}</span></div>
        <h1>${headline}</h1>
        <p>${detail}</p>
      </div>
      <div class="shot">${images}</div>
      ${pointer ? `<div id="pointer">${POINTER_SVG}</div>` : ''}
    </div>`, `
    .slide { position: relative; height: 100%; background: ${dark ? DARK_BG : LIGHT_BG}; color: ${dark ? '#edeef5' : NAVY}; }
    .copy { position: absolute; left: ${Math.round(110 * s)}px; top: 50%; transform: translateY(-50%);
      width: ${width - shotPx - Math.round(110 * s) - 70}px; }
    .brand { display: flex; align-items: center; gap: 14px; font-size: ${Math.round(22 * s)}px; font-weight: 700; margin-bottom: ${Math.round(44 * s)}px; }
    .brand svg { border-radius: ${Math.round(12 * s)}px; flex: none; }
    h1 { font-size: ${Math.round(58 * s)}px; line-height: 1.1; font-weight: 800; letter-spacing: -1px; margin-bottom: ${Math.round(26 * s)}px;
      text-wrap: balance; }
    p { font-size: ${Math.round(26 * s)}px; line-height: 1.45; color: ${dark ? '#a4a7bd' : MUTED}; text-wrap: pretty; }
    .shot { position: absolute; right: 0; top: 50%; transform: translateY(-50%); width: ${shotPx}px;
      ${panelHeight ? `height: ${panelHeight}px;` : ''}
      overflow: hidden; border-radius: 18px 0 0 18px; background: ${dark ? '#181b34' : '#fff'};
      box-shadow: 0 10px 40px rgba(28,31,59,${dark ? '.5' : '.18'}); }
    .shot img { width: ${shotPx}px; display: block; will-change: transform; }
    #pointer { position: absolute; left: 0; top: 0; display: none; filter: drop-shadow(0 2px 3px rgba(0,0,0,.3)); }
  `);
}
