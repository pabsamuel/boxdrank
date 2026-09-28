// Drives the BUILT board view in Chromium, twice:
//   1. inside an iframe whose parent is a fake monday answering the SDK's
//      postMessage protocol (monday-sdk-js/src/client.js: the view posts
//      {method, args, requestId} and resolves with the reply's `data`);
//   2. on its own, the way the listing's demo link opens it.
// Carried over from Automation Watchdog's check of 27–28 Sep 2026.
//
// Not part of `npm test`: it needs Playwright and a Chromium. In a Claude Code
// cloud session both are preinstalled (global `playwright`, /opt/pw-browsers).
// Run: npm run build && node test/browser/verify-view.mjs

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

const harness = `<!doctype html><html><body style="margin:0">
<iframe id="f" src="/view/" style="width:900px;height:1400px;border:0"></iframe>
<script>
  window.calls = [];
  window.apiVersions = [];
  const cfg = JSON.parse(new URLSearchParams(location.search).get('cfg') || '{}');
  window.addEventListener('message', (e) => {
    const { method, args, requestId } = e.data || {};
    if (!requestId) return;
    window.calls.push({ method, type: args && args.type });
    const reply = (data) => e.source.postMessage({ requestId, data }, '*');
    if (method === 'get' && args.type === 'context') return reply({ theme: cfg.theme, user: { isViewOnly: !!cfg.viewOnly } });
    if (method === 'execute') return reply({});
    if (method === 'listen') return;
    if (method === 'api') {
      const q = args.params.query, v = args.params.variables || {};
      if (/board_automations/.test(q)) {
        window.apiVersions.push(args.apiVersion || 'none');
        const board = String(v.boardId);
        if (cfg.failBoard === board) return reply({ errors: [{ message: 'Internal server error' }] });
        if (board === '1') return reply({ data: { board_automations: { cursor: null,
          items: [{ id: 11, title: 'When status changes to Done, notify the team', active: true, updated_at: '2026-09-01T10:00:00Z' }],
          legacy_automations: [{ id: 91, boardId: 1, title: 'When Status changes to Approved move item to group Ready' }] } } });
        if (board === '2') return reply({ data: { board_automations: { cursor: null,
          items: [{ id: 21, title: 'When a lead is created, assign an owner', active: false, notice_message: 'The owner of this automation was deactivated' }], legacy_automations: null } } });
        return reply({ data: { board_automations: { cursor: null, items: [], legacy_automations: null } } });
      }
      if (/boards/.test(q)) return reply({ data: { boards: v.page > 1 ? [] : [{ id: 1, name: 'Client Projects' }, { id: 2, name: 'Sales Pipeline' }, { id: 3, name: 'Empty board' }] } });
      return reply({ data: {} });
    }
  });
</script></body></html>`;

const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  if (path === '/harness') return res.writeHead(200, { 'content-type': 'text/html' }).end(harness);
  const file = path === '/view/' ? 'index.html' : path.startsWith('/view/') ? path.slice(6) : path.startsWith('/fixtures/') ? path.slice(1) : null;
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
const out = {};
let failures = 0;
const expect = (ok, label) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
  if (!ok) failures += 1;
};

async function inMonday(cfg, fn) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1400 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${base}/harness?cfg=${encodeURIComponent(JSON.stringify(cfg))}`);
  const frame = page.frame({ url: /\/view\/$/ });
  await frame.waitForFunction(() => !document.querySelector('#app .status') || document.querySelector('.rows'), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(300);
  await fn({ page, frame, errors });
  await ctx.close();
}

const titles = (frame) => frame.locator('#app .rows h3').allInnerTexts();

await inMonday({ theme: 'dark' }, async ({ page, frame, errors }) => {
  const rows = await titles(frame);
  expect(rows.length === 3, `lists all 3 automations (${rows.length})`);
  expect(rows[0] === 'When a lead is created, assign an owner', 'the one with a warning comes first');
  expect(rows.includes('When Status changes to Approved move item to group Ready'), 'the older automation is listed');
  expect((await frame.locator('.pill').allInnerTexts()).includes('Older'), 'the older one is marked Older');
  expect((await page.evaluate(() => window.apiVersions)).every((v) => v === '2026-10'), 'every automations query asks for API 2026-10');
  expect(await frame.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'follows the dark theme');
  expect((await page.evaluate(() => window.calls)).some((c) => c.method === 'execute' && c.type === 'valueCreatedForUser'), 'reports valueCreatedForUser');

  await frame.getByRole('button', { name: 'Switched off' }).click();
  expect(JSON.stringify(await titles(frame)) === JSON.stringify(['When a lead is created, assign an owner']), 'the Switched off filter');
  await frame.getByRole('button', { name: 'Older type' }).click();
  expect((await titles(frame)).length === 1, 'the Older type filter');
  await frame.getByRole('button', { name: 'All' }).click();
  await frame.locator('select.board').selectOption('Client Projects');
  expect((await titles(frame)).length === 2, 'the board filter');
  await frame.locator('select.board').selectOption('');
  await frame.locator('input.search').fill('lead owner');
  expect((await titles(frame)).length === 1, 'search needs every word');
  expect(await frame.evaluate(() => document.activeElement?.className) === 'search', 'the search box keeps focus while typing');
  expect(errors.length === 0, `no page errors ${errors.join(' ')}`);
});

await inMonday({ theme: 'black', failBoard: '2' }, async ({ frame }) => {
  expect((await titles(frame)).length === 2, 'an unreadable board leaves the rest listed');
  expect((await frame.locator('.warning').innerText()).includes('1 board could not be read'), 'and says one board could not be read');
  expect(await frame.evaluate(() => getComputedStyle(document.body).backgroundColor) === 'rgb(17, 17, 17)', 'follows the night theme');
});

await inMonday({ viewOnly: true, theme: 'light' }, async ({ page, frame }) => {
  expect((await frame.locator('#app').innerText()).includes('As a viewer'), 'viewers get a message');
  expect(!(await page.evaluate(() => window.calls)).some((c) => c.method === 'api'), 'and no API call is made for them');
});

{
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1400 } });
  const page = await ctx.newPage();
  const failed = [];
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
  await page.goto(`${base}/view/`);
  await page.waitForSelector('.rows');
  expect((await page.locator('#source-note').innerText()).startsWith('Demo data, invented'), 'opened on its own, it shows the invented demo account');
  expect((await page.locator('#app .rows h3').allInnerTexts()).length === 8, 'with all 8 demo automations');
  expect(failed.length === 0, `no failed requests ${failed.join(' ')}`);
  await page.screenshot({ path: process.env.SHOT || '/dev/null', fullPage: true }).catch(() => {});
  await ctx.close();
}

await browser.close();
server.close();
console.log(failures === 0 ? '\nThe board view works inside a fake monday and as the demo.' : `\n${failures} check(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
