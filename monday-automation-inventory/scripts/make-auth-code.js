#!/usr/bin/env node
/**
 * The screenshot of the request-authentication code that monday's security
 * review asks for, cut from the source so it cannot drift from the code, as
 * Automation Watchdog's make-assets.js does. Writes listing/auth-code.png.
 *
 * A development tool, not part of the app: it needs Playwright and Chromium
 * (preinstalled in Claude Code cloud sessions).
 */

import { mkdir, readFile } from 'node:fs/promises';
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
const source = await readFile(`${root}src/server/app-server.js`, 'utf8');

function cut(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error(`Could not find ${startMarker} in src/server/app-server.js`);
  return source.slice(start, end + endMarker.length);
}

const verify = cut('export function verifyJwt', '\n}\n');
const audience = cut('  function sidekickAudience(aud) {', '\n  }\n');
const tool = cut('  async function sidekickTool(req, res) {', "return json(res, 401, { error: 'unauthorized' });");
const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const block = (title, code) => `<h2>${title}</h2><pre>${escape(code)}</pre>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { background: #fff; color: #1c1f3b; font-family: 'Inter', 'Liberation Sans', Arial, sans-serif; width: 1400px; }
  .doc { padding: 28px 34px; }
  h1 { font-size: 20px; margin-bottom: 14px; }
  h2 { font-size: 15px; margin: 18px 0 6px; color: #55586e; }
  pre { font: 13px/1.45 'DejaVu Sans Mono', monospace; background: #f6f7fb; border: 1px solid #dcdfea;
    border-radius: 8px; padding: 12px 14px; white-space: pre-wrap; }
</style></head><body><div class="doc">
  <h1>Automation Inventory — request authentication (src/server/app-server.js)</h1>
  ${block('Every signed request is verified here: HMAC with the signing secret, only HS256/384/512, expiry enforced', verify)}
  ${block('The token must have been issued for this route on this app\'s monday code service', audience)}
  ${block('The Sidekick tool: signature, expiry, audience and short-lived token checked before anything is read', `${tool}\n    }\n    …`)}
</div></body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.setContent(html, { waitUntil: 'load' });
  await mkdir(`${root}listing`, { recursive: true });
  await page.screenshot({ path: `${root}listing/auth-code.png`, fullPage: true });
  console.log('Wrote listing/auth-code.png');
} finally {
  await browser.close();
}
