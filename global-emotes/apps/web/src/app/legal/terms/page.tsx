export const metadata = { title: 'Terms of Service' };

export default function TermsPage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto' }}>
      <h1>Terms of Service</h1>
      <p className="badge warn">DRAFT — requires qualified legal review before launch</p>
      <p>
        The governing draft lives in the repository at <code>docs/legal/TERMS_OF_SERVICE.md</code>{' '}
        and is versioned; your acceptance is recorded against a specific version. Highlights:
        creators only upload emotes they own or license; entitlements derive from verified
        memberships and end (after a grace period) when memberships end; abuse, impersonation, and
        infringing content are removed under the reporting process.
      </p>
    </main>
  );
}
