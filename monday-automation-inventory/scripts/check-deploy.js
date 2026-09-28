#!/usr/bin/env node
/**
 * Does what monday code will do, here, before `mapps code:push` does it there.
 * From Automation Watchdog, where each check below stood for a way a deploy
 * had failed or could fail on monday's side:
 *
 *   1. `.mondaycoderc` passes the CLI's own validation (monday-apps-cli,
 *      src/services/schemas/mondaycoderc-schema.ts); the CLI rejects the push
 *      outright otherwise.
 *   2. `npm start` builds before serving, because dist/ is not uploaded.
 *   3. The server boots with no configuration at all — the state of the first
 *      deploy, since the Live URL it needs is created by promoting that deploy
 *      — serves the board view and the demo data, and names what is missing.
 *
 * Run with `npm run check:deploy`. Exits non-zero if anything fails.
 */

import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';

const root = new URL('../', import.meta.url);
const read = async (path) => readFile(new URL(path, root), 'utf8');

let failures = 0;
function check(ok, label, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
  return ok;
}

// ---- 1: runtime --------------------------------------------------------------

const rc = JSON.parse(await read('.mondaycoderc'));
check(rc.RUNTIME === 'Node.js', '.mondaycoderc RUNTIME is "Node.js"', rc.RUNTIME);
check(/^(18|20|22)\.\d+\.\d+$/.test(rc.RUNTIME_VERSION ?? ''), '.mondaycoderc RUNTIME_VERSION passes the CLI schema', rc.RUNTIME_VERSION);
check(Object.keys(rc).every((key) => ['RUNTIME', 'RUNTIME_VERSION'].includes(key)), '.mondaycoderc has no keys the strict schema would reject');

// ---- 2: package --------------------------------------------------------------

const pkg = JSON.parse(await read('package.json'));
check(/scripts\/build\.js/.test(pkg.scripts?.start ?? '') && /serve-monday\.js/.test(pkg.scripts?.start ?? ''), 'npm start builds the view, then serves', pkg.scripts?.start);
for (const name of ['@mondaycom/apps-sdk', 'esbuild', 'monday-sdk-js']) {
  check(Boolean(pkg.dependencies?.[name]), `${name} is a runtime dependency, not a dev one`);
}
check(!pkg.devDependencies || Object.keys(pkg.devDependencies).length === 0, 'nothing the server needs is in devDependencies');

const ignore = await read('.mappsignore');
check(/^dist\/$/m.test(ignore), '.mappsignore excludes dist/, so a stale build is never uploaded');
check(!/^src\/?$/m.test(ignore) && !/^scripts\/?$/m.test(ignore) && !/^fixtures\/?$/m.test(ignore), '.mappsignore keeps src/, scripts/ and fixtures/');
check(/^scripts\/make-assets\.js$/m.test(ignore), '.mappsignore excludes scripts/make-assets.js, which the server never loads');

// ---- 3: boot -----------------------------------------------------------------

const freePort = () =>
  new Promise((resolve) => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

const port = await freePort();
const env = { ...process.env, PORT: String(port) };
// The state monday code starts in has none of these.
for (const name of ['APP_BASE_URL', 'MONDAY_SIGNING_SECRET', 'APP_BILLING']) delete env[name];

// The two commands `npm start` chains, run directly rather than through npm:
// killing npm leaves its child server running, and `npm` is not spawnable by
// that name on Windows.
const built = spawnSync(process.execPath, ['scripts/build.js'], { cwd: new URL('.', root), env, encoding: 'utf8' });
check(built.status === 0, 'the board view builds', built.status === 0 ? '' : (built.stderr || built.stdout).slice(-400));

const server = spawn(process.execPath, ['scripts/serve-monday.js'], { cwd: new URL('.', root), env, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
server.stdout.on('data', (chunk) => { output += chunk; });
server.stderr.on('data', (chunk) => { output += chunk; });

const base = `http://127.0.0.1:${port}`;
async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      return await fetch(`${base}/health`);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  return null;
}

try {
  const health = await waitForServer();
  if (check(Boolean(health), 'server boots with no configuration', health ? '' : output.slice(-400))) {
    const body = await health.json();
    check(health.status === 503 && body.error === 'setup incomplete', 'unconfigured server reports setup mode', JSON.stringify(body));
    check(['APP_BASE_URL', 'MONDAY_SIGNING_SECRET'].every((n) => body.missing?.includes(n)), 'setup mode names every missing setting');
    check(health.headers.get('strict-transport-security') === 'max-age=31536000; includeSubDomains', 'HSTS is set for a year, as monday review requires');

    const view = await fetch(`${base}/view/`);
    check(view.status === 200 && (await view.text()).includes('main.js'), 'board view is served in setup mode');
    const script = await fetch(`${base}/view/main.js`);
    check(script.status === 200 && (await script.text()).length > 1000, 'board view script is built and served');
    const howTo = await fetch(`${base}/view/how-to.html`);
    check(howTo.status === 200 && (await howTo.text()).includes('How to use Automation Inventory'), 'how-to-use page is served');
    for (const image of ['welcome.png', 'list.png', 'search.png']) {
      const response = await fetch(`${base}/view/assets/${image}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      // The PNG signature, so an HTML error page cannot pass for an image.
      check(response.status === 200 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47, `${image} is served`);
    }
    const demo = await fetch(`${base}/fixtures/demo-automations.json`);
    const demoBody = demo.status === 200 ? await demo.json().catch(() => null) : null;
    check(Array.isArray(demoBody?.boards) && Array.isArray(demoBody?.automations), 'demo data for the demo link is served');

    const sidekick = await fetch(`${base}/monday/sidekick/find`, { method: 'POST' });
    check(sidekick.status === 503, 'the Sidekick route refuses to run before setup');
  }
} finally {
  // Wait for the server to actually exit; process.exit() while its pipes were
  // closing crashed Node on Windows (Watchdog, 27 Sep).
  const exited = once(server, 'exit');
  server.kill();
  await exited;
}

console.log(failures === 0 ? '\nReady for `mapps code:push -s`.' : `\n${failures} check(s) failed. Fix before pushing.`);
process.exitCode = failures === 0 ? 0 : 1;
