import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSmtpMailer } from '../src/server/smtp-mailer.js';
import { REDACTED } from '../src/server/redact.js';

const URL_WITH_PASSWORD = 'smtps://apikey:s3cret-mail-password@smtp.example.com:465';

/** Captures what would have been sent without opening a socket. */
function capture(onSend) {
  const sent = [];
  const factory = (options) => ({
    options,
    async sendMail(message) {
      sent.push(message);
      if (onSend) await onSend(message);
    },
  });
  return { sent, factory };
}

const build = (extra = {}, factory) =>
  createSmtpMailer({
    url: URL_WITH_PASSWORD,
    from: 'watchdog@example.com',
    transportFactory: factory,
    ...extra,
  });

test('a configured mailer sends the alert with both bodies', async () => {
  const { sent, factory } = capture();
  await build({}, factory).send({
    to: 'admin@example.com',
    subject: '1 monday automation has stopped',
    text: 'plain',
    html: '<p>rich</p>',
  });

  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0], {
    from: 'watchdog@example.com',
    to: 'admin@example.com',
    subject: '1 monday automation has stopped',
    text: 'plain',
    html: '<p>rich</p>',
  });
});

test('the SMTP password never appears in a send failure', async () => {
  // The monday token reached stderr and the run log because a library quoted
  // something back. A mail library quotes the server's replies, and sometimes
  // the connection string, into its errors -- and run-check writes the message
  // of a failed run to disk.
  const password = 's3cret-mail-password';
  const { factory } = capture(() => {
    throw new Error(`535 auth failed for ${URL_WITH_PASSWORD} (password ${password})`);
  });

  await assert.rejects(() => build({}, factory).send({ to: 'admin@example.com', text: 'x' }), (error) => {
    assert.ok(!error.message.includes(password), 'the password must not reach the message');
    assert.ok(!error.message.includes(URL_WITH_PASSWORD), 'the URL must not reach the message');
    assert.match(error.message, /Sending the alert failed/);
    assert.match(error.message, /535 auth failed/, 'the useful part of the error survives');
    assert.ok(error.message.includes(REDACTED));
    return true;
  });
});

test('TLS is required, not merely offered', () => {
  // smtps is implicit TLS. Plain smtp is upgraded and the upgrade is mandatory,
  // so a server that cannot do TLS fails instead of silently sending the
  // password in clear -- the same mistake the monday endpoint guard fixed.
  let options;
  const factory = (o) => {
    options = o;
    return { async sendMail() {} };
  };

  createSmtpMailer({ url: 'smtps://u:pppppppp@h:465', from: 'a@b.com', transportFactory: factory });
  build({}, factory);

  const plain = createSmtpMailer({ url: 'smtp://u:pppppppp@h:587', from: 'a@b.com', transportFactory: factory });
  return plain.send({ to: 'admin@example.com', text: 'x' }).then(() => {
    assert.equal(options.requireTLS, true, 'STARTTLS must be mandatory on plain smtp');
    assert.equal(options.tls.minVersion, 'TLSv1.2');
  });
});

test('a connection string that is not SMTP is refused before anything is sent', () => {
  const make = (url) => () => createSmtpMailer({ url, from: 'a@b.com', transportFactory: () => ({}) });
  assert.throws(make('https://smtp.example.com'), /must be smtps:\/\/ or smtp:\/\//);
  assert.throws(make('not a url'), /not a valid URL/);
  assert.throws(() => createSmtpMailer({ url: '', from: 'a@b.com' }), /SMTP_URL is required/);
});

test('an address that could forge a header is refused', () => {
  const { factory } = capture();

  // The sender is checked at construction, the recipient at send: both are
  // operator configuration, and both end up in a header.
  assert.throws(() => build({ from: 'watchdog@example.com\r\nBcc: attacker@evil.test' }, factory), /line break/);
  assert.throws(() => build({ from: '' }, factory), /required/);
  assert.throws(() => build({ from: 'not-an-address' }, factory), /single email address/);

  const mailer = build({}, factory);
  return Promise.all([
    assert.rejects(() => mailer.send({ to: 'admin@example.com\nBcc: attacker@evil.test' }), /line break/),
    assert.rejects(() => mailer.send({ to: 'two@a.com, three@b.com' }), /single email address/),
    assert.rejects(() => mailer.send({ to: '' }), /required/),
  ]);
});

test('a subject cannot carry a line break into a header', async () => {
  const { sent, factory } = capture();
  await build({}, factory).send({
    to: 'admin@example.com',
    subject: 'stopped\r\nBcc: attacker@evil.test',
    text: 'x',
  });

  assert.ok(!sent[0].subject.includes('\r'));
  assert.ok(!sent[0].subject.includes('\n'));
  assert.equal(sent[0].subject, 'stopped Bcc: attacker@evil.test');
});

test('an empty subject still produces a usable one', async () => {
  const { sent, factory } = capture();
  await build({}, factory).send({ to: 'admin@example.com', text: 'x' });
  assert.equal(sent[0].subject, 'monday automation watchdog');
});

test('the transport is built once and reused across sends', async () => {
  let built = 0;
  const factory = () => {
    built += 1;
    return { async sendMail() {} };
  };
  const mailer = build({}, factory);
  await mailer.send({ to: 'a@b.com', text: 'x' });
  await mailer.send({ to: 'a@b.com', text: 'y' });
  assert.equal(built, 1);
});

test('verify says whether the provider accepts the credentials, and never why', async () => {
  const ok = createSmtpMailer({ url: URL_WITH_PASSWORD, from: 'a@b.com', transportFactory: () => ({ async verify() { return true; } }) });
  assert.equal(await ok.verify(), 'verified');

  const bad = createSmtpMailer({
    url: URL_WITH_PASSWORD,
    from: 'a@b.com',
    transportFactory: () => ({ async verify() { throw new Error(`535 bad key in ${URL_WITH_PASSWORD}`); } }),
  });
  assert.equal(await bad.verify(), 'failed', 'a word, not the error that quotes the URL');
});
