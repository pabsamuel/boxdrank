// Drives the BUILT board view in Chromium, twice:
//   1. inside an iframe whose parent is a fake monday answering the SDK's
//      postMessage protocol (monday-sdk-js/src/client.js: the view posts
//      {method, args, requestId} and resolves with the reply's `data`);
//   2. on its own, the way the listing's demo link opens it.
// Carried over from Automation Inventory's check of 28 Sep 2026.
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

// Samet (7) asked Ana three days ago: unanswered, his. Ana @mentioned Samet four
// days ago on an item whose URL is unsafe: unanswered, mentions him. Ben asked
// ten days ago: unanswered, everyone's. Ben's other question has Ana's reply.
// One update has no author. Samet's newest is one day old.
const harness = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">
<iframe id="f" src="/view/" style="width:900px;height:1400px;border:0"></iframe>
<script>
  window.calls = [];
  window.apiVersions = [];
  const cfg = JSON.parse(new URLSearchParams(location.search).get('cfg') || '{}');
  const DAY = 86400000;
  const ago = (d) => new Date(Date.now() - d * DAY).toISOString();
  const people = { 7: 'Samet', 8: 'Ana', 9: 'Ben' };
  const mention = (id) => '<a class="user_mention_editor router" href="https://acme.monday.com/users/' + id + '" data-mention-type="User" data-mention-id="' + id + '">@' + people[id] + '</a>';
  const board = (id, name) => ({ id: String(id), name });
  const item = (id, name, b, url) => ({ id: String(id), name, url: url || ('https://acme.monday.com/boards/' + b.id + '/pulses/' + id), board: b });
  const clients = board(1, 'Client Projects'), design = board(2, 'Design'), sales = board(3, 'Sales Pipeline');
  const u = (id, by, days, it, html, replies) => ({ id: String(id), created_at: ago(days), creator_id: by ? String(by) : null,
    creator: by ? { id: String(by), name: people[by] } : null, body: '<p>' + html + '</p>', text_body: html.replace(/<[^>]*>/g, ''),
    item: it, replies: (replies || []).map(([who, d], i) => ({ id: id + '-' + i, creator_id: String(who), created_at: ago(d) })) });
  const UPDATES = [
    u(1, 7, 3, item(100, 'Invoice March', clients), mention(8) + ' can you send the invoice?'),
    u(2, 8, 4, item(200, 'Logo', design, 'javascript:alert(1)'), mention(7) + ' is the logo final?'),
    u(3, 9, 10, item(300, 'Lead', sales), 'Who owns this lead?'),
    u(4, 9, 5, item(301, 'Renewal', sales), 'Did they renew?', [[8, 4]]),
    u(5, null, 2, item(302, 'Lead 2', sales), 'Status changed.'),
    u(6, 7, 1, item(101, 'Kickoff', clients), 'Agenda ready?'),
  ];
  // Answered filler, for paging: a reply from someone else on each.
  const filler = (page) => Array.from({ length: 100 }, (_, i) => u('f' + page + '-' + i, 9, 12 + page, item(900 + i, 'Filler', sales), 'Filler', [[8, 11]]));
  window.addEventListener('message', (e) => {
    const { method, args, requestId } = e.data || {};
    if (!requestId) return;
    window.calls.push({ method, type: args && args.type, params: args && args.params });
    const reply = (data) => e.source.postMessage({ requestId, data }, '*');
    if (method === 'get' && args.type === 'context') {
      return reply({ theme: cfg.theme, user: { id: cfg.noUser ? undefined : 7, isViewOnly: !!cfg.viewOnly } });
    }
    if (method === 'execute') return reply({});
    if (method === 'listen') return;
    if (method === 'api') {
      if (cfg.slow && !args.slowed) {
        return setTimeout(() => window.dispatchEvent(new MessageEvent('message', { source: e.source,
          data: { method, requestId, args: { ...args, slowed: true } } })), cfg.slow);
      }
      window.apiVersions.push(args.apiVersion || 'none');
      if (cfg.fail) return reply({ errors: [{ message: 'Not Authenticated' }] });
      const page = args.params.variables.page;
      if (cfg.endless) return reply({ data: { updates: page === 1 ? UPDATES.concat(filler(0)).slice(0, 100) : filler(page) } });
      if (cfg.pages) return reply({ data: { updates: page <= cfg.pages ? filler(page) : page === cfg.pages + 1 ? UPDATES : [] } });
      return reply({ data: { updates: page === 1 ? UPDATES : [] } });
    }
  });
</script></body></html>`;

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  if (path === '/harness') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(harness);
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
let failures = 0;
const expect = (ok, label) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
  if (!ok) failures += 1;
};

async function inMonday(cfg, fn, { welcomed = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1400 } });
  if (welcomed) await ctx.addInitScript(() => { try { localStorage.setItem('unanswered:welcomed:v1', '1'); } catch {} });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${base}/harness?cfg=${encodeURIComponent(JSON.stringify(cfg))}`);
  const frame = await (await page.waitForSelector('iframe')).contentFrame();
  await frame.waitForFunction(() => document.querySelector('.rows, .error, .notice-box, .welcome'), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(200);
  await fn({ page, frame, errors });
  await ctx.close();
}

