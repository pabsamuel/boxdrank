#!/usr/bin/env node
/**
 * Screenshots of the real board view on the invented demo account, for the
 * how-to-use page. monday asks for that page to include "images and videos to
 * support your app" (`apps/docs/documentation-and-support`, read 28 Sep 2026).
 * The same approach as Automation Watchdog's make-assets.js: render what the
 * app actually shows, never a mock-up.
 *
 * Needs Playwright and a Chromium (preinstalled in Claude Code cloud sessions).
 * Run: node scripts/make-assets.js — writes src/app/assets/*.png.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}

const root = fileURLToPath(new URL('..', import.meta.url));
const PORT = 8297;

spawnSync(process.execPath, ['scripts/build.js'], { cwd: root, stdio: 'inherit' });
// Setup mode serves the view and the demo data with no settings at all.
const server = spawn(process.execPath, ['scripts/serve-monday.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(PORT), APP_BASE_URL: '', MONDAY_SIGNING_SECRET: '' },
  stdio: 'ignore',
});

try {
  let ready = false;
  for (let attempt = 0; attempt < 40 && !ready; attempt += 1) {
    ready = await fetch(`http://127.0.0.1:${PORT}/view/`).then((r) => r.ok).catch(() => false);
    if (!ready) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1260, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${PORT}/view/`);
  await page.waitForSelector('.welcome');
  await page.locator('.wrap').screenshot({ path: `${root}src/app/assets/welcome.png` });

  await page.getByRole('button', { name: 'Show my automations' }).click();
  await page.waitForSelector('.rows');
  await page.setViewportSize({ width: 1260, height: 1500 });
  await page.locator('.wrap').screenshot({ path: `${root}src/app/assets/list.png` });

  await page.getByRole('button', { name: 'Switched off' }).click();
  await page.locator('input.search').fill('campaign');
  await page.setViewportSize({ width: 1260, height: 700 });
  await page.locator('.wrap').screenshot({ path: `${root}src/app/assets/search.png` });
  await browser.close();
  console.log('src/app/assets/welcome.png, list.png, search.png');
} finally {
  server.kill();
}
