import type { DriftNotification, NotificationSink } from './scheduler.js';

/**
 * Drift alerts by email.
 *
 * Why email: monday's own notification (`create_notification`) needs the
 * `notifications:write` scope, which v1 does not hold and cannot add while the
 * submitted version is locked for review (ADR-038). Email needs no monday
 * scope at all — the recipient's address comes from `me { email }`, which
 * `me:read` already covers — so Pro's one promise ("we tell you when a copy
 * drifts") is kept now, and the monday bell is added in v2.
 *
 * Ported from Automation Watchdog's SMTP mailer: one connection string covers
 * any provider (`smtps://` or `smtp://` with STARTTLS required), and the
 * password is scrubbed from anything that is thrown, because mail libraries
 * quote their connection string into errors.
 */

export interface Mailer {
  send(message: { to: string; subject: string; text: string }): Promise<void>;
  verify(): Promise<'verified' | 'failed' | 'unchecked'>;
}

const MAX_SUBJECT = 200;

export function assertAddress(label: string, value: unknown): string {
  const address = String(value ?? '').trim();
  if (address === '') throw new Error(`${label} is required.`);
  if (/[\r\n]/.test(address)) throw new Error(`${label} must not contain a line break.`);
  // Either "addr@host.tld" or "Name <addr@host.tld>".
  const bare = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
  const named = /^[^<>\r\n]{1,80} <[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+>$/;
  if (!bare.test(address) && !named.test(address)) {
    throw new Error(`${label} does not look like a single email address.`);
  }
  return address;
}

/** Every form the URL's password can take in an error message, longest first. */
export function secretsInUrl(url: string): string[] {
  try {
    const parsed = new URL(url);
    const raw = parsed.password;
    if (!raw) return [];
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      // keep raw
    }
    return [...new Set([url, raw, decoded])].filter(Boolean).sort((a, b) => b.length - a.length);
  } catch {
    return [url];
  }
}

export function redact(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets) out = out.split(secret).join('[redacted]');
  return out;
}

type TransportFactory = (options: Record<string, unknown>) => {
  sendMail(message: Record<string, unknown>): Promise<unknown>;
  verify?: () => Promise<unknown>;
};

export function createSmtpMailer(opts: { url: string; from: string; transportFactory?: TransportFactory }): Mailer {
  let parsed: URL;
  try {
    parsed = new URL(opts.url);
  } catch {
    throw new Error('SMTP_URL is not a valid URL.');
  }
  if (parsed.protocol !== 'smtps:' && parsed.protocol !== 'smtp:') {
    throw new Error(`SMTP_URL must be smtps:// or smtp://, not ${parsed.protocol}//.`);
  }
  const from = assertAddress('ALERT_FROM', opts.from);
  const options: Record<string, unknown> = {
    url: opts.url,
    tls: { minVersion: 'TLSv1.2' },
    // STARTTLS is mandatory on smtp://, so a server without TLS fails instead
    // of receiving the password in clear.
    ...(parsed.protocol === 'smtp:' ? { requireTLS: true } : {}),
  };
  const secrets = secretsInUrl(opts.url);

  let transport: ReturnType<TransportFactory> | undefined;
  const connect = async () => {
    if (transport) return transport;
    const factory: TransportFactory =
      opts.transportFactory ??
      ((await import('nodemailer')).default.createTransport as unknown as TransportFactory);
    transport = factory(options);
    return transport;
  };

  return {
    async verify() {
      try {
        const t = await connect();
        if (typeof t.verify !== 'function') return 'unchecked';
        await t.verify();
        return 'verified';
      } catch {
        return 'failed';
      }
    },
    async send(message) {
      const to = assertAddress('recipient', message.to);
      const subject = message.subject.replace(/[\r\n]+/g, ' ').slice(0, MAX_SUBJECT) || 'Template Guard alert';
      try {
        const t = await connect();
        await t.sendMail({ from, to, subject, text: message.text });
      } catch (err) {
        throw new Error(`Sending the alert email failed: ${redact(err instanceof Error ? err.message : String(err), secrets)}`);
      }
    },
  };
}

const SEVERITY_WORD: Record<DriftNotification['severity'], string> = {
  miswired: 'a miswired connect column',
  missing: 'missing configuration',
  altered: 'changed configuration',
  cosmetic: 'cosmetic changes',
};

/** Plain text only: board names are user data, and text cannot inject markup. */
export function renderAlertEmail(n: DriftNotification): { subject: string; text: string } {
  const board = (n.copyBoardName ?? '').replace(/[\r\n]+/g, ' ').trim() || `board ${n.copyBoardId}`;
  const subject = `Template Guard: “${board}” has ${SEVERITY_WORD[n.severity]}`;
  const lines = [
    n.message,
    '',
    n.boardUrl ? `Open the board: ${n.boardUrl}` : `Board id: ${n.copyBoardId}`,
    'Then open the Template Guard view on it and press Compare to see every difference and how to fix it.',
    '',
    'You get one email per drift: Template Guard writes again only if this board changes again, or drifts again after being fixed.',
    'To stop these emails, open the Template Guard view and turn off "Tell me when a linked board drifts from its template".',
    '',
    '— Template Guard, by Atesen Software',
  ];
  return { subject, text: lines.join('\n') };
}

export class EmailSink implements NotificationSink {
  constructor(
    private readonly mailer: Mailer,
    /** The address to alert for an account, or null when alerts are off or unknown. */
    private readonly recipientFor: (accountId: string) => Promise<string | null>,
  ) {}

  async deliver(n: DriftNotification): Promise<void> {
    const to = await this.recipientFor(n.accountId);
    if (!to) throw new Error(`No email recipient for account ${n.accountId}.`);
    const { subject, text } = renderAlertEmail(n);
    await this.mailer.send({ to, subject, text });
  }
}