const texts = (frame) => frame.locator('#app .rows .text').allInnerTexts();
const chip = (frame, name) => frame.getByRole('button', { name: new RegExp(`^${name} \\(`) });

await inMonday({ theme: 'dark' }, async ({ page, frame, errors }) => {
  expect(JSON.stringify(await texts(frame)) === JSON.stringify(['@Ana can you send the invoice?']), 'Mine is the default: my one update waiting 2 days or more');
  expect((await frame.locator('button.chip').allInnerTexts()).join('|') === 'Mine (1)|Mentioning me (1)|All (3)', 'the view buttons show their counts');
  expect((await frame.locator('.rows .who').allInnerTexts())[0] === 'You', 'my own update says You');
  expect((await frame.locator('.rows .meta').first().innerText()).includes('mentions Ana'), 'and whom it mentions');
  expect((await page.evaluate(() => window.apiVersions)).every((v) => v === '2026-10'), 'every updates query asks for API 2026-10');
  expect(await frame.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'follows the dark theme');
  expect((await page.evaluate(() => window.calls)).some((c) => c.method === 'execute' && c.type === 'valueCreatedForUser'), 'reports valueCreatedForUser');

  await frame.getByRole('button', { name: 'Reply ↗' }).first().click();
  await frame.getByRole('button', { name: 'Open item in a new tab ↗' }).first().click();
  await page.waitForTimeout(100);
  const executed = (await page.evaluate(() => window.calls)).filter((c) => c.method === 'execute');
  const card = executed.find((c) => c.type === 'openItemCard');
  expect(card && card.params?.itemId === 100 && card.params?.kind === 'updates', 'Reply opens the item card on its updates, with a numeric item id');
  const tab = executed.find((c) => c.type === 'openLinkInTab');
  expect(tab?.params?.url === 'https://acme.monday.com/boards/1/pulses/100', 'Open item asks monday to open the item URL in a new tab');

  await chip(frame, 'Mentioning me').click();
  expect(JSON.stringify(await texts(frame)) === JSON.stringify(['@Samet is the logo final?']), 'Mentioning me lists the update that @mentions me');
  expect((await frame.getByRole('button', { name: 'Open item in a new tab ↗' }).count()) === 0, 'an item with an unsafe URL gets no Open item link');
  expect((await frame.getByRole('button', { name: 'Reply ↗' }).count()) === 1, 'but still gets Reply, which uses the item id');

  await chip(frame, 'All').click();
  expect((await texts(frame)).length === 3, 'All lists everyone\'s, leaving out the answered one and the one with no author');
  expect((await frame.locator('#app > .meta').innerText()).startsWith('1 update with no person as author'), 'and says one was left out');
  await frame.locator('select.age').selectOption('1');
  expect((await texts(frame)).length === 4 && (await chip(frame, 'Mine').innerText()) === 'Mine (2)', 'the age filter brings in the 1-day-old one, and the counts follow');
  await frame.locator('select.age').selectOption('0');
  expect((await frame.locator('select.age option:checked').innerText()) === 'Any age' && (await texts(frame)).length === 4, 'Any age lists every unanswered one');
  await frame.locator('select.age').selectOption('7');
  expect(JSON.stringify(await texts(frame)) === JSON.stringify(['Who owns this lead?']), 'at 7 days only the 10-day-old one is left');
  await frame.locator('select.age').selectOption('2');
  await frame.locator('select.board').selectOption('Design');
  expect((await texts(frame)).length === 1, 'the board filter');
  await frame.locator('select.board').selectOption('');
  await frame.locator('select.author').selectOption('9');
  expect(JSON.stringify(await texts(frame)) === JSON.stringify(['Who owns this lead?']), 'the author filter');
  await frame.locator('select.author').selectOption('');
  await frame.locator('input.search').fill('INVOICE ana');
  expect((await texts(frame)).length === 1, 'search needs every word, any case');
  expect(await frame.evaluate(() => document.activeElement?.className) === 'search', 'the search box keeps focus while typing');
  await frame.locator('input.search').fill('');
  await chip(frame, 'Mine').click();
  expect(await frame.locator('select.author').isHidden(), 'Written by is hidden in Mine, where it is always me');
  expect(errors.length === 0, `no page errors ${errors.join(' ')}`);
});

await inMonday({ theme: 'black', fail: true }, async ({ frame }) => {
  const text = await frame.locator('#app').innerText();
  expect(text.includes('Could not read updates') && text.includes('Not Authenticated'), 'an API error is shown, not an empty list');
  expect(!(await frame.locator('#source-note').innerText()).includes('Demo'), 'and is not disguised as demo data');
  expect(await frame.evaluate(() => getComputedStyle(document.body).backgroundColor) === 'rgb(17, 17, 17)', 'follows the night theme');
});

