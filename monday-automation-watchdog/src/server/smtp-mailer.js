/**
 * Sends the alert for real, over SMTP.
 *
 * Until now the runner could only print what it would have said, which meant
 * the product did not do its one job. This closes that.
 *
 * **Why SMTP rather than a provider's API.** Every transactional mail service
 * worth using speaks SMTP, so one adapter covers all of them and the choice of
 * provider becomes a connection string rather than a code change. It is also
 * the only option here that does not require reading a vendor's API reference,
 * and reading references is exactly what this environment cannot do. Writing a
 * provider's HTTP API from memory would repeat the mistake that put a wrong
 * timestamp parser in this repository for two days.
 *
 * **The second credential.** `SMTP_URL` carries a password. The first one the
 * runner held leaked into stderr and onto disk through a path a security review
 * had signed off as clean, so this one is redacted from anything it throws from
 * the start, and the redaction is shared code rather than a second copy.
 */

import { singleLine } from '../core/sanitize.js';
import { redact, secretsInUrl } from './redact.js';

/** Long enough for any subject this app generates; short enough for a header. */
const MAX_SUBJECT_LENGTH = 200;

/**
 * Rejects a connection string that would put the password on the wire in clear.
 *
 * The same check the monday endpoint needed, for the same reason and after the
 * same mistake: a credential going somewhere unencrypted because a URL was one
 * character different from the intended one. `smtps:` is implicit TLS;
 * `smtp:` is upgraded with STARTTLS and required to succeed, so a server that
 * cannot offer TLS fails rather than silently downgrading.
 */
function transportOptionsFor(url, allowInsecure) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('SMTP_URL is not a valid URL.');
  }

  if (parsed.protocol !== 'smtps:' && parsed.protocol !== 'smtp:') {
    throw new Error(`SMTP_URL must be smtps:// or smtp://, not ${parsed.protocol}//.`);
  }
  if (parsed.protocol === 'smtp:' && !allowInsecure) {
    // requireTLS makes STARTTLS mandatory rather than opportunistic.
    return { url, requireTLS: true, tls: { minVersion: 'TLSv1.2' } };
  }
  return { url, tls: { minVersion: 'TLSv1.2' } };
}

/**
 * A single address, with nothing in it that could forge a header.
 *
 * The recipient is operator configuration rather than account data, so this is
 * not the sharp edge — but a CR or LF in an address is header injection, and a
 * boundary that trusts its input because today's caller is trustworthy is how
 * the board-name forgery in the email body happened.
 */
function assertAddress(label, value) {
  const address = String(value ?? '').trim();
  if (address === '') throw new Error(`${label} is required.`);
  if (/[\r\n]/.test(address)) throw new Error(`${label} must not contain a line break.`);
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(address)) {
    throw new Error(`${label} does not look like a single email address.`);
  }
  return address;
}

/**
 * Builds the `mailer` interface `runCheck` already takes.
 *
 * @param {object} options
 * @param {string} options.url SMTP connection string, password included.
 * @param {string} options.from Envelope sender.
 * @param {boolean} [options.allowInsecure] Permits plain SMTP with no STARTTLS.
 *   For a local capture server in tests, never for a real provider.
 * @param {(opts: object) => {sendMail: Function}} [options.transportFactory]
 *   Injected so the tests never open a socket.
 * @returns {{send: (message: object) => Promise<void>}}
 */
export function createSmtpMailer({ url, from, allowInsecure = false, transportFactory }) {
  if (!url) throw new Error('SMTP_URL is required to send mail.');
  const sender = assertAddress('WATCHDOG_FROM', from);
  const options = transportOptionsFor(url, allowInsecure);

  // Every form the password can take in an error message, longest first.
  const secrets = secretsInUrl(url);

  let transport;
  const connect = async () => {
    if (transport) return transport;
    const factory = transportFactory ?? (await import('nodemailer')).default.createTransport;
    transport = factory(options);
    return transport;
  };

  return {
    /**
     * Whether the provider accepts these credentials, without sending mail.
     *
     * Exists because the credentials are write-only once stored: nobody can
     * read SMTP_URL back to check it, and a bad key would otherwise only show
     * itself on the first real alert — the worst moment to find out. Returns a
     * word, never the error text, which could quote the connection string.
     */
    async verify() {
      try {
        const mailer = await connect();
        if (typeof mailer.verify !== 'function') return 'unchecked';
        await mailer.verify();
        return 'verified';
      } catch {
        return 'failed';
      }
    },

    async send(message) {
      const to = assertAddress('WATCHDOG_RECIPIENT', message?.to);

      // The subject becomes a header. `alerts.js` builds it out of counts alone
      // today, so there is nothing untrusted in it — but this is the boundary
      // where that stops being true the moment someone puts a board name in a
      // subject line, and the check costs nothing.
      const subject = singleLine(message?.subject ?? '', MAX_SUBJECT_LENGTH) || 'monday automation watchdog';

      try {
        const mailer = await connect();
        await mailer.sendMail({
          from: sender,
          to,
          subject,
          text: message?.text ?? '',
          html: message?.html,
        });
      } catch (error) {
        // A mail library quotes the server's replies, and sometimes the whole
        // connection string, into its errors. Those errors are printed and
        // written to the run log, which is precisely how the monday token got
        // to disk. Re-thrown with the credential removed, in every form.
        throw new Error(`Sending the alert failed: ${redact(error?.message ?? String(error), secrets)}`);
      }
    },
  };
}
