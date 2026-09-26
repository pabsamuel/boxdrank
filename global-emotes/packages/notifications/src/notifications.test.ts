import { describe, expect, it } from 'vitest';
import { loadEnv } from '@global-emotes/config';
import {
  entitlementExpiringEmail,
  escapeHtml,
  magicLinkEmail,
  smtpTransportOptions,
} from './index';

describe('email templates', () => {
  it('renders magic link email with the link and expiry copy', () => {
    const msg = magicLinkEmail('Global Emotes', 'fan@demo.local', 'https://x/auth/verify?t=abc');
    expect(msg.to).toBe('fan@demo.local');
    expect(msg.html).toContain('https://x/auth/verify?t=abc');
    expect(msg.text).toContain('15 minutes');
  });

  it('escapes creator-controlled strings (stored XSS defense in email clients)', () => {
    const msg = entitlementExpiringEmail(
      'Global Emotes',
      'f@d.l',
      '<script>alert(1)</script>',
      'Evil "Creator"',
      new Date('2026-08-01T00:00:00Z'),
    );
    expect(msg.html).not.toContain('<script>');
    expect(msg.html).toContain('&lt;script&gt;');
    expect(msg.html).toContain('&quot;Creator&quot;');
  });

  it('escapeHtml covers the critical characters', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});

describe('smtp transport options', () => {
  const env = (overrides: Record<string, string>) => loadEnv(overrides as never);

  it('sends credentials when the relay needs them (hosted providers always do)', () => {
    const options = smtpTransportOptions(
      env({
        SMTP_HOST: 'smtp.resend.com',
        SMTP_PORT: '587',
        SMTP_USER: 'resend',
        SMTP_PASS: 're_key',
      }),
    );
    expect(options.auth).toEqual({ user: 'resend', pass: 're_key' });
    expect(options.host).toBe('smtp.resend.com');
  });

  it('omits auth for an unauthenticated local relay', () => {
    expect(
      smtpTransportOptions(env({ SMTP_HOST: 'localhost', SMTP_PORT: '1025' })).auth,
    ).toBeUndefined();
  });

  it('infers implicit TLS on 465 and STARTTLS on 587', () => {
    expect(smtpTransportOptions(env({ SMTP_PORT: '465' })).secure).toBe(true);
    expect(smtpTransportOptions(env({ SMTP_PORT: '587' })).secure).toBe(false);
  });

  it('honours an explicit SMTP_SECURE, and does not read "false" as true', () => {
    expect(smtpTransportOptions(env({ SMTP_PORT: '2525', SMTP_SECURE: 'true' })).secure).toBe(true);
    expect(smtpTransportOptions(env({ SMTP_PORT: '465', SMTP_SECURE: 'false' })).secure).toBe(
      false,
    );
  });
});