await inMonday({ viewOnly: true, theme: 'light' }, async ({ page, frame }) => {
  expect((await frame.locator('#app').innerText()).includes('As a viewer'), 'viewers get a message');
  expect(!(await page.evaluate(() => window.calls)).some((c) => c.method === 'api'), 'and no API call is made for them');
});

await inMonday({ theme: 'light', noUser: true }, async ({ frame }) => {
  expect(await chip(frame, 'All').evaluate((node) => node.classList.contains('active')), 'with no user in the context, the view opens on All');
  expect((await texts(frame)).length === 3, 'and lists everyone\'s');
  await chip(frame, 'Mine').click();
  expect((await frame.locator('.rows .status').innerText()).includes('monday did not say who you are'), 'Mine says why it is empty');
});

await inMonday({ theme: 'light', pages: 2 }, async ({ frame }) => {
  expect((await texts(frame)).length === 1, 'updates on a third page are read too');
  expect((await frame.locator('#source-note').innerText()).includes('206 updates'), 'and the note counts every update read');
  expect((await frame.locator('.warning').count()) === 0, 'a read that ends on a short page has no warning');
});

await inMonday({ theme: 'light', endless: true }, async ({ page, frame }) => {
  expect((await page.evaluate(() => window.apiVersions.length)) === 30, 'an endless account stops at 30 pages');
  expect((await frame.locator('.warning').innerText()).startsWith('Only the newest 3000 updates were read, back to '), 'and says only the newest were read');
});

await inMonday({ theme: 'light' }, async ({ page, frame }) => {
  expect((await frame.locator('.welcome h2').innerText()) === 'Updates nobody answered, in one list', 'the first visit shows the welcome page');
  const sentEarly = (await page.evaluate(() => window.calls)).some((c) => c.type === 'valueCreatedForUser');
  expect(!sentEarly, 'and does not report value while the welcome covers the list');
  await frame.getByRole('button', { name: 'Show unanswered updates' }).click();
  await frame.waitForSelector('.rows');
  expect((await texts(frame)).length === 1, 'Show unanswered updates shows the list');
  expect(await frame.evaluate(() => localStorage.getItem('unanswered:welcomed:v1') !== null), 'and remembers it');
}, { welcomed: false });

await inMonday({ theme: 'light', slow: 1500, pages: 2 }, async ({ page, frame }) => {
  await frame.waitForSelector('.welcome');
  await frame.evaluate(() => { document.querySelector('.welcome').dataset.mark = 'first'; });
  await page.waitForFunction(() => window.apiVersions.length >= 1, null, { timeout: 10000 });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.apiVersions.length) < 3, 'the welcome page shows while updates are still being read');
  expect(await frame.evaluate(() => document.querySelector('.welcome')?.dataset.mark === 'first'), 'and stays put while a page is read behind it, so its button is not swapped mid-click');
  await frame.getByRole('button', { name: 'Show unanswered updates' }).click();
  expect(/^Read \d+ updates, back to \d{4}-\d\d-\d\d…$/.test(await frame.locator('#app .status').innerText()), 'dismissed mid-load, it shows how far reading has got');
  await frame.waitForSelector('.rows', { timeout: 15000 });
  expect((await texts(frame)).length === 1, 'and then the list');
}, { welcomed: false });

{
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1400 } });
  const page = await ctx.newPage();
  const failed = [];
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
  await page.goto(`${base}/view/`);
  await page.getByRole('button', { name: 'Show unanswered updates' }).click();
  await page.waitForSelector('.rows');
  expect((await page.locator('#source-note').innerText()).startsWith('Demo data, invented'), 'opened on its own, it shows the invented demo account');
  expect((await page.locator('button.chip').allInnerTexts()).join('|') === 'Mine (2)|Mentioning me (3)|All (6)', 'with its counts: 2 mine, 3 mentioning me, 6 in all');
  expect((await page.getByRole('button', { name: 'Reply ↗' }).count()) === 0, 'and no Reply buttons, since there is no monday to open');
  expect(failed.length === 0, `no failed requests ${failed.join(' ')}`);
  const howTo = await ctx.newPage();
  await howTo.goto(`${base}/view/how-to.html`);
  expect((await howTo.locator('h1').innerText()) === 'How to use Unanswered Updates', 'the How it works page opens');
  await howTo.waitForLoadState('load');
  const widths = await howTo.evaluate(() => [...document.images].map((img) => img.naturalWidth));
  expect(widths.length === 3 && widths.every((w) => w > 0), `with its 3 screenshots loaded (${widths.join(', ')})`);
  await howTo.close();
  await ctx.close();
}

await browser.close();
server.close();
console.log(failures === 0 ? '\nThe board view works inside a fake monday and as the demo.' : `\n${failures} check(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
