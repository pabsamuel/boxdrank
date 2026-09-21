import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = new URL('../scripts/verify-api-shape.js', import.meta.url).pathname;

const run = (payload) => {
  const file = join(tmpdir(), `watchdog-verify-${Date.now()}-${Math.random()}.json`);
  writeFileSync(file, JSON.stringify(payload));
  try {
    return execFileSync('node', [script, file], { encoding: 'utf8' });
  } finally {
    rmSync(file, { force: true });
  }
};

test('a well-formed response passes every check', () => {
  const out = run({
    data: {
      boards: [
        {
          id: 123,
          name: 'Client Projects',
          activity_logs: [
            { id: '1', event: 'change_column_value', entity: 'pulse', user_id: 9001, created_at: '1790000000000000' },
            { id: '2', event: 'create_pulse', entity: 'pulse', user_id: 4200, created_at: '1790000100000000' },
          ],
        },
      ],
    },
  });
  assert.ok(!out.includes('FAIL'), out);
  assert.match(out, /distinct user_id values: 9001, 4200/);
});

test('an unreadable timestamp is reported rather than passed over', () => {
  // The assumption that matters most: a misread timestamp does not throw, it
  // scales every interval by a thousand and makes the engine confidently wrong.
  const out = run({
    data: { boards: [{ id: 1, name: 'B', activity_logs: [{ id: '1', event: 'x', entity: 'pulse', user_id: 1, created_at: 'nonsense' }] }] },
  });
  assert.match(out, /FAIL {2}every created_at is readable/);
});

test('an account with no activity yet says what to do about it', () => {
  const out = run({ data: { boards: [{ id: 1, name: 'B', activity_logs: [] }] } });
  assert.match(out, /No activity entries yet/);
  assert.match(out, /Change something on a board/);
});

test('--query prints something runnable', () => {
  const out = execFileSync('node', [script, '--query'], { encoding: 'utf8' });
  assert.match(out, /activity_logs/);
  assert.match(out, /created_at/);
});

test('the captured real response passes every check', () => {
  // Pinned against real data rather than a guess. If an assumption in the
  // adapter drifts, this fails rather than being discovered in production
  // where a misread timestamp would silently corrupt every interval.
  const real = JSON.parse(
    readFileSync(new URL('../fixtures/real-api-response.json', import.meta.url), 'utf8'),
  );
  const out = run(real);
  assert.ok(!out.includes('FAIL'), out);
  assert.match(out, /2026-09-21T02:09:22\.564Z/);
});
