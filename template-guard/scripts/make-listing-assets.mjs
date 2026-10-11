#!/usr/bin/env node
/**
 * Renders the marketplace listing images (sizes from monday's
 * `apps/docs/app-listing-page`):
 *
 *   listing/app-icon-192.png          192×192
 *   listing/app-card-592x348.png      592×348
 *   listing/gallery-*.png             1920×960
 *
 * Gallery 1 and 3 reproduce the board view with the exact text the live app
 * returned on 28 Sep 2026 for the test copy of "Automation Actor Test" — real
 * output on a test account, no customer data. Gallery 2 is an illustration of
 * a sidekick exchange (board and template names invented); replace it with a
 * real screenshot once sidekick has AI credits on the test account.
 *
 * A development tool, not part of the app; needs the global Playwright:
 *   NODE_PATH="$(npm root -g)" node scripts/make-listing-assets.mjs
 */
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = fileURLToPath(new URL('../listing/', import.meta.url));

const NAVY = '#1c1f3b';
const BLUE = '#0073ea';
const RED = '#e2445c';
const AMBER = '#d9911a';
const FONT = "'Inter', 'Liberation Sans', Arial, sans-serif";

/** The mark: a template sheet, its copy offset behind it, and a check shield. */
function mark(size, bg = NAVY) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
    <rect width="100" height="100" rx="22" fill="${bg}"/>
    <rect x="30" y="18" width="42" height="52" rx="6" fill="none" stroke="#6c7bd9" stroke-width="5"/>
    <rect x="20" y="28" width="42" height="52" rx="6" fill="#fff"/>
    <path d="M28 42 H54 M28 52 H54 M28 62 H44" stroke="#c3c6d4" stroke-width="5" stroke-linecap="round"/>
    <circle cx="68" cy="68" r="17" fill="${BLUE}"/>
    <path d="M60 68 L66 74 L77 62" fill="none" stroke="#fff" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function page(w, h, body, css = '') {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: ${w}px; height: ${h}px; overflow: hidden; font-family: ${FONT}; }
    ${css}</style></head><body>${body}</body></html>`;
}

const finding = (sev, color, what, why, fix) => `
  <div class="f"><span class="sev" style="background:${color}">${sev}</span>
    <div><div class="what">${what}</div><div class="why">${why}</div><div class="fix"><b>Fix:</b> ${fix}</div></div></div>`;

const FINDINGS = [
  finding('Missing', RED, 'The column “Spike Target” exists on the template but not on this board.',
    'This is a connect-type column. Anything that reads or writes through it — automations, mirrored values, dependency chains — has nothing to run against on this board.',
    'Add a “Spike Target” column of type board_relation to this board.'),
  finding('Missing', RED, 'The view “Automation Watchdog” exists on the template but not on this board.',
    'Views carry filters and groupings the team relies on.',
    'Recreate the “Automation Watchdog” view on this board (an app view — add it from “+” → Apps).'),
  finding('Missing', RED, 'The view “Vibe Görünümü Oluştur” exists on the template but not on this board.',
    'A missing view usually means someone is looking at an unfiltered board and does not realise it.',
    'Recreate the view on this board (an app view — add it from “+” → Apps).'),
].join('');

const PANEL_CSS = `
  .panel { background: #fff; border-radius: 16px; padding: 36px 40px; font-size: 20px; color: #323338; }
  .panel h2 { font-size: 30px; margin-bottom: 6px; }
  .sub { color: #676879; font-size: 17px; margin-bottom: 22px; }
  .row { display: flex; gap: 14px; align-items: center; margin-bottom: 22px; }
  .sel { border: 1px solid #c3c6d4; border-radius: 8px; padding: 12px 16px; width: 380px; font-size: 18px; }
  .btn { background: ${BLUE}; color: #fff; border-radius: 8px; padding: 12px 22px; font-weight: 700; font-size: 18px; }
  .count { font-size: 24px; font-weight: 800; margin: 6px 0 16px; }
  .f { display: flex; gap: 16px; padding: 16px 0; border-top: 1px solid #e6e9ef; }
  .sev { color: #fff; font-size: 14px; font-weight: 700; border-radius: 999px; padding: 4px 12px; height: fit-content; white-space: nowrap; }
  .what { font-weight: 700; margin-bottom: 4px; }
  .why { color: #676879; font-size: 17px; margin-bottom: 4px; }
  .fix { font-size: 17px; }
  .chat { display: flex; flex-direction: column; gap: 18px; }
  .q { align-self: flex-end; background: ${BLUE}; color: #fff; border-radius: 18px 18px 4px 18px; padding: 16px 22px; max-width: 80%; }
  .a { background: #f0f2f8; border-radius: 18px 18px 18px 4px; padding: 18px 22px; line-height: 1.5; font-size: 19px; }
  .who { font-size: 14px; font-weight: 700; color: #676879; margin-bottom: 6px; }
`;

const comparePanel = `<div class="panel">
  <h2>Template Guard</h2>
  <div class="sub">monday drops configuration when you duplicate a board and does not tell you. This finds what it dropped.</div>
  <div class="row"><div class="sel">Automation Actor Test</div><div class="btn">Compare</div></div>
  <div class="count">3 differences found</div>${FINDINGS}</div>`;

const chatPanel = `<div class="panel"><div class="chat">
  <div class="q">What did the Client A board lose from its template?</div>
  <div class="a"><div class="who">sidekick · Template Guard</div>
  “Client A” differs from its template in 3 ways, most serious first:
  the connect column <b>Spike Target</b> is missing, so nothing linked through it runs on this board;
  the app views <b>Automation Watchdog</b> and <b>Vibe</b> were not copied.
  Add the column from “+” → Connect boards and re-add the views from “+” → Apps.
  <div style="color:#676879;font-size:15px;margin-top:8px">Checked live against the template “Client Onboarding” saved on 28 Sep 2026.</div></div>
</div></div>`;

const manualPanel = `<div class="panel">
  <h2>You need to fix these by hand (3)</h2>
  <div class="sub">Each link opens the right board. Template Guard explains why it will not do these for you.</div>
  ${finding('Manual', AMBER, 'Add a “Spike Target” connect column to this board and point it at the correct board.',
    'Why not automatic: pointing it at the template’s target is exactly the mistake this app exists to catch.',
    'Open the board, click “+” at the right end of the column headers, choose Connect boards.')}
  ${finding('Manual', AMBER, 'Recreate the “Automation Watchdog” view on this board.',
    'Why not automatic: monday’s API does not expose view creation.', 'Open the board → “+” → Apps.')}
</div>`;

function slide(headline, detail, panel) {
  return page(1920, 960, `<div class="slide"><div class="copy">
      <div class="brand">${mark(56)}<span>Template Guard</span></div>
      <h1>${headline}</h1><p>${detail}</p></div>
      <div class="shot">${panel}</div></div>`, `
    .slide { display: flex; align-items: center; gap: 70px; height: 100%; padding: 0 90px 0 110px; background: #f3f5fb; color: ${NAVY}; }
    .copy { flex: 0 0 560px; }
    .brand { display: flex; align-items: center; gap: 14px; font-size: 22px; font-weight: 700; margin-bottom: 46px; }
    h1 { font-size: 58px; line-height: 1.1; font-weight: 800; letter-spacing: -1px; margin-bottom: 26px; }
    p { font-size: 26px; line-height: 1.45; color: #55586e; }
    .shot { flex: 1; box-shadow: 0 10px 40px rgba(28,31,59,.18); border-radius: 16px; }
    ${PANEL_CSS}`);
}

const card = page(592, 348, `<div class="card">${mark(72, '#323b78')}
  <h1>Template Guard</h1>
  <p>Find what a board lost when it was copied from its template — before the team finds out the hard way.</p>
  <div class="pills"><span style="background:${RED}">Miswired</span><span style="background:#e67e22">Missing</span><span style="background:${AMBER}">Altered</span></div></div>`, `
  .card { height: 100%; padding: 34px 40px; background: linear-gradient(135deg, #1c1f3b 0%, #26305e 100%); color: #fff; }
  .card svg { margin-bottom: 18px; }
  h1 { font-size: 32px; font-weight: 800; margin-bottom: 10px; }
  p { font-size: 16px; line-height: 1.45; color: #c9cce0; max-width: 480px; margin-bottom: 20px; }
  .pills span { display: inline-block; font-size: 13px; font-weight: 700; padding: 4px 12px; border-radius: 999px; margin-right: 8px; }`);

const jobs = [
  ['app-icon-192.png', 192, 192, page(192, 192, mark(192))],
  ['app-card-592x348.png', 592, 348, card],
  ['gallery-1-compare.png', 1920, 960, slide('See what the copy lost.', 'Compare any board with the template it came from. Every difference, ranked by how much it hurts.', comparePanel)],
  ['gallery-2-sidekick.png', 1920, 960, slide('Just ask sidekick.', '“What did the Client A board lose from its template?” monday’s AI assistant answers with Template Guard.', chatPanel)],
  ['gallery-3-fix.png', 1920, 960, slide('Fix it with a checklist.', 'Plain-language steps and a link to the right board. Read-only: Template Guard never changes your boards.', manualPanel)],
];

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const pg = await browser.newPage();
for (const [name, w, h, html] of jobs) {
  await pg.setViewportSize({ width: w, height: h });
  await pg.setContent(html);
  await pg.screenshot({ path: `${out}${name}`, omitBackground: name.startsWith('app-icon') });
  console.log('wrote', name);
}
await browser.close();
