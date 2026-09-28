#!/usr/bin/env node
/**
 * The process monday code runs (`npm start`, which builds the view first).
 *
 * Wires the real monday SDK into `createAppHandler`, which never imports it.
 * If a setting is missing it starts in setup mode instead, serving the board
 * view and reporting which settings are absent by name. It does not refuse to
 * start: the first deploy necessarily lacks APP_BASE_URL, because the Live URL
 * it names is only created by that deploy's promotion to live.
 *
 * Configuration:
 *
 *   Secret (Developer Center → monday code → Secrets; read with SecretsManager)
 *     MONDAY_SIGNING_SECRET  Genel ayarlar → Signing Secret. Verifies the
 *                            Sidekick tool's requests. Typed in by the owner,
 *                            never pasted anywhere else.
 *
 *   Environment (`mapps code:env -i <APP_ID> -m set -k KEY -v VALUE`)
 *     APP_BASE_URL           the Live URL, https://live1-service-….monday.app
 *     APP_BILLING            optional. `enforce` makes the Sidekick tool ask
 *                            for a plan (monday's monetization). Unset until
 *                            pricing is approved.
 *     PORT                   set by monday code; 8080 for a local run.
 *
 * Secrets are read once, at start-up: one added later is unseen until the next
 * deploy (Watchdog, 28 Sep 2026).
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { SecretsManager, Logger } from '@mondaycom/apps-sdk';
import { createAppHandler, createSetupHandler } from '../src/server/app-server.js';
import { createHttpClient } from '../src/server/http-client.js';

const logger = new Logger('automation-inventory');
const secrets = new SecretsManager();
const missing = [];

/** Reads a secret, or records its name as missing. The value is never printed. */
async function secret(name) {
  try {
    const value = await secrets.get(name);
    if (typeof value === 'string' && value !== '') return value;
  } catch {
    // Treated the same as absent: the name is what the operator needs.
  }
  missing.push(name);
  return null;
}

function env(name) {
  const value = process.env[name];
  if (value) return value;
  missing.push(name);
  return null;
}

async function loadView() {
  // Built by scripts/build.js. Served by exact path only: a fixed list, no
  // directory listing, nothing to traverse.
  const dist = new URL('../dist/', import.meta.url);
  const html = await readFile(new URL('index.html', dist));
  const page = { type: 'text/html; charset=utf-8' };
  return {
    '/view/': { ...page, body: html },
    '/view/index.html': { ...page, body: html },
    '/view/main.js': { type: 'text/javascript; charset=utf-8', body: await readFile(new URL('main.js', dist)) },
    // The how-to-use page monday's review asks for, embeddable in monday.
    '/view/how-to.html': { ...page, body: await readFile(new URL('how-to.html', dist)) },
    ...Object.fromEntries(
      await Promise.all(
        ['welcome.png', 'list.png', 'search.png'].map(async (name) => [
          `/view/assets/${name}`,
          { type: 'image/png', body: await readFile(new URL(`assets/${name}`, dist)) },
        ]),
      ),
    ),
    // The invented demo account, for the view opened outside monday. main.js
    // fetches `../../fixtures/…` from /view/main.js, which resolves here.
    '/fixtures/demo-automations.json': {
      type: 'application/json; charset=utf-8',
      body: await readFile(new URL('fixtures/demo-automations.json', dist)),
    },
  };
}

const staticFiles = await loadView();
const baseUrl = env('APP_BASE_URL');
const signingSecret = await secret('MONDAY_SIGNING_SECRET');

let handler;
if (missing.length > 0) {
  logger.warn(`setup incomplete, missing: ${missing.join(', ')}`);
  handler = createSetupHandler(missing, staticFiles);
} else {
  handler = createAppHandler({
    config: { baseUrl, signingSecret, billing: process.env.APP_BILLING === 'enforce' ? 'enforce' : 'off' },
    makeClient: (token) => createHttpClient({ token }),
    staticFiles,
    log: (message) => logger.info(message),
  });
}

const port = Number(process.env.PORT ?? 8080);
createServer(handler).listen(port, () => logger.info(`listening on ${port}`));
