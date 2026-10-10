#!/usr/bin/env node
/**
 * Screenshots of the real board view on the invented demo account, for the
 * how-to-use page. monday asks for that page to include "images and videos to
 * support your app" (`apps/docs/documentation-and-support`, read 28 Sep 2026).
 * Render what the app actually shows, never a mock-up (Automation Inventory's
 * make-assets.js).
 *
 * Unlike Inventory's, the view runs inside a fake monday here, answering the
 * SDK with the demo data, so the shots show the Reply buttons a real user
 * sees. The demo dates are moved to today, so the ages read as in the fixture.
 *
 * Needs Playwright and a Chromium (preinstalled in Claude Code cloud sessions).
 * Run: node scripts/make-assets.js — writes src/app/assets/*.png. The build
 * copies those files, so the first run needs some PNG at each name.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
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
// Setup mode serves the view with no settings at all.
const server = spawn(process.execPath, ['scripts/serve-monday.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(PORT), APP_BASE_URL: '', MONDAY_SIGNING_SECRET: '' },
  stdio: 'ignore',
});

const demo = JSON.parse(await readFile(`${root}fixtures/demo-updates.json`, 'utf8'));
const shift = Date.now() - Date.parse(demo.now);
const moved = (iso) => (iso ? new Date(Date.parse(iso) + shift).toISOString() : iso);
const updates = demo.updates.map((u) => ({
  ...u,
  created_at: moved(u.created_at),
  replies: u.replies.map((r) => ({ ...r, created_at: moved(r.created_at) })),
}));

// A page on another port that frames the view and plays monday's part.
const harness = `<!doctype html><html><body style="margin:0">
<iframe id="f" src="http://127.0.0.1:${PORT}/view/" style="width:1260px;height:2000px;border:0"></iframe>
<script>
  const updates = ${JSON.stringify(updates)};
  window.addEventListener('message', (e) => {
    const { method, args, requestId } = e.data || {};
    if (!requestId) return;
    const reply = (data) => e.source.postMessage({ requestId, data }, '*');
    if (method === 'get') return reply({ theme: 'light', user: { id: ${JSON.stringify(demo.userId)}, isViewOnly: false } });
    if (method === 'api') return reply({ data: { updates: args.params.variables.page === 1 ? updates : [] } });
    if (method === 'execute') return reply({});
  });
</script></body></html>`;
const frameHost = createServer((req, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(harness));
await new Promise((resolve) => frameHost.listen(0, '127.0.0.1', resolve));

try {
  let ready = false;
  for (let attempt = 0; attempt < 40 && !ready; attempt += 1) {
    ready = await fetch(`http://127.0.0.1:${PORT}/view/`).then((r) => r.ok).catch(() => false);
    if (!ready) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1260, height: 2000 }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${frameHost.address().port}/`);
  const frame = await (await page.waitForSelector('iframe')).contentFrame();
  await frame.waitForSelector('.welcome');
  await frame.locator('.wrap').screenshot({ path: `${root}src/app/assets/welcome.png` });

  await frame.getByRole('button', { name: 'Show unanswered updates' }).click();
  await frame.waitForSelector('.rows');
  await frame.getByRole('button', { name: /^All \(/ }).click();
  await frame.locator('.wrap').screenshot({ path: `${root}src/app/assets/list.png` });

  await frame.getByRole('button', { name: /^Mentioning me \(/ }).click();
  await frame.locator('.wrap').screenshot({ path: `${root}src/app/assets/mentions.png` });
  await browser.close();
  console.log('src/app/assets/welcome.png, list.png, mentions.png');
} finally {
  server.kill();
  frameHost.close();
}
