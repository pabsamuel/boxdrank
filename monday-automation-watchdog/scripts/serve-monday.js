#!/usr/bin/env node
/**
 * The process monday code runs.
 *
 * Wires the real monday SDK into `createAppHandler`, which never imports it.
 * If any setting is missing it starts in setup mode instead, serving the board
 * view and reporting which settings are absent by name. It does not refuse to
 * start: the first deploy necessarily lacks WATCHDOG_BASE_URL, because the URL
 * it names is only created by that deploy's promotion to live.
 *
 * Configuration:
 *
 *   Secrets (Developer Center → monday code → secrets; read with SecretsManager)
 *     MONDAY_CLIENT_ID      Basic Information tab
 *     MONDAY_CLIENT_SECRET  Basic Information tab
 *     SMTP_URL              smtps://user:password@host:465
 *     WATCHDOG_FROM         the address alerts are sent from
 *     MONDAY_SIGNING_SECRET optional; Basic Information tab. Verifies the
 *                           Sidekick tool's requests. Without it only that
 *                           tool is off.
 *
 *   Environment (`mapps code:env -m set -k KEY -v VALUE`)
 *     WATCHDOG_BASE_URL     the app's public https URL on monday code
 *     WATCHDOG_BILLING      optional. `enforce` sends alerts only to accounts
 *                           with a plan (monday's monetization). Anything else,
 *                           or unset, sends to every installed account — right
 *                           until the app has pricing, wrong after approval.
 *     PORT                  set by monday code; its own sample app reads it.
 *                           Defaults to 8080 for a local run.
 *
 * Secrets go through SecretsManager rather than environment variables so that
 * none of them ever sits in a shell history, a workflow file or this repository.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { SecureStorage, SecretsManager, Logger } from '@mondaycom/apps-sdk';
import { createAppHandler, createSetupHandler } from '../src/server/app-server.js';
import { createHttpClient } from '../src/server/http-client.js';
import { createMondayStorage } from '../src/server/monday-storage.js';
import { createSmtpMailer } from '../src/server/smtp-mailer.js';
import { runCheck } from '../src/server/run-check.js';

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
  // Built by `npm run build`, which `npm start` runs first. Served by exact
  // path only: a fixed list, no directory listing, nothing to traverse.
  const dist = new URL('../dist/', import.meta.url);
  const html = await readFile(new URL('index.html', dist));
  const page = { type: 'text/html; charset=utf-8' };
  const png = { type: 'image/png' };
  return {
    '/view/': { ...page, body: html },
    '/view/index.html': { ...page, body: html },
    '/view/main.js': { type: 'text/javascript; charset=utf-8', body: await readFile(new URL('main.js', dist)) },
    // The how-to-use page monday's review asks for, embeddable in monday.
    '/view/how-to.html': { ...page, body: await readFile(new URL('how-to.html', dist)) },
    '/view/assets/board-view.png': { ...png, body: await readFile(new URL('assets/board-view.png', dist)) },
    '/view/assets/alert-email.png': { ...png, body: await readFile(new URL('assets/alert-email.png', dist)) },
  };
}

const logger = new Logger('automation-watchdog');
const staticFiles = await loadView();

/** A secret the app can run without: absent is not "missing". */
async function optionalSecret(name) {
  try {
    const value = await secrets.get(name);
    return typeof value === 'string' && value !== '' ? value : null;
  } catch {
    return null;
  }
}

const config = {
  clientId: await secret('MONDAY_CLIENT_ID'),
  clientSecret: await secret('MONDAY_CLIENT_SECRET'),
  smtpUrl: await secret('SMTP_URL'),
  from: await secret('WATCHDOG_FROM'),
  baseUrl: env('WATCHDOG_BASE_URL'),
  signingSecret: await optionalSecret('MONDAY_SIGNING_SECRET'),
};

let handler;
if (missing.length > 0) {
  // Names only. The first deploy is expected to land here: the Live URL that
  // WATCHDOG_BASE_URL needs does not exist until a version is promoted.
  logger.warn(`setup incomplete, missing: ${missing.join(', ')}`);
  handler = createSetupHandler(missing, staticFiles);
} else {
  const mailer = createSmtpMailer({ url: config.smtpUrl, from: config.from });
  // Checked once at boot, in the background, so a slow mail server cannot
  // delay startup. /health reports the result as one word.
  let mail = 'checking';
  mailer.verify().then((result) => {
    mail = result;
    logger.info(`mail provider: ${result}`);
  });

  handler = createAppHandler({
    config: {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      baseUrl: config.baseUrl,
      billing: process.env.WATCHDOG_BILLING === 'enforce' ? 'enforce' : 'off',
      signingSecret: config.signingSecret,
    },
    secureStorage: new SecureStorage(),
    makeClient: (token) => createHttpClient({ token }),
    makeStorage: (token) => createMondayStorage({ token }),
    mailer,
    runCheck,
    staticFiles,
    mailStatus: () => mail,
    log: (message) => logger.info(message),
  });
}

// monday code sets PORT; its own sample app reads process.env.PORT. 8080 is
// only for running this locally, and matches the port that sample tunnels.
const port = Number(process.env.PORT ?? 8080);
createServer(handler).listen(port, () => logger.info(`listening on ${port}`));
