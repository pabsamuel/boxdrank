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
 *   MONDAY_API_URL     optional, overrides the endpoint; must be a monday.com
 *                      host over https
 *   MONDAY_API_VERSION optional
 *   WATCHDOG_DRY_RUN   "1" prints the alert instead of sending it. Required
 *                      until a mail provider exists, and never safe to leave on
 *                      anywhere the output is public.
 *   WATCHDOG_ALLOW_INSECURE_ENDPOINT
 *                      "1" lifts the endpoint check. For a local stub only.
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
 * Prints the alert instead of sending it.
 *
 * This was the unconditional default, and the header above claimed it was
 * gated behind WATCHDOG_DRY_RUN. It was not — the variable appeared in that
 * comment and nowhere else. A security review caught it, and the consequence
 * was not theoretical: the scheduled workflow runs this with stdout going to a
 * GitHub Actions log, on a repository that is public. Every run would have
 * published the account's board names, its automation inventory and which
 * automations were currently dead — a map of someone's internal workflow and
 * its weak points, readable by anyone.
 *
 * The body is what a dry run is for, so it still prints in full. What changed
 * is that you now have to ask for it.
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
const dryRun = process.env.WATCHDOG_DRY_RUN === '1';

// No mail provider has been chosen yet, so printing is the only thing this can
// actually do. Failing here rather than quietly printing is the whole point:
// the caller has to decide that publishing the alert body to wherever stdout
// goes is acceptable.
if (!dryRun) {
  console.error('No mail provider is configured, so this check has no way to deliver an alert.');
  console.error('Set WATCHDOG_DRY_RUN=1 to print the alert instead — but not where the output is public:');
  console.error('it contains board names, the automations being watched and which ones have stopped.');
  process.exit(2);
}

console.error('WATCHDOG_DRY_RUN=1: the full alert, including board names, will be printed below.');

const monday = createHttpClient({
  token,
  endpoint: process.env.MONDAY_API_URL,
  apiVersion: process.env.MONDAY_API_VERSION,
  allowInsecureEndpoint: process.env.WATCHDOG_ALLOW_INSECURE_ENDPOINT === '1',
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
