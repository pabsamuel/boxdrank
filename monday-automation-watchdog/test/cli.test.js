import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
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

/**
 * The two opt-ins are set here and nowhere else.
 *
 * WATCHDOG_DRY_RUN, because printing the alert is now something the caller has
 * to ask for; WATCHDOG_ALLOW_INSECURE_ENDPOINT, because the stub is a plain
 * HTTP server on 127.0.0.1 and the client otherwise refuses to send a token
 * anywhere that is not monday.com over https. Neither is set by the workflow,
 * which is the point: the tests reach for the escape hatch, production cannot.
 */
const env = (url, dir, extra = {}) => ({
  ...process.env,
  MONDAY_API_TOKEN: 'test-token',
  WATCHDOG_RECIPIENT: 'admin@example.com',
  MONDAY_API_URL: url,
  WATCHDOG_STATE_DIR: dir,
  WATCHDOG_DRY_RUN: '1',
  WATCHDOG_ALLOW_INSECURE_ENDPOINT: '1',
  ...extra,
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

test('without the dry-run opt-in the check refuses to run at all', async () => {
  // The header documented WATCHDOG_DRY_RUN as a gate; the variable appeared in
  // that comment and nowhere else, so the alert body printed unconditionally.
  // The scheduled workflow runs this with stdout going to a public Actions log.
  await assert.rejects(
    () =>
      run('node', [script], {
        env: {
          ...process.env,
          MONDAY_API_TOKEN: 'test-token',
          WATCHDOG_RECIPIENT: 'admin@example.com',
          WATCHDOG_DRY_RUN: '',
        },
      }),
    (error) => {
      assert.equal(error.code, 2);
      assert.match(error.stderr, /No mail provider is configured/);
      assert.ok(!error.stdout.includes('email that would be sent'), 'nothing may be printed');
      return true;
    },
  );
});

test('the token is not sent to a local address without the explicit opt-in', () =>
  withStub(12 * HOUR, async (url, dir) =>
    assert.rejects(
      () => run('node', [script], { env: env(url, dir, { WATCHDOG_ALLOW_INSECURE_ENDPOINT: '' }) }),
      (error) => {
        assert.match(error.stderr, /Refusing to send the monday API token/);
        return true;
      },
    ),
  ));

/**
 * A monday that quotes the Authorization header back inside a 200.
 *
 * Not a hypothetical: GraphQL reports errors in a 200, and a proxy, a wrong
 * endpoint or a reflecting error page can all echo a request header. The
 * original code refused to echo the body of a *failed* response, which did not
 * cover this, and the token reached stderr and the run log on disk.
 */
function reflectingStub() {
  return createServer((req, res) => {
    req.on('data', () => {});
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ errors: [{ message: `Bad token: ${req.headers.authorization}` }] }));
    });
  });
}

test('a server that echoes the token back puts it in no output and on no disk', async () => {
  const server = reflectingStub();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const dir = await mkdtemp(join(tmpdir(), 'watchdog-reflect-'));
  const url = `http://127.0.0.1:${server.address().port}`;

  try {
    const token = 'test-token';
    // assert.rejects cannot await its validator, and the disk check has to be
    // awaited, so the error is caught by hand.
    const failure = await run('node', [script], { env: env(url, dir) }).then(
      (ok) => assert.fail(`the check should have failed, got: ${ok.stdout}`),
      (error) => error,
    );

    assert.ok(!failure.stdout.includes(token), 'stdout must not carry the token');
    assert.ok(!failure.stderr.includes(token), 'stderr must not carry the token');
    assert.match(failure.stderr, /Check failed/);

    // The run log is written on failure by design, so it is the channel that
    // put the credential at rest.
    const written = await readdir(dir);
    assert.ok(written.length > 0, 'the run log should exist, or this proves nothing');
    for (const name of written) {
      const contents = await readFile(join(dir, name), 'utf8');
      assert.ok(!contents.includes(token), `${name} must not carry the token`);
    }
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});
