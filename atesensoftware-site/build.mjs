#!/usr/bin/env node
/**
 * Builds atesensoftware.com's monday app pages into public/. Until 28 Sep 2026
 * Netlify served public/ as is. Since then the live site is on Cloudflare,
 * built from the separate repository pabsamuel/atesensoftware-site, and the
 * pages made here are copied into its src/static/<slug>/. Run after changing
 * any app's privacy policy, terms or price:
 *
 *   node atesensoftware-site/build.mjs
 *
 * The legal pages are generated from the Markdown next to each app's code, so
 * the page on the website and the document in the repository cannot drift.
 * The build fails if any `[FILL IN` is left, because a published placeholder
 * is worse than an unpublished page.
 */

import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const repo = fileURLToPath(new URL('..', import.meta.url));
const out = `${here}public/`;

/**
 * The owner's decisions. `entity` must be the same name given as the company /
 * entity on monday's submission form (`apps/docs/legal`). "Samet Ateşen",
 * confirmed by the owner on 27 Sep 2026; no company exists.
 */
const SITE = {
  brand: 'Atesen Software',
  entity: 'Samet Ateşen',
  supportEmail: 'support@atesensoftware.com',
  year: 2026,
};

const APPS = [
  {
    slug: 'automation-watchdog',
    name: 'Automation Watchdog',
    platform: 'monday.com',
    // Public: it is in every install link. monday asks for it in
    // monday-app-association.json (`apps/docs/privacy-and-security`).
    clientId: '9fcd68cae356c7fed3eacf09a0f9df81',
    // FACT (`apps/docs/oauth`): with no redirect_uri, monday uses the live
    // version's callback URL; force_install_if_needed installs the app first
    // if it is not installed. The Share tab's link, shared 28 Sep.
    installUrl: 'https://auth.monday.com/oauth2/authorize?client_id=9fcd68cae356c7fed3eacf09a0f9df81&response_type=install',
    howToUrl: 'https://live1-service-36993937-ca48573e.eu.monday.app/view/how-to.html',
    icon: `${repo}monday-automation-watchdog/listing/app-icon-192.png`,
    privacy: `${repo}monday-automation-watchdog/PRIVACY_POLICY.md`,
    terms: `${repo}monday-automation-watchdog/TERMS_OF_SERVICE.md`,
    summary: 'Email alerts when a monday automation quietly stops.',
    points: [
      'Learns how often each automation normally acts, across every board you can see',
      'Emails you when one that used to run regularly goes quiet, and when it recovers',
      'Read-only: it never changes a board, an item or an automation',
    ],
    // The price decided on 27 Sep (monday-automation-watchdog/LISTING.md).
    includes: "Every board you can see; daily email alerts when an automation stops, and when it recovers; the board view; mutes; answers in sidekick, monday's AI assistant",
  },
  {
    slug: 'automation-inventory',
    name: 'Automation Inventory',
    platform: 'monday.com',
    // Not created in the Developer Center yet (28 Sep 2026). Until it has a
    // client id it gets its legal and pricing pages only: no card on the home
    // page and no entry in monday-app-association.json.
    clientId: null,
    installUrl: null,
    howToUrl: null,
    icon: `${repo}monday-automation-inventory/listing/app-icon-192.png`,
    privacy: `${repo}monday-automation-inventory/PRIVACY_POLICY.md`,
    terms: `${repo}monday-automation-inventory/TERMS_OF_SERVICE.md`,
    summary: 'Every automation on every board, in one searchable list.',
    points: [
      'Lists every automation on the boards you can see, on or off, with monday\'s warnings first',
      'Search and filter it, and open any automation\'s board in one click',
      'Read-only, and stores nothing',
    ],
    // The price decided on 28 Sep (monday-automation-inventory/DECISIONS.md).
    includes: "Every automation on every board you can see, in one searchable list; filters; opening a board in one click; answers in sidekick, monday's AI assistant",
  },
];

/** Apps that exist in monday's Developer Center, with an install link. */
const LISTED = APPS.filter((app) => app.clientId);

// ---- Markdown, the subset the legal documents use --------------------------

const escapeHtml = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])_([^_]+)_(?=[\s.,;:)]|$)/g, '$1<em>$2</em>')
    .replace(/[\w.+-]+@atesensoftware\.com/g, (address) => `<a href="mailto:${address}">${address}</a>`);
}

