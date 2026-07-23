export const metadata = { title: 'Privacy Policy' };

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto' }}>
      <h1>Privacy Policy</h1>
      <p className="badge warn">DRAFT — requires qualified legal review before launch</p>
      <p>
        The governing draft lives in the repository at <code>docs/legal/PRIVACY_POLICY.md</code>.
        Highlights: we store your email, connected-account identifiers, and entitlement records;
        provider tokens are encrypted at rest; typed keyboard input is never collected; analytics
        are an allowlist of anonymous product events; you can export your data or delete your
        account from settings.
      </p>
    </main>
  );
}
