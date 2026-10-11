#!/usr/bin/env node
/**
 * Records the demo video: the real Template Guard board view (the production
 * client bundle, dist/client) inside a monday-like frame, answering from data
 * computed by the real diff engine (scripts/make-demo-data.ts). The frame plays
 * monday's part of the SDK handshake (sessionToken, context); /api calls are
 * answered from that data. No monday account or customer data involved.
 *
 *   npm run build
 *   npx tsx scripts/make-demo-data.ts <dir>/demo.json
 *   NODE_PATH="$(npm root -g)" FFMPEG=<ffmpeg> node scripts/make-demo-video.mjs <dir>
 */
import { createServer } from 'node:http';
import { readFile, mkdir, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const work = process.argv[2];
const data = JSON.parse(await readFile(path.join(work, 'demo.json'), 'utf8'));
const W = 1280;
const H = 720;

const shell = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { font-family: 'Inter','Liberation Sans',Arial,sans-serif; background: #f6f7fb; height: 100vh; display: flex; flex-direction: column; }
  .top { height: 44px; background: #fff; border-bottom: 1px solid #e6e9ef; display: flex; align-items: center; padding: 0 20px; font-weight: 700; color: #323338; gap: 10px; }
  .dot { width: 22px; height: 22px; border-radius: 6px; background: linear-gradient(135deg,#ff3d57,#ffcb00,#00d647); }
  .head { background: #fff; padding: 14px 28px 0; }
  .head h1 { font-size: 24px; color: #323338; margin-bottom: 10px; }
  .tabs { display: flex; gap: 26px; font-size: 14px; color: #676879; }
  .tabs span { padding-bottom: 8px; } .tabs .on { color: #323338; border-bottom: 2px solid #0073ea; }
  iframe { flex: 1; border: 0; width: 100%; background: #fff; }
  .cap { position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%); background: rgba(28,31,59,.92); color: #fff;
    padding: 12px 22px; border-radius: 10px; font-size: 20px; font-weight: 600; opacity: 0; transition: opacity .4s; max-width: 1100px; text-align: center; }
  .card { position: fixed; inset: 0; background: linear-gradient(135deg,#1c1f3b,#26305e); color: #fff; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 18px; opacity: 0; transition: opacity .5s; pointer-events: none; text-align: center; padding: 60px; }
  .card h2 { font-size: 52px; } .card p { font-size: 24px; color: #c9cce0; max-width: 900px; line-height: 1.4; }
  .card img { max-width: 1000px; border-radius: 12px; }
</style></head><body>
  <div class="top"><div class="dot"></div>Work management</div>
  <div class="head"><h1>${data.copyName}</h1>
    <div class="tabs"><span>Main Table</span><span>Timeline</span><span class="on">Template Guard</span></div></div>
  <iframe id="app" src="/index.html"></iframe>
  <div class="cap" id="cap"></div>
  <div class="card" id="card"></div>
<script>
  const COPY = ${JSON.stringify(data.copyBoardId)};
  window.addEventListener('message', (e) => {
    const m = e.data || {};
    if (!m.requestId) return;
    const type = m.args && m.args.type;
    const reply = type === 'sessionToken' ? { data: 'demo-session' }
      : type === 'context' ? { data: { boardId: COPY, theme: 'light' } }
      : { data: {} };
    e.source.postMessage({ method: m.method, type, requestId: m.requestId, ...reply }, '*');
  });
  window.caption = (t) => { const c = document.getElementById('cap'); c.textContent = t; c.style.opacity = t ? 1 : 0; };
  window.card = (html) => { const c = document.getElementById('card'); if (html) c.innerHTML = html; c.style.opacity = html ? 1 : 0; };
</script></body></html>`;

const dist = path.join(root, 'dist/client');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/shell.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(shell);
  }
  if (url.pathname === '/sidekick.png') {
    res.writeHead(200, { 'Content-Type': 'image/png' });
    return res.end(await readFile(path.join(root, 'listing/gallery-2-sidekick.png')));
  }
  try {
    const body = await readFile(path.join(dist, url.pathname === '/' ? 'index.html' : url.pathname));
    res.writeHead(200, { 'Content-Type': types[path.extname(url.pathname)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(8411, r));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: work, size: { width: W, height: H } } });
const json = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
await ctx.route('**/api/boards', (r) => json(r, { boards: data.boards, warnings: [] }));
await ctx.route('**/api/templates', (r) => json(r, { templates: data.templates, plan: data.plan }));
await ctx.route('**/api/notifications', (r) =>
  json(r, { settings: { accountId: 'demo', mondayUserId: null, webhookUrl: null, enabled: true }, effectiveMondayUserId: '1', deliverable: true }),
);
await ctx.route('**/api/compare', async (r) => {
  await sleep(1400);
  return json(r, data.compare);
});

const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto('http://127.0.0.1:8411/shell.html');
await page.evaluate(() =>
  window.card('<h2>Template Guard</h2><p>monday drops configuration when you duplicate a board, and does not tell you. Template Guard finds what it dropped.</p>'),
);
await sleep(4000);
await page.evaluate(() => window.card(''));
const app = page.frameLocator('#app');
await app.getByRole('button', { name: 'Compare' }).waitFor({ timeout: 15000 });
await page.evaluate(() => window.caption('The template was saved once. This board is a copy made from it.'));
await sleep(3500);
await page.evaluate(() => window.caption('One click compares the copy with its template.'));
await sleep(1500);
await app.getByRole('button', { name: 'Compare' }).click();
await sleep(2600);
await page.evaluate(() => window.caption('Every difference, most serious first. “Miswired” = still wired to the template’s board.'));
await sleep(5000);
const frame = page.frames().find((f) => f.url().includes('/index.html'));
for (let y = 0; y <= 900; y += 150) {
  await frame.evaluate((v) => window.scrollTo({ top: v, behavior: 'smooth' }), y);
  await sleep(700);
}
await page.evaluate(() => window.caption('Each finding says why it matters and how to fix it.'));
await sleep(4000);
for (let y = 900; y <= 2400; y += 150) {
  await frame.evaluate((v) => window.scrollTo({ top: v, behavior: 'smooth' }), y);
  await sleep(600);
}
await page.evaluate(() => window.caption('A checklist with links to the right board. Template Guard never changes your boards.'));
await sleep(5000);
await page.evaluate(() => {
  window.caption('');
  window.card('<h2>Or just ask sidekick</h2><img src="/sidekick.png"><div style="font-size:14px;color:#a4a7bd">Illustration of a sidekick conversation</div><p>Template Guard adds a Sidekick tool and an automation action: “Compare [board] with its template”.</p>');
});
await sleep(6500);
await page.evaluate(() =>
  window.card('<h2>Template Guard</h2><p>Mark a template. Compare any copy. Fix what matters.<br>Read-only · runs on monday code · no item data stored.</p>'),
);
await sleep(4000);
await ctx.close();
await browser.close();
server.close();

const webm = (await readdir(work)).find((f) => f.endsWith('.webm'));
const out = path.join(root, 'listing/template-guard-demo.mp4');
await mkdir(path.dirname(out), { recursive: true });
execFileSync(
  process.env.FFMPEG ?? 'ffmpeg',
  ['-y', '-i', path.join(work, webm), '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-shortest', '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '20', '-c:a', 'aac', '-movflags', '+faststart', out],
  { stdio: 'ignore' },
);
console.log('wrote', out);
