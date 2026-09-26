#!/usr/bin/env node
/**
 * Does what monday code will do, here, before `mapps code:push` does it there.
 *
 * A deploy that fails on monday's side costs a push, a wait and a log to dig
 * through. Every check below is something that would fail that way:
 *
 *   1. `.mondaycoderc` passes the CLI's own validation. The rule is copied from
 *      monday-apps-cli, src/services/schemas/mondaycoderc-schema.ts — the CLI
 *      rejects the push outright if it does not match.
 *   2. The pinned Node version is one nodemailer supports. nodemailer 10 targets
 *      Node 20 and later; monday also accepts 18, which would install cleanly
 *      and then fail at the first send.
 *   3. `npm start` exists and builds before serving, because dist/ is excluded
 *      from the upload.
 *   4. The server actually boots with no configuration at all — which is the
 *      state of the very first deploy, since the Live URL it needs is created
 *      by promoting that deploy — and serves the board view in that state.
 *
 * Run with `npm run check:deploy`. Exits non-zero on the first failure.
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

// ---- 1 and 2: runtime ------------------------------------------------------

const rc = JSON.parse(await read('.mondaycoderc'));
check(rc.RUNTIME === 'Node.js', '.mondaycoderc RUNTIME is "Node.js"', rc.RUNTIME);
check(/^(18|20|22)\.\d+\.\d+$/.test(rc.RUNTIME_VERSION ?? ''), '.mondaycoderc RUNTIME_VERSION passes the CLI schema', rc.RUNTIME_VERSION);
check(Number(String(rc.RUNTIME_VERSION).split('.')[0]) >= 20, 'pinned Node is 20 or later, as nodemailer 10 needs', rc.RUNTIME_VERSION);
check(Object.keys(rc).every((key) => ['RUNTIME', 'RUNTIME_VERSION'].includes(key)), '.mondaycoderc has no keys the strict schema would reject');

// ---- 3: package ------------------------------------------------------------

const pkg = JSON.parse(await read('package.json'));
check(/scripts\/build\.js/.test(pkg.scripts?.start ?? '') && /serve-monday\.js/.test(pkg.scripts?.start ?? ''), 'npm start builds the view, then serves', pkg.scripts?.start);
for (const name of ['@mondaycom/apps-sdk', 'nodemailer', 'esbuild', 'monday-sdk-js']) {
  check(Boolean(pkg.dependencies?.[name]), `${name} is a runtime dependency, not a dev one`);
}
check(!pkg.devDependencies || Object.keys(pkg.devDependencies).length === 0, 'nothing the server needs is in devDependencies');

const ignore = await read('.mappsignore');
check(/^dist\/$/m.test(ignore), '.mappsignore excludes dist/, so a stale build is never uploaded');
check(!/^src\/?$/m.test(ignore) && !/^scripts\/?$/m.test(ignore), '.mappsignore keeps src/ and scripts/');

// ---- 4: boot ---------------------------------------------------------------

const freePort = () =>
  new Promise((resolve) => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

const port = await freePort();
const env = { ...process.env, PORT: String(port) };
// Whatever this shell has set must not leak into the check: the point is the
// state monday code starts in, which has none of these.
for (const name of ['WATCHDOG_BASE_URL', 'MONDAY_CLIENT_ID', 'MONDAY_CLIENT_SECRET', 'SMTP_URL', 'WATCHDOG_FROM']) delete env[name];

// The two commands `npm start` chains, run directly rather than through npm:
// killing npm leaves its child server running, and `npm` is not spawnable by
// that name on Windows. Checked above that `npm start` is exactly these two.
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
    check(
      ['MONDAY_CLIENT_ID', 'MONDAY_CLIENT_SECRET', 'SMTP_URL', 'WATCHDOG_FROM', 'WATCHDOG_BASE_URL'].every((n) => body.missing?.includes(n)),
      'setup mode names every missing setting',
    );
    check(health.headers.get('strict-transport-security') === 'max-age=31536000; includeSubDomains', 'HSTS is set for a year, as monday review requires');

    const view = await fetch(`${base}/view/`);
    const html = await view.text();
    check(view.status === 200 && html.includes('main.js'), 'board view is served in setup mode');
    const script = await fetch(`${base}/view/main.js`);
    check(script.status === 200 && (await script.text()).length > 1000, 'board view script is built and served');

    const cron = await fetch(`${base}/mndy-cronjob/check`, { method: 'POST' });
    check(cron.status === 503, 'scheduled route refuses to run before setup');
  }
} finally {
  // Wait for the server to actually exit. Calling process.exit() while its
  // pipes were still closing crashed Node on Windows at shutdown
  // ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)", src/win/async.c)
  // after every check had already passed.
  const exited = once(server, 'exit');
  server.kill();
  await exited;
}

console.log(failures === 0 ? '\nReady for `mapps code:push -s`.' : `\n${failures} check(s) failed. Fix before pushing.`);
// exitCode, not process.exit(): let pending handles close on their own.
process.exitCode = failures === 0 ? 0 : 1;
