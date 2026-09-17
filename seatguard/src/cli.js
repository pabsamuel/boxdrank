#!/usr/bin/env node
/**
 * seatguard — run an audit against a snapshot file.
 *
 *   node src/cli.js fixtures/demo-account.json
 *   node src/cli.js fixtures/demo-account.json --html report.html
 *   node src/cli.js fixtures/demo-account.json --json
 *
 * Takes a file rather than an API token on purpose: the whole engine is usable
 * and demonstrable before any monday credentials exist.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { audit } from './audit.js';
import { renderConsole, renderHtml } from './report.js';

function parseArgs(argv) {
  const args = { snapshot: null, html: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--html') args.html = argv[++i] ?? 'seatguard-report.html';
    else if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (!a.startsWith('-')) args.snapshot = a;
  }
  return args;
}

const USAGE = `
seatguard — monday.com seat and permission auditor

  node src/cli.js <snapshot.json> [--html <file>] [--json]

  <snapshot.json>   account snapshot (see fixtures/demo-account.json)
  --html <file>     also write an HTML report
  --json            print the raw report as JSON instead of text
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.snapshot) {
    console.log(USAGE);
    process.exit(args.help ? 0 : 1);
  }

  let snapshot;
  try {
    snapshot = JSON.parse(await readFile(args.snapshot, 'utf8'));
  } catch (err) {
    console.error(`Could not read ${args.snapshot}: ${err.message}`);
    process.exit(1);
  }

  let report;
  try {
    report = audit(snapshot);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderConsole(report));
  }

  if (args.html) {
    await writeFile(args.html, renderHtml(report), 'utf8');
    console.log(`HTML report written to ${args.html}`);
  }
}

main();
