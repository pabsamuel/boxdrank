import nodemailer from 'nodemailer';
import type { AppEnv } from '@global-emotes/config';

/**
 * Transactional email: template registry + sender abstraction.
 * Local dev: SMTP → Mailpit. Production: swap EMAIL_PROVIDER (OWNER_ACTIONS).
 * Templates never include tracking pixels or message contents.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

export interface SmtpTransportOptions {
  host: string;
  port: number;
  secure: boolean;
  auth?: { user: string; pass: string };
}

/**
 * Transport options for the configured relay. Pure and exported so the auth
 * wiring is testable without standing up a mail server: every hosted provider
 * requires credentials, and omitting them fails silently at send time — which
 * means nobody can sign in.
 */
export function smtpTransportOptions(env: AppEnv): SmtpTransportOptions {
  const options: SmtpTransportOptions = {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    // Port 465 is implicit TLS; 587 and 25 open plaintext and upgrade via
    // STARTTLS. An explicit SMTP_SECURE overrides the inference.
    secure: env.SMTP_SECURE ?? env.SMTP_PORT === 465,
  };
  if (env.SMTP_USER) {
    options.auth = { user: env.SMTP_USER, pass: env.SMTP_PASS };
  }
  return options;
}

export function createEmailSender(env: AppEnv): EmailSender {
  if (env.EMAIL_PROVIDER === 'console' || env.NODE_ENV === 'test') {
    return {
      async send(message) {
        // Never log bodies (magic links are credentials); subject + recipient only.
        console.log(`[email] to=${message.to} subject="${message.subject}"`);
      },
    };
  }
  const transport = nodemailer.createTransport(smtpTransportOptions(env));
  return {
    async send(message) {
      await transport.sendMail({ from: env.EMAIL_FROM, ...message });
    },
  };
}

// ── Templates ────────────────────────────────────────────────────────────────

function layout(brand: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a2e">
<h2 style="margin:0 0 16px">${brand}</h2>
${bodyHtml}
<p style="margin-top:32px;font-size:12px;color:#888">You received this because you have a ${brand} account.</p>
</body></html>`;
}

export function magicLinkEmail(brand: string, to: string, link: string): EmailMessage {
  return {
    to,
    subject: `Sign in to ${brand}`,
    text: `Sign in to ${brand}: ${link}\n\nThis link expires in 15 minutes and can be used once. If you didn't request it, ignore this email.`,
    html: layout(
      brand,
      `<p>Click to sign in. The link expires in <strong>15 minutes</strong> and works once.</p>
<p><a href="${link}" style="display:inline-block;background:#5b5bd6;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Sign in</a></p>
<p style="font-size:13px;color:#666">If you didn't request this, you can safely ignore it.</p>`,
    ),
  };
}

export function entitlementExpiringEmail(
  brand: string,
  to: string,
  packName: string,
  creatorName: string,
  graceEndsAt: Date,
): EmailMessage {
  const when = graceEndsAt.toUTCString();
  return {
    to,
    subject: `Your access to ${packName} is ending`,
    text: `Your membership backing "${packName}" by ${creatorName} has ended. The pack stays unlocked until ${when}. Renew your membership to keep access.`,
    html: layout(
      brand,
      `<p>Your membership backing <strong>${escapeHtml(packName)}</strong> by ${escapeHtml(creatorName)} has ended.</p>
<p>The pack stays unlocked until <strong>${when}</strong>. Renew your membership to keep it.</p>`,
    ),
  };
}

export function packPublishedEmail(
  brand: string,
  to: string,
  packName: string,
  packUrl: string,
): EmailMessage {
  return {
    to,
    subject: `Your pack "${packName}" is live`,
    text: `Your pack "${packName}" is published. Share it: ${packUrl}`,
    html: layout(
      brand,
      `<p>Your pack <strong>${escapeHtml(packName)}</strong> is live. Share your link:</p>
<p><a href="${packUrl}">${packUrl}</a></p>`,
    ),
  };
}

export function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
