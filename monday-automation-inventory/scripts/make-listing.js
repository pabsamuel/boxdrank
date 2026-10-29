#!/usr/bin/env node
/**
 * Renders the marketplace listing images into listing/, from the real view
 * running on the invented demo account.
 *
 *   listing/app-icon-192.png         app icon, 192×192
 *   listing/developer-icon-192.png   developer icon, 192×192: Watchdog's, copied
 *                                    (same developer)
 *   listing/app-card-592x348.png     app card image, 592×348
 *   listing/gallery-*.png            gallery images, 1920×960
 *
 * Sizes are monday's, from `apps/docs/app-listing-page` (read 27 Sep 2026 for
 * Watchdog; SUBMISSION-CHECKLIST.md). There is no gallery image of sidekick:
 * no real screenshot of it exists, and a drawn one would be a mock-up.
 *
 * A development tool, not part of the app: it needs Playwright and a Chromium
 * (preinstalled in Claude Code cloud sessions). Run:
 *
 *   node scripts/make-listing.js
 */

import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import {
  APP_NAME,
  root,
  STATE,
  markSvg,
  page,
  escapeHtml,
  launchBrowser,
  startServer,
  openDemo,
  shootView,
  renderHtml,
  slideHtml,
} from './listing-kit.js';

const out = `${root}listing/`;
const W = 1920;
const H = 960;
/** The view is 900 CSS px wide at most here, shown at 1.26× on the slide. */
const ZOOM = 1.26;
const MAX_SHOT = Math.floor(860 / ZOOM);

function cardHtml() {
  return page(592, 348, `
    <div class="card">
      ${markSvg(72, { background: '#323b78' })}
      <h1>${escapeHtml(APP_NAME)}</h1>
      <p>Every automation on every board, in one searchable list: on or off, with monday’s warnings.</p>
      <div class="pills"><span class="on">On</span><span class="off">Off</span><span class="warn">With a warning</span></div>
    </div>`, `
    .card { height: 100%; padding: 34px 40px; background: linear-gradient(135deg, #1c1f3b 0%, #26305e 100%); color: #fff; }
    .card svg { border-radius: 16px; margin-bottom: 18px; }
    h1 { font-size: 32px; font-weight: 800; letter-spacing: -.5px; margin-bottom: 10px; }
    p { font-size: 16px; line-height: 1.45; color: #c9cce0; max-width: 470px; margin-bottom: 20px; text-wrap: balance; }
    .pills span { display: inline-block; font-size: 13px; font-weight: 700; padding: 4px 12px; border-radius: 999px;
      margin-right: 8px; color: #fff; }
    .on { background: ${STATE.on}; } .off { background: ${STATE.off}; } .warn { background: ${STATE.warn}; }
  `);
}

const server = await startServer();
const browser = await launchBrowser();
try {
  await mkdir(out, { recursive: true });

  await writeFile(`${out}app-icon-192.png`, await renderHtml(browser, page(192, 192, markSvg(192)), 192, 192));
  await writeFile(`${out}app-card-592x348.png`, await renderHtml(browser, cardHtml(), 592, 348));
  const developerIcon = `${root}../monday-automation-watchdog/listing/developer-icon-192.png`;
  if (existsSync(developerIcon)) await copyFile(developerIcon, `${out}developer-icon-192.png`);
  else console.warn('Watchdog\'s developer icon was not found; listing/developer-icon-192.png left as it is.');

  // Every screenshot: the demo account, 900 CSS px wide, at 2× for sharpness.
  const shots = {};
  {
    const { context, tab } = await openDemo(browser);
    shots.list = await shootView(tab, { maxHeight: MAX_SHOT });
    await tab.locator('input.search').fill('notify');
    shots.search = await shootView(tab, { maxHeight: MAX_SHOT });
    await tab.locator('input.search').fill('');
    await tab.getByRole('button', { name: 'Switched off' }).click();
    shots.filters = await shootView(tab, { maxHeight: MAX_SHOT });
    await context.close();
  }
  {
    const { context, tab } = await openDemo(browser, { colorScheme: 'dark' });
    shots.dark = await shootView(tab, { maxHeight: MAX_SHOT });
    await context.close();
  }

  const slides = [
    ['gallery-1-list', 'Every automation, on every board, in one list',
      'On or off, with monday’s warning on each, from every board you can see. The ones that need attention come first.', shots.list],
    ['gallery-2-search', 'Find an automation by what it does',
      'Search the words in its name, its board or monday’s warning. Here “notify” finds both automations that notify someone, on two boards.', shots.search],
    ['gallery-3-filters', 'See what’s switched off, and what monday warns about',
      'One click shows only the automations switched off, or only those with a warning from monday. Narrow it to one board, too.', shots.filters],
    ['gallery-4-dark', 'Follows monday’s light, dark and night themes',
      'It picks up the theme you use in monday, so it looks at home next to your boards.', shots.dark, { dark: true }],
  ];
  for (const [name, headline, detail, shot, options = {}] of slides) {
    const html = slideHtml({ width: W, height: H, headline, detail, shot, zoom: ZOOM, ...options });
    await writeFile(`${out}${name}.png`, await renderHtml(browser, html, W, H));
  }
  console.log(`Wrote listing/: app icon, app card, developer icon and ${slides.length} gallery images.`);
} finally {
  await browser.close();
  server.kill();
}
