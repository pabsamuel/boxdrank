/**
 * Checks a real monday API response against what the adapter assumes.
 *
 * Every assumption in src/app/monday-source.js was made without being able to
 * reach developer.monday.com. This turns one paste of real JSON into a verdict
 * on all of them at once, instead of discovering a wrong guess in production
 * where it would silently corrupt every interval the engine computes.
 *
 * Usage:
 *   1. Run the query printed by: node scripts/verify-api-shape.js --query
 *   2. Save the whole JSON response to a file
 *   3. node scripts/verify-api-shape.js response.json
 */

import { readFileSync } from 'node:fs';
import { parseActivityTimestamp } from '../src/app/monday-source.js';

const QUERY = `query {
  boards(limit: 5) {
    id
    name
    activity_logs(limit: 20) {
      id
      event
      entity
      user_id
      created_at
    }
  }
}`;

if (process.argv.includes('--query')) {
  console.log('Paste this into the monday API Playground and save the whole response:\n');
  console.log(QUERY);
  process.exit(0);
}

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/verify-api-shape.js <response.json>   (or --query)');
  process.exit(1);
}

const raw = JSON.parse(readFileSync(file, 'utf8'));
const boards = raw?.data?.boards ?? raw?.boards ?? [];
const logs = boards.flatMap((board) => board.activity_logs ?? []);

const check = (label, ok, detail = '') =>
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);

console.log(`\nboards: ${boards.length}   activity entries: ${logs.length}\n`);

if (boards.length === 0) {
  console.log('No boards in the response. Check the query ran as an admin or member.');
  process.exit(1);
}

check('boards return id and name', boards.every((b) => b.id !== undefined && 'name' in b));
check('board ids survive as strings', boards.every((b) => String(b.id).length > 0), `e.g. ${JSON.stringify(boards[0].id)}`);

if (logs.length === 0) {
  console.log('\nNo activity entries yet. Change something on a board — move an item, edit a');
  console.log('column — then run the query again. The timestamp format is the thing that');
  console.log('matters most and it cannot be checked without at least one entry.');
  process.exit(0);
}

const sample = logs[0];
console.log('first entry as returned:');
console.log(JSON.stringify(sample, null, 2), '\n');

check('entries carry an event name', logs.every((l) => typeof l.event === 'string'), `e.g. ${JSON.stringify(sample.event)}`);
check('entries carry an entity', logs.every((l) => 'entity' in l), `e.g. ${JSON.stringify(sample.entity)}`);
check('entries carry a user_id', logs.every((l) => 'user_id' in l), `e.g. ${JSON.stringify(sample.user_id)}`);

// The assumption that matters most. A misread timestamp does not throw; it
// scales every interval by a thousand and makes the engine confidently wrong.
const parsed = logs.map((l) => ({ raw: l.created_at, at: parseActivityTimestamp(l.created_at) }));
const unreadable = parsed.filter((p) => p.at === null);
check('every created_at is readable', unreadable.length === 0,
  unreadable.length ? `${unreadable.length} unreadable, e.g. ${JSON.stringify(unreadable[0].raw)}` : '');

const readable = parsed.filter((p) => p.at !== null);
if (readable.length > 0) {
  const dates = readable.map((p) => new Date(p.at));
  const oldest = new Date(Math.min(...readable.map((p) => p.at)));
  const newest = new Date(Math.max(...readable.map((p) => p.at)));
  const sane = dates.every((d) => d.getUTCFullYear() >= 2015 && d.getUTCFullYear() <= 2035);

  console.log(`\nraw created_at : ${JSON.stringify(sample.created_at)}`);
  console.log(`parsed to      : ${new Date(parsed[0].at).toISOString()}`);
  console.log(`range          : ${oldest.toISOString()} .. ${newest.toISOString()}`);
  check('parsed dates land in a plausible range', sane,
    sane ? '' : 'the unit guess is wrong — this is the one that would silently break everything');
}

// Whether automations are distinguishable decides how precise the labels can
// be. The app works either way, so this is information rather than a blocker.
const actors = [...new Set(logs.map((l) => String(l.user_id)))];
console.log(`\ndistinct user_id values: ${actors.join(', ')}`);
console.log('If an automation made any of these changes and its user_id differs from');
console.log('your own, automations are distinguishable and labels can name them exactly.');
