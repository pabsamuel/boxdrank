import { describe, expect, it } from 'vitest';
import { entitlementExpiringEmail, escapeHtml, magicLinkEmail } from './index';

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
