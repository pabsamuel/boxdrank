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
 *   SMTP_URL           smtps://user:password@host:465 — any provider that
 *                      speaks SMTP. Required to actually send.
 *   WATCHDOG_FROM      envelope sender; required alongside SMTP_URL
 *   WATCHDOG_DRY_RUN   "1" prints the alert instead of sending it, and wins
 *                      over SMTP_URL so a dry run can never send by accident.
 *                      Never safe to leave on anywhere the output is public.
 *   WATCHDOG_ALLOW_INSECURE_ENDPOINT
 *                      "1" lifts the endpoint check. For a local stub only.
 */

import { createHttpClient } from '../src/server/http-client.js';
import { createSmtpMailer } from '../src/server/smtp-mailer.js';
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
const smtpUrl = process.env.SMTP_URL;

/**
 * Print, or send, or refuse — never quietly print because sending was not set up.
 *
 * The dry run deliberately wins over a configured SMTP_URL. The failure worth
 * avoiding is a run that was meant to show you the alert and mailed it to a
 * customer instead; the opposite failure costs one environment variable.
 */
let mailer;
if (dryRun) {
  console.error('WATCHDOG_DRY_RUN=1: printing the alert instead of sending it.');
  console.error('It contains board names and which automations have stopped. Not for a public log.');
  mailer = dryRunMailer;
} else if (smtpUrl) {
  try {
    mailer = createSmtpMailer({
      url: smtpUrl,
      from: process.env.WATCHDOG_FROM,
      allowInsecure: process.env.WATCHDOG_ALLOW_INSECURE_SMTP === '1',
    });
  } catch (error) {
    // Constructed before any check runs, so a misconfigured provider is found
    // now rather than after sixty seconds of API calls.
    console.error(`Mail is misconfigured: ${error.message}`);
    process.exit(2);
  }
} else {
  console.error('Nothing is configured to deliver the alert.');
  console.error('Set SMTP_URL and WATCHDOG_FROM to send it, or WATCHDOG_DRY_RUN=1 to print it —');
  console.error('but not where the output is public: it names boards and which automations stopped.');
  process.exit(2);
}

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
    mailer,
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
