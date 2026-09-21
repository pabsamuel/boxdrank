#!/usr/bin/env node
/**
 * Runs one scheduled check from a command line.
 *
 * This exists so the product is not hostage to a question nobody could answer
 * yet: whether monday can run a job on a schedule. If it can, its scheduler and
 * storage replace two small files and nothing else changes. If it cannot, this
 * runs anywhere a cron does — including a GitHub Actions schedule, which costs
 * nothing and fits a $100 budget.
 *
 * Configuration is environment only, never arguments, so the token cannot end
 * up in a shell history or a process list.
 *
 *   MONDAY_API_TOKEN   required
 *   WATCHDOG_RECIPIENT required, where alerts go
 *   WATCHDOG_ACCOUNT   optional, defaults to "default"; namespaces stored state
 *   WATCHDOG_STATE_DIR optional, defaults to ./.watchdog-state
 *   MONDAY_API_URL     optional, overrides the endpoint
 *   MONDAY_API_VERSION optional
 *   WATCHDOG_DRY_RUN   optional, "1" prints the email instead of sending it
 */

import { createHttpClient } from '../src/server/http-client.js';
import { createFileStorage } from '../src/server/file-storage.js';
import { runCheck } from '../src/server/run-check.js';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}.`);
    console.error('See the header of scripts/run-check.js for the full list.');
    process.exit(2);
  }
  return value;
}

/**
 * Prints the email instead of sending it.
 *
 * The default rather than an afterthought: the first thing anyone should do
 * with a tool that emails an admin is watch what it would have said, without it
 * reaching anyone. Real sending needs a provider that has not been chosen yet,
 * and choosing one on a guess would be the same mistake as writing an API from
 * memory.
 */
const dryRunMailer = {
  async send(message) {
    console.log('--- email that would be sent ---');
    console.log(`To: ${message.to}`);
    console.log(`Subject: ${message.subject}`);
    console.log();
    console.log(message.text);
    console.log('--- end ---');
  },
};

const token = requireEnv('MONDAY_API_TOKEN');
const recipient = requireEnv('WATCHDOG_RECIPIENT');
const accountId = process.env.WATCHDOG_ACCOUNT || 'default';
const stateDir = process.env.WATCHDOG_STATE_DIR || '.watchdog-state';

const monday = createHttpClient({
  token,
  endpoint: process.env.MONDAY_API_URL,
  apiVersion: process.env.MONDAY_API_VERSION,
});

try {
  const result = await runCheck({
    monday,
    storage: createFileStorage(stateDir),
    mailer: dryRunMailer,
    accountId,
    recipient,
  });

  console.log(
    `watched ${result.watched} · stopped ${result.counts.silent} · overdue ${result.counts.late} · ` +
      `${result.sent ? `emailed: ${result.subject}` : 'nothing to send'}`,
  );
  if (result.unparsedTimestamps > 0) {
    console.log(`${result.unparsedTimestamps} activity entries had an unreadable timestamp and were ignored.`);
  }
} catch (error) {
  // The message may contain an API error verbatim; the token never appears in
  // one, and the client deliberately does not echo response bodies.
  console.error(`Check failed: ${error.message}`);
  process.exit(1);
}
