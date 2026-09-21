import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const script = new URL('../scripts/run-check.js', import.meta.url).pathname;
const HOUR = 3600_000;

/**
 * A stand-in monday API. Returns one board plus an automation signal whose last
 * firing is `lastFiredAgoMs` in the past, so the CLI can be driven end to end.
 */
function stubMonday(lastFiredAgoMs) {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const { query } = JSON.parse(body);
      let data;

      if (query.includes('users')) {
        data = { users: [{ id: 117040353, name: 'Samet' }] };
      } else if (query.includes('activity_logs')) {
        const now = Date.now();
        data = {
          boards: [
            {
              activity_logs: Array.from({ length: 30 }, (_, i) => ({
                id: String(i),
                event: 'move_pulse_from_group',
                entity: 'pulse',
                user_id: '-4',
                created_at: String((now - lastFiredAgoMs - i * HOUR) * 10_000),
              })),
            },
          ],
        };
      } else {
        data = { boards: [{ id: 5104569213, name: 'Client Projects' }] };
      }

      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data }));
    });
  });
  return server;
}

const withStub = async (lastFiredAgoMs, fn) => {
  const server = stubMonday(lastFiredAgoMs);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const dir = await mkdtemp(join(tmpdir(), 'watchdog-cli-'));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`, dir);
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
};

const env = (url, dir) => ({
  ...process.env,
  MONDAY_API_TOKEN: 'test-token',
  WATCHDOG_RECIPIENT: 'admin@example.com',
  MONDAY_API_URL: url,
  WATCHDOG_STATE_DIR: dir,
});

test('the CLI detects a stopped automation and prints the email it would send', () =>
  withStub(12 * HOUR, async (url, dir) => {
    const { stdout } = await run('node', [script], { env: env(url, dir) });

    assert.match(stdout, /email that would be sent/);
    assert.match(stdout, /Subject: 1 monday automation has stopped/);
    assert.match(stdout, /An automation moves an item between groups on Client Projects/);
    assert.match(stdout, /stopped 1/);
  }));

test('a healthy account sends nothing', () =>
  withStub(10 * 60_000, async (url, dir) => {
    const { stdout } = await run('node', [script], { env: env(url, dir) });
    assert.match(stdout, /nothing to send/);
    assert.ok(!stdout.includes('email that would be sent'));
  }));

test('state persists between runs, so the same alert is not repeated', () =>
  withStub(12 * HOUR, async (url, dir) => {
    const first = await run('node', [script], { env: env(url, dir) });
    assert.match(first.stdout, /email that would be sent/);

    const second = await run('node', [script], { env: env(url, dir) });
    assert.match(second.stdout, /nothing to send/, 'the second run is suppressed by stored state');
  }));

test('the human user is not reported as a broken automation', () =>
  withStub(12 * HOUR, async (url, dir) => {
    const { stdout } = await run('node', [script], { env: env(url, dir) });
    assert.ok(!stdout.includes('Samet'), 'people are excluded once the account users are known');
  }));

test('missing configuration exits with a usage error rather than running', async () => {
  await assert.rejects(
    () => run('node', [script], { env: { ...process.env, MONDAY_API_TOKEN: '', WATCHDOG_RECIPIENT: '' } }),
    (error) => {
      assert.equal(error.code, 2);
      assert.match(error.stderr, /Missing MONDAY_API_TOKEN/);
      return true;
    },
  );
});