/** Headings, paragraphs, bullet lists, tables. Blockquotes are editor notes and are dropped. */
function markdown(source) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let i = 0;
  const isTable = (line) => /^\|.*\|\s*$/.test(line);
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line)) { i += 1; continue; }
    if (/^>/.test(line)) { while (i < lines.length && /^>/.test(lines[i])) i += 1; continue; }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) { html.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`); i += 1; continue; }
    if (isTable(line)) {
      const rows = [];
      while (i < lines.length && isTable(lines[i])) { rows.push(lines[i]); i += 1; }
      const cells = (row) => row.trim().slice(1, -1).split('|').map((cell) => cell.trim());
      const [head, , ...body] = rows;
      html.push('<table><thead><tr>' + cells(head).map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
        body.map((row) => '<tr>' + cells(row).map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table>');
      continue;
    }
    if (/^- /.test(line)) {
      const items = [];
      while (i < lines.length && (/^- /.test(lines[i]) || /^\s{2,}\S/.test(lines[i]))) {
        if (/^- /.test(lines[i])) items.push(lines[i].slice(2));
        else items[items.length - 1] += ` ${lines[i].trim()}`;
        i += 1;
      }
      html.push('<ul>' + items.map((item) => `<li>${inline(item)}</li>`).join('') + '</ul>');
      continue;
    }
    const paragraph = [];
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#|>|- |\|)/.test(lines[i])) { paragraph.push(lines[i].trim()); i += 1; }
    html.push(`<p>${inline(paragraph.join(' '))}</p>`);
  }
  return html.join('\n');
}

// ---- pages -----------------------------------------------------------------

const STYLE = `
  :root { --bg:#fff; --surface:#f5f6fa; --border:#dcdfea; --text:#1c1f3b; --muted:#5e6178; --accent:#0f7a6e; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#14162b; --surface:#1d2040; --border:#32365a; --text:#eceef6; --muted:#a4a7bd; --accent:#3fcfbd; }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text);
    font:16px/1.6 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
  .wrap { max-width: 820px; margin: 0 auto; padding: 32px 20px 64px; }
  header.top { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:40px; }
  header.top a.brand { font-weight:800; font-size:18px; color:var(--text); text-decoration:none; }
  a { color: var(--accent); }
  h1 { font-size: 34px; line-height: 1.15; margin: 0 0 12px; letter-spacing: -0.5px; }
  h2 { font-size: 21px; margin: 34px 0 10px; }
  h3 { font-size: 17px; }
  .lead { color: var(--muted); font-size: 18px; margin: 0 0 32px; }
  .app { display:flex; gap:22px; padding:24px; border:1px solid var(--border); border-radius:14px; background:var(--surface); }
  .app img { width:88px; height:88px; border-radius:18px; flex:none; }
  .app h2 { margin: 0 0 4px; }
  .app .for { color: var(--muted); font-size: 14px; margin: 0 0 10px; }
  .app ul { margin: 0 0 16px; padding-left: 20px; }
  .actions { display:flex; flex-wrap:wrap; gap:10px 16px; align-items:center; }
  .button { display:inline-block; padding:10px 18px; border-radius:8px; background:var(--accent); color:#fff; font-weight:700; text-decoration:none; }
  table { width:100%; border-collapse:collapse; margin: 8px 0 18px; font-size: 15px; }
  th, td { text-align:left; vertical-align:top; padding:8px 10px; border-bottom:1px solid var(--border); }
  th { color: var(--muted); font-size: 13px; }
  code { font-size: 0.9em; background: var(--surface); padding: 1px 5px; border-radius: 4px; }
  footer { margin-top: 56px; padding-top: 18px; border-top: 1px solid var(--border); color: var(--muted); font-size: 14px; }
  @media (max-width: 560px) { .app { flex-direction: column; } h1 { font-size: 28px; } }
`;

function layout(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="icon" href="/assets/icon-192.png">
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
<header class="top"><a class="brand" href="/">${escapeHtml(SITE.brand)}</a><a href="mailto:${SITE.supportEmail}">${SITE.supportEmail}</a></header>
${body}
<footer>© ${SITE.year} ${escapeHtml(SITE.entity)} · ${escapeHtml(SITE.brand)} · <a href="mailto:${SITE.supportEmail}">${SITE.supportEmail}</a></footer>
</div>
</body>
</html>
`;
}

function home() {
  const cards = LISTED.map((app) => `
<section class="app">
  <img src="/assets/${app.slug}.png" alt="" width="88" height="88">
  <div>
    <h2>${escapeHtml(app.name)}</h2>
    <p class="for">for ${escapeHtml(app.platform)}</p>
    <p>${escapeHtml(app.summary)}</p>
    <ul>${app.points.map((point) => `<li>${escapeHtml(point)}</li>`).join('')}</ul>
    <div class="actions">
      <a class="button" href="${app.installUrl}">Install on ${escapeHtml(app.platform)}</a>
      <a href="${app.howToUrl}">How it works</a>
      <a href="/${app.slug}/privacy/">Privacy</a>
      <a href="/${app.slug}/terms/">Terms</a>
      <a href="/${app.slug}/pricing/">Pricing</a>
    </div>
  </div>
</section>`).join('\n');
  return layout(SITE.brand, `
<h1>Small, careful apps for the tools your team already uses.</h1>
<p class="lead">${escapeHtml(SITE.brand)} is ${escapeHtml(SITE.entity)}, an independent developer. Every app here does one job, asks for as little access as it can, and says plainly what it does with your data.</p>
${cards}
<h2>Support</h2>
<p>Write to <a href="mailto:${SITE.supportEmail}">${SITE.supportEmail}</a>. Questions about an app, your data, or billing all go to the same place.</p>`);
}

async function legalPage(app, file, label) {
  const source = (await readFile(file, 'utf8'))
    // Editor notes (blockquotes) are not published, so they are not checked.
    .split('\n')
    .filter((line) => !line.startsWith('>'))
    .join('\n')
    .replaceAll('[FILL IN: name or company]', `${SITE.entity} (${SITE.brand})`)
    .replaceAll('[FILL IN: support email]', SITE.supportEmail);
  if (source.includes('[FILL IN')) throw new Error(`${file} still has a [FILL IN] placeholder.`);
  return layout(`${app.name} — ${label}`, markdown(source));
}

await rm(out, { recursive: true, force: true });
await mkdir(`${out}assets`, { recursive: true });

await writeFile(`${out}index.html`, home());
for (const app of APPS) {
  await mkdir(`${out}${app.slug}/privacy`, { recursive: true });
  await mkdir(`${out}${app.slug}/terms`, { recursive: true });
  await writeFile(`${out}${app.slug}/privacy/index.html`, await legalPage(app, app.privacy, 'Privacy Policy'));
  await writeFile(`${out}${app.slug}/terms/index.html`, await legalPage(app, app.terms, 'Terms of Service'));
  await copyFile(app.icon, `${out}assets/${app.slug}.png`);
}
await copyFile(APPS[0].icon, `${out}assets/icon-192.png`);

// Each app's price, as decided in its own documents. monday bills it; this
// page only says what it is. Optimized mode: monday lowers the per-seat price
// for larger accounts itself.
for (const app of APPS) {
  await mkdir(`${out}${app.slug}/pricing`, { recursive: true });
  await writeFile(`${out}${app.slug}/pricing/index.html`, layout(`${app.name} — Pricing`, `
<h1>${escapeHtml(app.name)} — Pricing</h1>
<p class="lead">One plan, priced by the number of seats in your monday.com account, billed by monday.com.</p>
<table>
<thead><tr><th>Plan</th><th>Price</th><th>Includes</th></tr></thead>
<tbody>
<tr><td>14-day free trial</td><td>$0</td><td>Everything below, for 14 days</td></tr>
<tr><td>${escapeHtml(app.name)}</td><td>$1 per seat per month; larger accounts pay less per seat</td><td>${app.includes}</td></tr>
</tbody>
</table>
<p>Payment, currency, tax, renewals and refunds are handled by monday.com through its marketplace. Questions: <a href="mailto:${SITE.supportEmail}">${SITE.supportEmail}</a>.</p>`));
}

// FACT (`apps/docs/privacy-and-security`, read 27 Sep 2026): monday checks
// domain ownership with this file at https://<domain>/monday-app-association.json.
await writeFile(
  `${out}monday-app-association.json`,
  `${JSON.stringify({ apps: LISTED.map((app) => ({ clientID: app.clientId })) }, null, 2)}\n`,
);

// Netlify reads `_headers` from the publish directory (docs: manage/routing/
// headers). HSTS is set here because Netlify's docs do not say it is on by
// default, and monday's review requires it for every domain. No
// includeSubDomains: other subdomains (a helpdesk, say) may not serve HTTPS.
await writeFile(
  `${out}_headers`,
  `/*
  Strict-Transport-Security: max-age=31536000
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Content-Security-Policy: default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'

/monday-app-association.json
  Access-Control-Allow-Origin: *
  Content-Type: application/json; charset=utf-8
`,
);

console.log(`Built ${out}`);
