// Drives the BUILT board view inside a fake monday whose account has no
// activity yet: what a reviewer or any new customer sees first. The run strip,
// and with it the only "Set up email alerts" link, must be on that page.
// Until 1 Oct 2026 the view returned before drawing the strip whenever nothing
// repeated, so no fresh install could set up alerts.
//
// Not part of `npm test`: it needs Playwright and a Chromium. In a Claude Code
// cloud session both are preinstalled (global `playwright`, /opt/pw-browsers).
// Run: npm run build && node test/browser/verify-empty-view.mjs

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

const APP = fileURLToPath(new URL('../../', import.meta.url));

// The SDK's postMessage protocol (monday-sdk-js/src/client.js): the view posts
// {method, args, requestId} and resolves with the reply's `data`.
const harness = `<!doctype html><html><body style="margin:0">
<iframe id="f" src="/view/" style="width:900px;height:1200px;border:0"></iframe>
<script>
  window.addEventListener('message', (e) => {
    const { method, args, requestId } = e.data || {};
    if (!requestId) return;
    const reply = (data) => e.source.postMessage({ requestId, data }, '*');
    if (method === 'get' && args.type === 'context') return reply({ theme: 'light', user: { isViewOnly: false } });
    if (method === 'get' && args.type === 'sessionToken') return reply('session');
    if (method === 'listen') return;
    if (method === 'execute') return reply({});
    if (method === 'api') return reply({ data: { boards: [], users: [] } });
  });
</script></body></html>`;

let status = {};
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  if (path === '/harness') return res.writeHead(200, { 'content-type': 'text/html' }).end(harness);
  if (path === '/api/status') return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(status));
  const file = path === '/view/' ? 'index.html' : path.startsWith('/view/') ? path.slice(6) : null;
  if (file) {
    try {
      const body = await readFile(`${APP}dist/${file}`);
      return res.writeHead(200, { 'content-type': types[file.slice(file.lastIndexOf('.'))] }).end(body);
    } catch { /* fall through */ }
  }
  res.writeHead(404).end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let failures = 0;
const expect = (ok, label) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
  if (!ok) failures += 1;
};

async function emptyAccount(answer, fn) {
  status = answer;
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => { try { localStorage.setItem('watchdog:welcomed:v1', '1'); } catch {} });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${base}/harness`);
  const frame = page.frame({ url: /\/view\/$/ });
  await frame.waitForFunction(() => /Nothing repeats/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
  await fn(frame);
  expect(errors.length === 0, `no page errors ${errors.join(' ')}`);
  await ctx.close();
}

await emptyAccount({ installed: false, runs: [] }, async (frame) => {
  const text = await frame.locator('#app').innerText();
  expect(text.includes('Nothing repeats often enough to watch yet'), 'an account with no history says there is nothing to watch yet');
  expect(text.includes('Email alerts are not set up for this account'), 'and still says alerts are not set up');
  expect((await frame.getByRole('link', { name: 'Set up email alerts' }).count()) === 1, 'with the "Set up email alerts" link');
});

await emptyAccount({ installed: true, runs: [] }, async (frame) => {
  expect((await frame.locator('#app').innerText()).includes('Scheduled checks are not running yet'), 'once set up, it says whether checks are running');
});

await browser.close();
server.close();
if (failures > 0) {
  console.log(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nA new account can set up alerts from the empty board view.');
